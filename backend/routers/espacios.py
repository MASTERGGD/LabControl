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
    EspacioInstitucional, EspacioResponsable,
    EstadoSolicitud, SolicitudEspacio, RequerimientoSolicitud,
    TipoEspacio, TipoRequerimiento,
)
from models.notificacion import Notificacion
from models.usuario import RolUsuario, Usuario
from services.auditoria import Accion, Recurso, registrar

router = APIRouter(prefix="/espacios", tags=["Espacios"])


# ─── Utilidades de tiempo ───────────────────────────────────────────────────────

def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _hm_to_min(hhmm: str) -> int:
    """Convierte "HH:MM" a minutos desde medianoche."""
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


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
    ini = _hm_to_min(hora_inicio)
    fin = _hm_to_min(hora_fin)

    q = db.query(SolicitudEspacio).filter(
        SolicitudEspacio.espacio_id == espacio_id,
        SolicitudEspacio.fecha == fecha,
        SolicitudEspacio.estado == EstadoSolicitud.APROBADA,
    )
    if excluir_id:
        q = q.filter(SolicitudEspacio.id != excluir_id)

    for s in q.all():
        s_ini = _hm_to_min(s.hora_inicio)
        s_fin = _hm_to_min(s.hora_fin)
        if ini < s_fin and fin > s_ini:
            return True
    return False


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
    n = Notificacion(usuario_id=usuario_id, tipo=tipo, titulo=titulo, mensaje=mensaje, url=url)
    db.add(n)


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


class ResponsableAsignar(BaseModel):
    usuario_id: int


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
        "responsables": [_ser_responsable(r) for r in e.responsables],
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
        "creado_en":          s.creado_en.isoformat() if s.creado_en else None,
        "aprobado_por":       s.aprobado_por,
        "aprobado_por_nombre":aprobador_nombre,
        "aprobado_en":        s.aprobado_en.isoformat() if s.aprobado_en else None,
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

    # Validar conflicto con APROBADAS
    if _hay_conflicto(db, data.espacio_id, data.fecha, data.hora_inicio, data.hora_fin):
        raise HTTPException(409, "El espacio ya está reservado (APROBADO) en ese bloque horario")

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
            mensaje = f"Tu solicitud del {s.fecha} ({s.hora_inicio}–{s.hora_fin}) fue APROBADA.",
            url     = "/espacios/mis-solicitudes",
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
        db.commit()

    registrar(db, "CANCELAR_SOLICITUD_ESPACIO", "ESPACIO", usuario=user,
              recurso_id=solicitud_id, request=request)
    return _ser_solicitud(s)


@router.post("/solicitudes/{solicitud_id}/finalizar", summary="Marcar como finalizada")
def finalizar_solicitud(
    solicitud_id: int,
    request:      Request,
    db:   Session  = Depends(get_db),
    user: Usuario  = Depends(get_current_user),
):
    s = db.query(SolicitudEspacio).filter(SolicitudEspacio.id == solicitud_id).first()
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")
    if not _puede_gestionar(s.espacio, user, db):
        raise HTTPException(403, "Sin permiso")
    if s.estado != EstadoSolicitud.APROBADA:
        raise HTTPException(409, "Solo se pueden finalizar solicitudes APROBADAS")

    s.estado = EstadoSolicitud.FINALIZADA
    db.commit()

    registrar(db, "FINALIZAR_SOLICITUD_ESPACIO", "ESPACIO", usuario=user,
              recurso_id=solicitud_id, request=request)
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
