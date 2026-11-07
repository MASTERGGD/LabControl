import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.catalogo import CatalogoAlumno, GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.docencia import CargaDocente
from models.horario import Reservacion
from models.inventario import Activo, Incidente, Prestamo
from models.laboratorio import Laboratorio
from models.practica_laboratorio import (
    AsistenciaPractica, IncidentePractica, InsumoLaboratorio,
    MaterialPlantillaPractica, MaterialPractica, MovimientoInsumoLaboratorio,
    PlantillaPractica, PracticaLaboratorio, ResiduoPractica,
)
from models.usuario import RolUsuario, Usuario
from routers.notificaciones import crear_notificacion
from services.calendario_academico import estado_fecha_academica
from services.timezone import now_mx


router = APIRouter(prefix="/practicas-laboratorio", tags=["Prácticas de laboratorio"])
RESPONSABLES = {RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB}
DOCENTES = RESPONSABLES | {RolUsuario.DOCENTE}


class InsumoCreate(BaseModel):
    laboratorio_id: int
    nombre: str = Field(..., min_length=2, max_length=180)
    categoria: str = Field(default="CONSUMIBLE", pattern="^(REACTIVO|CONSUMIBLE)$")
    unidad: str = Field(default="PIEZA", max_length=30)
    cantidad_disponible: float = Field(default=0, ge=0)
    stock_minimo: float = Field(default=0, ge=0)
    codigo_cas: Optional[str] = Field(None, max_length=40)
    lote: Optional[str] = Field(None, max_length=100)
    caduca_en: Optional[datetime.date] = None
    ubicacion_almacen: Optional[str] = Field(None, max_length=160)
    ficha_seguridad_url: Optional[str] = Field(None, max_length=500)


class InsumoAjuste(BaseModel):
    cantidad: float = Field(..., gt=0)
    observaciones: Optional[str] = Field(None, max_length=1000)


class MaterialCreate(BaseModel):
    insumo_id: Optional[int] = None
    descripcion: str = Field(..., min_length=1, max_length=180)
    cantidad_solicitada: float = Field(..., gt=0)
    unidad: str = Field(default="PIEZA", max_length=30)
    nota: Optional[str] = Field(None, max_length=1000)


class PracticaCreate(BaseModel):
    reservacion_id: int
    fecha_sesion: Optional[datetime.date] = None
    plantilla_id: Optional[int] = None
    titulo: Optional[str] = Field(None, min_length=2, max_length=180)
    objetivo: Optional[str] = None
    procedimiento: Optional[str] = None
    notas_seguridad: Optional[str] = None
    materiales: list[MaterialCreate] = Field(default_factory=list, max_length=80)


class PlantillaCreate(BaseModel):
    laboratorio_id: int
    materia: Optional[str] = Field(None, max_length=120)
    titulo: str = Field(..., min_length=2, max_length=180)
    objetivo: Optional[str] = None
    procedimiento: Optional[str] = None
    notas_seguridad: Optional[str] = None
    materiales: list[MaterialCreate] = Field(default_factory=list, max_length=80)


class PlantillaDesdePractica(BaseModel):
    materia: Optional[str] = Field(None, max_length=120)
    notas_seguridad: Optional[str] = None


class EntregaItem(BaseModel):
    material_id: int
    cantidad_entregada: float = Field(..., ge=0)


class PrepararBody(BaseModel):
    materiales: list[EntregaItem]
    nota: Optional[str] = None


class AsistenciaItem(BaseModel):
    alumno_id: int
    estado: str = Field(..., pattern="^(PRESENTE|FALTA|RETARDO|JUSTIFICADA)$")
    observacion: Optional[str] = Field(None, max_length=300)


class AsistenciaBody(BaseModel):
    alumnos: list[AsistenciaItem] = Field(..., min_length=1, max_length=500)


class CerrarBody(BaseModel):
    resultados: Optional[str] = None
    conclusiones: Optional[str] = None
    observaciones_docente: Optional[str] = None
    materiales: list[dict] = Field(default_factory=list)


class IncidenteBody(BaseModel):
    tipo: str = Field(..., pattern="^(SEGURIDAD|DERRAME|ROTURA|EXPOSICION|EQUIPO|OTRO)$")
    severidad: str = Field(default="BAJA", pattern="^(BAJA|MEDIA|ALTA|CRITICA)$")
    descripcion: str = Field(..., min_length=4, max_length=5000)
    acciones: Optional[str] = None
    requiere_seguimiento: bool = False
    activo_id: Optional[int] = None


class IncidenteSeguimientoBody(BaseModel):
    estado: str = Field(..., pattern="^(EN_SEGUIMIENTO|RESUELTO)$")
    acciones: Optional[str] = None


class ResiduoBody(BaseModel):
    descripcion: str = Field(..., min_length=2, max_length=300)
    clasificacion: str = Field(..., pattern="^(QUIMICO|RPBI|VIDRIO|COMUN|OTRO)$")
    cantidad: float = Field(..., gt=0)
    unidad: str = Field(..., min_length=1, max_length=30)
    destino: Optional[str] = None


def _lab_para_usuario(db: Session, lab_id: int, user: Usuario) -> Laboratorio:
    lab = db.query(Laboratorio).filter(Laboratorio.id == lab_id, Laboratorio.activo == True).first()
    if not lab:
        raise HTTPException(404, "Laboratorio no encontrado.")
    if (lab.categoria or "").upper() not in {"QUIMICA", "AGROINDUSTRIA"}:
        raise HTTPException(400, "Este flujo aplica a laboratorios de Química y Agroindustria.")
    if user.rol != RolUsuario.SUPER_ADMIN and user.laboratorio_id != lab_id and user.rol != RolUsuario.DOCENTE:
        raise HTTPException(403, "No tienes acceso a este laboratorio.")
    return lab


def _get_practica(db: Session, practica_id: int, user: Usuario, responsable=False):
    p = db.query(PracticaLaboratorio).join(Reservacion).filter(PracticaLaboratorio.id == practica_id).first()
    if not p:
        raise HTTPException(404, "Práctica no encontrada.")
    r = p.reservacion
    if responsable:
        if user.rol not in RESPONSABLES or (user.rol != RolUsuario.SUPER_ADMIN and user.laboratorio_id != r.laboratorio_id):
            raise HTTPException(403, "Solo el responsable del laboratorio puede realizar esta acción.")
    elif user.rol == RolUsuario.DOCENTE and r.docente_id != user.id:
        raise HTTPException(403, "Solo puedes consultar tus propias prácticas.")
    elif user.rol in RESPONSABLES and user.rol != RolUsuario.SUPER_ADMIN and user.laboratorio_id != r.laboratorio_id:
        raise HTTPException(403, "No tienes acceso a este laboratorio.")
    elif user.rol not in DOCENTES:
        raise HTTPException(403, "No tienes acceso a prácticas de laboratorio.")
    return p


def _serialize_insumo(i: InsumoLaboratorio):
    return {"id": i.id, "laboratorio_id": i.laboratorio_id, "nombre": i.nombre, "categoria": i.categoria,
            "unidad": i.unidad, "cantidad_disponible": i.cantidad_disponible, "stock_minimo": i.stock_minimo,
            "codigo_cas": i.codigo_cas, "lote": i.lote, "caduca_en": i.caduca_en.isoformat() if i.caduca_en else None,
            "ubicacion_almacen": i.ubicacion_almacen, "ficha_seguridad_url": i.ficha_seguridad_url,
            "activo": i.activo, "stock_bajo": i.cantidad_disponible <= i.stock_minimo,
            "caducado": bool(i.caduca_en and i.caduca_en < datetime.date.today())}


def _serialize(p: PracticaLaboratorio, db: Session):
    r = p.reservacion
    bloque = db.query(Reservacion).filter(
        Reservacion.bloque_reserva_id == r.bloque_reserva_id
    ).all() if r.bloque_reserva_id else [r]
    horarios_bloque = [item.horario for item in bloque if item.horario]
    hora_inicio = min((item.hora_inicio for item in horarios_bloque), default=None)
    hora_fin = max((item.hora_fin for item in horarios_bloque), default=None)
    carga = r.carga_docente
    grupo_academico = carga.grupo_academico if carga else None
    clase_docente = next(
        (clase for clase in carga.clases if clase.fecha == p.fecha_sesion),
        None,
    ) if carga else None
    return {
        "id": p.id, "reservacion_id": r.id, "laboratorio_id": r.laboratorio_id,
        "laboratorio_nombre": r.laboratorio.nombre if r.laboratorio else None,
        "docente_id": r.docente_id, "docente_nombre": r.docente.nombre if r.docente else None,
        "materia": r.materia, "grupo": r.grupo, "fecha": p.fecha_sesion.isoformat() if p.fecha_sesion else None,
        "bloque_reserva_id": r.bloque_reserva_id,
        "reservacion_ids": [item.id for item in bloque],
        "carga_docente_id": r.carga_docente_id,
        "grupo_academico_id": grupo_academico.id if grupo_academico else None,
        "grupo_academico_periodo": grupo_academico.periodo.clave if grupo_academico and grupo_academico.periodo else None,
        "clase_docente_id": clase_docente.id if clase_docente else None,
        "clase_docente_estado": clase_docente.estado if clase_docente else None,
        "hora_inicio": hora_inicio,
        "hora_fin": hora_fin,
        "titulo": p.titulo, "objetivo": p.objetivo, "procedimiento": p.procedimiento,
        "notas_seguridad": p.notas_seguridad, "estado": p.estado,
        "plantilla_id": p.plantilla_id,
        "resultados": p.resultados, "conclusiones": p.conclusiones, "observaciones_docente": p.observaciones_docente,
        "iniciada_en": p.iniciada_en.isoformat() if p.iniciada_en else None,
        "cerrada_en": p.cerrada_en.isoformat() if p.cerrada_en else None,
        "materiales": [{"id": m.id, "insumo_id": m.insumo_id, "descripcion": m.descripcion,
                        "cantidad_solicitada": m.cantidad_solicitada, "cantidad_entregada": m.cantidad_entregada,
                        "cantidad_consumida": m.cantidad_consumida, "cantidad_merma": m.cantidad_merma,
                        "cantidad_devuelta": m.cantidad_devuelta, "unidad": m.unidad, "nota": m.nota,
                        "existencia": m.insumo.cantidad_disponible if m.insumo else None} for m in p.materiales],
        "asistencias": [{"alumno_id": a.alumno_id, "matricula": a.matricula, "alumno_nombre": a.alumno_nombre,
                         "estado": a.estado, "observacion": a.observacion} for a in p.asistencias],
        "incidentes": [{"id": i.id, "tipo": i.tipo, "severidad": i.severidad, "descripcion": i.descripcion,
                         "activo_id": i.activo_id, "activo_nombre": i.activo.nombre if i.activo else None,
                         "estado": i.estado, "acciones": i.acciones, "requiere_seguimiento": i.requiere_seguimiento,
                         "creado_en": i.creado_en.isoformat()} for i in p.incidentes],
        "residuos": [{"id": x.id, "descripcion": x.descripcion, "clasificacion": x.clasificacion,
                       "cantidad": x.cantidad, "unidad": x.unidad, "destino": x.destino,
                       "reportado_por": x.reportado_por.nombre if x.reportado_por else None,
                       "creado_en": x.creado_en.isoformat()} for x in p.residuos],
    }


@router.get("/insumos")
def listar_insumos(laboratorio_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol not in DOCENTES:
        raise HTTPException(403, "Sin permiso para consultar insumos.")
    _lab_para_usuario(db, laboratorio_id, user)
    q = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.laboratorio_id == laboratorio_id, InsumoLaboratorio.activo == True)
    return [_serialize_insumo(i) for i in q.order_by(InsumoLaboratorio.nombre).all()]


@router.get("/catalogo-materiales")
def catalogo_materiales(laboratorio_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    """Catálogo docente con existencias orientativas, sin datos patrimoniales privados."""
    if user.rol not in DOCENTES:
        raise HTTPException(403, "Sin permiso para consultar materiales.")
    _lab_para_usuario(db, laboratorio_id, user)
    hoy = now_mx().date()
    insumos = db.query(InsumoLaboratorio).filter(
        InsumoLaboratorio.laboratorio_id == laboratorio_id, InsumoLaboratorio.activo == True
    ).order_by(InsumoLaboratorio.nombre).all()
    catalogo = []
    for i in insumos:
        caducado = bool(i.caduca_en and i.caduca_en < hoy)
        catalogo.append({"clave": f"insumo:{i.id}", "insumo_id": i.id, "activo_id": None,
            "nombre": i.nombre, "codigo": i.codigo_cas or "", "tipo": "REACTIVO" if i.categoria == "REACTIVO" else "MATERIAL",
            "unidad": i.unidad, "existencia": i.cantidad_disponible,
            "disponible": 0 if caducado else i.cantidad_disponible,
            "estado": "Caducado" if caducado else "Sin existencias" if i.cantidad_disponible <= 0 else "Disponible",
            "caduca_en": i.caduca_en.isoformat() if i.caduca_en else None})
    activos = db.query(Activo).filter(Activo.laboratorio_id == laboratorio_id,
        Activo.activo == True, Activo.estado_admin == "VALIDADO").order_by(Activo.nombre).all()
    prestados = set(x[0] for x in db.query(Prestamo.activo_id).join(Activo).filter(
        Activo.laboratorio_id == laboratorio_id, Prestamo.estado.in_(["ACTIVO", "VENCIDO"])
    ).all())
    for a in activos:
        operativo = a.estado == "OPERATIVO" and a.id not in prestados
        cantidad = max(0, a.cantidad or 0)
        catalogo.append({"clave": f"activo:{a.id}", "insumo_id": None, "activo_id": a.id,
            "nombre": a.nombre, "codigo": a.codigo_inventario, "tipo": "EQUIPO",
            "unidad": a.unidad_medida, "existencia": cantidad,
            "disponible": cantidad if operativo else 0,
            "estado": "En préstamo" if a.id in prestados else "Disponible" if operativo else a.estado,
            "caduca_en": None})
    return catalogo


@router.post("/insumos", status_code=201)
def crear_insumo(data: InsumoCreate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol not in RESPONSABLES:
        raise HTTPException(403, "Solo el responsable del laboratorio puede administrar existencias.")
    _lab_para_usuario(db, data.laboratorio_id, user)
    i = InsumoLaboratorio(**data.model_dump())
    db.add(i); db.flush()
    if i.cantidad_disponible > 0:
        db.add(MovimientoInsumoLaboratorio(insumo_id=i.id, tipo="ENTRADA", cantidad=i.cantidad_disponible,
                                           usuario_id=user.id, observaciones="Existencia inicial"))
    db.commit(); db.refresh(i)
    return _serialize_insumo(i)


@router.post("/insumos/{insumo_id}/entrada")
def entrada_insumo(insumo_id: int, data: InsumoAjuste, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol not in RESPONSABLES:
        raise HTTPException(403, "Solo el responsable puede registrar entradas.")
    i = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.id == insumo_id).first()
    if not i: raise HTTPException(404, "Insumo no encontrado.")
    _lab_para_usuario(db, i.laboratorio_id, user)
    i.cantidad_disponible += data.cantidad
    db.add(MovimientoInsumoLaboratorio(insumo_id=i.id, tipo="ENTRADA", cantidad=data.cantidad,
                                       usuario_id=user.id, observaciones=data.observaciones))
    db.commit(); db.refresh(i)
    return _serialize_insumo(i)


@router.get("/insumos/{insumo_id}/movimientos")
def historial_insumo(insumo_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    i = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.id == insumo_id).first()
    if not i: raise HTTPException(404, "Insumo no encontrado.")
    if user.rol not in DOCENTES: raise HTTPException(403, "Sin permiso para ver la bitácora.")
    _lab_para_usuario(db, i.laboratorio_id, user)
    rows = db.query(MovimientoInsumoLaboratorio).filter(MovimientoInsumoLaboratorio.insumo_id == i.id).order_by(MovimientoInsumoLaboratorio.creado_en.desc()).limit(100).all()
    return [{"id": x.id, "tipo": x.tipo, "cantidad": x.cantidad, "practica_id": x.practica_id,
             "usuario": x.usuario.nombre if x.usuario else None, "observaciones": x.observaciones,
             "creado_en": x.creado_en.isoformat()} for x in rows]


@router.get("/resumen")
def resumen_laboratorio(laboratorio_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol not in RESPONSABLES: raise HTTPException(403, "Solo responsables pueden consultar el resumen del laboratorio.")
    _lab_para_usuario(db, laboratorio_id, user)
    practicas = db.query(PracticaLaboratorio).join(Reservacion).filter(Reservacion.laboratorio_id == laboratorio_id).all()
    insumos = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.laboratorio_id == laboratorio_id, InsumoLaboratorio.activo == True).all()
    return {
        "practicas_total": len(practicas),
        "practicas_solicitadas": sum(p.estado == "SOLICITADA" for p in practicas),
        "practicas_en_curso": sum(p.estado == "EN_CURSO" for p in practicas),
        "practicas_cerradas": sum(p.estado == "CERRADA" for p in practicas),
        "incidentes": sum(len(p.incidentes) for p in practicas),
        "stock_bajo": sum(i.cantidad_disponible <= i.stock_minimo for i in insumos),
        "insumos_caducados": sum(bool(i.caduca_en and i.caduca_en < datetime.date.today()) for i in insumos),
        "cantidad_consumida": round(sum(m.cantidad_consumida for p in practicas for m in p.materiales), 3),
        "mermas": round(sum(m.cantidad_merma for p in practicas for m in p.materiales), 3),
    }


@router.get("")
def listar_practicas(laboratorio_id: Optional[int] = None, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol not in DOCENTES:
        raise HTTPException(403, "Sin permiso para consultar prácticas.")
    q = db.query(PracticaLaboratorio).join(Reservacion)
    if user.rol == RolUsuario.DOCENTE:
        q = q.filter(Reservacion.docente_id == user.id)
    elif user.rol != RolUsuario.SUPER_ADMIN:
        q = q.filter(Reservacion.laboratorio_id == user.laboratorio_id)
    elif laboratorio_id:
        q = q.filter(Reservacion.laboratorio_id == laboratorio_id)
    return [_serialize(p, db) for p in q.order_by(PracticaLaboratorio.fecha_sesion.desc(), PracticaLaboratorio.id.desc()).limit(200).all()]


def _serialize_plantilla(t: PlantillaPractica):
    return {"id": t.id, "laboratorio_id": t.laboratorio_id, "materia": t.materia, "titulo": t.titulo,
            "objetivo": t.objetivo, "procedimiento": t.procedimiento, "notas_seguridad": t.notas_seguridad,
            "materiales": [{"insumo_id": m.insumo_id, "descripcion": m.descripcion,
                            "cantidad_solicitada": m.cantidad_base, "unidad": m.unidad}
                           for m in t.materiales]}


@router.get("/guias")
def listar_guias(laboratorio_id: Optional[int] = None, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol not in DOCENTES: raise HTTPException(403, "Sin permiso para consultar guías.")
    q = db.query(PlantillaPractica).filter(PlantillaPractica.activa == True)
    if user.rol == RolUsuario.DOCENTE:
        if laboratorio_id is None: return []
        _lab_para_usuario(db, laboratorio_id, user)
        q = q.filter(PlantillaPractica.laboratorio_id == laboratorio_id)
    elif user.rol != RolUsuario.SUPER_ADMIN:
        q = q.filter(PlantillaPractica.laboratorio_id == user.laboratorio_id)
    elif laboratorio_id:
        q = q.filter(PlantillaPractica.laboratorio_id == laboratorio_id)
    return [_serialize_plantilla(t) for t in q.order_by(PlantillaPractica.titulo).all()]


@router.post("/guias", status_code=201)
def crear_guia(data: PlantillaCreate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol not in RESPONSABLES: raise HTTPException(403, "Solo el responsable puede administrar guías de práctica.")
    _lab_para_usuario(db, data.laboratorio_id, user)
    lab = db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id).first()
    if not lab or (lab.categoria or "").upper() not in {"QUIMICA", "AGROINDUSTRIA"}:
        raise HTTPException(400, "Las guías docentes aplican a laboratorios de Química y Agroindustria.")
    t = PlantillaPractica(laboratorio_id=data.laboratorio_id, materia=data.materia, titulo=data.titulo,
        objetivo=data.objetivo, procedimiento=data.procedimiento, notas_seguridad=data.notas_seguridad, creada_por_id=user.id)
    db.add(t); db.flush()
    for item in data.materiales:
        if item.insumo_id:
            stock = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.id == item.insumo_id,
                InsumoLaboratorio.laboratorio_id == data.laboratorio_id).first()
            if not stock: raise HTTPException(400, "Cada insumo de la guía debe pertenecer al mismo laboratorio.")
        db.add(MaterialPlantillaPractica(plantilla_id=t.id, insumo_id=item.insumo_id,
            descripcion=item.descripcion, cantidad_base=item.cantidad_solicitada, unidad=item.unidad))
    db.commit(); db.refresh(t)
    return _serialize_plantilla(t)


@router.post("/guias/desde-practica/{practica_id}", status_code=201)
def guardar_como_guia(practica_id: int, data: PlantillaDesdePractica, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    p = _get_practica(db, practica_id, user, responsable=True)
    t = PlantillaPractica(laboratorio_id=p.reservacion.laboratorio_id,
        materia=data.materia or p.reservacion.materia, titulo=p.titulo, objetivo=p.objetivo,
        procedimiento=p.procedimiento, notas_seguridad=data.notas_seguridad or p.notas_seguridad,
        creada_por_id=user.id)
    db.add(t); db.flush()
    for m in p.materiales:
        db.add(MaterialPlantillaPractica(plantilla_id=t.id, insumo_id=m.insumo_id,
            descripcion=m.descripcion, cantidad_base=m.cantidad_solicitada, unidad=m.unidad))
    db.commit(); db.refresh(t)
    return _serialize_plantilla(t)


@router.post("", status_code=201)
def crear_practica(data: PracticaCreate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol != RolUsuario.DOCENTE and user.rol not in RESPONSABLES:
        raise HTTPException(403, "Sin permiso para crear prácticas.")
    if not data.titulo and not data.plantilla_id:
        raise HTTPException(422, "Escribe el nombre de la práctica o selecciona una guía.")
    r = db.query(Reservacion).filter(Reservacion.id == data.reservacion_id).first()
    if not r: raise HTTPException(404, "Reservación no encontrada.")
    if user.rol == RolUsuario.DOCENTE and r.docente_id != user.id:
        raise HTTPException(403, "La reservación no pertenece a tu cuenta.")
    if user.rol in RESPONSABLES and user.rol != RolUsuario.SUPER_ADMIN and r.laboratorio_id != user.laboratorio_id:
        raise HTTPException(403, "La reservación corresponde a otro laboratorio.")
    lab = db.query(Laboratorio).filter(Laboratorio.id == r.laboratorio_id).first()
    if not lab or (lab.categoria or "").upper() not in {"QUIMICA", "AGROINDUSTRIA"}:
        raise HTTPException(400, "Las prácticas estructuradas están habilitadas para laboratorios de Química y Agroindustria.")
    fecha_sesion = data.fecha_sesion or r.fecha_actividad
    if not fecha_sesion:
        raise HTTPException(422, "Selecciona la fecha específica de esta práctica.")
    if db.query(PracticaLaboratorio).filter(PracticaLaboratorio.reservacion_id == r.id,
        PracticaLaboratorio.fecha_sesion == fecha_sesion).first():
        raise HTTPException(409, "Esta reservación ya tiene una práctica para esa fecha.")
    if r.fecha_actividad and fecha_sesion != r.fecha_actividad:
        raise HTTPException(400, "La fecha debe coincidir con la reservación de una sola sesión.")
    if r.horario and fecha_sesion.weekday() != r.horario.dia_semana:
        raise HTTPException(400, "La fecha seleccionada no corresponde al día del horario reservado.")
    calendario = estado_fecha_academica(db, r.periodo_id, fecha_sesion)
    if not calendario["permite_iniciar_clase"]:
        raise HTTPException(400, f"La práctica no se puede programar en esta fecha: {calendario['motivo'] or 'día no lectivo'}.")
    if fecha_sesion < datetime.date.today():
        raise HTTPException(400, "No se puede crear una nueva práctica para una fecha pasada.")
    plantilla = None
    if data.plantilla_id:
        plantilla = db.query(PlantillaPractica).filter(PlantillaPractica.id == data.plantilla_id,
            PlantillaPractica.laboratorio_id == r.laboratorio_id, PlantillaPractica.activa == True).first()
        if not plantilla: raise HTTPException(400, "La guía seleccionada no pertenece a este laboratorio.")
    p = PracticaLaboratorio(reservacion_id=r.id, fecha_sesion=fecha_sesion, plantilla_id=plantilla.id if plantilla else None,
        titulo=data.titulo or (plantilla.titulo if plantilla else "Práctica"),
        objetivo=data.objetivo or (plantilla.objetivo if plantilla else None),
        procedimiento=data.procedimiento or (plantilla.procedimiento if plantilla else None),
        notas_seguridad=data.notas_seguridad or (plantilla.notas_seguridad if plantilla else None))
    db.add(p); db.flush()
    materials = data.materiales or ([MaterialCreate(insumo_id=x.insumo_id, descripcion=x.descripcion,
        cantidad_solicitada=x.cantidad_base, unidad=x.unidad) for x in plantilla.materiales] if plantilla else [])
    for item in materials:
        if item.insumo_id:
            stock = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.id == item.insumo_id,
                    InsumoLaboratorio.laboratorio_id == r.laboratorio_id, InsumoLaboratorio.activo == True).first()
            if not stock: raise HTTPException(400, f"El insumo '{item.descripcion}' no pertenece a este laboratorio.")
        db.add(MaterialPractica(practica_id=p.id, **item.model_dump()))
    receptores = db.query(Usuario).filter(Usuario.laboratorio_id == r.laboratorio_id,
        Usuario.rol.in_([RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB]), Usuario.activo == True).all()
    for receptor in receptores:
        crear_notificacion(db, receptor.id, "PRACTICA_LABORATORIO", "Nueva solicitud de práctica",
            f"{user.nombre} solicitó '{p.titulo}' para {r.materia}, grupo {r.grupo}.",
            "/admin/practicas-laboratorio", enviar_email=False)
    db.commit(); db.refresh(p)
    return _serialize(p, db)


@router.get("/{practica_id}")
def detalle_practica(practica_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    return _serialize(_get_practica(db, practica_id, user), db)


@router.post("/{practica_id}/preparar")
def preparar_practica(practica_id: int, data: PrepararBody, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    p = _get_practica(db, practica_id, user, responsable=True)
    if p.estado != "SOLICITADA": raise HTTPException(409, "La práctica ya fue preparada o iniciada.")
    by_id = {m.id: m for m in p.materiales}
    submitted = {x.material_id: x.cantidad_entregada for x in data.materiales}
    if len(submitted) != len(data.materiales) or set(submitted) != set(by_id):
        raise HTTPException(400, "Indica la cantidad preparada para cada material solicitado.")
    for mid, qty in submitted.items():
        m = by_id[mid]
        if qty > m.cantidad_solicitada:
            raise HTTPException(400, f"La entrega de {m.descripcion} supera la cantidad solicitada.")
        m.cantidad_entregada = qty
        if m.insumo_id and qty:
            stock = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.id == m.insumo_id).with_for_update().first()
            if stock.cantidad_disponible < qty:
                raise HTTPException(409, f"Existencia insuficiente de {stock.nombre}.")
            stock.cantidad_disponible -= qty
            db.add(MovimientoInsumoLaboratorio(insumo_id=stock.id, practica_id=p.id, tipo="ENTREGA", cantidad=qty, usuario_id=user.id))
    p.estado = "PREPARADA"
    crear_notificacion(db, p.reservacion.docente_id, "PRACTICA_LABORATORIO", "Materiales listos para la práctica",
        f"El responsable preparó '{p.titulo}'. Puedes iniciar la sesión desde Prácticas y reportes.",
        "/docente/practicas-laboratorio", enviar_email=False)
    db.commit(); db.refresh(p)
    return _serialize(p, db)


@router.post("/{practica_id}/iniciar")
def iniciar_practica(practica_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    p = _get_practica(db, practica_id, user)
    if user.rol == RolUsuario.DOCENTE and p.reservacion.docente_id != user.id:
        raise HTTPException(403, "Solo el docente responsable puede iniciar la práctica.")
    if p.estado != "PREPARADA": raise HTTPException(409, "El laboratorio debe preparar y entregar los materiales antes de iniciar.")
    r = p.reservacion
    fecha_hoy = now_mx().date()
    if p.fecha_sesion != fecha_hoy:
        raise HTTPException(409, f"La práctica está programada para {p.fecha_sesion.isoformat()} y solo puede iniciarse ese día.")
    calendario = estado_fecha_academica(db, r.periodo_id, p.fecha_sesion)
    if not calendario["permite_iniciar_clase"] or not calendario["requiere_asistencia"]:
        raise HTTPException(409, f"El calendario académico no permite iniciar la práctica: {calendario['motivo'] or 'día no lectivo'}.")
    grupo = None
    carga = None
    if r.carga_docente_id:
        carga = db.query(CargaDocente).filter(CargaDocente.id == r.carga_docente_id).first()
        if not carga:
            raise HTTPException(409, "La reservación apunta a una carga docente que ya no existe. Corrige la carga antes de iniciar la práctica.")
        if carga.grupo_academico_id:
            grupo = db.query(GrupoAcademico).filter(
                GrupoAcademico.id == carga.grupo_academico_id,
                GrupoAcademico.activo == True,
            ).first()
            if not grupo:
                raise HTTPException(409, "La carga docente no tiene un grupo académico activo para cargar la asistencia.")
            if grupo.grupo.strip().casefold() != (r.grupo or "").strip().casefold():
                raise HTTPException(409, "El grupo de la reservación no coincide con el grupo de su carga docente.")
            if r.periodo_id and grupo.periodo_id != r.periodo_id:
                raise HTTPException(409, "El periodo de la reservación no coincide con el grupo de su carga docente.")

    if not grupo:
        periodo = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == r.periodo_id).first() if r.periodo_id else None
        if not periodo:
            periodo = db.query(PeriodoEscolar).filter(func.upper(PeriodoEscolar.clave) == (r.cuatrimestre or "").upper()).first()
        grupos = db.query(GrupoAcademico).filter(
            GrupoAcademico.activo == True,
            func.lower(GrupoAcademico.grupo) == (r.grupo or "").strip().lower(),
        )
        if periodo: grupos = grupos.filter(GrupoAcademico.periodo_id == periodo.id)
        if r.carrera: grupos = grupos.filter(func.lower(GrupoAcademico.carrera) == r.carrera.strip().lower())
        if r.cuatrimestre_materia and str(r.cuatrimestre_materia).isdigit():
            grupos = grupos.filter(GrupoAcademico.cuatrimestre == int(r.cuatrimestre_materia))
        candidatos = grupos.order_by(GrupoAcademico.id).limit(2).all()
        if len(candidatos) > 1:
            raise HTTPException(409, "La reservación coincide con más de un grupo académico. Vincúlala a una carga docente para evitar usar una lista incorrecta.")
        grupo = candidatos[0] if candidatos else None
    if not grupo: raise HTTPException(400, "No se encontró el grupo académico para cargar la lista de asistencia. Verifica periodo, carrera y grupo.")
    alumnos = (db.query(CatalogoAlumno).join(InscripcionAlumno, InscripcionAlumno.alumno_id == CatalogoAlumno.id)
               .filter(InscripcionAlumno.grupo_academico_id == grupo.id, InscripcionAlumno.estado == "ACTIVO", CatalogoAlumno.activo == True)
               .order_by(CatalogoAlumno.apellido_paterno, CatalogoAlumno.apellido_materno, CatalogoAlumno.nombres).all())
    if not alumnos: raise HTTPException(400, "El grupo no tiene alumnos activos para registrar asistencia.")
    for a in alumnos:
        db.add(AsistenciaPractica(practica_id=p.id, alumno_id=a.id, matricula=a.matricula,
                                  alumno_nombre=" ".join(x for x in [a.apellido_paterno, a.apellido_materno, a.nombres] if x)))
    p.estado = "EN_CURSO"; p.iniciada_en = datetime.datetime.utcnow()
    db.commit(); db.refresh(p)
    return _serialize(p, db)


@router.put("/{practica_id}/asistencia")
def guardar_asistencia(practica_id: int, data: AsistenciaBody, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    p = _get_practica(db, practica_id, user)
    if p.estado != "EN_CURSO": raise HTTPException(409, "La asistencia solo se puede registrar durante la práctica.")
    if user.rol == RolUsuario.DOCENTE and p.reservacion.docente_id != user.id:
        raise HTTPException(403, "Solo el docente responsable puede registrar asistencia.")
    rows = {a.alumno_id: a for a in p.asistencias}
    for item in data.alumnos:
        if item.alumno_id not in rows: raise HTTPException(400, "La lista incluye un alumno que no pertenece a esta práctica.")
        rows[item.alumno_id].estado = item.estado
        rows[item.alumno_id].observacion = item.observacion
    db.commit(); db.refresh(p)
    return _serialize(p, db)


@router.post("/{practica_id}/incidentes", status_code=201)
def reportar_incidente(practica_id: int, data: IncidenteBody, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    p = _get_practica(db, practica_id, user)
    if p.estado not in {"PREPARADA", "EN_CURSO"}: raise HTTPException(409, "La práctica no está activa.")
    payload = data.model_dump()
    activo_id = payload.pop("activo_id", None)
    activo = None
    if activo_id:
        activo = db.query(Activo).filter(Activo.id == activo_id, Activo.laboratorio_id == p.reservacion.laboratorio_id,
            Activo.activo == True).first()
        if not activo: raise HTTPException(400, "El equipo seleccionado no está registrado como activo de este laboratorio.")
    incident = IncidentePractica(practica_id=p.id, reportado_por_id=user.id, activo_id=activo_id, **payload)
    db.add(incident); db.commit(); db.refresh(incident)
    if activo:
        db.add(Incidente(activo_id=activo.id, laboratorio_id=p.reservacion.laboratorio_id, origen="PRACTICA",
            origen_id=incident.id, tipo="DAÑO" if incident.tipo in {"ROTURA", "EQUIPO"} else "OTRO",
            descripcion=f"Práctica '{p.titulo}': {incident.descripcion}", reportado_por_id=user.id,
            estado="PENDIENTE", prioridad="ALTA" if incident.severidad in {"ALTA", "CRITICA"} else incident.severidad))
        if incident.severidad in {"ALTA", "CRITICA"}:
            activo.estado = "MANTENIMIENTO"
        db.commit()
    if incident.severidad in {"ALTA", "CRITICA"}:
        lab = p.reservacion.laboratorio
        lab.observaciones = ((lab.observaciones or "") + f"\nIncidente de seguridad {incident.severidad} en práctica {p.id}; requiere revisión.").strip()
        responsables = db.query(Usuario).filter(Usuario.laboratorio_id == p.reservacion.laboratorio_id,
            Usuario.rol.in_([RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB]), Usuario.activo == True).all()
        for responsable in responsables:
            crear_notificacion(db, responsable.id, "INCIDENTE_LABORATORIO", "Incidente de seguridad prioritario",
                f"{incident.severidad}: {incident.tipo} en '{p.titulo}'. Requiere revisión del laboratorio.",
                "/admin/practicas-laboratorio", enviar_email=False)
        db.commit()
    return {"id": incident.id, "tipo": incident.tipo, "severidad": incident.severidad, "descripcion": incident.descripcion}


@router.post("/{practica_id}/residuos", status_code=201)
def registrar_residuo(practica_id: int, data: ResiduoBody, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    p = _get_practica(db, practica_id, user)
    if p.estado not in {"PREPARADA", "EN_CURSO"}:
        raise HTTPException(409, "Los residuos de esta práctica deben registrarse durante su ejecución.")
    residuo = ResiduoPractica(practica_id=p.id, reportado_por_id=user.id, **data.model_dump())
    db.add(residuo); db.commit(); db.refresh(residuo)
    return {"id": residuo.id, "descripcion": residuo.descripcion, "clasificacion": residuo.clasificacion,
            "cantidad": residuo.cantidad, "unidad": residuo.unidad, "destino": residuo.destino}


@router.put("/incidentes/{incidente_id}")
def actualizar_incidente(incidente_id: int, data: IncidenteSeguimientoBody, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    incidente = db.query(IncidentePractica).filter(IncidentePractica.id == incidente_id).first()
    if not incidente: raise HTTPException(404, "Incidente no encontrado.")
    _get_practica(db, incidente.practica_id, user, responsable=True)
    incidente.estado = data.estado
    incidente.acciones = data.acciones
    incidente.requiere_seguimiento = data.estado != "RESUELTO"
    db.commit()
    return {"id": incidente.id, "estado": incidente.estado, "acciones": incidente.acciones}


@router.post("/{practica_id}/cerrar")
def cerrar_practica(practica_id: int, data: CerrarBody, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    p = _get_practica(db, practica_id, user)
    if p.estado != "EN_CURSO": raise HTTPException(409, "Solo se pueden cerrar prácticas iniciadas.")
    if user.rol == RolUsuario.DOCENTE and p.reservacion.docente_id != user.id:
        raise HTTPException(403, "Solo el docente responsable puede cerrar la práctica.")
    materials = {m.id: m for m in p.materiales}
    submitted = {int(x.get("material_id", -1)): x for x in data.materiales}
    if set(submitted) != set(materials): raise HTTPException(400, "Registra consumo, merma y devolución de cada material.")
    for mid, m in materials.items():
        row = submitted[mid]
        used = float(row.get("cantidad_consumida", 0)); waste = float(row.get("cantidad_merma", 0)); returned = float(row.get("cantidad_devuelta", 0))
        if min(used, waste, returned) < 0 or abs(used + waste + returned - m.cantidad_entregada) > 0.0001:
            raise HTTPException(400, f"Consumo, merma y devolución de {m.descripcion} deben sumar la cantidad entregada ({m.cantidad_entregada:g}).")
        m.cantidad_consumida, m.cantidad_merma, m.cantidad_devuelta = used, waste, returned
        if m.insumo_id:
            stock = db.query(InsumoLaboratorio).filter(InsumoLaboratorio.id == m.insumo_id).with_for_update().first()
            if returned:
                stock.cantidad_disponible += returned
                db.add(MovimientoInsumoLaboratorio(insumo_id=stock.id, practica_id=p.id, tipo="DEVOLUCION", cantidad=returned, usuario_id=user.id))
            if used:
                db.add(MovimientoInsumoLaboratorio(insumo_id=stock.id, practica_id=p.id, tipo="CONSUMO", cantidad=used, usuario_id=user.id))
            if waste:
                db.add(MovimientoInsumoLaboratorio(insumo_id=stock.id, practica_id=p.id, tipo="MERMA", cantidad=waste, usuario_id=user.id, observaciones=row.get("nota")))
    p.resultados = data.resultados; p.conclusiones = data.conclusiones
    p.observaciones_docente = data.observaciones_docente
    p.estado = "CERRADA"; p.cerrada_en = datetime.datetime.utcnow()
    db.commit(); db.refresh(p)
    return _serialize(p, db)
