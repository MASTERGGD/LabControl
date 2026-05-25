"""
Router — Consultorio Médico
Gestión de consultas, pacientes, estadísticas y PDF de receta
"""
from __future__ import annotations

import io
import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.usuario import Usuario, RolUsuario
from models.consultorio import Paciente, ConsultaMedica, CanalizacionMedica
from models.catalogo import CatalogoAlumno
from models.tutoria import Canalizacion as CanalizacionTutoria

# reportlab
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

router = APIRouter(prefix="/consultorio", tags=["Consultorio"])

# ─── Helpers de permisos ──────────────────────────────────────────────────────

ROLES_MEDICO   = {RolUsuario.MEDICO}
ROLES_CONSULTA = {RolUsuario.MEDICO, RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN,
                  RolUsuario.TUTORIA_ADMIN, RolUsuario.DOCENTE}


def _require_medico(user: Usuario):
    tiene_acceso = (
        user.rol in (RolUsuario.MEDICO, RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN)
        or bool(getattr(user, "acceso_consultorio", False))
    )
    if not tiene_acceso:
        raise HTTPException(403, "Solo el médico puede realizar esta acción")


def _require_consulta(user: Usuario):
    tiene_acceso = (
        user.rol in ROLES_CONSULTA
        or bool(getattr(user, "acceso_consultorio", False))
    )
    if not tiene_acceso:
        raise HTTPException(403, "Sin permiso para ver consultas")


# ─── Schemas ─────────────────────────────────────────────────────────────────

class PacienteCreate(BaseModel):
    tipo: str = "ALUMNO"
    alumno_id: Optional[int] = None
    nombre: str
    matricula_o_emp: Optional[str] = None
    fecha_nacimiento: Optional[datetime.date] = None
    sexo: Optional[str] = None
    carrera: Optional[str] = None
    cuatrimestre: Optional[int] = None
    departamento: Optional[str] = None


class ConsultaCreate(BaseModel):
    paciente_id: int
    fecha_consulta: Optional[datetime.datetime] = None
    temperatura: Optional[float] = None
    presion_arterial: Optional[str] = None
    peso: Optional[float] = None
    talla: Optional[float] = None
    frecuencia_cardiaca: Optional[int] = None
    saturacion_oxigeno: Optional[float] = None
    motivo_consulta: str
    diagnostico: str
    medicamentos: Optional[str] = None
    indicaciones: Optional[str] = None
    genera_incapacidad: bool = False
    dias_incapacidad: Optional[int] = None
    fecha_inicio_incapacidad: Optional[datetime.date] = None
    requiere_seguimiento: bool = False
    fecha_seguimiento: Optional[datetime.date] = None
    seguimiento_notas: Optional[str] = None
    origen: str = "ESPONTANEA"
    canalizacion_tutoria_id: Optional[int] = None
    # canalizaciones de salida (opcional, lista)
    canalizaciones: Optional[List[dict]] = None


class ConsultaUpdate(BaseModel):
    temperatura: Optional[float] = None
    presion_arterial: Optional[str] = None
    peso: Optional[float] = None
    talla: Optional[float] = None
    frecuencia_cardiaca: Optional[int] = None
    saturacion_oxigeno: Optional[float] = None
    motivo_consulta: Optional[str] = None
    diagnostico: Optional[str] = None
    medicamentos: Optional[str] = None
    indicaciones: Optional[str] = None
    genera_incapacidad: Optional[bool] = None
    dias_incapacidad: Optional[int] = None
    fecha_inicio_incapacidad: Optional[datetime.date] = None
    requiere_seguimiento: Optional[bool] = None
    fecha_seguimiento: Optional[datetime.date] = None
    seguimiento_notas: Optional[str] = None


class CanalizacionUpdate(BaseModel):
    estado: str
    fecha_atencion: Optional[datetime.datetime] = None
    notas_seguimiento: Optional[str] = None


# ─── Serialización ────────────────────────────────────────────────────────────

def _paciente_dict(p: Paciente) -> dict:
    return {
        "id": p.id,
        "tipo": p.tipo,
        "alumno_id": p.alumno_id,
        "nombre": p.nombre,
        "matricula_o_emp": p.matricula_o_emp,
        "fecha_nacimiento": p.fecha_nacimiento.isoformat() if p.fecha_nacimiento else None,
        "sexo": p.sexo,
        "carrera": p.carrera,
        "cuatrimestre": p.cuatrimestre,
        "departamento": p.departamento,
        "activo": p.activo,
    }


def _consulta_dict(c: ConsultaMedica, db: Session) -> dict:
    pac = db.get(Paciente, c.paciente_id)
    cans = db.query(CanalizacionMedica).filter(
        CanalizacionMedica.consulta_id == c.id
    ).all()
    return {
        "id": c.id,
        "paciente_id": c.paciente_id,
        "paciente_nombre": c.paciente_nombre_snapshot or (pac.nombre if pac else ""),
        "paciente_tipo": c.paciente_tipo_snapshot or (pac.tipo if pac else ""),
        "paciente_matricula": c.paciente_matricula_snapshot or (pac.matricula_o_emp if pac else ""),
        "paciente_sexo": c.paciente_sexo_snapshot or (pac.sexo if pac else ""),
        "paciente_carrera": c.paciente_carrera_snapshot or (pac.carrera if pac else ""),
        "paciente_cuatrimestre": c.paciente_cuatrimestre_snapshot or (pac.cuatrimestre if pac else None),
        "paciente_departamento": c.paciente_departamento_snapshot or (pac.departamento if pac else ""),
        "fecha_consulta": c.fecha_consulta.isoformat() if c.fecha_consulta else None,
        "temperatura": c.temperatura,
        "presion_arterial": c.presion_arterial,
        "peso": c.peso,
        "talla": c.talla,
        "frecuencia_cardiaca": c.frecuencia_cardiaca,
        "saturacion_oxigeno": c.saturacion_oxigeno,
        "motivo_consulta": c.motivo_consulta,
        "diagnostico": c.diagnostico,
        "medicamentos": c.medicamentos,
        "indicaciones": c.indicaciones,
        "genera_incapacidad": c.genera_incapacidad,
        "dias_incapacidad": c.dias_incapacidad,
        "fecha_inicio_incapacidad": c.fecha_inicio_incapacidad.isoformat() if c.fecha_inicio_incapacidad else None,
        "fecha_fin_incapacidad": c.fecha_fin_incapacidad.isoformat() if c.fecha_fin_incapacidad else None,
        "requiere_seguimiento": c.requiere_seguimiento,
        "fecha_seguimiento": c.fecha_seguimiento.isoformat() if c.fecha_seguimiento else None,
        "seguimiento_notas": c.seguimiento_notas,
        "origen": c.origen,
        "canalizacion_tutoria_id": c.canalizacion_tutoria_id,
        "atendido_por": c.atendido_por,
        "creado_en": c.creado_en.isoformat() if c.creado_en else None,
        "canalizaciones": [_can_dict(x) for x in cans],
    }


def _can_dict(c: CanalizacionMedica) -> dict:
    return {
        "id": c.id,
        "consulta_id": c.consulta_id,
        "paciente_id": c.paciente_id,
        "destino": c.destino,
        "motivo": c.motivo,
        "estado": c.estado,
        "fecha_canaliza": c.fecha_canaliza.isoformat() if c.fecha_canaliza else None,
        "fecha_atencion": c.fecha_atencion.isoformat() if c.fecha_atencion else None,
        "notas_seguimiento": c.notas_seguimiento,
    }


def _snapshot_paciente(p: Paciente) -> dict:
    return {
        "paciente_nombre_snapshot": p.nombre,
        "paciente_tipo_snapshot": p.tipo,
        "paciente_matricula_snapshot": p.matricula_o_emp,
        "paciente_sexo_snapshot": p.sexo,
        "paciente_carrera_snapshot": p.carrera,
        "paciente_cuatrimestre_snapshot": p.cuatrimestre,
        "paciente_departamento_snapshot": p.departamento,
    }


def _calcular_incapacidad(
    genera: bool,
    dias: Optional[int],
    inicio: Optional[datetime.date],
    fecha_consulta: datetime.datetime,
) -> tuple[Optional[int], Optional[datetime.date], Optional[datetime.date]]:
    if not genera:
        return None, None, None
    if not dias or dias < 1:
        raise HTTPException(422, "Indica uno o mas dias de incapacidad")
    inicio_final = inicio or fecha_consulta.date()
    fin = inicio_final + datetime.timedelta(days=dias - 1)
    return dias, inicio_final, fin


# ─── PACIENTES ────────────────────────────────────────────────────────────────

@router.get("/pacientes/buscar", summary="Buscar paciente por nombre o matrícula")
def buscar_paciente(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    term = " ".join(q.strip().split())
    like = f"%{term}%"
    pacientes = db.query(Paciente).filter(
        Paciente.activo == True,
        (Paciente.nombre.ilike(like)) |
        (Paciente.matricula_o_emp.ilike(like)) |
        (Paciente.carrera.ilike(like)) |
        (Paciente.departamento.ilike(like))
    ).limit(20).all()
    encontrados = {p.id: p for p in pacientes}

    consultas = (
        db.query(ConsultaMedica)
        .filter(
            (ConsultaMedica.paciente_nombre_snapshot.ilike(like)) |
            (ConsultaMedica.paciente_matricula_snapshot.ilike(like)) |
            (ConsultaMedica.paciente_carrera_snapshot.ilike(like)) |
            (ConsultaMedica.paciente_departamento_snapshot.ilike(like)) |
            (ConsultaMedica.motivo_consulta.ilike(like)) |
            (ConsultaMedica.diagnostico.ilike(like))
        )
        .order_by(ConsultaMedica.fecha_consulta.desc())
        .limit(20)
        .all()
    )
    for consulta in consultas:
        if consulta.paciente_id not in encontrados:
            paciente = db.get(Paciente, consulta.paciente_id)
            if paciente and paciente.activo:
                encontrados[paciente.id] = paciente

    return [_paciente_dict(p) for p in encontrados.values()]


@router.get("/pacientes/buscar-alumno", summary="Buscar alumno del catálogo para registrar como paciente")
def buscar_alumno(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    like = f"%{q}%"
    # Usamos isnot(False) para no excluir registros con activo=NULL
    alumnos = db.query(CatalogoAlumno).filter(
        CatalogoAlumno.activo.isnot(False),
    ).filter(
        (CatalogoAlumno.matricula.ilike(like)) |
        (CatalogoAlumno.apellido_paterno.ilike(like)) |
        (CatalogoAlumno.apellido_materno.ilike(like)) |
        (CatalogoAlumno.nombres.ilike(like))
    ).order_by(CatalogoAlumno.apellido_paterno).limit(20).all()

    return [
        {
            "id": a.id,
            "nombre": f"{a.apellido_paterno} {a.apellido_materno} {a.nombres}".strip(),
            "matricula": a.matricula,
            "carrera": a.carrera,
            "cuatrimestre": a.cuatrimestre,
            "grupo": a.grupo,
            "periodo": a.periodo,
        }
        for a in alumnos
    ]


@router.get("/pacientes/buscar-personal", summary="Buscar personal (docentes/administrativos) del sistema")
def buscar_personal(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    like = f"%{q}%"
    # Busca en todos los usuarios activos que no sean alumnos
    personal = db.query(Usuario).filter(
        Usuario.activo == True,
        Usuario.rol != RolUsuario.ALUMNO,
        (Usuario.nombre.ilike(like)) | (Usuario.numero_empleado.ilike(like))
    ).order_by(Usuario.nombre).limit(20).all()

    result = []
    for u in personal:
        # Obtener nombre del departamento si tiene
        dept_nombre = None
        if u.departamento_id:
            from models.departamento import Departamento
            dept = db.get(Departamento, u.departamento_id)
            dept_nombre = dept.nombre if dept else None

        result.append({
            "usuario_id": u.id,
            "nombre": u.nombre,
            "numero_empleado": u.numero_empleado,
            "rol": u.rol,
            "departamento": dept_nombre,
            "departamento_id": u.departamento_id,
        })
    return result


@router.post("/pacientes", summary="Registrar nuevo paciente")
def crear_paciente(
    data: PacienteCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)

    # Si es alumno y tiene alumno_id, verificar que no exista ya como paciente
    if data.alumno_id:
        existe = db.query(Paciente).filter(
            Paciente.alumno_id == data.alumno_id
        ).first()
        if existe:
            return _paciente_dict(existe)

    pac = Paciente(
        tipo=data.tipo,
        alumno_id=data.alumno_id,
        nombre=data.nombre,
        matricula_o_emp=data.matricula_o_emp,
        fecha_nacimiento=data.fecha_nacimiento,
        sexo=data.sexo,
        carrera=data.carrera,
        cuatrimestre=data.cuatrimestre,
        departamento=data.departamento,
        creado_en=datetime.datetime.utcnow(),
    )
    db.add(pac)
    db.commit()
    db.refresh(pac)
    return _paciente_dict(pac)


@router.get("/pacientes/{paciente_id}", summary="Detalle y expediente de un paciente")
def get_paciente(
    paciente_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    pac = db.get(Paciente, paciente_id)
    if not pac:
        raise HTTPException(404, "Paciente no encontrado")

    consultas = db.query(ConsultaMedica).filter(
        ConsultaMedica.paciente_id == paciente_id
    ).order_by(ConsultaMedica.fecha_consulta.desc()).all()

    return {
        **_paciente_dict(pac),
        "total_consultas": len(consultas),
        "consultas": [_consulta_dict(c, db) for c in consultas],
    }


# ─── CONSULTAS ────────────────────────────────────────────────────────────────

@router.get("/consultas", summary="Listar consultas con filtros")
def listar_consultas(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    tipo_paciente: Optional[str] = None,
    origen: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    q = db.query(ConsultaMedica)

    if fecha_desde:
        q = q.filter(ConsultaMedica.fecha_consulta >= fecha_desde)
    if fecha_hasta:
        q = q.filter(ConsultaMedica.fecha_consulta <= fecha_hasta + " 23:59:59")
    if tipo_paciente:
        pids = [p.id for p in db.query(Paciente).filter(Paciente.tipo == tipo_paciente).all()]
        q = q.filter(ConsultaMedica.paciente_id.in_(pids))
    if origen:
        q = q.filter(ConsultaMedica.origen == origen)

    total = q.count()
    consultas = q.order_by(ConsultaMedica.fecha_consulta.desc()).offset(skip).limit(limit).all()
    return {
        "total": total,
        "consultas": [_consulta_dict(c, db) for c in consultas],
    }


@router.post("/consultas", summary="Registrar nueva consulta médica")
def crear_consulta(
    data: ConsultaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)

    pac = db.get(Paciente, data.paciente_id)
    if not pac:
        raise HTTPException(404, "Paciente no encontrado")

    now = datetime.datetime.utcnow()
    fecha_consulta = data.fecha_consulta or now
    dias_inc, inicio_inc, fin_inc = _calcular_incapacidad(
        data.genera_incapacidad,
        data.dias_incapacidad,
        data.fecha_inicio_incapacidad,
        fecha_consulta,
    )
    snapshot = _snapshot_paciente(pac)
    c = ConsultaMedica(
        paciente_id=data.paciente_id,
        fecha_consulta=fecha_consulta,
        temperatura=data.temperatura,
        presion_arterial=data.presion_arterial,
        peso=data.peso,
        talla=data.talla,
        frecuencia_cardiaca=data.frecuencia_cardiaca,
        saturacion_oxigeno=data.saturacion_oxigeno,
        motivo_consulta=data.motivo_consulta,
        diagnostico=data.diagnostico,
        medicamentos=data.medicamentos,
        indicaciones=data.indicaciones,
        genera_incapacidad=data.genera_incapacidad,
        dias_incapacidad=dias_inc,
        fecha_inicio_incapacidad=inicio_inc,
        fecha_fin_incapacidad=fin_inc,
        requiere_seguimiento=data.requiere_seguimiento,
        fecha_seguimiento=data.fecha_seguimiento,
        seguimiento_notas=data.seguimiento_notas,
        origen=data.origen,
        canalizacion_tutoria_id=data.canalizacion_tutoria_id,
        atendido_por=current_user.id,
        creado_en=now,
        **snapshot,
    )
    db.add(c)
    db.flush()  # para obtener c.id antes de commit

    # Canalizaciones de salida opcionales
    if data.canalizaciones:
        for can_data in data.canalizaciones:
            can = CanalizacionMedica(
                consulta_id=c.id,
                paciente_id=data.paciente_id,
                destino=can_data.get("destino", "OTRO"),
                motivo=can_data.get("motivo"),
                estado="PENDIENTE",
                fecha_canaliza=now,
                creado_por=current_user.id,
            )
            db.add(can)

    db.commit()
    db.refresh(c)
    return _consulta_dict(c, db)


@router.get("/consultas/{consulta_id}", summary="Detalle de una consulta")
def get_consulta(
    consulta_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    c = db.get(ConsultaMedica, consulta_id)
    if not c:
        raise HTTPException(404, "Consulta no encontrada")
    return _consulta_dict(c, db)


@router.put("/consultas/{consulta_id}", summary="Actualizar consulta médica")
def actualizar_consulta(
    consulta_id: int,
    data: ConsultaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    c = db.get(ConsultaMedica, consulta_id)
    if not c:
        raise HTTPException(404, "Consulta no encontrada")

    body = data.dict(exclude_none=True)
    if any(field in body for field in ("genera_incapacidad", "dias_incapacidad", "fecha_inicio_incapacidad")):
        genera = body.get("genera_incapacidad", c.genera_incapacidad)
        dias = body.get("dias_incapacidad", c.dias_incapacidad)
        inicio = body.get("fecha_inicio_incapacidad", c.fecha_inicio_incapacidad)
        dias_inc, inicio_inc, fin_inc = _calcular_incapacidad(genera, dias, inicio, c.fecha_consulta)
        body["dias_incapacidad"] = dias_inc
        body["fecha_inicio_incapacidad"] = inicio_inc
        body["fecha_fin_incapacidad"] = fin_inc
    for field, value in body.items():
        setattr(c, field, value)
    db.commit()
    db.refresh(c)
    return _consulta_dict(c, db)


# ─── CANALIZACIONES ───────────────────────────────────────────────────────────

@router.get("/canalizaciones", summary="Canalizaciones pendientes y su estado")
def listar_canalizaciones(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    q = db.query(CanalizacionMedica)
    if estado:
        q = q.filter(CanalizacionMedica.estado == estado)
    cans = q.order_by(CanalizacionMedica.fecha_canaliza.desc()).all()
    result = []
    for can in cans:
        pac = db.get(Paciente, can.paciente_id)
        d = _can_dict(can)
        d["paciente_nombre"] = pac.nombre if pac else ""
        result.append(d)
    return result


@router.put("/canalizaciones/{can_id}", summary="Actualizar estado de canalización")
def actualizar_canalizacion(
    can_id: int,
    data: CanalizacionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    can = db.get(CanalizacionMedica, can_id)
    if not can:
        raise HTTPException(404, "Canalización no encontrada")
    can.estado = data.estado
    if data.fecha_atencion:
        can.fecha_atencion = data.fecha_atencion
    if data.notas_seguimiento:
        can.notas_seguimiento = data.notas_seguimiento
    db.commit()
    return _can_dict(can)


# ─── CANALIZACIONES DESDE TUTORÍA ────────────────────────────────────────────

@router.get("/canalizaciones-tutoria", summary="Canalizaciones médicas pendientes enviadas desde Tutoría")
def canalizaciones_desde_tutoria(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)

    # Traer canalizaciones de tutoría marcadas como tipo_medico y no atendidas aún
    cans = db.query(CanalizacionTutoria).filter(
        CanalizacionTutoria.tipo_medico == True,
        CanalizacionTutoria.estado.in_(["PENDIENTE", "EN_SEGUIMIENTO"]),
    ).order_by(CanalizacionTutoria.fecha_solicitud.desc()).all()

    result = []
    for c in cans:
        # Datos del alumno
        alumno = db.get(CatalogoAlumno, c.alumno_id)
        nombre_alumno = (
            f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip()
            if alumno else "Alumno desconocido"
        )
        matricula = alumno.matricula if alumno else ""
        carrera   = alumno.carrera   if alumno else ""

        # Datos del tutor
        tutor = db.get(Usuario, c.tutor_id)
        nombre_tutor = tutor.nombre if tutor else ""

        # ¿Ya existe como paciente en el consultorio?
        paciente = db.query(Paciente).filter(
            Paciente.alumno_id == c.alumno_id
        ).first()

        result.append({
            "canalizacion_id": c.id,
            "alumno_id": c.alumno_id,
            "alumno_nombre": nombre_alumno,
            "alumno_matricula": matricula,
            "alumno_carrera": carrera,
            "tutor_nombre": nombre_tutor,
            "motivo": c.motivo,
            "estado": c.estado,
            "fecha_solicitud": c.fecha_solicitud.isoformat() if c.fecha_solicitud else None,
            "consulta_medica_id": c.consulta_medica_id,
            "paciente_id": paciente.id if paciente else None,
            # Datos para pre-registrar paciente si no existe
            "alumno_carrera": carrera,
            "alumno_cuatrimestre": alumno.cuatrimestre if alumno else None,
            "alumno_grupo": alumno.grupo if alumno else None,
        })
    return result


@router.post("/canalizaciones-tutoria/{canalizacion_id}/atender",
             summary="Registrar consulta vinculada a una canalización de tutoría")
def atender_canalizacion_tutoria(
    canalizacion_id: int,
    data: "ConsultaCreate",
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)

    can_tut = db.get(CanalizacionTutoria, canalizacion_id)
    if not can_tut:
        raise HTTPException(404, "Canalización de tutoría no encontrada")
    if not can_tut.tipo_medico:
        raise HTTPException(400, "Esta canalización no es de tipo médico")

    # Asegurar que el paciente existe; si no, crearlo automáticamente
    paciente = db.query(Paciente).filter(Paciente.alumno_id == can_tut.alumno_id).first()
    if not paciente:
        alumno = db.get(CatalogoAlumno, can_tut.alumno_id)
        if not alumno:
            raise HTTPException(404, "Alumno no encontrado en el catálogo")
        nombre = f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip()
        paciente = Paciente(
            tipo="ALUMNO",
            alumno_id=alumno.id,
            nombre=nombre,
            matricula_o_emp=alumno.matricula,
            carrera=alumno.carrera,
            cuatrimestre=alumno.cuatrimestre,
            creado_en=datetime.datetime.utcnow(),
        )
        db.add(paciente)
        db.flush()

    # Crear la consulta con origen CANALIZADA_TUTORIA
    now = datetime.datetime.utcnow()
    fecha_consulta = data.fecha_consulta or now
    dias_inc, inicio_inc, fin_inc = _calcular_incapacidad(
        data.genera_incapacidad,
        data.dias_incapacidad,
        data.fecha_inicio_incapacidad,
        fecha_consulta,
    )
    snapshot = _snapshot_paciente(paciente)
    consulta = ConsultaMedica(
        paciente_id=paciente.id,
        fecha_consulta=fecha_consulta,
        temperatura=data.temperatura,
        presion_arterial=data.presion_arterial,
        peso=data.peso,
        talla=data.talla,
        frecuencia_cardiaca=data.frecuencia_cardiaca,
        saturacion_oxigeno=data.saturacion_oxigeno,
        motivo_consulta=data.motivo_consulta,
        diagnostico=data.diagnostico,
        medicamentos=data.medicamentos,
        indicaciones=data.indicaciones,
        genera_incapacidad=data.genera_incapacidad,
        dias_incapacidad=dias_inc,
        fecha_inicio_incapacidad=inicio_inc,
        fecha_fin_incapacidad=fin_inc,
        requiere_seguimiento=data.requiere_seguimiento,
        fecha_seguimiento=data.fecha_seguimiento,
        seguimiento_notas=data.seguimiento_notas,
        origen="CANALIZADA_TUTORIA",
        canalizacion_tutoria_id=canalizacion_id,
        atendido_por=current_user.id,
        creado_en=now,
        **snapshot,
    )
    db.add(consulta)
    db.flush()

    # Actualizar la canalización de tutoría: atendida + referencia a la consulta
    can_tut.estado = "ATENDIDA"
    can_tut.consulta_medica_id = consulta.id
    can_tut.fecha_atencion = now.date()
    can_tut.atendido_por = current_user.id

    # Canalizaciones de salida opcionales
    if data.canalizaciones:
        for can_data in data.canalizaciones:
            can = CanalizacionMedica(
                consulta_id=consulta.id,
                paciente_id=paciente.id,
                destino=can_data.get("destino", "OTRO"),
                motivo=can_data.get("motivo"),
                estado="PENDIENTE",
                fecha_canaliza=now,
                creado_por=current_user.id,
            )
            db.add(can)

    db.commit()
    db.refresh(consulta)
    return _consulta_dict(consulta, db)


# ─── ESTADÍSTICAS ─────────────────────────────────────────────────────────────

@router.get("/estadisticas", summary="Dashboard estadístico del consultorio")
def estadisticas(
    anio: int = Query(default=None),
    mes: Optional[int] = Query(default=None, ge=1, le=12),
    cuatrimestre: Optional[int] = Query(default=None, ge=1, le=3),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)

    now = datetime.datetime.utcnow()
    anio = anio or now.year

    base_anio = db.query(ConsultaMedica).filter(
        extract("year", ConsultaMedica.fecha_consulta) == anio
    )
    base = base_anio
    if cuatrimestre:
        inicio = (cuatrimestre - 1) * 4 + 1
        fin = inicio + 3
        base = base.filter(
            extract("month", ConsultaMedica.fecha_consulta) >= inicio,
            extract("month", ConsultaMedica.fecha_consulta) <= fin,
        )
    if mes:
        base = base.filter(extract("month", ConsultaMedica.fecha_consulta) == mes)

    total_anio = base_anio.count()
    total_periodo = base.count()

    # Por mes
    por_mes = []
    for mes_num in range(1, 13):
        cnt = base_anio.filter(extract("month", ConsultaMedica.fecha_consulta) == mes_num).count()
        por_mes.append({"mes": mes_num, "total": cnt})

    por_cuatrimestre = []
    for cnum, meses in ((1, (1, 4)), (2, (5, 8)), (3, (9, 12))):
        cnt = base_anio.filter(
            extract("month", ConsultaMedica.fecha_consulta) >= meses[0],
            extract("month", ConsultaMedica.fecha_consulta) <= meses[1],
        ).count()
        por_cuatrimestre.append({
            "cuatrimestre": cnum,
            "label": ["ENE-ABR", "MAY-AGO", "SEP-DIC"][cnum - 1],
            "total": cnt,
        })

    # Por sexo (join con pacientes)
    por_sexo = {}
    consultas_anio = base.all()
    for c in consultas_anio:
        pac = db.get(Paciente, c.paciente_id)
        sexo = (pac.sexo or "OTRO") if pac else "OTRO"
        por_sexo[sexo] = por_sexo.get(sexo, 0) + 1

    # Por tipo paciente
    por_tipo = {}
    for c in consultas_anio:
        pac = db.get(Paciente, c.paciente_id)
        tipo = pac.tipo if pac else "DESCONOCIDO"
        por_tipo[tipo] = por_tipo.get(tipo, 0) + 1

    # Por origen
    por_origen = {}
    for c in consultas_anio:
        por_origen[c.origen] = por_origen.get(c.origen, 0) + 1

    # Incapacidades
    incapacidades = base.filter(ConsultaMedica.genera_incapacidad == True).count()

    # Diagnósticos frecuentes (top 10 palabras significativas en diagnóstico)
    diag_counter: dict = {}
    for c in consultas_anio:
        if c.diagnostico:
            diag = c.diagnostico.strip()
            diag_counter[diag] = diag_counter.get(diag, 0) + 1
    top_diagnosticos = sorted(diag_counter.items(), key=lambda x: x[1], reverse=True)[:10]

    # Cuatrimestre activo (mes actual)
    mes_actual = now.month
    consultas_mes = base.filter(
        extract("month", ConsultaMedica.fecha_consulta) == mes_actual
    ).count()

    # Seguimientos pendientes
    seguimientos_pendientes = db.query(ConsultaMedica).filter(
        ConsultaMedica.requiere_seguimiento == True,
        ConsultaMedica.fecha_seguimiento != None,
        ConsultaMedica.fecha_seguimiento >= now.date(),
    ).count()

    # Canalizaciones pendientes
    cans_pendientes = db.query(CanalizacionMedica).filter(
        CanalizacionMedica.estado == "PENDIENTE"
    ).count()

    return {
        "anio": anio,
        "total_anio": total_anio,
        "total_periodo": total_periodo,
        "filtro_mes": mes,
        "filtro_cuatrimestre": cuatrimestre,
        "consultas_mes_actual": consultas_mes,
        "incapacidades_anio": incapacidades,
        "seguimientos_pendientes": seguimientos_pendientes,
        "canalizaciones_pendientes": cans_pendientes,
        "por_mes": por_mes,
        "por_cuatrimestre": por_cuatrimestre,
        "por_sexo": por_sexo,
        "por_tipo": por_tipo,
        "por_origen": por_origen,
        "top_diagnosticos": [{"diagnostico": d, "total": t} for d, t in top_diagnosticos],
    }


# ─── PDF RECETA ───────────────────────────────────────────────────────────────

def _build_pdf_receta(consulta_id: int, db: Session) -> bytes:
    c = db.get(ConsultaMedica, consulta_id)
    if not c:
        raise HTTPException(404, "Consulta no encontrada")

    pac = db.get(Paciente, c.paciente_id)
    medico = db.get(Usuario, c.atendido_por)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    titulo  = ParagraphStyle("titulo",  parent=styles["Normal"], fontSize=13,
                              fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=2)
    subtit  = ParagraphStyle("subtit",  parent=styles["Normal"], fontSize=10,
                              fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=4)
    normal  = ParagraphStyle("normal",  parent=styles["Normal"], fontSize=9,
                              fontName="Helvetica", spaceAfter=3)
    label   = ParagraphStyle("label",   parent=styles["Normal"], fontSize=9,
                              fontName="Helvetica-Bold", spaceAfter=1)
    small   = ParagraphStyle("small",   parent=styles["Normal"], fontSize=8,
                              fontName="Helvetica", textColor=colors.gray)

    story = []

    # ── Encabezado institucional ──────────────────────────────────────────────
    logo_path = Path(__file__).resolve().parents[1] / "assets" / "tutoria" / "utecan_logo.jpg"
    logo = RLImage(str(logo_path), width=3.8 * cm, height=1.1 * cm) if logo_path.exists() else Paragraph("<b>UTECAN</b>", titulo)
    header = Table(
        [[
            logo,
            [
                Paragraph("UNIVERSIDAD TECNOLÓGICA DE CANDELARIA", titulo),
                Paragraph("DEPARTAMENTO DE SERVICIOS ESTUDIANTILES", subtit),
                Paragraph("CONSULTORIO MÉDICO", subtit),
                Paragraph("NOTA DE CONSULTA", subtit),
            ],
        ]],
        colWidths=[4.2 * cm, 13.8 * cm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
    ]))
    story.append(header)
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black, spaceAfter=6))

    # ── Fecha y folio ─────────────────────────────────────────────────────────
    fecha_str = c.fecha_consulta.strftime("%d de %B de %Y") if c.fecha_consulta else "—"
    folio_str = f"Folio: {c.id:05d}"

    story.append(Table(
        [[Paragraph(f"Fecha: {fecha_str}", normal),
          Paragraph(folio_str, ParagraphStyle("r", parent=normal, alignment=TA_RIGHT))]],
        colWidths=["70%", "30%"],
        style=TableStyle([("ALIGN", (1, 0), (1, 0), "RIGHT")])
    ))
    story.append(Spacer(1, 0.3 * cm))

    # ── Datos del paciente ────────────────────────────────────────────────────
    nombre_pac = c.paciente_nombre_snapshot or (pac.nombre if pac else "—")
    tipo_pac   = c.paciente_tipo_snapshot or (pac.tipo if pac else "—")
    sexo_raw   = c.paciente_sexo_snapshot or (pac.sexo if pac else "")
    sexo_pac   = {"M": "Masculino", "F": "Femenino", "OTRO": "Otro"}.get(sexo_raw or "", "—")
    edad_str   = "—"
    if pac and pac.fecha_nacimiento:
        hoy   = datetime.date.today()
        edad  = hoy.year - pac.fecha_nacimiento.year - (
            (hoy.month, hoy.day) < (pac.fecha_nacimiento.month, pac.fecha_nacimiento.day)
        )
        edad_str = f"{edad} años"

    story.append(Paragraph("DATOS DEL PACIENTE", label))
    datos_pac = [
        ["Nombre:", nombre_pac, "Tipo:", tipo_pac],
        ["Sexo:", sexo_pac, "Edad:", edad_str],
    ]
    carrera_pac = c.paciente_carrera_snapshot or (pac.carrera if pac else None)
    cuatri_pac = c.paciente_cuatrimestre_snapshot or (pac.cuatrimestre if pac else None)
    depto_pac = c.paciente_departamento_snapshot or (pac.departamento if pac else None)
    matricula_pac = c.paciente_matricula_snapshot or (pac.matricula_o_emp if pac else None)
    if carrera_pac:
        datos_pac.append(["Carrera:", carrera_pac, "Cuatrimestre:", str(cuatri_pac or "—")])
    if depto_pac:
        datos_pac.append(["Departamento:", depto_pac, "", ""])
    if matricula_pac:
        datos_pac.append(["Matrícula/Empleado:", matricula_pac, "", ""])

    t_datos = Table(datos_pac, colWidths=[3.5 * cm, 7 * cm, 3.5 * cm, 4 * cm])
    t_datos.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t_datos)
    story.append(Spacer(1, 0.3 * cm))

    # ── Signos vitales ────────────────────────────────────────────────────────
    sv_items = []
    if c.temperatura:
        sv_items.append(f"Temperatura: {c.temperatura} °C")
    if c.presion_arterial:
        sv_items.append(f"Presión Arterial: {c.presion_arterial} mmHg")
    if c.peso:
        sv_items.append(f"Peso: {c.peso} kg")
    if c.talla:
        sv_items.append(f"Talla: {c.talla} cm")
    if c.frecuencia_cardiaca:
        sv_items.append(f"Frec. Cardíaca: {c.frecuencia_cardiaca} lpm")
    if c.saturacion_oxigeno:
        sv_items.append(f"Saturación O₂: {c.saturacion_oxigeno}%")

    if sv_items:
        story.append(Paragraph("SIGNOS VITALES", label))
        # 3 columnas
        rows = []
        for i in range(0, len(sv_items), 3):
            row = sv_items[i:i+3]
            while len(row) < 3:
                row.append("")
            rows.append(row)
        t_sv = Table(rows, colWidths=[6 * cm, 6 * cm, 6 * cm])
        t_sv.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("BACKGROUND", (0, 0), (-1, -1), colors.Color(0.95, 0.97, 1)),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ]))
        story.append(t_sv)
        story.append(Spacer(1, 0.3 * cm))

    # ── Motivo de consulta
    story.append(Paragraph("MOTIVO DE CONSULTA", label))
    story.append(Paragraph(c.motivo_consulta or "—", normal))
    story.append(Spacer(1, 0.2 * cm))

    # ── Diagnóstico
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=4))
    story.append(Paragraph("DIAGNÓSTICO", label))
    story.append(Paragraph(c.diagnostico or "—", normal))
    story.append(Spacer(1, 0.3 * cm))

    # ── Receta
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=4))
    story.append(Paragraph("℞  RECETA MÉDICA", label))
    if c.medicamentos:
        for linea in c.medicamentos.split("\n"):
            if linea.strip():
                story.append(Paragraph(f"• {linea.strip()}", normal))
    else:
        story.append(Paragraph("Sin medicamentos prescritos.", normal))
    story.append(Spacer(1, 0.3 * cm))

    # ── Indicaciones
    if c.indicaciones:
        story.append(Paragraph("INDICACIONES Y CUIDADOS", label))
        for linea in c.indicaciones.split("\n"):
            if linea.strip():
                story.append(Paragraph(f"→ {linea.strip()}", normal))
        story.append(Spacer(1, 0.3 * cm))

    # ── Incapacidad
    if c.genera_incapacidad:
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=4))
        story.append(Paragraph("INCAPACIDAD MÉDICA", label))
        fi = c.fecha_inicio_incapacidad.strftime("%d/%m/%Y") if c.fecha_inicio_incapacidad else "—"
        story.append(Paragraph(
            f"Se extiende incapacidad por <b>{c.dias_incapacidad or '—'} día(s)</b> "
            f"del {fi} al {(c.fecha_fin_incapacidad.strftime('%d/%m/%Y') if c.fecha_fin_incapacidad else fi)}.",
            normal
        ))
        story.append(Spacer(1, 0.3 * cm))

    # ── Seguimiento
    if c.requiere_seguimiento and c.fecha_seguimiento:
        story.append(Paragraph(
            f"<b>Cita de seguimiento:</b> {c.fecha_seguimiento.strftime('%d/%m/%Y')}",
            normal
        ))
        story.append(Spacer(1, 0.3 * cm))

    # ── Firma
    story.append(Spacer(1, 1 * cm))
    nombre_medico = medico.nombre if medico else "Médico Universitario"
    story.append(Table(
        [["", "_______________________________"],
         ["", nombre_medico],
         ["", "Médico Universitario"]],
        colWidths=["50%", "50%"],
        style=TableStyle([
            ("ALIGN", (1, 0), (1, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("FONTNAME", (1, 1), (1, 1), "Helvetica-Bold"),
        ])
    ))

    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=4))
    story.append(Paragraph(
        "Este documento es de uso exclusivo del paciente. "
        "Universidad Tecnológica de Candelaria — Servicios Estudiantiles.",
        small
    ))

    doc.build(story)
    return buffer.getvalue()


@router.get("/consultas/{consulta_id}/pdf", summary="Exportar receta médica en PDF")
def exportar_pdf_receta(
    consulta_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    try:
        pdf_bytes = _build_pdf_receta(consulta_id, db)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error al generar nota de consulta: {str(e)}")

    c = db.get(ConsultaMedica, consulta_id)
    pac = db.get(Paciente, c.paciente_id)
    nombre_safe = (pac.nombre or "paciente").replace(" ", "_")[:30]
    fecha_safe  = c.fecha_consulta.strftime("%Y%m%d") if c.fecha_consulta else "sin_fecha"
    filename = f"Consulta_{nombre_safe}_{fecha_safe}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
