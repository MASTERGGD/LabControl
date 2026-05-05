from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id          = Column(Integer, primary_key=True, index=True)
    usuario_id  = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    tipo        = Column(String, nullable=False)   # PRESTAMO_VENCIDO | MANTENIMIENTO | RESERVACION | OVERTIME
    titulo      = Column(String, nullable=False)
    mensaje     = Column(String, nullable=False)
    leida       = Column(Boolean, default=False, nullable=False)
    fecha       = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    url         = Column(String, nullable=True)    # ruta frontend opcional

    usuario = relationship("Usuario", backref="notificaciones")
