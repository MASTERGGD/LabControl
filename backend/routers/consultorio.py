"""
Router — Consultorio Médico
Gestión de consultas, pacientes, estadísticas y PDF de receta
"""
from __future__ import annotations

import io
import datetime
import os
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, extract, or_
from sqlalchemy.orm import Session, aliased

from database import get_db
from dependencies import crear_access_token, decodificar_token, get_current_user
from models.usuario import Usuario, RolUsuario
from models.consultorio import Paciente, ConsultaMedica, CanalizacionMedica
from models.catalogo import CatalogoAlumno
from models.tutoria import Canalizacion as CanalizacionTutoria
from services.auditoria import registrar
from services.timezone import as_mx, format_fecha_corta_mx, format_fecha_larga_mx, today_mx

# reportlab
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.barcode.qr import QrCodeWidget

router = APIRouter(prefix="/consultorio", tags=["Consultorio"])

# ─── Helpers de permisos ──────────────────────────────────────────────────────

ROLES_MEDICO   = {RolUsuario.MEDICO}
ROLES_CONSULTA = {RolUsuario.MEDICO, RolUsuario.SUPER_ADMIN}


def _frontend_base_url() -> str:
    return (
        os.getenv("FRONTEND_URL")
        or os.getenv("PUBLIC_APP_URL")
        or os.getenv("REACT_APP_PUBLIC_APP_URL")
        or "http://localhost:3000"
    ).rstrip("/")


def _token_validacion_consulta(consulta_id: int) -> str:
    return crear_access_token({
        "typ": "consulta_validacion",
        "cid": str(consulta_id),
    })


def _url_validacion_consulta(consulta_id: int) -> str:
    return f"{_frontend_base_url()}/validar/consulta/{_token_validacion_consulta(consulta_id)}"


def _nombre_publico(nombre: str | None) -> str:
    partes = [p for p in (nombre or "").strip().split() if p]
    if not partes:
        return "Paciente"
    iniciales = " ".join(f"{p[0]}." for p in partes[1:3])
    return f"{partes[0]} {iniciales}".strip()


def _require_medico(user: Usuario):
    tiene_acceso = (
        user.rol in (RolUsuario.MEDICO, RolUsuario.SUPER_ADMIN)
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
    alergias: Optional[str] = None
    antecedentes_medicos: Optional[str] = None
    medicamentos_actuales: Optional[str] = None
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
    frecuencia_respiratoria: Optional[int] = None
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
    seguimiento_estado: Optional[str] = "PENDIENTE"
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
    frecuencia_respiratoria: Optional[int] = None
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
    seguimiento_estado: Optional[str] = None


class PacienteClinicoUpdate(BaseModel):
    sexo: Optional[str] = None
    fecha_nacimiento: Optional[datetime.date] = None
    alergias: Optional[str] = None
    antecedentes_medicos: Optional[str] = None
    medicamentos_actuales: Optional[str] = None


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
        "alergias": p.alergias,
        "antecedentes_medicos": p.antecedentes_medicos,
        "medicamentos_actuales": p.medicamentos_actuales,
        "carrera": p.carrera,
        "cuatrimestre": p.cuatrimestre,
        "departamento": p.departamento,
        "activo": p.activo,
    }


def _calcular_imc(peso: Optional[float], talla: Optional[float]) -> Optional[float]:
    if not peso or not talla:
        return None
    altura_m = talla / 100
    if altura_m <= 0:
        return None
    return round(peso / (altura_m * altura_m), 1)


def _clasificar_imc(imc: Optional[float]) -> Optional[str]:
    if imc is None:
        return None
    if imc < 18.5:
        return "Bajo peso"
    if imc < 25:
        return "Normal"
    if imc < 30:
        return "Sobrepeso"
    if imc < 35:
        return "Obesidad I"
    if imc < 40:
        return "Obesidad II"
    return "Obesidad III"


def _alertas_paciente(pac: Paciente, consultas: List[ConsultaMedica]) -> List[dict]:
    hoy = today_mx()
    alertas: List[dict] = []

    if pac.alergias and pac.alergias.strip():
        alertas.append({
            "tipo": "danger",
            "titulo": "Alergias registradas",
            "detalle": pac.alergias.strip()[:160],
        })

    for c in consultas:
        if c.genera_incapacidad and c.fecha_inicio_incapacidad and c.fecha_fin_incapacidad:
            if c.fecha_inicio_incapacidad <= hoy <= c.fecha_fin_incapacidad:
                alertas.append({
                    "tipo": "danger",
                    "titulo": "Incapacidad activa",
                    "detalle": f"Hasta {c.fecha_fin_incapacidad.strftime('%d/%m/%Y')} por {c.dias_incapacidad or 0} dia(s).",
                })
                break

    for c in consultas:
        if c.requiere_seguimiento and c.fecha_seguimiento:
            if c.fecha_seguimiento < hoy:
                alertas.append({
                    "tipo": "warning",
                    "titulo": "Seguimiento vencido",
                    "detalle": f"Programado para {c.fecha_seguimiento.strftime('%d/%m/%Y')}.",
                })
                break
            if c.fecha_seguimiento <= hoy + datetime.timedelta(days=3):
                alertas.append({
                    "tipo": "info",
                    "titulo": "Seguimiento proximo",
                    "detalle": f"Cita sugerida el {c.fecha_seguimiento.strftime('%d/%m/%Y')}.",
                })
                break

    reciente = [c for c in consultas if c.fecha_consulta and c.fecha_consulta.date() >= hoy - datetime.timedelta(days=90)]
    motivos: dict[str, int] = {}
    for c in reciente:
        motivo = (c.motivo_consulta or "").strip().lower()
        if motivo:
            motivos[motivo] = motivos.get(motivo, 0) + 1
    if motivos:
        motivo, total = max(motivos.items(), key=lambda item: item[1])
        if total >= 3:
            alertas.append({
                "tipo": "warning",
                "titulo": "Motivo recurrente",
                "detalle": f"{total} consultas similares en los ultimos 90 dias: {motivo[:80]}.",
            })

    ultima_con_signos = next((c for c in consultas if c.peso and c.talla), None)
    if ultima_con_signos:
        imc = _calcular_imc(ultima_con_signos.peso, ultima_con_signos.talla)
        clasificacion = _clasificar_imc(imc)
        if imc is not None and clasificacion and clasificacion != "Normal":
            alertas.append({
                "tipo": "info",
                "titulo": "IMC fuera de rango normal",
                "detalle": f"Ultimo IMC {imc} ({clasificacion}).",
            })

    return alertas


def _consulta_dict(c: ConsultaMedica, db: Session) -> dict:
    pac = db.get(Paciente, c.paciente_id)
    cans = db.query(CanalizacionMedica).filter(
        CanalizacionMedica.consulta_id == c.id
    ).all()
    imc = _calcular_imc(c.peso, c.talla)
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
        "imc": imc,
        "imc_clasificacion": _clasificar_imc(imc),
        "frecuencia_cardiaca": c.frecuencia_cardiaca,
        "frecuencia_respiratoria": c.frecuencia_respiratoria,
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
        "seguimiento_estado": c.seguimiento_estado,
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

    salida = []
    for p in encontrados.values():
        item = _paciente_dict(p)
        ultima = db.query(ConsultaMedica).filter(
            ConsultaMedica.paciente_id == p.id
        ).order_by(ConsultaMedica.fecha_consulta.desc()).first()
        if ultima:
            item.update({
                "estado_busqueda": "YA_ATENDIDO",
                "ultima_consulta": ultima.fecha_consulta.isoformat() if ultima.fecha_consulta else None,
                "ultimo_motivo": ultima.motivo_consulta,
                "ultimo_diagnostico": ultima.diagnostico,
            })
        else:
            item["estado_busqueda"] = "REGISTRADO"
        salida.append(item)

    return salida


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
            if data.sexo and not existe.sexo:
                existe.sexo = data.sexo
            if data.fecha_nacimiento and not existe.fecha_nacimiento:
                existe.fecha_nacimiento = data.fecha_nacimiento
            if data.alergias and not existe.alergias:
                existe.alergias = data.alergias
            if data.antecedentes_medicos and not existe.antecedentes_medicos:
                existe.antecedentes_medicos = data.antecedentes_medicos
            if data.medicamentos_actuales and not existe.medicamentos_actuales:
                existe.medicamentos_actuales = data.medicamentos_actuales
            db.commit()
            db.refresh(existe)
            return _paciente_dict(existe)

    pac = Paciente(
        tipo=data.tipo,
        alumno_id=data.alumno_id,
        nombre=data.nombre,
        matricula_o_emp=data.matricula_o_emp,
        fecha_nacimiento=data.fecha_nacimiento,
        sexo=data.sexo,
        alergias=data.alergias,
        antecedentes_medicos=data.antecedentes_medicos,
        medicamentos_actuales=data.medicamentos_actuales,
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
    request: Request,
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
    registrar(
        db,
        accion="CONSULTAR_EXPEDIENTE_MEDICO",
        recurso="CONSULTORIO_PACIENTE",
        usuario=current_user,
        recurso_id=paciente_id,
        detalle={"total_consultas": len(consultas)},
        request=request,
    )

    return {
        **_paciente_dict(pac),
        "total_consultas": len(consultas),
        "alertas": _alertas_paciente(pac, consultas),
        "consultas": [_consulta_dict(c, db) for c in consultas],
    }


@router.patch("/pacientes/{paciente_id}/datos-clinicos", summary="Actualizar datos clinicos del paciente")
def actualizar_datos_clinicos(
    paciente_id: int,
    data: PacienteClinicoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_medico(current_user)
    pac = db.get(Paciente, paciente_id)
    if not pac:
        raise HTTPException(404, "Paciente no encontrado")

    cambios = data.model_dump(exclude_unset=True)
    for k, v in cambios.items():
        setattr(pac, k, v)
    db.commit()
    db.refresh(pac)
    registrar(
        db,
        accion="ACTUALIZAR_DATOS_CLINICOS",
        recurso="CONSULTORIO_PACIENTE",
        usuario=current_user,
        recurso_id=paciente_id,
        detalle={"campos": list(cambios.keys())},
        request=request,
    )
    return _paciente_dict(pac)


# ─── CONSULTAS ────────────────────────────────────────────────────────────────

@router.get("/consultas", summary="Listar consultas con filtros")
def listar_consultas(
    q: str = Query("", description="Buscar por nombre o matrícula"),
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
    PacJoin = aliased(Paciente)
    q_obj = db.query(ConsultaMedica).outerjoin(
        PacJoin, PacJoin.id == ConsultaMedica.paciente_id
    )

    if q.strip():
        term = f"%{q.strip()}%"
        q_obj = q_obj.filter(
            or_(
                ConsultaMedica.paciente_nombre_snapshot.ilike(term),
                ConsultaMedica.paciente_matricula_snapshot.ilike(term),
                PacJoin.nombre.ilike(term),
                PacJoin.matricula_o_emp.ilike(term),
            )
        )
    if fecha_desde:
        q_obj = q_obj.filter(ConsultaMedica.fecha_consulta >= fecha_desde)
    if fecha_hasta:
        q_obj = q_obj.filter(ConsultaMedica.fecha_consulta <= fecha_hasta + " 23:59:59")
    if tipo_paciente:
        pids = [p.id for p in db.query(Paciente).filter(Paciente.tipo == tipo_paciente).all()]
        q_obj = q_obj.filter(ConsultaMedica.paciente_id.in_(pids))
    if origen:
        q_obj = q_obj.filter(ConsultaMedica.origen == origen)

    total = q_obj.count()
    consultas = q_obj.order_by(ConsultaMedica.fecha_consulta.desc()).offset(skip).limit(limit).all()
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
        frecuencia_respiratoria=data.frecuencia_respiratoria,
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
        seguimiento_estado=data.seguimiento_estado or "PENDIENTE",
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


@router.patch("/consultas/{consulta_id}/seguimiento-estado", summary="Marcar estado del seguimiento programado")
def actualizar_seguimiento_estado(
    consulta_id: int,
    estado: str,                          # REALIZADO | NO_PRESENTO | CANCELADO
    nota: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Permite al médico resolver una consulta de seguimiento programada:
    - REALIZADO   → el paciente asistió y se registró la consulta de seguimiento
    - NO_PRESENTO → la fecha pasó y el paciente no se presentó
    - CANCELADO   → se canceló con anticipación
    """
    _require_medico(current_user)
    estados_validos = {"REALIZADO", "NO_PRESENTO", "CANCELADO", "PENDIENTE"}
    if estado not in estados_validos:
        raise HTTPException(400, f"Estado inválido. Valores permitidos: {', '.join(estados_validos)}")

    c = db.get(ConsultaMedica, consulta_id)
    if not c:
        raise HTTPException(404, "Consulta no encontrada")
    if not c.requiere_seguimiento:
        raise HTTPException(400, "Esta consulta no tiene seguimiento programado")

    c.seguimiento_estado = estado
    if nota:
        c.seguimiento_notas = nota
    db.commit()
    db.refresh(c)
    return _consulta_dict(c, db)


@router.get("/seguimientos-vencidos", summary="Consultas con seguimiento programado que ya venció")
def seguimientos_vencidos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Devuelve seguimientos cuya fecha ya pasó y siguen en estado PENDIENTE."""
    _require_medico(current_user)
    hoy = today_mx()
    vencidos = db.query(ConsultaMedica).filter(
        ConsultaMedica.requiere_seguimiento == True,
        ConsultaMedica.seguimiento_estado == "PENDIENTE",
        ConsultaMedica.fecha_seguimiento < hoy,
    ).order_by(ConsultaMedica.fecha_seguimiento.asc()).all()
    return [_consulta_dict(c, db) for c in vencidos]


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
        frecuencia_respiratoria=data.frecuencia_respiratoria,
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
        seguimiento_estado=data.seguimiento_estado or "PENDIENTE",
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

    por_hora = {}
    pacientes_counter = {}
    for c in consultas_anio:
        if c.fecha_consulta:
            hora = c.fecha_consulta.hour
            por_hora[hora] = por_hora.get(hora, 0) + 1
        pacientes_counter[c.paciente_id] = pacientes_counter.get(c.paciente_id, 0) + 1
    pacientes_recurrentes = sum(1 for total in pacientes_counter.values() if total >= 3)

    por_area = {}
    for c in consultas_anio:
        pac = db.get(Paciente, c.paciente_id)
        area = (
            c.paciente_carrera_snapshot
            or c.paciente_departamento_snapshot
            or (pac.carrera if pac else None)
            or (pac.departamento if pac else None)
            or "Sin area"
        )
        por_area[area] = por_area.get(area, 0) + 1

    # Incapacidades
    incapacidades = base.filter(ConsultaMedica.genera_incapacidad == True).count()
    incapacidades_activas = db.query(ConsultaMedica).filter(
        ConsultaMedica.genera_incapacidad == True,
        ConsultaMedica.fecha_inicio_incapacidad <= now.date(),
        ConsultaMedica.fecha_fin_incapacidad >= now.date(),
    ).count()

    # Diagnósticos frecuentes (top 10 palabras significativas en diagnóstico)
    diag_counter: dict = {}
    motivo_counter: dict = {}
    for c in consultas_anio:
        if c.diagnostico:
            diag = c.diagnostico.strip()
            diag_counter[diag] = diag_counter.get(diag, 0) + 1
        if c.motivo_consulta:
            motivo = c.motivo_consulta.strip()
            motivo_counter[motivo] = motivo_counter.get(motivo, 0) + 1
    top_diagnosticos = sorted(diag_counter.items(), key=lambda x: x[1], reverse=True)[:10]
    top_motivos = sorted(motivo_counter.items(), key=lambda x: x[1], reverse=True)[:10]

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
    seguimientos_vencidos = db.query(ConsultaMedica).filter(
        ConsultaMedica.requiere_seguimiento == True,
        ConsultaMedica.fecha_seguimiento != None,
        ConsultaMedica.fecha_seguimiento < now.date(),
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
        "incapacidades_activas": incapacidades_activas,
        "seguimientos_pendientes": seguimientos_pendientes,
        "seguimientos_vencidos": seguimientos_vencidos,
        "canalizaciones_pendientes": cans_pendientes,
        "por_mes": por_mes,
        "por_cuatrimestre": por_cuatrimestre,
        "por_sexo": por_sexo,
        "por_tipo": por_tipo,
        "por_origen": por_origen,
        "por_hora": [{"hora": h, "total": por_hora[h]} for h in sorted(por_hora)],
        "pacientes_recurrentes": pacientes_recurrentes,
        "por_area": por_area,
        "top_diagnosticos": [{"diagnostico": d, "total": t} for d, t in top_diagnosticos],
        "top_motivos": [{"motivo": d, "total": t} for d, t in top_motivos],
    }


# ─── PDF RECETA — formato medico institucional ────────────────────────────────
# Paleta sobria: el verde funciona como acento, no como relleno dominante.
_C_AZUL    = colors.HexColor("#007A53")
_C_TEXTO   = colors.HexColor("#111827")
_C_SUBT    = colors.HexColor("#526175")
_C_MUTED   = colors.HexColor("#8A97AA")
_C_FONDO   = colors.HexColor("#F7FAFC")
_C_LINEA   = colors.HexColor("#D8E2EA")
_C_AZUL_CL = colors.HexColor("#EAF7F2")
_C_ORO     = colors.HexColor("#B8872B")
_C_BLANCO  = colors.white


def _estilos_receta():
    """Devuelve diccionario de ParagraphStyles con jerarquía editorial."""
    base = getSampleStyleSheet()["Normal"]
    def ps(name, **kw):
        return ParagraphStyle(name, parent=base, **kw)

    return {
        # Encabezado institucion
        "inst_nombre": ps("inst_nombre",
            fontName="Helvetica-Bold", fontSize=10.5, leading=13,
            textColor=_C_TEXTO, spaceAfter=1),
        "inst_dep": ps("inst_dep",
            fontName="Helvetica", fontSize=8, leading=10,
            textColor=_C_SUBT, spaceAfter=1),
        "inst_doc": ps("inst_doc",
            fontName="Helvetica-Bold", fontSize=11, leading=13,
            alignment=TA_RIGHT, textColor=_C_AZUL, spaceAfter=1),
        "inst_doc_sub": ps("inst_doc_sub",
            fontName="Helvetica", fontSize=7.5, leading=9,
            alignment=TA_RIGHT, textColor=_C_SUBT, spaceAfter=0),
        # Folio / fecha
        "meta": ps("meta",
            fontName="Helvetica", fontSize=8, leading=11,
            textColor=_C_SUBT),
        "meta_r": ps("meta_r",
            fontName="Helvetica", fontSize=8, leading=11,
            alignment=TA_RIGHT, textColor=_C_SUBT),
        # Label de seccion
        "seccion": ps("seccion",
            fontName="Helvetica-Bold", fontSize=7.4, leading=9,
            textColor=_C_AZUL, spaceBefore=7, spaceAfter=4,
            letterSpacing=0.6),
        # Texto de datos (label dentro de tabla)
        "lbl": ps("lbl",
            fontName="Helvetica-Bold", fontSize=7.2, leading=9,
            textColor=_C_SUBT),
        "val": ps("val",
            fontName="Helvetica", fontSize=8.4, leading=10.5,
            textColor=_C_TEXTO),
        "val_b": ps("val_b",
            fontName="Helvetica-Bold", fontSize=8.4, leading=10.5,
            textColor=_C_TEXTO),
        # Cuerpo de texto clínico
        "cuerpo": ps("cuerpo",
            fontName="Helvetica", fontSize=9, leading=12.5,
            textColor=_C_TEXTO, spaceAfter=2),
        "item": ps("item",
            fontName="Helvetica", fontSize=9, leading=12.5,
            textColor=_C_TEXTO, leftIndent=12, firstLineIndent=-6, spaceAfter=2),
        # Pie y firma
        "pie": ps("pie",
            fontName="Helvetica", fontSize=7, leading=9,
            textColor=_C_MUTED, alignment=TA_CENTER),
        "firma_nombre": ps("firma_nombre",
            fontName="Helvetica-Bold", fontSize=9.5, leading=13,
            alignment=TA_CENTER, textColor=_C_TEXTO),
        "firma_cargo": ps("firma_cargo",
            fontName="Helvetica", fontSize=8, leading=11,
            alignment=TA_CENTER, textColor=_C_SUBT),
        "firma_folio": ps("firma_folio",
            fontName="Helvetica", fontSize=7.5, leading=10,
            alignment=TA_CENTER, textColor=_C_MUTED),
    }


def _divider(spaceAfter=6, spaceBefore=0):
    return HRFlowable(width="100%", thickness=0.5, color=_C_LINEA,
                      spaceAfter=spaceAfter, spaceBefore=spaceBefore)


def _build_pdf_receta(consulta_id: int, db: Session) -> bytes:
    c = db.get(ConsultaMedica, consulta_id)
    if not c:
        raise HTTPException(404, "Consulta no encontrada")

    pac    = db.get(Paciente, c.paciente_id)
    medico = db.get(Usuario, c.atendido_por)
    st     = _estilos_receta()

    # Datos derivados
    nombre_pac   = (c.paciente_nombre_snapshot or (pac.nombre if pac else "—")).title()
    tipo_pac     = c.paciente_tipo_snapshot   or (pac.tipo   if pac else "—")
    sexo_raw     = c.paciente_sexo_snapshot   or (pac.sexo   if pac else "")
    sexo_pac     = {"M": "Masculino", "F": "Femenino", "OTRO": "Otro"}.get(sexo_raw or "", "—")
    carrera_pac  = c.paciente_carrera_snapshot      or (pac.carrera      if pac else None)
    cuatri_pac   = c.paciente_cuatrimestre_snapshot or (pac.cuatrimestre  if pac else None)
    depto_pac    = c.paciente_departamento_snapshot  or (pac.departamento  if pac else None)
    matricula_pac = c.paciente_matricula_snapshot   or (pac.matricula_o_emp if pac else None)

    edad_str = "—"
    if pac and pac.fecha_nacimiento:
        hoy  = today_mx()
        edad = hoy.year - pac.fecha_nacimiento.year - (
            (hoy.month, hoy.day) < (pac.fecha_nacimiento.month, pac.fecha_nacimiento.day)
        )
        edad_str = f"{edad} años"

    fecha_str = format_fecha_larga_mx(c.fecha_consulta)
    folio_str = f"Folio #{c.id:05d}"

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=1.4 * cm, bottomMargin=1.4 * cm,
    )

    story = []
    page_w = letter[0] - 3.6 * cm   # ancho útil

    # 1. Encabezado institucional: membrete sobrio, sin apariencia de plantilla.
    logo_path = Path(__file__).resolve().parents[1] / "assets" / "tutoria" / "utecan_logo.jpg"
    logo_cell = RLImage(str(logo_path), width=4.0 * cm, height=1.15 * cm) \
                if logo_path.exists() \
                else Paragraph("<b>UTECAN</b>", st["inst_nombre"])

    texto_inst = Table(
        [[Paragraph("Universidad Tecnológica de Candelaria", st["inst_nombre"])],
         [Paragraph("Consultorio Médico Universitario", st["inst_dep"])],
         [Paragraph("Atención primaria y seguimiento clínico", st["inst_dep"])]],
        colWidths=[page_w - 8.7 * cm],
        style=TableStyle([
            ("TOPPADDING", (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ]),
    )
    doc_meta = Table(
        [[Paragraph("NOTA MÉDICA", st["inst_doc"])],
         [Paragraph(folio_str, st["inst_doc_sub"])],
         [Paragraph(fecha_str, st["inst_doc_sub"])]],
        colWidths=[4.2 * cm],
        style=TableStyle([
            ("TOPPADDING", (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ]),
    )
    header_tbl = Table(
        [[logo_cell, texto_inst, doc_meta]],
        colWidths=[4.5 * cm, page_w - 8.7 * cm, 4.2 * cm],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN",  (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",   (0, 0), (0, 0),   "LEFT"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
    ]))
    story.append(header_tbl)
    story.append(HRFlowable(width="100%", thickness=0.9, color=_C_LINEA,
                             spaceBefore=3, spaceAfter=7))

    story.append(Paragraph("DATOS DEL PACIENTE", st["seccion"]))

    filas_pac = [
        [Paragraph("NOMBRE", st["lbl"]),    Paragraph(nombre_pac, st["val_b"]),
         Paragraph("TIPO",   st["lbl"]),    Paragraph(tipo_pac,   st["val_b"])],
        [Paragraph("SEXO",   st["lbl"]),    Paragraph(sexo_pac,   st["val"]),
         Paragraph("EDAD",   st["lbl"]),    Paragraph(edad_str,   st["val"])],
    ]
    if carrera_pac:
        filas_pac.append([
            Paragraph("CARRERA",       st["lbl"]), Paragraph(str(carrera_pac), st["val"]),
            Paragraph("CUATRIMESTRE",  st["lbl"]), Paragraph(str(cuatri_pac or "—"), st["val"]),
        ])
    if depto_pac:
        filas_pac.append([
            Paragraph("DEPARTAMENTO", st["lbl"]), Paragraph(str(depto_pac), st["val"]),
            Paragraph("", st["lbl"]), Paragraph("", st["val"]),
        ])
    if matricula_pac:
        filas_pac.append([
            Paragraph("MATRÍCULA / EMPLEADO", st["lbl"]), Paragraph(str(matricula_pac), st["val_b"]),
            Paragraph("", st["lbl"]), Paragraph("", st["val"]),
        ])
    if pac and pac.alergias:
        filas_pac.append([
            Paragraph("ALERGIAS CONOCIDAS", st["lbl"]),
            Paragraph(pac.alergias, st["val"]),
            Paragraph("", st["lbl"]), Paragraph("", st["val"]),
        ])

    t_pac = Table(filas_pac, colWidths=[3.0 * cm, 6.6 * cm, 3.0 * cm, 4.8 * cm])
    t_pac.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), _C_FONDO),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.35, colors.HexColor("#E6EDF3")),
        ("LINEBEFORE",    (2, 0), (2, -1), 0.35, colors.HexColor("#E6EDF3")),
        ("LINEABOVE",     (0, 0), (-1, 0), 1.0, _C_AZUL),
        ("BOX",           (0, 0), (-1, -1), 0.45, _C_LINEA),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t_pac)
    story.append(Spacer(1, 0.14 * cm))

    sv_raw = [
        ("Temperatura",        f"{c.temperatura} °C"                         if c.temperatura          else None),
        ("Presión arterial",   f"{c.presion_arterial} mmHg"                  if c.presion_arterial      else None),
        ("Peso",               f"{c.peso} kg"                                if c.peso                  else None),
        ("Talla",              f"{c.talla} cm"                               if c.talla                 else None),
        ("IMC",                f"{_calcular_imc(c.peso, c.talla)} ({_clasificar_imc(_calcular_imc(c.peso, c.talla))})"
                               if _calcular_imc(c.peso, c.talla) is not None else None),
        ("Frec. cardíaca",     f"{c.frecuencia_cardiaca} lpm"                if c.frecuencia_cardiaca   else None),
        ("Frec. respiratoria", f"{c.frecuencia_respiratoria} rpm"            if c.frecuencia_respiratoria else None),
        ("Saturación O2",  f"{c.saturacion_oxigeno}%"                   if c.saturacion_oxigeno    else None),
    ]
    sv_items = [(lbl, val) for lbl, val in sv_raw if val is not None]

    if sv_items:
        story.append(Paragraph("SIGNOS VITALES", st["seccion"]))
        sv_style_lbl = ParagraphStyle("sv_lbl", parent=st["lbl"],
                                      fontSize=6.8, leading=8.5, textColor=_C_MUTED)
        sv_style_val = ParagraphStyle("sv_val2", parent=st["val"],
                                      fontSize=8.8, fontName="Helvetica-Bold",
                                      textColor=_C_TEXTO, leading=11)
        COLS = 4
        col_w = page_w / COLS
        rows_sv = []
        for i in range(0, len(sv_items), COLS):
            fila = []
            for lbl, val in sv_items[i:i+COLS]:
                fila.append([Paragraph(lbl, sv_style_lbl),
                              Paragraph(val, sv_style_val)])
            while len(fila) < COLS:
                fila.append([Paragraph("", sv_style_lbl), Paragraph("", sv_style_val)])
            rows_sv.append(fila)

        # Aplanar: cada elemento de fila es [lbl_p, val_p] → una sola celda con dos párrafos
        flat_rows = []
        for fila in rows_sv:
            flat_rows.append([Table([[p1], [p2]],
                                    colWidths=[col_w - 0.6 * cm],
                                    style=TableStyle([
                                        ("TOPPADDING",    (0,0), (-1,-1), 0),
                                        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
                                        ("LEFTPADDING",   (0,0), (-1,-1), 0),
                                        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
                                    ]))
                              for p1, p2 in fila])

        t_sv = Table(flat_rows, colWidths=[col_w] * COLS)
        t_sv.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), _C_FONDO),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("LINEBEFORE",    (1, 0), (-1, -1), 0.35, colors.HexColor("#E6EDF3")),
            ("LINEABOVE",     (0, 0), (-1, 0), 0.7, _C_LINEA),
            ("LINEBELOW",     (0, -1), (-1, -1), 0.7, _C_LINEA),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(t_sv)
        story.append(Spacer(1, 0.14 * cm))

    story.append(Paragraph("MOTIVO DE CONSULTA", st["seccion"]))
    story.append(Paragraph(c.motivo_consulta or "—", st["cuerpo"]))

    story.append(_divider(spaceBefore=4, spaceAfter=2))
    story.append(Paragraph("DIAGNÓSTICO", st["seccion"]))
    story.append(Paragraph(c.diagnostico or "—", st["cuerpo"]))

    story.append(_divider(spaceBefore=4, spaceAfter=2))
    story.append(Paragraph("TRATAMIENTO / RECETA MÉDICA", st["seccion"]))
    if c.medicamentos:
        for linea in c.medicamentos.split("\n"):
            if linea.strip():
                story.append(Paragraph(f"- {linea.strip()}", st["item"]))
    else:
        story.append(Paragraph("Sin medicamentos prescritos.", st["cuerpo"]))

    if c.indicaciones:
        story.append(_divider(spaceBefore=4, spaceAfter=2))
        story.append(Paragraph("INDICACIONES Y CUIDADOS", st["seccion"]))
        for linea in c.indicaciones.split("\n"):
            if linea.strip():
                story.append(Paragraph(f"- {linea.strip()}", st["item"]))

    # ── Incapacidad
    if c.genera_incapacidad:
        story.append(_divider(spaceBefore=4, spaceAfter=2))
        story.append(Paragraph("INCAPACIDAD MÉDICA", st["seccion"]))
        fi = format_fecha_corta_mx(c.fecha_inicio_incapacidad)
        ff = format_fecha_corta_mx(c.fecha_fin_incapacidad) if c.fecha_fin_incapacidad else fi
        story.append(Paragraph(
            f"Se extiende incapacidad por <b>{c.dias_incapacidad or '—'} día(s)</b> "
            f"a partir del {fi} al {ff}.",
            st["cuerpo"]
        ))

    # ── Seguimiento
    if c.requiere_seguimiento and c.fecha_seguimiento:
        story.append(Spacer(1, 0.1 * cm))
        story.append(Table(
            [[Paragraph(
                f"Seguimiento programado: "
                f"<b>{format_fecha_corta_mx(c.fecha_seguimiento)}</b> "
                f"— {c.seguimiento_estado or 'PENDIENTE'}",
                ParagraphStyle("segt", parent=st["cuerpo"],
                               textColor=_C_TEXTO, fontSize=9)
            )]],
            colWidths=[page_w],
            style=TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), _C_FONDO),
                ("TOPPADDING",    (0,0), (-1,-1), 6),
                ("BOTTOMPADDING", (0,0), (-1,-1), 6),
                ("LEFTPADDING",   (0,0), (-1,-1), 10),
                ("LINEBEFORE",    (0,0), (0,-1), 2.0, _C_AZUL),
                ("BOX",           (0,0), (-1,-1), 0.4, _C_LINEA),
            ])
        ))

    # 5. Validacion y firma
    story.append(Spacer(1, 0.42 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_C_LINEA, spaceAfter=8))

    # QR de validación interna
    qr_payload = _url_validacion_consulta(c.id)
    qr_w = QrCodeWidget(qr_payload)
    qr_sz = 2 * cm
    qr_w.barWidth = qr_sz;  qr_w.barHeight = qr_sz
    drawing_qr = Drawing(qr_sz, qr_sz)
    drawing_qr.add(qr_w)

    nombre_medico = medico.nombre if medico else "Médico Universitario"

    sello_style = ParagraphStyle(
        "sello_info", parent=st["firma_folio"], alignment=TA_LEFT,
        fontSize=7.2, leading=9.5, textColor=_C_MUTED
    )
    firma_block = Table(
        [[
            Table(
                [[drawing_qr]],
                colWidths=[2.4 * cm],
                style=TableStyle([
                    ("ALIGN", (0,0), (-1,-1), "CENTER"),
                    ("TOPPADDING", (0,0), (-1,-1), 0),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 0),
                ])
            ),
            Table(
                [[Paragraph(folio_str, sello_style)],
                 [Paragraph("Validación interna SIGA", sello_style)],
                 [Paragraph("El código permite verificar la emisión institucional de esta nota.", sello_style)]],
                colWidths=[5.1 * cm],
                style=TableStyle([
                    ("TOPPADDING", (0,0), (-1,-1), 1),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 1),
                    ("LEFTPADDING", (0,0), (-1,-1), 0),
                    ("RIGHTPADDING", (0,0), (-1,-1), 0),
                ])
            ),
            Table(
                [[Spacer(1, 1.35 * cm)],
                 [HRFlowable(width=6.2 * cm, thickness=0.6, color=_C_LINEA, spaceAfter=4)],
                 [Paragraph(nombre_medico, st["firma_nombre"])],
                 [Paragraph("Médico Universitario", st["firma_cargo"])],
                 [Paragraph("Universidad Tecnológica de Candelaria", st["firma_cargo"])]],
                colWidths=[page_w - 7.5 * cm],
                style=TableStyle([
                    ("ALIGN", (0,0), (-1,-1), "CENTER"),
                    ("TOPPADDING", (0,0), (-1,-1), 1),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 1),
                ])
            ),
        ]],
        colWidths=[2.4 * cm, 5.1 * cm, page_w - 7.5 * cm],
        style=TableStyle([
            ("VALIGN",  (0,0), (-1,-1), "BOTTOM"),
            ("LEFTPADDING",  (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
            ("TOPPADDING",   (0,0), (-1,-1), 0),
            ("BOTTOMPADDING",(0,0), (-1,-1), 0),
        ])
    )
    story.append(firma_block)

    # ── Pie de página
    story.append(Spacer(1, 0.6 * cm))
    story.append(HRFlowable(width="100%", thickness=0.4, color=_C_LINEA, spaceAfter=5))
    story.append(Paragraph(
        "Documento generado por SIGA · Universidad Tecnológica de Candelaria "
        "· Uso exclusivo del paciente",
        st["pie"]
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
    fecha_local = c.fecha_consulta
    if isinstance(fecha_local, datetime.datetime):
        fecha_local = as_mx(fecha_local)
    fecha_safe  = fecha_local.strftime("%Y%m%d") if fecha_local else "sin_fecha"
    filename    = f"Consulta_{nombre_safe}_{fecha_safe}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/consultas/validacion/{token}", summary="Validar emision publica de una nota medica")
def validar_emision_consulta(token: str, db: Session = Depends(get_db)):
    try:
        payload = decodificar_token(token)
    except Exception:
        raise HTTPException(401, "Codigo de validacion invalido")

    if payload.get("typ") != "consulta_validacion":
        raise HTTPException(401, "Codigo de validacion invalido")

    try:
        consulta_id = int(payload.get("cid"))
    except (TypeError, ValueError):
        raise HTTPException(401, "Codigo de validacion invalido")

    c = db.get(ConsultaMedica, consulta_id)
    if not c:
        raise HTTPException(404, "Nota medica no encontrada")

    pac = db.get(Paciente, c.paciente_id)
    medico = db.get(Usuario, c.atendido_por)
    nombre_paciente = c.paciente_nombre_snapshot or (pac.nombre if pac else None)
    tipo_paciente = c.paciente_tipo_snapshot or (pac.tipo if pac else None)

    return {
        "valido": True,
        "folio": f"{c.id:05d}",
        "fecha_consulta": as_mx(c.fecha_consulta).isoformat() if c.fecha_consulta else None,
        "paciente": _nombre_publico(nombre_paciente),
        "tipo_paciente": tipo_paciente,
        "medico": medico.nombre if medico else "Medico Universitario",
        "institucion": "Universidad Tecnologica de Candelaria",
        "sistema": "SIGA UTECAN",
    }
