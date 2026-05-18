from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class SesionClase(Base):
    __tablename__ = "sesiones_clase"

    id = Column(Integer, primary_key=True, index=True)
    reservacion_id = Column(Integer, ForeignKey("reservaciones.id"), nullable=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=False)
    docente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo_sesion = Column(String, default="CLASE")   # CLASE | LIBRE
    materia = Column(String, nullable=True)
    grupo = Column(String, nullable=True)
    codigo_sesion = Column(String, unique=True, nullable=False)
    inicio = Column(DateTime, default=_utcnow)
    fin_estimado = Column(DateTime, nullable=True)
    fin_real = Column(DateTime, nullable=True)
    estado = Column(String, default="ABIERTA")
    observacion_general = Column(String, nullable=True)
    overtime_min = Column(Integer, nullable=True, default=0)

    # ── Revisión de recepción ─────────────────────────────────────────────────
    recepcion_confirmada = Column(Boolean, default=False)
    recepcion_fin        = Column(DateTime, nullable=True)
    # True cuando el docente completó la inspección inicial de PCs

    reservacion = relationship("Reservacion", back_populates="sesiones")
    docente = relationship("Usuario", back_populates="sesiones")
    asignaciones = relationship("AsignacionPC", back_populates="sesion")
    observaciones_pc = relationship("ObservacionPC", back_populates="sesion")

class AsignacionPC(Base):
    __tablename__ = "asignaciones_pc"

    id = Column(Integer, primary_key=True, index=True)
    sesion_id = Column(Integer, ForeignKey("sesiones_clase.id"), nullable=False)
    computadora_id = Column(Integer, ForeignKey("computadoras.id"), nullable=False)
    alumno_nombre = Column(String, nullable=False)
    alumno_matricula = Column(String, nullable=False)
    hora_asignacion = Column(DateTime, default=_utcnow)
    hora_liberacion = Column(DateTime, nullable=True)

    sesion = relationship("SesionClase", back_populates="asignaciones")
    computadora = relationship("Computadora", back_populates="asignaciones")

class ObservacionPC(Base):
    __tablename__ = "observaciones_pc"

    id = Column(Integer, primary_key=True, index=True)
    sesion_id = Column(Integer, ForeignKey("sesiones_clase.id"), nullable=False)
    computadora_id = Column(Integer, ForeignKey("computadoras.id"), nullable=True)
    tipo = Column(String, default="SIN_NOVEDAD")
    # SIN_NOVEDAD | CON_PROBLEMA | DAÑO | MANTENIMIENTO | OTRO
    descripcion = Column(String, nullable=True)
    prioridad = Column(String, default="BAJA")
    atendida = Column(Boolean, default=False)
    momento = Column(String, default="DURANTE_SESION")
    # RECEPCION_INICIO | DURANTE_SESION | CIERRE

    sesion = relationship("SesionClase", back_populates="observaciones_pc")
    computadora = relationship("Computadora", back_populates="observaciones")
