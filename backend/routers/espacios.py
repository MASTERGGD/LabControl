"""
routers/espacios.py — Módulo de Apartado de Espacios Institucionales

Endpoints:
  /espacios/institucionales         CRUD de espacios (SUPER_ADMIN)
  /espacios/institucionales/{id}/responsables  Asignar/quitar responsables
  /espacios/institucionales/{id}/disponibilidad Calendario semanal de disponibilidad
  /espacios/solicitudes             Crear y consultar solicitudes
  /espacios/solicitudes/{id}/aprobar|rechazar|cancelar  Flujo de aprobación
  /espacios/mis-solicitudes         Solicitudes del usuario autenticado
  /espacios/bandeja                 Bandeja para responsables
"""
from __future__ import annotations

import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_roles
from models.espacio import (
    EspacioInstitucional, EspacioResponsable, EspacioApoyo,
    EstadoSolicitud, SolicitudEspacio, RequerimientoSolicitud,
    TipoEspacio, TipoRequerimiento, EstadoOperativoEspacio, EstadoExtension,
)
from models.notificacion import Notificacion
from models.usuario import RolUsuario, Usuario
from services.auditoria import Accion, Recurso, registrar
from routers.notificaciones import crear_notificacion

router = APIRouter(prefix="/espacios", tags=["Espacios"])


# ─── Utilidades de tiempo ───────────────────────────────────────────────────────

def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _hm_to_min(hhmm: str) -> int:
    """Convierte "HH:MM" a minutos desde medianoche."""
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _min_to_hm(total: int) -> str:
    total = max(0, min(total, 23 * 60 + 59))
    return f"{total // 60:02d}:{total % 60:02d}"


def _dt_solicitud(s: SolicitudEspacio, hhmm: str) -> datetime.datetime:
    return datetime.datetime.combine(s.fecha, datetime.time.fromisoformat(hhmm))


def _ahora_en_horario_solicitud(s: SolicitudEspacio) -> bool:
    ahora = datetime.datetime.now()
    return _dt_solicitud(s, s.hora_inicio) <= ahora <= _dt_solicitud(s, s.hora_fin)


def _requiere_motivo_cancelacion(s: SolicitudEspacio) -> bool:
    if s.estado == EstadoSolicitud.APROBADA:
        return True
    ahora = datetime.datetime.now()
    inicio = _dt_solicitud(s, s.hora_inicio)
    return datetime.timedelta(0) <= (inicio - ahora) <= datetime.timedelta(minutes=15)


def _hay_conflicto(
    db: Session,
    espacio_id: int,
    fecha: datetime.date,
    hora_inicio: str,
    hora_fin: str,
    excluir_id: Optional[int] = None,
) -> bool:
    """
    Devuelve True si hay una solicitud APROBADA que se solapa con el bloque dado.
    Dos bloques se solapan si: inicio_A < fin_B AND fin_A > inicio_B
    """
    espacio = db.query(EspacioInstitucional).filter(EspacioInstitucional.id == espacio_id).first()
    buffer_antes = espacio.buffer_antes_minutos if espacio else 0
    buffer_despues = espacio.buffer_despues_minutos if espacio else 0
    ini = _hm_to_min(hora_inicio) - buffer_antes
    fin = _hm_to_min(hora_fin) + buffer_despues

    q = db.query(SolicitudEspacio).filter(
        SolicitudEspacio.espacio_id == espacio_id,
        SolicitudEspacio.fecha == fecha,
        SolicitudEspacio.estado == EstadoSolicitud.APROBADA,
    )
    if excluir_id:
        q = q.filter(SolicitudEspacio.id != excluir_id)

    for s in q.all():
        s_ini = _hm_to_min(s.hora_inicio) - buffer_antes
        s_fin = _hm_to_min(s.hora_fin) + buffer_despues
        if ini < s_fin and fin > s_ini:
            return True
    return False


def _siguiente_solicitud_aprobada(db: Session, solicitud: SolicitudEspacio) -> Optional[SolicitudEspacio]:
    return db.query(SolicitudEspacio).filter(
        SolicitudEspacio.espacio_id == solicitud.espacio_id,
        SolicitudEspacio.fecha == solicitud.fecha,
        SolicitudEspacio.estado == EstadoSolicitud.APROBADA,
        SolicitudEspacio.id != solicitud.id,
        SolicitudEspacio.hora_inicio >= solicitud.hora_fin,
    ).order_by(SolicitudEspacio.hora_inicio.asc()).first()


def _es_responsable(db: Session, usuario_id: int, espacio_id: int) -> bool:
    return db.query(EspacioResponsable).filter(
        EspacioResponsable.usuario_id  == usuario_id,
        EspacioResponsable.espacio_id  == espacio_id,
    ).first() is not None


def _puede_gestionar(espacio: EspacioInstitucional, usuario: Usuario, db: Session) -> bool:
    """SUPER_ADMIN puede todo; responsable solo sus espacios."""
    if usuario.rol == RolUsuario.SUPER_ADMIN:
        return True
    return _es_responsable(db, usuario.id, espacio.id)


def _notificar(db: Session, usuario_id: int, tipo: str, titulo: str, mensaje: str, url: str = None):
    crear_notificacion(db, usuario_id, tipo, titulo, mensaje, url, enviar_email=True)


def _notificar_responsables_y_apoyos(
    db: Session,
    espacio: EspacioInstitucional,
    tipo: str,
    titulo: str,
    mensaje: str,
    url: str = "/espacios/bandeja",
    exclude_usuario_id: Optional[int] = None,
):
    vistos = set()
    # Notificar responsables directos (usuario_id)
    for rel in list(espacio.responsables or []):
        uid = rel.usuario_id
        if exclude_usuario_id and uid == exclude_usuario_id:
            continue
        if uid in vistos:
            continue
        vistos.add(uid)
        _notificar(db, uid, tipo, titulo, mensaje, url)
    # Notificar al responsable del departamento de apoyo
    for rel in list(espacio.apoyos or []):
        depto = rel.departamento
        if not depto or not depto.responsable_id:
            continue
        uid = depto.responsable_id
        if exclude_usuario_id and uid == exclude_usuario_id:
            continue
        if uid in vistos:
            continue
        vistos.add(uid)
        _notificar(db, uid, tipo, titulo, mensaje, url)


# ─── Schemas ───────────────────────────────────────────────────────────────────

class EspacioCreate(BaseModel):
    nombre:      str        = Field(..., min_length=2, max_length=120)
    tipo:        TipoEspacio
    ubicacion:   Optional[str] = None
    capacidad:   Optional[int] = None
    descripcion: Optional[str] = None
    hora_inicio_permitida: str = Field("08:00", pattern=r"^\d{2}:\d{2}$")
    hora_fin_permitida:    str = Field("20:00", pattern=r"^\d{2}:\d{2}$")
    requiere_aprobacion:   bool = True
    buffer_antes_minutos:   int = Field(0, ge=0, le=120)
    buffer_despues_minutos: int = Field(30, ge=0, le=180)
    estado_operativo:       EstadoOperativoEspacio = EstadoOperativoEspacio.DISPONIBLE
    aviso_operativo:        Optional[str] = None


class EspacioUpdate(BaseModel):
    nombre:      Optional[str]         = Field(None, min_length=2, max_length=120)
    tipo:        Optional[TipoEspacio] = None
    ubicacion:   Optional[str]         = None
    capacidad:   Optional[int]         = None
    descripcion: Optional[str]         = None
    activo:      Optional[bool]        = None
    hora_inicio_permitida: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    hora_fin_permitida:    Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    requiere_aprobacion:   Optional[bool] = None
    buffer_antes_minutos:   Optional[int] = Field(None, ge=0, le=120)
    buffer_despues_minutos: Optional[int] = Field(None, ge=0, le=180)
    estado_operativo:       Optional[EstadoOperativoEspacio] = None
    aviso_operativo:        Optional[str] = None


class ResponsableAsignar(BaseModel):
    usuario_id: int


class ApoyoAsignar(BaseModel):
    departamento_id: int


class RequerimientoIn(BaseModel):
    tipo:        TipoRequerimiento
    descripcion: Optional[str] = None
    cantidad:    int = 1
    requerido:   bool = True


class SolicitudCreate(BaseModel):
    espacio_id:         int
    area_solicitante:   Optional[str] = None
    fecha:              datetime.date
    hora_inicio:        str = Field(..., pattern=r"^\d{2}:\d{2}$")
    hora_fin:           str = Field(..., pattern=r"^\d{2}:\d{2}$")
    motivo:             str = Field(..., min_length=5)
    numero_asistentes:  Optional[int] = None
    observaciones:      Optional[str] = None
    requerimientos:     List[RequerimientoIn] = []


class SolicitudRechazar(BaseModel):
    motivo_rechazo: str = Field(..., min_length=5)


class SolicitudCancelar(BaseModel):
    motivo_cancelacion: Optional[str] = None


class SolicitudFinalizar(BaseModel):
    climas_apagados: bool = False
    luces_apagadas: bool = False
    microfonos_apagados: bool = False
    equipo_apagado: bool = False
    sala_cerrada: bool = False
    sin_incidencias: bool = True
    observaciones: Optional[str] = None


class SolicitudExtension(BaseModel):
    minutos: int = Field(..., ge=5, le=180)
    motivo: str = Field(..., min_length=5)


class ResolverExtension(BaseModel):
    aprobar: bool
    motivo: Optional[str] = None


class LiberarRangoPrioritario(BaseModel):
    espacio_id: int
    fecha: datetime.date
    hora_inicio: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    hora_fin: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    motivo: str = Field(..., min_length=5)
    nombre_evento: Optional[str] = Field(None, min_length=5)
    crear_evento_prioritario: bool = True
    numero_asistentes: Optional[int] = None
    observaciones: Optional[str] = None


# ─── Serializers ───────────────────────────────────────────────────────────────

def _ser_responsable(r: EspacioResponsable) -> dict:
    return {
        "id":          r.id,
        "espacio_id":  r.espacio_id,
        "usuario_id":  r.usuario_id,
        "nombre":      r.usuario.nombre,
        "email":       r.usuario.email,
        "asignado_en": r.asignado_en.isoformat() if r.asignado_en else None,
    }


def _ser_apoyo(r: EspacioApoyo) -> dict:
    depto = r.departamento
    resp  = depto.responsable if depto else None
    return {
        "id":                    r.id,
        "espacio_id":            r.espacio_id,
        "departamento_id":       r.departamento_id,
        "departamento_nombre":   depto.nombre if depto else None,
        "responsable_nombre":    resp.nombre  if resp  else "Sin responsable",
        "responsable_email":     resp.email   if resp  else None,
        "asignado_en":           r.asignado_en.isoformat() if r.asignado_en else None,
    }


def _ser_espacio(e: EspacioInstitucional, db: Session = None) -> dict:
    return {
        "id":          e.id,
        "nombre":      e.nombre,
        "tipo":        e.tipo,
        "ubicacion":   e.ubicacion,
        "capacidad":   e.capacidad,
        "descripcion": e.descripcion,
        "activo":      e.activo,
        "hora_inicio_permitida": e.hora_inicio_permitida,
        "hora_fin_permitida":    e.hora_fin_permitida,
        "requiere_aprobacion":   e.requiere_aprobacion,
        "buffer_antes_minutos":   e.buffer_antes_minutos,
        "buffer_despues_minutos": e.buffer_despues_minutos,
        "estado_operativo":       e.estado_operativo,
        "aviso_operativo":        e.aviso_operativo,
        "responsables": [_ser_responsable(r) for r in e.responsables],
        "apoyos":       [_ser_apoyo(r) for r in e.apoyos],
    }


def _ser_requerimiento(r: RequerimientoSolicitud) -> dict:
    return {
        "id":          r.id,
        "tipo":        r.tipo,
        "descripcion": r.descripcion,
        "cantidad":    r.cantidad,
        "requerido":   r.requerido,
    }


def _ser_solicitud(s: SolicitudEspacio) -> dict:
    aprobador_nombre = None
    if s.aprobador:
        aprobador_nombre = s.aprobador.nombre

    return {
        "id":                 s.id,
        "espacio_id":         s.espacio_id,
        "espacio_nombre":     s.espacio.nombre if s.espacio else None,
        "espacio_tipo":       s.espacio.tipo   if s.espacio else None,
        "solicitante_id":     s.solicitante_id,
        "solicitante_nombre": s.solicitante_nombre,
        "area_solicitante":   s.area_solicitante,
        "fecha":              s.fecha.isoformat() if s.fecha else None,
        "hora_inicio":        s.hora_inicio,
        "hora_fin":           s.hora_fin,
        "motivo":             s.motivo,
        "numero_asistentes":  s.numero_asistentes,
        "observaciones":      s.observaciones,
        "estado":             s.estado,
        "motivo_rechazo":     s.motivo_rechazo,
        "motivo_liberacion":  s.motivo_liberacion,
        "liberado_por":       s.liberado_por,
        "liberado_en":        s.liberado_en.isoformat() if s.liberado_en else None,
        "evento_prioritario": s.evento_prioritario,
        "creado_en":          s.creado_en.isoformat() if s.creado_en else None,
        "aprobado_por":       s.aprobado_por,
        "aprobado_por_nombre":aprobador_nombre,
        "aprobado_en":        s.aprobado_en.isoformat() if s.aprobado_en else None,
        "finalizado_por":     s.finalizado_por,
        "finalizado_en":      s.finalizado_en.isoformat() if s.finalizado_en else None,
        "cierre": {
            "climas_apagados":     s.cierre_climas_apagados,
            "luces_apagadas":      s.cierre_luces_apagadas,
            "microfonos_apagados": s.cierre_microfonos_apagados,
            "equipo_apagado":      s.cierre_equipo_apagado,
            "sala_cerrada":        s.cierre_sala_cerrada,
            "sin_incidencias":     s.cierre_sin_incidencias,
            "observaciones":       s.cierre_observaciones,
        },
        "extension": {
            "estado":              s.extension_estado,
            "minutos_solicitados": s.extension_minutos_solicitados,
            "motivo":              s.extension_motivo,
            "solicitada_en":       s.extension_solicitada_en.isoformat() if s.extension_solicitada_en else None,
            "resuelta_en":         s.extension_resuelta_en.isoformat() if s.extension_resuelta_en else None,
        },
        "buffer_antes_minutos":   s.espacio.buffer_antes_minutos if s.espacio else 0,
        "buffer_despues_minutos": s.espacio.buffer_despues_minutos if s.espacio else 0,
        "requerimientos":     [_ser_requerimiento(r) for r in s.requerimientos],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ESPACIOS INSTITUCIONALES — CRUD (SUPER_ADMIN)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/institucionales", summary="Listar espacios institucionales")
def listar_espacios(
    solo_activos: bool = True,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    """
    SUPER_ADMIN: todos.
    Responsable: solo sus espacios.
    DOCENTE / otros: solo activos (para solicitar).
    """
    q = db.query(EspacioInstitucional)
    if solo_activos:
        q = q.filter(EspacioInstitucional.activo == True)

    espacios = q.order_by(EspacioInstitucional.nombre).all()

    # Responsable: filtrar por asignación
    if user.rol not in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN):
        mis_ids = {
            r.espacio_id
            for r in db.query(EspacioResponsable).filter(
                EspacioResponsable.usuario_id == user.id
            ).all()
        }
        # Si es responsable de alguno, devolver solo esos; si no, devolver todos (para solicitar)
        if mis_ids and not solo_activos:
            espacios = [e for e in espacios if e.id in mis_ids]

    return [_ser_espacio(e) for e in espacios]


@router.post("/institucionales", status_code=status.HTTP_201_CREATED, summary="Crear espacio institucional")
def crear_espacio(
    data:    EspacioCreate,
    request: Request,
    db:      Session  = Depends(get_db),
    user:    Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    if db.query(EspacioInstitucional).filter(EspacioInstitucional.nombre == data.nombre).first():
        raise HTTPException(409, "Ya existe un espacio con ese nombre")

    espacio = EspacioInstitucional(
        **data.model_dump(),
        creado_en=_utcnow(),
    )
    db.add(espacio)
    db.commit()
    db.refresh(espacio)

    registrar(db, "CREAR_ESPACIO", "ESPACIO", usuario=user, recurso_id=espacio.id,
              detalle={"nombre": espacio.nombre, "tipo": espacio.tipo}, request=request)
    return _ser_espacio(espacio)


@router.put("/institucionales/{espacio_id}", summary="Editar espacio institucional")
def editar_espacio(
    espacio_id: int,
    data:       EspacioUpdate,
    request:    Request,
    db:         Session  = Depends(get_db),
    user:       Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    espacio = db.query(EspacioInstitucional).filter(EspacioInstitucional.id == espacio_id).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado")

    for campo, valor in data.model_dump(exclude_none=True).items():
        setattr(espacio, campo, valor)
    db.commit()
    db.refresh(espacio)

    registrar(db, "EDITAR_ESPACIO", "ESPACIO", usuario=user, recurso_id=espacio.id, request=request)
    return _ser_espacio(espacio)


@router.delete("/institucionales/{espacio_id}", summary="Desactivar espacio")
def desactivar_espacio(
    espacio_id: int,
    request:    Request,
    db:         Session  = Depends(get_db),
    user:       Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    espacio = db.query(EspacioInstitucional).filter(EspacioInstitucional.id == espacio_id).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado")
    espacio.activo = False
    db.commit()
    registrar(db, "DESACTIVAR_ESPACIO", "ESPACIO", usuario=user, recurso_id=espacio_id, request=request)
    return {"mensaje": f"Espacio '{espacio.nombre}' desactivado"}


# ─── Responsables ──────────────────────────────────────────────────────────────

@router.get("/institucionales/{espacio_id}/responsables", summary="Listar responsables del espacio")
def listar_responsables(
    espacio_id: int,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    espacio = db.query(EspacioInstitucional).filter(EspacioInstitucional.id == espacio_id).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado")
    return [_ser_responsable(r) for r in espacio.responsables]


@router.post("/institucionales/{espacio_id}/responsables", status_code=201, summary="Asignar responsable")
def asignar_responsable(
    espacio_id: int,
    data:       ResponsableAsignar,
    request:    Request,
    db:         Session  = Depends(get_db),
    user:       Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    espacio = db.query(EspacioInstitucional).filter(EspacioInstitucional.id == espacio_id).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado")

    usuario_obj = db.query(Usuario).filter(Usuario.id == data.usuario_id, Usuario.activo == True).first()
    if not usuario_obj:
        raise HTTPException(404, "Usuario no encontrado")

    existe = db.query(EspacioResponsable).filter(
        EspacioResponsable.espacio_id == espacio_id,
        EspacioResponsable.usuario_id == data.usuario_id,
    ).first()
    if existe:
        raise HTTPException(409, "El usuario ya es responsable de este espacio")

    rel = EspacioResponsable(espacio_id=espacio_id, usuario_id=data.usuario_id, asignado_en=_utcnow())
    db.add(rel)
    db.commit()
    db.refresh(rel)

    registrar(db, "ASIGNAR_RESPONSABLE_ESPACIO", "ESPACIO", usuario=user, recurso_id=espacio_id,
              detalle={"usuario_id": data.usuario_id, "usuario_nombre": usuario_obj.nombre}, request=request)
    return _ser_responsable(rel)


@router.delete("/institucionales/{espacio_id}/responsables/{responsable_id}", summary="Quitar responsable")
def quitar_responsable(
    espacio_id:      int,
    responsable_id:  int,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    rel = db.query(EspacioResponsable).filter(
        EspacioResponsable.id         == responsable_id,
        EspacioResponsable.espacio_id == espacio_id,
    ).first()
    if not rel:
        raise HTTPException(404, "Asignación no encontrada")
    db.delete(rel)
    db.commit()
    return {"mensaje": "Responsable removido"}


@router.get("/institucionales/{espacio_id}/apoyos", summary="Listar areas de apoyo del espacio")
def listar_apoyos(
    espacio_id: int,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    espacio = db.query(EspacioInstitucional).filter(EspacioInstitucional.id == espacio_id).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado")
    return [_ser_apoyo(r) for r in espacio.apoyos]


@router.post("/institucionales/{espacio_id}/apoyos", status_code=201, summary="Asignar area de apoyo")
def asignar_apoyo(
    espacio_id: int,
    data:       ApoyoAsignar,
    request:    Request,
    db:         Session  = Depends(get_db),
    user:       Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    from models.departamento import Departamento
    espacio = db.query(EspacioInstitucional).filter(EspacioInstitucional.id == espacio_id).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado")

    depto = db.query(Departamento).filter(Departamento.id == data.departamento_id, Departamento.activo == True).first()
    if not depto:
        raise HTTPException(404, "Departamento no encontrado")
    if not depto.responsable_id:
        raise HTTPException(
            422,
            "El departamento necesita un responsable asignado para recibir notificaciones de apoyo",
        )

    existe = db.query(EspacioApoyo).filter(
        EspacioApoyo.espacio_id == espacio_id,
        EspacioApoyo.departamento_id == data.departamento_id,
    ).first()
    if existe:
        raise HTTPException(409, "El departamento ya esta asignado como area de apoyo de este espacio")

    rel = EspacioApoyo(
        espacio_id=espacio_id,
        departamento_id=data.departamento_id,
        asignado_en=_utcnow(),
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)

    registrar(db, "ASIGNAR_APOYO_ESPACIO", "ESPACIO", usuario=user, recurso_id=espacio_id,
              detalle={"departamento_id": data.departamento_id}, request=request)
    return _ser_apoyo(rel)


@router.delete("/institucionales/{espacio_id}/apoyos/{apoyo_id}", summary="Quitar area de apoyo")
def quitar_apoyo(
    espacio_id: int,
    apoyo_id:   int,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    rel = db.query(EspacioApoyo).filter(
        EspacioApoyo.id == apoyo_id,
        EspacioApoyo.espacio_id == espacio_id,
    ).first()
    if not rel:
        raise HTTPException(404, "Asignacion no encontrada")
    db.delete(rel)
    db.commit()
    return {"mensaje": "Apoyo removido"}


# ─── Disponibilidad ────────────────────────────────────────────────────────────

@router.get("/institucionales/{espacio_id}/disponibilidad", summary="Disponibilidad semanal")
def disponibilidad(
    espacio_id:   int,
    fecha_inicio: datetime.date = Query(..., description="Lunes de la semana a consultar (YYYY-MM-DD)"),
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    """
    Devuelve las solicitudes de la semana (fecha_inicio … fecha_inicio+6)
    con su estado, para pintar el calendario de disponibilidad.
    """
    espacio = db.query(EspacioInstitucional).filter(
        EspacioInstitucional.id == espacio_id,
        EspacioInstitucional.activo == True,
    ).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado o inactivo")

    fecha_fin = fecha_inicio + datetime.timedelta(days=6)
    solicitudes = db.query(SolicitudEspacio).filter(
        SolicitudEspacio.espacio_id == espacio_id,
        SolicitudEspacio.fecha >= fecha_inicio,
        SolicitudEspacio.fecha <= fecha_fin,
        SolicitudEspacio.estado.in_([
            EstadoSolicitud.PENDIENTE,
            EstadoSolicitud.APROBADA,
        ]),
    ).order_by(SolicitudEspacio.fecha, SolicitudEspacio.hora_inicio).all()

    return {
        "espacio": _ser_espacio(espacio),
        "semana_inicio": fecha_inicio.isoformat(),
        "semana_fin":    fecha_fin.isoformat(),
        "solicitudes": [_ser_solicitud(s) for s in solicitudes],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SOLICITUDES
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/solicitudes", status_code=201, summary="Crear solicitud de espacio")
def crear_solicitud(
    data:    SolicitudCreate,
    request: Request,
    db:      Session  = Depends(get_db),
    user:    Usuario  = Depends(get_current_user),
):
    espacio = db.query(EspacioInstitucional).filter(
        EspacioInstitucional.id == data.espacio_id,
        EspacioInstitucional.activo == True,
    ).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado o inactivo")

    # Validar hora
    if _hm_to_min(data.hora_fin) <= _hm_to_min(data.hora_inicio):
        raise HTTPException(422, "hora_fin debe ser mayor que hora_inicio")

    ini_p = _hm_to_min(espacio.hora_inicio_permitida)
    fin_p = _hm_to_min(espacio.hora_fin_permitida)
    if _hm_to_min(data.hora_inicio) < ini_p or _hm_to_min(data.hora_fin) > fin_p:
        raise HTTPException(
            422,
            f"El bloque solicitado está fuera del horario permitido "
            f"({espacio.hora_inicio_permitida} – {espacio.hora_fin_permitida})"
        )

    if espacio.estado_operativo == EstadoOperativoEspacio.FUERA_SERVICIO:
        raise HTTPException(409, "La sala se encuentra fuera de servicio temporalmente")

    # Validar conflicto con APROBADAS
    if _hay_conflicto(db, data.espacio_id, data.fecha, data.hora_inicio, data.hora_fin):
        raise HTTPException(
            409,
            "El espacio ya esta reservado o requiere tiempo operativo de limpieza/acondicionamiento en ese bloque"
        )

    solicitud = SolicitudEspacio(
        espacio_id         = data.espacio_id,
        solicitante_id     = user.id,
        solicitante_nombre = user.nombre,
        area_solicitante   = data.area_solicitante,
        fecha              = data.fecha,
        hora_inicio        = data.hora_inicio,
        hora_fin           = data.hora_fin,
        motivo             = data.motivo,
        numero_asistentes  = data.numero_asistentes,
        observaciones      = data.observaciones,
        estado             = EstadoSolicitud.PENDIENTE,
        creado_en          = _utcnow(),
    )
    db.add(solicitud)
    db.flush()

    for req in data.requerimientos:
        db.add(RequerimientoSolicitud(
            solicitud_id = solicitud.id,
            tipo         = req.tipo,
            descripcion  = req.descripcion,
            cantidad     = req.cantidad,
            requerido    = req.requerido,
        ))

    db.commit()
    db.refresh(solicitud)

    # Notificar a responsables del espacio
    for resp in espacio.responsables:
        _notificar(
            db, resp.usuario_id,
            tipo    = "SOLICITUD_ESPACIO",
            titulo  = f"Nueva solicitud — {espacio.nombre}",
            mensaje = f"{user.nombre} solicitó '{espacio.nombre}' el {data.fecha} de {data.hora_inicio} a {data.hora_fin}.",
            url     = f"/espacios/bandeja",
        )
    if espacio.estado_operativo != EstadoOperativoEspacio.DISPONIBLE and espacio.aviso_operativo:
        _notificar(
            db, user.id,
            tipo="ESPACIO_ESTADO_OPERATIVO",
            titulo=f"Condicion operativa de {espacio.nombre}",
            mensaje=f"La sala esta en estado {espacio.estado_operativo}. Aviso: {espacio.aviso_operativo}",
            url="/espacios/mis-solicitudes",
        )
    db.commit()

    registrar(db, "CREAR_SOLICITUD_ESPACIO", "ESPACIO", usuario=user,
              recurso_id=solicitud.id,
              detalle={"espacio": espacio.nombre, "fecha": str(data.fecha)},
              request=request)

    return _ser_solicitud(solicitud)


@router.get("/solicitudes/{solicitud_id}", summary="Detalle de solicitud")
def detalle_solicitud(
    solicitud_id: int,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")

    # Solo el solicitante, el responsable del espacio o SUPER_ADMIN pueden ver
    if user.rol != RolUsuario.SUPER_ADMIN and s.solicitante_id != user.id:
        if not _es_responsable(db, user.id, s.espacio_id):
            raise HTTPException(403, "Sin acceso a esta solicitud")

    return _ser_solicitud(s)


@router.get("/mis-solicitudes", summary="Solicitudes del usuario autenticado")
def mis_solicitudes(
    estado:   Optional[str]         = Query(None),
    espacio_id: Optional[int]       = Query(None),
    fecha_desde: Optional[datetime.date] = Query(None),
    fecha_hasta: Optional[datetime.date] = Query(None),
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    q = db.query(SolicitudEspacio).filter(SolicitudEspacio.solicitante_id == user.id)
    if estado:
        q = q.filter(SolicitudEspacio.estado == estado)
    if espacio_id:
        q = q.filter(SolicitudEspacio.espacio_id == espacio_id)
    if fecha_desde:
        q = q.filter(SolicitudEspacio.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(SolicitudEspacio.fecha <= fecha_hasta)

    solicitudes = q.order_by(SolicitudEspacio.fecha.desc(), SolicitudEspacio.hora_inicio).all()
    return [_ser_solicitud(s) for s in solicitudes]


@router.get("/bandeja", summary="Bandeja de aprobación para responsables")
def bandeja_aprobacion(
    estado:    Optional[str]   = Query("PENDIENTE"),
    espacio_id: Optional[int]  = Query(None),
    fecha_desde: Optional[datetime.date] = Query(None),
    fecha_hasta: Optional[datetime.date] = Query(None),
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    """Devuelve solicitudes que el usuario puede gestionar."""
    q = db.query(SolicitudEspacio)

    if user.rol != RolUsuario.SUPER_ADMIN:
        # Obtener IDs de espacios donde es responsable
        mis_espacios = {
            r.espacio_id
            for r in db.query(EspacioResponsable).filter(
                EspacioResponsable.usuario_id == user.id
            ).all()
        }
        if not mis_espacios:
            return []
        q = q.filter(SolicitudEspacio.espacio_id.in_(mis_espacios))

    if estado:
        q = q.filter(SolicitudEspacio.estado == estado)
    if espacio_id:
        q = q.filter(SolicitudEspacio.espacio_id == espacio_id)
    if fecha_desde:
        q = q.filter(SolicitudEspacio.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(SolicitudEspacio.fecha <= fecha_hasta)

    solicitudes = q.order_by(SolicitudEspacio.fecha.asc(), SolicitudEspacio.hora_inicio).all()

    # Enriquecer con advertencias de conflicto con PENDIENTES
    resultado = []
    for s in solicitudes:
        item = _ser_solicitud(s)
        if s.estado == EstadoSolicitud.PENDIENTE:
            # Verificar si hay otra PENDIENTE que solapa
            ini = _hm_to_min(s.hora_inicio)
            fin = _hm_to_min(s.hora_fin)
            otras = db.query(SolicitudEspacio).filter(
                SolicitudEspacio.espacio_id == s.espacio_id,
                SolicitudEspacio.fecha == s.fecha,
                SolicitudEspacio.estado == EstadoSolicitud.PENDIENTE,
                SolicitudEspacio.id != s.id,
            ).all()
            conflicto_pendiente = any(
                ini < _hm_to_min(o.hora_fin) and fin > _hm_to_min(o.hora_inicio)
                for o in otras
            )
            item["conflicto_pendiente"] = conflicto_pendiente
        else:
            item["conflicto_pendiente"] = False
        resultado.append(item)

    return resultado


@router.post("/solicitudes/liberar-rango", summary="Liberar horario por evento institucional prioritario")
def liberar_rango_prioritario(
    data: LiberarRangoPrioritario,
    request: Request,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    espacio = db.query(EspacioInstitucional).filter(EspacioInstitucional.id == data.espacio_id).first()
    if not espacio:
        raise HTTPException(404, "Espacio no encontrado")
    if not _puede_gestionar(espacio, user, db):
        raise HTTPException(403, "Sin permiso para liberar este espacio")
    if _hm_to_min(data.hora_fin) <= _hm_to_min(data.hora_inicio):
        raise HTTPException(422, "hora_fin debe ser mayor que hora_inicio")

    ini = _hm_to_min(data.hora_inicio)
    fin = _hm_to_min(data.hora_fin)
    afectadas = []
    for s in db.query(SolicitudEspacio).filter(
        SolicitudEspacio.espacio_id == data.espacio_id,
        SolicitudEspacio.fecha == data.fecha,
        SolicitudEspacio.estado == EstadoSolicitud.APROBADA,
    ).all():
        if ini < _hm_to_min(s.hora_fin) and fin > _hm_to_min(s.hora_inicio):
            afectadas.append(s)

    ahora = _utcnow()
    for s in afectadas:
        s.estado = EstadoSolicitud.LIBERADA
        s.liberado_por = user.id
        s.liberado_en = ahora
        s.motivo_liberacion = data.motivo
        if s.solicitante_id:
            _notificar(
                db, s.solicitante_id,
                tipo="ESPACIO_LIBERADO",
                titulo=f"Horario liberado - {s.espacio.nombre}",
                mensaje=(
                    f"Tu solicitud aprobada para {s.espacio.nombre} del {s.fecha} "
                    f"({s.hora_inicio}-{s.hora_fin}) fue liberada por un evento institucional prioritario. "
                    f"Motivo: {data.motivo}. Te pedimos reprogramar tu evento."
                ),
                url="/espacios/mis-solicitudes",
            )

    nueva = None
    if data.crear_evento_prioritario:
        nueva = SolicitudEspacio(
            espacio_id=data.espacio_id,
            solicitante_id=user.id,
            solicitante_nombre=user.nombre,
            area_solicitante="Evento institucional prioritario",
            fecha=data.fecha,
            hora_inicio=data.hora_inicio,
            hora_fin=data.hora_fin,
            motivo=data.nombre_evento or data.motivo,
            numero_asistentes=data.numero_asistentes,
            observaciones=data.observaciones,
            estado=EstadoSolicitud.APROBADA,
            creado_en=ahora,
            aprobado_por=user.id,
            aprobado_en=ahora,
            evento_prioritario=True,
        )
        db.add(nueva)
        db.flush()

    _notificar_responsables_y_apoyos(
        db,
        espacio,
        tipo="ESPACIO_EVENTO_PRIORITARIO",
        titulo=f"Evento prioritario - {espacio.nombre}",
        mensaje=(
            f"Se libero el horario {data.fecha} {data.hora_inicio}-{data.hora_fin}. "
            f"Solicitudes afectadas: {len(afectadas)}. Motivo: {data.motivo}."
        ),
        url="/espacios/bandeja",
    )
    db.commit()
    if nueva:
        db.refresh(nueva)

    registrar(
        db, "LIBERAR_RANGO_ESPACIO", "ESPACIO", usuario=user,
        recurso_id=data.espacio_id,
        detalle={
            "fecha": str(data.fecha),
            "hora_inicio": data.hora_inicio,
            "hora_fin": data.hora_fin,
            "afectadas": [s.id for s in afectadas],
            "evento_prioritario_id": nueva.id if nueva else None,
        },
        request=request,
    )
    return {
        "mensaje": "Horario liberado por evento prioritario",
        "afectadas": [_ser_solicitud(s) for s in afectadas],
        "evento_prioritario": _ser_solicitud(nueva) if nueva else None,
    }


# ─── Acciones de ciclo de vida ─────────────────────────────────────────────────

@router.post("/solicitudes/{solicitud_id}/aprobar", summary="Aprobar solicitud")
def aprobar_solicitud(
    solicitud_id: int,
    request:      Request,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")
    if not _puede_gestionar(s.espacio, user, db):
        raise HTTPException(403, "Sin permiso para gestionar este espacio")
    if s.estado != EstadoSolicitud.PENDIENTE:
        raise HTTPException(409, f"La solicitud está en estado {s.estado}, no se puede aprobar")

    # Verificar conflicto con otras APROBADAS
    if _hay_conflicto(db, s.espacio_id, s.fecha, s.hora_inicio, s.hora_fin, excluir_id=s.id):
        raise HTTPException(409, "Ya existe una reserva APROBADA que se solapa con este bloque")

    s.estado       = EstadoSolicitud.APROBADA
    s.aprobado_por = user.id
    s.aprobado_en  = _utcnow()
    db.commit()

    # Notificar al solicitante
    if s.solicitante_id:
        _notificar(
            db, s.solicitante_id,
            tipo    = "SOLICITUD_ESPACIO",
            titulo  = f"Solicitud aprobada — {s.espacio.nombre}",
            mensaje = (
                f"Tu solicitud del {s.fecha} ({s.hora_inicio}-{s.hora_fin}) fue APROBADA. "
                "Al finalizar verifica: climas apagados, lamparas apagadas, microfonos/equipo apagados y sala cerrada."
            ),
            url     = "/espacios/mis-solicitudes",
        )

    reqs = ", ".join([r.tipo.value if hasattr(r.tipo, "value") else str(r.tipo) for r in s.requerimientos]) or "Sin requerimientos"
    _notificar_responsables_y_apoyos(
        db,
        s.espacio,
        tipo="ESPACIO_EVENTO_APROBADO",
        titulo=f"Evento aprobado - {s.espacio.nombre}",
        mensaje=(
            f"{s.motivo} | {s.fecha} {s.hora_inicio}-{s.hora_fin}. "
            f"Asistentes: {s.numero_asistentes or 'N/D'}. Requerimientos: {reqs}. "
            f"Considerar buffer operativo posterior de {s.espacio.buffer_despues_minutos} min."
        ),
        url="/espacios/bandeja",
    )
    db.commit()

    registrar(db, "APROBAR_SOLICITUD_ESPACIO", "ESPACIO", usuario=user,
              recurso_id=solicitud_id, request=request)
    return _ser_solicitud(s)


@router.post("/solicitudes/{solicitud_id}/rechazar", summary="Rechazar solicitud")
def rechazar_solicitud(
    solicitud_id: int,
    data:         SolicitudRechazar,
    request:      Request,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")
    if not _puede_gestionar(s.espacio, user, db):
        raise HTTPException(403, "Sin permiso para gestionar este espacio")
    if s.estado not in (EstadoSolicitud.PENDIENTE, EstadoSolicitud.APROBADA):
        raise HTTPException(409, f"No se puede rechazar desde estado {s.estado}")

    s.estado         = EstadoSolicitud.RECHAZADA
    s.motivo_rechazo = data.motivo_rechazo
    db.commit()

    if s.solicitante_id:
        _notificar(
            db, s.solicitante_id,
            tipo    = "SOLICITUD_ESPACIO",
            titulo  = f"Solicitud rechazada — {s.espacio.nombre}",
            mensaje = f"Tu solicitud del {s.fecha} fue rechazada. Motivo: {data.motivo_rechazo}",
            url     = "/espacios/mis-solicitudes",
        )
        db.commit()

    registrar(db, "RECHAZAR_SOLICITUD_ESPACIO", "ESPACIO", usuario=user,
              recurso_id=solicitud_id,
              detalle={"motivo": data.motivo_rechazo}, request=request)
    return _ser_solicitud(s)


@router.post("/solicitudes/{solicitud_id}/cancelar", summary="Cancelar solicitud")
def cancelar_solicitud(
    solicitud_id: int,
    data:         SolicitudCancelar,
    request:      Request,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")

    # Puede cancelar: el propio solicitante (si está PENDIENTE), responsable o SUPER_ADMIN
    es_solicitante = (s.solicitante_id == user.id)
    puede_admin    = _puede_gestionar(s.espacio, user, db)

    if not es_solicitante and not puede_admin:
        raise HTTPException(403, "Sin permiso para cancelar esta solicitud")
    if es_solicitante and s.estado not in (EstadoSolicitud.PENDIENTE, EstadoSolicitud.APROBADA):
        raise HTTPException(409, f"No se puede cancelar desde estado {s.estado}")
    motivo_cancelacion = (data.motivo_cancelacion or "").strip()
    if _requiere_motivo_cancelacion(s) and len(motivo_cancelacion) < 5:
        raise HTTPException(
            422,
            "Indica el motivo de cancelacion. Es obligatorio cuando la reserva ya fue aprobada o esta por iniciar.",
        )
    data.motivo_cancelacion = motivo_cancelacion

    s.estado       = EstadoSolicitud.CANCELADA
    s.cancelado_por = user.id
    s.cancelado_en  = _utcnow()
    if data.motivo_cancelacion:
        s.observaciones = (s.observaciones or "") + f"\n[Cancelación: {data.motivo_cancelacion}]"
    db.commit()

    # Notificar al solicitante si fue cancelada por otro
    if not es_solicitante and s.solicitante_id:
        _notificar(
            db, s.solicitante_id,
            tipo    = "SOLICITUD_ESPACIO",
            titulo  = f"Solicitud cancelada — {s.espacio.nombre}",
            mensaje = f"Tu solicitud del {s.fecha} ha sido cancelada.",
            url     = "/espacios/mis-solicitudes",
        )
    if es_solicitante:
        _notificar_responsables_y_apoyos(
            db, s.espacio,
            tipo="ESPACIO_EVENTO_CANCELADO_SOLICITANTE",
            titulo=f"Evento liberado - {s.espacio.nombre}",
            mensaje=(
                f"{user.nombre} libero su evento '{s.motivo}' del {s.fecha} "
                f"({s.hora_inicio}-{s.hora_fin}). "
                f"Motivo: {data.motivo_cancelacion or 'Sin motivo registrado'}"
            ),
            url="/espacios/bandeja",
            exclude_usuario_id=user.id,
        )
    elif puede_admin:
        _notificar_responsables_y_apoyos(
            db, s.espacio,
            tipo="ESPACIO_EVENTO_CANCELADO_ADMIN",
            titulo=f"Reserva liberada - {s.espacio.nombre}",
            mensaje=(
                f"{user.nombre} libero la reserva '{s.motivo}' del {s.fecha} "
                f"({s.hora_inicio}-{s.hora_fin}). "
                f"Motivo: {data.motivo_cancelacion or 'Sin motivo registrado'}"
            ),
            url="/espacios/bandeja",
            exclude_usuario_id=user.id,
        )
    db.commit()

    registrar(db, "CANCELAR_SOLICITUD_ESPACIO", "ESPACIO", usuario=user,
              recurso_id=solicitud_id, detalle={"motivo": motivo_cancelacion}, request=request)
    return _ser_solicitud(s)


@router.post("/solicitudes/{solicitud_id}/finalizar", summary="Marcar como finalizada")
def finalizar_solicitud(
    solicitud_id: int,
    request:      Request,
    data: Optional[SolicitudFinalizar] = None,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")
    es_solicitante = s.solicitante_id == user.id
    if not es_solicitante and not _puede_gestionar(s.espacio, user, db):
        raise HTTPException(403, "Sin permiso")
    if s.estado != EstadoSolicitud.APROBADA:
        raise HTTPException(409, "Solo se pueden finalizar solicitudes APROBADAS")
    if not _ahora_en_horario_solicitud(s):
        raise HTTPException(
            409,
            "Solo puedes terminar la reunion dentro del horario reservado. Si aun no inicia, cancela la reserva.",
        )

    s.estado = EstadoSolicitud.FINALIZADA
    s.finalizado_por = user.id
    s.finalizado_en = _utcnow()
    ahora_local = datetime.datetime.now()
    fin_programado = _dt_solicitud(s, s.hora_fin)
    finalizo_antes = es_solicitante and ahora_local < (fin_programado - datetime.timedelta(minutes=5))
    if data:
        s.cierre_climas_apagados = data.climas_apagados
        s.cierre_luces_apagadas = data.luces_apagadas
        s.cierre_microfonos_apagados = data.microfonos_apagados
        s.cierre_equipo_apagado = data.equipo_apagado
        s.cierre_sala_cerrada = data.sala_cerrada
        s.cierre_sin_incidencias = data.sin_incidencias
        s.cierre_observaciones = data.observaciones
    db.commit()

    if finalizo_antes:
        _notificar_responsables_y_apoyos(
            db, s.espacio,
            tipo="ESPACIO_FINALIZADO_ANTES",
            titulo=f"Evento finalizado antes - {s.espacio.nombre}",
            mensaje=(
                f"{user.nombre} finalizo antes su evento '{s.motivo}'. "
                f"Horario original: {s.fecha} {s.hora_inicio}-{s.hora_fin}. "
                f"La sala puede verificarse o quedar disponible antes."
            ),
            url="/espacios/bandeja",
            exclude_usuario_id=user.id,
        )
        db.commit()

    if not s.cierre_sin_incidencias:
        _notificar_responsables_y_apoyos(
            db, s.espacio,
            tipo="ESPACIO_CIERRE_INCIDENCIA",
            titulo=f"Incidencia al cerrar - {s.espacio.nombre}",
            mensaje=f"{user.nombre} cerro el evento con observaciones: {s.cierre_observaciones or 'Sin detalle'}",
            url="/espacios/bandeja",
            exclude_usuario_id=user.id,
        )
        db.commit()

    registrar(db, "FINALIZAR_SOLICITUD_ESPACIO", "ESPACIO", usuario=user,
              recurso_id=solicitud_id, request=request)
    return _ser_solicitud(s)


@router.post("/solicitudes/{solicitud_id}/solicitar-extension", summary="Solicitar extension de tiempo")
def solicitar_extension(
    solicitud_id: int,
    data: SolicitudExtension,
    request: Request,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")
    if s.solicitante_id != user.id:
        raise HTTPException(403, "Solo el solicitante puede pedir extension")
    if s.estado != EstadoSolicitud.APROBADA:
        raise HTTPException(409, "Solo se puede extender una solicitud aprobada")

    nuevo_fin = _min_to_hm(_hm_to_min(s.hora_fin) + data.minutos)
    if _hm_to_min(nuevo_fin) > _hm_to_min(s.espacio.hora_fin_permitida):
        raise HTTPException(409, "La extension excede el horario permitido de la sala")
    if _hay_conflicto(db, s.espacio_id, s.fecha, s.hora_inicio, nuevo_fin, excluir_id=s.id):
        raise HTTPException(409, "No es posible extender: existe otro evento o buffer operativo despues")

    s.extension_minutos_solicitados = data.minutos
    s.extension_motivo = data.motivo
    s.extension_estado = EstadoExtension.PENDIENTE
    s.extension_solicitada_en = _utcnow()

    _notificar_responsables_y_apoyos(
        db, s.espacio,
        tipo="ESPACIO_EXTENSION_SOLICITADA",
        titulo=f"Extension solicitada - {s.espacio.nombre}",
        mensaje=f"{user.nombre} solicita {data.minutos} min extra para '{s.motivo}'. No se detecto conflicto automatico.",
        url="/espacios/bandeja",
    )
    db.commit()
    registrar(db, "SOLICITAR_EXTENSION_ESPACIO", "ESPACIO", usuario=user, recurso_id=solicitud_id,
              detalle={"minutos": data.minutos}, request=request)
    return _ser_solicitud(s)


@router.post("/solicitudes/{solicitud_id}/resolver-extension", summary="Resolver extension de tiempo")
def resolver_extension(
    solicitud_id: int,
    data: ResolverExtension,
    request: Request,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")
    if not _puede_gestionar(s.espacio, user, db):
        raise HTTPException(403, "Sin permiso")
    if s.extension_estado != EstadoExtension.PENDIENTE:
        raise HTTPException(409, "No hay extension pendiente")

    if data.aprobar:
        nuevo_fin = _min_to_hm(_hm_to_min(s.hora_fin) + (s.extension_minutos_solicitados or 0))
        if _hay_conflicto(db, s.espacio_id, s.fecha, s.hora_inicio, nuevo_fin, excluir_id=s.id):
            raise HTTPException(409, "Ya no es posible aprobar: existe conflicto posterior")
        s.hora_fin = nuevo_fin
        s.extension_estado = EstadoExtension.APROBADA
    else:
        s.extension_estado = EstadoExtension.RECHAZADA
        if data.motivo:
            s.extension_motivo = f"{s.extension_motivo or ''}\nRespuesta: {data.motivo}".strip()

    s.extension_resuelta_por = user.id
    s.extension_resuelta_en = _utcnow()
    if s.solicitante_id:
        _notificar(
            db, s.solicitante_id,
            tipo="ESPACIO_EXTENSION_RESUELTA",
            titulo=f"Extension {'aprobada' if data.aprobar else 'rechazada'} - {s.espacio.nombre}",
            mensaje=f"Tu solicitud de extension fue {'aprobada' if data.aprobar else 'rechazada'}.",
            url="/espacios/mis-solicitudes",
        )
    db.commit()
    registrar(db, "RESOLVER_EXTENSION_ESPACIO", "ESPACIO", usuario=user, recurso_id=solicitud_id,
              detalle={"aprobar": data.aprobar}, request=request)
    return _ser_solicitud(s)


# ─── Requerimientos de solicitud ───────────────────────────────────────────────

@router.put("/solicitudes/{solicitud_id}/requerimientos", summary="Actualizar requerimientos")
def actualizar_requerimientos(
    solicitud_id: int,
    requerimientos: List[RequerimientoIn],
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    """Reemplaza todos los requerimientos de la solicitud. Responsable o solicitante (si PENDIENTE)."""
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")

    es_solicitante = (s.solicitante_id == user.id and s.estado == EstadoSolicitud.PENDIENTE)
    puede_admin    = _puede_gestionar(s.espacio, user, db)
    if not es_solicitante and not puede_admin:
        raise HTTPException(403, "Sin permiso para editar requerimientos")

    # Eliminar actuales
    db.query(RequerimientoSolicitud).filter(
        RequerimientoSolicitud.solicitud_id == solicitud_id
    ).delete()

    for req in requerimientos:
        db.add(RequerimientoSolicitud(
            solicitud_id = solicitud_id,
            tipo         = req.tipo,
            descripcion  = req.descripcion,
            cantidad     = req.cantidad,
            requerido    = req.requerido,
        ))
    db.commit()
    db.refresh(s)
    return _ser_solicitud(s)


@router.post("/verificar-eventos", summary="Generar recordatorios operativos de salas")
def verificar_eventos_espacios(
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """
    Revisa eventos aprobados:
    - 15 min antes del cierre: recuerda al solicitante respetar horario y cerrar.
    - Despues del cierre sin finalizar: avisa a solicitante y responsables/apoyos.
    La deduplicacion se basa en tipo + url + ventana de horas.
    """
    ahora = _utcnow()
    generadas = 0

    def dt_solicitud(s: SolicitudEspacio, hm: str) -> datetime.datetime:
        h, m = hm.split(":")
        return datetime.datetime.combine(s.fecha, datetime.time(int(h), int(m)))

    def ya(usuario_id: int, tipo: str, url: str, horas: int = 8) -> bool:
        desde = ahora - datetime.timedelta(hours=horas)
        return db.query(Notificacion).filter(
            Notificacion.usuario_id == usuario_id,
            Notificacion.tipo == tipo,
            Notificacion.url == url,
            Notificacion.fecha >= desde,
        ).count() > 0

    aprobadas = db.query(SolicitudEspacio).filter(SolicitudEspacio.estado == EstadoSolicitud.APROBADA).all()
    for s in aprobadas:
        fin_dt = dt_solicitud(s, s.hora_fin)
        mins = int((fin_dt - ahora).total_seconds() / 60)
        url_sol = "/espacios/mis-solicitudes"
        url_admin = "/espacios/bandeja"

        if s.solicitante_id and 0 <= mins <= 15 and not ya(s.solicitante_id, "ESPACIO_POR_FINALIZAR", url_sol, horas=4):
            _notificar(
                db, s.solicitante_id,
                tipo="ESPACIO_POR_FINALIZAR",
                titulo=f"Tu evento termina en {mins} min - {s.espacio.nombre}",
                mensaje=(
                    f"Tu evento '{s.motivo}' termina a las {s.hora_fin}. "
                    "Respeta el horario o solicita extension si la necesitas."
                ),
                url=url_sol,
            )
            generadas += 1

        if fin_dt < ahora and not s.finalizado_en:
            if s.solicitante_id and not ya(s.solicitante_id, "ESPACIO_CIERRE_PENDIENTE", url_sol, horas=4):
                _notificar(
                    db, s.solicitante_id,
                    tipo="ESPACIO_CIERRE_PENDIENTE",
                    titulo=f"Cierre pendiente - {s.espacio.nombre}",
                    mensaje="Tu evento ya termino. Finaliza la solicitud y confirma el checklist de cierre.",
                    url=url_sol,
                )
                generadas += 1
            for rel in list(s.espacio.responsables or []) + list(s.espacio.apoyos or []):
                if not ya(rel.usuario_id, "ESPACIO_CIERRE_PENDIENTE", url_admin, horas=4):
                    _notificar(
                        db, rel.usuario_id,
                        tipo="ESPACIO_CIERRE_PENDIENTE",
                        titulo=f"Evento sin cierre - {s.espacio.nombre}",
                        mensaje=f"El evento '{s.motivo}' termino a las {s.hora_fin} y aun no fue cerrado por el solicitante.",
                        url=url_admin,
                    )
                    generadas += 1

    db.commit()
    return {"generadas": generadas}


# ─── Utilidad: mis espacios como responsable ───────────────────────────────────

@router.get("/mis-espacios", summary="Espacios donde soy responsable")
def mis_espacios(
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    """Útil para saber si el usuario tiene bandeja de aprobación disponible."""
    if user.rol == RolUsuario.SUPER_ADMIN:
        espacios = db.query(EspacioInstitucional).filter(
            EspacioInstitucional.activo == True
        ).all()
    else:
        relaciones = db.query(EspacioResponsable).filter(
            EspacioResponsable.usuario_id == user.id
        ).all()
        ids = [r.espacio_id for r in relaciones]
        espacios = db.query(EspacioInstitucional).filter(
            EspacioInstitucional.id.in_(ids)
        ).all() if ids else []

    return [_ser_espacio(e) for e in espacios]
