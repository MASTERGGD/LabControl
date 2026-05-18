from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AuditLog(Base):
    """
    Bitacora de auditoria del sistema.
    Registra todas las acciones relevantes: quien hizo que, cuando y desde donde.
    Los campos usuario_nombre/email se guardan desnormalizados para preservar
    el historial aunque el usuario sea eliminado.
    """
    __tablename__ = "audit_logs"

    id             = Column(Integer, primary_key=True, index=True)
    timestamp      = Column(DateTime, default=_utcnow, index=True, nullable=False)

    # Quien
    usuario_id     = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    usuario_nombre = Column(String(200), nullable=True)   # desnormalizado
    usuario_email  = Column(String(200), nullable=True)   # desnormalizado

    # Que
    accion         = Column(String(80),  nullable=False, index=True)
    recurso        = Column(String(80),  nullable=False, index=True)
    recurso_id     = Column(Integer,     nullable=True)
    detalle        = Column(JSON,        nullable=True)   # datos extra (campos modificados, etc.)
    exito          = Column(Boolean,     default=True,    nullable=False)

    # Desde donde
    ip_address     = Column(String(50),  nullable=True)
    user_agent     = Column(Text,        nullable=True)

    # Relacion (puede ser None si usuario fue eliminado)
    usuario = relationship("Usuario", foreign_keys=[usuario_id])
