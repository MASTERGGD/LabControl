"""
Row-Level Security (RLS) — LabControl UTECAN
=============================================
Implementación a nivel de aplicación (SQLite no soporta RLS nativo).

Reglas:
  SUPER_ADMIN → acceso irrestricto a todos los recursos
  LAB_ADMIN   → solo puede leer y escribir en su laboratorio_id asignado
  DOCENTE     → solo puede acceder a sus propios recursos (sesiones, reservaciones)

Uso en routers:
  from rls import lab_filter, assert_lab_write, assert_resource_access, assert_docente_owns
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Query

from models.usuario import Usuario, RolUsuario

# ── Excepciones reutilizables ───────────────────────────────────────────────

def _403(detail: str = "No tienes permiso para acceder a este recurso") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

def _404(detail: str = "Recurso no encontrado") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


# ── Filtros de lectura (GET lists) ──────────────────────────────────────────

def lab_filter(query: Query, model, current_user: Usuario) -> Query:
    """
    Aplica filtro de laboratorio a cualquier query con columna .laboratorio_id.

    - SUPER_ADMIN: sin filtro, ve todo.
    - LAB_ADMIN:   filtra automáticamente por su laboratorio_id.
    - DOCENTE:     sin filtro de lab (usa owner_filter para sus propios recursos).

    Ejemplo:
        q = db.query(Activo)
        q = lab_filter(q, Activo, current_user)
    """
    if current_user.rol == RolUsuario.LAB_ADMIN:
        query = query.filter(model.laboratorio_id == current_user.laboratorio_id)
    return query


def owner_filter(query: Query, model, current_user: Usuario,
                 owner_col: str = "docente_id") -> Query:
    """
    Aplica filtro de propietario a recursos del DOCENTE.

    - SUPER_ADMIN + LAB_ADMIN: sin filtro.
    - DOCENTE: solo ve recursos donde owner_col == current_user.id.

    Ejemplo:
        q = db.query(Reservacion)
        q = owner_filter(q, Reservacion, current_user, "docente_id")
    """
    if current_user.rol == RolUsuario.DOCENTE:
        query = query.filter(getattr(model, owner_col) == current_user.id)
    return query


def usuario_lab_filter(query: Query, model, current_user: Usuario) -> Query:
    """
    Filtro especial para el listado de usuarios.

    - SUPER_ADMIN: ve todos.
    - LAB_ADMIN:   ve solo los usuarios de su laboratorio + docentes sin lab asignado.
      (un LAB_ADMIN necesita poder ver los docentes que reservan en su lab)
    - DOCENTE:     solo se ve a sí mismo.
    """
    if current_user.rol == RolUsuario.LAB_ADMIN:
        from sqlalchemy import or_
        query = query.filter(
            or_(
                model.laboratorio_id == current_user.laboratorio_id,
                model.rol == RolUsuario.DOCENTE
            )
        )
    elif current_user.rol == RolUsuario.DOCENTE:
        query = query.filter(model.id == current_user.id)
    return query


# ── Validaciones de escritura (POST / PUT / DELETE) ─────────────────────────

def assert_lab_write(target_lab_id: int | None, current_user: Usuario,
                     detail: str = "Solo puedes gestionar recursos de tu laboratorio") -> None:
    """
    Valida que un LAB_ADMIN solo escriba en su propio laboratorio.

    Lanza HTTP 403 si LAB_ADMIN intenta escribir en otro lab.
    SUPER_ADMIN siempre permitido.

    Uso en POST/PUT/DELETE:
        assert_lab_write(data.laboratorio_id, current_user)
    """
    if current_user.rol == RolUsuario.LAB_ADMIN:
        if target_lab_id is None or target_lab_id != current_user.laboratorio_id:
            raise _403(detail)


def assert_resource_access(resource, current_user: Usuario,
                           lab_id_attr: str = "laboratorio_id") -> None:
    """
    Valida acceso de lectura a un recurso individual (GET by ID).

    - Si resource es None → 404.
    - SUPER_ADMIN → siempre permitido.
    - LAB_ADMIN → 404 si el recurso no pertenece a su lab
                  (404 en vez de 403 para evitar enumeración de IDs).
    - DOCENTE → sin restricción adicional (usa assert_docente_owns para ownership).

    Uso en GET /{id}:
        recurso = db.query(Activo).filter(Activo.id == activo_id).first()
        assert_resource_access(recurso, current_user)
    """
    if resource is None:
        raise _404()

    if current_user.rol == RolUsuario.LAB_ADMIN:
        lab_id = getattr(resource, lab_id_attr, None)
        if lab_id is not None and lab_id != current_user.laboratorio_id:
            raise _404()  # 404 para no revelar que el recurso existe


def assert_docente_owns(resource, current_user: Usuario,
                        owner_attr: str = "docente_id") -> None:
    """
    Valida que un DOCENTE solo pueda acceder/modificar recursos propios.

    SUPER_ADMIN y LAB_ADMIN pueden acceder a todo.
    DOCENTE recibe 403 si el recurso no le pertenece.

    Uso en sesiones, reservaciones propias:
        assert_docente_owns(sesion, current_user, "docente_id")
    """
    if current_user.rol == RolUsuario.DOCENTE:
        owner_id = getattr(resource, owner_attr, None)
        if owner_id != current_user.id:
            raise _403("Solo puedes acceder a tus propios recursos")


def assert_report_access(target_lab_id: int, current_user: Usuario) -> None:
    """
    Valida acceso a reportes de un laboratorio específico.

    - SUPER_ADMIN: puede ver reportes de cualquier lab.
    - LAB_ADMIN: solo puede ver reportes de su lab.
    - DOCENTE: sin acceso a reportes (debe bloquearse en el endpoint).

    Uso en GET /reportes/mensual:
        assert_report_access(laboratorio_id, current_user)
    """
    if current_user.rol == RolUsuario.LAB_ADMIN:
        if target_lab_id != current_user.laboratorio_id:
            raise _403("Solo puedes acceder a los reportes de tu laboratorio")
    elif current_user.rol == RolUsuario.DOCENTE:
        raise _403("Los docentes no tienen acceso a reportes")


# ── Utilidad: forzar lab_id para LAB_ADMIN ──────────────────────────────────

def resolve_lab_id(requested_lab_id: int | None, current_user: Usuario) -> int | None:
    """
    Resuelve el laboratorio_id efectivo según el rol.

    - SUPER_ADMIN: usa el que viene en el request (puede ser None para "todos").
    - LAB_ADMIN:   ignora el request y fuerza su propio laboratorio_id.
    - DOCENTE:     retorna None (sin filtro de lab).

    Uso en endpoints con query param ?laboratorio_id=X:
        lab_id = resolve_lab_id(laboratorio_id, current_user)
        if lab_id:
            q = q.filter(Model.laboratorio_id == lab_id)
    """
    if current_user.rol == RolUsuario.LAB_ADMIN:
        return current_user.laboratorio_id
    return requested_lab_id
