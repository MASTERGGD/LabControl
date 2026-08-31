import datetime
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.calendario_academico import (
    CalendarioAcademico, EventoCalendarioAcademico, HistorialCalendarioAcademico,
)
from models.catalogo import PeriodoEscolar
from models.docencia import CargaDocente
from models.cierre_academico import CierreAcademicoPeriodo
from models.usuario import RolUsuario, Usuario
from services.calendario_academico import estado_fecha_academica
from services.user_permissions import puede_gestionar_materias, puede_gestionar_servicios_escolares


router = APIRouter(prefix="/calendario-academico", tags=["Calendario académico"])
TIPOS_EVENTO = {
    "INICIO_CUATRIMESTRE", "FIN_CUATRIMESTRE", "FIN_ACTIVIDADES_ACADEMICAS",
    "RECESO_CLASES", "SUSPENSION_DOCENTE", "SUSPENSION_GENERAL",
    "EVALUACION", "INSCRIPCIONES", "ACTIVIDAD_INSTITUCIONAL", "REPOSICION", "OTRO",
}
ESTADOS = {"BORRADOR", "PUBLICADO", "CERRADO"}


def _limite_periodo(clave: str) -> Optional[datetime.date]:
    """Devuelve el último día académico para impedir contextos docentes futuros."""
    match = re.search(r"(ENE[- ]?ABR|MAY[- ]?AGO|SEP[- ]?DIC)\s*[- ]?\s*(\d{4})", (clave or "").upper())
    if not match:
        return None
    bloque = match.group(1).replace(" ", "-")
    anio = int(match.group(2))
    if bloque == "ENE-ABR":
        return datetime.date(anio, 4, 30)
    if bloque == "MAY-AGO":
        return datetime.date(anio, 8, 31)
    return datetime.date(anio, 12, 31)


class CalendarioIn(BaseModel):
    periodo_id: int
    observaciones: Optional[str] = Field(None, max_length=2000)


class EventoIn(BaseModel):
    titulo: str = Field(..., min_length=2, max_length=180)
    tipo: str = Field(..., max_length=40)
    fecha_inicio: datetime.date
    fecha_fin: datetime.date
    descripcion: Optional[str] = Field(None, max_length=2000)
    color: Optional[str] = Field(None, max_length=20)
    requiere_asistencia: bool = True
    permite_iniciar_clase: bool = True
    genera_alertas: bool = True
    motivo_cambio: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def validar(self):
        self.tipo = self.tipo.upper()
        if self.tipo not in TIPOS_EVENTO:
            raise ValueError("Tipo de evento no válido")
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final debe ser igual o posterior a la inicial")
        self.titulo = self.titulo.strip()
        return self


class EstadoIn(BaseModel):
    estado: str
    motivo: Optional[str] = Field(None, max_length=500)


def _puede_administrar(db: Session, usuario: Usuario) -> bool:
    return puede_gestionar_materias(db, usuario)


def _exigir_administracion(db: Session, usuario: Usuario):
    if not _puede_administrar(db, usuario):
        raise HTTPException(403, "Solo División de Carrera puede administrar el calendario académico")


def _evento_dict(evento: EventoCalendarioAcademico) -> dict:
    return {
        "id": evento.id, "titulo": evento.titulo, "tipo": evento.tipo,
        "fecha_inicio": evento.fecha_inicio.isoformat(), "fecha_fin": evento.fecha_fin.isoformat(),
        "descripcion": evento.descripcion, "color": evento.color,
        "requiere_asistencia": evento.requiere_asistencia,
        "permite_iniciar_clase": evento.permite_iniciar_clase,
        "genera_alertas": evento.genera_alertas, "activo": evento.activo,
        "actualizado_en": evento.actualizado_en.isoformat() if evento.actualizado_en else None,
    }


def _calendario_dict(calendario: CalendarioAcademico, puede_editar: bool = False) -> dict:
    return {
        "id": calendario.id,
        "periodo_id": calendario.periodo_id,
        "periodo": calendario.periodo.clave if calendario.periodo else None,
        "estado": calendario.estado,
        "version": calendario.version,
        "observaciones": calendario.observaciones,
        "puede_editar": puede_editar and calendario.estado != "CERRADO",
        "creado_por": calendario.creado_por.nombre if calendario.creado_por else None,
        "publicado_por": calendario.publicado_por.nombre if calendario.publicado_por else None,
        "publicado_en": calendario.publicado_en.isoformat() if calendario.publicado_en else None,
        "actualizado_en": calendario.actualizado_en.isoformat() if calendario.actualizado_en else None,
        "eventos": [_evento_dict(e) for e in calendario.eventos if e.activo],
    }


def _registrar_historial(db, calendario, usuario, accion, evento_id=None, anteriores=None, nuevos=None, motivo=None):
    db.add(HistorialCalendarioAcademico(
        calendario_id=calendario.id, evento_id=evento_id, accion=accion,
        motivo=motivo, datos_anteriores=anteriores, datos_nuevos=nuevos,
        usuario_id=usuario.id,
    ))


@router.get("/periodos")
def listar_periodos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    periodos = db.query(PeriodoEscolar).order_by(PeriodoEscolar.id.desc()).all()
    calendarios = {c.periodo_id: c for c in db.query(CalendarioAcademico).all()}
    cerrados = {c.periodo_id for c in db.query(CierreAcademicoPeriodo).filter_by(estado="CERRADO").all()}
    def estado_periodo(p):
        if p.id in cerrados:
            return "CERRADO"
        fin = _limite_periodo(p.clave)
        if fin and datetime.date(fin.year, fin.month - 3, 1) > datetime.date.today():
            return "PREPARACION"
        return "ACTUAL" if p.es_actual else "HISTORICO"
    puede_administrar = _puede_administrar(db, current_user)
    puede_preparar_periodos = puede_administrar or puede_gestionar_servicios_escolares(db, current_user)
    if current_user.rol == RolUsuario.DOCENTE:
        # Mostrar el próximo cuatrimestre en preparación no habilita su operación
        # ni expone calendarios en borrador. El historial sigue siendo personal.
        periodo_ids_docente = {
            periodo_id for (periodo_id,) in db.query(CargaDocente.periodo_id).filter(
                CargaDocente.docente_id == current_user.id,
            ).distinct().all()
        }
        hoy = datetime.date.today()
        siguiente_mes = ((hoy.month - 1) // 4 + 1) * 4 + 1
        siguiente_fin = (
            datetime.date(hoy.year + 1, 4, 30) if siguiente_mes > 12
            else datetime.date(hoy.year, siguiente_mes + 3, 31)
        )
        periodos = [
            p for p in periodos
            if p.es_actual or (p.activo and _limite_periodo(p.clave) == siguiente_fin
                               and estado_periodo(p) == "PREPARACION") or (
                p.id in periodo_ids_docente
                and (_limite_periodo(p.clave) is None or _limite_periodo(p.clave) < hoy)
            )
        ]
    elif not puede_preparar_periodos:
        # Un periodo futuro puede existir para que Servicios Escolares prepare
        # grupos y promociones, pero no forma parte todavía del contexto de
        # trabajo de docentes y demás usuarios. Los históricos publicados se
        # conservan disponibles para consulta.
        periodos = [
            p for p in periodos
            if p.es_actual or (
                p.id in calendarios
                and calendarios[p.id].estado in {"PUBLICADO", "CERRADO"}
            )
        ]
    periodos.sort(key=lambda p: (
        0 if p.es_actual else 1,
        -(_limite_periodo(p.clave) or datetime.date.min).toordinal(),
    ))
    return [{
        "id": p.id, "clave": p.clave, "activo": p.activo,
        "es_actual": estado_periodo(p) == "ACTUAL", "estado_periodo": estado_periodo(p),
        "puede_administrar": puede_administrar,
        "calendario_id": calendarios[p.id].id if p.id in calendarios and (puede_administrar or calendarios[p.id].estado == "PUBLICADO") else None,
        "estado_calendario": calendarios[p.id].estado if p.id in calendarios and (puede_administrar or calendarios[p.id].estado == "PUBLICADO") else None,
    } for p in periodos]


@router.get("")
def obtener_calendario(
    periodo_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(CalendarioAcademico)
    if periodo_id:
        query = query.filter(CalendarioAcademico.periodo_id == periodo_id)
    else:
        query = query.join(PeriodoEscolar).filter(PeriodoEscolar.es_actual == True)
    puede_administrar = _puede_administrar(db, current_user)
    if not puede_administrar:
        query = query.filter(CalendarioAcademico.estado == "PUBLICADO")
    calendario = query.first()
    if not calendario:
        return None
    return _calendario_dict(calendario, puede_administrar)


@router.post("")
def crear_calendario(
    data: CalendarioIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _exigir_administracion(db, current_user)
    periodo = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == data.periodo_id).first()
    if not periodo:
        raise HTTPException(404, "Periodo escolar no encontrado")
    if db.query(CalendarioAcademico.id).filter(CalendarioAcademico.periodo_id == periodo.id).first():
        raise HTTPException(409, "Este periodo ya tiene calendario académico")
    calendario = CalendarioAcademico(
        periodo_id=periodo.id, observaciones=data.observaciones,
        creado_por_id=current_user.id, estado="BORRADOR",
    )
    db.add(calendario)
    db.flush()
    _registrar_historial(db, calendario, current_user, "CREAR_CALENDARIO", nuevos={"periodo": periodo.clave})
    db.commit()
    db.refresh(calendario)
    return _calendario_dict(calendario, True)


@router.post("/{calendario_id}/eventos")
def crear_evento(
    calendario_id: int, data: EventoIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _exigir_administracion(db, current_user)
    calendario = db.query(CalendarioAcademico).filter(CalendarioAcademico.id == calendario_id).first()
    if not calendario:
        raise HTTPException(404, "Calendario no encontrado")
    if calendario.estado == "CERRADO":
        raise HTTPException(409, "El calendario está cerrado")
    evento = EventoCalendarioAcademico(
        calendario_id=calendario.id, creado_por_id=current_user.id,
        **data.model_dump(exclude={"motivo_cambio"}),
    )
    db.add(evento)
    db.flush()
    calendario.version += 1
    _registrar_historial(db, calendario, current_user, "CREAR_EVENTO", evento.id, nuevos=_evento_dict(evento), motivo=data.motivo_cambio)
    db.commit()
    return _evento_dict(evento)


@router.put("/{calendario_id}/eventos/{evento_id}")
def editar_evento(
    calendario_id: int, evento_id: int, data: EventoIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _exigir_administracion(db, current_user)
    calendario = db.query(CalendarioAcademico).filter(CalendarioAcademico.id == calendario_id).first()
    evento = db.query(EventoCalendarioAcademico).filter(
        EventoCalendarioAcademico.id == evento_id,
        EventoCalendarioAcademico.calendario_id == calendario_id,
        EventoCalendarioAcademico.activo == True,
    ).first()
    if not calendario or not evento:
        raise HTTPException(404, "Evento no encontrado")
    if calendario.estado == "CERRADO":
        raise HTTPException(409, "El calendario está cerrado")
    if calendario.estado == "PUBLICADO" and len((data.motivo_cambio or "").strip()) < 5:
        raise HTTPException(422, "Indica el motivo de la modificación del calendario publicado")
    anteriores = _evento_dict(evento)
    for campo, valor in data.model_dump(exclude={"motivo_cambio"}).items():
        setattr(evento, campo, valor)
    evento.actualizado_por_id = current_user.id
    calendario.version += 1
    _registrar_historial(db, calendario, current_user, "EDITAR_EVENTO", evento.id, anteriores, _evento_dict(evento), data.motivo_cambio)
    db.commit()
    return _evento_dict(evento)


@router.delete("/{calendario_id}/eventos/{evento_id}")
def cancelar_evento(
    calendario_id: int, evento_id: int, motivo: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _exigir_administracion(db, current_user)
    calendario = db.query(CalendarioAcademico).filter(CalendarioAcademico.id == calendario_id).first()
    evento = db.query(EventoCalendarioAcademico).filter(
        EventoCalendarioAcademico.id == evento_id,
        EventoCalendarioAcademico.calendario_id == calendario_id,
        EventoCalendarioAcademico.activo == True,
    ).first()
    if not calendario or not evento:
        raise HTTPException(404, "Evento no encontrado")
    if calendario.estado == "CERRADO":
        raise HTTPException(409, "El calendario está cerrado")
    if len(motivo.strip()) < 5:
        raise HTTPException(422, "Indica el motivo de la cancelación")
    anteriores = _evento_dict(evento)
    evento.activo = False
    evento.actualizado_por_id = current_user.id
    calendario.version += 1
    _registrar_historial(db, calendario, current_user, "CANCELAR_EVENTO", evento.id, anteriores, {"activo": False}, motivo)
    db.commit()
    return {"ok": True, "mensaje": "Actividad cancelada; se conserva en el historial"}


@router.put("/{calendario_id}/estado")
def cambiar_estado(
    calendario_id: int, data: EstadoIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _exigir_administracion(db, current_user)
    calendario = db.query(CalendarioAcademico).filter(CalendarioAcademico.id == calendario_id).first()
    if not calendario:
        raise HTTPException(404, "Calendario no encontrado")
    nuevo = data.estado.upper()
    if nuevo not in ESTADOS:
        raise HTTPException(422, "Estado no válido")
    permitidos = {"BORRADOR": {"PUBLICADO"}, "PUBLICADO": {"BORRADOR", "CERRADO"}, "CERRADO": set()}
    if nuevo not in permitidos[calendario.estado]:
        raise HTTPException(409, f"No se puede cambiar de {calendario.estado} a {nuevo}")
    if nuevo == "PUBLICADO" and not any(e.activo for e in calendario.eventos):
        raise HTTPException(409, "Agrega al menos una actividad antes de publicar")
    anterior = calendario.estado
    calendario.estado = nuevo
    calendario.version += 1
    if nuevo == "PUBLICADO":
        calendario.publicado_por_id = current_user.id
        calendario.publicado_en = datetime.datetime.utcnow()
    if nuevo == "CERRADO":
        calendario.cerrado_en = datetime.datetime.utcnow()
    _registrar_historial(db, calendario, current_user, f"ESTADO_{nuevo}", anteriores={"estado": anterior}, nuevos={"estado": nuevo}, motivo=data.motivo)
    db.commit()
    return _calendario_dict(calendario, True)


@router.get("/{calendario_id}/historial")
def historial(
    calendario_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if not _puede_administrar(db, current_user):
        raise HTTPException(403, "No tienes acceso al historial del calendario")
    rows = db.query(HistorialCalendarioAcademico).filter(
        HistorialCalendarioAcademico.calendario_id == calendario_id,
    ).order_by(HistorialCalendarioAcademico.creado_en.desc()).all()
    return [{
        "id": r.id, "evento_id": r.evento_id, "accion": r.accion,
        "motivo": r.motivo, "datos_anteriores": r.datos_anteriores,
        "datos_nuevos": r.datos_nuevos, "usuario": r.usuario.nombre if r.usuario else None,
        "creado_en": r.creado_en.isoformat(),
    } for r in rows]


@router.get("/fecha/{fecha}")
def consultar_fecha(
    fecha: datetime.date, periodo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    return estado_fecha_academica(db, periodo_id, fecha)
