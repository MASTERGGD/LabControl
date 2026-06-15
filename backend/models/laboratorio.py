from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

class Laboratorio(Base):
    __tablename__ = "laboratorios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    categoria = Column(String(80), nullable=True)
    ubicacion = Column(String, nullable=True)
    capacidad = Column(Integer, default=25)
    activo = Column(Boolean, default=True)

    admin = relationship("Usuario", back_populates="laboratorio", uselist=False, foreign_keys="Usuario.laboratorio_id")
    computadoras = relationship("Computadora", back_populates="laboratorio")
    activos = relationship("Activo", back_populates="laboratorio")
    horarios = relationship("HorarioDisponible", back_populates="laboratorio")
    reservaciones = relationship("Reservacion", back_populates="laboratorio")
    incidentes    = relationship("Incidente", back_populates="laboratorio")

class Computadora(Base):
    __tablename__ = "computadoras"
    __table_args__ = (
        UniqueConstraint("laboratorio_id", "numero", name="uq_computadora_lab_numero"),
        UniqueConstraint("laboratorio_id", "codigo", name="uq_computadora_lab_codigo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=False)
    activo_id = Column(Integer, ForeignKey("activos.id"), nullable=True, unique=True, index=True)
    numero = Column(Integer, nullable=False)
    codigo = Column(String, nullable=False)
    fila = Column(String, nullable=True)
    specs = Column(String, nullable=True)
    estado = Column(String, default="OPERATIVO")
    activa = Column(Boolean, default=True)

    laboratorio = relationship("Laboratorio", back_populates="computadoras")
    activo = relationship("Activo", foreign_keys=[activo_id])
    asignaciones = relationship("AsignacionPC", back_populates="computadora")
    observaciones_pc = relationship("ObservacionPC", back_populates="computadora")
    incidentes       = relationship("Incidente",    back_populates="computadora")
    historial_activos = relationship(
        "HistorialAsignacionActivoPC",
        back_populates="computadora",
        order_by="HistorialAsignacionActivoPC.fecha_inicio.desc()",
    )


class HistorialAsignacionActivoPC(Base):
    __tablename__ = "historial_asignaciones_activo_pc"

    id = Column(Integer, primary_key=True, index=True)
    computadora_id = Column(Integer, ForeignKey("computadoras.id"), nullable=False, index=True)
    activo_id = Column(Integer, ForeignKey("activos.id"), nullable=False, index=True)
    asignado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    fecha_inicio = Column(DateTime, default=_utcnow, nullable=False)
    fecha_fin = Column(DateTime, nullable=True)
    motivo = Column(String(250), nullable=True)

    computadora = relationship("Computadora", back_populates="historial_activos")
    activo = relationship("Activo")
    asignado_por = relationship("Usuario", foreign_keys=[asignado_por_id])
