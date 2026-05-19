from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Laboratorio(Base):
    __tablename__ = "laboratorios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
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

    id = Column(Integer, primary_key=True, index=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=False)
    numero = Column(Integer, nullable=False)
    codigo = Column(String, nullable=False)
    fila = Column(String, nullable=True)
    specs = Column(String, nullable=True)
    estado = Column(String, default="OPERATIVO")
    activa = Column(Boolean, default=True)

    laboratorio = relationship("Laboratorio", back_populates="computadoras")
    asignaciones = relationship("AsignacionPC", back_populates="computadora")
    observaciones_pc = relationship("ObservacionPC", back_populates="computadora")
    incidentes       = relationship("Incidente",    back_populates="computadora")
