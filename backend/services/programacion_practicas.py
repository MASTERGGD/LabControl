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
from models.catalogo import GrupoAcademico, PeriodoEscolar
from models.practica_laboratorio import PracticaLaboratorio, MaterialPractica
from services.calendario_academico import estado_fecha_academica
from services.timezone import now_mx

router = APIRouter()
ACTIVAS = ['PROGRAMADA', 'EN_DISPUTA', 'EN_CURSO', 'PENDIENTE_AUTORIZACION']


class FechaPractica(BaseModel):
    fecha: dt.date
    carga_id: int | None = None
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
    proposito: str = Field('ACADEMICA', pattern='^(ACADEMICA|INDIVIDUAL)$')
    incluye_practica: bool = True
    periodo_id: int | None = None
    participantes: str | None = Field(None, max_length=1000)
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
    if proposito_sesion(p) == 'SIN_VINCULACION': return False
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


def proposito_sesion(p):
    return p.proposito or ('ACADEMICA' if p.reservacion.carga_docente_id else 'SIN_VINCULACION')


def validar_programacion(data, db, user, bloquear=False, excluir_reservas=None):
    from routers.docencia import _periodo_actual, _validar_periodo_actual
    from routers.horarios import _normalizar_periodo
    if user.rol != RolUsuario.DOCENTE:
        raise HTTPException(403, 'Solicita el laboratorio desde tu función Docente.')
    labq = db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id, Laboratorio.activo == True)
    lab = (labq.with_for_update() if bloquear else labq).first()
    if not lab or (lab.categoria or '').upper() not in {'QUIMICA', 'AGROINDUSTRIA'}: raise HTTPException(400, 'Selecciona un laboratorio activo de Química o Agroindustria.')
    if data.incluye_practica and (lab.categoria or '').upper() not in {'QUIMICA', 'AGROINDUSTRIA'}:
        raise HTTPException(422, 'El seguimiento de prácticas con materiales está disponible en Química y Agroindustria. Para otro laboratorio solicita solo el espacio.')
    if not data.incluye_practica and data.materiales:
        raise HTTPException(422, 'Activa la práctica con materiales antes de solicitar insumos.')
    if bloquear: db.query(Usuario).filter(Usuario.id == user.id).with_for_update().first()
    origen = None
    if data.practica_origen_id:
        origen = db.get(PracticaLaboratorio, data.practica_origen_id)
        if not origen or origen.reservacion.docente_id != user.id:
            raise HTTPException(403, 'La actividad no pertenece a tu cuenta.')
        if origen.practica_origen_id: origen = db.get(PracticaLaboratorio, origen.practica_origen_id)
        if bloquear: db.query(PracticaLaboratorio).filter(PracticaLaboratorio.id == origen.id).with_for_update().populate_existing().first()
        if origen.plan_estado == 'FINALIZADA': raise HTTPException(409, 'Esta actividad ya está finalizada.')
        if origen.reservacion.laboratorio_id != lab.id: raise HTTPException(422, 'La continuación debe conservar el laboratorio.')
        if proposito_sesion(origen) != data.proposito or origen.incluye_practica != data.incluye_practica:
            raise HTTPException(422, 'La continuación debe conservar el propósito y tipo de la actividad original.')
    objetivo = origen.objetivo if origen else data.objetivo
    if data.proposito == 'INDIVIDUAL' and len((objetivo or '').strip()) < 4:
        raise HTTPException(422, 'Describe el objetivo del estudio o trabajo individual.')
    periodo_individual = None
    if data.proposito == 'INDIVIDUAL':
        periodo_individual = db.get(PeriodoEscolar, data.periodo_id) if data.periodo_id else _periodo_actual(db)
        if not periodo_individual: raise HTTPException(409, 'No hay un periodo vigente para reservar.')
        _validar_periodo_actual(db, periodo_individual.id)
    errores, filas, identidad, vistos = [], [], None, []
    for numero, sesion in enumerate(data.sesiones, 1):
        def error(mensaje): errores.append({'sesion': numero, 'fecha': sesion.fecha.isoformat(), 'mensaje': mensaje})
        c, grupo = None, None
        if data.proposito == 'ACADEMICA':
            c = db.get(CargaDocente, sesion.carga_id) if sesion.carga_id else None
            if not c or c.docente_id != user.id or not c.activo or c.estado != 'ACTIVO' or c.tipo_actividad != 'CLASE' or not c.grupo_academico_id:
                error('Selecciona una clase activa con grupo de tu carga docente.'); continue
            grupo, periodo = c.grupo_academico, c.periodo
            if not grupo.activo:
                error('El grupo académico no está activo.'); continue
            _validar_periodo_actual(db, periodo.id)
            if bloquear: db.query(GrupoAcademico).filter(GrupoAcademico.id == grupo.id).with_for_update().first()
            clave = (c.periodo_id, c.grupo_academico_id, c.materia_id, c.actividad_nombre.strip().casefold())
            if identidad is None: identidad = clave
            if clave != identidad:
                error('Todas las sesiones deben corresponder a la misma materia y grupo.'); continue
            if origen:
                anterior = origen.reservacion.carga_docente
                if not anterior or (anterior.periodo_id, anterior.grupo_academico_id, anterior.materia_id, anterior.actividad_nombre.strip().casefold()) != clave:
                    error('La continuación debe conservar la materia y el grupo originales.'); continue
            if not sesion.fuera_horario and (sesion.fecha.weekday() != c.dia_semana or sesion.hora_inicio != c.hora_inicio or sesion.hora_fin != c.hora_fin):
                error('La sesión no coincide con tu horario. Elige otro bloque o marca fuera de horario.'); continue
        else:
            if sesion.carga_id:
                error('El uso individual no debe vincularse a una carga ni generar asistencia académica.'); continue
            periodo = periodo_individual
            if origen and origen.reservacion.periodo_id != periodo.id:
                error('La continuación debe conservar el periodo original.'); continue
        if sesion.fecha < now_mx().date() or sesion.hora_fin <= sesion.hora_inicio:
            error('La fecha debe ser futura o de hoy y el rango horario válido.'); continue
        if (sesion.fecha.year, (sesion.fecha.month - 1)//4) != (now_mx().year, (now_mx().month - 1)//4):
            error('La sesión debe quedar dentro del cuatrimestre actual.'); continue
        cal = estado_fecha_academica(db, periodo.id, sesion.fecha)
        if not cal['permite_iniciar_clase'] or not cal['requiere_asistencia']:
            error(f"El calendario no permite la sesión: {cal['motivo'] or 'día no lectivo'}."); continue
        slots = db.query(HorarioDisponible).filter(HorarioDisponible.laboratorio_id == lab.id,
            HorarioDisponible.activo == True, HorarioDisponible.dia_semana == sesion.fecha.weekday(),
            HorarioDisponible.hora_inicio >= sesion.hora_inicio, HorarioDisponible.hora_fin <= sesion.hora_fin).order_by(HorarioDisponible.hora_inicio).all()
        slots = [h for h in slots if _normalizar_periodo(h.cuatrimestre) == _normalizar_periodo(periodo.clave)]
        cursor, contiguos = sesion.hora_inicio, True
        for h in slots:
            if h.hora_inicio != cursor: contiguos = False; break
            cursor = h.hora_fin
        if not slots or not contiguos or cursor != sesion.hora_fin:
            error('El laboratorio no tiene disponibilidad configurada que cubra todo ese horario.'); continue
        if db.query(BloqueoSlot).filter(BloqueoSlot.horario_id.in_([h.id for h in slots]), BloqueoSlot.activo == True).first():
            error('El laboratorio tiene un bloqueo institucional.'); continue
        reservas = db.query(Reservacion).join(HorarioDisponible).filter(Reservacion.estado.in_(ACTIVAS),
            or_(Reservacion.periodo_id == periodo.id, Reservacion.periodo_id == None),
            or_(Reservacion.fecha_actividad == sesion.fecha, (Reservacion.fecha_actividad == None) & (HorarioDisponible.dia_semana == sesion.fecha.weekday())),
            HorarioDisponible.hora_inicio < sesion.hora_fin, HorarioDisponible.hora_fin > sesion.hora_inicio).all()
        reservas = [r for r in reservas if r.id not in (excluir_reservas or set()) and (r.periodo_id == periodo.id or _normalizar_periodo(r.cuatrimestre) == _normalizar_periodo(periodo.clave))]
        reutilizables = [r for r in reservas if c and r.laboratorio_id == lab.id and r.docente_id == user.id
            and r.carga_docente_id == c.id and r.estado == 'PROGRAMADA' and r.horario_id in {h.id for h in slots}]
        reutilizar_ids = {r.id for r in reutilizables}
        if reutilizables and {r.horario_id for r in reutilizables} != {h.id for h in slots}:
            error('La reservación existente de la materia no cubre todo el bloque solicitado.'); continue
        if reutilizar_ids and db.query(PracticaLaboratorio).filter(PracticaLaboratorio.reservacion_id.in_(reutilizar_ids),
                PracticaLaboratorio.fecha_sesion == sesion.fecha, PracticaLaboratorio.estado != 'CANCELADA').first():
            error('La materia ya tiene una actividad registrada para esa fecha.'); continue
        if any(r.laboratorio_id == lab.id or r.docente_id == user.id or (grupo and
            ((r.carga_docente and r.carga_docente.grupo_academico_id == grupo.id) or
             (r.grupo == grupo.grupo and r.carrera == grupo.carrera and str(r.cuatrimestre_materia) == str(grupo.cuatrimestre))))
             for r in reservas if r.id not in reutilizar_ids):
            error('Ya existe una reservación del laboratorio, docente o grupo en ese horario.'); continue
        cargas = db.query(CargaDocente).filter(CargaDocente.activo == True, CargaDocente.estado == 'ACTIVO',
            CargaDocente.periodo_id == periodo.id, CargaDocente.dia_semana == sesion.fecha.weekday(),
            CargaDocente.hora_inicio < sesion.hora_fin, CargaDocente.hora_fin > sesion.hora_inicio,
            or_(CargaDocente.docente_id == user.id, CargaDocente.grupo_academico_id == grupo.id) if grupo else CargaDocente.docente_id == user.id).all()
        if any(not c or otra.id != c.id or sesion.fuera_horario for otra in cargas):
            error('El docente o el grupo tiene otra actividad de su horario.'); continue
        if any(f == sesion.fecha and hi < sesion.hora_fin and hf > sesion.hora_inicio for f, hi, hf in vistos):
            error('Las sesiones propuestas se superponen.'); continue
        vistos.append((sesion.fecha, sesion.hora_inicio, sesion.hora_fin))
        filas.append((sesion, c, slots, reutilizables, periodo))
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
    for sesion, carga, slots, reutilizables, periodo in sorted(filas, key=lambda x: (x[0].fecha, x[0].hora_inicio)):
        bloque = str(uuid.uuid4())
        reservas = sorted(reutilizables, key=lambda r: r.horario.hora_inicio)
        for h in ([] if reutilizables else slots):
            r = Reservacion(horario_id=h.id, laboratorio_id=data.laboratorio_id, docente_id=user.id,
                creado_por=user.id, carga_docente_id=carga.id if carga else None, periodo_id=periodo.id, bloque_reserva_id=bloque,
                materia=carga.actividad_nombre if carga else data.titulo, carrera=carga.grupo_academico.carrera if carga else None,
                cuatrimestre=h.cuatrimestre, cuatrimestre_materia=str(carga.grupo_academico.cuatrimestre) if carga else None,
                grupo=carga.grupo_academico.grupo if carga else 'INDIVIDUAL', fecha_actividad=sesion.fecha, estado='PROGRAMADA', tipo_actividad='CLASE' if carga else 'INVESTIGACION')
            db.add(r); db.flush(); reservas.append(r)
        p = PracticaLaboratorio(reservacion_id=reservas[0].id, fecha_sesion=sesion.fecha,
            titulo=origen.titulo if origen else data.titulo, objetivo=origen.objetivo if origen else data.objetivo,
            procedimiento=origen.procedimiento if origen else data.procedimiento,
            notas_seguridad=origen.notas_seguridad if origen else data.notas_seguridad,
            practica_origen_id=origen.id if origen else None, fuera_horario=sesion.fuera_horario or not carga,
            proposito=data.proposito, incluye_practica=data.incluye_practica, participantes=origen.participantes if origen else data.participantes,
            estado='SOLICITADA' if data.incluye_practica else 'PREPARADA')
        db.add(p); db.flush()
        if origen is None: origen = p
        for m in materiales: db.add(MaterialPractica(practica_id=p.id, **m.model_dump()))
        nuevas.append(p)
    origen.plan_estado = 'PLANIFICADA'
    responsables = db.query(Usuario).filter(Usuario.laboratorio_id == data.laboratorio_id,
        Usuario.rol.in_([RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB]), Usuario.activo == True).all()
    for responsable in responsables:
        crear_notificacion(db, responsable.id, 'PRACTICA_LABORATORIO', 'Práctica programada por sesiones',
            f"{user.nombre}: {origen.titulo}, {len(nuevas)} sesión(es). "
            + ('Preparar materiales para cada fecha.' if data.incluye_practica else 'Uso de espacio sin solicitud de materiales.'),
            f'/admin/practicas-laboratorio?practica_id={nuevas[0].id}', enviar_email=False)
    db.flush()
    respuesta = [_serialize(p, db) for p in nuevas]
    db.commit()
    return {'practica_id': origen.id, 'sesiones': respuesta}


def seguimiento_reserva(db, reserva, fecha=None):
    ids = [r.id for r in _bloque(reserva)]
    return db.query(PracticaLaboratorio).filter(PracticaLaboratorio.reservacion_id.in_(ids),
        PracticaLaboratorio.fecha_sesion == (fecha or reserva.fecha_actividad or now_mx().date()),
        PracticaLaboratorio.estado != 'CANCELADA').first()


def contexto_docente(db, user_id, periodo_id=None, desde=None, hasta=None):
    q = db.query(PracticaLaboratorio).join(Reservacion).filter(Reservacion.docente_id == user_id)
    if periodo_id: q = q.filter(Reservacion.periodo_id == periodo_id)
    if desde: q = q.filter(PracticaLaboratorio.fecha_sesion >= desde)
    if hasta: q = q.filter(PracticaLaboratorio.fecha_sesion <= hasta)
    return q.order_by(PracticaLaboratorio.fecha_sesion, PracticaLaboratorio.id).all()


def accion_practica(p):
    return {'proposito': proposito_sesion(p), 'incluye_practica': p.incluye_practica, 'practica_id': p.id, 'practica_titulo': p.titulo, 'practica_estado': p.estado,
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
