"""
Router del Módulo de Tutoría
Procedimiento P-DC-02 v08 · ISO 9001:2015
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, Field
from typing import Optional, List
from database import get_db
from models.tutoria import (
    GrupoTutorado, AsignacionTutoria, PerfilSocioeconómico,
    SesionTutoria, RegistroSesionAlumno, Canalizacion,
    InformeBimestral, DetalleInformeBimestral,
    DocumentoControladoTutoria, ProgramacionSesionTutoria,
    HistorialEstadoTutoria, CierreTutoria,
)
from models.notificacion import Notificacion
from models.catalogo import CatalogoAlumno
from models.usuario import Usuario, RolUsuario
from dependencies import get_current_user, require_roles
import datetime, io, json, openpyxl
from pathlib import Path
from routers.notificaciones import crear_notificacion

# PDF generation
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    Image as RLImage
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

router = APIRouter(prefix="/tutoria", tags=["Tutoría"])


def _now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

def _notificar_responsables(db: Session, tipo: str, titulo: str, mensaje: str, url: str = None):
    """Envia notificaciones solo a responsables del proceso de Tutoria."""
    responsables = db.query(Usuario).filter(
        Usuario.rol.in_([RolUsuario.TUTORIA_ADMIN, RolUsuario.SUPER_ADMIN]),
        Usuario.activo == True,
    ).all()
    for r in responsables:
        crear_notificacion(db, r.id, tipo, titulo, mensaje, url, enviar_email=False)

def _notificar_usuario(db: Session, usuario_id: int, tipo: str, titulo: str, mensaje: str, url: str = None):
    """Envía una notificación a un usuario específico."""
    crear_notificacion(db, usuario_id, tipo, titulo, mensaje, url, enviar_email=False)

def _norm(v) -> str:
    return str(v).strip() if v is not None else ""

_resp_roles = require_roles(
    RolUsuario.SUPER_ADMIN,
    RolUsuario.LAB_ADMIN,
    RolUsuario.TUTORIA_ADMIN,
)


# ═══════════════════════════════════════════════════════════════════════════════
#  SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class GrupoCreate(BaseModel):
    tutor_id:     int
    carrera:      str  = Field(..., min_length=2, max_length=120)
    cuatrimestre: int  = Field(..., ge=1, le=12)
    grupo:        str  = Field(..., min_length=1, max_length=10)
    periodo:      str  = Field(..., min_length=4, max_length=20)

class AsignarAlumnosBody(BaseModel):
    alumno_ids: List[int]

class SesionTutoriaCreate(BaseModel):
    grupo_tutorado_id:       int
    fecha:                   str  = Field(..., description="YYYY-MM-DD")
    tipo_sesion:             str  = Field(default="GRUPAL")  # GRUPAL | INDIVIDUAL
    observaciones_generales: Optional[str] = None
    registros: List[dict]   = Field(default=[])
    # [{alumno_id, asistio, tipo_academico, tipo_personal, tipo_otro,
    #   requiere_canalizacion, tema, acciones_preventivas, comentarios}]

class GrupoUpdate(BaseModel):
    tutor_id:     Optional[int] = None
    carrera:      Optional[str] = None
    cuatrimestre: Optional[int] = Field(default=None, ge=1, le=12)
    grupo:        Optional[str] = None
    periodo:      Optional[str] = None
    activo:       Optional[bool] = None

class CanalizacionCreate(BaseModel):
    alumno_id:         int
    grupo_tutorado_id: Optional[int] = None
    sesion_id:         Optional[int] = None
    tipo_psicologico:  bool = False
    tipo_pedagogico:   bool = False
    tipo_personal:     bool = False
    modalidad:         str  = Field(default="INDIVIDUAL")
    motivo:            str  = Field(..., min_length=5)

class CanalizacionAtender(BaseModel):
    area_atencion:        str  = Field(..., min_length=2)
    tipo_servicio:        str  = Field(..., min_length=2)
    fecha_atencion:       str  = Field(..., description="YYYY-MM-DD")
    descripcion_atencion: str  = Field(..., min_length=5)

class InformeTextosUpdate(BaseModel):
    principal_problematica: Optional[str] = None
    sugerencias:            Optional[str] = None

class AsignacionEstadoUpdate(BaseModel):
    estado:        str   = Field(..., description="SIN_SEGUIMIENTO|EN_OBSERVACION|CANALIZADO|ATENDIDO|CERRADO")
    observaciones: Optional[str] = None

class CierreTutoriaCreate(BaseModel):
    periodo:       str = Field(..., min_length=4, max_length=20)
    bimestre:      Optional[int] = Field(default=None, ge=1, le=2)
    alcance:       str = Field(default="BIMESTRE")
    observaciones: Optional[str] = None

class DocumentoTutoriaUpdate(BaseModel):
    codigo: str = Field(..., min_length=2, max_length=20)
    nombre: str = Field(..., min_length=3, max_length=160)
    version: str = Field(..., min_length=1, max_length=10)
    fecha_efectivo: Optional[str] = None
    vigente: bool = True
    observaciones: Optional[str] = None

class ProgramacionTutoriaCreate(BaseModel):
    grupo_tutorado_id: int
    fecha_programada: str = Field(..., description="YYYY-MM-DD")
    tipo_sesion: str = Field(default="GRUPAL")
    objetivo: Optional[str] = None

class ProgramacionTutoriaUpdate(BaseModel):
    fecha_programada: Optional[str] = None
    tipo_sesion: Optional[str] = None
    objetivo: Optional[str] = None
    estado: Optional[str] = None

class DetalleBody(BaseModel):
    alumno_id:      int
    bimestre:       int  = Field(..., ge=1, le=2)
    categoria:      str
    detalle:        Optional[str] = None
    porcentaje:     Optional[float] = None
    meses_embarazo: Optional[int]  = None
    num_hijos:      Optional[int]  = None
    realizo_tramite: Optional[bool] = None


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS DE SERIALIZACIÓN
# ═══════════════════════════════════════════════════════════════════════════════

def _ser_alumno_basico(a: CatalogoAlumno) -> dict:
    return {
        "id":        a.id,
        "matricula": a.matricula,
        "nombre":    f"{a.apellido_paterno} {a.apellido_materno} {a.nombres}".strip(),
        "carrera":   a.carrera,
        "cuatrimestre": a.cuatrimestre,
        "grupo":     a.grupo,
        "periodo":   a.periodo,
    }

def _ser_perfil(p: PerfilSocioeconómico | None) -> dict | None:
    if not p:
        return None
    return {
        "promedio_bachillerato":     p.promedio_bachillerato,
        "sexo":                      p.sexo,
        "estado_civil":              p.estado_civil,
        "lugar_nacimiento":          p.lugar_nacimiento,
        "domicilio_procedencia":     p.domicilio_procedencia,
        "domicilio_residencia":      p.domicilio_residencia,
        "telefono":                  p.telefono,
        "ingreso_familiar_mensual":  p.ingreso_familiar_mensual,
        "recibe_apoyo_institucional": p.recibe_apoyo_institucional,
        "institucion_apoyo":         p.institucion_apoyo,
        "habla_lengua_indigena":     p.habla_lengua_indigena,
        "tiene_hijos":               p.tiene_hijos,
        "num_hijos":                 p.num_hijos,
        "trabaja":                   p.trabaja,
        "empresa":                   p.empresa,
        "tiene_alergia":             p.tiene_alergia,
        "tiene_enfermedad_cronica":  p.tiene_enfermedad_cronica,
        "diabetes":                  p.diabetes,
        "hipertension":              p.hipertension,
        "tiene_discapacidad":        p.tiene_discapacidad,
        "informacion_relevante":     p.informacion_relevante,
    }

def _semaforo(perfil: dict | None) -> str:
    """Calcula nivel de vulnerabilidad: ALTO / MEDIO / BAJO"""
    if not perfil:
        return "SIN_DATOS"
    score = 0
    if perfil.get("ingreso_familiar_mensual") and perfil["ingreso_familiar_mensual"] < 5000:
        score += 2
    if perfil.get("tiene_enfermedad_cronica"):
        score += 2
    if perfil.get("tiene_discapacidad"):
        score += 2
    if perfil.get("promedio_bachillerato") and perfil["promedio_bachillerato"] < 8.0:
        score += 1
    if perfil.get("trabaja"):
        score += 1
    if perfil.get("tiene_hijos"):
        score += 1
    if score >= 4:
        return "ALTO"
    if score >= 2:
        return "MEDIO"
    return "BAJO"

def _ser_grupo(g: GrupoTutorado, db: Session) -> dict:
    tutor = db.query(Usuario).filter(Usuario.id == g.tutor_id).first()
    total = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id == g.id,
        AsignacionTutoria.activo == True
    ).count()
    sesiones_cuatrimestre = db.query(SesionTutoria).filter(
        SesionTutoria.grupo_tutorado_id == g.id
    ).count()
    return {
        "id":           g.id,
        "tutor_id":     g.tutor_id,
        "tutor_nombre": tutor.nombre if tutor else None,
        "carrera":      g.carrera,
        "cuatrimestre": g.cuatrimestre,
        "grupo":        g.grupo,
        "periodo":      g.periodo,
        "activo":       g.activo,
        "total_alumnos": total,
        "sesiones_realizadas": sesiones_cuatrimestre,
    }

def _ser_canalizacion(c: Canalizacion, db: Session) -> dict:
    tutor  = db.query(Usuario).filter(Usuario.id == c.tutor_id).first()
    alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == c.alumno_id).first()
    tipos  = []
    if c.tipo_psicologico: tipos.append("Psicológico")
    if c.tipo_pedagogico:  tipos.append("Pedagógico")
    if c.tipo_personal:    tipos.append("Personal")
    return {
        "id":                  c.id,
        "tutor_id":            c.tutor_id,
        "tutor_nombre":        tutor.nombre if tutor else None,
        "alumno_id":           c.alumno_id,
        "alumno_nombre":       f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip() if alumno else None,
        "alumno_matricula":    alumno.matricula if alumno else None,
        "fecha_solicitud":     c.fecha_solicitud.isoformat() if c.fecha_solicitud else None,
        "tipos":               tipos,
        "modalidad":           c.modalidad,
        "motivo":              c.motivo,
        "estado":              c.estado,
        "area_atencion":       c.area_atencion,
        "tipo_servicio":       c.tipo_servicio,
        "fecha_atencion":      c.fecha_atencion.isoformat() if c.fecha_atencion else None,
        "descripcion_atencion": c.descripcion_atencion,
        "atendido_en":         c.atendido_en.isoformat() if c.atendido_en else None,
        "documento": {
            "codigo": c.documento_codigo or "F-DC-08",
            "version": c.documento_version or "08",
            "fecha_efectivo": c.documento_efectivo.isoformat() if c.documento_efectivo else None,
        },
    }


def _documento_vigente(db: Session, codigo: str) -> dict:
    doc = db.query(DocumentoControladoTutoria).filter(
        DocumentoControladoTutoria.codigo == codigo,
        DocumentoControladoTutoria.vigente == True,
    ).order_by(DocumentoControladoTutoria.actualizado_en.desc()).first()
    if not doc:
        return {"codigo": codigo, "version": "08", "fecha_efectivo": None}
    return {
        "codigo": doc.codigo,
        "version": doc.version,
        "fecha_efectivo": doc.fecha_efectivo,
    }


def _ser_programacion(p: ProgramacionSesionTutoria, db: Session) -> dict:
    grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == p.grupo_tutorado_id).first()
    tutor = db.query(Usuario).filter(Usuario.id == p.tutor_id).first()
    return {
        "id": p.id,
        "grupo_tutorado_id": p.grupo_tutorado_id,
        "grupo_label": f"{grupo.carrera} · Grupo {grupo.grupo} · {grupo.periodo}" if grupo else None,
        "tutor_id": p.tutor_id,
        "tutor_nombre": tutor.nombre if tutor else None,
        "fecha_programada": p.fecha_programada.isoformat() if p.fecha_programada else None,
        "tipo_sesion": p.tipo_sesion,
        "objetivo": p.objetivo,
        "estado": p.estado,
        "sesion_id": p.sesion_id,
        "creado_en": p.creado_en.isoformat() if p.creado_en else None,
    }


def _calcular_indicadores(db: Session, periodo: Optional[str] = None, bimestre: Optional[int] = None) -> dict:
    q_perfiles = db.query(PerfilSocioeconómico)
    if periodo:
        q_perfiles = q_perfiles.filter(PerfilSocioeconómico.periodo_estudio == periodo)
    perfiles = q_perfiles.all()
    perfiles_importados = len(perfiles)
    perfiles_riesgo = {"ALTO": 0, "MEDIO": 0, "BAJO": 0, "SIN_DATOS": 0}
    for perfil in perfiles:
        nivel = _semaforo(_ser_perfil(perfil))
        perfiles_riesgo[nivel] = perfiles_riesgo.get(nivel, 0) + 1
    perfil_alumno_ids = [p.alumno_id for p in perfiles]
    alumnos_con_grupo_ids = set()
    if perfil_alumno_ids:
        alumnos_con_grupo_ids = {
            r[0] for r in db.query(AsignacionTutoria.alumno_id).filter(
                AsignacionTutoria.alumno_id.in_(perfil_alumno_ids),
                AsignacionTutoria.activo == True,
            ).distinct().all()
        }
    perfiles_sin_grupo = max(0, perfiles_importados - len(alumnos_con_grupo_ids))
    socio_stats = {
        "perfiles_importados": perfiles_importados,
        "perfiles_sin_grupo": perfiles_sin_grupo,
        "perfiles_riesgo_alto": perfiles_riesgo.get("ALTO", 0),
        "perfiles_riesgo_medio": perfiles_riesgo.get("MEDIO", 0),
        "perfiles_riesgo_bajo": perfiles_riesgo.get("BAJO", 0),
        "perfiles_sin_datos": perfiles_riesgo.get("SIN_DATOS", 0),
    }

    q_grupos = db.query(GrupoTutorado).filter(GrupoTutorado.activo == True)
    if periodo:
        q_grupos = q_grupos.filter(GrupoTutorado.periodo == periodo)
    grupos = q_grupos.all()
    grupo_ids = [g.id for g in grupos]
    tutor_ids = sorted({g.tutor_id for g in grupos})

    if not grupo_ids:
        return {
            "total_grupos": 0, "total_tutores": 0, "total_tutorados": 0,
            "total_sesiones": 0, "total_asistencias": 0, "total_inasistencias": 0,
            "porcentaje_asistencia": 0, "alumnos_riesgo_alto": socio_stats["perfiles_riesgo_alto"],
            "canalizaciones_pendientes": 0, "canalizaciones_seguimiento": 0,
            "canalizaciones_atendidas": 0, "informes_borrador": 0,
            "informes_enviados": 0, "informes_recibidos": 0,
            "grupos_sin_sesion": 0, "seguimiento_estados": {},
            "sesiones_por_tutor": [], "cumplimiento_tutores": [],
            "alumnos_prioritarios": [], "promedio_dias_atencion": None,
            **socio_stats,
        }

    total_tutorados = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id.in_(grupo_ids),
        AsignacionTutoria.activo == True,
    ).count()
    sesiones_q = db.query(SesionTutoria).filter(SesionTutoria.grupo_tutorado_id.in_(grupo_ids))
    total_sesiones = sesiones_q.count()
    regs = db.query(RegistroSesionAlumno).join(
        SesionTutoria, SesionTutoria.id == RegistroSesionAlumno.sesion_id
    ).filter(SesionTutoria.grupo_tutorado_id.in_(grupo_ids)).all()
    total_asistencias = sum(1 for r in regs if r.asistio is True)
    total_inasistencias = sum(1 for r in regs if r.asistio is False)
    total_registros = total_asistencias + total_inasistencias

    alumnos_riesgo_alto = 0
    asignaciones = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id.in_(grupo_ids),
        AsignacionTutoria.activo == True,
    ).all()
    seguimiento_estados = {}
    for a in asignaciones:
        seguimiento_estados[a.estado_seguimiento] = seguimiento_estados.get(a.estado_seguimiento, 0) + 1
        perfil = db.query(PerfilSocioeconómico).filter(PerfilSocioeconómico.alumno_id == a.alumno_id).first()
        if _semaforo(_ser_perfil(perfil)) == "ALTO":
            alumnos_riesgo_alto += 1

    cans_base = db.query(Canalizacion).filter(Canalizacion.grupo_tutorado_id.in_(grupo_ids))
    canalizaciones_pendientes = cans_base.filter(Canalizacion.estado == "PENDIENTE").count()
    canalizaciones_seguimiento = cans_base.filter(Canalizacion.estado == "EN_SEGUIMIENTO").count()
    canalizaciones_atendidas = cans_base.filter(Canalizacion.estado == "ATENDIDA").count()

    atendidas = cans_base.filter(
        Canalizacion.estado == "ATENDIDA",
        Canalizacion.fecha_solicitud.isnot(None),
        Canalizacion.atendido_en.isnot(None),
    ).all()
    dias_atencion = [(c.atendido_en - c.fecha_solicitud).days for c in atendidas if c.atendido_en and c.fecha_solicitud]
    promedio_dias_atencion = round(sum(dias_atencion) / len(dias_atencion), 1) if dias_atencion else None

    inf_q = db.query(InformeBimestral).filter(InformeBimestral.grupo_tutorado_id.in_(grupo_ids))
    if bimestre:
        inf_q = inf_q.filter(InformeBimestral.bimestre == bimestre)
    informes_borrador = inf_q.filter(InformeBimestral.estado == "BORRADOR").count()
    informes_enviados = inf_q.filter(InformeBimestral.estado == "ENVIADO").count()
    informes_recibidos = inf_q.filter(InformeBimestral.estado == "RECIBIDO").count()

    grupos_sin_sesion = sum(1 for g in grupos if not db.query(SesionTutoria).filter(SesionTutoria.grupo_tutorado_id == g.id).first())

    sesiones_por_tutor = []
    cumplimiento_tutores = []
    for tid in tutor_ids:
        tutor = db.query(Usuario).filter(Usuario.id == tid).first()
        grupos_tutor = [g for g in grupos if g.tutor_id == tid]
        grupos_tutor_ids = [g.id for g in grupos_tutor]
        sesiones = db.query(SesionTutoria).filter(
            SesionTutoria.tutor_id == tid,
            SesionTutoria.grupo_tutorado_id.in_(grupo_ids),
        ).count()
        alumnos = db.query(AsignacionTutoria).join(
            GrupoTutorado, GrupoTutorado.id == AsignacionTutoria.grupo_tutorado_id
        ).filter(
            GrupoTutorado.tutor_id == tid,
            GrupoTutorado.id.in_(grupo_ids),
            AsignacionTutoria.activo == True,
        ).count()
        sesiones_por_tutor.append({
            "tutor_id": tid,
            "tutor_nombre": tutor.nombre if tutor else "Tutor desconocido",
            "sesiones": sesiones,
            "alumnos": alumnos,
        })

        programadas = db.query(ProgramacionSesionTutoria).filter(
            ProgramacionSesionTutoria.tutor_id == tid,
            ProgramacionSesionTutoria.grupo_tutorado_id.in_(grupos_tutor_ids or [0]),
        ).count()
        programadas_cumplidas = db.query(ProgramacionSesionTutoria).filter(
            ProgramacionSesionTutoria.tutor_id == tid,
            ProgramacionSesionTutoria.grupo_tutorado_id.in_(grupos_tutor_ids or [0]),
            ProgramacionSesionTutoria.estado == "CUMPLIDA",
        ).count()
        programadas_vencidas = db.query(ProgramacionSesionTutoria).filter(
            ProgramacionSesionTutoria.tutor_id == tid,
            ProgramacionSesionTutoria.grupo_tutorado_id.in_(grupos_tutor_ids or [0]),
            ProgramacionSesionTutoria.estado == "PROGRAMADA",
            ProgramacionSesionTutoria.fecha_programada < datetime.date.today(),
        ).count()
        canalizaciones_abiertas_tutor = db.query(Canalizacion).filter(
            Canalizacion.tutor_id == tid,
            Canalizacion.grupo_tutorado_id.in_(grupos_tutor_ids or [0]),
            Canalizacion.estado.in_(["PENDIENTE", "EN_SEGUIMIENTO"]),
        ).count()
        informes_pendientes_tutor = db.query(InformeBimestral).filter(
            InformeBimestral.tutor_id == tid,
            InformeBimestral.grupo_tutorado_id.in_(grupos_tutor_ids or [0]),
            InformeBimestral.estado.in_(["BORRADOR", "ENVIADO"]),
        ).count()

        alumnos_riesgo_sin_seg = 0
        asignaciones_tutor = db.query(AsignacionTutoria).filter(
            AsignacionTutoria.grupo_tutorado_id.in_(grupos_tutor_ids or [0]),
            AsignacionTutoria.activo == True,
        ).all()
        for a in asignaciones_tutor:
            perfil = db.query(PerfilSocioeconómico).filter(PerfilSocioeconómico.alumno_id == a.alumno_id).first()
            if _semaforo(_ser_perfil(perfil)) == "ALTO" and a.estado_seguimiento == "SIN_SEGUIMIENTO":
                alumnos_riesgo_sin_seg += 1

        esperado = programadas or sesiones
        cumplimiento_pct = round((sesiones / esperado) * 100, 1) if esperado else 0
        if programadas_vencidas > 0 or alumnos_riesgo_sin_seg > 0:
            semaforo = "ROJO"
        elif cumplimiento_pct < 80 or canalizaciones_abiertas_tutor > 0 or informes_pendientes_tutor > 0:
            semaforo = "AMARILLO"
        else:
            semaforo = "VERDE"

        cumplimiento_tutores.append({
            "tutor_id": tid,
            "tutor_nombre": tutor.nombre if tutor else "Tutor desconocido",
            "semaforo": semaforo,
            "cumplimiento_pct": cumplimiento_pct,
            "grupos": len(grupos_tutor),
            "alumnos": alumnos,
            "sesiones_realizadas": sesiones,
            "sesiones_esperadas": esperado,
            "programadas": programadas,
            "programadas_cumplidas": programadas_cumplidas,
            "programadas_vencidas": programadas_vencidas,
            "canalizaciones_abiertas": canalizaciones_abiertas_tutor,
            "informes_pendientes": informes_pendientes_tutor,
            "alumnos_riesgo_sin_seguimiento": alumnos_riesgo_sin_seg,
        })
    sesiones_por_tutor.sort(key=lambda x: (-x["sesiones"], x["tutor_nombre"]))
    _orden_cumplimiento = {"ROJO": 0, "AMARILLO": 1, "VERDE": 2}
    cumplimiento_tutores.sort(key=lambda x: (_orden_cumplimiento.get(x["semaforo"], 3), x["tutor_nombre"]))

    alumnos_prioritarios = []
    for a in asignaciones:
        perfil = db.query(PerfilSocioeconómico).filter(PerfilSocioeconómico.alumno_id == a.alumno_id).first()
        if _semaforo(_ser_perfil(perfil)) != "ALTO" or a.estado_seguimiento != "SIN_SEGUIMIENTO":
            continue
        alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == a.alumno_id).first()
        grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == a.grupo_tutorado_id).first()
        tutor = db.query(Usuario).filter(Usuario.id == grupo.tutor_id).first() if grupo else None
        if alumno:
            alumnos_prioritarios.append({
                "alumno_id": alumno.id,
                "matricula": alumno.matricula,
                "nombre": f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip(),
                "carrera": grupo.carrera if grupo else alumno.carrera,
                "grupo": grupo.grupo if grupo else alumno.grupo,
                "periodo": grupo.periodo if grupo else alumno.periodo,
                "tutor_nombre": tutor.nombre if tutor else None,
                "motivo": "Riesgo alto sin seguimiento institucional",
            })

    return {
        "total_grupos": len(grupos),
        "total_tutores": len(tutor_ids),
        "total_tutorados": total_tutorados,
        "total_sesiones": total_sesiones,
        "total_asistencias": total_asistencias,
        "total_inasistencias": total_inasistencias,
        "porcentaje_asistencia": round((total_asistencias / total_registros) * 100, 1) if total_registros else 0,
        "alumnos_riesgo_alto": alumnos_riesgo_alto,
        "canalizaciones_pendientes": canalizaciones_pendientes,
        "canalizaciones_seguimiento": canalizaciones_seguimiento,
        "canalizaciones_atendidas": canalizaciones_atendidas,
        "informes_borrador": informes_borrador,
        "informes_enviados": informes_enviados,
        "informes_recibidos": informes_recibidos,
        "grupos_sin_sesion": grupos_sin_sesion,
        "seguimiento_estados": seguimiento_estados,
        "sesiones_por_tutor": sesiones_por_tutor,
        "cumplimiento_tutores": cumplimiento_tutores,
        "alumnos_prioritarios": alumnos_prioritarios[:12],
        "promedio_dias_atencion": promedio_dias_atencion,
        **socio_stats,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  DASHBOARD — RESPONSABLE
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard", summary="Dashboard del responsable de tutoría")
def dashboard_tutoria(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    indicadores = _calcular_indicadores(db)
    hoy = datetime.date.today()
    semana_inicio = hoy - datetime.timedelta(days=hoy.weekday())

    sesiones_semana = db.query(SesionTutoria).filter(
        SesionTutoria.fecha >= semana_inicio
    ).count()

    informes_pendientes = db.query(InformeBimestral).filter(
        InformeBimestral.estado == "ENVIADO"
    ).count()

    # Tutores sin sesión esta semana
    tutores_activos = [
        r[0] for r in db.query(GrupoTutorado.tutor_id)
        .filter(GrupoTutorado.activo == True).distinct().all()
    ]
    tutores_con_sesion = [
        r[0] for r in db.query(SesionTutoria.tutor_id)
        .filter(SesionTutoria.fecha >= semana_inicio).distinct().all()
    ]
    tutores_sin_sesion = len(set(tutores_activos) - set(tutores_con_sesion))

    return {
        "total_grupos":             indicadores["total_grupos"],
        "total_tutores":            indicadores["total_tutores"],
        "total_tutorados":          indicadores["total_tutorados"],
        "sesiones_esta_semana":     sesiones_semana,
        "canalizaciones_pendientes": indicadores["canalizaciones_pendientes"],
        "informes_por_revisar":     informes_pendientes,
        "tutores_sin_sesion_semana": tutores_sin_sesion,
        "alumnos_riesgo_alto":      indicadores["alumnos_riesgo_alto"],
        "canalizaciones_abiertas":   indicadores["canalizaciones_pendientes"] + indicadores["canalizaciones_seguimiento"],
        "porcentaje_asistencia":     indicadores["porcentaje_asistencia"],
        "grupos_sin_sesion":         indicadores["grupos_sin_sesion"],
        "promedio_dias_atencion":    indicadores["promedio_dias_atencion"],
        "perfiles_importados":       indicadores["perfiles_importados"],
        "perfiles_sin_grupo":        indicadores["perfiles_sin_grupo"],
        "perfiles_riesgo_alto":      indicadores["perfiles_riesgo_alto"],
        "perfiles_riesgo_medio":     indicadores["perfiles_riesgo_medio"],
        "perfiles_riesgo_bajo":      indicadores["perfiles_riesgo_bajo"],
        "perfiles_sin_datos":        indicadores["perfiles_sin_datos"],
        "seguimiento_estados":       indicadores["seguimiento_estados"],
        "sesiones_por_tutor":        indicadores["sesiones_por_tutor"][:8],
        "cumplimiento_tutores":      indicadores["cumplimiento_tutores"],
        "alumnos_prioritarios":      indicadores["alumnos_prioritarios"],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  GRUPOS TUTORADOS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/grupos", summary="Listar todos los grupos tutorados")
def listar_grupos(
    periodo: Optional[str] = None,
    activo:  Optional[bool] = True,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(GrupoTutorado)
    if activo is not None:
        q = q.filter(GrupoTutorado.activo == activo)
    if periodo:
        q = q.filter(GrupoTutorado.periodo == periodo)
    # DOCENTE solo ve sus propios grupos
    if current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(GrupoTutorado.tutor_id == current_user.id)
    return [_ser_grupo(g, db) for g in q.order_by(GrupoTutorado.carrera, GrupoTutorado.grupo).all()]


@router.post("/grupos", status_code=status.HTTP_201_CREATED, summary="Crear grupo tutorado")
def crear_grupo(
    data: GrupoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    tutor = db.query(Usuario).filter(Usuario.id == data.tutor_id).first()
    if not tutor:
        raise HTTPException(404, "Tutor no encontrado")

    g = GrupoTutorado(
        tutor_id=data.tutor_id,
        carrera=data.carrera,
        cuatrimestre=data.cuatrimestre,
        grupo=data.grupo.upper(),
        periodo=data.periodo,
        creado_en=_now(),
        creado_por=current_user.id,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return _ser_grupo(g, db)


@router.put("/grupos/{grupo_id}", summary="Editar grupo tutorado")
def editar_grupo(
    grupo_id: int,
    data: GrupoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    g = db.query(GrupoTutorado).filter(GrupoTutorado.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo tutorado no encontrado")
    if data.tutor_id is not None:
        if not db.query(Usuario).filter(Usuario.id == data.tutor_id).first():
            raise HTTPException(404, "Tutor no encontrado")
        g.tutor_id = data.tutor_id
    if data.carrera is not None:
        g.carrera = data.carrera
    if data.cuatrimestre is not None:
        g.cuatrimestre = data.cuatrimestre
    if data.grupo is not None:
        g.grupo = data.grupo.upper()
    if data.periodo is not None:
        g.periodo = data.periodo
    if data.activo is not None:
        g.activo = data.activo
    db.commit()
    db.refresh(g)
    return _ser_grupo(g, db)


@router.post("/grupos/{grupo_id}/alumnos", summary="Asignar alumnos a un grupo tutorado")
def asignar_alumnos(
    grupo_id: int,
    data: AsignarAlumnosBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    g = db.query(GrupoTutorado).filter(GrupoTutorado.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo tutorado no encontrado")

    asignados, ya_existentes = 0, 0
    for aid in data.alumno_ids:
        existe = db.query(AsignacionTutoria).filter(
            AsignacionTutoria.grupo_tutorado_id == grupo_id,
            AsignacionTutoria.alumno_id == aid,
        ).first()
        if existe:
            if not existe.activo:
                existe.activo = True
                asignados += 1
            else:
                ya_existentes += 1
        else:
            db.add(AsignacionTutoria(
                grupo_tutorado_id=grupo_id,
                alumno_id=aid,
                asignado_en=_now(),
            ))
            asignados += 1
    db.commit()
    return {"asignados": asignados, "ya_existentes": ya_existentes}


@router.get("/grupos/{grupo_id}/alumnos", summary="Alumnos de un grupo tutorado con perfil socioeconómico")
def alumnos_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    g = db.query(GrupoTutorado).filter(GrupoTutorado.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo tutorado no encontrado")
    if current_user.rol == RolUsuario.DOCENTE and g.tutor_id != current_user.id:
        raise HTTPException(403, "No tienes acceso a este grupo")

    asignaciones = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id == grupo_id,
        AsignacionTutoria.activo == True,
    ).all()

    resultado = []
    for a in asignaciones:
        alumno  = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == a.alumno_id).first()
        if not alumno:
            continue
        perfil  = db.query(PerfilSocioeconómico).filter(
            PerfilSocioeconómico.alumno_id == alumno.id
        ).first()
        perfil_d = _ser_perfil(perfil)
        resultado.append({
            **_ser_alumno_basico(alumno),
            "asignacion_id":          a.id,
            "perfil_socioeconomico":  perfil_d,
            "semaforo_vulnerabilidad": _semaforo(perfil_d),
            "estado_seguimiento":     a.estado_seguimiento,
            "estado_observaciones":   a.estado_observaciones,
            "estado_actualizado_en":  a.estado_actualizado_en.isoformat() if a.estado_actualizado_en else None,
        })

    resultado.sort(key=lambda x: x["nombre"])
    return resultado


# ─── Cambiar estado de seguimiento de un alumno ───────────────────────────────

_ESTADOS_VALIDOS = {"SIN_SEGUIMIENTO", "EN_OBSERVACION", "CANALIZADO", "ATENDIDO", "CERRADO"}

@router.put("/asignaciones/{asignacion_id}/estado", summary="Actualizar estado de seguimiento institucional del alumno")
def actualizar_estado_seguimiento(
    asignacion_id: int,
    data: AsignacionEstadoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    if data.estado not in _ESTADOS_VALIDOS:
        raise HTTPException(400, f"Estado inválido. Valores permitidos: {', '.join(sorted(_ESTADOS_VALIDOS))}")

    a = db.query(AsignacionTutoria).filter(AsignacionTutoria.id == asignacion_id).first()
    if not a:
        raise HTTPException(404, "Asignación no encontrada")

    # ── Registrar en bitácora antes de modificar ──────────────────────────────
    db.add(HistorialEstadoTutoria(
        asignacion_id   = asignacion_id,
        estado_anterior = a.estado_seguimiento,   # estado actual antes del cambio
        estado_nuevo    = data.estado,
        observacion     = data.observaciones,
        usuario_id      = current_user.id,
        creado_en       = _now(),
    ))

    a.estado_seguimiento    = data.estado
    a.estado_observaciones  = data.observaciones
    a.estado_actualizado_en = _now()
    db.commit()

    # Notificar al tutor del grupo si el estado cambió a algo relevante
    grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == a.grupo_tutorado_id).first()
    alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == a.alumno_id).first()
    if grupo and alumno:
        nombre_al = f"{alumno.apellido_paterno} {alumno.nombres}".strip()
        etiquetas = {
            "EN_OBSERVACION": "👀 Alumno en observación",
            "CANALIZADO":     "🔴 Alumno canalizado",
            "ATENDIDO":       "✅ Atención registrada",
            "CERRADO":        "✔ Caso cerrado",
        }
        if data.estado in etiquetas:
            _notificar_usuario(
                db, grupo.tutor_id, "TUTORIA_ESTADO",
                etiquetas[data.estado],
                f"{nombre_al} fue marcado como '{data.estado.replace('_',' ').title()}' por el responsable de tutoría.",
                url="/docente/mis-tutorados",
            )
    return {"ok": True, "estado": data.estado}


# ═══════════════════════════════════════════════════════════════════════════════
#  VISTA GLOBAL DE ALUMNOS EN RIESGO
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/alumnos-riesgo", summary="Vista global de alumnos con semáforo de vulnerabilidad")
def alumnos_en_riesgo(
    semaforo:  Optional[str] = None,   # ALTO | MEDIO | BAJO | SIN_DATOS | None (todos)
    tutor_id:  Optional[int] = None,
    carrera:   Optional[str] = None,
    periodo:   Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    """
    Consolida todos los alumnos tutorados activos con su perfil de vulnerabilidad.
    Ordenados: ALTO primero, luego MEDIO, BAJO, SIN_DATOS.
    """
    # Grupos activos con filtros opcionales
    q_grupos = db.query(GrupoTutorado).filter(GrupoTutorado.activo == True)
    if tutor_id:
        q_grupos = q_grupos.filter(GrupoTutorado.tutor_id == tutor_id)
    if carrera:
        q_grupos = q_grupos.filter(GrupoTutorado.carrera == carrera)
    if periodo:
        q_grupos = q_grupos.filter(GrupoTutorado.periodo == periodo)
    grupos = q_grupos.all()

    _orden = {"ALTO": 0, "MEDIO": 1, "BAJO": 2, "SIN_DATOS": 3}
    resultado = []

    for g in grupos:
        tutor = db.query(Usuario).filter(Usuario.id == g.tutor_id).first()
        asignaciones = db.query(AsignacionTutoria).filter(
            AsignacionTutoria.grupo_tutorado_id == g.id,
            AsignacionTutoria.activo == True,
        ).all()

        for asig in asignaciones:
            alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == asig.alumno_id).first()
            if not alumno:
                continue
            perfil  = db.query(PerfilSocioeconómico).filter(
                PerfilSocioeconómico.alumno_id == alumno.id
            ).first()
            perfil_d = _ser_perfil(perfil)
            sem = _semaforo(perfil_d)

            if semaforo and sem != semaforo:
                continue

            # Canalizaciones activas del alumno en este grupo
            cans = db.query(Canalizacion).filter(
                Canalizacion.alumno_id == alumno.id,
                Canalizacion.estado.in_(["PENDIENTE", "EN_SEGUIMIENTO"]),
            ).count()

            # Última sesión a la que asistió
            ultima_sesion = db.query(RegistroSesionAlumno).join(SesionTutoria).filter(
                RegistroSesionAlumno.alumno_id == alumno.id,
                SesionTutoria.grupo_tutorado_id == g.id,
                RegistroSesionAlumno.asistio == True,
            ).order_by(SesionTutoria.fecha.desc()).first()

            ultima_fecha = None
            if ultima_sesion:
                ses = db.query(SesionTutoria).filter(
                    SesionTutoria.id == ultima_sesion.sesion_id
                ).first()
                ultima_fecha = ses.fecha.isoformat() if ses else None

            resultado.append({
                **_ser_alumno_basico(alumno),
                "semaforo_vulnerabilidad": sem,
                "perfil_socioeconomico":   perfil_d,
                "grupo_id":      g.id,
                "carrera":       g.carrera,
                "grupo":         g.grupo,
                "periodo":       g.periodo,
                "tutor_id":      g.tutor_id,
                "tutor_nombre":  tutor.nombre if tutor else None,
                "canalizaciones_activas": cans,
                "ultima_asistencia":      ultima_fecha,
            })

    resultado.sort(key=lambda x: (_orden.get(x["semaforo_vulnerabilidad"], 3), x["nombre"]))
    return resultado


# ═══════════════════════════════════════════════════════════════════════════════
#  HISTORIAL COMPLETO DEL ALUMNO
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/alumno/{alumno_id}/seguimiento", summary="Historial completo de un alumno tutorado")
def historial_alumno(
    alumno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == alumno_id).first()
    if not alumno:
        raise HTTPException(404, "Alumno no encontrado")

    perfil   = db.query(PerfilSocioeconómico).filter(PerfilSocioeconómico.alumno_id == alumno_id).first()
    perfil_d = _ser_perfil(perfil)

    # Asignaciones a grupos (histórico completo, no solo activo)
    asignaciones = db.query(AsignacionTutoria).filter(AsignacionTutoria.alumno_id == alumno_id).all()

    sesiones_resultado = []
    for asig in asignaciones:
        grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == asig.grupo_tutorado_id).first()
        if not grupo:
            continue
        tutor = db.query(Usuario).filter(Usuario.id == grupo.tutor_id).first()
        sesiones = db.query(SesionTutoria).filter(
            SesionTutoria.grupo_tutorado_id == grupo.id
        ).order_by(SesionTutoria.fecha.desc()).all()

        for s in sesiones:
            reg = db.query(RegistroSesionAlumno).filter(
                RegistroSesionAlumno.sesion_id == s.id,
                RegistroSesionAlumno.alumno_id == alumno_id,
            ).first()
            tipos_atencion = []
            if reg:
                if reg.tipo_academico: tipos_atencion.append("Académico")
                if reg.tipo_personal:  tipos_atencion.append("Personal")
                if reg.tipo_otro:      tipos_atencion.append("Otro")
            sesiones_resultado.append({
                "sesion_id":    s.id,
                "fecha":        s.fecha.isoformat() if s.fecha else None,
                "tipo_sesion":  s.tipo_sesion,
                "carrera":      grupo.carrera,
                "grupo":        grupo.grupo,
                "periodo":      grupo.periodo,
                "tutor_nombre": tutor.nombre if tutor else None,
                "asistio":      reg.asistio if reg else None,
                "tipos_atencion": tipos_atencion,
                "requiere_canalizacion": reg.requiere_canalizacion if reg else False,
                "tema":                  reg.tema if reg else None,
                "acciones_preventivas":  reg.acciones_preventivas if reg else None,
                "comentarios":           reg.comentarios if reg else None,
                "obs_generales":         s.observaciones_generales,
                "documento": {
                    "codigo": s.documento_codigo or "F-DC-07",
                    "version": s.documento_version or "08",
                    "fecha_efectivo": s.documento_efectivo.isoformat() if s.documento_efectivo else None,
                },
            })

    sesiones_resultado.sort(key=lambda x: x["fecha"] or "", reverse=True)

    canalizaciones = db.query(Canalizacion).filter(
        Canalizacion.alumno_id == alumno_id
    ).order_by(Canalizacion.fecha_solicitud.desc()).all()

    # ── Bitácora de evolución del seguimiento ─────────────────────────────────
    # Recopilamos todos los registros de historial de todas las asignaciones
    asig_ids = [a.id for a in asignaciones]
    historial_raw = []
    if asig_ids:
        historial_raw = db.query(HistorialEstadoTutoria).filter(
            HistorialEstadoTutoria.asignacion_id.in_(asig_ids)
        ).order_by(HistorialEstadoTutoria.creado_en.asc()).all()

    evolucion = []
    for h in historial_raw:
        responsable = db.query(Usuario).filter(Usuario.id == h.usuario_id).first()
        evolucion.append({
            "id":              h.id,
            "estado_anterior": h.estado_anterior,
            "estado_nuevo":    h.estado_nuevo,
            "observacion":     h.observacion,
            "responsable":     responsable.nombre if responsable else "Sistema",
            "creado_en":       h.creado_en.isoformat() if h.creado_en else None,
        })

    total_ses  = len(sesiones_resultado)
    total_asis = sum(1 for s in sesiones_resultado if s["asistio"] is True)
    total_inas = sum(1 for s in sesiones_resultado if s["asistio"] is False)
    porcentaje_asistencia = round((total_asis / (total_asis + total_inas)) * 100, 1) if (total_asis + total_inas) else 0

    detalles_informe = db.query(DetalleInformeBimestral).filter(
        DetalleInformeBimestral.alumno_id == alumno_id
    ).order_by(DetalleInformeBimestral.id.desc()).all()
    informes_alumno = []
    for d in detalles_informe:
        inf = db.query(InformeBimestral).filter(InformeBimestral.id == d.informe_id).first()
        if not inf:
            continue
        grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == inf.grupo_tutorado_id).first()
        informes_alumno.append({
            "informe_id": inf.id,
            "periodo": inf.periodo,
            "bimestre": inf.bimestre,
            "estado": inf.estado,
            "categoria": d.categoria,
            "detalle": d.detalle,
            "grupo": grupo.grupo if grupo else None,
            "carrera": grupo.carrera if grupo else None,
            "documento": {
                "codigo": inf.documento_codigo or "F-DC-09",
                "version": inf.documento_version or "08",
                "fecha_efectivo": inf.documento_efectivo.isoformat() if inf.documento_efectivo else None,
            },
        })

    # Estado actual de seguimiento (última asignación activa)
    asig_activa = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.alumno_id == alumno_id,
        AsignacionTutoria.activo    == True,
    ).order_by(AsignacionTutoria.asignado_en.desc()).first()

    grupos_historial = []
    for a in asignaciones:
        grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == a.grupo_tutorado_id).first()
        tutor = db.query(Usuario).filter(Usuario.id == grupo.tutor_id).first() if grupo else None
        if grupo:
            grupos_historial.append({
                "grupo_id": grupo.id,
                "carrera": grupo.carrera,
                "cuatrimestre": grupo.cuatrimestre,
                "grupo": grupo.grupo,
                "periodo": grupo.periodo,
                "activo": a.activo,
                "tutor_nombre": tutor.nombre if tutor else None,
                "asignado_en": a.asignado_en.isoformat() if a.asignado_en else None,
                "estado_seguimiento": a.estado_seguimiento,
            })

    documentos_generados = []
    for s in sesiones_resultado:
        documentos_generados.append({
            "tipo": "CONTROL_TUTORIA",
            "codigo": s["documento"]["codigo"],
            "version": s["documento"]["version"],
            "fecha": s["fecha"],
            "referencia": f"Sesion #{s['sesion_id']}",
        })
    for c in canalizaciones:
        documentos_generados.append({
            "tipo": "CANALIZACION",
            "codigo": c.documento_codigo or "F-DC-08",
            "version": c.documento_version or "08",
            "fecha": c.fecha_solicitud.isoformat() if c.fecha_solicitud else None,
            "referencia": f"Canalizacion #{c.id}",
        })
    for inf in informes_alumno:
        documentos_generados.append({
            "tipo": "INFORME_BIMESTRAL",
            "codigo": inf["documento"]["codigo"],
            "version": inf["documento"]["version"],
            "fecha": None,
            "referencia": f"Informe #{inf['informe_id']} · B{inf['bimestre']}",
        })

    return {
        "alumno":                    _ser_alumno_basico(alumno),
        "perfil_socioeconomico":     perfil_d,
        "semaforo_vulnerabilidad":   _semaforo(perfil_d),
        "estado_seguimiento":        asig_activa.estado_seguimiento if asig_activa else "SIN_SEGUIMIENTO",
        "estado_observaciones":      asig_activa.estado_observaciones if asig_activa else None,
        "sesiones":                  sesiones_resultado,
        "canalizaciones":            [_ser_canalizacion(c, db) for c in canalizaciones],
        "evolucion_seguimiento":     evolucion,
        "total_sesiones":            total_ses,
        "total_asistencias":         total_asis,
        "total_inasistencias":       total_inas,
        "porcentaje_asistencia":     porcentaje_asistencia,
        "informes":                  informes_alumno,
        "grupos_historial":          grupos_historial,
        "periodo_actual":            grupos_historial[0]["periodo"] if grupos_historial else None,
        "documentos_generados":      documentos_generados,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  ALERTAS PERSISTENTES
# ═══════════════════════════════════════════════════════════════════════════════

def _calcular_alertas(db: Session) -> list:
    """Lógica central de alertas — reutilizable por GET y POST /procesar."""
    alertas = []
    ahora   = _now()

    # 1. Grupos activos sin sesión en los últimos 14 días
    hace_14 = ahora - datetime.timedelta(days=14)
    grupos_activos = db.query(GrupoTutorado).filter(GrupoTutorado.activo == True).all()
    for g in grupos_activos:
        tutor = db.query(Usuario).filter(Usuario.id == g.tutor_id).first()
        ultima = db.query(SesionTutoria).filter(
            SesionTutoria.grupo_tutorado_id == g.id
        ).order_by(SesionTutoria.fecha.desc()).first()

        nombre_tutor = tutor.nombre if tutor else "Tutor desconocido"
        desc_grupo   = f"{g.carrera} Grupo {g.grupo} ({g.periodo})"

        if not ultima:
            alertas.append({
                "tipo":    "SIN_SESION",
                "nivel":   "ALTO",
                "mensaje": f"{nombre_tutor} no ha registrado ninguna sesión para {desc_grupo}",
                "detalle": "Sin sesiones F-DC-07 registradas.",
                "grupo_id": g.id,
                "dias":    None,
            })
        else:
            fecha_ul = datetime.datetime.combine(ultima.fecha, datetime.time())
            if fecha_ul < hace_14:
                dias  = (ahora.date() - ultima.fecha).days
                nivel = "ALTO" if dias > 21 else "MEDIO"
                alertas.append({
                    "tipo":    "SIN_SESION",
                    "nivel":   nivel,
                    "mensaje": f"{nombre_tutor} sin sesión en {desc_grupo} hace {dias} días",
                    "detalle": f"Última sesión: {ultima.fecha.strftime('%d/%m/%Y')}",
                    "grupo_id": g.id,
                    "dias":    dias,
                })

    # 2. Canalizaciones pendientes con más de 10 días sin movimiento
    hace_10 = ahora - datetime.timedelta(days=10)
    cans_viejas = db.query(Canalizacion).filter(
        Canalizacion.estado == "PENDIENTE",
        Canalizacion.fecha_solicitud < hace_10,
    ).all()
    for c in cans_viejas:
        alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == c.alumno_id).first()
        dias   = (ahora - c.fecha_solicitud).days
        nivel  = "ALTO" if dias > 21 else "MEDIO"
        nombre = f"{alumno.apellido_paterno} {alumno.nombres}".strip() if alumno else "Alumno desconocido"
        motivo_corto = c.motivo[:80] + ("..." if len(c.motivo) > 80 else "")
        alertas.append({
            "tipo":      "CANALIZACION_PENDIENTE",
            "nivel":     nivel,
            "mensaje":   f"Canalización de {nombre} pendiente hace {dias} días sin atención",
            "detalle":   f"Motivo: {motivo_corto}",
            "can_id":    c.id,
            "alumno_id": c.alumno_id,
            "dias":      dias,
        })

    progs_vencidas = db.query(ProgramacionSesionTutoria).filter(
        ProgramacionSesionTutoria.estado == "PROGRAMADA",
        ProgramacionSesionTutoria.fecha_programada < ahora.date(),
    ).all()
    for p in progs_vencidas:
        grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == p.grupo_tutorado_id).first()
        tutor = db.query(Usuario).filter(Usuario.id == p.tutor_id).first()
        dias = (ahora.date() - p.fecha_programada).days
        desc = f"{grupo.carrera} Grupo {grupo.grupo} ({grupo.periodo})" if grupo else "grupo no localizado"
        alertas.append({
            "tipo": "SESION_PROGRAMADA_VENCIDA",
            "nivel": "ALTO" if dias > 7 else "MEDIO",
            "mensaje": f"Sesion programada sin evidencia F-DC-07 para {desc}",
            "detalle": f"Tutor: {tutor.nombre if tutor else 'Tutor desconocido'} · Fecha programada: {p.fecha_programada.strftime('%d/%m/%Y')}",
            "grupo_id": p.grupo_tutorado_id,
            "programacion_id": p.id,
            "dias": dias,
        })

    for g in grupos_activos:
        for b in (1, 2):
            inf = db.query(InformeBimestral).filter(
                InformeBimestral.grupo_tutorado_id == g.id,
                InformeBimestral.periodo == g.periodo,
                InformeBimestral.bimestre == b,
            ).first()
            if not inf or inf.estado != "RECIBIDO":
                alertas.append({
                    "tipo": "INFORME_PENDIENTE",
                    "nivel": "MEDIO",
                    "mensaje": f"F-DC-09 B{b} pendiente de recepcion para {g.carrera} Grupo {g.grupo}",
                    "detalle": f"Periodo {g.periodo}. Estado: {inf.estado if inf else 'SIN_GENERAR'}",
                    "grupo_id": g.id,
                    "dias": 0,
                })

    asignaciones = db.query(AsignacionTutoria).filter(AsignacionTutoria.activo == True).all()
    for a in asignaciones:
        if a.estado_seguimiento and a.estado_seguimiento != "SIN_SEGUIMIENTO":
            continue
        perfil = db.query(PerfilSocioeconómico).filter(PerfilSocioeconómico.alumno_id == a.alumno_id).first()
        if _semaforo(_ser_perfil(perfil)) != "ALTO":
            continue
        alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == a.alumno_id).first()
        grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == a.grupo_tutorado_id).first()
        nombre = f"{alumno.apellido_paterno} {alumno.nombres}".strip() if alumno else "Alumno desconocido"
        alertas.append({
            "tipo": "RIESGO_ALTO_SIN_SEGUIMIENTO",
            "nivel": "ALTO",
            "mensaje": f"{nombre} tiene riesgo alto sin estado de seguimiento",
            "detalle": f"{grupo.carrera} Grupo {grupo.grupo} · {grupo.periodo}" if grupo else "Asignacion sin grupo",
            "grupo_id": a.grupo_tutorado_id,
            "alumno_id": a.alumno_id,
            "dias": 999,
        })

    # Ordenar: ALTO primero, luego por días desc
    alertas.sort(key=lambda x: (0 if x["nivel"] == "ALTO" else 1, -(x["dias"] or 9999)))
    return alertas


@router.get("/alertas", summary="Alertas persistentes del sistema de tutoría")
def alertas_tutoria(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    return _calcular_alertas(db)


@router.post("/alertas/procesar", summary="Generar notificaciones para alertas no enviadas en 48 h")
def procesar_alertas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    """
    Recorre las alertas activas y genera notificaciones para responsables
    siempre que no se haya enviado una notificación idéntica en las últimas 48 horas.
    Devuelve el número de notificaciones nuevas generadas.
    """
    alertas = _calcular_alertas(db)
    hace_48 = _now() - datetime.timedelta(hours=48)
    nuevas  = 0

    for a in alertas:
        # Clave única para deduplicar: tipo + id de referencia
        ref_id  = a.get("grupo_id") or a.get("can_id") or 0
        tipo_n  = f"ALERTA_TUTORIA_{a['tipo']}"
        ref_url = f"/admin/tutoria?ref={ref_id}"

        # ¿Ya existe una notificación con este tipo+url en las últimas 48 h?
        ya_existe = db.query(Notificacion).filter(
            Notificacion.tipo == tipo_n,
            Notificacion.url  == ref_url,
            Notificacion.fecha >= hace_48,
        ).first()

        if ya_existe:
            continue

        # Emitir una sola notificación a todos los responsables
        titulo  = f"{'🔴' if a['nivel'] == 'ALTO' else '🟡'} {a['nivel']}: {a['mensaje'][:80]}"
        mensaje = a.get("detalle", "") or a["mensaje"]
        _notificar_responsables(db, tipo_n, titulo, mensaje, url=ref_url)
        nuevas += 1

    db.commit()
    return {"alertas_total": len(alertas), "notificaciones_nuevas": nuevas}


# ═══════════════════════════════════════════════════════════════════════════════
#  REPORTE GENERAL DE TUTORADOS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/reporte-general", summary="Tabla completa de todos los alumnos tutorados activos")
def reporte_general(
    carrera:  Optional[str] = None,
    periodo:  Optional[str] = None,
    tutor_id: Optional[int] = None,
    semaforo: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    q_grupos = db.query(GrupoTutorado).filter(GrupoTutorado.activo == True)
    if carrera:  q_grupos = q_grupos.filter(GrupoTutorado.carrera == carrera)
    if periodo:  q_grupos = q_grupos.filter(GrupoTutorado.periodo == periodo)
    if tutor_id: q_grupos = q_grupos.filter(GrupoTutorado.tutor_id == tutor_id)
    grupos = q_grupos.all()

    _orden_sem = {"ALTO": 0, "MEDIO": 1, "BAJO": 2, "SIN_DATOS": 3}
    resultado  = []

    for g in grupos:
        tutor = db.query(Usuario).filter(Usuario.id == g.tutor_id).first()
        asignaciones = db.query(AsignacionTutoria).filter(
            AsignacionTutoria.grupo_tutorado_id == g.id,
            AsignacionTutoria.activo == True,
        ).all()
        total_sesiones_grupo = db.query(SesionTutoria).filter(
            SesionTutoria.grupo_tutorado_id == g.id
        ).count()

        for asig in asignaciones:
            alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == asig.alumno_id).first()
            if not alumno:
                continue
            perfil_d = _ser_perfil(
                db.query(PerfilSocioeconómico).filter(PerfilSocioeconómico.alumno_id == alumno.id).first()
            )
            sem = _semaforo(perfil_d)
            if semaforo and sem != semaforo:
                continue

            cans_activas = db.query(Canalizacion).filter(
                Canalizacion.alumno_id == alumno.id,
                Canalizacion.estado.in_(["PENDIENTE", "EN_SEGUIMIENTO"]),
            ).count()
            regs_alumno = db.query(RegistroSesionAlumno).join(
                SesionTutoria, SesionTutoria.id == RegistroSesionAlumno.sesion_id
            ).filter(
                RegistroSesionAlumno.alumno_id == alumno.id,
                SesionTutoria.grupo_tutorado_id == g.id,
            ).all()
            asistencias = sum(1 for r in regs_alumno if r.asistio is True)
            inasistencias = sum(1 for r in regs_alumno if r.asistio is False)

            ultima_reg = db.query(RegistroSesionAlumno).join(
                SesionTutoria, SesionTutoria.id == RegistroSesionAlumno.sesion_id
            ).filter(
                RegistroSesionAlumno.alumno_id == alumno.id,
                SesionTutoria.grupo_tutorado_id == g.id,
                RegistroSesionAlumno.asistio == True,
            ).order_by(SesionTutoria.fecha.desc()).first()

            ultima_fecha = None
            if ultima_reg:
                ses = db.query(SesionTutoria).filter(SesionTutoria.id == ultima_reg.sesion_id).first()
                ultima_fecha = ses.fecha.isoformat() if ses else None

            resultado.append({
                "alumno_id":              alumno.id,
                "matricula":              alumno.matricula,
                "nombre":                 f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip(),
                "carrera":                g.carrera,
                "cuatrimestre":           g.cuatrimestre,
                "grupo":                  g.grupo,
                "periodo":                g.periodo,
                "tutor_nombre":           tutor.nombre if tutor else None,
                "semaforo_vulnerabilidad": sem,
                "estado_seguimiento":     asig.estado_seguimiento,
                "sesiones_grupo":         total_sesiones_grupo,
                "asistencias":            asistencias,
                "inasistencias":          inasistencias,
                "porcentaje_asistencia":  round((asistencias / (asistencias + inasistencias)) * 100, 1) if (asistencias + inasistencias) else 0,
                "canalizaciones_activas": cans_activas,
                "ultima_asistencia":      ultima_fecha,
                "tiene_perfil":           perfil_d is not None,
            })

    resultado.sort(key=lambda x: (
        _orden_sem.get(x["semaforo_vulnerabilidad"], 3),
        x["carrera"] or "",
        x["grupo"]   or "",
        x["nombre"]  or "",
    ))
    return resultado


# ═══════════════════════════════════════════════════════════════════════════════
#  CIERRE DE BIMESTRE / CUATRIMESTRE
# ═══════════════════════════════════════════════════════════════════════════════

def _ser_cierre(c: CierreTutoria) -> dict:
    resumen = None
    if c.resumen_json:
        try:
            resumen = json.loads(c.resumen_json)
        except Exception:
            resumen = None
    return {
        "id": c.id,
        "periodo": c.periodo,
        "bimestre": c.bimestre,
        "alcance": c.alcance,
        "estado": c.estado,
        "total_grupos": c.total_grupos,
        "total_tutores": c.total_tutores,
        "total_tutorados": c.total_tutorados,
        "total_sesiones": c.total_sesiones,
        "total_asistencias": c.total_asistencias,
        "total_inasistencias": c.total_inasistencias,
        "alumnos_riesgo_alto": c.alumnos_riesgo_alto,
        "canalizaciones_pendientes": c.canalizaciones_pendientes,
        "canalizaciones_seguimiento": c.canalizaciones_seguimiento,
        "canalizaciones_atendidas": c.canalizaciones_atendidas,
        "informes_borrador": c.informes_borrador,
        "informes_enviados": c.informes_enviados,
        "informes_recibidos": c.informes_recibidos,
        "grupos_sin_sesion": c.grupos_sin_sesion,
        "resumen": resumen,
        "observaciones": c.observaciones,
        "cerrado_por": c.cerrado_por,
        "cerrado_en": c.cerrado_en.isoformat() if c.cerrado_en else None,
    }


@router.get("/cierres/resumen", summary="Previsualizar cierre de periodo o bimestre")
def resumen_cierre(
    periodo: str,
    bimestre: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    indicadores = _calcular_indicadores(db, periodo=periodo, bimestre=bimestre)
    grupos_periodo = db.query(GrupoTutorado).filter(
        GrupoTutorado.activo == True,
        GrupoTutorado.periodo == periodo,
    ).all()
    grupo_ids = [g.id for g in grupos_periodo] or [0]
    programadas_vencidas = db.query(ProgramacionSesionTutoria).filter(
        ProgramacionSesionTutoria.grupo_tutorado_id.in_(grupo_ids),
        ProgramacionSesionTutoria.estado == "PROGRAMADA",
        ProgramacionSesionTutoria.fecha_programada < datetime.date.today(),
    ).count()
    riesgo_sin_seguimiento = 0
    for a in db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id.in_(grupo_ids),
        AsignacionTutoria.activo == True,
    ).all():
        perfil = db.query(PerfilSocioeconómico).filter(PerfilSocioeconómico.alumno_id == a.alumno_id).first()
        if _semaforo(_ser_perfil(perfil)) == "ALTO" and a.estado_seguimiento == "SIN_SEGUIMIENTO":
            riesgo_sin_seguimiento += 1

    checklist = [
        {"clave": "SESIONES_CAPTURADAS", "label": "Sesiones capturadas o programadas atendidas",
         "ok": indicadores["grupos_sin_sesion"] == 0 and programadas_vencidas == 0,
         "detalle": f"{indicadores['grupos_sin_sesion']} grupo(s) sin sesion y {programadas_vencidas} programacion(es) vencida(s)"},
        {"clave": "ALUMNOS_ATENDIDOS", "label": "Alumnos con seguimiento cuando hay riesgo alto",
         "ok": riesgo_sin_seguimiento == 0,
         "detalle": f"{riesgo_sin_seguimiento} alumno(s) de riesgo alto sin seguimiento institucional"},
        {"clave": "CANALIZACIONES", "label": "Canalizaciones atendidas o justificadas",
         "ok": indicadores["canalizaciones_pendientes"] + indicadores["canalizaciones_seguimiento"] == 0,
         "detalle": f"{indicadores['canalizaciones_pendientes'] + indicadores['canalizaciones_seguimiento']} canalizacion(es) abiertas"},
        {"clave": "INFORMES_ENVIADOS", "label": "Informes F-DC-09 enviados",
         "ok": indicadores["informes_borrador"] == 0,
         "detalle": f"{indicadores['informes_borrador']} informe(s) en borrador"},
        {"clave": "INFORMES_ACEPTADOS", "label": "Informes F-DC-09 recibidos por responsable",
         "ok": indicadores["informes_enviados"] == 0,
         "detalle": f"{indicadores['informes_enviados']} informe(s) enviados pendientes de recepcion"},
        {"clave": "OBSERVACIONES_CERRADAS", "label": "Observaciones y casos cerrados",
         "ok": indicadores["seguimiento_estados"].get("EN_OBSERVACION", 0) == 0,
         "detalle": f"{indicadores['seguimiento_estados'].get('EN_OBSERVACION', 0)} alumno(s) en observacion"},
    ]
    pendientes = [i["detalle"] for i in checklist if not i["ok"]]
    legacy_pendientes = []
    if indicadores["grupos_sin_sesion"] > 0:
        pendientes.append(f"{indicadores['grupos_sin_sesion']} grupo(s) sin sesiones registradas")
    if indicadores["canalizaciones_pendientes"] + indicadores["canalizaciones_seguimiento"] > 0:
        pendientes.append(f"{indicadores['canalizaciones_pendientes'] + indicadores['canalizaciones_seguimiento']} canalización(es) abiertas")
    if indicadores["informes_borrador"] + indicadores["informes_enviados"] > 0:
        pendientes.append(f"{indicadores['informes_borrador'] + indicadores['informes_enviados']} informe(s) sin recepción final")

    return {
        "periodo": periodo,
        "bimestre": bimestre,
        "indicadores": indicadores,
        "checklist": checklist,
        "pendientes": pendientes,
        "puede_cerrar": len(pendientes) == 0,
    }


@router.post("/cierres", summary="Registrar cierre formal de Tutoría")
def crear_cierre(
    data: CierreTutoriaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    indicadores = _calcular_indicadores(db, periodo=data.periodo, bimestre=data.bimestre)
    cierre = CierreTutoria(
        periodo=data.periodo,
        bimestre=data.bimestre,
        alcance=data.alcance,
        total_grupos=indicadores["total_grupos"],
        total_tutores=indicadores["total_tutores"],
        total_tutorados=indicadores["total_tutorados"],
        total_sesiones=indicadores["total_sesiones"],
        total_asistencias=indicadores["total_asistencias"],
        total_inasistencias=indicadores["total_inasistencias"],
        alumnos_riesgo_alto=indicadores["alumnos_riesgo_alto"],
        canalizaciones_pendientes=indicadores["canalizaciones_pendientes"],
        canalizaciones_seguimiento=indicadores["canalizaciones_seguimiento"],
        canalizaciones_atendidas=indicadores["canalizaciones_atendidas"],
        informes_borrador=indicadores["informes_borrador"],
        informes_enviados=indicadores["informes_enviados"],
        informes_recibidos=indicadores["informes_recibidos"],
        grupos_sin_sesion=indicadores["grupos_sin_sesion"],
        resumen_json=json.dumps(indicadores, ensure_ascii=False),
        observaciones=data.observaciones,
        cerrado_por=current_user.id,
        cerrado_en=_now(),
    )
    db.add(cierre)
    db.commit()
    db.refresh(cierre)
    return _ser_cierre(cierre)


@router.get("/cierres", summary="Historial de cierres de Tutoría")
def listar_cierres(
    periodo: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    q = db.query(CierreTutoria)
    if periodo:
        q = q.filter(CierreTutoria.periodo == periodo)
    return [_ser_cierre(c) for c in q.order_by(CierreTutoria.cerrado_en.desc()).all()]


# ═══════════════════════════════════════════════════════════════════════════════
#  CONTROL DOCUMENTAL Y PROGRAMACION
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/documentos-controlados", summary="Catalogo documental basico de tutoria")
def listar_documentos_tutoria(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    docs = db.query(DocumentoControladoTutoria).order_by(
        DocumentoControladoTutoria.codigo,
        DocumentoControladoTutoria.vigente.desc(),
        DocumentoControladoTutoria.actualizado_en.desc(),
    ).all()
    return [{
        "id": d.id,
        "codigo": d.codigo,
        "nombre": d.nombre,
        "version": d.version,
        "fecha_efectivo": d.fecha_efectivo.isoformat() if d.fecha_efectivo else None,
        "proceso": d.proceso,
        "vigente": d.vigente,
        "observaciones": d.observaciones,
        "actualizado_en": d.actualizado_en.isoformat() if d.actualizado_en else None,
    } for d in docs]


@router.post("/documentos-controlados", status_code=status.HTTP_201_CREATED, summary="Registrar nueva version documental")
def crear_documento_tutoria(
    data: DocumentoTutoriaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    fecha = None
    if data.fecha_efectivo:
        try:
            fecha = datetime.date.fromisoformat(data.fecha_efectivo)
        except ValueError:
            raise HTTPException(422, "Formato de fecha invalido. Use YYYY-MM-DD")
    if data.vigente:
        db.query(DocumentoControladoTutoria).filter(
            DocumentoControladoTutoria.codigo == data.codigo,
            DocumentoControladoTutoria.vigente == True,
        ).update({"vigente": False})
    doc = DocumentoControladoTutoria(
        codigo=data.codigo,
        nombre=data.nombre,
        version=data.version,
        fecha_efectivo=fecha,
        vigente=data.vigente,
        observaciones=data.observaciones,
        actualizado_en=_now(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "codigo": doc.codigo, "version": doc.version, "vigente": doc.vigente}


@router.get("/programaciones", summary="Programacion esperada de sesiones")
def listar_programaciones(
    periodo: Optional[str] = None,
    grupo_id: Optional[int] = None,
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(ProgramacionSesionTutoria)
    if current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(ProgramacionSesionTutoria.tutor_id == current_user.id)
    if grupo_id:
        q = q.filter(ProgramacionSesionTutoria.grupo_tutorado_id == grupo_id)
    if estado:
        q = q.filter(ProgramacionSesionTutoria.estado == estado)
    if periodo:
        q = q.join(GrupoTutorado, GrupoTutorado.id == ProgramacionSesionTutoria.grupo_tutorado_id).filter(
            GrupoTutorado.periodo == periodo
        )
    return [_ser_programacion(p, db) for p in q.order_by(ProgramacionSesionTutoria.fecha_programada.asc()).all()]


@router.post("/programaciones", status_code=status.HTTP_201_CREATED, summary="Programar una sesion tutorial esperada")
def crear_programacion(
    data: ProgramacionTutoriaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    g = db.query(GrupoTutorado).filter(GrupoTutorado.id == data.grupo_tutorado_id).first()
    if not g:
        raise HTTPException(404, "Grupo tutorado no encontrado")
    try:
        fecha = datetime.date.fromisoformat(data.fecha_programada)
    except ValueError:
        raise HTTPException(422, "Formato de fecha invalido. Use YYYY-MM-DD")
    existente = db.query(ProgramacionSesionTutoria).filter(
        ProgramacionSesionTutoria.grupo_tutorado_id == g.id,
        ProgramacionSesionTutoria.fecha_programada == fecha,
        ProgramacionSesionTutoria.estado != "CANCELADA",
    ).first()
    if existente:
        raise HTTPException(409, "Ya existe una programacion para ese grupo y fecha")
    p = ProgramacionSesionTutoria(
        grupo_tutorado_id=g.id,
        tutor_id=g.tutor_id,
        fecha_programada=fecha,
        tipo_sesion=data.tipo_sesion,
        objetivo=data.objetivo,
        creado_por=current_user.id,
        creado_en=_now(),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _ser_programacion(p, db)


@router.put("/programaciones/{prog_id}", summary="Actualizar programacion tutorial")
def actualizar_programacion(
    prog_id: int,
    data: ProgramacionTutoriaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    p = db.query(ProgramacionSesionTutoria).filter(ProgramacionSesionTutoria.id == prog_id).first()
    if not p:
        raise HTTPException(404, "Programacion no encontrada")
    if data.fecha_programada:
        try:
            p.fecha_programada = datetime.date.fromisoformat(data.fecha_programada)
        except ValueError:
            raise HTTPException(422, "Formato de fecha invalido. Use YYYY-MM-DD")
    if data.tipo_sesion is not None:
        p.tipo_sesion = data.tipo_sesion
    if data.objetivo is not None:
        p.objetivo = data.objetivo
    if data.estado is not None:
        if data.estado not in {"PROGRAMADA", "CUMPLIDA", "OMITIDA", "CANCELADA"}:
            raise HTTPException(422, "Estado de programacion invalido")
        p.estado = data.estado
    db.commit()
    db.refresh(p)
    return _ser_programacion(p, db)


# ═══════════════════════════════════════════════════════════════════════════════
#  PERFIL SOCIOECONÓMICO — IMPORTAR EXCEL
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/perfil-socioeconomico/importar", summary="Importar Excel socioeconómico de Servicios Escolares")
async def importar_socioeconomico(
    file: UploadFile = File(...),
    periodo: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Solo se aceptan archivos .xlsx o .xls")

    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    except Exception:
        raise HTTPException(400, "Archivo Excel inválido o dañado")

    ws = wb.active
    creados, actualizados, errores = 0, 0, []
    creados_catalogo = 0  # alumnos nuevos auto-creados en catálogo

    # Columnas del Excel de Servicios Escolares (fila 3 = encabezados, datos desde fila 4)
    # [0]#  [1]NOMBRE [2]AP.PAT [3]AP.MAT [4]MATRICULA [5]FECHA_ING [6]CARRERA
    # [7]SEXO [8]EST_CIVIL [9]LUGAR_NAC [10]HIJOS [11]CUANTOS [12]LENGUA_IND [13]CUAL
    # [19]PROMEDIO [20]AREA_BACH  [34]INGRESO_MENSUAL [50]INGRESO_PAPA [51]INGRESO_MADRE
    # [52]HERMANOS [53]GASTO_MENSUAL [55]APOYO_INST [56]CUAL_APOYO
    # [57]TEL [58]ALERGIA_SI [59]ALERGIA_NO [60]CUAL_ALERGIA [61]MED_ALERGIA
    # [62]ENF_SI [64]DIABETES [65]HIPERT [66]HEMOF [67]CARD [68]OTRA_ENF [69]MED_ENF
    # [70]DISCAP_SI [72]MOTRIZ [73]INTELECTUAL [74]MULTIPLE [75]AUDITIVA [76]VISUAL [77]PSICOSOCIAL [78]OTRA_DISCAP [79]MED_DISCAP

    def _cuatrimestre_actual(fecha_ingreso) -> int:
        """Estima el cuatrimestre cursado según la fecha de ingreso."""
        if not isinstance(fecha_ingreso, datetime.datetime):
            return 1
        hoy = datetime.date.today()
        meses = (hoy.year - fecha_ingreso.year) * 12 + (hoy.month - fecha_ingreso.month)
        return max(1, min(12, (meses // 4) + 1))

    _periodo_default = periodo or "ACTUAL"

    for row_idx, row in enumerate(ws.iter_rows(min_row=4, values_only=True), start=4):
        if not row[4]:
            continue
        matricula = _norm(row[4])
        if not matricula:
            continue

        alumno = db.query(CatalogoAlumno).filter(
            CatalogoAlumno.matricula == matricula
        ).first()

        if not alumno:
            # Auto-crear alumno en catálogo con datos del Excel
            nombres_raw  = _norm(row[1]) if row[1] else ""
            ap_pat       = _norm(row[2]) if row[2] else ""
            ap_mat       = _norm(row[3]) if row[3] else ""
            carrera_raw  = _norm(row[6]) if len(row) > 6 and row[6] else "Sin carrera"
            fecha_ing    = row[5] if len(row) > 5 else None
            cuatrimestre = _cuatrimestre_actual(fecha_ing)

            if not nombres_raw and not ap_pat:
                errores.append({"fila": row_idx, "matricula": matricula,
                                "error": "Sin datos de nombre, no se pudo crear"})
                continue

            alumno = CatalogoAlumno(
                matricula        = matricula,
                apellido_paterno = ap_pat or "—",
                apellido_materno = ap_mat or "—",
                nombres          = nombres_raw or "—",
                carrera          = carrera_raw,
                cuatrimestre     = cuatrimestre,
                grupo            = "N/A",
                periodo          = _periodo_default,
                activo           = True,
            )
            db.add(alumno)
            db.flush()  # obtener alumno.id antes de crear perfil
            creados_catalogo += 1

        def _b(val) -> bool:
            return str(val).strip().upper() in ("X", "SI", "SÍ", "S", "1", "TRUE") if val else False

        def _f(val) -> Optional[float]:
            try:
                return float(val) if val is not None else None
            except (ValueError, TypeError):
                return None

        # Calcular ingreso familiar total
        ingreso_papa    = _f(row[50]) or 0
        ingreso_madre   = _f(row[51]) or 0
        ingreso_total   = _f(row[34]) or (ingreso_papa + ingreso_madre) or None

        perfil = db.query(PerfilSocioeconómico).filter(
            PerfilSocioeconómico.alumno_id == alumno.id
        ).first()

        datos = dict(
            periodo_estudio       = _norm(row[5])[:20] if row[5] else None,
            escuela_procedencia   = _norm(row[16]) if len(row) > 16 else None,
            promedio_bachillerato = _f(row[19]),
            area_bachillerato     = _norm(row[20]) if len(row) > 20 else None,
            sexo                   = _norm(row[7]) if len(row) > 7 else None,
            estado_civil           = _norm(row[8]) if len(row) > 8 else None,
            lugar_nacimiento       = _norm(row[9]) if len(row) > 9 else None,
            domicilio_procedencia  = _norm(row[14]) if len(row) > 14 else None,
            domicilio_residencia   = _norm(row[15]) if len(row) > 15 else None,
            telefono               = (_norm(row[31]) if len(row) > 31 and row[31] else None)
                                     or (_norm(row[57]) if len(row) > 57 and row[57] else None),
            habla_lengua_indigena = _b(row[12]) if len(row) > 12 else False,
            lengua_indigena       = _norm(row[13]) if len(row) > 13 else None,
            tiene_hijos           = str(row[10]).strip().upper() == "SI" if row[10] else False,
            num_hijos             = int(row[11]) if row[11] and str(row[11]).isdigit() else 0,
            trabaja               = False,  # no está en el Excel base
            ingreso_familiar_mensual = ingreso_total,
            recibe_apoyo_institucional = str(row[55]).strip().upper() == "SI" if len(row) > 55 and row[55] else False,
            institucion_apoyo     = _norm(row[56]) if len(row) > 56 else None,
            tiene_alergia         = _b(row[58]) if len(row) > 58 else False,
            medicamento_alergia   = _norm(row[61]) if len(row) > 61 else None,
            tiene_enfermedad_cronica = _b(row[62]) if len(row) > 62 else False,
            diabetes              = _b(row[64]) if len(row) > 64 else False,
            hipertension          = _b(row[65]) if len(row) > 65 else False,
            hemofilia             = _b(row[66]) if len(row) > 66 else False,
            problemas_cardiacos   = _b(row[67]) if len(row) > 67 else False,
            otra_enfermedad       = _norm(row[68]) if len(row) > 68 else None,
            medicamento_enfermedad = _norm(row[69]) if len(row) > 69 else None,
            tiene_discapacidad    = _b(row[70]) if len(row) > 70 else False,
            discapacidad_motriz   = _b(row[72]) if len(row) > 72 else False,
            discapacidad_intelectual = _b(row[73]) if len(row) > 73 else False,
            discapacidad_multiple = _b(row[74]) if len(row) > 74 else False,
            discapacidad_auditiva = _b(row[75]) if len(row) > 75 else False,
            discapacidad_visual   = _b(row[76]) if len(row) > 76 else False,
            discapacidad_psicosocial = _b(row[77]) if len(row) > 77 else False,
            otra_discapacidad     = _norm(row[78]) if len(row) > 78 else None,
            medicamento_discapacidad = _norm(row[79]) if len(row) > 79 else None,
            actualizado_en        = _now(),
        )

        if perfil:
            for k, v in datos.items():
                setattr(perfil, k, v)
            actualizados += 1
        else:
            db.add(PerfilSocioeconómico(alumno_id=alumno.id, importado_en=_now(), **datos))
            creados += 1

    db.commit()
    return {
        "creados": creados,
        "actualizados": actualizados,
        "creados_catalogo": creados_catalogo,
        "errores": errores,
        "total_errores": len(errores),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  PANEL OPERATIVO DEL TUTOR — mis-pendientes
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/mis-pendientes", summary="Pendientes operativos del tutor para esta semana")
def mis_pendientes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Devuelve en una sola llamada todo lo que el tutor tiene pendiente:
      - sesiones_vencidas: programaciones pasadas sin registrar
      - sesiones_proximas: programaciones de los próximos 7 días
      - alumnos_riesgo:    alumnos con semáforo ALTO y SIN_SEGUIMIENTO
      - canalizaciones_pendientes: propias abiertas ≥ 5 días
      - informes_borrador: informes F-DC-09 en estado BORRADOR
    """
    hoy       = datetime.date.today()
    hace_5    = _now() - datetime.timedelta(days=5)
    proximos7 = hoy + datetime.timedelta(days=7)

    # Grupos del tutor
    grupos = db.query(GrupoTutorado).filter(
        GrupoTutorado.tutor_id == current_user.id,
        GrupoTutorado.activo   == True,
    ).all()
    grupo_ids = [g.id for g in grupos]

    if not grupo_ids:
        return {
            "sesiones_vencidas": [], "sesiones_proximas": [],
            "alumnos_riesgo": [], "canalizaciones_pendientes": [],
            "informes_borrador": [],
            "resumen": {"urgente": 0, "pendiente": 0},
        }

    # ── Sesiones programadas vencidas (sin realizar) ──────────────────────────
    progs_vencidas = db.query(ProgramacionSesionTutoria).filter(
        ProgramacionSesionTutoria.grupo_tutorado_id.in_(grupo_ids),
        ProgramacionSesionTutoria.tutor_id == current_user.id,
        ProgramacionSesionTutoria.estado   == "PROGRAMADA",
        ProgramacionSesionTutoria.fecha_programada < hoy,
    ).order_by(ProgramacionSesionTutoria.fecha_programada).all()

    # ── Sesiones próximas (≤7 días) ───────────────────────────────────────────
    progs_proximas = db.query(ProgramacionSesionTutoria).filter(
        ProgramacionSesionTutoria.grupo_tutorado_id.in_(grupo_ids),
        ProgramacionSesionTutoria.tutor_id == current_user.id,
        ProgramacionSesionTutoria.estado   == "PROGRAMADA",
        ProgramacionSesionTutoria.fecha_programada >= hoy,
        ProgramacionSesionTutoria.fecha_programada <= proximos7,
    ).order_by(ProgramacionSesionTutoria.fecha_programada).all()

    def _ser_prog_mini(p):
        g = next((x for x in grupos if x.id == p.grupo_tutorado_id), None)
        dias_atraso = (hoy - p.fecha_programada).days if p.fecha_programada < hoy else 0
        return {
            "id":              p.id,
            "grupo_id":        p.grupo_tutorado_id,
            "grupo_label":     f"{g.carrera} Gr.{g.grupo}" if g else "Grupo",
            "fecha_programada": p.fecha_programada.isoformat(),
            "tipo_sesion":     p.tipo_sesion,
            "objetivo":        p.objetivo,
            "dias_atraso":     dias_atraso,
        }

    sesiones_vencidas = [_ser_prog_mini(p) for p in progs_vencidas]
    sesiones_proximas = [_ser_prog_mini(p) for p in progs_proximas]

    # ── Alumnos de riesgo ALTO sin seguimiento ────────────────────────────────
    asignaciones = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id.in_(grupo_ids),
        AsignacionTutoria.activo == True,
        AsignacionTutoria.estado_seguimiento == "SIN_SEGUIMIENTO",
    ).all()
    alumnos_riesgo = []
    for a in asignaciones:
        alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == a.alumno_id).first()
        perfil = db.query(PerfilSocioeconómico).filter(
            PerfilSocioeconómico.alumno_id == a.alumno_id
        ).first()
        perfil_d = _ser_perfil(perfil)
        if _semaforo(perfil_d) == "ALTO":
            g = next((x for x in grupos if x.id == a.grupo_tutorado_id), None)
            alumnos_riesgo.append({
                "alumno_id":     a.alumno_id,
                "asignacion_id": a.id,
                "nombre":        f"{alumno.apellido_paterno} {alumno.nombres}".strip() if alumno else "—",
                "matricula":     alumno.matricula if alumno else "—",
                "grupo_label":   f"{g.carrera} Gr.{g.grupo}" if g else "Grupo",
            })

    # ── Canalizaciones pendientes propias ≥5 días ─────────────────────────────
    cans_pend = db.query(Canalizacion).filter(
        Canalizacion.tutor_id == current_user.id,
        Canalizacion.estado   == "PENDIENTE",
        Canalizacion.fecha_solicitud <= hace_5,
    ).order_by(Canalizacion.fecha_solicitud).all()

    canalizaciones_pendientes = []
    for c in cans_pend:
        alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == c.alumno_id).first()
        dias = (_now() - c.fecha_solicitud).days
        canalizaciones_pendientes.append({
            "can_id":   c.id,
            "alumno_nombre": f"{alumno.apellido_paterno} {alumno.nombres}".strip() if alumno else "—",
            "alumno_matricula": alumno.matricula if alumno else "—",
            "motivo_corto": c.motivo[:80] + ("…" if len(c.motivo) > 80 else ""),
            "dias":     dias,
            "tipos":    [t for t, v in [
                ("Psicológico", c.tipo_psicologico), ("Pedagógico", c.tipo_pedagogico),
                ("Personal", c.tipo_personal),
            ] if v],
        })

    # ── Informes en BORRADOR ──────────────────────────────────────────────────
    informes_borrador = []
    for inf in db.query(InformeBimestral).filter(
        InformeBimestral.tutor_id == current_user.id,
        InformeBimestral.estado   == "BORRADOR",
    ).all():
        g = next((x for x in grupos if x.id == inf.grupo_tutorado_id), None)
        informes_borrador.append({
            "informe_id":  inf.id,
            "grupo_label": f"{g.carrera} Gr.{g.grupo}" if g else "Grupo",
            "periodo":     inf.periodo,
            "bimestre":    inf.bimestre,
        })

    urgente   = len(sesiones_vencidas) + len(alumnos_riesgo)
    pendiente = len(sesiones_proximas) + len(canalizaciones_pendientes) + len(informes_borrador)

    return {
        "sesiones_vencidas":       sesiones_vencidas,
        "sesiones_proximas":       sesiones_proximas,
        "alumnos_riesgo":          alumnos_riesgo,
        "canalizaciones_pendientes": canalizaciones_pendientes,
        "informes_borrador":       informes_borrador,
        "resumen": {"urgente": urgente, "pendiente": pendiente},
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  SESIONES DE TUTORÍA (F-DC-07)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/sesiones", status_code=status.HTTP_201_CREATED, summary="Registrar sesión de tutoría (F-DC-07)")
def registrar_sesion(
    data: SesionTutoriaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    g = db.query(GrupoTutorado).filter(GrupoTutorado.id == data.grupo_tutorado_id).first()
    if not g:
        raise HTTPException(404, "Grupo tutorado no encontrado")
    if current_user.rol == RolUsuario.DOCENTE and g.tutor_id != current_user.id:
        raise HTTPException(403, "No puedes registrar sesiones de otro tutor")

    try:
        fecha = datetime.date.fromisoformat(data.fecha)
    except ValueError:
        raise HTTPException(422, "Formato de fecha inválido. Use YYYY-MM-DD")

    sesion = SesionTutoria(
        grupo_tutorado_id=data.grupo_tutorado_id,
        tutor_id=current_user.id if current_user.rol == RolUsuario.DOCENTE else g.tutor_id,
        fecha=fecha,
        tipo_sesion=data.tipo_sesion,
        observaciones_generales=data.observaciones_generales,
        creado_en=_now(),
    )
    doc = _documento_vigente(db, "F-DC-07")
    sesion.documento_codigo = doc["codigo"]
    sesion.documento_version = doc["version"]
    sesion.documento_efectivo = doc["fecha_efectivo"]
    db.add(sesion)
    db.flush()

    # Guardar registros por alumno
    for r in data.registros:
        db.add(RegistroSesionAlumno(
            sesion_id=sesion.id,
            alumno_id=r.get("alumno_id"),
            asistio=r.get("asistio", True),
            tipo_academico=r.get("tipo_academico", False),
            tipo_personal=r.get("tipo_personal", False),
            tipo_otro=r.get("tipo_otro", False),
            requiere_canalizacion=r.get("requiere_canalizacion", False),
            tema=r.get("tema"),
            acciones_preventivas=r.get("acciones_preventivas"),
            comentarios=r.get("comentarios"),
        ))

    prog = db.query(ProgramacionSesionTutoria).filter(
        ProgramacionSesionTutoria.grupo_tutorado_id == g.id,
        ProgramacionSesionTutoria.fecha_programada == fecha,
        ProgramacionSesionTutoria.estado == "PROGRAMADA",
    ).first()
    if prog:
        prog.estado = "CUMPLIDA"
        prog.sesion_id = sesion.id

    db.commit()
    db.refresh(sesion)
    return {"id": sesion.id, "fecha": sesion.fecha.isoformat(), "tipo_sesion": sesion.tipo_sesion, "registros": len(data.registros)}


@router.get("/sesiones", summary="Sesiones de tutoría del tutor actual o todas (admin)")
def listar_sesiones(
    grupo_tutorado_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(SesionTutoria)
    if current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(SesionTutoria.tutor_id == current_user.id)
    if grupo_tutorado_id:
        q = q.filter(SesionTutoria.grupo_tutorado_id == grupo_tutorado_id)

    sesiones = q.order_by(SesionTutoria.fecha.desc()).all()
    resultado = []
    for s in sesiones:
        registros = db.query(RegistroSesionAlumno).filter(RegistroSesionAlumno.sesion_id == s.id).all()
        resultado.append({
            "id":                      s.id,
            "grupo_tutorado_id":       s.grupo_tutorado_id,
            "fecha":                   s.fecha.isoformat(),
            "tipo_sesion":             s.tipo_sesion,
            "observaciones_generales": s.observaciones_generales,
            "total_registros":         len(registros),
            "asistentes":              sum(1 for r in registros if r.asistio),
            "con_canalizacion":        sum(1 for r in registros if r.requiere_canalizacion),
        })
    return resultado


# ═══════════════════════════════════════════════════════════════════════════════
#  CANALIZACIONES (F-DC-08)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/canalizaciones", summary="Listar canalizaciones")
def listar_canalizaciones(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(Canalizacion)
    if current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(Canalizacion.tutor_id == current_user.id)
    if estado:
        q = q.filter(Canalizacion.estado == estado)
    return [_ser_canalizacion(c, db) for c in q.order_by(Canalizacion.fecha_solicitud.desc()).all()]


@router.post("/canalizaciones", status_code=status.HTTP_201_CREATED, summary="Levantar canalización (F-DC-08)")
def crear_canalizacion(
    data: CanalizacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if not (data.tipo_psicologico or data.tipo_pedagogico or data.tipo_personal):
        raise HTTPException(422, "Debes seleccionar al menos un tipo de canalización")

    alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == data.alumno_id).first()
    if not alumno:
        raise HTTPException(404, "Alumno no encontrado")

    tutor_id = current_user.id if current_user.rol == RolUsuario.DOCENTE else (
        db.query(GrupoTutorado).filter(GrupoTutorado.id == data.grupo_tutorado_id).first().tutor_id
        if data.grupo_tutorado_id else current_user.id
    )

    c = Canalizacion(
        tutor_id=tutor_id,
        alumno_id=data.alumno_id,
        grupo_tutorado_id=data.grupo_tutorado_id,
        sesion_id=data.sesion_id,
        fecha_solicitud=_now(),
        tipo_psicologico=data.tipo_psicologico,
        tipo_pedagogico=data.tipo_pedagogico,
        tipo_personal=data.tipo_personal,
        modalidad=data.modalidad,
        motivo=data.motivo,
        estado="PENDIENTE",
    )
    doc = _documento_vigente(db, "F-DC-08")
    c.documento_codigo = doc["codigo"]
    c.documento_version = doc["version"]
    c.documento_efectivo = doc["fecha_efectivo"]
    db.add(c)
    db.commit()
    db.refresh(c)

    # Notificar a responsables de tutoría
    nombre_alumno = f"{alumno.apellido_paterno} {alumno.nombres}".strip()
    tipos = [t for t, v in [("Psicológica", data.tipo_psicologico),
                             ("Pedagógica",  data.tipo_pedagogico),
                             ("Personal",    data.tipo_personal)] if v]
    _notificar_responsables(
        db, "tutoria_canalizacion",
        "🔔 Nueva canalización de tutoría",
        f"{current_user.nombre} solicitó canalización {'/'.join(tipos)} para {nombre_alumno}.",
        url="/admin/tutoria",
    )
    db.commit()
    return _ser_canalizacion(c, db)


@router.put("/canalizaciones/{can_id}/atender", summary="Atender canalización (responsable)")
def atender_canalizacion(
    can_id: int,
    data: CanalizacionAtender,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    c = db.query(Canalizacion).filter(Canalizacion.id == can_id).first()
    if not c:
        raise HTTPException(404, "Canalización no encontrada")

    try:
        fecha_at = datetime.date.fromisoformat(data.fecha_atencion)
    except ValueError:
        raise HTTPException(422, "Formato de fecha inválido. Use YYYY-MM-DD")

    c.area_atencion        = data.area_atencion
    c.tipo_servicio        = data.tipo_servicio
    c.fecha_atencion       = fecha_at
    c.descripcion_atencion = data.descripcion_atencion
    c.atendido_por         = current_user.id
    c.atendido_en          = _now()
    c.estado               = "ATENDIDA"
    db.commit()

    # Notificar al tutor que la canalización fue atendida
    alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == c.alumno_id).first()
    nombre_alumno = f"{alumno.apellido_paterno} {alumno.nombres}".strip() if alumno else "alumno"
    _notificar_usuario(
        db, c.tutor_id, "tutoria_canalizacion",
        "✅ Canalización atendida",
        f"La canalización de {nombre_alumno} fue atendida por {current_user.nombre}. "
        f"Área: {data.area_atencion}.",
        url="/docente/mis-tutorados",
    )
    db.commit()
    return _ser_canalizacion(c, db)


@router.put("/canalizaciones/{can_id}/en-seguimiento", summary="Marcar en seguimiento")
def en_seguimiento(
    can_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    c = db.query(Canalizacion).filter(Canalizacion.id == can_id).first()
    if not c:
        raise HTTPException(404, "Canalización no encontrada")
    c.estado = "EN_SEGUIMIENTO"
    db.commit()

    # Notificar al tutor
    alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == c.alumno_id).first()
    nombre_alumno = f"{alumno.apellido_paterno} {alumno.nombres}".strip() if alumno else "alumno"
    _notificar_usuario(
        db, c.tutor_id, "tutoria_canalizacion",
        "🔄 Canalización en seguimiento",
        f"La canalización de {nombre_alumno} está siendo atendida por {current_user.nombre}.",
        url="/docente/mis-tutorados",
    )
    db.commit()
    return {"estado": c.estado}


# ═══════════════════════════════════════════════════════════════════════════════
#  INFORME BIMESTRAL (F-DC-09)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/grupos/{grupo_id}/informe/{bimestre}", summary="Obtener o generar informe bimestral (F-DC-09)")
def obtener_informe(
    grupo_id: int,
    bimestre: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    g = db.query(GrupoTutorado).filter(GrupoTutorado.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo tutorado no encontrado")
    if current_user.rol == RolUsuario.DOCENTE and g.tutor_id != current_user.id:
        raise HTTPException(403, "No tienes acceso a este grupo")

    informe = db.query(InformeBimestral).filter(
        InformeBimestral.grupo_tutorado_id == grupo_id,
        InformeBimestral.bimestre == bimestre,
        InformeBimestral.periodo == g.periodo,
    ).first()

    # Auto-generar si no existe
    if not informe:
        informe = InformeBimestral(
            tutor_id=g.tutor_id,
            grupo_tutorado_id=grupo_id,
            periodo=g.periodo,
            bimestre=bimestre,
            creado_en=_now(),
        )
        doc = _documento_vigente(db, "F-DC-09")
        informe.documento_codigo = doc["codigo"]
        informe.documento_version = doc["version"]
        informe.documento_efectivo = doc["fecha_efectivo"]
        db.add(informe)
        db.flush()

    # Calcular sesiones por mes desde registros reales
    sesiones = db.query(SesionTutoria).filter(
        SesionTutoria.grupo_tutorado_id == grupo_id
    ).all()

    conteo_mes = {1: 0, 2: 0, 3: 0, 4: 0}
    for s in sesiones:
        mes = s.fecha.month
        # Bimestre 1: meses 1-2 del cuatrimestre, Bimestre 2: meses 3-4
        # Se mapea por posición relativa según periodo
        conteo_mes[min(mes % 4 + 1, 4)] += 1

    informe.sesiones_mes1 = conteo_mes[1]
    informe.sesiones_mes2 = conteo_mes[2]
    informe.sesiones_mes3 = conteo_mes[3]
    informe.sesiones_mes4 = conteo_mes[4]

    # Matrícula actual
    informe.matricula_final = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id == grupo_id,
        AsignacionTutoria.activo == True,
    ).count()
    if informe.matricula_inicial == 0:
        informe.matricula_inicial = informe.matricula_final

    db.commit()
    db.refresh(informe)

    # Detalles de vulnerabilidad pre-cargados desde perfiles socioeconómicos
    asignaciones = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id == grupo_id,
        AsignacionTutoria.activo == True,
    ).all()

    detalles_auto = []
    for a in asignaciones:
        alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == a.alumno_id).first()
        perfil = db.query(PerfilSocioeconómico).filter(PerfilSocioeconómico.alumno_id == a.alumno_id).first()
        if not perfil or not alumno:
            continue
        nombre = f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip()
        if perfil.ingreso_familiar_mensual and perfil.ingreso_familiar_mensual < 5000:
            detalles_auto.append({"alumno": nombre, "matricula": alumno.matricula,
                "categoria": "VULNERABILIDAD_ECONOMICA",
                "detalle": f"Ingreso familiar: ${perfil.ingreso_familiar_mensual:,.0f}/mes"})
        if perfil.tiene_enfermedad_cronica:
            enfs = [e for e, v in [("Diabetes", perfil.diabetes), ("Hipertensión", perfil.hipertension),
                ("Hemofilia", perfil.hemofilia), ("Problemas cardíacos", perfil.problemas_cardiacos)] if v]
            if perfil.otra_enfermedad:
                enfs.append(perfil.otra_enfermedad)
            detalles_auto.append({"alumno": nombre, "matricula": alumno.matricula,
                "categoria": "ENFERMEDAD",
                "detalle": ", ".join(enfs) or "Enfermedad crónica"})
        if perfil.tiene_discapacidad:
            detalles_auto.append({"alumno": nombre, "matricula": alumno.matricula,
                "categoria": "APOYO_PSICOPEDAGOGICO",
                "detalle": "Discapacidad diagnosticada"})
        if perfil.tiene_hijos:
            detalles_auto.append({"alumno": nombre, "matricula": alumno.matricula,
                "categoria": "PADRE_MADRE",
                "detalle": None, "num_hijos": perfil.num_hijos})
        if perfil.trabaja:
            detalles_auto.append({"alumno": nombre, "matricula": alumno.matricula,
                "categoria": "TRABAJA",
                "detalle": perfil.empresa})

    # Detalles guardados manualmente por el tutor
    detalles_manuales = db.query(DetalleInformeBimestral).filter(
        DetalleInformeBimestral.informe_id == informe.id,
        DetalleInformeBimestral.bimestre == bimestre,
    ).all()

    return {
        "id":                     informe.id,
        "grupo_tutorado_id":      grupo_id,
        "periodo":                informe.periodo,
        "bimestre":               bimestre,
        "matricula_inicial":      informe.matricula_inicial,
        "matricula_final":        informe.matricula_final,
        "sesiones_mes1":          informe.sesiones_mes1,
        "sesiones_mes2":          informe.sesiones_mes2,
        "sesiones_mes3":          informe.sesiones_mes3,
        "sesiones_mes4":          informe.sesiones_mes4,
        "principal_problematica": informe.principal_problematica,
        "sugerencias":            informe.sugerencias,
        "estado":                 informe.estado,
        "creado_en":              informe.creado_en.isoformat() if informe.creado_en else None,
        "enviado_en":             informe.enviado_en.isoformat() if informe.enviado_en else None,
        "detalles_auto":          detalles_auto,
        "detalles_manuales":      [
            {"id": d.id, "alumno_id": d.alumno_id, "categoria": d.categoria,
             "detalle": d.detalle, "bimestre": d.bimestre}
            for d in detalles_manuales
        ],
    }


@router.put("/informes/{informe_id}/textos", summary="Guardar textos libres del informe")
def actualizar_textos_informe(
    informe_id: int,
    data: InformeTextosUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    inf = db.query(InformeBimestral).filter(InformeBimestral.id == informe_id).first()
    if not inf:
        raise HTTPException(404, "Informe no encontrado")
    if data.principal_problematica is not None:
        inf.principal_problematica = data.principal_problematica
    if data.sugerencias is not None:
        inf.sugerencias = data.sugerencias
    db.commit()
    return {"estado": "guardado"}


@router.post("/informes/{informe_id}/detalle", summary="Agregar alumno a categoría de vulnerabilidad")
def agregar_detalle(
    informe_id: int,
    data: DetalleBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    inf = db.query(InformeBimestral).filter(InformeBimestral.id == informe_id).first()
    if not inf:
        raise HTTPException(404, "Informe no encontrado")
    d = DetalleInformeBimestral(
        informe_id=informe_id,
        alumno_id=data.alumno_id,
        bimestre=data.bimestre,
        categoria=data.categoria,
        detalle=data.detalle,
        porcentaje=data.porcentaje,
        meses_embarazo=data.meses_embarazo,
        num_hijos=data.num_hijos,
        realizo_tramite=data.realizo_tramite,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id}


@router.post("/informes/{informe_id}/enviar", summary="Enviar informe bimestral al responsable")
def enviar_informe(
    informe_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    inf = db.query(InformeBimestral).filter(InformeBimestral.id == informe_id).first()
    if not inf:
        raise HTTPException(404, "Informe no encontrado")
    if inf.estado == "ENVIADO":
        raise HTTPException(409, "El informe ya fue enviado")
    inf.estado     = "ENVIADO"
    inf.enviado_en = _now()
    db.commit()

    # Notificar a responsables
    grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == inf.grupo_tutorado_id).first()
    grupo_txt = f"{grupo.carrera} Grupo {grupo.grupo}" if grupo else "un grupo"
    _notificar_responsables(
        db, "tutoria_informe",
        "📋 Informe bimestral recibido",
        f"{current_user.nombre} envió el informe bimestre {inf.bimestre} de {grupo_txt} ({inf.periodo}).",
        url="/admin/tutoria",
    )
    db.commit()
    return {"estado": "ENVIADO", "enviado_en": inf.enviado_en.isoformat()}


@router.put("/informes/{informe_id}/recibir", summary="Marcar informe como recibido (responsable)")
def recibir_informe(
    informe_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_resp_roles),
):
    inf = db.query(InformeBimestral).filter(InformeBimestral.id == informe_id).first()
    if not inf:
        raise HTTPException(404, "Informe no encontrado")
    inf.estado      = "RECIBIDO"
    inf.recibido_en = _now()
    db.commit()

    # Notificar al tutor
    grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == inf.grupo_tutorado_id).first()
    grupo_txt = f"{grupo.carrera} Grupo {grupo.grupo}" if grupo else "tu grupo"
    _notificar_usuario(
        db, inf.tutor_id, "tutoria_informe",
        "✅ Informe bimestral recibido",
        f"El Responsable de Tutoría recibió tu informe bimestre {inf.bimestre} de {grupo_txt}.",
        url="/docente/mis-tutorados",
    )
    db.commit()
    return {"estado": "RECIBIDO"}


@router.get("/informes", summary="Todos los informes bimestrales (responsable)")
def listar_informes(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(InformeBimestral)
    if current_user.rol == RolUsuario.DOCENTE:
        q = q.filter(InformeBimestral.tutor_id == current_user.id)
    if estado:
        q = q.filter(InformeBimestral.estado == estado)
    informes = q.order_by(InformeBimestral.creado_en.desc()).all()
    resultado = []
    for inf in informes:
        tutor = db.query(Usuario).filter(Usuario.id == inf.tutor_id).first()
        grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == inf.grupo_tutorado_id).first()
        resultado.append({
            "id":            inf.id,
            "tutor_nombre":  tutor.nombre if tutor else None,
            "carrera":       grupo.carrera if grupo else None,
            "grupo":         grupo.grupo if grupo else None,
            "periodo":       inf.periodo,
            "bimestre":      inf.bimestre,
            "estado":        inf.estado,
            "enviado_en":    inf.enviado_en.isoformat() if inf.enviado_en else None,
            "recibido_en":   inf.recibido_en.isoformat() if inf.recibido_en else None,
        })
    return resultado


# ═══════════════════════════════════════════════════════════════════════════════
#  F-DC-09 · EXPORTACIÓN PDF — FORMATO INSTITUCIONAL OFICIAL
# ═══════════════════════════════════════════════════════════════════════════════

def _pct(asistidos: int, total: int) -> str:
    if total == 0:
        return "—"
    return f"{asistidos}/{total}"


def _build_pdf_f_dc_09(informe_id: int, db: Session) -> bytes:
    """Genera el PDF oficial F-DC-09 idéntico al documento institucional."""

    # ── Datos base ──────────────────────────────────────────────────────────
    inf = db.query(InformeBimestral).filter(InformeBimestral.id == informe_id).first()
    if not inf:
        raise HTTPException(404, "Informe no encontrado")

    tutor = db.query(Usuario).filter(Usuario.id == inf.tutor_id).first()
    grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == inf.grupo_tutorado_id).first()

    # ── Asignaciones (activos + inactivos para bajas) ────────────────────────
    todas_asig = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id == inf.grupo_tutorado_id,
    ).all()
    asig_activas = [a for a in todas_asig if a.activo]
    asig_bajas   = [a for a in todas_asig if not a.activo]

    # ── Sesiones del grupo ordenadas por fecha ───────────────────────────────
    sesiones = db.query(SesionTutoria).filter(
        SesionTutoria.grupo_tutorado_id == inf.grupo_tutorado_id
    ).order_by(SesionTutoria.fecha).all()

    n = len(sesiones)
    mid = n // 2
    b1_ids = {s.id for s in sesiones[:mid]} if mid > 0 else set()
    b2_ids = {s.id for s in sesiones[mid:]} if n > 0 else set()

    todos_reg = db.query(RegistroSesionAlumno).filter(
        RegistroSesionAlumno.sesion_id.in_([s.id for s in sesiones])
    ).all() if sesiones else []

    def asistencia_b1b2(alumno_id):
        regs = [r for r in todos_reg if r.alumno_id == alumno_id]
        b1_ok = sum(1 for r in regs if r.sesion_id in b1_ids and r.asistio)
        b2_ok = sum(1 for r in regs if r.sesion_id in b2_ids and r.asistio)
        return _pct(b1_ok, len(b1_ids)), _pct(b2_ok, len(b2_ids))

    # ── Canalizaciones ───────────────────────────────────────────────────────
    cans = db.query(Canalizacion).filter(
        Canalizacion.grupo_tutorado_id == inf.grupo_tutorado_id,
    ).all()

    # ── Perfil socioeconómico por alumno ─────────────────────────────────────
    def perfil(alumno_id):
        return db.query(PerfilSocioeconómico).filter(
            PerfilSocioeconómico.alumno_id == alumno_id
        ).first()

    def alumno_obj(alumno_id):
        return db.query(CatalogoAlumno).filter(CatalogoAlumno.id == alumno_id).first()

    def nombre_alumno(al):
        if not al:
            return "—"
        return f"{al.apellido_paterno} {al.apellido_materno} {al.nombres}".strip()

    # Porcentaje de abandono
    total_ini = inf.matricula_inicial or len(todas_asig)
    bajas_n   = len(asig_bajas)
    pct_abandono = f"{(bajas_n / total_ini * 100):.1f}%" if total_ini > 0 else "0.0%"

    # Conteo de sesiones por mes relativo (posición dentro del cuatrimestre)
    conteo_mes = {1: 0, 2: 0, 3: 0, 4: 0}
    for s in sesiones:
        m = s.fecha.month % 4
        conteo_mes[m if m > 0 else 4] += 1

    # ── Estilos ──────────────────────────────────────────────────────────────
    VERDE_UTECAN = colors.HexColor("#00a88e")
    ORO_UTECAN   = colors.HexColor("#b8842b")
    AZUL         = VERDE_UTECAN
    GRIS_H       = colors.HexColor("#4a4a4a")
    GRIS_TEXTO   = colors.HexColor("#222222")
    CLARO        = colors.HexColor("#e8f4f1")
    CLARO_ORO    = colors.HexColor("#f7efe3")
    LINEA        = colors.HexColor("#6f6f6f")
    NEGRO  = colors.black
    BLANCO = colors.white
    PAGE_WIDTH = 18.0 * cm
    LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "tutoria" / "utecan_logo.jpg"

    styles = getSampleStyleSheet()

    def S(base="Normal", **kw):
        return ParagraphStyle(f"s{id(kw)}", parent=styles[base], **kw)

    def P(txt, **kw):
        return Paragraph(str(txt) if txt is not None else "—", S(**kw))

    def Pb(txt, **kw):
        return P(f"<b>{txt}</b>", **kw)

    # Estilo de celda estándar
    cs = dict(fontSize=7.2, leading=8.5, textColor=GRIS_TEXTO)
    ch = dict(fontSize=7.2, leading=8.5, textColor=BLANCO, alignment=TA_CENTER)

    # Estilo de tabla base
    BASE_STYLE = [
            ("GRID",          (0, 0), (-1, -1), 0.45, LINEA),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 3.5),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 3.5),
        ]

    def hdr_style(extra=None):
        s = BASE_STYLE + [
            ("BACKGROUND", (0, 0), (-1, 0), VERDE_UTECAN),
            ("TEXTCOLOR",  (0, 0), (-1, 0), BLANCO),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [colors.white, colors.HexColor("#f4faf8")]),
        ]
        if extra:
            s += extra
        return TableStyle(s)

    def seccion_label(txt):
        return Table(
            [[Pb(txt.upper(), fontSize=7.6, leading=9, textColor=BLANCO, alignment=TA_CENTER)]],
            colWidths=[PAGE_WIDTH],
            style=TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), VERDE_UTECAN),
                ("BOX",           (0, 0), (-1, -1), 0.5, LINEA),
                ("TOPPADDING",    (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ]),
        )

    story = []
    logo_utecan = RLImage(str(LOGO_PATH), width=3.8*cm, height=1.1*cm) if LOGO_PATH.exists() else P(
        "<b>UTECAN</b>", fontSize=12, textColor=VERDE_UTECAN, alignment=TA_CENTER
    )

    # ── ENCABEZADO INSTITUCIONAL ─────────────────────────────────────────────
    # Fila 1: título principal
    hdr_r1 = [[
        logo_utecan,
        Pb("INFORME<br/>BIMESTRAL DE TUTORÍA",
           fontSize=11.5, leading=13, textColor=GRIS_TEXTO, alignment=TA_CENTER),
        Pb("Código", **cs),
        P("F-DC-09", **cs),
        Pb("No. Versión:", **cs),
        P("08", **cs),
    ]]
    # Fila 2-4: metadatos del documento
    hdr_r2 = [[
        P("", **cs),
        Pb("Código", **cs),
        Pb("Responsable", **cs),
        Pb("Procedimiento de Referencia:", **cs),
        Pb("No. Versión:", **cs),
    ]]
    hdr_r3 = [[
        P("", **cs),
        P("F-DC-09", **cs),
        P("Responsable de Tutorías<br/>y Asesorías Académicas", **cs),
        P("Tutoría", **cs),
        Pb("08", **cs),
    ]]
    hdr_r4 = [[
        Pb("Efectividad:", **cs),
        P("18 de diciembre de 2025", **cs),
        Pb("Revisión:", **cs),
        P("R08/1225", **cs),
        P("Página generada por el PDF", **cs),
    ]]

    top_table = Table(hdr_r1, colWidths=[4.2*cm, 5.0*cm, 2.1*cm, 3.1*cm, 2.1*cm, 1.5*cm])
    top_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",          (0, 0), (-1, -1), 0.5, LINEA),
        ("BACKGROUND",    (2, 0), (2, 0), CLARO),
        ("BACKGROUND",    (4, 0), (4, 0), CLARO_ORO),
        ("ALIGN",         (0, 0), (1, 0), "CENTER"),
        ("ALIGN",         (5, 0), (5, 0), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
    ]))
    story.append(top_table)

    meta_table = Table(
        hdr_r2 + hdr_r3 + hdr_r4,
        colWidths=[2.5*cm, 2*cm, 5.5*cm, 4.5*cm, 3*cm],
    )
    meta_table.setStyle(TableStyle(BASE_STYLE + [
        ("BACKGROUND", (1, 0), (1, -1), CLARO),
        ("BACKGROUND", (3, 0), (3, -1), CLARO),
        ("FONTNAME",   (1, 0), (1, 0), "Helvetica-Bold"),
        ("FONTNAME",   (3, 0), (3, 0), "Helvetica-Bold"),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.3*cm))

    # ── TABLA 1: DATOS GENERALES ─────────────────────────────────────────────
    tutor_nombre = tutor.nombre if tutor else "—"
    carrera      = grupo.carrera if grupo else "—"
    grp_num      = grupo.grupo if grupo else "—"
    cuatri_num   = grupo.cuatrimestre if grupo else "—"
    periodo      = inf.periodo or "—"

    dg = [
        [Pb("Tutor / Tutora", **cs), P(tutor_nombre, **cs),
         Pb("Período", **cs),        P(periodo, **cs),
         Pb("Porcentaje total de abandono escolar", fontSize=7, leading=9),
         P(pct_abandono, **cs)],
        [Pb("Cuatrimestre y grupo", **cs),
         P(f"{cuatri_num}° — Grupo {grp_num}", **cs),
         Pb("Carrera", **cs), P(carrera, **cs), P("", **cs), P("", **cs)],
        [Pb("Matrícula inicial (*B1)", **cs),
         P(str(inf.matricula_inicial or 0), **cs),
         Pb("Matrícula final (*B2)", **cs),
         P(str(inf.matricula_final or 0), **cs),
         P("", **cs), P("", **cs)],
    ]
    dg_table = Table(dg, colWidths=[3.5*cm, 3.5*cm, 2.5*cm, 3*cm, 3*cm, 2*cm])
    dg_table.setStyle(TableStyle(BASE_STYLE + [
        ("BACKGROUND", (0, 0), (0, -1), CLARO),
        ("BACKGROUND", (2, 0), (2, -1), CLARO),
        ("BACKGROUND", (4, 0), (4, 0), CLARO),
        ("SPAN",       (4, 1), (5, 2)),
    ]))
    story.append(dg_table)
    story.append(Spacer(1, 0.25*cm))

    # ── TABLA 2: SESIONES POR MES ────────────────────────────────────────────
    ses_data = [
        [Pb("Mes", **ch), Pb("Número de sesiones", **ch)],
        [P("1", **cs), P(str(inf.sesiones_mes1 or 0), **cs)],
        [P("2", **cs), P(str(inf.sesiones_mes2 or 0), **cs)],
        [P("3", **cs), P(str(inf.sesiones_mes3 or 0), **cs)],
        [P("4", **cs), P(str(inf.sesiones_mes4 or 0), **cs)],
    ]
    ses_table = Table(ses_data, colWidths=[2.5*cm, 5*cm])
    ses_table.setStyle(hdr_style())
    story.append(ses_table)
    story.append(Spacer(1, 0.3*cm))

    # ── FUNCIÓN AUXILIAR: tabla de categoría ─────────────────────────────────
    def cat_table_5col(rows, col3_hdr="Motivo", col4_hdr="B1", col5_hdr="B2"):
        """Tabla estándar de 5 columnas: No. | Nombre | col3 | B1 | B2"""
        data = [[
            Pb("No.",     **ch),
            Pb("Nombre",  **ch),
            Pb(col3_hdr,  **ch),
            Pb(col4_hdr,  **ch),
            Pb(col5_hdr,  **ch),
        ]]
        if rows:
            for r in rows:
                data.append([P(str(r[0]), **cs), P(r[1], **cs), P(r[2] or "—", **cs),
                              P(r[3] or "—", **cs), P(r[4] or "—", **cs)])
        else:
            data.append([P("", **cs), P("", **cs), P("", **cs), P("", **cs), P("", **cs)])
            data.append([P("", **cs), P("", **cs), P("", **cs), P("", **cs), P("", **cs)])
            data.append([P("", **cs), P("", **cs), P("", **cs), P("", **cs), P("", **cs)])
            data.append([P("", **cs), P("", **cs), P("", **cs), P("", **cs), P("", **cs)])
        t = Table(data, colWidths=[1*cm, 5.5*cm, 6*cm, 2.5*cm, 2.5*cm])
        t.setStyle(hdr_style())
        return t

    def cat_table_6col(rows, col3_hdr="Motivo", col4_hdr="Realizó trámite",
                       col5_hdr="B1", col6_hdr="B2"):
        data = [[
            Pb("No.",       **ch), Pb("Nombre",    **ch),
            Pb(col3_hdr,    **ch), Pb(col4_hdr,    **ch),
            Pb(col5_hdr,    **ch), Pb(col6_hdr,    **ch),
        ]]
        if rows:
            for r in rows:
                data.append([P(str(r[0]), **cs), P(r[1], **cs), P(r[2] or "—", **cs),
                              P(r[3] or "—", **cs), P(r[4] or "—", **cs), P(r[5] or "—", **cs)])
        else:
            for _ in range(4):
                data.append([P("", **cs)]*6)
        t = Table(data, colWidths=[1*cm, 5*cm, 4.5*cm, 3*cm, 2*cm, 2*cm])
        t.setStyle(hdr_style())
        return t

    # ── SECCIÓN 1: ESTUDIANTES QUE CAUSARON BAJA ────────────────────────────
    story.append(seccion_label("Estudiantes que causaron baja"))
    baja_rows = []
    for i, a in enumerate(asig_bajas, 1):
        al = alumno_obj(a.alumno_id)
        b1, b2 = asistencia_b1b2(a.alumno_id)
        baja_rows.append((i, nombre_alumno(al), "—", "—", b1, b2))
    story.append(cat_table_6col(baja_rows, col3_hdr="Motivo",
                                col4_hdr="Realizó trámite", col5_hdr="B1", col6_hdr="B2"))
    story.append(Spacer(1, 0.25*cm))

    # ── SECCIÓN 2: VULNERABILIDAD ACADÉMICA ─────────────────────────────────
    # Criterios (F-DC-08 → F-DC-09):
    #   a) Baja asistencia (< 80% de las sesiones del grupo)
    #   b) Canalización de tipo pedagógico (problemas con asignaturas)
    story.append(seccion_label("Estudiantes con vulnerabilidad académica"))
    vuln_ac_rows = []
    alumno_vuln_ac = set()   # evitar duplicados
    # a) Canalizaciones pedagógicas — fuente principal según el P-DC-02
    for c in cans:
        if not c.tipo_pedagogico:
            continue
        if c.alumno_id in alumno_vuln_ac:
            continue
        al = alumno_obj(c.alumno_id)
        b1, b2 = asistencia_b1b2(c.alumno_id)
        asigs_text = c.motivo or "Dificultad académica"
        vuln_ac_rows.append((len(vuln_ac_rows)+1, nombre_alumno(al), asigs_text, b1, b2))
        alumno_vuln_ac.add(c.alumno_id)
    # b) Baja asistencia (< 80%) aunque no haya canalización
    for a in asig_activas:
        if a.alumno_id in alumno_vuln_ac:
            continue
        regs = [r for r in todos_reg if r.alumno_id == a.alumno_id]
        total_ses_n = len(sesiones)
        asistidos = sum(1 for r in regs if r.asistio)
        if total_ses_n > 0 and (asistidos / total_ses_n) < 0.8:
            al = alumno_obj(a.alumno_id)
            b1, b2 = asistencia_b1b2(a.alumno_id)
            vuln_ac_rows.append((len(vuln_ac_rows)+1, nombre_alumno(al), "Baja asistencia", b1, b2))
            alumno_vuln_ac.add(a.alumno_id)
    story.append(cat_table_5col(vuln_ac_rows, col3_hdr="Asignaturas", col4_hdr="B1", col5_hdr="B2"))
    story.append(Spacer(1, 0.25*cm))

    # ── SECCIÓN 3: APOYO PSICOPEDAGÓGICO ────────────────────────────────────
    story.append(seccion_label("Estudiantes que requieren apoyo psicopedagógico"))
    psico_rows = []
    for a in asig_activas:
        al = alumno_obj(a.alumno_id)
        p = perfil(a.alumno_id)
        b1, b2 = asistencia_b1b2(a.alumno_id)
        # Discapacidad o canalizaciones de tipo psicológico
        motivo = None
        if p and p.tiene_discapacidad:
            motivo = "Discapacidad diagnosticada"
        else:
            can_psico = [c for c in cans if c.alumno_id == a.alumno_id and c.tipo_psicologico]
            if can_psico:
                motivo = "Canalización psicológica"
        if motivo:
            psico_rows.append((len(psico_rows)+1, nombre_alumno(al), motivo, b1, b2))
    story.append(cat_table_5col(psico_rows, col3_hdr="Motivo", col4_hdr="B1", col5_hdr="B2"))
    story.append(Spacer(1, 0.25*cm))

    # ── SECCIÓN 4: VULNERABILIDAD ECONÓMICA ─────────────────────────────────
    story.append(seccion_label("Estudiantes con vulnerabilidad económica"))
    eco_rows = []
    for a in asig_activas:
        al = alumno_obj(a.alumno_id)
        p = perfil(a.alumno_id)
        b1, b2 = asistencia_b1b2(a.alumno_id)
        if p and p.ingreso_familiar_mensual and p.ingreso_familiar_mensual < 5000:
            just = f"Ingreso familiar: ${p.ingreso_familiar_mensual:,.0f}/mes"
            eco_rows.append((len(eco_rows)+1, nombre_alumno(al), just, b1, b2))
    story.append(cat_table_5col(eco_rows, col3_hdr="Justificación", col4_hdr="B1", col5_hdr="B2"))
    story.append(Spacer(1, 0.25*cm))

    # ── SECCIÓN 5: MADRES O PADRES DE FAMILIA ───────────────────────────────
    story.append(seccion_label("Estudiantes que son madres o padres de familia"))
    hijos_rows = []
    for a in asig_activas:
        al = alumno_obj(a.alumno_id)
        p = perfil(a.alumno_id)
        b1, b2 = asistencia_b1b2(a.alumno_id)
        if p and p.tiene_hijos:
            hijos_rows.append((len(hijos_rows)+1, nombre_alumno(al),
                               str(p.num_hijos or "—"), b1, b2))
    story.append(cat_table_5col(hijos_rows, col3_hdr="Total de hijas e hijos",
                                col4_hdr="B1", col5_hdr="B2"))
    story.append(Spacer(1, 0.25*cm))

    # ── SECCIÓN 6: ESTUDIANTES EMBARAZADAS ──────────────────────────────────
    story.append(seccion_label("Estudiantes embarazadas"))
    # Campo embarazada no capturado en perfil actual — tabla vacía
    story.append(cat_table_5col([], col3_hdr="Meses de embarazo", col4_hdr="B1", col5_hdr="B2"))
    story.append(Spacer(1, 0.25*cm))

    # ── SECCIÓN 7: ADICCIONES ────────────────────────────────────────────────
    story.append(seccion_label("Estudiantes con problemas de adicciones (alcohol, tabaco, marihuana, etc.)"))
    adic_rows = []
    for a in asig_activas:
        al = alumno_obj(a.alumno_id)
        b1, b2 = asistencia_b1b2(a.alumno_id)
        can_adic = [c for c in cans
                    if c.alumno_id == a.alumno_id and "adicci" in (c.motivo or "").lower()]
        if can_adic:
            adic_rows.append((len(adic_rows)+1, nombre_alumno(al), can_adic[0].motivo or "—", b1, b2))
    story.append(cat_table_5col(adic_rows, col3_hdr="Observaciones",
                                col4_hdr="B1", col5_hdr="B2"))
    story.append(Spacer(1, 0.25*cm))

    # ── SECCIÓN 8: ENFERMEDAD DIAGNOSTICADA ─────────────────────────────────
    story.append(seccion_label("Estudiantes con enfermedad diagnosticada (física o mental)"))
    enf_rows = []
    for a in asig_activas:
        al = alumno_obj(a.alumno_id)
        p = perfil(a.alumno_id)
        b1, b2 = asistencia_b1b2(a.alumno_id)
        if p and p.tiene_enfermedad_cronica:
            enfs = [e for e, v in [
                ("Diabetes", p.diabetes), ("Hipertensión", p.hipertension),
                ("Hemofilia", p.hemofilia), ("Prob. cardíacos", p.problemas_cardiacos),
            ] if v]
            if p.otra_enfermedad:
                enfs.append(p.otra_enfermedad)
            dx = ", ".join(enfs) or "Enfermedad crónica"
            enf_rows.append((len(enf_rows)+1, nombre_alumno(al), dx, b1, b2))
    story.append(cat_table_5col(enf_rows, col3_hdr="Diagnóstico", col4_hdr="B1", col5_hdr="B2"))
    story.append(Spacer(1, 0.25*cm))

    # ── SECCIÓN 9: ESTUDIANTES QUE TRABAJAN ─────────────────────────────────
    story.append(seccion_label("Estudiantes que trabajan"))
    trab_rows = []
    for a in asig_activas:
        al = alumno_obj(a.alumno_id)
        p = perfil(a.alumno_id)
        b1, b2 = asistencia_b1b2(a.alumno_id)
        if p and p.trabaja:
            trab_rows.append((len(trab_rows)+1, nombre_alumno(al),
                              p.empresa or "—", b1, b2))
    story.append(cat_table_5col(trab_rows, col3_hdr="Empresa", col4_hdr="B1", col5_hdr="B2"))
    story.append(Spacer(1, 0.3*cm))

    # ── TABLA TEXTO LIBRE ────────────────────────────────────────────────────
    texto_prob = inf.principal_problematica or ""
    texto_sug  = inf.sugerencias or ""
    libre_data = [
        [Pb("PRINCIPAL PROBLEMÁTICA DEL GRUPO OBSERVADA DURANTE EL CUATRIMESTRE",
            fontSize=8.5, textColor=BLANCO)],
        [P(texto_prob, fontSize=8.5, leading=13) if texto_prob
         else P("", fontSize=8.5)],
        [P("", fontSize=8.5)],  # espacio extra
        [Pb("SUGERENCIAS PARA TRABAJAR INDIVIDUALMENTE / GRUPAL",
            fontSize=8.5, textColor=BLANCO)],
        [P(texto_sug, fontSize=8.5, leading=13) if texto_sug
         else P("", fontSize=8.5)],
        [P("", fontSize=8.5)],
    ]
    libre_table = Table(libre_data, colWidths=[17.5*cm])
    libre_table.setStyle(TableStyle([
        ("GRID",          (0, 0), (-1, -1), 0.5, LINEA),
        ("BACKGROUND",    (0, 0), (-1, 0), AZUL),
        ("BACKGROUND",    (0, 3), (-1, 3), AZUL),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("MINROWHEIGHT",  (0, 1), (-1, 1), 1.5*cm),
        ("MINROWHEIGHT",  (0, 4), (-1, 4), 1.5*cm),
    ]))
    story.append(libre_table)
    story.append(Spacer(1, 0.2*cm))

    # ── PIE DE PÁGINA ────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINEA))
    story.append(P(
        "*B1: Bimestre uno &nbsp;&nbsp; *B2: Bimestre dos &nbsp;&nbsp; "
        f"F-DC-09 · Versión 08 · P-DC-02 v08 · ISO 9001:2015 · "
        f"Generado: {datetime.datetime.now().strftime('%d/%m/%Y %H:%M')}",
        fontSize=7, textColor=GRIS_H, alignment=TA_CENTER,
    ))
    footer_data = [
        [Pb("Elaboró:", **cs), Pb("Revisó:", **cs), Pb("Autorizó:", **cs)],
        [
            P("Responsable de Tutorías y Asesorías Académicas", **cs),
            P("Controlador Documental", **cs),
            P("Director de División de Carrera", **cs),
        ],
        [
            P("15 de diciembre de 2025", **cs),
            P("16 de diciembre de 2025", **cs),
            P("18 de diciembre de 2025", **cs),
        ],
    ]
    footer_table = Table(footer_data, colWidths=[6*cm, 6*cm, 6*cm])
    footer_table.setStyle(TableStyle(BASE_STYLE + [
        ("BACKGROUND", (0, 0), (-1, 0), CLARO_ORO),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 0.6, LINEA),
    ]))
    # El pie institucional se dibuja al fondo de cada hoja desde _draw_page_footer.

    # ── BUILD ────────────────────────────────────────────────────────────────
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=1.5*cm, bottomMargin=2.9*cm,
    )

    def _draw_page_footer(canvas, doc_obj):
        canvas.saveState()
        y = 0.55 * cm
        page_footer = Table(footer_data, colWidths=[doc_obj.width/3]*3)
        page_footer.setStyle(TableStyle(BASE_STYLE + [
            ("BACKGROUND", (0, 0), (-1, 0), CLARO_ORO),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("BOX", (0, 0), (-1, -1), 0.6, LINEA),
            ("FONTSIZE", (0, 0), (-1, -1), 6.2),
            ("LEADING", (0, 0), (-1, -1), 7),
        ]))
        page_footer.wrapOn(canvas, doc_obj.width, 2.1*cm)
        page_footer.drawOn(canvas, doc_obj.leftMargin, y)
        canvas.setFont("Helvetica", 6)
        canvas.setFillColor(GRIS_H)
        canvas.drawRightString(
            doc_obj.pagesize[0] - doc_obj.rightMargin,
            0.25 * cm,
            f"F-DC-09 · Versión 08 · Página {canvas.getPageNumber()}",
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=_draw_page_footer, onLaterPages=_draw_page_footer)
    return buf.getvalue()


@router.get("/informes/{informe_id}/pdf", summary="Exportar informe F-DC-09 como PDF oficial")
def exportar_pdf_informe(
    informe_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    inf = db.query(InformeBimestral).filter(InformeBimestral.id == informe_id).first()
    if not inf:
        raise HTTPException(404, "Informe no encontrado")
    if current_user.rol == RolUsuario.DOCENTE and inf.tutor_id != current_user.id:
        raise HTTPException(403, "Acceso denegado")

    try:
        pdf_bytes = _build_pdf_f_dc_09(informe_id, db)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error al generar el PDF: {str(e)}")

    stamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"F-DC-09_{inf.periodo}_B{inf.bimestre}_{informe_id}_{stamp}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
