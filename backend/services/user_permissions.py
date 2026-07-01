from __future__ import annotations

import unicodedata

from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError, ProgrammingError

from models.departamento import Departamento
from models.usuario import RolUsuario, Usuario
from models.usuario_permiso import UsuarioPermiso

PERM_COMUNICADOS_WRITE = "comunicados:write"
PERM_INVENTARIO_WRITE = "inventario:write"
PERM_INVENTARIO_VALIDATE = "inventario:validar"
PERM_SERVICIOS_ESCOLARES_MANAGE = "servicios_escolares:manage"


def _normalizar_catalogo(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", str(value))
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return " ".join(normalized.upper().replace("_", " ").replace("-", " ").split())


def es_departamento_servicios_escolares(departamento: Departamento | None) -> bool:
    if not departamento:
        return False
    clave = _normalizar_catalogo(getattr(departamento, "clave", "")).replace(" ", "")
    nombre = _normalizar_catalogo(getattr(departamento, "nombre", ""))
    return clave in {"SE", "DSE", "DPSE", "SERVICIOSESCOLARES"} or "SERVICIOS ESCOLARES" in nombre


def es_responsable_departamento(db: Session, usuario: Usuario, departamento_id: int | None) -> bool:
    if not departamento_id:
        return False
    return db.query(Departamento.id).filter(
        Departamento.id == departamento_id,
        Departamento.responsable_id == usuario.id,
        Departamento.activo == True,
    ).first() is not None


def tiene_permiso_departamento(
    db: Session,
    usuario: Usuario,
    permiso: str,
    departamento_id: int | None,
) -> bool:
    query = db.query(UsuarioPermiso.id).filter(
        UsuarioPermiso.usuario_id == usuario.id,
        UsuarioPermiso.permiso == permiso,
        UsuarioPermiso.activo == True,
    )
    if departamento_id is None:
        query = query.filter(UsuarioPermiso.departamento_id.is_(None))
    else:
        query = query.filter(UsuarioPermiso.departamento_id == departamento_id)
    return query.first() is not None


def departamentos_con_permiso(db: Session, usuario: Usuario, permiso: str) -> list[int]:
    try:
        ids = {
            row[0]
            for row in db.query(UsuarioPermiso.departamento_id).filter(
                UsuarioPermiso.usuario_id == usuario.id,
                UsuarioPermiso.permiso == permiso,
                UsuarioPermiso.activo == True,
                UsuarioPermiso.departamento_id.isnot(None),
            ).all()
        }
    except (OperationalError, ProgrammingError):
        db.rollback()
        ids = set()
    ids.update(
        row[0]
        for row in db.query(Departamento.id).filter(
            Departamento.responsable_id == usuario.id,
            Departamento.activo == True,
        ).all()
    )
    return sorted(ids)


def puede_emitir_comunicados(
    db: Session,
    usuario: Usuario,
    departamento_id: int | None = None,
) -> bool:
    if usuario.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN):
        return True
    if usuario.rol == RolUsuario.TUTORIA_ADMIN and departamento_id is None:
        return True
    if departamento_id is None:
        departamento_id = usuario.departamento_id
    if es_responsable_departamento(db, usuario, departamento_id):
        return True
    return tiene_permiso_departamento(db, usuario, PERM_COMUNICADOS_WRITE, departamento_id)


def departamentos_inventario(db: Session, usuario: Usuario) -> list[int]:
    return departamentos_con_permiso(db, usuario, PERM_INVENTARIO_WRITE)


def departamentos_validacion_inventario(db: Session, usuario: Usuario) -> list[int]:
    return departamentos_con_permiso(db, usuario, PERM_INVENTARIO_VALIDATE)


def departamentos_servicios_escolares(db: Session, usuario: Usuario) -> list[int]:
    if not usuario:
        return []
    try:
        departamentos = db.query(Departamento).filter(Departamento.activo == True).all()
    except (OperationalError, ProgrammingError):
        db.rollback()
        return []

    servicios_ids = {
        dep.id
        for dep in departamentos
        if es_departamento_servicios_escolares(dep)
    }
    if not servicios_ids:
        return []
    if usuario.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.SERVICIOS_ESCOLARES):
        return sorted(servicios_ids)

    ids = {
        dep.id
        for dep in departamentos
        if dep.id in servicios_ids and dep.responsable_id == usuario.id
    }
    try:
        rows = db.query(UsuarioPermiso.departamento_id).filter(
            UsuarioPermiso.usuario_id == usuario.id,
            UsuarioPermiso.permiso == PERM_SERVICIOS_ESCOLARES_MANAGE,
            UsuarioPermiso.activo == True,
            UsuarioPermiso.departamento_id.in_(servicios_ids),
        ).all()
        ids.update(row[0] for row in rows if row[0] is not None)
    except (OperationalError, ProgrammingError):
        db.rollback()
    return sorted(ids)


def puede_gestionar_servicios_escolares(db: Session, usuario: Usuario) -> bool:
    if not usuario:
        return False
    if usuario.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.SERVICIOS_ESCOLARES):
        return True
    if tiene_permiso_departamento(db, usuario, PERM_SERVICIOS_ESCOLARES_MANAGE, None):
        return True
    return bool(departamentos_servicios_escolares(db, usuario))


def tiene_permiso_en_alguna_area(db: Session, usuario: Usuario, permiso: str) -> bool:
    try:
        return db.query(UsuarioPermiso.id).filter(
            UsuarioPermiso.usuario_id == usuario.id,
            UsuarioPermiso.permiso == permiso,
            UsuarioPermiso.activo == True,
        ).first() is not None
    except (OperationalError, ProgrammingError):
        db.rollback()
        return False


def puede_validar_inventario(db: Session, usuario: Usuario) -> bool:
    if usuario.rol == RolUsuario.SUPER_ADMIN:
        return True
    if departamentos_validacion_inventario(db, usuario):
        return True
    return tiene_permiso_en_alguna_area(db, usuario, PERM_INVENTARIO_VALIDATE)


def puede_validar_inventario_global(db: Session, usuario: Usuario) -> bool:
    if usuario.rol == RolUsuario.SUPER_ADMIN:
        return True
    return tiene_permiso_departamento(db, usuario, PERM_INVENTARIO_VALIDATE, None)


def puede_gestionar_inventario(
    db: Session,
    usuario: Usuario,
    departamento_id: int | None = None,
) -> bool:
    if usuario.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB):
        return True
    if departamento_id is None:
        departamento_id = usuario.departamento_id
    if es_responsable_departamento(db, usuario, departamento_id):
        return True
    return tiene_permiso_departamento(db, usuario, PERM_INVENTARIO_WRITE, departamento_id)


def permisos_efectivos(db: Session, usuario: Usuario) -> list[str]:
    permisos = set()
    if usuario.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.TUTORIA_ADMIN):
        permisos.add(PERM_COMUNICADOS_WRITE)
    if usuario.rol == RolUsuario.SUPER_ADMIN:
        permisos.add(PERM_INVENTARIO_VALIDATE)
    if usuario.rol == RolUsuario.RESPONSABLE_LAB:
        permisos.add(PERM_INVENTARIO_WRITE)
    if departamentos_con_permiso(db, usuario, PERM_COMUNICADOS_WRITE):
        permisos.add(PERM_COMUNICADOS_WRITE)
    if departamentos_con_permiso(db, usuario, PERM_INVENTARIO_WRITE):
        permisos.add(PERM_INVENTARIO_WRITE)
    if puede_validar_inventario(db, usuario):
        permisos.add(PERM_INVENTARIO_VALIDATE)
    if puede_gestionar_servicios_escolares(db, usuario):
        permisos.add(PERM_SERVICIOS_ESCOLARES_MANAGE)
    return sorted(permisos)
