"""Shared HTTP/WebSocket policy for laboratory sessions."""
from fastapi import HTTPException
from models.usuario import RolUsuario
from models.sesion import SesionClase

LAB_ROLES = {RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB, RolUsuario.DOCENTE}


def require_lab_role(user):
    if user.rol not in LAB_ROLES:
        raise HTTPException(403, "Sin permiso para gestionar sesiones de laboratorio")


def authorize_session(session, user):
    require_lab_role(user)
    if session is None:
        raise HTTPException(404, "Sesión no encontrada")
    if user.rol == RolUsuario.DOCENTE and session.docente_id != user.id:
        raise HTTPException(403, "No tienes acceso a esta sesión")
    if user.rol in {RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB} and (
        not user.laboratorio_id or session.laboratorio_id != user.laboratorio_id
    ):
        raise HTTPException(403, "No tienes acceso a este laboratorio")
    return session


def get_authorized_session(db, session_id, user):
    require_lab_role(user)
    return authorize_session(db.get(SesionClase, session_id), user)


def scope_sessions(query, user):
    require_lab_role(user)
    if user.rol == RolUsuario.DOCENTE:
        return query.filter(SesionClase.docente_id == user.id)
    if user.rol in {RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB}:
        if not user.laboratorio_id:
            raise HTTPException(403, "No tienes laboratorio asignado")
        return query.filter(SesionClase.laboratorio_id == user.laboratorio_id)
    return query
