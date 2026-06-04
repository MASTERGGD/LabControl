from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from database import Base
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class UbicacionInventario(Base):
    __tablename__ = "ubicaciones_inventario"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False, index=True)
    tipo = Column(String(40), nullable=False, default="OFICINA")
    edificio = Column(String(120), nullable=True)
    piso = Column(String(40), nullable=True)
    referencia = Column(String(250), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    creado_en = Column(DateTime, default=_utcnow, nullable=False)

    departamento = relationship("Departamento")
    activos = relationship("Activo", back_populates="ubicacion")


class Activo(Base):
    __tablename__ = "activos"

    id = Column(Integer, primary_key=True, index=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    ubicacion_id = Column(Integer, ForeignKey("ubicaciones_inventario.id"), nullable=True)
    responsable_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    alcance = Column(String, default="LABORATORIO", nullable=False)
    tipo_inventario = Column(String, default="ACTIVO", nullable=False)  # ACTIVO patrimonial individual
    estado_admin = Column(String, default="VALIDADO", nullable=False)  # BORRADOR | EN_REVISION | OBSERVADO | VALIDADO | RECHAZADO | BAJA_SOLICITADA
    codigo_inventario = Column(String, unique=True, nullable=False)
    nombre = Column(String, nullable=False)
    categoria = Column(String, nullable=False)
    marca = Column(String, nullable=True)
    modelo = Column(String, nullable=True)
    numero_serie = Column(String, nullable=True)
    fecha_adquisicion = Column(DateTime, nullable=True)
    valor = Column(Float, nullable=True)
    cantidad = Column(Float, default=1, nullable=False)
    unidad_medida = Column(String, default="PIEZA", nullable=False)
    stock_minimo = Column(Float, nullable=True)
    estado = Column(String, default="OPERATIVO")
    especificaciones = Column(String, nullable=True)
    foto_url = Column(String, nullable=True)
    observaciones = Column(String, nullable=True)
    resguardo_nombre = Column(String, nullable=True)   # Responsable del bien
    area = Column(String, nullable=True)               # Área/departamento físico
    ubicacion_tipo = Column(String, nullable=True)
    ubicacion_nombre = Column(String, nullable=True)
    activo = Column(Boolean, default=True)

    laboratorio              = relationship("Laboratorio", back_populates="activos")
    departamento             = relationship("Departamento", foreign_keys=[departamento_id])
    ubicacion                = relationship("UbicacionInventario", back_populates="activos")
    responsable              = relationship("Usuario", foreign_keys=[responsable_id])
    movimientos              = relationship("MovimientoInventario", back_populates="activo")
    prestamos                = relationship("Prestamo",   back_populates="activo")
    incidentes               = relationship("Incidente",  back_populates="activo")
    mantenimientos_preventivos = relationship("MantenimientoPreventivo", back_populates="activo")


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id = Column(Integer, primary_key=True, index=True)
    activo_id = Column(Integer, ForeignKey("activos.id"), nullable=False, index=True)
    tipo = Column(String, nullable=False)
    estado = Column(String, default="SOLICITADO", nullable=False)

    departamento_origen_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    departamento_destino_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    ubicacion_origen_id = Column(Integer, ForeignKey("ubicaciones_inventario.id"), nullable=True)
    ubicacion_destino_id = Column(Integer, ForeignKey("ubicaciones_inventario.id"), nullable=True)
    resguardante_origen_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    resguardante_destino_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    ubicacion_origen_nombre = Column(String, nullable=True)
    ubicacion_destino_nombre = Column(String, nullable=True)
    resguardante_origen_nombre = Column(String, nullable=True)
    resguardante_destino_nombre = Column(String, nullable=True)

    cantidad = Column(Float, nullable=True)
    solicitado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    autorizado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    entregado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    recibido_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    fecha_solicitud = Column(DateTime, default=_utcnow, nullable=False)
    fecha_autorizacion = Column(DateTime, nullable=True)
    fecha_entrega = Column(DateTime, nullable=True)
    fecha_recepcion = Column(DateTime, nullable=True)
    observaciones = Column(String, nullable=True)
    evidencia_url = Column(String, nullable=True)

    activo = relationship("Activo", back_populates="movimientos")
    departamento_origen = relationship("Departamento", foreign_keys=[departamento_origen_id])
    departamento_destino = relationship("Departamento", foreign_keys=[departamento_destino_id])
    ubicacion_origen = relationship("UbicacionInventario", foreign_keys=[ubicacion_origen_id])
    ubicacion_destino = relationship("UbicacionInventario", foreign_keys=[ubicacion_destino_id])
    resguardante_origen = relationship("Usuario", foreign_keys=[resguardante_origen_id])
    resguardante_destino = relationship("Usuario", foreign_keys=[resguardante_destino_id])
    solicitado_por = relationship("Usuario", foreign_keys=[solicitado_por_id])
    autorizado_por = relationship("Usuario", foreign_keys=[autorizado_por_id])
    entregado_por = relationship("Usuario", foreign_keys=[entregado_por_id])
    recibido_por = relationship("Usuario", foreign_keys=[recibido_por_id])


class SolicitudBajaInventario(Base):
    __tablename__ = "solicitudes_baja_inventario"

    id = Column(Integer, primary_key=True, index=True)
    activo_id = Column(Integer, ForeignKey("activos.id"), nullable=False, index=True)
    estado = Column(String, default="SOLICITADA", nullable=False)
    motivo = Column(String, nullable=False)
    diagnostico = Column(String, nullable=True)
    evidencia_url = Column(String, nullable=True)
    destino_final = Column(String, nullable=True)
    observaciones = Column(String, nullable=True)
    solicitado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    revisado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    validado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    ejecutado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    fecha_solicitud = Column(DateTime, default=_utcnow, nullable=False)
    fecha_revision = Column(DateTime, nullable=True)
    fecha_validacion = Column(DateTime, nullable=True)
    fecha_ejecucion = Column(DateTime, nullable=True)

    activo = relationship("Activo")
    solicitado_por = relationship("Usuario", foreign_keys=[solicitado_por_id])
    revisado_por = relationship("Usuario", foreign_keys=[revisado_por_id])
    validado_por = relationship("Usuario", foreign_keys=[validado_por_id])
    ejecutado_por = relationship("Usuario", foreign_keys=[ejecutado_por_id])


class LevantamientoInventario(Base):
    __tablename__ = "levantamientos_inventario"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    estado = Column(String, default="ABIERTO", nullable=False)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=True)
    fecha_inicio = Column(DateTime, default=_utcnow, nullable=False)
    fecha_cierre = Column(DateTime, nullable=True)
    creado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    observaciones = Column(String, nullable=True)

    departamento = relationship("Departamento")
    laboratorio = relationship("Laboratorio")
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])


class RevisionLevantamientoInventario(Base):
    __tablename__ = "revisiones_levantamiento_inventario"

    id = Column(Integer, primary_key=True, index=True)
    levantamiento_id = Column(Integer, ForeignKey("levantamientos_inventario.id"), nullable=False, index=True)
    activo_id = Column(Integer, ForeignKey("activos.id"), nullable=False, index=True)
    estado = Column(String, nullable=False)
    ubicacion_reportada = Column(String, nullable=True)
    resguardante_reportado = Column(String, nullable=True)
    observaciones = Column(String, nullable=True)
    evidencia_url = Column(String, nullable=True)
    revisado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_revision = Column(DateTime, default=_utcnow, nullable=False)

    levantamiento = relationship("LevantamientoInventario")
    activo = relationship("Activo")
    revisado_por = relationship("Usuario", foreign_keys=[revisado_por_id])

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

    activo         = relationship("Activo", back_populates="prestamos")
    docente_responsable = relationship("Usuario", foreign_keys=[docente_responsable_id])
    autorizado          = relationship("Usuario", foreign_keys=[autorizado_por])


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

    activo         = relationship("Activo", back_populates="incidentes")
    computadora    = relationship("Computadora", back_populates="incidentes")
    laboratorio    = relationship("Laboratorio", back_populates="incidentes")
    reportado_por  = relationship("Usuario", foreign_keys=[reportado_por_id])


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

    activo         = relationship("Activo", back_populates="mantenimientos_preventivos")
    computadora    = relationship("Computadora")
    laboratorio    = relationship("Laboratorio")
    completado_por = relationship("Usuario", foreign_keys=[completado_por_id])
