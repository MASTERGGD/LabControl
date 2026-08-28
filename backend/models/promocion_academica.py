import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class PromocionAcademicaAlumno(Base):
    __tablename__ = "promociones_academicas_alumno"
    __table_args__ = (UniqueConstraint("inscripcion_origen_id", name="uq_promocion_inscripcion_origen"),)

    id = Column(Integer, primary_key=True)
    alumno_id = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, index=True)
    inscripcion_origen_id = Column(Integer, ForeignKey("inscripciones_alumnos.id"), nullable=False, index=True)
    periodo_destino_id = Column(Integer, ForeignKey("periodos_escolares.id"), nullable=False, index=True)
    resolucion = Column(String(25), nullable=False, default="PENDIENTE", index=True)
    cuatrimestre_destino = Column(Integer, nullable=True)
    grupo_destino = Column(String(10), nullable=True)
    carrera_destino_id = Column(Integer, ForeignKey("catalogo_carreras.id"), nullable=True, index=True)
    observaciones = Column(Text, nullable=True)
    estado = Column(String(20), nullable=False, default="PROPUESTA", index=True)
    resuelto_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    resuelto_en = Column(DateTime, nullable=True)
    aplicado_en = Column(DateTime, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    actualizado_en = Column(DateTime, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    alumno = relationship("CatalogoAlumno")
    inscripcion_origen = relationship("InscripcionAlumno")
    periodo_destino = relationship("PeriodoEscolar")
    resuelto_por = relationship("Usuario")
    carrera_destino = relationship("CatalogoCarrera")


class ContinuidadPrograma(Base):
    __tablename__ = "continuidades_programas"
    __table_args__ = (
        UniqueConstraint("carrera_origen_id", "carrera_destino_id", name="uq_continuidad_programas"),
    )

    id = Column(Integer, primary_key=True)
    carrera_origen_id = Column(Integer, ForeignKey("catalogo_carreras.id"), nullable=False, index=True)
    carrera_destino_id = Column(Integer, ForeignKey("catalogo_carreras.id"), nullable=False, index=True)
    cuatrimestre_origen = Column(Integer, nullable=False, default=6)
    cuatrimestre_destino = Column(Integer, nullable=False, default=7)
    activo = Column(Boolean, nullable=False, default=True)
    creado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    carrera_origen = relationship("CatalogoCarrera", foreign_keys=[carrera_origen_id])
    carrera_destino = relationship("CatalogoCarrera", foreign_keys=[carrera_destino_id])
    creado_por = relationship("Usuario")
