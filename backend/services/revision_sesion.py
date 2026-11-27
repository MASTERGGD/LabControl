import datetime

from sqlalchemy import or_

from models.cierre_academico import RevisionSesionVencida


def ahora_utc():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def registrar_evento(revision, estado, usuario, motivo):
    revision.estado = estado
    revision.historial = [*(revision.historial or []), {
        "estado": estado, "usuario_id": usuario.id, "autor": usuario.nombre,
        "motivo": motivo, "fecha": ahora_utc().isoformat() + "Z",
        "autorizada_desde": revision.autorizada_desde.isoformat() + "Z" if revision.autorizada_desde else None,
        "autorizada_hasta": revision.autorizada_hasta.isoformat() + "Z" if revision.autorizada_hasta else None,
    }]


def autorizaciones_vigentes(db):
    ahora = ahora_utc()
    return db.query(RevisionSesionVencida).filter(
        RevisionSesionVencida.estado == "AUTORIZADA",
        RevisionSesionVencida.autorizada_hasta >= ahora,
        or_(RevisionSesionVencida.autorizada_desde.is_(None), RevisionSesionVencida.autorizada_desde <= ahora),
        RevisionSesionVencida.clase_id.is_(None),
    )


def vincular_captura_autorizada(db, clase, usuario):
    revision = db.query(RevisionSesionVencida).filter_by(
        carga_id=clase.carga_docente_id, fecha=clase.fecha, docente_id=usuario.id, estado="AUTORIZADA",
    ).first()
    if revision:
        revision.clase_id = clase.id
        registrar_evento(revision, "CAPTURA_INICIADA", usuario, "Se inició la captura autorizada")
