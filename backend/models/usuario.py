from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Enum
from sqlalchemy.orm import relationship
from database import Base
import enum

class RolUsuario(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    LAB_ADMIN = "LAB_ADMIN"
    DOCENTE = "DOCENTE"
    ADMINISTRATIVO = "ADMINISTRATIVO"
    ALUMNO = "ALUMNO"

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    numero_empleado = Column(String, unique=True, nullable=True)
    password_hash = Column(String, nullable=False)
    rol = Column(Enum(RolUsuario), nullable=False, default=RolUsuario.DOCENTE)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    activo = Column(Boolean, default=True)

    laboratorio = relationship("Laboratorio", back_populates="admin")
    departamento = relationship("Departamento", back_populates="usuarios")
    reservaciones = relationship("Reservacion", back_populates="docente", foreign_keys="Reservacion.docente_id")
    sesiones = relationship("SesionClase", back_populates="docente")
