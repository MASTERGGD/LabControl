from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class HorarioDisponible(Base):
    __tablename__ = "horarios_disponibles"

    id = Column(Integer, primary_key=True, index=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=False)
    dia_semana = Column(Integer, nullable=False)
    hora_inicio = Column(String, nullable=False)
    hora_fin = Column(String, nullable=False)
    cuatrimestre = Column(String, nullable=False)
    activo = Column(Boolean, default=True)

    laboratorio = relationship("Laboratorio", back_populates="horarios")
    reservaciones = relationship("Reservacion", back_populates="horario")
    bloqueos = relationship("BloqueoSlot", back_populates="horario")

class Reservacion(Base):
    __tablename__ = "reservaciones"

    id = Column(Integer, primary_key=True, index=True)
    horario_id = Column(Integer, ForeignKey("horarios_disponibles.id"), nullable=False)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=False)
    docente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    docente_suplente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    materia             = Column(String, nullable=False)
    carrera             = Column(String, nullable=True)   # carrera académica de la materia
    cuatrimestre        = Column(String, nullable=False)  # período escolar (ej. "ENE-ABR-2025")
    cuatrimestre_materia = Column(String, nullable=True)  # cuatrimestre de la materia (1–12)
    grupo               = Column(String, nullable=False)
    estado              = Column(String, default="PROGRAMADA")
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    observaciones = Column(String, nullable=True)

    horario     = relationship("HorarioDisponible", back_populates="reservaciones")
    laboratorio = relationship("Laboratorio", back_populates="reservaciones")
    docente     = relationship("Usuario", back_populates="reservaciones", foreign_keys=[docente_id])
    sesiones    = relationship("SesionClase", back_populates="reservacion")
    solicitudes = relationship("SolicitudConflicto", back_populates="reservacion", cascade="all, delete-orphan")
    requerimiento = relationship("RequerimientoClase", back_populates="reservacion", uselist=False, cascade="all, delete-orphan")
    eventos_cumplimiento = relationship("EventoCumplimiento", back_populates="reservacion", cascade="all, delete-orphan")


class BloqueoSlot(Base):
    """
    Bloqueo institucional de un slot por SUPER_ADMIN.
    Impide reservaciones y muestra el motivo a los docentes.
    """
    __tablename__ = "bloqueos_slot"

    id             = Column(Integer, primary_key=True, index=True)
    horario_id     = Column(Integer, ForeignKey("horarios_disponibles.id"), nullable=False)
    motivo         = Column(String,  nullable=False)   # "Reunión de academia", "Mantenimiento", etc.
    creado_por_id  = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=_utcnow)
    activo         = Column(Boolean, default=True)

    horario    = relationship("HorarioDisponible", back_populates="bloqueos")
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])


class SolicitudConflicto(Base):
    """
    Docente B solicita un slot ya ocupado por Docente A.
    El admin resuelve quién se queda con él.
    """
    __tablename__ = "solicitudes_conflicto"

    id             = Column(Integer, primary_key=True, index=True)
    reservacion_id = Column(Integer, ForeignKey("reservaciones.id"), nullable=False)
    solicitante_id = Column(Integer, ForeignKey("usuarios.id"),      nullable=False)
    materia        = Column(String,  nullable=False)   # materia del solicitante
    grupo          = Column(String,  nullable=False)   # grupo del solicitante
    motivo         = Column(String,  nullable=True)    # por qué necesita ese slot

    estado            = Column(String,  default="PENDIENTE")  # PENDIENTE | APROBADA | RECHAZADA
    resolucion_notas  = Column(String,  nullable=True)
    resuelto_por_id   = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    fecha_solicitud   = Column(DateTime, default=_utcnow)
    fecha_resolucion  = Column(DateTime, nullable=True)

    reservacion = relationship("Reservacion",  back_populates="solicitudes")
    solicitante = relationship("Usuario", foreign_keys=[solicitante_id])


class RequerimientoClase(Base):
    """
    Requerimientos técnicos que un docente solicita para su clase.
    Tiene ciclo de vida propio: PENDIENTE → CONFIRMADO | RECHAZADO | DOCENTE_PROVEE
    """
    __tablename__ = "requerimientos_clase"

    id             = Column(Integer, primary_key=True, index=True)
    reservacion_id = Column(Integer, ForeignKey("reservaciones.id"), nullable=False)

    # Qué necesita el docente
    items          = Column(String, nullable=True)   # JSON list: ["Proyector","Software específico"]
    descripcion    = Column(String, nullable=True)   # Detalle libre: "AutoCAD 2024"

    # Para software: ¿el docente tiene el instalador?
    tiene_instalador = Column(Boolean, default=False)

    # Urgencia calculada al crear (< 3 días hábiles)
    urgente          = Column(Boolean, default=False)
    dias_anticipacion = Column(Integer, nullable=True)

    # Estado de gestión
    # PENDIENTE | CONFIRMADO | RECHAZADO | DOCENTE_PROVEE
    estado         = Column(String, default="PENDIENTE")
    nota_admin     = Column(String, nullable=True)   # Respuesta del admin

    creado_en      = Column(DateTime, default=_utcnow)
    resuelto_en    = Column(DateTime, nullable=True)
    resuelto_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    reservacion  = relationship("Reservacion", back_populates="requerimiento")
    resuelto_por = relationship("Usuario", foreign_keys=[resuelto_por_id])