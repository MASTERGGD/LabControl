import datetime

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class CargaDocente(Base):
    __tablename__ = "cargas_docentes"

    id = Column(Integer, primary_key=True)
    docente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    periodo_id = Column(Integer, ForeignKey("periodos_escolares.id"), nullable=False, index=True)
    grupo_academico_id = Column(Integer, ForeignKey("grupos_academicos.id"), nullable=True, index=True)
    materia_id = Column(Integer, ForeignKey("catalogo_materias.id"), nullable=True)
    tipo_actividad = Column(String(20), nullable=False, default="CLASE")
    actividad_nombre = Column(String(200), nullable=False)
    dia_semana = Column(Integer, nullable=False)
    hora_inicio = Column(String(5), nullable=False)
    hora_fin = Column(String(5), nullable=False)
    espacio_nombre = Column(String(180), nullable=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=True)
    estado = Column(String(25), nullable=False, default="BORRADOR")
    observaciones = Column(Text, nullable=True)
    activo = Column(Boolean, nullable=False, default=True)
    creado_en = Column(DateTime, nullable=False, default=_utcnow)
    actualizado_en = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    docente = relationship("Usuario")
    periodo = relationship("PeriodoEscolar")
    grupo_academico = relationship("GrupoAcademico")
    materia = relationship("CatalogoMateria")
    laboratorio = relationship("Laboratorio")
    clases = relationship("ClaseDocente", back_populates="carga")


class ClaseDocente(Base):
    __tablename__ = "clases_docentes"
    __table_args__ = (
        UniqueConstraint("carga_docente_id", "fecha", name="uq_clase_carga_fecha"),
    )

    id = Column(Integer, primary_key=True)
    carga_docente_id = Column(Integer, ForeignKey("cargas_docentes.id"), nullable=False, index=True)
    fecha = Column(Date, nullable=False, index=True)
    estado = Column(String(20), nullable=False, default="ABIERTA")
    inicio = Column(DateTime, nullable=False, default=_utcnow)
    fin = Column(DateTime, nullable=True)
    observacion_general = Column(Text, nullable=True)
    tema_impartido = Column(String(300), nullable=True)
    avance_planeacion = Column(Integer, nullable=True)
    actividades_realizadas = Column(Text, nullable=True)
    tarea_asignada = Column(Text, nullable=True)
    incidencias = Column(Text, nullable=True)
    tema_pendiente = Column(Text, nullable=True)

    carga = relationship("CargaDocente", back_populates="clases")
    asistencias = relationship("AsistenciaDocente", back_populates="clase", cascade="all, delete-orphan")


class AsistenciaDocente(Base):
    __tablename__ = "asistencias_docentes"
    __table_args__ = (
        UniqueConstraint("clase_docente_id", "alumno_id", name="uq_asistencia_clase_alumno"),
    )

    id = Column(Integer, primary_key=True)
    clase_docente_id = Column(Integer, ForeignKey("clases_docentes.id"), nullable=False, index=True)
    alumno_id = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, index=True)
    estado = Column(String(20), nullable=False, default="PRESENTE")
    observacion = Column(Text, nullable=True)
    actualizado_en = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    clase = relationship("ClaseDocente", back_populates="asistencias")
    alumno = relationship("CatalogoAlumno")


class JustificacionAsistenciaDocente(Base):
    __tablename__ = "justificaciones_asistencia_docente"

    id = Column(Integer, primary_key=True)
    docente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    carga_docente_id = Column(Integer, ForeignKey("cargas_docentes.id"), nullable=False, index=True)
    alumno_id = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, index=True)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    motivo = Column(Text, nullable=False)
    folio = Column(String(100), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=_utcnow)

    docente = relationship("Usuario")
    carga = relationship("CargaDocente")
    alumno = relationship("CatalogoAlumno")
    detalles = relationship(
        "DetalleJustificacionAsistencia", back_populates="justificacion",
        cascade="all, delete-orphan",
    )


class DetalleJustificacionAsistencia(Base):
    __tablename__ = "detalles_justificacion_asistencia"
    __table_args__ = (
        UniqueConstraint(
            "justificacion_id", "asistencia_id",
            name="uq_detalle_justificacion_asistencia",
        ),
    )

    id = Column(Integer, primary_key=True)
    justificacion_id = Column(
        Integer, ForeignKey("justificaciones_asistencia_docente.id"),
        nullable=False, index=True,
    )
    asistencia_id = Column(
        Integer, ForeignKey("asistencias_docentes.id"), nullable=False, index=True,
    )
    estado_anterior = Column(String(20), nullable=False)
    estado_nuevo = Column(String(20), nullable=False, default="JUSTIFICADA")
    creado_en = Column(DateTime, nullable=False, default=_utcnow)

    justificacion = relationship(
        "JustificacionAsistenciaDocente", back_populates="detalles",
    )
    asistencia = relationship("AsistenciaDocente")


class SeguimientoAlumnoDocente(Base):
    __tablename__ = "seguimientos_alumnos_docente"

    id = Column(Integer, primary_key=True)
    docente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    carga_docente_id = Column(Integer, ForeignKey("cargas_docentes.id"), nullable=False, index=True)
    alumno_id = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False, index=True)
    tipo = Column(String(25), nullable=False)
    titulo = Column(String(180), nullable=False)
    detalle = Column(Text, nullable=True)
    calificacion = Column(Float, nullable=True)
    estado = Column(String(20), nullable=False, default="REGISTRADO")
    fecha_revision = Column(Date, nullable=True)
    resultado_atencion = Column(Text, nullable=True)
    atendido_en = Column(DateTime, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=_utcnow)

    docente = relationship("Usuario")
    carga = relationship("CargaDocente")
    alumno = relationship("CatalogoAlumno")
