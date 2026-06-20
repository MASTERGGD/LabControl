from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from services.auditoria import registrar, Accion, Recurso
from typing import Optional, List
from database import get_db
from models.sesion import SesionClase, AsignacionPC, ObservacionPC
from models.horario import Reservacion, HorarioDisponible
from models.laboratorio import Laboratorio, Computadora
from models.usuario import Usuario, RolUsuario
from models.catalogo import CatalogoAlumno
from dependencies import get_current_user, require_roles, crear_access_token, decodificar_token
from jose import JWTError
from permissions import require_permission
from ws.mapa import manager, _snapshot_lab
from routers.notificaciones import crear_notificacion
import datetime
import uuid


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


router = APIRouter(prefix="/sesiones", tags=["Sesiones de Clase"])


# ─── Schemas ───────────────────────────────────────────────────────────────────

class SesionCreate(BaseModel):
    laboratorio_id: int
    tipo_sesion:         Optional[str]  = Field(None, max_length=20,
        description="CLASE | LIBRE")
    materia:             Optional[str]  = Field(None, max_length=200)
    carrera:             Optional[str]  = Field(None, max_length=120)
    cuatrimestre:        Optional[str]  = Field(None, max_length=20,
        description="Cuatrimestre de la materia (1–12)")
    grupo:               Optional[str]  = Field(None, max_length=20)
    observacion:         Optional[str]  = Field(None, max_length=200)
    reservacion_id:      Optional[int]  = None
    fin_estimado_min:    Optional[int]  = Field(None, ge=15, le=300,
        description="Duración estimada en minutos")

class SesionCerrar(BaseModel):
    observacion_general: Optional[str] = None

class AsignacionCreate(BaseModel):
    computadora_id: int
    alumno_nombre: str   = Field(..., min_length=2, max_length=100)
    alumno_matricula: str = Field(..., min_length=2, max_length=20)

class AutoAsignacionCreate(BaseModel):
    computadora_id: int
    matricula: str = Field(..., min_length=2, max_length=20)

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

def _identidad_sesion(materia, carrera, cuatrimestre, grupo) -> str:
    """Etiqueta legible de identidad académica de una sesión."""
    partes = [materia or "—"]
    if carrera:
        partes.append(carrera)
    if cuatrimestre:
        partes.append(f"{cuatrimestre}° cuatrimestre")
    if grupo:
        partes.append(f"Grupo {grupo}")
    return " · ".join(partes)


def _serializar_sesion(s: SesionClase, db: Session) -> dict:
    lab  = db.query(Laboratorio).filter(Laboratorio.id == s.laboratorio_id).first()
    doc  = db.query(Usuario).filter(Usuario.id == s.docente_id).first()
    asigs = db.query(AsignacionPC).filter(
        AsignacionPC.sesion_id == s.id,
        AsignacionPC.hora_liberacion == None  # noqa: E711
    ).count()
    total_alumnos = db.query(AsignacionPC).filter(
        AsignacionPC.sesion_id == s.id
    ).count()

    # Calcular tiempo restante (en segundos) o exceso si está abierta
    ahora = _utcnow()
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
        "tipo_sesion":        s.tipo_sesion or "CLASE",
        "materia":            s.materia,
        "carrera":            s.carrera,
        "cuatrimestre":       s.cuatrimestre,
        "grupo":              s.grupo,
        "identidad_academica": _identidad_sesion(s.materia, s.carrera, s.cuatrimestre, s.grupo),
        "inicio": s.inicio.isoformat() if s.inicio else None,
        "fin_estimado": s.fin_estimado.isoformat() if s.fin_estimado else None,
        "fin_real": s.fin_real.isoformat() if s.fin_real else None,
        "estado": s.estado,
        "pcs_ocupadas": asigs,
        "total_alumnos": total_alumnos,
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


def _validar_token_autoasignacion(token: str) -> int:
    try:
        payload = decodificar_token(token)
    except JWTError:
      raise HTTPException(status_code=401, detail="QR inválido o expirado")
    if payload.get("typ") != "autoasignacion":
        raise HTTPException(status_code=401, detail="QR inválido")
    try:
        return int(payload["sid"])
    except Exception:
        raise HTTPException(status_code=401, detail="QR inválido")


async def _crear_asignacion_pc(
    request: Request,
    sesion_id: int,
    computadora_id: int,
    alumno_nombre: str,
    alumno_matricula: str,
    db: Session,
    current_user: Optional[Usuario] = None,
):
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id, SesionClase.estado == "ABIERTA").first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada o no está abierta")
    if current_user and current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta sesión")

    pc = db.query(Computadora).filter(
        Computadora.id == computadora_id,
        Computadora.laboratorio_id == s.laboratorio_id,
        Computadora.activa == True,
    ).first()
    if not pc:
        raise HTTPException(status_code=404, detail="Computadora no encontrada en este laboratorio")
    if pc.estado not in ("OPERATIVO", "EN_CLASE"):
        raise HTTPException(status_code=400, detail=f"La PC está en estado {pc.estado}, no se puede asignar")

    ya_asignada = db.query(AsignacionPC).filter(
        AsignacionPC.sesion_id == sesion_id,
        AsignacionPC.computadora_id == computadora_id,
        AsignacionPC.hora_liberacion == None  # noqa: E711
    ).first()
    if ya_asignada:
        raise HTTPException(status_code=409, detail="Esta PC ya está asignada en la sesión")

    matricula_norm = alumno_matricula.strip().upper()
    alumno_ya_registrado = db.query(AsignacionPC).filter(
        AsignacionPC.sesion_id == sesion_id,
        AsignacionPC.alumno_matricula == matricula_norm,
        AsignacionPC.hora_liberacion == None  # noqa: E711
    ).first()
    if alumno_ya_registrado:
        raise HTTPException(status_code=409, detail="Esta matrícula ya está registrada en la sesión")

    asig = AsignacionPC(
        sesion_id=sesion_id,
        computadora_id=computadora_id,
        alumno_nombre=alumno_nombre.strip(),
        alumno_matricula=matricula_norm,
        hora_asignacion=_utcnow(),
    )
    db.add(asig)
    db.commit()
    db.refresh(asig)

    if current_user:
        registrar(db, accion=Accion.ASIGNAR_PC, recurso=Recurso.SESION,
                  usuario=current_user, recurso_id=asig.id,
                  detalle={"sesion_id": sesion_id, "computadora_id": computadora_id,
                           "alumno": alumno_nombre, "matricula": matricula_norm},
                  request=request)

    await manager.broadcast(s.laboratorio_id, {
        "tipo": "pc_actualizada",
        "pc": {
            "pc_id": pc.id,
            "codigo": pc.codigo,
            "fila": pc.fila,
            "estado": "OCUPADA",
            "alumno": {
                "nombre": alumno_nombre.strip(),
                "matricula": matricula_norm,
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


# ─── Sesiones ──────────────────────────────────────────────────────────────────


@router.get("/historial", summary="Historial de sesiones del docente (con filtros)")
def historial_docente(
    laboratorio_id: Optional[int]  = None,
    fecha_inicio:   Optional[str]  = None,   # "YYYY-MM-DD"
    fecha_fin:      Optional[str]  = None,   # "YYYY-MM-DD"
    materia:        Optional[str]  = None,
    limit:          int            = 100,
    offset:         int            = 0,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Devuelve las sesiones CERRADAS del docente autenticado."""
    q = db.query(SesionClase).filter(SesionClase.estado == "CERRADA")

    if current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(SesionClase.docente_id == current_user.id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(SesionClase.laboratorio_id == current_user.laboratorio_id)

    if laboratorio_id:
        q = q.filter(SesionClase.laboratorio_id == laboratorio_id)
    if materia:
        q = q.filter(SesionClase.materia.ilike(f"%{materia}%"))
    if fecha_inicio:
        try:
            fi = datetime.datetime.strptime(fecha_inicio, "%Y-%m-%d")
            q  = q.filter(SesionClase.inicio >= fi)
        except ValueError:
            pass
    if fecha_fin:
        try:
            ff = datetime.datetime.strptime(fecha_fin, "%Y-%m-%d")
            ff = ff.replace(hour=23, minute=59, second=59)
            q  = q.filter(SesionClase.inicio <= ff)
        except ValueError:
            pass

    total    = q.count()
    sesiones = q.order_by(SesionClase.inicio.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "sesiones": [_serializar_sesion(s, db) for s in sesiones],
    }


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
    # ── Hora actual en México (UTC-6, sin ajuste DST simplificado) ────────────
    OFFSET_MX = datetime.timedelta(hours=-6)
    ahora_utc = _utcnow()
    ahora_mx  = ahora_utc + OFFSET_MX          # hora local México
    dia_mx    = ahora_mx.weekday()              # 0=lun … 6=dom
    hora_mx   = ahora_mx.strftime("%H:%M")      # "07:00"
    TOLERANCIA = datetime.timedelta(minutes=15)

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

    # ── Validaciones exclusivas para DOCENTE ─────────────────────────────────
    if current_user.rol == RolUsuario.DOCENTE:

        if data.reservacion_id:
            # ── Sesión reservada: verificar propiedad y ventana horaria ──────
            res = db.query(Reservacion).filter(Reservacion.id == data.reservacion_id).first()
            if not res:
                raise HTTPException(status_code=404, detail="Reservación no encontrada")

            # Solo el docente titular (o suplente) puede iniciarla
            es_titular  = res.docente_id == current_user.id
            es_suplente = res.docente_suplente_id == current_user.id
            if not es_titular and not es_suplente:
                raise HTTPException(
                    status_code=403,
                    detail="Esta reservación no te pertenece. Solo puedes iniciar tus propias clases."
                )

            # ── Verificar que la reservación tenga identidad académica completa ─
            faltan_res = [f for f, v in [
                ("materia",              res.materia),
                ("carrera",              res.carrera),
                ("cuatrimestre_materia", res.cuatrimestre_materia),
                ("grupo",                res.grupo),
            ] if not v or not str(v).strip()]
            if faltan_res:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"La reservación no tiene identidad académica completa. "
                        f"Faltan: {', '.join(faltan_res)}. "
                        f"Pide al administrador que edite la reservación antes de iniciar la sesión."
                    )
                )

            # Verificar ventana horaria ±15 min en horario México
            horario = db.query(HorarioDisponible).filter(
                HorarioDisponible.id == res.horario_id
            ).first()
            if horario:
                mismo_dia = horario.dia_semana == dia_mx
                # Construir datetime de hoy con hora de inicio y fin del slot
                hoy = ahora_mx.date()
                try:
                    h_ini = datetime.datetime.combine(
                        hoy, datetime.time.fromisoformat(horario.hora_inicio)
                    )
                    h_fin = datetime.datetime.combine(
                        hoy, datetime.time.fromisoformat(horario.hora_fin)
                    )
                    dentro_ventana = (
                        mismo_dia and
                        (h_ini - TOLERANCIA) <= ahora_mx <= (h_fin + TOLERANCIA)
                    )
                except Exception:
                    dentro_ventana = True   # si no se puede parsear, dejar pasar

                if not dentro_ventana:
                    dia_labels = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            f"Fuera de horario. Tu clase es los {dia_labels[horario.dia_semana]} "
                            f"de {horario.hora_inicio} a {horario.hora_fin}. "
                            f"Puedes iniciarla entre las {(h_ini - TOLERANCIA).strftime('%H:%M')} "
                            f"y las {(h_fin + TOLERANCIA).strftime('%H:%M')}. "
                            f"Hora actual en México: {hora_mx}."
                        )
                    )

        else:
            # ── Verificar que no haya reservación vigente de otro ──
            # Buscar si hay alguna reservación activa de OTRO docente en este lab en este slot horario
            reservaciones_lab = (
                db.query(Reservacion)
                .join(HorarioDisponible, Reservacion.horario_id == HorarioDisponible.id)
                .filter(
                    Reservacion.laboratorio_id == data.laboratorio_id,
                    Reservacion.estado == "PROGRAMADA",
                    HorarioDisponible.dia_semana == dia_mx,
                    Reservacion.docente_id != current_user.id,
                )
                .all()
            )
            # Filtrar las que estén activas ahora (dentro de su ventana horaria)
            conflicto = None
            hoy = ahora_mx.date()
            for rev in reservaciones_lab:
                try:
                    h_ini = datetime.datetime.combine(
                        hoy, datetime.time.fromisoformat(rev.horario.hora_inicio)
                    )
                    h_fin = datetime.datetime.combine(
                        hoy, datetime.time.fromisoformat(rev.horario.hora_fin)
                    )
                    if h_ini <= ahora_mx <= h_fin:
                        conflicto = rev
                        break
                except Exception:
                    continue
            if conflicto:
                docente_titular = db.query(Usuario).filter(Usuario.id == conflicto.docente_id).first()
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"El laboratorio tiene una clase reservada en este horario "
                        f"({conflicto.horario.hora_inicio}–{conflicto.horario.hora_fin}) "
                        f"para {docente_titular.nombre if docente_titular else 'otro docente'}. "
                        f"No puedes abrir una sesión libre durante un slot reservado."
                    )
                )

    ahora = ahora_utc  # usar UTC para guardar en BD
    fin_est = ahora + datetime.timedelta(minutes=data.fin_estimado_min) if data.fin_estimado_min else None
    codigo  = f"SES-{ahora.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    tipo_solicitado = (data.tipo_sesion or "").strip().upper()
    if tipo_solicitado and tipo_solicitado not in ("CLASE", "LIBRE"):
        raise HTTPException(status_code=422, detail="tipo_sesion debe ser CLASE o LIBRE")

    # Determinar tipo: respetar LIBRE explícito; si no, CLASE si tiene materia+grupo o reservación.
    es_libre = tipo_solicitado == "LIBRE" or (not data.reservacion_id and not (data.materia and data.grupo))
    tipo_sesion = "LIBRE" if es_libre else "CLASE"

    # Identidad académica: heredar de la reservación si viene de una; si no, usar lo enviado
    if data.reservacion_id:
        res_ref = db.query(Reservacion).filter(Reservacion.id == data.reservacion_id).first()
        materia_final     = res_ref.materia if res_ref else data.materia
        carrera_final     = res_ref.carrera if res_ref else data.carrera
        cuatrimestre_final = res_ref.cuatrimestre_materia if res_ref else data.cuatrimestre
        grupo_final       = res_ref.grupo if res_ref else (data.grupo or "")
    else:
        materia_final     = data.materia or (data.observacion if data.observacion else "Sesión Libre")
        carrera_final     = data.carrera
        cuatrimestre_final = data.cuatrimestre
        grupo_final       = data.grupo or ""

    if data.reservacion_id:
        if not res_ref:
            raise HTTPException(status_code=404, detail="Reservación no encontrada")

        faltan_res = [f for f, v in [
            ("materia",              res_ref.materia),
            ("carrera",              res_ref.carrera),
            ("cuatrimestre_materia", res_ref.cuatrimestre_materia),
            ("grupo",                res_ref.grupo),
        ] if not v or not str(v).strip()]
        if faltan_res:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"La reservación no tiene identidad académica completa. "
                    f"Faltan: {', '.join(faltan_res)}. "
                    f"Edita la reservación antes de iniciar la sesión."
                )
            )
    elif tipo_sesion == "CLASE":
        faltan = [f for f, v in [
            ("materia",      materia_final),
            ("carrera",      carrera_final),
            ("cuatrimestre", cuatrimestre_final),
            ("grupo",        grupo_final),
        ] if not v or not str(v).strip()]
        if faltan:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"La sesión requiere identidad académica completa. "
                    f"Faltan: {', '.join(faltan)}. "
                    f"Selecciona la materia desde el catálogo para autocompletar carrera y cuatrimestre."
                )
            )

    sesion = SesionClase(
        reservacion_id=data.reservacion_id,
        laboratorio_id=data.laboratorio_id,
        docente_id=current_user.id,
        tipo_sesion=tipo_sesion,
        materia=materia_final,
        carrera=carrera_final,
        cuatrimestre=cuatrimestre_final,
        grupo=grupo_final,
        codigo_sesion=codigo,
        inicio=ahora,
        fin_estimado=fin_est,
        estado="ABIERTA",
    )
    db.add(sesion)
    db.commit()
    db.refresh(sesion)

    # Actualizar estado de la reservacion a EN_CURSO
    if data.reservacion_id:
        res = db.query(Reservacion).filter(Reservacion.id == data.reservacion_id).first()
        if res:
            res.estado = "EN_CURSO"
            db.commit()

    registrar(db, accion=Accion.ABRIR_SESION, recurso=Recurso.SESION,
              usuario=current_user, recurso_id=sesion.id,
              detalle={"laboratorio_id": data.laboratorio_id, "codigo": codigo,
                       "materia": materia_final, "tipo": tipo_sesion,
                       "reservacion_id": data.reservacion_id},
              request=request)

    # Broadcast WebSocket
    await manager.broadcast(data.laboratorio_id, {
        "tipo": "sesion_abierta",
        "sesion": {
            "id": sesion.id,
            "codigo": codigo,
            "materia": materia_final,
            "grupo": grupo_final,
            "docente": current_user.nombre,
            "tipo_sesion": tipo_sesion,
        }
    })

    return _serializar_sesion(sesion, db)


@router.post("/{sesion_id}/autoasignacion-token", summary="Crear token temporal para autoasignación por QR")
def crear_token_autoasignacion(
    sesion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id, SesionClase.estado == "ABIERTA").first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada o no está abierta")
    if current_user.rol == RolUsuario.DOCENTE and s.docente_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta sesión")
    if current_user.rol == RolUsuario.LAB_ADMIN and current_user.laboratorio_id != s.laboratorio_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este laboratorio")

    expira = _utcnow() + datetime.timedelta(hours=4)
    token = crear_access_token({
        "typ": "autoasignacion",
        "sid": str(sesion_id),
        "lab": str(s.laboratorio_id),
        "exp": expira,
    })
    return {
        "token": token,
        "path": f"/autoasignacion/{token}",
        "expires_at": expira.isoformat(),
    }


@router.get("/autoasignacion/{token}", summary="Datos públicos para autoasignación por QR")
def datos_autoasignacion(
    token: str,
    db: Session = Depends(get_db),
):
    sesion_id = _validar_token_autoasignacion(token)
    s = db.query(SesionClase).filter(SesionClase.id == sesion_id, SesionClase.estado == "ABIERTA").first()
    if not s:
        raise HTTPException(status_code=404, detail="La sesión ya no está abierta")
    lab = db.query(Laboratorio).filter(Laboratorio.id == s.laboratorio_id).first()
    pcs = _snapshot_lab(s.laboratorio_id, db)
    pcs_disponibles = [
        {
            "pc_id": pc["pc_id"],
            "codigo": pc["codigo"],
            "fila": pc.get("fila"),
            "numero": pc.get("numero"),
            "estado": pc["estado"],
        }
        for pc in pcs
        if pc["estado"] in ("OPERATIVO", "EN_CLASE") and not pc.get("alumno")
    ]
    return {
        "sesion_id": s.id,
        "laboratorio_nombre": lab.nombre if lab else None,
        "materia": s.materia,
        "grupo": s.grupo,
        "tipo_sesion": s.tipo_sesion or "CLASE",
        "pcs_disponibles": pcs_disponibles,
    }


@router.post("/autoasignacion/{token}", status_code=status.HTTP_201_CREATED, summary="Autoasignar PC con matrícula")
async def registrar_autoasignacion(
    request: Request,
    token: str,
    data: AutoAsignacionCreate,
    db: Session = Depends(get_db),
):
    sesion_id = _validar_token_autoasignacion(token)
    matricula = data.matricula.strip().upper()
    alumno = db.query(CatalogoAlumno).filter(
        CatalogoAlumno.matricula == matricula,
        CatalogoAlumno.activo == True,
    ).first()
    if not alumno:
        raise HTTPException(status_code=404, detail="Matrícula no encontrada en el catálogo de alumnos")
    nombre = " ".join([
        alumno.apellido_paterno or "",
        alumno.apellido_materno or "",
        alumno.nombres or "",
    ]).strip()
    return await _crear_asignacion_pc(
        request=request,
        sesion_id=sesion_id,
        computadora_id=data.computadora_id,
        alumno_nombre=nombre,
        alumno_matricula=matricula,
        db=db,
        current_user=None,
    )


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
    return {
        "pcs": pcs,
        "sesion_id": sesion_id,
        "laboratorio_id": s.laboratorio_id,
        "estado": s.estado,
    }


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
    ahora = _utcnow()
    for a in asigs_abiertas:
        a.hora_liberacion = ahora

    s.estado = "CERRADA"
    s.fin_real = ahora
    s.observacion_general = data.observacion_general
    # Calcular tiempo extra
    overtime_min = 0
    if s.fin_estimado and ahora > s.fin_estimado:
        overtime_min = int((ahora - s.fin_estimado).total_seconds() / 60)
    s.overtime_min = overtime_min

    # Revertir reservacion a PROGRAMADA si estaba EN_CURSO
    if s.reservacion_id is not None:
        res = db.query(Reservacion).filter(Reservacion.id == s.reservacion_id).first()
        if res and res.estado == "EN_CURSO":
            res.estado = "PROGRAMADA"

    db.commit()
    registrar(db, accion=Accion.CERRAR_SESION, recurso=Recurso.SESION,
              usuario=current_user, recurso_id=s.id,
              detalle={"laboratorio_id": s.laboratorio_id, "codigo": s.codigo_sesion,
                       "overtime_min": overtime_min, "pcs_liberadas": len(asigs_abiertas)},
              request=request)
    db.refresh(s)

    # ── Notificación de tiempo extra al cerrar ───────────────────────────────
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
                    titulo=f"Sesión cerrada con tiempo extra — {lab_nombre}",
                    mensaje=(
                        f"La sesión #{s.id} de {docente_nombre} en {lab_nombre} "
                        f"tuvo {overtime_min} min de tiempo extra. "
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
        "cerrada_por": {
            "id": current_user.id,
            "nombre": current_user.nombre,
            "rol": current_user.rol.value if hasattr(current_user.rol, "value") else str(current_user.rol),
        },
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
    request: Request,
    sesion_id: int,
    data: AsignacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return await _crear_asignacion_pc(
        request=request,
        sesion_id=sesion_id,
        computadora_id=data.computadora_id,
        alumno_nombre=data.alumno_nombre,
        alumno_matricula=data.alumno_matricula,
        db=db,
        current_user=current_user,
    )


@router.delete("/{sesion_id}/asignaciones/{asig_id}", summary="Liberar PC")
async def liberar_pc(
    request: Request,
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
    asig.hora_liberacion = _utcnow()
    db.commit()

    registrar(db, accion=Accion.LIBERAR_PC, recurso=Recurso.SESION,
              usuario=current_user, recurso_id=asig.id,
              detalle={"sesion_id": sesion_id, "computadora_id": asig.computadora_id,
                       "pc_codigo": pc.codigo if pc else None},
              request=request)

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
    bloquear:       bool          = False    # Si True → PC pasa a MANTENIMIENTO

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

            # Bloquear PC si se solicitó
            if obs.bloquear:
                pc.estado = "MANTENIMIENTO"

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
    s.recepcion_fin        = _utcnow()
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
