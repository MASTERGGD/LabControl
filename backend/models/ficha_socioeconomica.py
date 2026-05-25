"""
Modelo FichaSocioeconomica — formulario capturado por el alumno,
gestionado por Servicios Escolares, consumido por Tutoría.

Máquina de estados:
  PENDIENTE_CAPTURA  → BORRADOR → ENVIADA → VALIDADA
                                           → REQUIERE_CORRECCION → BORRADOR (reabierta)
                                           → RECHAZADA
"""
import datetime
import enum

from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SAEnum,
    Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


class EstadoFicha(str, enum.Enum):
    PENDIENTE_CAPTURA   = "PENDIENTE_CAPTURA"    # SE activó, alumno aún no empieza
    BORRADOR            = "BORRADOR"             # alumno guardó parcialmente
    ENVIADA             = "ENVIADA"              # alumno envió, espera revisión SE
    REQUIERE_CORRECCION = "REQUIERE_CORRECCION"  # SE devolvió con nota
    VALIDADA            = "VALIDADA"             # SE aprobó
    RECHAZADA           = "RECHAZADA"            # SE rechazó definitivamente


class FichaSocioeconomica(Base):
    __tablename__ = "fichas_socioeconomicas"

    id          = Column(Integer, primary_key=True, index=True)
    alumno_id   = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, index=True)
    periodo     = Column(String(20), nullable=False)          # MAY-AGO 2026
    estado      = Column(
        SAEnum(EstadoFicha, name="estadoficha", create_type=True),
        nullable=False, default=EstadoFicha.PENDIENTE_CAPTURA,
    )

    # ── Auditoría de flujo ────────────────────────────────────────────────
    activado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    activado_en     = Column(DateTime, nullable=True)
    enviada_en      = Column(DateTime, nullable=True)
    validada_en     = Column(DateTime, nullable=True)
    revisado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    nota_correccion = Column(Text, nullable=True)   # mensaje al alumno cuando SE devuelve

    # ── Sección 1: Datos personales ───────────────────────────────────────
    nombre_completo  = Column(String(200))
    fecha_ingreso    = Column(String(20))
    carrera          = Column(String(120))
    sexo             = Column(String(40))
    estado_civil     = Column(String(60))
    lugar_nacimiento = Column(String(160))
    fecha_nacimiento = Column(String(20))
    tiene_hijos      = Column(Boolean, default=False)
    num_hijos        = Column(Integer, default=0)
    habla_lengua     = Column(Boolean, default=False)
    lengua           = Column(String(100))

    # ── Sección 2: Contacto y domicilios ─────────────────────────────────
    telefono                = Column(String(30))
    procedencia_calle       = Column(String(200))
    procedencia_colonia     = Column(String(100))
    procedencia_localidad   = Column(String(100))
    procedencia_municipio   = Column(String(100))
    procedencia_estado      = Column(String(60))
    procedencia_cp          = Column(String(10))
    residencia_calle        = Column(String(200))
    residencia_colonia      = Column(String(100))
    residencia_localidad    = Column(String(100))
    residencia_municipio    = Column(String(100))
    residencia_estado       = Column(String(60))
    residencia_cp           = Column(String(10))

    # ── Sección 3: Antecedentes escolares ────────────────────────────────
    bachillerato            = Column(String(200))
    bachillerato_ubicacion  = Column(String(200))
    periodo_estudios        = Column(String(60))
    promedio                = Column(Float)
    area_bachillerato       = Column(String(80))

    # ── Sección 4: Situación económica ───────────────────────────────────
    depende_de              = Column(String(60))
    responsable_nombre      = Column(String(200))
    responsable_parentesco  = Column(String(80))
    responsable_ocupacion   = Column(String(120))
    responsable_estudios    = Column(String(80))
    responsable_telefono    = Column(String(30))
    ingreso_mensual         = Column(Float)
    gasto_mensual           = Column(Float)
    dependientes            = Column(Integer)
    recibe_apoyo            = Column(Boolean, default=False)
    institucion_apoyo       = Column(String(200))

    # ── Sección 5: Salud ─────────────────────────────────────────────────
    tiene_alergia           = Column(Boolean, default=False)
    alergia_cual            = Column(String(200))
    alergia_medicamento     = Column(String(200))
    enfermedad_cronica      = Column(Boolean, default=False)
    enfermedad_cual         = Column(String(200))
    enfermedad_medicamento  = Column(String(200))
    tiene_discapacidad      = Column(Boolean, default=False)
    discapacidad_tipo       = Column(String(200))
    discapacidad_medicamento = Column(String(200))
    informacion_relevante   = Column(Text)

    # ── Timestamps ───────────────────────────────────────────────────────
    creada_en       = Column(DateTime, default=_now)
    actualizada_en  = Column(DateTime, default=_now, onupdate=_now)

    # ── Relaciones ────────────────────────────────────────────────────────
    alumno          = relationship("CatalogoAlumno", back_populates="fichas_socioeconomicas", foreign_keys=[alumno_id])
    activado_por    = relationship("Usuario", foreign_keys=[activado_por_id])
    revisado_por    = relationship("Usuario", foreign_keys=[revisado_por_id])
