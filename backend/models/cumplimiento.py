from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Date
from sqlalchemy.orm import relationship
from database import Base
import datetime


class EventoCumplimiento(Base):
    __tablename__ = "eventos_cumplimiento"

    id               = Column(Integer, primary_key=True, index=True)
    reservacion_id   = Column(Integer, ForeignKey("reservaciones.id"), nullable=False)
    sesion_id        = Column(Integer, ForeignKey("sesiones_clase.id"), nullable=True)
    tipo             = Column(String, nullable=False)  # IMPARTIDA | NO_ASISTIO | CANCELADA_TARDIA
    fecha            = Column(Date, nullable=False)    # fecha real de la ocurrencia
    motivo           = Column(String, nullable=True)
    registrado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en        = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None))

    reservacion     = relationship("Reservacion", back_populates="eventos_cumplimiento")
    sesion          = relationship("SesionClase")
    registrado_por  = relationship("Usuario", foreign_keys=[registrado_por_id])
