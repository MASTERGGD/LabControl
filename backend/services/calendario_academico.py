import datetime

from sqlalchemy.orm import Session

from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico


def estado_fecha_academica(db: Session, periodo_id: int | None, fecha: datetime.date) -> dict:
    """Resuelve si una fecha programada exige asistencia.

    Sin calendario publicado se conserva el comportamiento histórico. Cuando hay
    eventos superpuestos, cualquier suspensión prevalece; una reposición explícita
    que requiere asistencia prevalece únicamente si no hay suspensión.
    """
    base = {
        "es_lectiva": True,
        "requiere_asistencia": True,
        "permite_iniciar_clase": True,
        "genera_alertas": True,
        "motivo": None,
        "tipo": None,
        "evento_id": None,
        "calendario_publicado": False,
    }
    if not periodo_id:
        return base
    calendario = db.query(CalendarioAcademico).filter(
        CalendarioAcademico.periodo_id == periodo_id,
        (CalendarioAcademico.estado == "PUBLICADO") | ((CalendarioAcademico.estado == "CERRADO") & CalendarioAcademico.publicado_en.isnot(None)),
    ).first()
    if not calendario:
        return base
    base["calendario_publicado"] = True
    eventos = db.query(EventoCalendarioAcademico).filter(
        EventoCalendarioAcademico.calendario_id == calendario.id,
        EventoCalendarioAcademico.activo == True,
        EventoCalendarioAcademico.fecha_inicio <= fecha,
        EventoCalendarioAcademico.fecha_fin >= fecha,
    ).order_by(EventoCalendarioAcademico.id.desc()).all()
    if not eventos:
        return base
    restrictivos = [e for e in eventos if not e.requiere_asistencia or not e.permite_iniciar_clase]
    evento = restrictivos[0] if restrictivos else eventos[0]
    return {
        "es_lectiva": evento.requiere_asistencia,
        "requiere_asistencia": evento.requiere_asistencia,
        "permite_iniciar_clase": evento.permite_iniciar_clase,
        "genera_alertas": evento.genera_alertas,
        "motivo": evento.titulo,
        "tipo": evento.tipo,
        "evento_id": evento.id,
        "calendario_publicado": True,
    }
