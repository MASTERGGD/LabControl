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
    activo          = Column(Boolean, default=True, nullable=False)
    creado_en       = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    actualizado_en  = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)


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
