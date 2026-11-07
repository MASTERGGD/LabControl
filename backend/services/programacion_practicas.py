"""Programación atómica de sesiones y contexto compartido de prácticas."""
import datetime as dt
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, object_session
from database import get_db
from dependencies import get_current_user
from models.docencia import CargaDocente
from models.horario import Reservacion, HorarioDisponible, BloqueoSlot
from models.laboratorio import Laboratorio
from models.usuario import Usuario, RolUsuario
from models.catalogo import GrupoAcademico
from models.practica_laboratorio import PracticaLaboratorio, MaterialPractica
from services.calendario_academico import estado_fecha_academica
from services.timezone import now_mx

router = APIRouter()
ACTIVAS = ['PROGRAMADA', 'EN_DISPUTA', 'EN_CURSO', 'PENDIENTE_AUTORIZACION']


class FechaPractica(BaseModel):
    fecha: dt.date
    carga_id: int
    fuera_horario: bool = False
    hora_inicio: str = Field(..., pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    hora_fin: str = Field(..., pattern=r'^([01]\d|2[0-3]):[0-5]\d$')


class MaterialPlan(BaseModel):
    insumo_id: int | None = None
    descripcion: str = Field(..., min_length=1, max_length=180)
    cantidad_solicitada: float = Field(..., gt=0, allow_inf_nan=False)
    unidad: str = Field('PIEZA', min_length=1, max_length=30)
    nota: str | None = None


class ProgramacionPractica(BaseModel):
    laboratorio_id: int
    titulo: str = Field(..., min_length=2, max_length=180)
    objetivo: str | None = None
    procedimiento: str | None = None
    notas_seguridad: str | None = None
    materiales: list[MaterialPlan] = Field(default_factory=list, max_length=80)
    sesiones: list[FechaPractica] = Field(..., min_length=1, max_length=30)
    practica_origen_id: int | None = None


def sesiones_plan(db, p):
    origen = p.practica_origen_id or p.id
    return db.query(PracticaLaboratorio).filter(or_(PracticaLaboratorio.id == origen,
        PracticaLaboratorio.practica_origen_id == origen)).order_by(PracticaLaboratorio.fecha_sesion, PracticaLaboratorio.id).all()


def resumen_sesion(p):
    r = p.reservacion
    return {'id': p.id, 'fecha': p.fecha_sesion.isoformat(), 'estado': p.estado,
            'hora_inicio': r.horario.hora_inicio, 'hora_fin': max((x.horario.hora_fin for x in _bloque(r)), default=r.horario.hora_fin),
            'fuera_horario': p.fuera_horario}


def _bloque(r):
    db = object_session(r)
    return db.query(Reservacion).filter(Reservacion.bloque_reserva_id == r.bloque_reserva_id).all() if db and r.bloque_reserva_id else [r]


def ventana_inicio(p, ahora=None):
    ahora = ahora or now_mx()
    r = p.reservacion
    if p.estado != 'PREPARADA' or p.fecha_sesion != ahora.date() or r.estado not in {'PROGRAMADA', 'EN_CURSO'}:
        return False
    reservas = _bloque(r)
    if any(x.estado not in {'PROGRAMADA', 'EN_CURSO'} or not x.horario.activo for x in reservas): return False
    db = object_session(p)
    if db:
        if db.query(BloqueoSlot).filter(BloqueoSlot.horario_id.in_([x.horario_id for x in reservas]), BloqueoSlot.activo == True).first(): return False
        cal = estado_fecha_academica(db, r.periodo_id, p.fecha_sesion)
        if not cal['requiere_asistencia'] or not cal['permite_iniciar_clase']: return False
    inicio = dt.datetime.combine(p.fecha_sesion, dt.time.fromisoformat(r.horario.hora_inicio), tzinfo=ahora.tzinfo)
    hora_fin = max(x.horario.hora_fin for x in _bloque(r))
    fin = dt.datetime.combine(p.fecha_sesion, dt.time.fromisoformat(hora_fin), tzinfo=ahora.tzinfo)
    return inicio - dt.timedelta(minutes=15) <= ahora <= fin + dt.timedelta(minutes=15)


def validar_programacion(data, db, user, bloquear=False):
    if user.rol != RolUsuario.DOCENTE:
        raise HTTPException(403, 'La programación corresponde al docente de la materia.')
    labq = db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id, Laboratorio.activo == True)
    lab = (labq.with_for_update() if bloquear else labq).first()
    if not lab or (lab.categoria or '').upper() not in {'QUIMICA', 'AGROINDUSTRIA'}:
        raise HTTPException(400, 'Selecciona un laboratorio activo de Química o Agroindustria.')
    if bloquear:
        db.query(Usuario).filter(Usuario.id == user.id).with_for_update().first()
    origen = None
    if data.practica_origen_id:
        origen = db.get(PracticaLaboratorio, data.practica_origen_id)
        if not origen or origen.reservacion.docente_id != user.id:
            raise HTTPException(403, 'La práctica no pertenece a tu cuenta.')
        if origen.practica_origen_id:
            origen = db.get(PracticaLaboratorio, origen.practica_origen_id)
        if bloquear:
            db.query(PracticaLaboratorio).filter(PracticaLaboratorio.id == origen.id).with_for_update().populate_existing().first()
        if origen.plan_estado == 'FINALIZADA':
            raise HTTPException(409, 'Esta práctica ya está finalizada.')
        if origen.reservacion.laboratorio_id != lab.id:
            raise HTTPException(422, 'La continuación debe conservar el laboratorio de la práctica.')
    errores, filas, identidad, vistos = [], [], None, []
    for numero, sesion in enumerate(data.sesiones, 1):
        def error(mensaje):
            errores.append({'sesion': numero, 'fecha': sesion.fecha.isoformat(), 'mensaje': mensaje})
        c = db.get(CargaDocente, sesion.carga_id)
        if not c or c.docente_id != user.id or not c.activo or c.estado != 'ACTIVO' or c.tipo_actividad != 'CLASE' or not c.grupo_academico_id:
            error('Selecciona una clase activa con grupo de tu carga docente.'); continue
        grupo = c.grupo_academico
        if not grupo.activo or not c.periodo.activo or not c.periodo.es_actual:
            error('La materia debe pertenecer al periodo actual y a un grupo activo.'); continue
        if bloquear:
            db.query(GrupoAcademico).filter(GrupoAcademico.id == grupo.id).with_for_update().first()
        clave = (c.periodo_id, c.grupo_academico_id, c.materia_id, c.actividad_nombre.strip().casefold())
        if identidad is None: identidad = clave
        if clave != identidad:
            error('Todas las sesiones deben corresponder a la misma materia y grupo.'); continue
        if origen:
            anterior = origen.reservacion.carga_docente
            if not anterior or (anterior.periodo_id, anterior.grupo_academico_id, anterior.materia_id, anterior.actividad_nombre.strip().casefold()) != clave:
                error('La continuación debe conservar la materia y el grupo originales.'); continue
        if sesion.fecha < now_mx().date() or sesion.hora_fin <= sesion.hora_inicio:
            error('La fecha debe ser futura o de hoy y el rango horario válido.'); continue
        # No asignar al periodo siguiente sesiones de una carga del cuatrimestre actual.
        if (sesion.fecha.year, (sesion.fecha.month - 1)//4) != (now_mx().year, (now_mx().month - 1)//4):
            error('La sesión debe quedar dentro del cuatrimestre actual.'); continue
        cal = estado_fecha_academica(db, c.periodo_id, sesion.fecha)
        if not cal['permite_iniciar_clase'] or not cal['requiere_asistencia']:
            error(f"El calendario no permite la sesión: {cal['motivo'] or 'día no lectivo'}."); continue
        if not sesion.fuera_horario and (sesion.fecha.weekday() != c.dia_semana or sesion.hora_inicio != c.hora_inicio or sesion.hora_fin != c.hora_fin):
            error('La sesión no coincide con tu horario. Elige un bloque de la materia o marca fuera de horario.'); continue
        slots = db.query(HorarioDisponible).filter(HorarioDisponible.laboratorio_id == lab.id,
            HorarioDisponible.activo == True, HorarioDisponible.dia_semana == sesion.fecha.weekday(),
            HorarioDisponible.hora_inicio >= sesion.hora_inicio, HorarioDisponible.hora_fin <= sesion.hora_fin).order_by(HorarioDisponible.hora_inicio).all()
        from routers.horarios import _normalizar_periodo
        slots = [h for h in slots if _normalizar_periodo(h.cuatrimestre) == _normalizar_periodo(c.periodo.clave)]
        cursor = sesion.hora_inicio
        contiguos = True
        for h in slots:
            if h.hora_inicio != cursor:
                contiguos = False; break
            cursor = h.hora_fin
        if not slots or not contiguos or cursor != sesion.hora_fin:
            error('El laboratorio no tiene disponibilidad configurada que cubra todo ese horario.'); continue
        if db.query(BloqueoSlot).filter(BloqueoSlot.horario_id.in_([h.id for h in slots]), BloqueoSlot.activo == True).first():
            error('El laboratorio tiene un bloqueo institucional.'); continue
        reservas = db.query(Reservacion).join(HorarioDisponible).filter(Reservacion.estado.in_(ACTIVAS),
            Reservacion.periodo_id == c.periodo_id,
            or_(Reservacion.fecha_actividad == sesion.fecha, (Reservacion.fecha_actividad == None) & (HorarioDisponible.dia_semana == sesion.fecha.weekday())),
            HorarioDisponible.hora_inicio < sesion.hora_fin, HorarioDisponible.hora_fin > sesion.hora_inicio).all()
        reutilizables = [r for r in reservas if r.laboratorio_id == lab.id and r.docente_id == user.id
            and r.carga_docente_id == c.id and r.estado == 'PROGRAMADA'
            and r.horario_id in {h.id for h in slots}]
        reutilizar_ids = {r.id for r in reutilizables}
        if reutilizables and {r.horario_id for r in reutilizables} != {h.id for h in slots}:
            error('La reservación existente de la materia no cubre todo el bloque solicitado.'); continue
        if reutilizar_ids and db.query(PracticaLaboratorio).filter(PracticaLaboratorio.reservacion_id.in_(reutilizar_ids),
                PracticaLaboratorio.fecha_sesion == sesion.fecha, PracticaLaboratorio.estado != 'CANCELADA').first():
            error('La materia ya tiene una práctica registrada para esa fecha.'); continue
        conflicto = any(r.laboratorio_id == lab.id or r.docente_id == user.id or
            (r.carga_docente and r.carga_docente.grupo_academico_id == grupo.id) or
            (r.grupo == grupo.grupo and r.carrera == grupo.carrera and str(r.cuatrimestre_materia) == str(grupo.cuatrimestre)) for r in reservas if r.id not in reutilizar_ids)
        if conflicto:
            error('Ya existe una reservación del laboratorio, docente o grupo en ese horario.'); continue
        cargas = db.query(CargaDocente).filter(CargaDocente.activo == True, CargaDocente.estado == 'ACTIVO',
            CargaDocente.periodo_id == c.periodo_id, CargaDocente.dia_semana == sesion.fecha.weekday(),
            CargaDocente.hora_inicio < sesion.hora_fin, CargaDocente.hora_fin > sesion.hora_inicio,
            or_(CargaDocente.docente_id == user.id, CargaDocente.grupo_academico_id == grupo.id)).all()
        if any(otra.id != c.id or sesion.fuera_horario for otra in cargas):
            error('El docente o el grupo tiene otra actividad de su horario.'); continue
        if any(f == sesion.fecha and hi < sesion.hora_fin and hf > sesion.hora_inicio for f, hi, hf in vistos):
            error('Las sesiones propuestas se superponen.'); continue
        vistos.append((sesion.fecha, sesion.hora_inicio, sesion.hora_fin))
        filas.append((sesion, c, slots, reutilizables))
    return errores, filas, origen


@router.post('/programacion/validar')
def revisar_programacion(data: ProgramacionPractica, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    errores, filas, _ = validar_programacion(data, db, user)
    return {'disponible': not errores, 'conflictos': errores, 'sesiones': len(filas)}


@router.post('/programacion', status_code=201)
def programar_practica(data: ProgramacionPractica, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    from routers.practicas_laboratorio import _serialize
    from routers.notificaciones import crear_notificacion
    from models.practica_laboratorio import InsumoLaboratorio
    errores, filas, origen = validar_programacion(data, db, user, bloquear=True)
    if errores:
        raise HTTPException(409, {'message': 'No se confirmó ninguna sesión. Corrige las fechas en conflicto.', 'conflictos': errores})
    if origen and len(sesiones_plan(db, origen)) + len(filas) > 60:
        raise HTTPException(422, 'Una práctica admite hasta 60 sesiones en total.')
    materiales = data.materiales
    if origen:
        materiales = [MaterialPlan(insumo_id=m.insumo_id, descripcion=m.descripcion, cantidad_solicitada=m.cantidad_solicitada, unidad=m.unidad, nota=m.nota) for m in origen.materiales]
    for m in materiales:
        if m.insumo_id and not db.query(InsumoLaboratorio).filter(InsumoLaboratorio.id == m.insumo_id,
                InsumoLaboratorio.laboratorio_id == data.laboratorio_id, InsumoLaboratorio.activo == True).first():
            raise HTTPException(422, 'Un material no pertenece al laboratorio o está inactivo.')
    nuevas = []
    for sesion, carga, slots, reutilizables in sorted(filas, key=lambda x: (x[0].fecha, x[0].hora_inicio)):
        bloque = str(uuid.uuid4())
        reservas = sorted(reutilizables, key=lambda r: r.horario.hora_inicio)
        for h in ([] if reutilizables else slots):
            r = Reservacion(horario_id=h.id, laboratorio_id=data.laboratorio_id, docente_id=user.id,
                creado_por=user.id, carga_docente_id=carga.id, periodo_id=carga.periodo_id, bloque_reserva_id=bloque,
                materia=carga.actividad_nombre, carrera=carga.grupo_academico.carrera,
                cuatrimestre=h.cuatrimestre, cuatrimestre_materia=str(carga.grupo_academico.cuatrimestre),
                grupo=carga.grupo_academico.grupo, fecha_actividad=sesion.fecha, estado='PROGRAMADA', tipo_actividad='CLASE')
            db.add(r); db.flush(); reservas.append(r)
        p = PracticaLaboratorio(reservacion_id=reservas[0].id, fecha_sesion=sesion.fecha,
            titulo=origen.titulo if origen else data.titulo, objetivo=origen.objetivo if origen else data.objetivo,
            procedimiento=origen.procedimiento if origen else data.procedimiento,
            notas_seguridad=origen.notas_seguridad if origen else data.notas_seguridad,
            practica_origen_id=origen.id if origen else None, fuera_horario=sesion.fuera_horario,
            estado='SOLICITADA')
        db.add(p); db.flush()
        if origen is None: origen = p
        for m in materiales: db.add(MaterialPractica(practica_id=p.id, **m.model_dump()))
        nuevas.append(p)
    origen.plan_estado = 'PLANIFICADA'
    responsables = db.query(Usuario).filter(Usuario.laboratorio_id == data.laboratorio_id,
        Usuario.rol.in_([RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB]), Usuario.activo == True).all()
    for responsable in responsables:
        crear_notificacion(db, responsable.id, 'PRACTICA_LABORATORIO', 'Práctica programada por sesiones',
            f"{user.nombre}: {origen.titulo}, {len(nuevas)} sesión(es). Preparar materiales para cada fecha.",
            f'/admin/practicas-laboratorio?practica_id={nuevas[0].id}', enviar_email=False)
    db.flush()
    respuesta = [_serialize(p, db) for p in nuevas]
    db.commit()
    return {'practica_id': origen.id, 'sesiones': respuesta}


def contexto_docente(db, user_id, periodo_id=None, desde=None, hasta=None):
    q = db.query(PracticaLaboratorio).join(Reservacion).filter(Reservacion.docente_id == user_id)
    if periodo_id: q = q.filter(Reservacion.periodo_id == periodo_id)
    if desde: q = q.filter(PracticaLaboratorio.fecha_sesion >= desde)
    if hasta: q = q.filter(PracticaLaboratorio.fecha_sesion <= hasta)
    return q.order_by(PracticaLaboratorio.fecha_sesion, PracticaLaboratorio.id).all()


def accion_practica(p):
    return {'practica_id': p.id, 'practica_titulo': p.titulo, 'practica_estado': p.estado,
            'practica_puede_iniciar': ventana_inicio(p),
            'practica_url': f'/docente/practicas-laboratorio?practica_id={p.id}'}


@router.get('/agenda-docente')
def agenda_docente(periodo_id: int | None = None, historial: bool = False,
                  db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol != RolUsuario.DOCENTE: raise HTTPException(403, 'Consulta exclusiva del docente.')
    hoy = now_mx().date()
    practicas = contexto_docente(db, user.id, periodo_id, None if historial else hoy,
                               hoy + dt.timedelta(days=120) if not historial else None)
    if not historial:
        pendientes = db.query(PracticaLaboratorio).join(Reservacion).filter(Reservacion.docente_id == user.id,
            PracticaLaboratorio.plan_estado == 'PENDIENTE_CONTINUACION').all()
        if periodo_id: pendientes = [p for p in pendientes if p.reservacion.periodo_id == periodo_id]
        incluidos = {p.id for p in practicas}
        practicas += [p for p in pendientes if p.id not in incluidos]
    return [{**resumen_sesion(p), **accion_practica(p),
             'titulo': p.titulo, 'materia': p.reservacion.materia, 'grupo': p.reservacion.grupo,
             'laboratorio': p.reservacion.laboratorio.nombre,
             'carga_id': p.reservacion.carga_docente_id,
             'practica_origen_id': p.practica_origen_id or p.id,
             'plan_estado': (db.get(PracticaLaboratorio, p.practica_origen_id) if p.practica_origen_id else p).plan_estado,
             } for p in practicas]
