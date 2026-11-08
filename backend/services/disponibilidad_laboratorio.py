import datetime as dt
from fastapi import HTTPException
from models.horario import BloqueoLaboratorio
from models.laboratorio import Laboratorio
from models.usuario import RolUsuario


def laboratorio_gestion(db, laboratorio_id, user):
    if user.rol not in {RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB}:
        raise HTTPException(403, 'Esta acción corresponde al modo responsable del laboratorio.')
    if user.rol != RolUsuario.SUPER_ADMIN and user.laboratorio_id != laboratorio_id:
        raise HTTPException(403, 'Solo puedes administrar tu laboratorio asignado.')
    lab = db.query(Laboratorio).filter(Laboratorio.id == laboratorio_id).with_for_update().first()
    if not lab: raise HTTPException(404, 'Laboratorio no encontrado.')
    return lab


def bloqueo_en(db, laboratorio_id, fecha, inicio, fin):
    return db.query(BloqueoLaboratorio).filter(BloqueoLaboratorio.laboratorio_id == laboratorio_id,
        BloqueoLaboratorio.activo == True, BloqueoLaboratorio.desde <= fecha, BloqueoLaboratorio.hasta >= fecha,
        BloqueoLaboratorio.hora_inicio < fin, BloqueoLaboratorio.hora_fin > inicio).first()


def validar_disponibilidad(db, laboratorio_id, fecha, inicio, fin):
    b = bloqueo_en(db, laboratorio_id, fecha, inicio, fin)
    if b: raise HTTPException(409, f'El laboratorio no está disponible: {b.motivo} ({b.desde} a {b.hasta}, {b.hora_inicio}–{b.hora_fin}).')


def bloqueo_recurrente(db, laboratorio_id, dia, inicio, fin):
    from services.timezone import now_mx
    for b in db.query(BloqueoLaboratorio).filter(BloqueoLaboratorio.laboratorio_id == laboratorio_id,
        BloqueoLaboratorio.activo == True, BloqueoLaboratorio.hasta >= now_mx().date(), BloqueoLaboratorio.hora_inicio < fin,
        BloqueoLaboratorio.hora_fin > inicio).all():
        primera = b.desde + dt.timedelta(days=(dia-b.desde.weekday()) % 7)
        if primera <= b.hasta: return b
    return None
