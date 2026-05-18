"""
models/adeudo.py — Registro unificado de responsabilidades

Cubre CUALQUIER tipo de responsabilidad de CUALQUIER persona
(alumno, docente u otro) hacia el laboratorio:

  - Daño a equipo detectado en revisión de entrada
  - Incidente presenciado por el docente durante sesión activa
  - Préstamo no devuelto o devuelto en mal estado
  - Registro manual por el administrador

Ciclo de vida del estado:
  PENDIENTE → EN_REVISION → RESUELTO | EXONERADO
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from database import Base
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class Adeudo(Base):
    __tablename__ = "adeudos"

    id = Column(Integer, primary_key=True, index=True)

    # ── Persona responsable (alumno, docente o cualquier persona) ─────────────
    persona_nombre       = Column(String, nullable=False)
    persona_identificador = Column(String, nullable=False, index=True)
    # matrícula (alumno) | RFC / nómina (docente) | identificador libre
    persona_tipo         = Column(String, default="ALUMNO", index=True)
    # ALUMNO | DOCENTE | OTRO

    # ── Origen del adeudo ─────────────────────────────────────────────────────
    origen_tipo = Column(String, default="MANUAL")
    # MANUAL             → creado por admin
    # PRESTAMO           → préstamo vencido o no devuelto (auto-generado)
    # INCIDENTE_PRESENCIADO → docente fue testigo en sesión activa
    # REVISION_ENTRADA   → daño detectado al iniciar sesión

    # ── Contexto del incidente ────────────────────────────────────────────────
    laboratorio_id  = Column(Integer, ForeignKey("laboratorios.id"),   nullable=True)
    sesion_id       = Column(Integer, ForeignKey("sesiones_clase.id"), nullable=True)
    computadora_id  = Column(Integer, ForeignKey("computadoras.id"),   nullable=True)
    incidente_id    = Column(Integer, ForeignKey("incidentes.id"),     nullable=True)
    prestamo_id     = Column(Integer, ForeignKey("prestamos.id"),      nullable=True)
    # FK a préstamo: permite sincronización bidireccional automática

    # ── Clasificación ─────────────────────────────────────────────────────────
    tipo        = Column(String, default="DAÑO")
    # DAÑO | PERDIDA | ROBO | PRESTAMO_VENCIDO | PRESTAMO_NO_DEVUELTO | OTRO

    descripcion = Column(String, nullable=False)

    # ── Periodo académico ─────────────────────────────────────────────────────
    cuatrimestre = Column(String, nullable=True, index=True)
    # Ej: "ENE-ABR-2026"

    # ── Estado ───────────────────────────────────────────────────────────────
    estado = Column(String, default="PENDIENTE", index=True)
    # PENDIENTE | EN_REVISION | RESUELTO | EXONERADO

    # ── Monto estimado ────────────────────────────────────────────────────────
    monto_estimado = Column(Float, nullable=True)

    # ── Creación ──────────────────────────────────────────────────────────────
    fecha_reporte    = Column(DateTime, default=_utcnow)
    reportado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    # ── Resolución ────────────────────────────────────────────────────────────
    fecha_resolucion = Column(DateTime, nullable=True)
    resuelto_por_id  = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    notas_resolucion = Column(String,  nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    laboratorio   = relationship("Laboratorio", foreign_keys=[laboratorio_id])
    sesion        = relationship("SesionClase", foreign_keys=[sesion_id])
    computadora   = relationship("Computadora", foreign_keys=[computadora_id])
    prestamo      = relationship("Prestamo",    foreign_keys=[prestamo_id])
    reportado_por = relationship("Usuario",     foreign_keys=[r