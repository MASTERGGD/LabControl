"""Persistent token sessions, independent of browser presence/heartbeats."""
import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from database import Base


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(String(64), primary_key=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    credential_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    last_seen = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    user_agent = Column(String(240), nullable=False, default="")
    path = Column(String(180), nullable=True)
