from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select, text, update
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_roles
from models.aviso_inicio import AvisoInicio, HistorialAvisoInicio
from models.usuario import RolUsuario, Usuario

router = APIRouter(prefix="/aviso-inicio", tags=["Aviso de inicio docente"])
MX = ZoneInfo("America/Mexico_City")
ADMIN = Depends(require_roles(RolUsuario.SUPER_ADMIN))
POR_PAGINA = 10
CONFLICTO = "El aviso cambió. Actualiza la página antes de continuar."


class AvisoIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    titulo: str = Field(min_length=1, max_length=100)
    mensaje: str = Field(min_length=1, max_length=400)
    destino: Literal["seguimiento", "horario", "historial"] | None = None
    audiencia: Literal["DOCENTES", "TODOS"] = "DOCENTES"
    vigente_hasta: date = Field(lt=date.max)
    revision_edicion: UUID | None = None
    revision_actual: UUID | None = None


def _hoy():
    return datetime.now(MX).date()


def _serializar(aviso):
    return {
        "revision": aviso.revision,
        "titulo": aviso.titulo,
        "mensaje": aviso.mensaje,
        "destino": aviso.destino,
        "audiencia": aviso.audiencia,
        "vigente_hasta": aviso.vigente_hasta,
        "expira_en": datetime.combine(aviso.vigente_hasta + timedelta(days=1), time.min, MX),
        "activo": aviso.vigente_hasta >= _hoy(),
    }


def _campos(data):
    return {campo: getattr(data, campo) for campo in ("titulo", "mensaje", "destino", "audiencia", "vigente_hasta")}


def _cerrar_revision(db, aviso, estado):
    entrada = db.get(HistorialAvisoInicio, aviso.revision)
    if not entrada:
        entrada = HistorialAvisoInicio(revision=aviso.revision, aviso_id=aviso.revision, version=1, **_campos(aviso))
        db.add(entrada)
    if aviso.vigente_hasta >= _hoy():
        entrada.estado_final = estado
        entrada.cerrado_en = datetime.now(timezone.utc)
    return entrada


def _con_zona(fecha):
    return fecha.replace(tzinfo=timezone.utc) if fecha and fecha.tzinfo is None else fecha


def _version_historial(aviso):
    return {
        **_campos(aviso),
        "revision": aviso.revision,
        "version": aviso.version,
        "publicado_en": _con_zona(aviso.publicado_en),
        "publicado_por": aviso.publicado_por,
        "cerrado_en": _con_zona(aviso.cerrado_en),
        "estado": aviso.estado_final or ("ACTIVO" if aviso.vigente_hasta >= _hoy() else "VENCIDO"),
    }


@router.get("/activo")
def activo(response: Response, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    aviso = db.get(AvisoInicio, 1)
    es_docente = usuario.rol == RolUsuario.DOCENTE
    if not aviso or aviso.vigente_hasta < _hoy() or (aviso.audiencia != "TODOS" and not es_docente):
        return None
    data = _serializar(aviso)
    if not es_docente:
        data["destino"] = None
    return data


@router.get("/admin", dependencies=[ADMIN])
def consultar(db: Session = Depends(get_db)):
    aviso = db.get(AvisoInicio, 1)
    return _serializar(aviso) if aviso else None


@router.get("/admin/historial", dependencies=[ADMIN])
def historial(response: Response, pagina: int = Query(1, ge=1, le=10000), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    primeras = db.scalars(select(HistorialAvisoInicio.aviso_id)
        .where(HistorialAvisoInicio.version == 1)
        .order_by(HistorialAvisoInicio.publicado_en.desc().nulls_last(), HistorialAvisoInicio.aviso_id)
        .offset((pagina - 1) * POR_PAGINA).limit(POR_PAGINA + 1)).all()
    grupos = {aviso_id: [] for aviso_id in primeras[:POR_PAGINA]}
    if grupos:
        versiones = db.scalars(select(HistorialAvisoInicio)
            .where(HistorialAvisoInicio.aviso_id.in_(grupos))
            .order_by(HistorialAvisoInicio.version.desc())).all()
        for version in versiones:
            grupos[version.aviso_id].append(_version_historial(version))
    return {
        "avisos": [{"id": aviso_id, "versiones": versiones} for aviso_id, versiones in grupos.items()],
        "hay_mas": len(primeras) > POR_PAGINA,
    }


@router.put("/admin")
def publicar(data: AvisoIn, db: Session = Depends(get_db), usuario: Usuario = ADMIN):
    if data.vigente_hasta < _hoy():
        raise HTTPException(422, "La fecha de vigencia debe ser hoy o posterior.")
    actual = db.get(AvisoInicio, 1)
    revision_actual = actual.revision if actual else None
    revision_esperada = str(data.revision_actual) if data.revision_actual else None
    if "revision_actual" in data.model_fields_set and revision_actual != revision_esperada:
        raise HTTPException(409, CONFLICTO)
    if data.revision_edicion and (not actual or actual.revision != str(data.revision_edicion) or actual.vigente_hasta < _hoy()):
        raise HTTPException(409, CONFLICTO)
    revision = str(uuid4())
    campos = _campos(data)
    aviso_id, version = revision, 1
    if actual:
        anterior = _cerrar_revision(db, actual, "VERSION_ANTERIOR" if data.revision_edicion else "REEMPLAZADO")
        if data.revision_edicion:
            aviso_id, version = anterior.aviso_id, anterior.version + 1
        resultado = db.execute(update(AvisoInicio)
            .where(AvisoInicio.id == 1, AvisoInicio.revision == actual.revision)
            .values(revision=revision, **campos))
    else:
        resultado = db.execute(text("""
            INSERT INTO aviso_inicio_docente (id, revision, titulo, mensaje, destino, vigente_hasta, audiencia)
            VALUES (1, :revision, :titulo, :mensaje, :destino, :vigente_hasta, :audiencia)
            ON CONFLICT (id) DO NOTHING
        """), {"revision": revision, **campos})
    if resultado.rowcount != 1:
        raise HTTPException(409, CONFLICTO)
    db.add(HistorialAvisoInicio(revision=revision, aviso_id=aviso_id, version=version,
        publicado_en=datetime.now(timezone.utc), publicado_por=usuario.nombre, **campos))
    db.commit()
    return _serializar(HistorialAvisoInicio(revision=revision, **campos))


@router.delete("/admin/{revision}", status_code=204, dependencies=[ADMIN])
def retirar(revision: UUID, db: Session = Depends(get_db)):
    actual = db.get(AvisoInicio, 1)
    if not actual or actual.revision != str(revision):
        raise HTTPException(409, CONFLICTO)
    _cerrar_revision(db, actual, "RETIRADO")
    resultado = db.execute(delete(AvisoInicio).where(AvisoInicio.id == 1, AvisoInicio.revision == str(revision)))
    if resultado.rowcount != 1:
        raise HTTPException(409, CONFLICTO)
    db.commit()
