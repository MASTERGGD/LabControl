"""
models/comunicado.py — Módulo de Comunicados Institucionales

Modelos:
  Comunicado            — Aviso/comunicado institucional
  ComunicadoDestinatario — A quién va dirigido (TODOS / ROL / USUARIO / DEPARTAMENTO)
  ComunicadoLectura     — Registro de lectura y confirmación por usuario
"""

from __future__ import annotations

import datetime
import enum

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey,
    Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# ─── Enums ─────────────────────────────────────────────────────────────────────

class CategoriaComunicado(str, enum.Enum):
    ACADEMICO      = "ACADEMICO"
    SERVICIOS_ESCOLARES = "SERVICIOS_ESCOLARES"
    TUTORIA        = "TUTORIA"
    LABORATORIOS   = "LABORATORIOS"
    ADMINISTRATIVO = "ADMINISTRATIVO"
    EVENTOS        = "EVENTOS"
    MANTENIMIENTO  = "MANTENIMIENTO"
    RRHH           = "RRHH"
    CONVOCATORIAS  = "CONVOCATORIAS"
    BECAS          = "BECAS"
    CALENDARIO_ACADEMICO = "CALENDARIO_ACADEMICO"
    SEGURIDAD      = "SEGURIDAD"
    VINCULACION    = "VINCULACION"
    GENERAL        = "GENERAL"
    URGENTE        = "URGENTE"


class PrioridadComunicado(str, enum.Enum):
    INFORMATIVO = "INFORMATIVO"
    IMPORTANTE  = "IMPORTANTE"
    URGENTE     = "URGENTE"


class EstadoComunicado(str, enum.Enum):
    BORRADOR   = "BORRADOR"
    PUBLICADO  = "PUBLICADO"
    ARCHIVADO  = "ARCHIVADO"


class TipoDestinatario(str, enum.Enum):
    TODOS        = "TODOS"
    ROL          = "ROL"
    USUARIO      = "USUARIO"
    DEPARTAMENTO = "DEPARTAMENTO"


# ─── Modelos ───────────────────────────────────────────────────────────────────

class Comunicado(Base):
    __tablename__ = "comunicados"

    id                    = Column(Integer, primary_key=True, index=True)
    titulo                = Column(String(200), nullable=False)
    contenido             = Column(Text, nullable=False)
    categoria             = Column(String(30), nullable=False, default="GENERAL")
    prioridad             = Column(String(20), nullable=False, default="INFORMATIVO")
    estado                = Column(String(20), nullable=False, default="BORRADOR")
    requiere_confirmacion = Column(Boolean, nullable=False, default=False)
    requiere_retroalimentacion = Column(Boolean, nullable=False, default=False)
    fecha_limite_respuesta = Column(DateTime, nullable=True)
    fijado                = Column(Boolean, nullable=False, default=False)
    area_emisora          = Column(String(200), nullable=True)
    departamento_emisor_id = Column(Integer, ForeignKey("departamentos.id", ondelete="SET NULL"), nullable=True)
    fecha_publicacion     = Column(DateTime, nullable=True)
    fecha_expiracion      = Column(DateTime, nullable=True)
    autor_id              = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en             = Column(DateTime, default=_utcnow, nullable=False)
    actualizado_en        = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    autor          = relationship("Usuario", foreign_keys=[autor_id])
    departamento_emisor = relationship("Departamento", back_populates="comunicados_emitidos")
    destinatarios  = relationship("ComunicadoDestinatario", back_populates="comunicado",
                                  cascade="all, delete-orphan")
    lecturas       = relationship("ComunicadoLectura", back_populates="comunicado",
                                  cascade="all, delete-orphan")
    adjuntos       = relationship("ComunicadoAdjunto", back_populates="comunicado",
                                  cascade="all, delete-orphan")
    respuestas     = relationship("ComunicadoRespuesta", back_populates="comunicado",
                                  cascade="all, delete-orphan")


class ComunicadoDestinatario(Base):
    __tablename__ = "comunicado_destinatarios"
    __table_args__ = (
        UniqueConstraint("comunicado_id", "tipo_destinatario", "destinatario_ref",
                         name="uq_comunicado_destinatario"),
    )

    id               = Column(Integer, primary_key=True, index=True)
    comunicado_id    = Column(Integer, ForeignKey("comunicados.id", ondelete="CASCADE"), nullable=False, index=True)
    # TODOS → destinatario_ref = None
    # ROL   → destinatario_ref = nombre del rol (ej. "DOCENTE")
    # USUARIO → destinatario_ref = str(usuario_id)
    # DEPARTAMENTO → destinatario_ref = str(departamento_id)
    tipo_destinatario = Column(String(20), nullable=False)
    destinatario_ref  = Column(String(100), nullable=True)

    comunicado = relationship("Comunicado", back_populates="destinatarios")


class ComunicadoLectura(Base):
    __tablename__ = "comunicado_lecturas"
    __table_args__ = (
        UniqueConstraint("comunicado_id", "usuario_id", name="uq_comunicado_lectura"),
    )

    id            = Column(Integer, primary_key=True, index=True)
    comunicado_id = Column(Integer, ForeignKey("comunicados.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    leido_en      = Column(DateTime, nullable=True)
    confirmado_en = Column(DateTime, nullable=True)
    creado_en     = Column(DateTime, default=_utcnow, nullable=False)

    comunicado = relationship("Comunicado", back_populates="lecturas")
    usuario    = relationship("Usuario", foreign_keys=[usuario_id])


class ComunicadoAdjunto(Base):
    __tablename__ = "comunicado_adjuntos"

    id              = Column(Integer, primary_key=True, index=True)
    comunicado_id   = Column(Integer, ForeignKey("comunicados.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre_original = Column(String(255), nullable=False)
    nombre_archivo  = Column(String(255), nullable=False)
    ruta_archivo    = Column(String(500), nullable=False)
    tipo_mime       = Column(String(100), nullable=False)
    tamano_bytes    = Column(Integer, nullable=False, default=0)
    sha256          = Column(String(64), nullable=False, index=True)
    subido_por_id   = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en       = Column(DateTime, default=_utcnow, nullable=False)

    comunicado = relationship("Comunicado", back_populates="adjuntos")
    subido_por = relationship("Usuario", foreign_keys=[subido_por_id])


class ComunicadoRespuesta(Base):
    __tablename__ = "comunicado_respuestas"
    __table_args__ = (
        UniqueConstraint("comunicado_id", "usuario_id", name="uq_comunicado_respuesta_usuario"),
    )

    id            = Column(Integer, primary_key=True, index=True)
    comunicado_id = Column(Integer, ForeignKey("comunicados.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    comentario    = Column(Text, nullable=False)
    estado        = Column(String(20), nullable=False, default="RESPONDIDO")
    revisado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    revisado_en   = Column(DateTime, nullable=True)
    creado_en     = Column(DateTime, default=_utcnow, nullable=False)
    actualizado_en = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    comunicado = relationship("Comunicado", back_populates="respuestas")
    usuario    = relationship("Usuario", foreign_keys=[usuario_id])
    revisado_por = relationship("Usuario", foreign_keys=[revisado_por_id])
    adjuntos   = relationship("ComunicadoRespuestaAdjunto", back_populates="respuesta",
                              cascade="all, delete-orphan")


class ComunicadoRespuestaAdjunto(Base):
    __tablename__ = "comunicado_respuesta_adjuntos"

    id              = Column(Integer, primary_key=True, index=True)
    respuesta_id    = Column(Integer, ForeignKey("comunicado_respuestas.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre_original = Column(String(255), nullable=False)
    nombre_archivo  = Column(String(255), nullable=False)
    ruta_archivo    = Column(String(500), nullable=False)
    tipo_mime       = Column(String(100), nullable=False)
    tamano_bytes    = Column(Integer, nullable=False, default=0)
    sha256          = Column(String(64), nullable=False, index=True)
    creado_en       = Column(DateTime, default=_utcnow, nullable=False)

    respuesta = relationship("ComunicadoRespuesta", back_populates="adjuntos")


class ComunicadoRespaldo(Base):
    __tablename__ = "comunicado_respaldos"

    id              = Column(Integer, primary_key=True, index=True)
    nombre_archivo  = Column(String(255), nullable=False)
    ruta_archivo    = Column(String(500), nullable=False)
    sha256          = Column(String(64), nullable=False, unique=True, index=True)
    tamano_bytes    = Column(Integer, nullable=False, default=0)
    total_comunicados = Column(Integer, nullable=False, default=0)
    fecha_inicio    = Column(DateTime, nullable=True)
    fecha_fin       = Column(DateTime, nullable=True)
    criterios       = Column(Text, nullable=True)
    creado_por_id   = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en       = Column(DateTime, default=_utcnow, nullable=False)

    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
