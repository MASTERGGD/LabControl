"""
models/espacio.py — Módulo de Apartado de Espacios Institucionales

Modelos:
  EspacioInstitucional  — Sala Audiovisual, Sala de Rectoría u otro tipo
  EspacioResponsable    — Usuarios responsables de cada espacio
  SolicitudEspacio      — Solicitud de uso por fecha/hora
  RequerimientoSolicitud — Ítems de requerimiento por solicitud
"""

from __future__ import annotations

import datetime
import enum

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum, ForeignKey,
    Integer, String, Text, Time, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# ─── Enums ─────────────────────────────────────────────────────────────────────

class TipoEspacio(str, enum.Enum):
    AUDIOVISUAL = "AUDIOVISUAL"
    RECTORIA    = "RECTORIA"
    OTRO        = "OTRO"


class EstadoSolicitud(str, enum.Enum):
    PENDIENTE  = "PENDIENTE"
    APROBADA   = "APROBADA"
    RECHAZADA  = "RECHAZADA"
    CANCELADA  = "CANCELADA"
    FINALIZADA = "FINALIZADA"


class TipoRequerimiento(str, enum.Enum):
    PROYECTOR      = "PROYECTOR"
    AUDIO          = "AUDIO"
    MICROFONO      = "MICROFONO"
    ACOMODO_SILLAS = "ACOMODO_SILLAS"
    MANTELES       = "MANTELES"
    COFFEE_BREAK   = "COFFEE_BREAK"
    PRESIDIUM      = "PRESIDIUM"
    INTERNET       = "INTERNET"
    OTRO           = "OTRO"


# ─── Modelos ───────────────────────────────────────────────────────────────────

class EspacioInstitucional(Base):
    """
    Espacio físico institucional gestionable: sala audiovisual, sala de rectoría, etc.
    Los laboratorios de cómputo siguen su propio flujo (Laboratorio + Reservacion).
    """
    __tablename__ = "espacios_institucionales"

    id          = Column(Integer, primary_key=True, index=True)
    nombre      = Column(String(120), nullable=False, unique=True)
    tipo        = Column(Enum(TipoEspacio), nullable=False)
    ubicacion   = Column(String(200), nullable=True)
    capacidad   = Column(Integer,     nullable=True)
    descripcion = Column(Text,        nullable=True)
    activo      = Column(Boolean,     default=True, nullable=False)

    # Restricción de horario permitido (e.g. 08:00 – 20:00)
    hora_inicio_permitida = Column(String(5), default="08:00", nullable=False)
    hora_fin_permitida    = Column(String(5), default="20:00", nullable=False)

    # ¿Las solicitudes requieren aprobación explícita o se auto-aprueban?
    requiere_aprobacion = Column(Boolean, default=True, nullable=False)

    creado_en = Column(DateTime, default=_utcnow, nullable=False)

    # Relaciones
    responsables = relationship(
        "EspacioResponsable",
        back_populates="espacio",
        cascade="all, delete-orphan",
    )
    solicitudes = relationship(
        "SolicitudEspacio",
        back_populates="espacio",
        cascade="all, delete-orphan",
    )


class EspacioResponsable(Base):
    """
    Asignación many-to-many entre espacios y usuarios responsables.
    La secretaria del rector puede ser responsable de Audiovisual y Rectoría.
    """
    __tablename__ = "espacios_responsables"
    __table_args__ = (
        UniqueConstraint("espacio_id", "usuario_id", name="uq_espacio_responsable"),
    )

    id          = Column(Integer, primary_key=True, index=True)
    espacio_id  = Column(Integer, ForeignKey("espacios_institucionales.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id  = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"),               nullable=False, index=True)
    asignado_en = Column(DateTime, default=_utcnow)

    espacio = relationship("EspacioInstitucional", back_populates="responsables")
    usuario = relationship("Usuario")


class SolicitudEspacio(Base):
    """
    Solicitud de uso de un espacio institucional por fecha y bloque horario.
    Un mismo espacio no puede tener dos solicitudes APROBADAS que se solapen.
    """
    __tablename__ = "solicitudes_espacio"

    id              = Column(Integer, primary_key=True, index=True)
    espacio_id      = Column(Integer, ForeignKey("espacios_institucionales.id", ondelete="CASCADE"), nullable=False, index=True)
    solicitante_id  = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True,  index=True)

    # Datos del solicitante (desnormalizados por si el usuario cambia)
    solicitante_nombre = Column(String(200), nullable=False)
    area_solicitante   = Column(String(200), nullable=True)

    # Cuándo
    fecha       = Column(Date,   nullable=False, index=True)
    hora_inicio = Column(String(5), nullable=False)   # "HH:MM"
    hora_fin    = Column(String(5), nullable=False)

    # Por qué
    motivo             = Column(Text,    nullable=False)
    numero_asistentes  = Column(Integer, nullable=True)
    observaciones      = Column(Text,    nullable=True)

    # Estado
    estado        = Column(Enum(EstadoSolicitud), default=EstadoSolicitud.PENDIENTE, nullable=False, index=True)
    motivo_rechazo = Column(Text, nullable=True)

    # Auditoría de ciclo de vida
    creado_en    = Column(DateTime, default=_utcnow, nullable=False)
    aprobado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    aprobado_en  = Column(DateTime, nullable=True)
    cancelado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    cancelado_en  = Column(DateTime, nullable=True)

    # Relaciones
    espacio      = relationship("EspacioInstitucional", back_populates="solicitudes")
    solicitante  = relationship("Usuario", foreign_keys=[solicitante_id])
    aprobador    = relationship("Usuario", foreign_keys=[aprobado_por])
    cancelador   = relationship("Usuario", foreign_keys=[cancelado_por])
    requerimientos = relationship(
        "RequerimientoSolicitud",
        back_populates="solicitud",
        cascade="all, delete-orphan",
    )


class RequerimientoSolicitud(Base):
    """
    Ítems de requerimiento asociados a una solicitud de espacio.
    Checklist de necesidades: proyector, audio, coffee break, etc.
    """
    __tablename__ = "requerimientos_solicitud"

    id           = Column(Integer, primary_key=True, index=True)
    solicitud_id = Column(Integer, ForeignKey("solicitudes_espacio.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo         = Column(Enum(TipoRequerimiento), nullable=False)
    descripcion  = Column(Text,    nullable=True)   # Texto libre para OTRO o detalles
    cantidad     = Column(Integer, default=1)
    requerido    = Column(Boolean, default=True)

    solicitud = relationship("SolicitudEspacio", back_populates="requerimientos")
