from sqlalchemy.orm import Session

from models.horario import Reservacion
from models.sesion import AsignacionPC, SesionClase


def cerrar_sesion_laboratorio(db: Session, sesion: SesionClase, ahora):
    """Marca una sesión de laboratorio como cerrada sin confirmar la transacción."""
    asignaciones = db.query(AsignacionPC).filter(
        AsignacionPC.sesion_id == sesion.id,
        AsignacionPC.hora_liberacion.is_(None),
    ).all()
    for asignacion in asignaciones:
        asignacion.hora_liberacion = ahora

    sesion.estado = "CERRADA"
    sesion.fin_real = ahora
    overtime_min = 0
    if sesion.fin_estimado and ahora > sesion.fin_estimado:
        overtime_min = int((ahora - sesion.fin_estimado).total_seconds() / 60)
    sesion.overtime_min = overtime_min

    if sesion.reservacion_id is not None:
        reservacion = db.query(Reservacion).filter(
            Reservacion.id == sesion.reservacion_id,
        ).first()
        if reservacion and reservacion.estado == "EN_CURSO":
            reservacion.estado = "PROGRAMADA"

    return asignaciones, overtime_min
