from sqlalchemy import Column, Date, DateTime, Integer, String, UniqueConstraint

from database import Base


class AvisoInicio(Base):
    __tablename__ = "aviso_inicio_docente"

    id = Column(Integer, primary_key=True, autoincrement=False)
    revision = Column(String(36), nullable=False)
    titulo = Column(String(100), nullable=False)
    mensaje = Column(String(400), nullable=False)
    destino = Column(String(20), nullable=True)
    audiencia = Column(String(10), nullable=False, server_default="DOCENTES")
    vigente_hasta = Column(Date, nullable=False)


class HistorialAvisoInicio(Base):
    __tablename__ = "historial_avisos_inicio"
    __table_args__ = (UniqueConstraint("aviso_id", "version", name="uq_historial_aviso_version"),)

    revision = Column(String(36), primary_key=True)
    aviso_id = Column(String(36), nullable=False)
    version = Column(Integer, nullable=False)
    titulo = Column(String(100), nullable=False)
    mensaje = Column(String(400), nullable=False)
    destino = Column(String(20))
    audiencia = Column(String(10), nullable=False)
    vigente_hasta = Column(Date, nullable=False)
    publicado_en = Column(DateTime(timezone=True))
    publicado_por = Column(String(200))
    estado_final = Column(String(20))
    cerrado_en = Column(DateTime(timezone=True))
