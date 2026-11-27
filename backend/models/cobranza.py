from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from database import Base


class ConceptoCobro(Base):
    __tablename__ = "cobranza_conceptos"

    id = Column(Integer, primary_key=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=False)
    nombre = Column(String(150), nullable=False)
    importe_centavos = Column(Integer, nullable=False)
    activo = Column(Boolean, nullable=False, default=True)


class PagoServicio(Base):
    __tablename__ = "cobranza_pagos"
    __table_args__ = (UniqueConstraint("departamento_id", "operacion", name="uq_cobranza_operacion"),)

    id = Column(Integer, primary_key=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=False)
    operacion = Column(String(36), nullable=False)
    alumno_id = Column(Integer, ForeignKey("catalogo_alumnos.id", ondelete="SET NULL"), nullable=True)
    concepto_id = Column(Integer, ForeignKey("cobranza_conceptos.id"), nullable=False)
    cajero_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    matricula = Column(String(30), nullable=False)
    alumno = Column(String(300), nullable=False)
    periodo = Column(String(20), nullable=False)
    concepto = Column(String(150), nullable=False)
    cajero = Column(String(200), nullable=False)
    importe_centavos = Column(Integer, nullable=False)
    recibido_centavos = Column(Integer, nullable=False)
    medio = Column(String(20), nullable=False)
    referencia = Column(String(120), nullable=True)
    creado_en = Column(DateTime(timezone=True), nullable=False)
