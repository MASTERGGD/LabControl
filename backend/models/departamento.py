from __future__ import annotations

import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
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
    responsable_id = Column(
        Integer,
        ForeignKey(
            "usuarios.id",
            name="fk_departamentos_responsable_id",
            ondelete="SET NULL",
            use_alter=True,
        ),
        nullable=True,
    )
    creado_en = Column(DateTime, default=_utcnow, nullable=False)
    actualizado_en = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    usuarios = relationship("Usuario", back_populates="departamento", foreign_keys="Usuario.departamento_id")
    responsable = relationship("Usuario", foreign_keys=[responsable_id])
    comunicados_emitidos = relationship("Comunicado", back_populates="departamento_emisor")
