import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


def _now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class InsumoLaboratorio(Base):
    """Existencia por laboratorio y lote; los activos reutilizables siguen en inventario patrimonial."""
    __tablename__ = "insumos_laboratorio"

    id = Column(Integer, primary_key=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=False, index=True)
    nombre = Column(String(180), nullable=False)
    categoria = Column(String(40), nullable=False, default="CONSUMIBLE")  # REACTIVO | CONSUMIBLE
    unidad = Column(String(30), nullable=False, default="PIEZA")
    cantidad_disponible = Column(Float, nullable=False, default=0)
    stock_minimo = Column(Float, nullable=False, default=0)
    codigo_cas = Column(String(40), nullable=True)
    lote = Column(String(100), nullable=True)
    caduca_en = Column(Date, nullable=True)
    ubicacion_almacen = Column(String(160), nullable=True)
    ficha_seguridad_url = Column(String(500), nullable=True)
    activo = Column(Boolean, nullable=False, default=True)
    creado_en = Column(DateTime, nullable=False, default=_now)

    laboratorio = relationship("Laboratorio")
    movimientos = relationship("MovimientoInsumoLaboratorio", back_populates="insumo")


class MovimientoInsumoLaboratorio(Base):
    __tablename__ = "movimientos_insumo_laboratorio"

    id = Column(Integer, primary_key=True)
    insumo_id = Column(Integer, ForeignKey("insumos_laboratorio.id"), nullable=False, index=True)
    practica_id = Column(Integer, ForeignKey("practicas_laboratorio.id"), nullable=True, index=True)
    tipo = Column(String(20), nullable=False)  # ENTRADA | ENTREGA | DEVOLUCION | CONSUMO | MERMA | AJUSTE
    cantidad = Column(Float, nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    observaciones = Column(Text, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=_now)

    insumo = relationship("InsumoLaboratorio", back_populates="movimientos")
    usuario = relationship("Usuario", foreign_keys=[usuario_id])


class PlantillaPractica(Base):
    __tablename__ = "plantillas_practica_laboratorio"

    id = Column(Integer, primary_key=True)
    laboratorio_id = Column(Integer, ForeignKey("laboratorios.id"), nullable=False, index=True)
    materia = Column(String(120), nullable=True)
    titulo = Column(String(180), nullable=False)
    objetivo = Column(Text, nullable=True)
    procedimiento = Column(Text, nullable=True)
    notas_seguridad = Column(Text, nullable=True)
    creada_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    activa = Column(Boolean, nullable=False, default=True)
    creada_en = Column(DateTime, nullable=False, default=_now)

    laboratorio = relationship("Laboratorio")
    creada_por = relationship("Usuario", foreign_keys=[creada_por_id])
    materiales = relationship("MaterialPlantillaPractica", back_populates="plantilla", cascade="all, delete-orphan")


class MaterialPlantillaPractica(Base):
    __tablename__ = "materiales_plantilla_practica"

    id = Column(Integer, primary_key=True)
    plantilla_id = Column(Integer, ForeignKey("plantillas_practica_laboratorio.id", ondelete="CASCADE"), nullable=False, index=True)
    insumo_id = Column(Integer, ForeignKey("insumos_laboratorio.id"), nullable=True)
    descripcion = Column(String(180), nullable=False)
    cantidad_base = Column(Float, nullable=False)
    unidad = Column(String(30), nullable=False, default="PIEZA")

    plantilla = relationship("PlantillaPractica", back_populates="materiales")
    insumo = relationship("InsumoLaboratorio")


class PracticaLaboratorio(Base):
    __tablename__ = "practicas_laboratorio"
    __table_args__ = (UniqueConstraint("reservacion_id", "fecha_sesion", name="uq_practica_reservacion_fecha"),)

    id = Column(Integer, primary_key=True)
    reservacion_id = Column(Integer, ForeignKey("reservaciones.id"), nullable=False, index=True)
    practica_origen_id = Column(Integer, ForeignKey("practicas_laboratorio.id"), nullable=True, index=True)
    plan_estado = Column(String(30), nullable=True)
    proposito = Column(String(20), nullable=True)
    incluye_practica = Column(Boolean, nullable=False, default=True, server_default="true")
    participantes = Column(Text, nullable=True)
    fuera_horario = Column(Boolean, nullable=False, default=False, server_default="false")
    fecha_sesion = Column(Date, nullable=False, index=True)
    plantilla_id = Column(Integer, ForeignKey("plantillas_practica_laboratorio.id"), nullable=True)
    titulo = Column(String(180), nullable=False)
    objetivo = Column(Text, nullable=True)
    procedimiento = Column(Text, nullable=True)
    notas_seguridad = Column(Text, nullable=True)
    estado = Column(String(24), nullable=False, default="SOLICITADA")  # SOLICITADA | PREPARADA | EN_CURSO | CERRADA | CANCELADA
    resultados = Column(Text, nullable=True)
    conclusiones = Column(Text, nullable=True)
    observaciones_docente = Column(Text, nullable=True)
    iniciada_en = Column(DateTime, nullable=True)
    cerrada_en = Column(DateTime, nullable=True)
    creada_en = Column(DateTime, nullable=False, default=_now)

    reservacion = relationship("Reservacion")
    plantilla = relationship("PlantillaPractica")
    materiales = relationship("MaterialPractica", back_populates="practica", cascade="all, delete-orphan")
    asistencias = relationship("AsistenciaPractica", back_populates="practica", cascade="all, delete-orphan")
    incidentes = relationship("IncidentePractica", back_populates="practica", cascade="all, delete-orphan")
    residuos = relationship("ResiduoPractica", back_populates="practica", cascade="all, delete-orphan")


class MaterialPractica(Base):
    __tablename__ = "materiales_practica"

    id = Column(Integer, primary_key=True)
    practica_id = Column(Integer, ForeignKey("practicas_laboratorio.id", ondelete="CASCADE"), nullable=False, index=True)
    insumo_id = Column(Integer, ForeignKey("insumos_laboratorio.id"), nullable=True)
    descripcion = Column(String(180), nullable=False)
    cantidad_solicitada = Column(Float, nullable=False)
    cantidad_entregada = Column(Float, nullable=False, default=0)
    cantidad_consumida = Column(Float, nullable=False, default=0)
    cantidad_merma = Column(Float, nullable=False, default=0)
    cantidad_devuelta = Column(Float, nullable=False, default=0)
    unidad = Column(String(30), nullable=False, default="PIEZA")
    nota = Column(Text, nullable=True)

    practica = relationship("PracticaLaboratorio", back_populates="materiales")
    insumo = relationship("InsumoLaboratorio")


class AsistenciaPractica(Base):
    __tablename__ = "asistencias_practica"

    id = Column(Integer, primary_key=True)
    practica_id = Column(Integer, ForeignKey("practicas_laboratorio.id", ondelete="CASCADE"), nullable=False, index=True)
    alumno_id = Column(Integer, ForeignKey("catalogo_alumnos.id"), nullable=False)
    matricula = Column(String(40), nullable=False)
    alumno_nombre = Column(String(180), nullable=False)
    estado = Column(String(20), nullable=False, default="PRESENTE")  # PRESENTE | FALTA | RETARDO | JUSTIFICADA
    observacion = Column(String(300), nullable=True)
    registrado_en = Column(DateTime, nullable=False, default=_now)

    practica = relationship("PracticaLaboratorio", back_populates="asistencias")
    alumno = relationship("CatalogoAlumno")
    __table_args__ = (UniqueConstraint("practica_id", "alumno_id", name="uq_asistencia_practica_alumno"),)


class IncidentePractica(Base):
    __tablename__ = "incidentes_practica"

    id = Column(Integer, primary_key=True)
    practica_id = Column(Integer, ForeignKey("practicas_laboratorio.id", ondelete="CASCADE"), nullable=False, index=True)
    activo_id = Column(Integer, ForeignKey("activos.id"), nullable=True)
    reportado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo = Column(String(30), nullable=False)  # SEGURIDAD | DERRAME | ROTURA | EXPOSICION | EQUIPO | OTRO
    severidad = Column(String(20), nullable=False, default="BAJA")
    estado = Column(String(24), nullable=False, default="REPORTADO")
    descripcion = Column(Text, nullable=False)
    acciones = Column(Text, nullable=True)
    requiere_seguimiento = Column(Boolean, nullable=False, default=False)
    creado_en = Column(DateTime, nullable=False, default=_now)

    practica = relationship("PracticaLaboratorio", back_populates="incidentes")
    activo = relationship("Activo")


class ResiduoPractica(Base):
    __tablename__ = "residuos_practica"

    id = Column(Integer, primary_key=True)
    practica_id = Column(Integer, ForeignKey("practicas_laboratorio.id", ondelete="CASCADE"), nullable=False, index=True)
    reportado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    descripcion = Column(String(300), nullable=False)
    clasificacion = Column(String(30), nullable=False)  # QUIMICO | RPBI | VIDRIO | COMUN | OTRO
    cantidad = Column(Float, nullable=False)
    unidad = Column(String(30), nullable=False)
    destino = Column(Text, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=_now)

    practica = relationship("PracticaLaboratorio", back_populates="residuos")
    reportado_por = relationship("Usuario", foreign_keys=[reportado_por_id])
