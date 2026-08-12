import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class CierreAcademicoPeriodo(Base):
    __tablename__ = "cierres_academicos_periodo"
    __table_args__ = (UniqueConstraint("periodo_id", name="uq_cierre_academico_periodo"),)

    id = Column(Integer, primary_key=True, index=True)
    periodo_id = Column(Integer, ForeignKey("periodos_escolares.id"), nullable=False, index=True)
    estado = Column(String(25), nullable=False, default="ACTIVO", index=True)
    confirmacion_inicio = Column(Date, nullable=True)
    confirmacion_fin = Column(Date, nullable=True)
    observaciones = Column(Text, nullable=True)
    configurado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    cerrado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=_utcnow)
    actualizado_en = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)
    cerrado_en = Column(DateTime, nullable=True)

    periodo = relationship("PeriodoEscolar")
    configurado_por = relationship("Usuario", foreign_keys=[configurado_por_id])
    cerrado_por = relationship("Usuario", foreign_keys=[cerrado_por_id])


class ConfirmacionCargaDocente(Base):
    __tablename__ = "confirmaciones_carga_docente"
    __table_args__ = (UniqueConstraint("cierre_id", "carga_docente_id", name="uq_confirmacion_cierre_carga"),)

    id = Column(Integer, primary_key=True, index=True)
    cierre_id = Column(Integer, ForeignKey("cierres_academicos_periodo.id", ondelete="CASCADE"), nullable=False, index=True)
    carga_docente_id = Column(Integer, ForeignKey("cargas_docentes.id"), nullable=False, index=True)
    docente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    estado = Column(String(25), nullable=False, default="PENDIENTE_REVISION", index=True)
    observaciones = Column(Text, nullable=True)
    resumen_json = Column(JSON, nullable=True)
    confirmado_en = Column(DateTime, nullable=True)
    reabierta_hasta = Column(DateTime, nullable=True)
    motivo_reapertura = Column(Text, nullable=True)
    reabierta_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    actualizado_en = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    cierre = relationship("CierreAcademicoPeriodo")
    carga = relationship("CargaDocente")
    docente = relationship("Usuario", foreign_keys=[docente_id])
    reabierta_por = relationship("Usuario", foreign_keys=[reabierta_por_id])
