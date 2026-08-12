import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class CalendarioAcademico(Base):
    __tablename__ = "calendarios_academicos"
    __table_args__ = (
        UniqueConstraint("periodo_id", name="uq_calendario_academico_periodo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    periodo_id = Column(Integer, ForeignKey("periodos_escolares.id"), nullable=False, index=True)
    estado = Column(String(20), nullable=False, default="BORRADOR", index=True)
    version = Column(Integer, nullable=False, default=1)
    observaciones = Column(Text, nullable=True)
    creado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    publicado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=_utcnow)
    actualizado_en = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)
    publicado_en = Column(DateTime, nullable=True)
    cerrado_en = Column(DateTime, nullable=True)

    periodo = relationship("PeriodoEscolar")
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
    publicado_por = relationship("Usuario", foreign_keys=[publicado_por_id])
    eventos = relationship(
        "EventoCalendarioAcademico", back_populates="calendario",
        cascade="all, delete-orphan", order_by="EventoCalendarioAcademico.fecha_inicio",
    )


class EventoCalendarioAcademico(Base):
    __tablename__ = "eventos_calendario_academico"

    id = Column(Integer, primary_key=True, index=True)
    calendario_id = Column(Integer, ForeignKey("calendarios_academicos.id", ondelete="CASCADE"), nullable=False, index=True)
    titulo = Column(String(180), nullable=False)
    tipo = Column(String(40), nullable=False, index=True)
    fecha_inicio = Column(Date, nullable=False, index=True)
    fecha_fin = Column(Date, nullable=False, index=True)
    descripcion = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    requiere_asistencia = Column(Boolean, nullable=False, default=True)
    permite_iniciar_clase = Column(Boolean, nullable=False, default=True)
    genera_alertas = Column(Boolean, nullable=False, default=True)
    activo = Column(Boolean, nullable=False, default=True)
    creado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    actualizado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=_utcnow)
    actualizado_en = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    calendario = relationship("CalendarioAcademico", back_populates="eventos")
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
    actualizado_por = relationship("Usuario", foreign_keys=[actualizado_por_id])


class HistorialCalendarioAcademico(Base):
    __tablename__ = "historial_calendario_academico"

    id = Column(Integer, primary_key=True, index=True)
    calendario_id = Column(Integer, ForeignKey("calendarios_academicos.id", ondelete="CASCADE"), nullable=False, index=True)
    evento_id = Column(Integer, nullable=True, index=True)
    accion = Column(String(30), nullable=False, index=True)
    motivo = Column(String(500), nullable=True)
    datos_anteriores = Column(JSON, nullable=True)
    datos_nuevos = Column(JSON, nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    creado_en = Column(DateTime, nullable=False, default=_utcnow)

    usuario = relationship("Usuario")
