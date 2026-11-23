from datetime import date, datetime, time, timedelta
from typing import Literal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_roles
from models.aviso_inicio import AvisoInicio
from models.usuario import RolUsuario, Usuario

router = APIRouter(prefix="/aviso-inicio", tags=["Aviso de inicio docente"])
MX = ZoneInfo("America/Mexico_City")
ADMIN = Depends(require_roles(RolUsuario.SUPER_ADMIN))


class AvisoIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    titulo: str = Field(min_length=1, max_length=100)
    mensaje: str = Field(min_length=1, max_length=400)
    destino: Literal["seguimiento", "horario", "historial"] | None = None
    audiencia: Literal["DOCENTES", "TODOS"] = "DOCENTES"
    vigente_hasta: date = Field(lt=date.max)


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


@router.put("/admin", dependencies=[ADMIN])
def publicar(data: AvisoIn, db: Session = Depends(get_db)):
    if data.vigente_hasta < _hoy():
        raise HTTPException(422, "La fecha de vigencia debe ser hoy o posterior.")
    revision = str(uuid4())
    # PostgreSQL y SQLite permiten sustituir el aviso vigente en una operación atómica.
    db.execute(text("""
        INSERT INTO aviso_inicio_docente (id, revision, titulo, mensaje, destino, vigente_hasta, audiencia)
        VALUES (1, :revision, :titulo, :mensaje, :destino, :vigente_hasta, :audiencia)
        ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, titulo = excluded.titulo,
          mensaje = excluded.mensaje, destino = excluded.destino, vigente_hasta = excluded.vigente_hasta,
          audiencia = excluded.audiencia
    """), {"revision": revision, **data.model_dump()})
    aviso = consultar(db)
    db.commit()
    return aviso


@router.delete("/admin/{revision}", status_code=204, dependencies=[ADMIN])
def retirar(revision: UUID, db: Session = Depends(get_db)):
    resultado = db.execute(delete(AvisoInicio).where(AvisoInicio.id == 1, AvisoInicio.revision == str(revision)))
    if resultado.rowcount != 1:
        raise HTTPException(409, "El aviso cambió. Actualiza la página antes de retirarlo.")
    db.commit()
