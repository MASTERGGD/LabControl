"""
services/auditoria.py -- Bitacora de auditoria del sistema.

Uso tipico en un router:
    from services.auditoria import registrar
    from fastapi import Request

    registrar(db, accion="CREAR_USUARIO", recurso="USUARIO",
              usuario=current_user, recurso_id=nuevo.id,
              detalle={"email": nuevo.email}, request=request)

La funcion nunca lanza excepciones — si el log falla, el flujo
principal no se interrumpe (el error queda en consola).
"""

from __future__ import annotations

import traceback
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from models.auditoria import AuditLog


# ---------------------------------------------------------------------------
# Constantes de acciones (usar estas en lugar de strings libres)
# ---------------------------------------------------------------------------

class Accion:
    # Auth
    LOGIN_OK        = "LOGIN_OK"
    LOGIN_FALLIDO   = "LOGIN_FALLIDO"
    LOGOUT          = "LOGOUT"

    # Usuarios
    CREAR_USUARIO   = "CREAR_USUARIO"
    EDITAR_USUARIO  = "EDITAR_USUARIO"
    ELIMINAR_USUARIO = "ELIMINAR_USUARIO"
    IMPORTAR_USUARIOS = "IMPORTAR_USUARIOS"
    CAMBIAR_PASSWORD = "CAMBIAR_PASSWORD"

    # Laboratorios
    CREAR_LAB       = "CREAR_LAB"
    EDITAR_LAB      = "EDITAR_LAB"
    ELIMINAR_LAB    = "ELIMINAR_LAB"
    AGREGAR_PC      = "AGREGAR_PC"
    EDITAR_PC       = "EDITAR_PC"
    CARGA_MASIVA_PC = "CARGA_MASIVA_PC"

    # Sesiones
    ABRIR_SESION    = "ABRIR_SESION"
    CERRAR_SESION   = "CERRAR_SESION"
    ASIGNAR_PC      = "ASIGNAR_PC"

    # Inventario / Activos
    CREAR_ACTIVO    = "CREAR_ACTIVO"
    EDITAR_ACTIVO   = "EDITAR_ACTIVO"
    ELIMINAR_ACTIVO = "ELIMINAR_ACTIVO"
    IMPORTAR_ACTIVOS = "IMPORTAR_ACTIVOS"
    EXPORTAR_INVENTARIO = "EXPORTAR_INVENTARIO"

    # Prestamos
    CREAR_PRESTAMO  = "CREAR_PRESTAMO"
    DEVOLVER_PRESTAMO = "DEVOLVER_PRESTAMO"

    # Horarios
    CREAR_HORARIO   = "CREAR_HORARIO"
    ELIMINAR_HORARIO = "ELIMINAR_HORARIO"

    # Catalogo
    IMPORTAR_ALUMNOS  = "IMPORTAR_ALUMNOS"
    IMPORTAR_MATERIAS = "IMPORTAR_MATERIAS"

    # Mantenimiento
    CREAR_MANTENIMIENTO  = "CREAR_MANTENIMIENTO"
    CERRAR_MANTENIMIENTO = "CERRAR_MANTENIMIENTO"
    VINCULAR_EQUIPO_INCIDENTE = "VINCULAR_EQUIPO_INCIDENTE"
    AGREGAR_SEGUIMIENTO_INCIDENTE = "AGREGAR_SEGUIMIENTO_INCIDENTE"
    REABRIR_INCIDENTE = "REABRIR_INCIDENTE"
    LIBERAR_PC           = "LIBERAR_PC"
    CREAR_ADEUDO         = "CREAR_ADEUDO"
    RESOLVER_ADEUDO      = "RESOLVER_ADEUDO"
    MARCAR_RESERVACION   = "MARCAR_RESERVACION"

    # Servicios Escolares
    ACTIVAR_ACCESO_ALUMNO   = "ACTIVAR_ACCESO_ALUMNO"
    RESET_PASSWORD_ALUMNO   = "RESET_PASSWORD_ALUMNO"
    ACTIVAR_FICHA           = "ACTIVAR_FICHA"
    DESACTIVAR_FICHA        = "DESACTIVAR_FICHA"

    # Tutoría
    REGISTRAR_SESION_TUTORIA   = "REGISTRAR_SESION_TUTORIA"
    CREAR_CANALIZACION         = "CREAR_CANALIZACION"
    ACTUALIZAR_ESTADO_TUTORIA  = "ACTUALIZAR_ESTADO_TUTORIA"
    ENVIAR_INFORME_TUTORIA     = "ENVIAR_INFORME_TUTORIA"

    # Departamentos
    CREAR_DEPARTAMENTO      = "CREAR_DEPARTAMENTO"
    EDITAR_DEPARTAMENTO     = "EDITAR_DEPARTAMENTO"
    DESACTIVAR_DEPARTAMENTO = "DESACTIVAR_DEPARTAMENTO"

    # Reportes
    EXPORTAR_REPORTE_EXCEL  = "EXPORTAR_REPORTE_EXCEL"
    EXPORTAR_REPORTE_PDF    = "EXPORTAR_REPORTE_PDF"

    # Continuidad operativa
    GENERAR_RESPALDO   = "GENERAR_RESPALDO"
    VERIFICAR_RESPALDO = "VERIFICAR_RESPALDO"
    DESCARGAR_RESPALDO = "DESCARGAR_RESPALDO"
    ELIMINAR_RESPALDO  = "ELIMINAR_RESPALDO"
    ARCHIVAR_AUDITORIA = "ARCHIVAR_AUDITORIA"


class Recurso:
    USUARIO       = "USUARIO"
    LABORATORIO   = "LABORATORIO"
    COMPUTADORA   = "COMPUTADORA"
    SESION        = "SESION"
    ACTIVO        = "ACTIVO"
    PRESTAMO      = "PRESTAMO"
    HORARIO       = "HORARIO"
    ALUMNO        = "ALUMNO"
    MATERIA       = "MATERIA"
    MANTENIMIENTO = "MANTENIMIENTO"
    ADEUDO        = "ADEUDO"
    INCIDENTE     = "INCIDENTE"
    RESERVACION   = "RESERVACION"
    SISTEMA       = "SISTEMA"
    DEPARTAMENTO  = "DEPARTAMENTO"
    TUTORIA       = "TUTORIA"
    REPORTE       = "REPORTE"


# ---------------------------------------------------------------------------
# Funcion principal
# ---------------------------------------------------------------------------

def registrar(
    db: Session,
    accion: str,
    recurso: str,
    usuario=None,
    recurso_id: Optional[int] = None,
    detalle: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
    exito: bool = True,
) -> None:
    """
    Guarda un registro de auditoria. Nunca propaga excepciones.

    Params:
        db         -- sesion de base de datos
        accion     -- codigo de la accion (usar constantes Accion.*)
        recurso    -- tipo de recurso afectado (usar constantes Recurso.*)
        usuario    -- objeto Usuario del actor (puede ser None para acciones anonimas)
        recurso_id -- ID del registro afectado
        detalle    -- dict con informacion adicional (campos cambiados, conteos, etc.)
        request    -- objeto Request de FastAPI (para extraer IP y User-Agent)
        exito      -- False si la accion fue un intento fallido
    """
    try:
        ip = None
        ua = None

        if request is not None:
            # Respetar X-Forwarded-For si viene detras de un proxy/Railway
            forwarded = request.headers.get("x-forwarded-for")
            ip = forwarded.split(",")[0].strip() if forwarded else (
                request.client.host if request.client else None
            )
            ua = request.headers.get("user-agent")

        nombre = None
        email  = None
        uid    = None
        if usuario is not None:
            uid    = getattr(usuario, "id",     None)
            email  = getattr(usuario, "email",  None)
            nombre = getattr(usuario, "nombre", None)

        log = AuditLog(
            usuario_id     = uid,
            usuario_nombre = nombre,
            usuario_email  = email,
            accion         = accion,
            recurso        = recurso,
            recurso_id     = recurso_id,
            detalle        = detalle,
            exito          = exito,
            ip_address     = ip,
            user_agent     = ua,
        )
        db.add(log)
        db.commit()

    except Exception:
        # El log no debe romper el flujo principal
        try:
            db.rollback()
        except Exception:
            pass
        traceback.print_exc()
