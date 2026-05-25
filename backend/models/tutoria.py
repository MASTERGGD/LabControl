"""
Módulo de Tutoría — modelos SQLAlchemy
Procedimiento P-DC-02 v08 · ISO 9001:2015 cláusula 8.5.1
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, Text,
    DateTime, Date, ForeignKey, Float
)
from database import Base
import datetime


def _now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# ─── 1. Grupo Tutorado ────────────────────────────────────────────────────────
# Un docente tutor es asignado a un grupo de alumnos por cuatrimestre/periodo.
# Un tutor puede permanecer hasta 3 cuatrimestres con el mismo grupo (política PIT).

class GrupoTutorado(Base):
    __tablename__ = "grupos_tutorados"

    id           = Column(Integer, primary_key=True, index=True)
    tutor_id     = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    carrera      = Column(String(120), nullable=False)
    cuatrimestre = Column(Integer, nullable=False)   # 1–12
    grupo        = Column(String(10), nullable=False) # A, B, C…
    periodo      = Column(String(20), nullable=False) # MAY-AGO 2026
    activo       = Column(Boolean, default=True)
    creado_en    = Column(DateTime, default=_now)
    creado_por   = Column(Integer, ForeignKey("usuarios.id"), nullable=True)


# ─── 2. Asignación Tutoría ────────────────────────────────────────────────────
# Vincula un alumno del catálogo con un grupo tutorado.

class AsignacionTutoria(Base):
    __tablename__ = "asignaciones_tutoria"

    id                = Column(Integer, primary_key=True, index=True)
    grupo_tutorado_id = Column(Integer, ForeignKey("grupos_tutorados.id"), nullable=False, index=True)
    alumno_id         = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, index=True)
    activo            = Column(Boolean, default=True)
    asignado_en       = Column(DateTime, default=_now)

    # Estado institucional de seguimiento (independiente del semáforo socioeconómico)
    # SIN_SEGUIMIENTO | EN_OBSERVACION | CANALIZADO | ATENDIDO | CERRADO
    estado_seguimiento    = Column(String(30), nullable=False, default="SIN_SEGUIMIENTO")
    estado_observaciones  = Column(Text, nullable=True)
    estado_actualizado_en = Column(DateTime, nullable=True)


# ─── 3. Perfil Socioeconómico ─────────────────────────────────────────────────
# Datos importados del Excel de Servicios Escolares (estudio socioeconómico).
# Se vincula al alumno por matrícula. Contiene los campos relevantes para el tutor.

class PerfilSocioeconómico(Base):
    __tablename__ = "perfiles_socioeconomicos"

    id                   = Column(Integer, primary_key=True, index=True)
    alumno_id            = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, unique=True)
    periodo_estudio      = Column(String(20))   # periodo del estudio (MAY-AGO 2026)

    # Antecedentes académicos
    escuela_procedencia  = Column(String(200))
    promedio_bachillerato = Column(Float)
    area_bachillerato    = Column(String(50))    # GENERAL, ECONÓMICO-ADM, etc.

    # Situación personal
    sexo                  = Column(String(30))
    estado_civil          = Column(String(80))
    lugar_nacimiento      = Column(String(160))
    domicilio_procedencia = Column(String(250))
    domicilio_residencia  = Column(String(250))
    telefono              = Column(String(60))
    habla_lengua_indigena = Column(Boolean, default=False)
    lengua_indigena       = Column(String(80))
    tiene_hijos           = Column(Boolean, default=False)
    num_hijos             = Column(Integer, default=0)
    trabaja               = Column(Boolean, default=False)
    empresa               = Column(String(200))

    # Situación económica
    ingreso_familiar_mensual = Column(Float)     # suma del ingreso familiar
    recibe_apoyo_institucional = Column(Boolean, default=False)
    institucion_apoyo    = Column(String(200))   # Becas Benito Juárez, PROSPERA, etc.

    # Salud — alergias
    tiene_alergia        = Column(Boolean, default=False)
    medicamento_alergia  = Column(String(200))

    # Salud — enfermedades crónicas
    tiene_enfermedad_cronica = Column(Boolean, default=False)
    diabetes             = Column(Boolean, default=False)
    hipertension         = Column(Boolean, default=False)
    hemofilia            = Column(Boolean, default=False)
    problemas_cardiacos  = Column(Boolean, default=False)
    otra_enfermedad      = Column(String(200))
    medicamento_enfermedad = Column(String(200))

    # Salud — discapacidad
    tiene_discapacidad   = Column(Boolean, default=False)
    discapacidad_motriz  = Column(Boolean, default=False)
    discapacidad_intelectual = Column(Boolean, default=False)
    discapacidad_multiple = Column(Boolean, default=False)
    discapacidad_auditiva = Column(Boolean, default=False)
    discapacidad_visual  = Column(Boolean, default=False)
    discapacidad_psicosocial = Column(Boolean, default=False)
    otra_discapacidad    = Column(String(200))
    medicamento_discapacidad = Column(String(200))

    # Información adicional libre
    informacion_relevante = Column(Text)

    importado_en  = Column(DateTime, default=_now)
    actualizado_en = Column(DateTime, default=_now, onupdate=_now)


# ─── 4. Sesión de Tutoría ─────────────────────────────────────────────────────
# Registro de cada sesión (F-DC-07 digital). Una sesión puede ser grupal o individual.

class SesionTutoria(Base):
    __tablename__ = "sesiones_tutoria"

    id                = Column(Integer, primary_key=True, index=True)
    grupo_tutorado_id = Column(Integer, ForeignKey("grupos_tutorados.id"), nullable=False, index=True)
    tutor_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    fecha             = Column(Date, nullable=False)
    tipo_sesion       = Column(String(20), nullable=False, default="GRUPAL")
    # GRUPAL | INDIVIDUAL
    observaciones_generales = Column(Text)
    creado_en         = Column(DateTime, default=_now)
    documento_codigo  = Column(String(20), default="F-DC-07")
    documento_version = Column(String(10), default="08")
    documento_efectivo = Column(Date, nullable=True)


# ─── 5. Registro por Alumno en Sesión ────────────────────────────────────────
# Detalle F-DC-07: tipo de atención, si requiere canalización, tema y acciones.

class RegistroSesionAlumno(Base):
    __tablename__ = "registros_sesion_alumno"

    id              = Column(Integer, primary_key=True, index=True)
    sesion_id       = Column(Integer, ForeignKey("sesiones_tutoria.id"), nullable=False, index=True)
    alumno_id       = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False)
    asistio         = Column(Boolean, default=True)

    # Tipo de atención (checkboxes del F-DC-07)
    tipo_academico  = Column(Boolean, default=False)
    tipo_personal   = Column(Boolean, default=False)
    tipo_otro       = Column(Boolean, default=False)

    requiere_canalizacion = Column(Boolean, default=False)
    tema            = Column(Text)
    acciones_preventivas  = Column(Text)
    comentarios     = Column(Text)


# ─── 6. Canalización ─────────────────────────────────────────────────────────
# F-DC-08: el tutor levanta la solicitud; el responsable de tutoría la atiende.

class Canalizacion(Base):
    __tablename__ = "canalizaciones"

    id                = Column(Integer, primary_key=True, index=True)
    tutor_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    alumno_id         = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, index=True)
    grupo_tutorado_id = Column(Integer, ForeignKey("grupos_tutorados.id"), nullable=True)
    sesion_id         = Column(Integer, ForeignKey("sesiones_tutoria.id"), nullable=True)

    fecha_solicitud   = Column(DateTime, default=_now, nullable=False)

    # Tipo (checkboxes F-DC-08)
    tipo_psicologico   = Column(Boolean, default=False)
    tipo_pedagogico    = Column(Boolean, default=False)
    tipo_personal      = Column(Boolean, default=False)
    tipo_medico        = Column(Boolean, default=False)
    consulta_medica_id = Column(Integer, nullable=True)  # vincula consulta cuando médico atiende
    modalidad          = Column(String(20), default="INDIVIDUAL")  # INDIVIDUAL | GRUPAL
    motivo            = Column(Text, nullable=False)

    # Estado del flujo
    estado            = Column(String(30), default="PENDIENTE")
    # PENDIENTE → EN_SEGUIMIENTO → ATENDIDA

    # Respuesta del responsable (segunda parte del F-DC-08)
    area_atencion     = Column(String(100))
    tipo_servicio     = Column(String(100))
    fecha_atencion    = Column(Date)
    descripcion_atencion = Column(Text)
    atendido_por      = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    atendido_en       = Column(DateTime)
    documento_codigo  = Column(String(20), default="F-DC-08")
    documento_version = Column(String(10), default="08")
    documento_efectivo = Column(Date, nullable=True)


# ─── 7. Informe Bimestral ─────────────────────────────────────────────────────
# F-DC-09: generado automáticamente desde sesiones + canalizaciones + perfiles.
# El tutor puede editar los campos de texto libre y luego enviarlo al responsable.

class InformeBimestral(Base):
    __tablename__ = "informes_bimestrales"

    id                = Column(Integer, primary_key=True, index=True)
    tutor_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    grupo_tutorado_id = Column(Integer, ForeignKey("grupos_tutorados.id"), nullable=False, index=True)
    periodo           = Column(String(20), nullable=False)  # MAY-AGO 2026
    bimestre          = Column(Integer, nullable=False)     # 1 o 2

    matricula_inicial = Column(Integer, default=0)  # B1
    matricula_final   = Column(Integer, default=0)  # B2

    # Sesiones por mes (4 meses por bimestre)
    sesiones_mes1     = Column(Integer, default=0)
    sesiones_mes2     = Column(Integer, default=0)
    sesiones_mes3     = Column(Integer, default=0)
    sesiones_mes4     = Column(Integer, default=0)

    # Texto libre del tutor
    principal_problematica = Column(Text)
    sugerencias            = Column(Text)

    # Estado del informe
    estado            = Column(String(20), default="BORRADOR")
    # BORRADOR → ENVIADO → RECIBIDO

    creado_en         = Column(DateTime, default=_now)
    enviado_en        = Column(DateTime)
    recibido_en       = Column(DateTime)
    documento_codigo  = Column(String(20), default="F-DC-09")
    documento_version = Column(String(10), default="08")
    documento_efectivo = Column(Date, nullable=True)


class DocumentoControladoTutoria(Base):
    __tablename__ = "documentos_controlados_tutoria"

    id              = Column(Integer, primary_key=True, index=True)
    codigo          = Column(String(20), nullable=False, index=True)
    nombre          = Column(String(160), nullable=False)
    version         = Column(String(10), nullable=False)
    fecha_efectivo  = Column(Date, nullable=True)
    proceso         = Column(String(80), default="Tutoria")
    vigente         = Column(Boolean, default=True)
    observaciones   = Column(Text, nullable=True)
    actualizado_en  = Column(DateTime, default=_now, nullable=False)


class ProgramacionSesionTutoria(Base):
    __tablename__ = "programaciones_sesion_tutoria"

    id                = Column(Integer, primary_key=True, index=True)
    grupo_tutorado_id = Column(Integer, ForeignKey("grupos_tutorados.id"), nullable=False, index=True)
    tutor_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    fecha_programada  = Column(Date, nullable=False, index=True)
    tipo_sesion       = Column(String(20), default="GRUPAL")
    objetivo          = Column(Text, nullable=True)
    estado            = Column(String(20), default="PROGRAMADA")
    sesion_id         = Column(Integer, ForeignKey("sesiones_tutoria.id"), nullable=True)
    creado_por        = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en         = Column(DateTime, default=_now, nullable=False)


# ─── 8. Historial de cambios de estado de seguimiento ────────────────────────
# Cada vez que el responsable cambia el estado institucional de un alumno,
# se registra aquí: quién cambió, de qué a qué, cuándo y con qué observación.

class HistorialEstadoTutoria(Base):
    __tablename__ = "historial_estado_tutoria"

    id              = Column(Integer, primary_key=True, index=True)
    asignacion_id   = Column(Integer, ForeignKey("asignaciones_tutoria.id"), nullable=False, index=True)
    estado_anterior = Column(String(30), nullable=True)   # None en el primer registro
    estado_nuevo    = Column(String(30), nullable=False)
    observacion     = Column(Text, nullable=True)
    usuario_id      = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creado_en       = Column(DateTime, default=_now, nullable=False)


# ─── 9. Detalle del Informe por Categoría de Vulnerabilidad ──────────────────
# Cada alumno puede aparecer en 0 o más categorías dentro del informe bimestral.

class DetalleInformeBimestral(Base):
    __tablename__ = "detalles_informe_bimestral"

    id          = Column(Integer, primary_key=True, index=True)
    informe_id  = Column(Integer, ForeignKey("informes_bimestrales.id"), nullable=False, index=True)
    alumno_id   = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False)
    bimestre    = Column(Integer, nullable=False)  # 1 o 2

    # Categoría del F-DC-09
    categoria   = Column(String(40), nullable=False)
    # BAJA | VULNERABILIDAD_ACADEMICA | APOYO_PSICOPEDAGOGICO |
    # VULNERABILIDAD_ECONOMICA | PADRE_MADRE | EMBARAZADA |
    # ADICCIONES | ENFERMEDAD | TRABAJA

    # Detalles específicos según categoría
    detalle         = Column(Text)     # motivo de baja, asignaturas reprobadas, empresa, diagnóstico…
    porcentaje      = Column(Float)    # para adicciones y vulnerabilidad
    meses_embarazo  = Column(Integer)  # solo para EMBARAZADA
    num_hijos       = Column(Integer)  # solo para PADRE_MADRE
    realizo_tramite = Column(Boolean)  # solo para BAJA


# ─── 10. Cierre formal de bimestre/cuatrimestre ─────────────────────────────
# Consolida indicadores del periodo para coordinación/rectoría y deja evidencia
# de quién cerró el proceso y qué pendientes quedaron.

class CierreTutoria(Base):
    __tablename__ = "cierres_tutoria"

    id                         = Column(Integer, primary_key=True, index=True)
    periodo                    = Column(String(20), nullable=False, index=True)
    bimestre                   = Column(Integer, nullable=True)
    alcance                    = Column(String(20), nullable=False, default="BIMESTRE")
    estado                     = Column(String(20), nullable=False, default="CERRADO")

    total_grupos               = Column(Integer, default=0)
    total_tutores              = Column(Integer, default=0)
    total_tutorados            = Column(Integer, default=0)
    total_sesiones             = Column(Integer, default=0)
    total_asistencias          = Column(Integer, default=0)
    total_inasistencias        = Column(Integer, default=0)
    alumnos_riesgo_alto        = Column(Integer, default=0)
    canalizaciones_pendientes  = Column(Integer, default=0)
    canalizaciones_seguimiento = Column(Integer, default=0)
    canalizaciones_atendidas   = Column(Integer, default=0)
    informes_borrador          = Column(Integer, default=0)
    informes_enviados          = Column(Integer, default=0)
    informes_recibidos         = Column(Integer, default=0)
    grupos_sin_sesion          = Column(Integer, default=0)

    resumen_json               = Column(Text, nullable=True)
    observaciones              = Column(Text, nullable=True)
    cerrado_por                = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    cerrado_en                 = Column(DateTime, default=_now, nullable=False)
