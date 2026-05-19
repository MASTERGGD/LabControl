from __future__ import annotations

import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from database import Base


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class Departamento(Base):
    __tablename__ = "departamentos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False, unique=True, index=True)
    clave = Column(String(30), nullable=False, unique=True, index=True)
    descripcion = Column(String(300), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    creado_en = Column(DateTime, default=_utcnow, nullable=False)
    actualizado_en = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    usuarios = relationship("Usuario", back_populates="departamento")
    comunicados_emitidos = relationship("Comunicado", back_populates="departamento_emisor")
