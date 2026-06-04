from __future__ import annotations

import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class UsuarioPermiso(Base):
    __tablename__ = "usuario_permisos"
    __table_args__ = (
        UniqueConstraint("usuario_id", "permiso", "departamento_id", name="uq_usuario_permiso_departamento"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    permiso = Column(String(80), nullable=False, index=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id", ondelete="CASCADE"), nullable=True, index=True)
    activo = Column(Boolean, default=True, nullable=False)
    otorgado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en = Column(DateTime, default=_utcnow, nullable=False)
    actualizado_en = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    usuario = relationship("Usuario", foreign_keys=[usuario_id])
    departamento = relationship("Departamento")
    otorgado_por = relationship("Usuario", foreign_keys=[otorgado_por_id])
