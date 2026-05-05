from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from database import get_db
from models.horario import HorarioDisponible, Reservacion, SolicitudConflicto, BloqueoSlot
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio
from dependencies import get_current_user, require_roles
from routers.notificaciones import crear_notificacion
from rls import assert_lab_write, lab_filter
import datetime

router = APIRouter(prefix="/horarios", tags=["Horarios y Reservaciones"])

# Días de la semana
DIAS = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado"}


# ─── Schemas ───────────────────────────────────────────────────────────────────

class HorarioCreate(BaseModel):
    laboratorio_id: int
    dia_semana: int = Field(..., ge=0, le=5, description="0=Lunes … 5=Sábado")
    hora_inicio: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="HH:MM")
    hora_fin: str    = Field(..., pattern=r"^\d{2}:\d{2}$", description="HH:MM")
    cuatrimestre: str = Field(..., min_length=2, max_length=20, description="Ej: ENE-ABR-2025")

class HorarioUpdate(BaseModel):
    dia_semana: Optional[int]   = Field(None, ge=0, le=5)
    hora_inicio: Optional[str]  = Field(None, pattern=r"^\d{2}:\d{2}$")
    hora_fin: Optional[str]     = Field(None, pattern=r"^\d{2}:\d{2}$")
    cuatrimestre: Optional[str] = Field(None, min_length=2, max_length=20)
    activo: Optional[bool]      = None

class HorarioBulkCreate(BaseModel):
    laboratorio_id: int
    cuatrimestre: str = Field(..., min_length=2, max_length=20)
    dias: List[int]   = Field(..., description="Lista de días: [0,1,2,3,4] = Lun-Vie")
    hora_inicio: str  = Field(..., pattern=r"^\d{2}:\d{2}$")
    hora_fin: str     = Field(..., pattern=r"^\d{2}:\d{2}$")

class ReservacionCreate(BaseModel):
    horario_id: int
    laboratorio_id: int
    docente_id: int
    materia: str  = Field(..., min_length=2, max_length=100)
    grupo: str    = Field(..., min_length=1, max_length=20)
    cuatrimestre: str = Field(..., min_length=2, max_length=20)
    observaciones: Optional[str] = None

class ReservacionUpdate(BaseModel):
    docente_id: Optional[int]       = None
    materia: Optional[str]          = Field(None, min_length=2, max_length=100)
    grupo: Optional[str]            = Field(None, min_length=1, max_length=20)
    estado: Optional[str]           = None
    observaciones: Optional[str]    = None
    docente_suplente_id: Optional[int] = None

class BloqueoCreate(BaseModel):
    motivo: str = Field(..., min_length=3, max_length=200,
                        description="Motivo del bloqueo: Reunión de academia, Mantenimiento, etc.")
    cancelar_reservacion: bool = Field(default=True,
                        description="Si hay reservación activa, cancelarla automáticamente")

class SolicitudCreate(BaseModel):
    materia: str  = Field(..., min_length=2, max_length=100, description="Materia que dará el solicitante")
    grupo:   str  = Field(..., min_length=1, max_length=20)
    motivo:  Optional[str] = None

class ConflictoResolver(BaseModel):
    decision: str           # APROBAR | RECHAZAR
    notas:    Optional[str] = None


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _serializar_horario(h: HorarioDisponible, db: Session) -> dict:
    lab = db.query(Laboratorio).filter(Laboratorio.id == h.laboratorio_id).first()

    reservacion_activa = db.query(Reservacion).filter(
        Reservacion.horario_id == h.id,
        Reservacion.estado != "CANCELADA"
    ).first()

    reservacion_data = None
    if reservacion_activa:
        docente = db.query(Usuario).filter(Usuario.id == reservacion_activa.docente_id).first()
        reservacion_data = {
            "id":             reservacion_activa.id,
            "materia":        reservacion_activa.materia,
            "grupo":          reservacion_activa.grupo,
            "docente_id":     reservacion_activa.docente_id,
            "docente_nombre": docente.nombre if docente else "—",
            "estado":         reservacion_activa.estado,
            "cuatrimestre":   reservacion_activa.cuatrimestre,
        }

    bloqueo_activo = db.query(BloqueoSlot).filter(
        BloqueoSlot.horario_id == h.id,
        BloqueoSlot.activo == True
    ).first()

    bloqueo_data = None
    if bloqueo_activo:
        creador = db.query(Usuario).filter(Usuario.id == bloqueo_activo.creado_por_id).first()
        bloqueo_data = {
            "id":             bloqueo_activo.id,
            "motivo":         bloqueo_activo.motivo,
            "creado_por":     creador.nombre if creador else "—",
            "fecha_creacion": bloqueo_activo.fecha_creacion.isoformat() if bloqueo_activo.fecha_creacion else None,
        }

    return {
        "id": h.id,
        "laboratorio_id": h.laboratorio_id,
        "laboratorio_nombre": lab.nombre if lab else None,
        "dia_semana": h.dia_semana,
        "dia_nombre": DIAS.get(h.dia_semana, ""),
        "hora_inicio": h.hora_inicio,
        "hora_fin": h.hora_fin,
        "cuatrimestre": h.cuatrimestre,
        "activo": h.activo,
        "reservado":  reservacion_activa is not None,
        "bloqueado":  bloqueo_activo is not None,
        "reservacion": reservacion_data,
        "bloqueo":     bloqueo_data,
    }

def _serializar_reservacion(r: Reservacion, db: Session) -> dict:
    docente = db.query(Usuario).filter(Usuario.id == r.docente_id).first()
    suplente = db.query(Usuario).filter(Usuario.id == r.docente_suplente_id).first() if r.docente_suplente_id else None
    lab = db.query(Laboratorio).filter(Laboratorio.id == r.laboratorio_id).first()
    horario = db.query(HorarioDisponible).filter(HorarioDisponible.id == r.horario_id).first()
    return {
        "id": r.id,
        "horario_id": r.horario_id,
        "dia_semana": horario.dia_semana if horario else None,
        "dia_nombre": DIAS.get(horario.dia_semana, "") if horario else "",
        "hora_inicio": horario.hora_inicio if horario else None,
        "hora_fin": horario.hora_fin if horario else None,
        "laboratorio_id": r.laboratorio_id,
        "laboratorio_nombre": lab.nombre if lab else None,
        "docente_id": r.docente_id,
        "docente_nombre": docente.nombre if docente else None,
        "docente_suplente_id": r.docente_suplente_id,
        "docente_suplente_nombre": suplente.nombre if suplente else None,
        "materia": r.materia,
        "grupo": r.grupo,
        "cuatrimestre": r.cuatrimestre,
        "estado": r.estado,
        "observaciones": r.observaciones,
    }

def _verificar_conflicto(
    db: Session,
    horario_id: int,
    laboratorio_id: int,
    cuatrimestre: str,
    excluir_id: Optional[int] = None
):
    """Verifica que el slot no esté ya reservado en ese cuatrimestre."""
    q = db.query(Reservacion).filter(
        Reservacion.horario_id == horario_id,
        Reservacion.laboratorio_id == laboratorio_id,
        Reservacion.cuatrimestre == cuatrimestre,
        Reservacion.estado != "CANCELADA",
    )
    if excluir_id:
        q = q.filter(Reservacion.id != excluir_id)
    if q.first():
        raise HTTPException(status_code=409, detail="Ese horario ya tiene una reservación activa en este cuatrimestre")


# ─── Horarios disponibles ──────────────────────────────────────────────────────

@router.get("", summary="Listar horarios disponibles")
def listar_horarios(
    laboratorio_id: Optional[int] = None,
    cuatrimestre: Optional[str]   = None,
    dia_semana: Optional[int]     = None,
    solo_activos: bool = True,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(HorarioDisponible)
    if solo_activos:
        q = q.filter(HorarioDisponible.activo == True)
    if laboratorio_id:
        q = q.filter(HorarioDisponible.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(HorarioDisponible.laboratorio_id == current_user.laboratorio_id)
    if cuatrimestre:
        q = q.filter(HorarioDisponible.cuatrimestre == cuatrimestre)
    if dia_semana is not None:
        q = q.filter(HorarioDisponible.dia_semana == dia_semana)

    horarios = q.order_by(
        HorarioDisponible.laboratorio_id,
        HorarioDisponible.dia_semana,
        HorarioDisponible.hora_inicio
    ).all()
    return [_serializar_horario(h, db) for h in horarios]


@router.post("", status_code=status.HTTP_201_CREATED, summary="Crear horario disponible")
def crear_horario(
    data: HorarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    # RLS: LAB_ADMIN solo puede crear slots en su propio laboratorio
    assert_lab_write(data.laboratorio_id, current_user)

    if not db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id, Laboratorio.activo == True).first():
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")

    # Verificar duplicado
    dup = db.query(HorarioDisponible).filter(
        HorarioDisponible.laboratorio_id == data.laboratorio_id,
        HorarioDisponible.dia_semana == data.dia_semana,
        HorarioDisponible.hora_inicio == data.hora_inicio,
        HorarioDisponible.cuatrimestre == data.cuatrimestre,
        HorarioDisponible.activo == True,
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Ya existe ese horario para este laboratorio y cuatrimestre")

    h = HorarioDisponible(**data.model_dump())
    db.add(h)
    db.commit()
    db.refresh(h)
    return _serializar_horario(h, db)


@router.post("/bulk", status_code=status.HTTP_201_CREATED, summary="Carga masiva de horarios")
def bulk_horarios(
    data: HorarioBulkCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    """
    Crea el mismo bloque horario para varios días de la semana de una vez.
    Útil para cargar toda la disponibilidad del cuatrimestre.
    Omite duplicados silenciosamente.
    """
    # RLS: LAB_ADMIN solo puede crear slots en su propio laboratorio
    assert_lab_write(data.laboratorio_id, current_user)

    if not db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id, Laboratorio.activo == True).first():
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")

    creados = []
    omitidos = []
    for dia in data.dias:
        dup = db.query(HorarioDisponible).filter(
            HorarioDisponible.laboratorio_id == data.laboratorio_id,
            HorarioDisponible.dia_semana == dia,
            HorarioDisponible.hora_inicio == data.hora_inicio,
            HorarioDisponible.cuatrimestre == data.cuatrimestre,
            HorarioDisponible.activo == True,
        ).first()
        if dup:
            omitidos.append(DIAS[dia])
            continue
        h = HorarioDisponible(
            laboratorio_id=data.laboratorio_id,
            dia_semana=dia,
            hora_inicio=data.hora_inicio,
            hora_fin=data.hora_fin,
            cuatrimestre=data.cuatrimestre,
            activo=True,
        )
        db.add(h)
        creados.append(DIAS[dia])

    db.commit()
    return {
        "creados": len(creados),
        "omitidos": len(omitidos),
        "dias_creados": creados,
        "dias_omitidos": omitidos,
    }


# ─── Períodos estándar UTECAN ─────────────────────────────────────────────────

# Mapa oficial de períodos académicos UTECAN (sin receso 9:45-10:15)
PERIODOS_UTECAN = [
    ("08:00", "09:00"),   # Período 1
    ("09:00", "09:45"),   # Período 2
    ("10:15", "11:00"),   # Período 3  (receso 9:45–10:15)
    ("11:00", "12:00"),   # Período 4
    ("12:00", "13:00"),   # Período 5
    ("13:00", "14:00"),   # Período 6
    ("14:00", "15:00"),   # Período 7
    ("15:00", "16:00"),   # Período 8
]

class PeriodosUtecanCreate(BaseModel):
    laboratorio_id: int
    cuatrimestre:   str  = Field(..., min_length=2, max_length=20)
    dias:           List[int] = Field(..., description="0=Lunes…5=Sábado")

@router.post("/periodos-utecan", status_code=status.HTTP_201_CREATED,
             summary="Carga todos los períodos UTECAN para los días indicados")
def cargar_periodos_utecan(
    data: PeriodosUtecanCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    """
    Crea los 8 períodos académicos estándar de UTECAN para cada día seleccionado.
    Omite los que ya existen.
    """
    if not db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id, Laboratorio.activo == True).first():
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")

    creados = 0
    omitidos = 0
    for dia in data.dias:
        for inicio, fin in PERIODOS_UTECAN:
            dup = db.query(HorarioDisponible).filter(
                HorarioDisponible.laboratorio_id == data.laboratorio_id,
                HorarioDisponible.dia_semana == dia,
                HorarioDisponible.hora_inicio == inicio,
                HorarioDisponible.cuatrimestre == data.cuatrimestre,
                HorarioDisponible.activo == True,
            ).first()
            if dup:
                omitidos += 1
                continue
            h = HorarioDisponible(
                laboratorio_id=data.laboratorio_id,
                dia_semana=dia,
                hora_inicio=inicio,
                hora_fin=fin,
                cuatrimestre=data.cuatrimestre,
                activo=True,
            )
            db.add(h)
            creados += 1

    db.commit()
    return {
        "creados":  creados,
        "omitidos": omitidos,
        "periodos": [{"inicio": i, "fin": f} for i, f in PERIODOS_UTECAN],
    }


@router.put("/{horario_id}", summary="Editar horario")
def editar_horario(
    horario_id: int,
    data: HorarioUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    h = db.query(HorarioDisponible).filter(HorarioDisponible.id == horario_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Horario no encontrado")

    for campo, valor in data.model_dump(exclude_none=True).items():
        setattr(h, campo, valor)
    db.commit()
    db.refresh(h)
    return _serializar_horario(h, db)


@router.delete("/{horario_id}", summary="Desactivar horario")
def desactivar_horario(
    horario_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    h = db.query(HorarioDisponible).filter(HorarioDisponible.id == horario_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Horario no encontrado")
    reservado = db.query(Reservacion).filter(
        Reservacion.horario_id == horario_id,
        Reservacion.estado != "CANCELADA"
    ).first()
    if reservado:
        raise HTTPException(status_code=409, detail="No se puede desactivar: el horario tiene reservaciones activas")
    h.activo = False
    db.commit()
    return {"mensaje": "Horario desactivado"}


# ─── Vista de disponibilidad semanal ──────────────────────────────────────────

@router.get("/disponibilidad", summary="Vista semanal de disponibilidad con contexto del usuario")
def disponibilidad(
    laboratorio_id: int,
    cuatrimestre: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Cuadrícula semanal con estado personalizado por usuario:
    LIBRE | MIO | OCUPADO | EN_DISPUTA | YO_SOLICITE
    """
    horarios = db.query(HorarioDisponible).filter(
        HorarioDisponible.laboratorio_id == laboratorio_id,
        HorarioDisponible.cuatrimestre == cuatrimestre,
        HorarioDisponible.activo == True,
    ).order_by(HorarioDisponible.dia_semana, HorarioDisponible.hora_inicio).all()

    slots = []
    for h in horarios:
        reservacion = db.query(Reservacion).filter(
            Reservacion.horario_id == h.id,
            Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA"]),
        ).first()

        mi_solicitud  = None
        solicitudes_n = 0

        if reservacion:
            solic_activas = db.query(SolicitudConflicto).filter(
                SolicitudConflicto.reservacion_id == reservacion.id,
                SolicitudConflicto.estado == "PENDIENTE",
            ).all()
            solicitudes_n = len(solic_activas)
            mi_s = next((s for s in solic_activas if s.solicitante_id == current_user.id), None)
            if mi_s:
                mi_solicitud = {"id": mi_s.id, "estado": mi_s.estado, "motivo": mi_s.motivo}

        # Verificar bloqueo institucional
        bloqueo = db.query(BloqueoSlot).filter(
            BloqueoSlot.horario_id == h.id,
            BloqueoSlot.activo == True
        ).first()

        # Estado desde el punto de vista del usuario actual
        if bloqueo:
            estado_vista = "BLOQUEADO"
        elif not reservacion:
            estado_vista = "LIBRE"
        elif reservacion.docente_id == current_user.id:
            estado_vista = "MIO"
        elif mi_solicitud:
            estado_vista = "YO_SOLICITE"
        elif solicitudes_n > 0:
            estado_vista = "EN_DISPUTA"
        else:
            estado_vista = "OCUPADO"

        slot = {
            "horario_id":     h.id,
            "dia_semana":     h.dia_semana,
            "dia_nombre":     DIAS[h.dia_semana],
            "hora_inicio":    h.hora_inicio,
            "hora_fin":       h.hora_fin,
            "estado_vista":   estado_vista,
            "solicitudes_n":  solicitudes_n,
            "mi_solicitud":   mi_solicitud,
            "reservacion":    None,
            "bloqueo":        None,
        }

        if bloqueo:
            creador = db.query(Usuario).filter(Usuario.id == bloqueo.creado_por_id).first()
            slot["bloqueo"] = {
                "id":         bloqueo.id,
                "motivo":     bloqueo.motivo,
                "creado_por": creador.nombre if creador else "—",
            }

        if reservacion:
            docente = db.query(Usuario).filter(Usuario.id == reservacion.docente_id).first()
            lab_res = db.query(Laboratorio).filter(Laboratorio.id == reservacion.laboratorio_id).first()
            slot["reservacion"] = {
                "id":                 reservacion.id,
                "materia":            reservacion.materia,
                "grupo":              reservacion.grupo,
                "cuatrimestre":       reservacion.cuatrimestre,
                "docente_id":         reservacion.docente_id,
                "docente_nombre":     docente.nombre if docente else "—",
                "estado":             reservacion.estado,
                "laboratorio_id":     reservacion.laboratorio_id,
                "laboratorio_nombre": lab_res.nombre if lab_res else "—",
            }

        slots.append(slot)

    return {"laboratorio_id": laboratorio_id, "cuatrimestre": cuatrimestre, "slots": slots}


# ─── Reservaciones ─────────────────────────────────────────────────────────────

@router.get("/reservaciones", summary="Listar reservaciones")
def listar_reservaciones(
    laboratorio_id: Optional[int] = None,
    cuatrimestre: Optional[str]   = None,
    docente_id: Optional[int]     = None,
    estado: Optional[str]         = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(Reservacion)
    if laboratorio_id:
        q = q.filter(Reservacion.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(Reservacion.laboratorio_id == current_user.laboratorio_id)
    if cuatrimestre:
        q = q.filter(Reservacion.cuatrimestre == cuatrimestre)
    if docente_id:
        q = q.filter(Reservacion.docente_id == docente_id)
    elif current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(Reservacion.docente_id == current_user.id)
    if estado:
        q = q.filter(Reservacion.estado == estado)

    reservaciones = q.order_by(Reservacion.id.desc()).all()
    return [_serializar_reservacion(r, db) for r in reservaciones]


@router.post("/reservaciones", status_code=status.HTTP_201_CREATED, summary="Crear reservación")
def crear_reservacion(
    data: ReservacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    # Solo SUPER_ADMIN, LAB_ADMIN y DOCENTE pueden reservar
    if current_user.rol == RolUsuario.ALUMNO:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    horario = db.query(HorarioDisponible).filter(
        HorarioDisponible.id == data.horario_id,
        HorarioDisponible.activo == True
    ).first()
    if not horario:
        raise HTTPException(status_code=404, detail="Horario no encontrado o inactivo")

    _verificar_conflicto(db, data.horario_id, data.laboratorio_id, data.cuatrimestre)

    r = Reservacion(
        **data.model_dump(),
        estado="PROGRAMADA",
        creado_por=current_user.id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _serializar_reservacion(r, db)


@router.put("/reservaciones/{reservacion_id}", summary="Editar reservación")
def editar_reservacion(
    reservacion_id: int,
    data: ReservacionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    r = db.query(Reservacion).filter(Reservacion.id == reservacion_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reservación no encontrada")

    # El docente solo puede editar sus propias reservaciones
    if current_user.rol == RolUsuario.DOCENTE and r.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No puedes editar una reservación que no es tuya")

    for campo, valor in data.model_dump(exclude_none=True).items():
        setattr(r, campo, valor)
    db.commit()
    db.refresh(r)
    return _serializar_reservacion(r, db)


@router.delete("/reservaciones/{reservacion_id}", summary="Cancelar reservación")
def cancelar_reservacion(
    reservacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    r = db.query(Reservacion).filter(Reservacion.id == reservacion_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reservación no encontrada")
    if current_user.rol == RolUsuario.DOCENTE and r.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No puedes cancelar una reservación que no es tuya")

    r.estado = "CANCELADA"
    # Si había solicitudes de conflicto, rechazarlas automáticamente
    db.query(SolicitudConflicto).filter(
        SolicitudConflicto.reservacion_id == r.id,
        SolicitudConflicto.estado == "PENDIENTE"
    ).update({"estado": "RECHAZADA", "resolucion_notas": "Reservación cancelada por el docente original"})
    db.commit()
    return {"mensaje": "Reservación cancelada"}


# ─── Solicitudes de Conflicto ──────────────────────────────────────────────────

@router.post("/reservaciones/{reservacion_id}/solicitar",
             status_code=status.HTTP_201_CREATED,
             summary="Solicitar un slot ocupado (conflicto)")
def solicitar_slot(
    reservacion_id: int,
    data: SolicitudCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Docente B solicita un horario ya ocupado por Docente A.
    Crea un SolicitudConflicto y marca la reservación como EN_DISPUTA.
    """
    if current_user.rol == RolUsuario.ALUMNO:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    r = db.query(Reservacion).filter(
        Reservacion.id == reservacion_id,
        Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA"])
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reservación no encontrada o inactiva")
    if r.docente_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes solicitar tu propio horario")

    # Verificar que no tenga ya una solicitud activa para este slot
    ya_existe = db.query(SolicitudConflicto).filter(
        SolicitudConflicto.reservacion_id == reservacion_id,
        SolicitudConflicto.solicitante_id == current_user.id,
        SolicitudConflicto.estado == "PENDIENTE",
    ).first()
    if ya_existe:
        raise HTTPException(status_code=409, detail="Ya tienes una solicitud activa para este horario")

    solicitud = SolicitudConflicto(
        reservacion_id = reservacion_id,
        solicitante_id = current_user.id,
        materia        = data.materia,
        grupo          = data.grupo,
        motivo         = data.motivo,
        estado         = "PENDIENTE",
    )
    db.add(solicitud)

    # Marcar reservación como EN_DISPUTA
    r.estado = "EN_DISPUTA"
    db.commit()
    db.refresh(solicitud)

    # ── Notificar a los admins del laboratorio ───────────────────────────────
    try:
        lab = db.query(Laboratorio).filter(Laboratorio.id == r.laboratorio_id).first()
        lab_nombre = lab.nombre if lab else f"Lab {r.laboratorio_id}"

        # Día y hora del horario solicitado
        horario = db.query(HorarioDisponible).filter(HorarioDisponible.id == r.horario_id).first()
        slot_txt = ""
        if horario:
            dia_nombre = DIAS.get(horario.dia_semana, f"Día {horario.dia_semana}")
            slot_txt = f"{dia_nombre} {horario.hora_inicio}–{horario.hora_fin}"

        # Buscar admins del lab + SUPER_ADMIN
        admins = db.query(Usuario).filter(
            Usuario.laboratorio_id == r.laboratorio_id,
            Usuario.rol == RolUsuario.LAB_ADMIN,
        ).all()
        super_admins = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).all()
        destinatarios = {u.id: u for u in admins + super_admins}.values()

        for adm in destinatarios:
            crear_notificacion(
                db, adm.id,
                tipo="RESERVACION",
                titulo=f"Nueva solicitud de horario — {lab_nombre}",
                mensaje=(
                    f"El docente {current_user.nombre} solicita el slot "
                    f"{slot_txt} para '{data.materia}' (grupo {data.grupo}). "
                    f"{'Motivo: ' + data.motivo if data.motivo else ''} "
                    f"Pendiente de tu resolución."
                ),
                url="/admin/horarios",
            )
        db.commit()
    except Exception:
        pass  # nunca bloquear la respuesta principal

    return {
        "id":              solicitud.id,
        "reservacion_id":  solicitud.reservacion_id,
        "estado":          solicitud.estado,
        "mensaje":         "Solicitud enviada. El administrador del laboratorio recibirá una notificación.",
    }


@router.delete("/reservaciones/{reservacion_id}/solicitar", summary="Retirar solicitud de conflicto")
def retirar_solicitud(
    reservacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """El docente retira su solicitud de conflicto."""
    s = db.query(SolicitudConflicto).filter(
        SolicitudConflicto.reservacion_id == reservacion_id,
        SolicitudConflicto.solicitante_id == current_user.id,
        SolicitudConflicto.estado == "PENDIENTE",
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="No tienes una solicitud activa para este horario")

    s.estado = "RECHAZADA"
    s.resolucion_notas = "Retirada por el solicitante"

    # Si no quedan más solicitudes pendientes, volver la reservación a PROGRAMADA
    otras = db.query(SolicitudConflicto).filter(
        SolicitudConflicto.reservacion_id == reservacion_id,
        SolicitudConflicto.estado == "PENDIENTE",
        SolicitudConflicto.id != s.id,
    ).count()
    if otras == 0:
        r = db.query(Reservacion).filter(Reservacion.id == reservacion_id).first()
        if r:
            r.estado = "PROGRAMADA"

    db.commit()
    return {"mensaje": "Solicitud retirada"}


# ─── Conflictos (vista del administrador) ─────────────────────────────────────

@router.get("/conflictos", summary="Conflictos pendientes — solo admins")
def listar_conflictos(
    laboratorio_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    q = db.query(SolicitudConflicto).filter(SolicitudConflicto.estado == "PENDIENTE")

    # Filtrar por laboratorio si aplica
    if laboratorio_id:
        q = q.join(Reservacion).join(HorarioDisponible).filter(
            HorarioDisponible.laboratorio_id == laboratorio_id
        )
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.join(Reservacion).join(HorarioDisponible).filter(
            HorarioDisponible.laboratorio_id == current_user.laboratorio_id
        )

    solicitudes = q.order_by(SolicitudConflicto.fecha_solicitud.desc()).all()

    resultado = []
    for s in solicitudes:
        r    = db.query(Reservacion).filter(Reservacion.id == s.reservacion_id).first()
        h    = db.query(HorarioDisponible).filter(HorarioDisponible.id == r.horario_id).first() if r else None
        lab  = db.query(Laboratorio).filter(Laboratorio.id == h.laboratorio_id).first() if h else None
        doc_original  = db.query(Usuario).filter(Usuario.id == r.docente_id).first() if r else None
        doc_solicitante = db.query(Usuario).filter(Usuario.id == s.solicitante_id).first()

        resultado.append({
            "solicitud_id":    s.id,
            "reservacion_id":  s.reservacion_id,
            "dia_nombre":      DIAS.get(h.dia_semana, "") if h else "",
            "hora_inicio":     h.hora_inicio if h else "",
            "hora_fin":        h.hora_fin if h else "",
            "laboratorio":     lab.nombre if lab else "",
            "laboratorio_id":  lab.id if lab else None,
            # Docente original (dueño del slot)
            "docente_original_id":     r.docente_id if r else None,
            "docente_original_nombre": doc_original.nombre if doc_original else "—",
            "materia_original":        r.materia if r else "",
            "grupo_original":          r.grupo if r else "",
            # Docente solicitante (quiere el slot)
            "solicitante_id":      s.solicitante_id,
            "solicitante_nombre":  doc_solicitante.nombre if doc_solicitante else "—",
            "materia_solicitada":  s.materia,
            "grupo_solicitado":    s.grupo,
            "motivo":              s.motivo,
            "fecha_solicitud":     s.fecha_solicitud.isoformat() if s.fecha_solicitud else None,
        })

    return resultado


@router.put("/conflictos/{solicitud_id}/resolver", summary="Resolver conflicto — solo admins")
def resolver_conflicto(
    solicitud_id: int,
    data: ConflictoResolver,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    """
    decision=APROBAR → transfiere el slot al solicitante, rechaza las demás solicitudes.
    decision=RECHAZAR → mantiene al docente original, rechaza esta solicitud.
    """
    if data.decision.upper() not in ("APROBAR", "RECHAZAR"):
        raise HTTPException(status_code=422, detail="decision debe ser APROBAR o RECHAZAR")

    s = db.query(SolicitudConflicto).filter(SolicitudConflicto.id == solicitud_id).first()
    if not s or s.estado != "PENDIENTE":
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o ya resuelta")

    r = db.query(Reservacion).filter(Reservacion.id == s.reservacion_id).first()
    ahora = datetime.datetime.utcnow()

    if data.decision.upper() == "APROBAR":
        # Transferir el slot al solicitante
        r.docente_id  = s.solicitante_id
        r.materia     = s.materia
        r.grupo       = s.grupo
        r.estado      = "PROGRAMADA"
        r.observaciones = f"Transferido por admin. Motivo: {data.notas or 'Sin nota'}"

        # Marcar esta solicitud como aprobada
        s.estado           = "APROBADA"
        s.resolucion_notas = data.notas
        s.resuelto_por_id  = current_user.id
        s.fecha_resolucion = ahora

        # Rechazar todas las demás solicitudes pendientes para esta reservación
        db.query(SolicitudConflicto).filter(
            SolicitudConflicto.reservacion_id == r.id,
            SolicitudConflicto.estado == "PENDIENTE",
            SolicitudConflicto.id != solicitud_id,
        ).update({
            "estado":           "RECHAZADA",
            "resolucion_notas": "Slot asignado a otro docente",
            "resuelto_por_id":  current_user.id,
            "fecha_resolucion": ahora,
        })
        mensaje = f"Slot transferido a {s.solicitante_id}. Las demás solicitudes fueron rechazadas."

    else:  # RECHAZAR
        s.estado           = "RECHAZADA"
        s.resolucion_notas = data.notas
        s.resuelto_por_id  = current_user.id
        s.fecha_resolucion = ahora

        # Si no quedan más solicitudes, volver reservación a PROGRAMADA
        otras_pendientes = db.query(SolicitudConflicto).filter(
            SolicitudConflicto.reservacion_id == r.id,
            SolicitudConflicto.estado == "PENDIENTE",
            SolicitudConflicto.id != solicitud_id,
        ).count()
        if otras_pendientes == 0:
            r.estado = "PROGRAMADA"

        mensaje = "Solicitud rechazada. El slot permanece con el docente original."

    db.commit()

    # ── Notificar al docente solicitante del resultado ───────────────────────
    try:
        aprobado = data.decision.upper() == "APROBAR"
        crear_notificacion(
            db,
            usuario_id=s.solicitante_id,
            tipo="RESERVACION",
            titulo="Solicitud de horario " + ("aprobada ✅" if aprobado else "rechazada ❌"),
            mensaje=(
                f"Tu solicitud para {r.materia} (grupo {r.grupo}) fue "
                + ("APROBADA. El slot es tuyo." if aprobado
                   else f"RECHAZADA. {data.notas or 'Sin notas adicionales.'}")
            ),
            url="/docente/horarios",
        )
        db.commit()
    except Exception:
        pass  # nunca bloquear la respuesta principal por la notificación

    return {"mensaje": mensaje, "decision": data.decision.upper()}


# ─── Bloqueos Institucionales (solo SUPER_ADMIN) ───────────────────────────────

@router.post("/horarios/{horario_id}/bloquear",
             status_code=201,
             summary="Bloquear un slot — solo admins")
def bloquear_slot(
    horario_id: int,
    data: BloqueoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    """Crea un bloqueo institucional. Si hay reservación activa y cancelar_reservacion=True, la cancela."""
    h = db.query(HorarioDisponible).filter(HorarioDisponible.id == horario_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Horario no encontrado")

    db.query(BloqueoSlot).filter(
        BloqueoSlot.horario_id == horario_id,
        BloqueoSlot.activo == True,
    ).update({"activo": False})

    bloqueo = BloqueoSlot(
        horario_id    = horario_id,
        motivo        = data.motivo,
        creado_por_id = current_user.id,
    )
    db.add(bloqueo)

    cancelada = None
    if data.cancelar_reservacion:
        r = db.query(Reservacion).filter(
            Reservacion.horario_id == horario_id,
            Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA"]),
        ).first()
        if r:
            r.estado = "CANCELADA"
            cancelada = r.id

    db.commit()
    return {
        "bloqueo_id": bloqueo.id,
        "reservacion_cancelada_id": cancelada,
        "mensaje": f"Slot bloqueado: {data.motivo}",
    }


@router.delete("/horarios/{horario_id}/bloquear",
               summary="Desbloquear un slot — solo admins")
def desbloquear_slot(
    horario_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    updated = db.query(BloqueoSlot).filter(
        BloqueoSlot.horario_id == horario_id,
        BloqueoSlot.activo == True,
    ).update({"activo": False})
    db.commit()
    return {"desbloqueados": updated}
