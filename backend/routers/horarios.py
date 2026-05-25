from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from database import get_db
from models.horario import HorarioDisponible, Reservacion, SolicitudConflicto, BloqueoSlot, RequerimientoClase
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio
from dependencies import get_current_user, require_roles
from routers.notificaciones import crear_notificacion
from services.auditoria import registrar, Accion, Recurso
from rls import assert_lab_write, lab_filter
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


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
    carrera: Optional[str] = Field(None, max_length=120,
        description="Carrera a la que pertenece la materia")
    cuatrimestre: str = Field(..., min_length=2, max_length=20,
        description="Período escolar, ej. ENE-ABR-2025")
    cuatrimestre_materia: Optional[str] = Field(None, max_length=20,
        description="Cuatrimestre de la materia (1–12)")
    grupo: str    = Field(..., min_length=1, max_length=20)
    observaciones: Optional[str] = None
    # Requerimientos embebidos (se crean automáticamente si existen)
    req_items:           Optional[List[str]] = None
    req_descripcion:     Optional[str]       = None
    req_tiene_instalador: Optional[bool]     = False

class ReservacionUpdate(BaseModel):
    docente_id: Optional[int]       = None
    materia: Optional[str]          = Field(None, min_length=2, max_length=100)
    carrera: Optional[str]          = Field(None, max_length=120)
    cuatrimestre_materia: Optional[str] = Field(None, max_length=20)
    grupo: Optional[str]            = Field(None, min_length=1, max_length=20)
    estado: Optional[str]           = None
    observaciones: Optional[str]    = None
    docente_suplente_id: Optional[int] = None

class RequerimientoResolverSchema(BaseModel):
    estado:     str            # CONFIRMADO | RECHAZADO | DOCENTE_PROVEE
    nota_admin: Optional[str]  = None

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
        Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA", "EN_CURSO"])
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

ESTADO_REQ_LABEL = {
    "PENDIENTE":      "Pendiente de revisión",
    "CONFIRMADO":     "Confirmado por el laboratorio",
    "RECHAZADO":      "No se puede atender",
    "DOCENTE_PROVEE": "El docente provee el instalador",
}

def _serializar_requerimiento(req: RequerimientoClase) -> dict:
    import json
    items = []
    try:
        items = json.loads(req.items) if req.items else []
    except Exception:
        pass
    return {
        "id":               req.id,
        "items":            items,
        "descripcion":      req.descripcion,
        "tiene_instalador": req.tiene_instalador,
        "urgente":          req.urgente,
        "dias_anticipacion": req.dias_anticipacion,
        "estado":           req.estado,
        "estado_label":     ESTADO_REQ_LABEL.get(req.estado, req.estado),
        "nota_admin":       req.nota_admin,
        "creado_en":        req.creado_en.isoformat() if req.creado_en else None,
        "resuelto_en":      req.resuelto_en.isoformat() if req.resuelto_en else None,
    }

def _calcular_urgencia(horario: HorarioDisponible) -> tuple[bool, int]:
    """Calcula si el requerimiento es urgente (< 3 días hábiles)."""
    hoy = datetime.date.today()
    dia_semana_slot = horario.dia_semana  # 0=Lun, 5=Sab
    # Próxima ocurrencia del día de la semana
    dias_hasta = (dia_semana_slot - hoy.weekday()) % 7
    if dias_hasta == 0:
        dias_hasta = 7  # ya pasó hoy, próxima semana
    fecha_clase = hoy + datetime.timedelta(days=dias_hasta)
    dias_habiles = sum(
        1 for i in range((fecha_clase - hoy).days)
        if (hoy + datetime.timedelta(days=i+1)).weekday() < 5
    )
    return dias_habiles < 3, dias_habiles

def _identidad_label(materia: str, carrera: str, cuat_mat: str, grupo: str) -> str:
    """Construye la etiqueta de identidad académica de una sesión/reservación."""
    partes = [materia or "—"]
    if carrera:
        partes.append(carrera)
    if cuat_mat:
        partes.append(f"{cuat_mat}er cuatrimestre" if cuat_mat == "3"
                      else f"{cuat_mat}° cuatrimestre")
    if grupo:
        partes.append(f"Grupo {grupo}")
    return " · ".join(partes)


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
        "materia":              r.materia,
        "carrera":              r.carrera,
        "cuatrimestre":         r.cuatrimestre,
        "cuatrimestre_materia": r.cuatrimestre_materia,
        "grupo":                r.grupo,
        "identidad_academica":  _identidad_label(r.materia, r.carrera, r.cuatrimestre_materia, r.grupo),
        "estado":               r.estado,
        "observaciones":        r.observaciones,
        "requerimiento":        _serializar_requerimiento(r.requerimiento) if r.requerimiento else None,
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
        Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA", "EN_CURSO"]),
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
        Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA", "EN_CURSO"])
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
            Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA", "EN_CURSO"]),
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


# ─── Solicitudes recibidas (para el docente dueño) ────────────────────────────

@router.get("/mis-solicitudes-recibidas",
            summary="Solicitudes pendientes sobre los slots propios del docente")
def mis_solicitudes_recibidas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Retorna las solicitudes pendientes de otros docentes sobre las reservaciones
    del docente actual. Permite al docente decidir ceder o rechazar.
    """
    # Reservaciones propias EN_DISPUTA
    reservaciones = db.query(Reservacion).filter(
        Reservacion.docente_id == current_user.id,
        Reservacion.estado == "EN_DISPUTA",
    ).all()

    resultado = []
    for r in reservaciones:
        solicitud = db.query(SolicitudConflicto).filter(
            SolicitudConflicto.reservacion_id == r.id,
            SolicitudConflicto.estado == "PENDIENTE",
        ).first()
        if not solicitud:
            continue

        horario     = db.query(HorarioDisponible).filter(HorarioDisponible.id == r.horario_id).first()
        solicitante = db.query(Usuario).filter(Usuario.id == solicitud.solicitante_id).first()
        lab         = db.query(Laboratorio).filter(Laboratorio.id == r.laboratorio_id).first()

        resultado.append({
            "reservacion_id":      r.id,
            "solicitud_id":        solicitud.id,
            "dia_semana":          horario.dia_semana if horario else None,
            "dia_nombre":          DIAS.get(horario.dia_semana, "") if horario else "",
            "hora_inicio":         horario.hora_inicio if horario else "",
            "hora_fin":            horario.hora_fin if horario else "",
            "laboratorio_nombre":  lab.nombre if lab else "",
            "mi_materia":          r.materia,
            "mi_grupo":            r.grupo,
            "solicitante_nombre":  solicitante.nombre if solicitante else "—",
            "materia_solicitada":  solicitud.materia,
            "grupo_solicitado":    solicitud.grupo,
            "motivo":              solicitud.motivo,
            "fecha_solicitud":     solicitud.fecha_solicitud.isoformat() if solicitud.fecha_solicitud else None,
        })

    return resultado


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

    # ── Identidad académica obligatoria ──────────────────────────────────────
    faltan = [f for f, v in [
        ("carrera",              data.carrera),
        ("cuatrimestre_materia", data.cuatrimestre_materia),
    ] if not v or not str(v).strip()]
    if faltan:
        raise HTTPException(
            status_code=422,
            detail=(
                f"La reservación requiere identidad académica completa. "
                f"Faltan: {', '.join(faltan)}. "
                f"Selecciona la materia desde el catálogo para autocompletar estos campos."
            )
        )

    horario = db.query(HorarioDisponible).filter(
        HorarioDisponible.id == data.horario_id,
        HorarioDisponible.activo == True
    ).first()
    if not horario:
        raise HTTPException(status_code=404, detail="Horario no encontrado o inactivo")

    _verificar_conflicto(db, data.horario_id, data.laboratorio_id, data.cuatrimestre)

    # Extraer campos de requerimiento antes de crear la reservación
    req_items           = data.req_items
    req_descripcion     = data.req_descripcion
    req_tiene_instalador = data.req_tiene_instalador or False

    r = Reservacion(
        horario_id=data.horario_id,
        laboratorio_id=data.laboratorio_id,
        docente_id=data.docente_id,
        materia=data.materia,
        carrera=data.carrera,
        cuatrimestre=data.cuatrimestre,
        cuatrimestre_materia=data.cuatrimestre_materia,
        grupo=data.grupo,
        observaciones=data.observaciones,
        estado="PROGRAMADA",
        creado_por=current_user.id,
    )
    db.add(r)
    db.flush()  # obtener r.id sin commit

    # Crear requerimiento si hay datos
    hay_req = (req_items and len(req_items) > 0) or (req_descripcion and req_descripcion.strip())
    if hay_req:
        import json
        urgente, dias = _calcular_urgencia(horario)
        req = RequerimientoClase(
            reservacion_id=r.id,
            items=json.dumps(req_items or []),
            descripcion=req_descripcion,
            tiene_instalador=req_tiene_instalador,
            urgente=urgente,
            dias_anticipacion=dias,
            estado="PENDIENTE",
        )
        db.add(req)

        # Notificar al LAB_ADMIN del laboratorio
        lab = db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id).first()
        admins = db.query(Usuario).filter(
            Usuario.rol == RolUsuario.LAB_ADMIN,
            Usuario.laboratorio_id == data.laboratorio_id,
            Usuario.activo == True,
        ).all()
        docente = db.query(Usuario).filter(Usuario.id == data.docente_id).first()
        desc_req = ', '.join(req_items or [])
        if req_descripcion:
            desc_req += f' — {req_descripcion}'
        urgencia_txt = ' ⚠️ URGENTE (menos de 3 días)' if urgente else ''
        for admin in admins:
            crear_notificacion(db, admin.id,
                "requerimiento",
                f"📋 Requerimiento de clase{urgencia_txt}",
                f"{docente.nombre if docente else 'Docente'} solicitó para su clase "
                f"'{data.materia}': {desc_req}."
                + (' El docente tiene el instalador.' if req_tiene_instalador else ''),
            )
        # Notificar también al SUPER_ADMIN
        super_admins = db.query(Usuario).filter(
            Usuario.rol == RolUsuario.SUPER_ADMIN, Usuario.activo == True
        ).all()
        for sa in super_admins:
            crear_notificacion(db, sa.id,
                "requerimiento",
                f"📋 Requerimiento de clase — {lab.nombre if lab else ''}",
                f"{docente.nombre if docente else 'Docente'} solicitó: {desc_req}{urgencia_txt}",
            )

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

    # ── Guardar identidad académica: no permitir borrar campos clave ──────────
    faltan = [f for f, v in [
        ("carrera",              r.carrera),
        ("cuatrimestre_materia", r.cuatrimestre_materia),
    ] if not v or not str(v).strip()]
    if faltan:
        db.rollback()
        raise HTTPException(
            status_code=422,
            detail=(
                f"No puedes dejar la reservación sin identidad académica completa. "
                f"Faltan: {', '.join(faltan)}. "
                f"Selecciona la materia desde el catálogo para autocompletar estos campos."
            )
        )

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
        Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA", "EN_CURSO"])
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reservación no encontrada o inactiva")
    if r.docente_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes solicitar tu propio horario")

    # Verificar que no tenga ya una solicitud activa para este slot (yo mismo)
    ya_existe = db.query(SolicitudConflicto).filter(
        SolicitudConflicto.reservacion_id == reservacion_id,
        SolicitudConflicto.solicitante_id == current_user.id,
        SolicitudConflicto.estado == "PENDIENTE",
    ).first()
    if ya_existe:
        raise HTTPException(status_code=409, detail="Ya tienes una solicitud activa para este horario")

    # Política: solo 1 solicitante por slot — si ya hay uno de otro docente, bloquear
    otra_solicitud = db.query(SolicitudConflicto).filter(
        SolicitudConflicto.reservacion_id == reservacion_id,
        SolicitudConflicto.estado == "PENDIENTE",
    ).first()
    if otra_solicitud:
        raise HTTPException(
            status_code=409,
            detail="Ya hay un docente solicitando este espacio. Verifica disponibilidad en otro laboratorio."
        )

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

        # 1. Notificar al DOCENTE DUEÑO del slot (puede ceder directamente)
        docente_dueno = db.query(Usuario).filter(Usuario.id == r.docente_id).first()
        if docente_dueno:
            crear_notificacion(
                db, docente_dueno.id,
                tipo="RESERVACION",
                titulo=f"📩 Solicitud de espacio — {slot_txt}",
                mensaje=(
                    f"El docente {current_user.nombre} solicita tu horario del "
                    f"{slot_txt} para '{data.materia}' (grupo {data.grupo}). "
                    f"{'Motivo: ' + data.motivo + '. ' if data.motivo else ''}"
                    f"Puedes ceder o rechazar el espacio desde tu panel de horarios."
                ),
                url="/docente/horarios",
            )

        # 2. Notificar a los admins del laboratorio (información)
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
                titulo=f"Solicitud de horario — {lab_nombre}",
                mensaje=(
                    f"{current_user.nombre} solicita el slot {slot_txt} "
                    f"ocupado por {docente_dueno.nombre if docente_dueno else 'otro docente'}. "
                    f"El docente dueño puede ceder directamente."
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
        "mensaje":         "Solicitud enviada. El docente titular recibirá una notificación y podrá cederte el espacio.",
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


# ─── Ceder / Rechazar solicitud — acción del docente dueño ────────────────────

@router.post("/reservaciones/{reservacion_id}/ceder",
             summary="Ceder el slot al docente solicitante (acción del dueño)")
def ceder_slot(
    reservacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    El docente dueño del slot cede voluntariamente su espacio al solicitante pendiente.
    La reservación se transfiere automáticamente sin intervención del admin.
    """
    r = db.query(Reservacion).filter(
        Reservacion.id == reservacion_id,
        Reservacion.estado == "EN_DISPUTA",
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reservación no encontrada o sin solicitudes activas")

    es_admin = current_user.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN)
    if r.docente_id != current_user.id and not es_admin:
        raise HTTPException(status_code=403, detail="Solo el docente titular puede ceder este espacio")

    # Obtener la única solicitud pendiente
    solicitud = db.query(SolicitudConflicto).filter(
        SolicitudConflicto.reservacion_id == reservacion_id,
        SolicitudConflicto.estado == "PENDIENTE",
    ).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="No hay solicitudes pendientes para este slot")

    ahora = _utcnow()

    # Transferir la reservación al solicitante
    r.docente_id    = solicitud.solicitante_id
    r.materia       = solicitud.materia
    r.grupo         = solicitud.grupo
    r.estado        = "PROGRAMADA"
    r.observaciones = f"Cedido por {current_user.nombre} el {ahora.strftime('%d/%m/%Y')}"

    # Marcar solicitud como aprobada
    solicitud.estado           = "APROBADA"
    solicitud.resuelto_por_id  = current_user.id
    solicitud.fecha_resolucion = ahora
    solicitud.resolucion_notas = "Cedido directamente por el docente titular"

    db.commit()

    # Notificar al solicitante
    try:
        horario = db.query(HorarioDisponible).filter(HorarioDisponible.id == r.horario_id).first()
        slot_txt = ""
        if horario:
            dia_nombre = DIAS.get(horario.dia_semana, f"Día {horario.dia_semana}")
            slot_txt = f"{dia_nombre} {horario.hora_inicio}–{horario.hora_fin}"

        crear_notificacion(
            db,
            usuario_id=solicitud.solicitante_id,
            tipo="RESERVACION",
            titulo="✅ ¡Espacio cedido! Tu solicitud fue aprobada",
            mensaje=(
                f"El docente {current_user.nombre} cedió el slot {slot_txt}. "
                f"El horario ahora es tuyo para '{solicitud.materia}' (grupo {solicitud.grupo})."
            ),
            url="/docente/horarios",
        )
        db.commit()
    except Exception:
        pass

    return {"mensaje": "Espacio cedido exitosamente. El solicitante fue notificado."}


@router.post("/reservaciones/{reservacion_id}/rechazar-solicitud",
             summary="Rechazar la solicitud de liberación (acción del dueño)")
def rechazar_solicitud_docente(
    reservacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    El docente dueño rechaza la solicitud pendiente y conserva su espacio.
    """
    r = db.query(Reservacion).filter(
        Reservacion.id == reservacion_id,
        Reservacion.estado == "EN_DISPUTA",
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reservación no encontrada o sin solicitudes activas")
    if r.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el docente titular puede rechazar solicitudes")

    solicitud = db.query(SolicitudConflicto).filter(
        SolicitudConflicto.reservacion_id == reservacion_id,
        SolicitudConflicto.estado == "PENDIENTE",
    ).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="No hay solicitudes pendientes para este slot")

    ahora = _utcnow()
    solicitud.estado           = "RECHAZADA"
    solicitud.resuelto_por_id  = current_user.id
    solicitud.fecha_resolucion = ahora
    solicitud.resolucion_notas = "Rechazado por el docente titular"

    # Volver la reservación a PROGRAMADA
    r.estado = "PROGRAMADA"
    db.commit()

    # Notificar al solicitante
    try:
        horario = db.query(HorarioDisponible).filter(HorarioDisponible.id == r.horario_id).first()
        slot_txt = ""
        if horario:
            dia_nombre = DIAS.get(horario.dia_semana, f"Día {horario.dia_semana}")
            slot_txt = f"{dia_nombre} {horario.hora_inicio}–{horario.hora_fin}"

        crear_notificacion(
            db,
            usuario_id=solicitud.solicitante_id,
            tipo="RESERVACION",
            titulo="❌ Solicitud de horario rechazada",
            mensaje=(
                f"El docente {current_user.nombre} decidió conservar el slot {slot_txt}. "
                f"Te sugerimos revisar disponibilidad en otros laboratorios."
            ),
            url="/docente/horarios",
        )
        db.commit()
    except Exception:
        pass

    return {"mensaje": "Solicitud rechazada. El slot sigue siendo tuyo."}


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
    ahora = _utcnow()

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

@router.post("/{horario_id}/bloquear",
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
            Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA", "EN_CURSO"]),
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


@router.delete("/{horario_id}/bloquear",
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


# ─── Requerimientos de Clase ───────────────────────────────────────────────────

@router.get("/requerimientos/pendientes", summary="Listar requerimientos pendientes — admins")
def listar_requerimientos_pendientes(
    laboratorio_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    q = db.query(RequerimientoClase).filter(RequerimientoClase.estado == "PENDIENTE")
    if laboratorio_id:
        q = q.join(Reservacion).filter(Reservacion.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN and current_user.laboratorio_id:
        q = q.join(Reservacion).filter(Reservacion.laboratorio_id == current_user.laboratorio_id)

    reqs = q.order_by(RequerimientoClase.urgente.desc(), RequerimientoClase.creado_en).all()

    resultado = []
    for req in reqs:
        r = req.reservacion
        horario = r.horario if r else None
        docente = db.query(Usuario).filter(Usuario.id == r.docente_id).first() if r else None
        lab = db.query(Laboratorio).filter(Laboratorio.id == r.laboratorio_id).first() if r else None
        import json
        items = []
        try:
            items = json.loads(req.items) if req.items else []
        except Exception:
            pass
        resultado.append({
            **_serializar_requerimiento(req),
            "reservacion_id":   r.id if r else None,
            "materia":          r.materia if r else None,
            "grupo":            r.grupo if r else None,
            "docente_nombre":   docente.nombre if docente else None,
            "laboratorio_nombre": lab.nombre if lab else None,
            "dia_nombre":       ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][horario.dia_semana] if horario else None,
            "hora_inicio":      horario.hora_inicio if horario else None,
            "hora_fin":         horario.hora_fin if horario else None,
        })
    return resultado


@router.get("/requerimientos/mis", summary="Mis requerimientos — docente")
def mis_requerimientos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    mis_reservaciones = db.query(Reservacion).filter(
        Reservacion.docente_id == current_user.id
    ).all()
    ids = [r.id for r in mis_reservaciones]
    reqs = db.query(RequerimientoClase).filter(
        RequerimientoClase.reservacion_id.in_(ids)
    ).order_by(RequerimientoClase.creado_en.desc()).all()

    resultado = []
    for req in reqs:
        r = req.reservacion
        horario = r.horario if r else None
        lab = db.query(Laboratorio).filter(Laboratorio.id == r.laboratorio_id).first() if r else None
        resultado.append({
            **_serializar_requerimiento(req),
            "materia":            r.materia if r else None,
            "grupo":              r.grupo if r else None,
            "laboratorio_nombre": lab.nombre if lab else None,
            "dia_nombre":         ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][horario.dia_semana] if horario else None,
            "hora_inicio":        horario.hora_inicio if horario else None,
        })
    return resultado


@router.put("/requerimientos/{req_id}/resolver", summary="Resolver requerimiento — admins")
def resolver_requerimiento(
    req_id: int,
    data: RequerimientoResolverSchema,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    if data.estado not in ("CONFIRMADO", "RECHAZADO", "DOCENTE_PROVEE"):
        raise HTTPException(status_code=422, detail="Estado inválido")

    req = db.query(RequerimientoClase).filter(RequerimientoClase.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requerimiento no encontrado")

    req.estado          = data.estado
    req.nota_admin      = data.nota_admin
    req.resuelto_en     = _utcnow()
    req.resuelto_por_id = current_user.id
    db.commit()
    db.refresh(req)

    # Notificar al docente
    try:
        r = req.reservacion
        docente_id = r.docente_id if r else None
        if docente_id:
            emojis = {"CONFIRMADO": "✅", "RECHAZADO": "❌", "DOCENTE_PROVEE": "📦"}
            labels = ESTADO_REQ_LABEL
            msg = f"Tu requerimiento para '{r.materia}' fue {labels.get(data.estado, data.estado).lower()}."
            if data.nota_admin:
                msg += f" Nota del laboratorio: {data.nota_admin}"
            crear_notificacion(db, docente_id,
                "requerimiento",
                f"{emojis.get(data.estado,'📋')} Requerimiento de clase actualizado",
                msg,
            )
            db.commit()
    except Exception:
        pass

    return _serializar_requerimiento(req)


# ─── Marcar estado de reservación (IMPARTIDA / NO_ASISTIO / CANCELADA_TARDIA) ──

class MarcarEstadoBody(BaseModel):
    estado: str   # IMPARTIDA | NO_ASISTIO | CANCELADA_TARDIA
    motivo: Optional[str] = None

_admin_roles = require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN)

@router.post("/reservaciones/{reservacion_id}/marcar-estado",
             summary="Marcar estado de una reservación (IMPARTIDA / NO_ASISTIO / CANCELADA_TARDIA)")
def marcar_estado_reservacion(
    request: Request,
    reservacion_id: int,
    body: MarcarEstadoBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_admin_roles),
):
    """
    IMPARTIDA       → estado terminal; la reservación queda marcada como impartida (cuatrimestre concluido).
    NO_ASISTIO      → evento puntual; registra auditoría/notificación pero la reservación queda PROGRAMADA.
    CANCELADA_TARDIA → evento puntual; registra auditoría/notificación pero la reservación queda PROGRAMADA.
    """
    ESTADOS_VALIDOS = {"IMPARTIDA", "NO_ASISTIO", "CANCELADA_TARDIA"}
    if body.estado not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Opciones: {ESTADOS_VALIDOS}")

    res = db.query(Reservacion).filter(Reservacion.id == reservacion_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Reservación no encontrada")

    assert_lab_write(res.laboratorio_id, current_user)

    estado_anterior = res.estado

    if body.estado == "IMPARTIDA":
        # Estado terminal — marcar como concluida
        res.estado = "IMPARTIDA"
        db.commit()
        registrar(
            db, accion=Accion.MARCAR_RESERVACION, recurso=Recurso.RESERVACION,
            usuario=current_user, recurso_id=res.id,
            detalle={"estado_anterior": estado_anterior, "estado_nuevo": "IMPARTIDA",
                     "motivo": body.motivo, "materia": res.materia, "grupo": res.grupo},
            request=request,
        )
        # Notificar al docente
        try:
            crear_notificacion(
                db, res.docente_id,
                tipo="RESERVACION_IMPARTIDA",
                titulo="Clase marcada como impartida",
                mensaje=(
                    f"Tu reservación de {res.materia} ({res.grupo}) — {res.cuatrimestre} "
                    f"ha sido marcada como IMPARTIDA."
                    + (f" Nota: {body.motivo}" if body.motivo else "")
                ),
                url="/docente/reservaciones",
            )
            db.commit()
        except Exception:
            pass
        # Registrar evento de cumplimiento IMPARTIDA (manual por admin)
        from models.cumplimiento import EventoCumplimiento as _EC
        import datetime as _dt
        _ec = _EC(
            reservacion_id    = reservacion_id,
            sesion_id         = None,
            tipo              = "IMPARTIDA",
            fecha             = _dt.datetime.now(_dt.timezone.utc).date(),
            motivo            = body.motivo,
            registrado_por_id = current_user.id,
        )
        db.add(_ec)
        db.commit()
        return {"mensaje": "Reservación marcada como IMPARTIDA", "estado": res.estado}

    # NO_ASISTIO o CANCELADA_TARDIA — eventos puntuales, la reservación queda PROGRAMADA
    # (no se cambia res.estado)
    etiqueta = "no asistió" if body.estado == "NO_ASISTIO" else "canceló con poca anticipación"
    registrar(
        db, accion=Accion.MARCAR_RESERVACION, recurso=Recurso.RESERVACION,
        usuario=current_user, recurso_id=res.id,
        detalle={"evento": body.estado, "estado_reservacion": res.estado,
                 "motivo": body.motivo, "materia": res.materia, "grupo": res.grupo},
        request=request,
    )
    # Notificar admins y docente
    try:
        admins = db.query(Usuario).filter(
            Usuario.laboratorio_id == res.laboratorio_id,
            Usuario.rol.in_([RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN])
        ).all()
        if not admins:
            admins = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).all()
        docente = db.query(Usuario).filter(Usuario.id == res.docente_id).first()
        docente_nombre = docente.nombre if docente else "El docente"
        for adm in admins:
            crear_notificacion(
                db, adm.id,
                tipo=body.estado,
                titulo=f"Evento de asistencia — {res.materia}",
                mensaje=(
                    f"{docente_nombre} {etiqueta} a su clase de {res.materia} ({res.grupo})."
                    + (f" Motivo: {body.motivo}" if body.motivo else "")
                ),
                url="/admin/reservaciones",
            )
        # Notificar al propio docente
        crear_notificacion(
            db, res.docente_id,
            tipo=body.estado,
            titulo="Registro de asistencia",
            mensaje=(
                f"Se registró que {etiqueta} a tu clase de {res.materia} ({res.grupo})."
                + (f" Nota: {body.motivo}" if body.motivo else "")
            ),
            url="/docente/reservaciones",
        )
        db.commit()
    except Exception:
        pass

    # Registrar evento de cumplimiento
    from models.cumplimiento import EventoCumplimiento as _EC2
    import datetime as _dt2
    _ec2 = _EC2(
        reservacion_id    = reservacion_id,
        sesion_id         = None,
        tipo              = body.estado,   # NO_ASISTIO | CANCELADA_TARDIA
        fecha             = _dt2.datetime.now(_dt2.timezone.utc).date(),
        motivo            = body.motivo,
        registrado_por_id = current_user.id,
    )
    db.add(_ec2)
    db.commit()

    return {"mensaje": f"Evento {body.estado} registrado. La reservación permanece PROGRAMADA.",
            "estado": res.estado}
