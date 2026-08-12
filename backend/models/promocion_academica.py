import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
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
