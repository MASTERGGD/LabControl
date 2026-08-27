import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class EmisionReporteAcademico(Base):
    __tablename__ = "emisiones_reportes_academicos"
    __table_args__ = (
        UniqueConstraint("content_hash", name="uq_emision_reporte_academico_contenido"),
    )

    id = Column(Integer, primary_key=True)
    folio = Column(String(60), nullable=True, unique=True, index=True)
    periodo_id = Column(Integer, ForeignKey("periodos_escolares.id"), nullable=False, index=True)
    generado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    alcance = Column(Text, nullable=False)
    fecha_desde = Column(String(10), nullable=False)
    fecha_hasta = Column(String(10), nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)
    generado_en = Column(DateTime, nullable=False, default=_utcnow)

    periodo = relationship("PeriodoEscolar")
    generado_por = relationship("Usuario")
