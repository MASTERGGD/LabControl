from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from services.auditoria import registrar, Accion, Recurso
from typing import Optional, List
from database import get_db
from models.sesion import SesionClase, AsignacionPC, ObservacionPC
from models.horario import Reservacion
from models.laboratorio import Laboratorio, Computadora
from models.usuario import Usuario, RolUsuario
from dependencies import get_current_user, require_roles
from permissions import require_permission
from ws.mapa import manager, _snapshot_lab
from routers.notificaciones import crear_notificacion
import datetime
import uuid

router = APIRouter(prefix="/sesiones", tags=["Sesiones de Clase"])


# ─── Schemas ───────────────────────────────────────────────────────────────────

class SesionCreate(BaseModel):
    laboratorio_id: int
    materia: str        = Field(..., min_length=2, max_length=100)
    grupo: str          = Field(..., min_length=1, max_length=20)
    reservacion_id: Optional[int] = None
    fin_estimado_min: Optional[int] = Field(None, ge=30, le=300, description="Duración estimada en minutos")

class SesionCerrar(BaseModel):
    observacion_general: Optional[str] = None

class AsignacionCreate(BaseModel):
    computadora_id: int
    alumno_nombre: str   = Field(..., min_length=2, max_length=100)
    alumno_matricula: str = Field(..., min_length=2, max_length=20)

class ObservacionCreate(BaseModel):
    computadora_id: Optional[int] = None
    tipo: str       = Field(default="SIN_NOVEDAD", description="SIN_NOVEDAD, FALLA_HARDWARE, FALLA_SOFTWARE, LIMPIEZA, OTRO")
    descripcion: Optional[str] = None
    prioridad: str  = Field(default="BAJA", description="BAJA, MEDIA, ALTA")

class ReportePCCreate(BaseModel):
    computadora_id: int
    nota: str        = Field(..., min_length=3, max_length=500)
    bloquear: bool   = Field(default=False, description="Si True, cambia la PC a MANTENIMIENTO")


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _serializar_sesion(s: SesionClase, db: Session) -> dict:
    lab  = db.query(Laboratorio).filter(Laboratorio.id == s.laboratorio_id).first()
    doc  = db.query(Usuario).filter(Usuario.id == s.docente_id).first()
    asigs = db.query(AsignacionPC).filter(
        AsignacionPC.sesion_id == s.id,
        AsignacionPC.hora_liberacion == None  # noqa: E711
    ).count()

    # Calcular tiempo restante (en segundos) o exceso si está abierta
    ahora = datetime.datetime.utcnow()
    tiempo_restante_seg = None
    en_overtime = False
    if s.estado == "ABIERTA" and s.fin_estimado:
        diff = (s.fin_estimado - ahora).total_seconds()
        tiempo_restante_seg = int(diff)   # negativo si está en overtime
        en_overtime = diff < 0

    return {
        "id": s.id,
        "codigo_sesion": s.codigo_sesion,
        "laboratorio_id": s.laboratorio_id,
        "laboratorio_nombre": lab.nombre if lab else None,
        "docente_id": s.docente_id,
        "docente_nombre": doc.nombre if doc else None,
        "materia": s.materia,
        "grupo": s.grupo,
        "inicio": s.inicio.isoformat() if s.inicio else None,
        "fin_estimado": s.fin_estimado.isoformat() if s.fin_estimado else None,
        "fin_real": s.fin_real.isoformat() if s.fin_real else None,
        "estado": s.estado,
        "pcs_ocupadas": asigs,
        "observacion_general": s.observacion_general,
        "reservacion_id": s.reservacion_id,
        "overtime_min": s.overtime_min or 0,
        "tiempo_restante_seg": tiempo_restante_seg,
        "en_overtime": en_overtime,
        "recepcion_confirmada": bool(s.recepcion_confirmada),
        "recepcion_fin": s.recepcion_fin.isoformat() if s.recepcion_fin else None,
    }

def _get_sesion_activa_docente(docente_id: int, db: Session) -> Optional[SesionClase]:
    return db.query(SesionClase).filter(
        SesionClase.docente_id == docente_id,
        SesionClase.estado == "ABIERTA"
    ).first()


# ─── Sesiones ──────────────────────────────────────────────────────────────────

@router.get("", summary="Listar sesiones")
def listar_sesiones(
    laboratorio_id: Optional[int] = None,
    estado: Optional[str]         = None,
    docente_id: Optional[int]     = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(SesionClase)
    if laboratorio_id:
        q = q.filter(SesionClase.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(SesionClase.laboratorio_id == current_user.laboratorio_id)
    if estado:
        q = q.filter(SesionClase.estado == estado)
    if docente_id:
        q = q.filter(SesionClase.docente_id == docente_id)
    elif current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(SesionClase.docente_id == current_user.id)

    sesiones = q.order_by(SesionClase.inicio.desc()).limit(limit).all()
    return [_serializar_sesion(s, db) for s in sesiones]


@router.get("/activas", summary="Sesiones abiertas ahora mismo")
def sesiones_activas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(SesionClase).filter(SesionClase.estado == "ABIERTA")
    if current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(SesionClase.docente_id == current_user.id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(SesionClase.laboratorio_id == current_user.laboratorio_id)
    return [_serializar_sesion(s, db) for s in q.all()]


@router.post("", status_code=status.HTTP_201_CREATED, summary="Abrir sesión de clase")
async def abrir_sesion(
    request: Request,
    data: SesionCreate,
    db: Session = Depends(get_db),
    # RBAC: solo SUPER_ADMIN, LAB_ADMIN y DOCENTE pueden abrir sesiones
    current_user: Usuario = Depends(require_permission("sesiones:write"))
):

    # Solo un docente puede tener una sesión abierta a la vez
    if current_user.rol == RolUsuario.DOCENTE:
        ya_abierta = _get_sesion_activa_docente(current_user.id, db)
        if ya_abierta:
            raise HTTPException(
                status_code=409,
                detail=f"Ya tienes una sesión abierta: {ya_abierta.codigo_sesion}"
            )

    # Verificar que el laboratorio exista y esté activo
    lab = db.query(Laboratorio).filter(
        Laboratorio.id == data.laboratorio_id, Laboratorio.activo == True
    ).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")

    # No puede haber otra sesión abierta en el mismo lab
    otra = db.query(SesionClase).filter(
        SesionClase.laboratorio_id == data.laboratorio_id,
        SesionClase.estado == "ABIERTA"
    ).first()
    if otra:
        raise HTTPException(
            status_code=409,
            detail=f"Ya hay una sesión abierta en este laboratorio: {otra.codigo_sesion}"
        )

    ahora = datetime.datetime.utcnow()
    fin_est = ahora + datetime.timedelta(minutes=data.fin_estimado_min) if data.fin_estimado_min else None
    codigo  = f"SES-{ahora.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    sesion = SesionClase(
        reservacion_id=data.reservacion_id,
        laboratorio_id=data.laboratorio_id,
        docente_id=current_user.id,
        materia=data.materia,
        grupo=data.grupo,
        codigo_sesion=codigo,
        inicio=ahora,
        fin_estimado=fin_est,
        estado="ABIERTA",
    )
    db.add(sesion)
    db.commit()
    db.refresh(sesion)

    # Broadcast WebSocket
    await manager.broadcast(data.laboratorio_id, {
        "tipo": "sesion_abierta",
        "sesion": {
            "id": sesion.id,
            "codigo": codigo,
            "materia": data.materia,
            "grupo": data.grupo,
            "docente": current_user.nombre,
        }
    })

    return _serializar_sesion(sesion, db)


@router.get("/{sesion_id}", summary="Detalle de sesión")
def obtener_sesion(
    sesion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta sesión")
    return _serializar_sesion(s, db)


@router.get("/{sesion_id}/mapa", summary="Snapshot HTTP del mapa de PCs (polling fallback)")
def mapa_sesion(
    sesion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Devuelve el estado actual de todas las PCs del laboratorio de la sesión.
    Usado como fallback cuando WebSocket no está disponible."""
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    pcs = _snapshot_lab(s.laboratorio_id, db)
    return {"pcs": pcs, "sesion_id": sesion_id, "laboratorio_id": s.laboratorio_id}


@router.post("/{sesion_id}/cerrar", summary="Cerrar sesión de clase")
async def cerrar_sesion(
    request: Request,
    sesion_id: int,
    data: SesionCerrar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if s.estado != "ABIERTA":
        raise HTTPException(status_code=400, detail="La sesión no está abierta")
    if current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No puedes cerrar una sesión que no es tuya")

    # Liberar todas las PCs que quedaron asignadas
    asigs_abiertas = db.query(AsignacionPC).filter(
        AsignacionPC.sesion_id == sesion_id,
        AsignacionPC.hora_liberacion == None  # noqa: E711
    ).all()
    ahora = datetime.datetime.utcnow()
    for a in asigs_abiertas:
        a.hora_liberacion = ahora

    s.estado = "CERRADA"
    s.fin_real = ahora
    s.observacion_general = data.observacion_general
    # Calcular overtime
    overtime_min = 0
    if s.fin_estimado and ahora > s.fin_estimado:
        overtime_min = int((ahora - s.fin_estimado).total_seconds() / 60)
    s.overtime_min = overtime_min
    db.commit()
    registrar(db, accion=Accion.CERRAR_SESION, recurso=Recurso.SESION,
              usuario=current_user, recurso_id=s.id,
              detalle={"laboratorio_id": s.laboratorio_id, "codigo": s.codigo_sesion,
                       "overtime_min": overtime_min, "pcs_liberadas": len(asigs_abiertas)},
              request=request)
    db.refresh(s)

    # ── Notificacion de overtime al cerrar ───────────────────────────────────
    if overtime_min > 0:
        try:
            lab = db.query(Laboratorio).filter(Laboratorio.id == s.laboratorio_id).first()
            lab_nombre = lab.nombre if lab else f"Lab {s.laboratorio_id}"
            admins = db.query(Usuario).filter(
                Usuario.laboratorio_id == s.laboratorio_id
            ).all()
            if not admins:
                admins = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).all()
            docente_nombre = current_user.nombre
            for adm in admins:
                crear_notificacion(
                    db, adm.id,
                    tipo="OVERTIME",
                    titulo=f"Sesión cerrada con overtime — {lab_nombre}",
                    mensaje=(
                        f"La sesión #{s.id} de {docente_nombre} en {lab_nombre} "
                        f"tuvo {overtime_min} min de overtime. "
                        f"Fin estimado: {s.fin_estimado.strftime('%H:%M') if s.fin_estimado else 'N/D'}, "
                        f"fin real: {ahora.strftime('%H:%M')}."
                    ),
                    url="/admin/sesiones",
                )
            db.commit()
        except Exception:
            pass

    # Broadcast WebSocket
    await manager.broadcast(s.laboratorio_id, {
        "tipo": "sesion_cerrada",
        "sesion_id": sesion_id,
    })

    return _serializar_sesion(s, db)


# ─── Asignaciones de PC ────────────────────────────────────────────────────────

@router.get("/{sesion_id}/asignaciones", summary="Lista de asignaciones")
def listar_asignaciones(
    sesion_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user)
):
    asigs = db.query(AsignacionPC).filter(AsignacionPC.sesion_id == sesion_id).all()
    result = []
    for a in asigs:
        pc = db.query(Computadora).filter(Computadora.id == a.computadora_id).first()
        result.append({
            "id": a.id,
            "sesion_id": a.sesion_id,
            "computadora_id": a.computadora_id,
            "pc_codigo": pc.codigo if pc else None,
            "pc_fila": pc.fila if pc else None,
            "alumno_nombre": a.alumno_nombre,
            "alumno_matricula": a.alumno_matricula,
            "hora_asignacion": a.hora_asignacion.isoformat() if a.hora_asignacion else None,
            "hora_liberacion": a.hora_liberacion.isoformat() if a.hora_liberacion else None,
            "activa": a.hora_liberacion is None,
        })
    return result


@router.post("/{sesion_id}/asignaciones", status_code=status.HTTP_201_CREATED, summary="Asignar PC a alumno")
async def asignar_pc(
    sesion_id: int,
    data: AsignacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id, SesionClase.estado == "ABIERTA").first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada o no está abierta")
    if current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta sesión")

    # Verificar que la PC exista y pertenezca al lab
    pc = db.query(Computadora).filter(
        Computadora.id == data.computadora_id,
        Computadora.laboratorio_id == s.laboratorio_id,
        Computadora.activa == True,
    ).first()
    if not pc:
        raise HTTPException(status_code=404, detail="Computadora no encontrada en este laboratorio")
    if pc.estado not in ("OPERATIVO", "EN_CLASE"):
        raise HTTPException(status_code=400, detail=f"La PC está en estado {pc.estado}, no se puede asignar")

    # Verificar que la PC no esté ya asignada en esta sesión
    ya_asignada = db.query(AsignacionPC).filter(
        AsignacionPC.sesion_id == sesion_id,
        AsignacionPC.computadora_id == data.computadora_id,
        AsignacionPC.hora_liberacion == None  # noqa: E711
    ).first()
    if ya_asignada:
        raise HTTPException(status_code=409, detail="Esta PC ya está asignada en la sesión")

    asig = AsignacionPC(
        sesion_id=sesion_id,
        computadora_id=data.computadora_id,
        alumno_nombre=data.alumno_nombre,
        alumno_matricula=data.alumno_matricula,
        hora_asignacion=datetime.datetime.utcnow(),
    )
    db.add(asig)
    db.commit()
    db.refresh(asig)

    # Broadcast WebSocket: PC ocupada
    await manager.broadcast(s.laboratorio_id, {
        "tipo": "pc_actualizada",
        "pc": {
            "pc_id": pc.id,
            "codigo": pc.codigo,
            "fila": pc.fila,
            "estado": "OCUPADA",
            "alumno": {
                "nombre": data.alumno_nombre,
                "matricula": data.alumno_matricula,
                "asignacion_id": asig.id,
            },
            "sesion_id": sesion_id,
        }
    })

    return {
        "id": asig.id,
        "computadora_id": asig.computadora_id,
        "pc_codigo": pc.codigo,
        "alumno_nombre": asig.alumno_nombre,
        "alumno_matricula": asig.alumno_matricula,
        "hora_asignacion": asig.hora_asignacion.isoformat(),
    }


@router.delete("/{sesion_id}/asignaciones/{asig_id}", summary="Liberar PC")
async def liberar_pc(
    sesion_id: int,
    asig_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    asig = db.query(AsignacionPC).filter(
        AsignacionPC.id == asig_id,
        AsignacionPC.sesion_id == sesion_id,
        AsignacionPC.hora_liberacion == None  # noqa: E711
    ).first()
    if not asig:
        raise HTTPException(status_code=404, detail="Asignación no encontrada o ya liberada")

    s = db.query(SesionClase).filter(SesionClase.id == sesion_id).first()
    if current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta sesión")

    pc = db.query(Computadora).filter(Computadora.id == asig.computadora_id).first()
    asig.hora_liberacion = datetime.datetime.utcnow()
    db.commit()

    # Broadcast WebSocket: PC libre (en sesión)
    await manager.broadcast(s.laboratorio_id, {
        "tipo": "pc_actualizada",
        "pc": {
            "pc_id": pc.id,
            "codigo": pc.codigo,
            "fila": pc.fila,
            "estado": "EN_CLASE",
            "alumno": None,
            "sesion_id": sesion_id,
        }
    })

    return {"mensaje": f"PC {pc.codigo} liberada"}


# ─── Observaciones ─────────────────────────────────────────────────────────────

@router.get("/{sesion_id}/observaciones", summary="Observaciones de la sesión")
def listar_observaciones(
    sesion_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user)
):
    obs = db.query(ObservacionPC).filter(ObservacionPC.sesion_id == sesion_id).all()
    result = []
    for o in obs:
        pc = db.query(Computadora).filter(Computadora.id == o.computadora_id).first() if o.computadora_id else None
        result.append({
            "id": o.id,
            "sesion_id": o.sesion_id,
            "computadora_id": o.computadora_id,
            "pc_codigo": pc.codigo if pc else None,
            "tipo": o.tipo,
            "descripcion": o.descripcion,
            "prioridad": o.prioridad,
            "atendida": o.atendida,
        })
    return result


@router.post("/{sesion_id}/observaciones", status_code=status.HTTP_201_CREATED, summary="Registrar observación")
def crear_observacion(
    sesion_id: int,
    data: ObservacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    obs = ObservacionPC(
        sesion_id=sesion_id,
        computadora_id=data.computadora_id,
        tipo=data.tipo,
        descripcion=data.descripcion,
        prioridad=data.prioridad,
        atendida=False,
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)

    pc = db.query(Computadora).filter(Computadora.id == obs.computadora_id).first() if obs.computadora_id else None
    return {
        "id": obs.id,
        "sesion_id": obs.sesion_id,
        "computadora_id": obs.computadora_id,
        "pc_codigo": pc.codigo if pc else None,
        "tipo": obs.tipo,
        "descripcion": obs.descripcion,
        "prioridad": obs.prioridad,
        "atendida": obs.atendida,
    }


# ─── Reporte de PC al cierre de sesión ────────────────────────────────────────

@router.post("/{sesion_id}/reportar-pc", status_code=status.HTTP_201_CREATED,
             summary="Reportar PC con problema al cerrar sesión")
async def reportar_pc_cierre(
    sesion_id: int,
    data: ReportePCCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    # Verificar que la PC pertenece al laboratorio de la sesión
    pc = db.query(Computadora).filter(
        Computadora.id == data.computadora_id,
        Computadora.laboratorio_id == s.laboratorio_id
    ).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC no encontrada en este laboratorio")

    # Crear incidente en Mantenimiento
    from models.inventario import Incidente
    descripcion = f"[PC {pc.codigo}] {data.nota} — reportado al cierre de sesión {s.codigo_sesion} ({s.materia})"
    incidente = Incidente(
        computadora_id=pc.id,
        laboratorio_id=s.laboratorio_id,
        origen="SESION",
        origen_id=s.id,
        tipo="MANTENIMIENTO",
        prioridad="MEDIA",
        descripcion=descripcion,
        reportado_por_id=current_user.id,
        estado="PENDIENTE",
    )
    db.add(incidente)

    # Si se pidió bloquear: cambiar estado de la PC a MANTENIMIENTO
    if data.bloquear:
        pc.estado = "MANTENIMIENTO"

    db.commit()
    db.refresh(incidente)

    # Broadcast WebSocket si se bloqueó la PC
    if data.bloquear:
        await manager.broadcast(s.laboratorio_id, {
            "tipo": "pc_actualizada",
            "pc": {
                "pc_id": pc.id,
                "codigo": pc.codigo,
                "fila": pc.fila,
                "estado": "MANTENIMIENTO",
                "alumno": None,
                "sesion_id": sesion_id,
                "bloqueada": True,
            }
        })

    return {
        "incidente_id": incidente.id,
        "pc_codigo": pc.codigo,
        "bloqueada": data.bloquear,
        "estado_pc": pc.estado,
        "mensaje": (
            f"PC {pc.codigo} reportada"
            + (" y bloqueada temporalmente" if data.bloquear else "")
            + ". El administrador recibirá el aviso."
        ),
    }


# ─── Revisión de recepción ─────────────────────────────────────────────────────

class RecepcionItem(BaseModel):
    computadora_id: int
    estado:         str           # "OK" | "CON_PROBLEMA"
    descripcion:    Optional[str] = None
    prioridad:      str           = "MEDIA"  # ALTA | MEDIA | BAJA

class RecepcionConfirmar(BaseModel):
    observaciones: List[RecepcionItem] = []


@router.post("/{sesion_id}/confirmar-recepcion",
             summary="Confirmar revisión de recepción del laboratorio")
def confirmar_recepcion(
    sesion_id: int,
    data: RecepcionConfirmar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if s.recepcion_confirmada:
        raise HTTPException(status_code=400, detail="La recepción ya fue confirmada")

    from models.inventario import Incidente

    incidentes_creados = []

    for obs in data.observaciones:
        pc = db.query(Computadora).filter(Computadora.id == obs.computadora_id).first()
        if not pc:
            continue

        # Crear ObservacionPC con momento=RECEPCION_INICIO
        observacion = ObservacionPC(
            sesion_id      = sesion_id,
            computadora_id = obs.computadora_id,
            tipo           = "CON_PROBLEMA" if obs.estado == "CON_PROBLEMA" else "SIN_NOVEDAD",
            descripcion    = obs.descripcion,
            prioridad      = obs.prioridad,
            atendida       = False,
            momento        = "RECEPCION_INICIO",
        )
        db.add(observacion)

        if obs.estado == "CON_PROBLEMA":
            # Crear Incidente vinculado a esta sesión con origen RECEPCION
            descripcion_inc = (
                obs.descripcion or f"Daño detectado al recibir laboratorio — PC {pc.codigo}"
            )
            descripcion_inc += f" [Reportado por {current_user.nombre} al iniciar sesión {s.codigo_sesion}]"

            incidente = Incidente(
                computadora_id   = pc.id,
                laboratorio_id   = s.laboratorio_id,
                origen           = "RECEPCION",
                origen_id        = sesion_id,
                tipo             = "DAÑO",
                prioridad        = obs.prioridad,
                descripcion      = descripcion_inc,
                reportado_por_id = current_user.id,
                estado           = "EN_REVISION",
            )
            db.add(incidente)
            db.flush()  # get incidente.id

            # Buscar último usuario de esa PC en sesiones anteriores
            ultimo_uso = (
                db.query(AsignacionPC)
                .filter(
                    AsignacionPC.computadora_id == pc.id,
                    AsignacionPC.sesion_id != sesion_id,
                )
                .order_by(AsignacionPC.hora_asignacion.desc())
                .first()
            )

            ultimo_alumno = None
            ultima_sesion = None
            if ultimo_uso:
                ultima_sesion_obj = db.query(SesionClase).filter(
                    SesionClase.id == ultimo_uso.sesion_id
                ).first()
                ultimo_alumno = {
                    "nombre":    ultimo_uso.alumno_nombre,
                    "matricula": ultimo_uso.alumno_matricula,
                    "hora":      ultimo_uso.hora_asignacion.isoformat() if ultimo_uso.hora_asignacion else None,
                }
                if ultima_sesion_obj:
                    ultima_sesion = {
                        "id":           ultima_sesion_obj.id,
                        "codigo":       ultima_sesion_obj.codigo_sesion,
                        "materia":      ultima_sesion_obj.materia,
                        "grupo":        ultima_sesion_obj.grupo,
                        "inicio":       ultima_sesion_obj.inicio.isoformat() if ultima_sesion_obj.inicio else None,
                        "fin_real":     ultima_sesion_obj.fin_real.isoformat() if ultima_sesion_obj.fin_real else None,
                        "sin_reporte_cierre": True,  # si llegamos aquí, no hubo reporte al cierre
                    }

            incidentes_creados.append({
                "incidente_id":  incidente.id,
                "pc_codigo":     pc.codigo,
                "computadora_id": pc.id,
                "descripcion":   obs.descripcion,
                "ultimo_alumno": ultimo_alumno,
                "ultima_sesion": ultima_sesion,
            })

    # Marcar sesión como recepción confirmada
    s.recepcion_confirmada = True
    s.recepcion_fin        = datetime.datetime.utcnow()
    db.commit()

    return {
        "mensaje":            "Recepcion confirmada" + (f" - {len(incidentes_creados)} incidente(s) reportado(s)" if incidentes_creados else " sin novedades"),
        "recepcion_confirmada": True,
        "incidentes":         incidentes_creados,
    }


# ─── Último usuario de una PC (para revisión de recepción) ────────────────────

@router.get("/pc/{computadora_id}/ultimo-usuario", summary="Ultimo usuario de una PC")
def ultimo_usuario_pc(
    computadora_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Retorna el último alumno que usó una PC (en cualquier sesión anterior).
    Accesible para docentes — usado en la revisión de recepción.
    """
    pc = db.query(Computadora).filter(Computadora.id == computadora_id).first()
    if not pc:
        raise HTTPException(404, "Computadora no encontrada")

    asig = (
        db.query(AsignacionPC)
        .filter(AsignacionPC.computadora_id == computadora_id)
        .order_by(AsignacionPC.hora_asignacion.desc())
        .first()
    )
    if not asig:
        return {"ultimo_usuario": None}

    sesion = db.query(SesionClase).filter(SesionClase.id == asig.sesion_id).first()
    return {
        "ultimo_usuario": {
            "alumno_nombre":    asig.alumno_nombre,
            "alumno_matricula": asig.alumno_matricula,
            "sesion_codigo":    sesion.codigo_sesion if sesion else None,
            "sesion_materia":   sesion.materia       if sesion else None,
            "sesion_fecha":     sesion.inicio.isoformat() if sesion and sesion.inicio else None,
        }
    }
