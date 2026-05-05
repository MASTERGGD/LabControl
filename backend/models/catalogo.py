from sqlalchemy import Column, Integer, String, Boolean, UniqueConstraint
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
