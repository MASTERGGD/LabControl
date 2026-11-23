from sqlalchemy import Column, Date, Integer, String

from database import Base


class AvisoInicio(Base):
    __tablename__ = "aviso_inicio_docente"

    id = Column(Integer, primary_key=True, autoincrement=False)
    revision = Column(String(36), nullable=False)
    titulo = Column(String(100), nullable=False)
    mensaje = Column(String(400), nullable=False)
    destino = Column(String(20), nullable=True)
    vigente_hasta = Column(Date, nullable=False)
