"""
Módulo de Consultorio Médico — modelos SQLAlchemy
Gestión de consultas, expedientes y estadísticas de salud universitaria
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, Text,
    DateTime, Date, ForeignKey, Float, Enum
)
from database import Base
import datetime
import enum


def _now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# ─── 1. Paciente ──────────────────────────────────────────────────────────────
# Un paciente puede ser ALUMNO (vinculado a catalogo_alumnos) o ADMINISTRATIVO
# (solo datos básicos). Ambos comparten el mismo flujo de consulta.

class TipoPaciente(str, enum.Enum):
    ALUMNO        = "ALUMNO"
    ADMINISTRATIVO = "ADMINISTRATIVO"


class SexoPaciente(str, enum.Enum):
    M    = "M"
    F    = "F"
    OTRO = "OTRO"


class Paciente(Base):
    __tablename__ = "pacientes"

    id               = Column(Integer, primary_key=True, index=True)
    tipo             = Column(String(20), nullable=False, default="ALUMNO")   # TipoPaciente
    # Si tipo=ALUMNO, alumno_id vincula al catálogo; nombre se toma del catálogo.
    alumno_id        = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=True, index=True)
    # Para ADMINISTRATIVO (o como respaldo si el alumno no está en catálogo):
    nombre           = Column(String(200), nullable=False)
    matricula_o_emp  = Column(String(30), nullable=True)   # matrícula o número de empleado
    fecha_nacimiento = Column(Date, nullable=True)
    sexo             = Column(String(10), nullable=True)   # SexoPaciente
    carrera          = Column(String(120), nullable=True)  # para alumnos
    cuatrimestre     = Column(Integer, nullable=True)      # para alumnos
    departamento     = Column(String(120), nullable=True)  # para administrativos
    activo           = Column(Boolean, default=True)
    creado_en        = Column(DateTime, default=_now)


# ─── 2. Consulta Médica ───────────────────────────────────────────────────────
# Registro de cada atención. Campos equivalentes al recetario institucional
# + campos estadísticos adicionales.

class OrigenConsulta(str, enum.Enum):
    ESPONTANEA         = "ESPONTANEA"
    CANALIZADA_TUTORIA = "CANALIZADA_TUTORIA"
    CANALIZADA_INTERNA = "CANALIZADA_INTERNA"


class ConsultaMedica(Base):
    __tablename__ = "consultas_medicas"

    id              = Column(Integer, primary_key=True, index=True)
    paciente_id     = Column(Integer, ForeignKey("pacientes.id"), nullable=False, index=True)
    fecha_consulta  = Column(DateTime, nullable=False, default=_now)

    # Signos vitales
    temperatura     = Column(Float, nullable=True)        # °C
    presion_arterial = Column(String(20), nullable=True)  # ej. "120/80"
    peso            = Column(Float, nullable=True)        # kg
    talla           = Column(Float, nullable=True)        # cm
    frecuencia_cardiaca = Column(Integer, nullable=True)  # lpm
    saturacion_oxigeno  = Column(Float, nullable=True)    # %

    # Atención clínica
    motivo_consulta = Column(Text, nullable=False)
    diagnostico     = Column(Text, nullable=False)
    medicamentos    = Column(Text, nullable=True)   # receta: medicamentos
    indicaciones    = Column(Text, nullable=True)   # cuidados e indicaciones

    # Incapacidad
    genera_incapacidad = Column(Boolean, default=False)
    dias_incapacidad   = Column(Integer, nullable=True)
    fecha_inicio_incapacidad = Column(Date, nullable=True)
    fecha_fin_incapacidad = Column(Date, nullable=True)

    # Seguimiento
    requiere_seguimiento = Column(Boolean, default=False)
    fecha_seguimiento    = Column(Date, nullable=True)
    seguimiento_notas    = Column(Text, nullable=True)

    # Origen (para integración con Tutoría)
    origen                  = Column(String(30), nullable=False, default="ESPONTANEA")
    canalizacion_tutoria_id = Column(Integer, nullable=True)  # ref a canalizaciones de tutoría
    paciente_nombre_snapshot = Column(String(200), nullable=True)
    paciente_tipo_snapshot = Column(String(20), nullable=True)
    paciente_matricula_snapshot = Column(String(30), nullable=True)
    paciente_sexo_snapshot = Column(String(10), nullable=True)
    paciente_carrera_snapshot = Column(String(120), nullable=True)
    paciente_cuatrimestre_snapshot = Column(Integer, nullable=True)
    paciente_departamento_snapshot = Column(String(120), nullable=True)

    # Auditoría
    atendido_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creado_en    = Column(DateTime, nullable=False, default=_now)


# ─── 3. Canalización Médica ───────────────────────────────────────────────────
# Canalizaciones que el médico genera hacia otros servicios (psicología, hospital, etc.)

class DestinoCanalizacion(str, enum.Enum):
    PSICOLOGIA = "PSICOLOGIA"
    TUTORIA    = "TUTORIA"
    NUTRICION  = "NUTRICION"
    HOSPITAL   = "HOSPITAL"
    OTRO       = "OTRO"


class EstadoCanalizacion(str, enum.Enum):
    PENDIENTE  = "PENDIENTE"
    ATENDIDA   = "ATENDIDA"
    CANCELADA  = "CANCELADA"


class CanalizacionMedica(Base):
    __tablename__ = "canalizaciones_medicas"

    id            = Column(Integer, primary_key=True, index=True)
    consulta_id   = Column(Integer, ForeignKey("consultas_medicas.id"), nullable=False, index=True)
    paciente_id   = Column(Integer, ForeignKey("pacientes.id"), nullable=False, index=True)
    destino       = Column(String(20), nullable=False)   # DestinoCanalizacion
    motivo        = Column(Text, nullable=True)
    estado        = Column(String(20), nullable=False, default="PENDIENTE")
    fecha_canaliza = Column(DateTime, nullable=False, default=_now)
    fecha_atencion = Column(DateTime, nullable=True)
    notas_seguimiento = Column(Text, nullable=True)
    creado_por    = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
