from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from database import Base
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class Activo(Base):
    __tablename__ = "activos"

    id = Column(Integer, primary_key=True, index=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=False)
    codigo_inventario = Column(String, unique=True, nullable=False)
    nombre = Column(String, nullable=False)
    categoria = Column(String, nullable=False)
    marca = Column(String, nullable=True)
    modelo = Column(String, nullable=True)
    numero_serie = Column(String, nullable=True)
    fecha_adquisicion = Column(DateTime, nullable=True)
    valor = Column(Float, nullable=True)
    estado = Column(String, default="OPERATIVO")
    especificaciones = Column(String, nullable=True)
    foto_url = Column(String, nullable=True)
    observaciones = Column(String, nullable=True)
    resguardo_nombre = Column(String, nullable=True)   # Responsable del bien
    area = Column(String, nullable=True)               # Área/departamento físico
    activo = Column(Boolean, default=True)

    laboratorio              = relationship("Laboratorio", back_populates="activos")
    prestamos                = relationship("Prestamo",   back_populates="activo")
    incidentes               = relationship("Incidente",  back_populates="activo")
    mantenimientos_preventivos = relationship("MantenimientoPreventivo", back_populates="activo")

class Prestamo(Base):
    __tablename__ = "prestamos"

    id = Column(Integer, primary_key=True, index=True)
    activo_id = Column(Integer, ForeignKey("activos.id"), nullable=False)
    solicitante_nombre = Column(String, nullable=False)
    solicitante_id_escolar = Column(String, nullable=False)
    docente_responsable_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    autorizado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_salida = Column(DateTime, default=_utcnow)
    fecha_retorno_esperada = Column(DateTime, nullable=False)
    fecha_retorno_real = Column(DateTime, nullable=True)
    estado = Column(String, default="ACTIVO")
    condicion_salida = Column(String, default="BUENO")
    condicion_retorno = Column(String, nullable=True)
    observaciones_salida = Column(String, nullable=True)
    observaciones_retorno = Column(String, nullable=True)

    activo = relationship("Activo", back_populates="prestamos")


class Incidente(Base):
    """Registro de daños y seguimiento de mantenimiento de activos."""
    __tablename__ = "incidentes"

    id = Column(Integer, primary_key=True, index=True)

    # Referencia al activo de inventario (puede ser None si es PC de cómputo)
    activo_id       = Column(Integer, ForeignKey("activos.id"),       nullable=True)
    # Referencia a PC de laboratorio (puede ser None si es activo de inventario)
    computadora_id  = Column(Integer, ForeignKey("computadoras.id"),  nullable=True)
    # Laboratorio donde ocurrió (siempre presente)
    laboratorio_id  = Column(Integer, ForeignKey("laboratorios.id"),  nullable=True)

    # Origen del reporte
    origen    = Column(String, default="MANUAL")  # PRESTAMO | SESION | MANUAL
    origen_id = Column(Integer, nullable=True)    # id de préstamo o sesión

    # Tipo e información del incidente
    tipo        = Column(String, default="DAÑO")   # DAÑO | MANTENIMIENTO | PERDIDA | OTRO
    descripcion = Column(String, nullable=True)

    # Quién reportó
    reportado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    fecha_reporte    = Column(DateTime, default=_utcnow)

    # Seguimiento
    estado             = Column(String, default="PENDIENTE")  # PENDIENTE | EN_REVISION | REPARADO | DADO_DE_BAJA
    prioridad          = Column(String, default="MEDIA")      # ALTA | MEDIA | BAJA
    notas_seguimiento  = Column(String, nullable=True)
    fecha_resolucion   = Column(DateTime, nullable=True)
    costo_reparacion   = Column(Float, nullable=True)

    activo = relationship("Activo", back_populates="incidentes")


class MantenimientoPreventivo(Base):
    """Plan y registro de mantenimientos preventivos programados."""
    __tablename__ = "mantenimientos_preventivos"

    id = Column(Integer, primary_key=True, index=True)

    # Qué equipo
    activo_id      = Column(Integer, ForeignKey("activos.id"),      nullable=True)
    computadora_id = Column(Integer, ForeignKey("computadoras.id"), nullable=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=True)

    # Clasificación
    tipo = Column(String, nullable=False)
    # LIMPIEZA_FISICA | REVISION_SOFTWARE | ACTUALIZACION | REVISION_HARDWARE |
    # FORMATEO | RESPALDO | INSPECCION | OTRO

    # Programación
    periodicidad   = Column(String, default="TRIMESTRAL")
    # SEMANAL | MENSUAL | TRIMESTRAL | SEMESTRAL | ANUAL | UNICO
    fecha_programada = Column(DateTime, nullable=False)
    fecha_limite     = Column(DateTime, nullable=True)   # alarma de vencimiento

    # Ejecución
    estado           = Column(String, default="PENDIENTE")
    # PENDIENTE | EN_PROCESO | COMPLETADO | OMITIDO
    fecha_inicio     = Column(DateTime, nullable=True)
    fecha_completado = Column(DateTime, nullable=True)
    completado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    # Detalle
    descripcion  = Column(String, nullable=True)   # qué se hará
    checklist    = Column(String, nullable=True)   # JSON: ["tarea1","tarea2",...]
    notas_result = Column(String, nullable=True)   # observaciones al completar
    costo        = Column(Float,  nullable=True)
    duracion_min = Column(Integer, nullable=True)  # tiempo empleado en minutos

    fecha_creacion = Column(DateTime, default=_utcnow)

    activo = relationship("Activo", back_populates="mantenimientos_preventivos")
