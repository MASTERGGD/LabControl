import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class CatalogoAlumno(Base):
    __tablename__ = "catalogo_alumnos"

    id               = Column(Integer, primary_key=True, index=True)
    matricula        = Column(String, nullable=False, index=True)
    apellido_paterno = Column(String, nullable=False)
    apellido_materno = Column(String, nullable=False)
    nombres          = Column(String, nullable=False)
    carrera          = Column(String, nullable=False)
    cuatrimestre     = Column(Integer, nullable=False)   # 1–12 según plan de estudios
    grupo            = Column(String, nullable=False)    # A, B, C, D
    periodo          = Column(String, nullable=False)    # MAY-AGO 2026, ENE-ABR 2026, …
    activo           = Column(Boolean, default=True)

    # ── Acceso SIGA ────────────────────────────────────────────────────────
    correo_institucional = Column(String(120), nullable=True)   # correo @utecan.edu.mx
    usuario_id           = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    # ── Relaciones ──────────────────────────────────────────────────────────
    usuario                = relationship("Usuario", foreign_keys=[usuario_id])
    fichas_socioeconomicas = relationship("FichaSocioeconomica", back_populates="alumno", foreign_keys="FichaSocioeconomica.alumno_id")

    __table_args__ = (
        UniqueConstraint("matricula", "periodo", name="uq_alumno_matricula_periodo"),
    )


class PeriodoEscolar(Base):
    __tablename__ = "periodos_escolares"

    id         = Column(Integer, primary_key=True, index=True)
    clave      = Column(String(20), nullable=False, unique=True, index=True)
    activo     = Column(Boolean, default=True, nullable=False)
    es_actual  = Column(Boolean, default=False, nullable=False)
    creado_en  = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    grupos = relationship("GrupoAcademico", back_populates="periodo")


class GrupoAcademico(Base):
    __tablename__ = "grupos_academicos"

    id            = Column(Integer, primary_key=True, index=True)
    periodo_id    = Column(Integer, ForeignKey("periodos_escolares.id"), nullable=False, index=True)
    carrera       = Column(String(180), nullable=False, index=True)
    cuatrimestre  = Column(Integer, nullable=False)
    grupo         = Column(String(10), nullable=False)
    turno         = Column(String(20), nullable=True)
    activo        = Column(Boolean, default=True, nullable=False)
    creado_en     = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    periodo      = relationship("PeriodoEscolar", back_populates="grupos")
    inscripciones = relationship("InscripcionAlumno", back_populates="grupo_academico")

    __table_args__ = (
        UniqueConstraint("periodo_id", "carrera", "cuatrimestre", "grupo", name="uq_grupo_academico"),
    )


class InscripcionAlumno(Base):
    __tablename__ = "inscripciones_alumnos"

    id                  = Column(Integer, primary_key=True, index=True)
    alumno_id           = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, index=True)
    grupo_academico_id  = Column(Integer, ForeignKey("grupos_academicos.id"), nullable=False, index=True)
    estado              = Column(String(20), default="ACTIVO", nullable=False)
    inscrito_en         = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    alumno          = relationship("CatalogoAlumno")
    grupo_academico = relationship("GrupoAcademico", back_populates="inscripciones")

    __table_args__ = (
        UniqueConstraint("alumno_id", "grupo_academico_id", name="uq_inscripcion_alumno_grupo"),
    )


class CatalogoMateria(Base):
    __tablename__ = "catalogo_materias"

    id                   = Column(Integer, primary_key=True, index=True)
    nombre               = Column(String, nullable=False)
    carrera              = Column(String, nullable=True)
    cuatrimestre_oficial = Column(Integer, nullable=True)   # cuatrimestre del plan (3, 5, 9…)
    periodo              = Column(String, nullable=True)    # periodo de vigencia
    activo               = Column(Boolean, default=True)


class CatalogoCarrera(Base):
    __tablename__ = "catalogo_carreras"

    id              = Column(Integer, primary_key=True, index=True)
    clave           = Column(String(30), nullable=False, unique=True, index=True)
    nombre          = Column(String(180), nullable=False, unique=True, index=True)
    nivel           = Column(String(30), nullable=True)
    division        = Column(String(120), nullable=True)
    plan_estudios   = Column(String(80), nullable=True)
    activo          = Column(Boolean, default=True, nullable=False)
    creado_en       = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    actualizado_en  = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    aliases         = relationship("CatalogoCarreraAlias", back_populates="carrera", cascade="all, delete-orphan")


class CatalogoCarreraAlias(Base):
    __tablename__ = "catalogo_carreras_aliases"

    id          = Column(Integer, primary_key=True, index=True)
    carrera_id  = Column(Integer, ForeignKey("catalogo_carreras.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre      = Column(String(180), nullable=False, unique=True, index=True)
    creado_en   = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    carrera     = relationship("CatalogoCarrera", back_populates="aliases")


class CatalogoInventarioItem(Base):
    __tablename__ = "catalogo_inventario"

    id              = Column(Integer, primary_key=True, index=True)
    tipo            = Column(String(40), nullable=False, index=True)
    clave           = Column(String(50), nullable=False, index=True)
    nombre          = Column(String(150), nullable=False)
    prefijo_codigo  = Column(String(12), nullable=True)
    alcance         = Column(String(20), default="AMBOS", nullable=False)
    activo          = Column(Boolean, default=True, nullable=False)
    protegido       = Column(Boolean, default=False, nullable=False)
    creado_por_id   = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en       = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    actualizado_en  = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    creado_por      = relationship("Usuario", foreign_keys=[creado_por_id])

    __table_args__ = (
        UniqueConstraint("tipo", "clave", name="uq_catalogo_inventario_tipo_clave"),
    )
