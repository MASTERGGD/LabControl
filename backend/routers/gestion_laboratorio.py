import datetime as dt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload
from database import get_db
from dependencies import get_current_user
from models.horario import BloqueoLaboratorio, Reservacion, HorarioDisponible
from models.practica_laboratorio import PracticaLaboratorio
from models.sesion import SesionClase
from models.notificacion import Notificacion
from models.usuario import Usuario
from services.disponibilidad_laboratorio import laboratorio_gestion
from services.auditoria import registrar, Recurso
from services.programacion_practicas import now_mx

router = APIRouter(prefix='/gestion')


class Motivo(BaseModel):
    motivo: str = Field(min_length=5, max_length=300)

    @model_validator(mode='after')
    def validar(self):
        self.motivo = self.motivo.strip()
        if len(self.motivo) < 5: raise ValueError('Describe un motivo de al menos 5 caracteres.')
        return self


class BloqueoBody(Motivo):
    laboratorio_id: int
    desde: dt.date
    hasta: dt.date
    hora_inicio: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    hora_fin: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')

    @model_validator(mode='after')
    def rango(self):
        if self.desde < now_mx().date() or self.hasta < self.desde or (self.hasta-self.desde).days > 366:
            raise ValueError('Elige un rango desde hoy y de hasta 366 días.')
        if self.hora_fin <= self.hora_inicio: raise ValueError('La hora final debe ser posterior al inicio.')
        return self


class CancelarBody(Motivo):
    alcance: str = Field(default='SESION', pattern='^(SESION|SIGUIENTES)$')


def serializar(b):
    return {k: str(getattr(b,k)) if k in {'desde','hasta','creado_en'} else getattr(b,k)
            for k in ['id','laboratorio_id','desde','hasta','hora_inicio','hora_fin','motivo','creado_en','creado_por_id','activo']}


@router.get('/agenda')
def agenda(laboratorio_id: int, db: Session=Depends(get_db), user: Usuario=Depends(get_current_user)):
    laboratorio_gestion(db,laboratorio_id,user)
    practicas=db.query(PracticaLaboratorio).join(Reservacion).filter(Reservacion.laboratorio_id==laboratorio_id,
        PracticaLaboratorio.estado.in_(['SOLICITADA','PREPARADA','EN_CURSO'])).options(
            joinedload(PracticaLaboratorio.reservacion).joinedload(Reservacion.docente),
            joinedload(PracticaLaboratorio.reservacion).joinedload(Reservacion.horario)).order_by(PracticaLaboratorio.fecha_sesion).all()
    return {'practicas':[dict(id=p.id,raiz=p.practica_origen_id or p.id,titulo=p.titulo,fecha=str(p.fecha_sesion),estado=p.estado,
        docente=p.reservacion.docente.nombre,hora=p.reservacion.horario.hora_inicio,
        fin=p.reservacion.horario.hora_fin) for p in practicas],
        'bloqueos':[serializar(b) for b in db.query(BloqueoLaboratorio).filter(
            BloqueoLaboratorio.laboratorio_id==laboratorio_id,BloqueoLaboratorio.activo==True,
            BloqueoLaboratorio.hasta>=now_mx().date()).order_by(BloqueoLaboratorio.desde).all()]}


def conflictos(db, data):
    reservas=db.query(Reservacion).join(HorarioDisponible).filter(
        Reservacion.laboratorio_id==data.laboratorio_id,
        Reservacion.estado.in_(['PROGRAMADA','EN_CURSO','EN_DISPUTA','PENDIENTE_AUTORIZACION']),
        HorarioDisponible.hora_inicio<data.hora_fin,HorarioDisponible.hora_fin>data.hora_inicio,
        or_(Reservacion.fecha_actividad==None,Reservacion.fecha_actividad.between(data.desde,data.hasta)),
    ).options(joinedload(Reservacion.horario),joinedload(Reservacion.docente)).all()
    resultado=[]
    for r in reservas:
        fecha=r.fecha_actividad or data.desde+dt.timedelta(days=(r.horario.dia_semana-data.desde.weekday())%7)
        while fecha<=data.hasta:
            vinculos=[PracticaLaboratorio.reservacion_id==r.id]
            if r.bloque_reserva_id: vinculos.append(Reservacion.bloque_reserva_id==r.bloque_reserva_id)
            if r.carga_docente_id: vinculos.append(Reservacion.carga_docente_id==r.carga_docente_id)
            practica=db.query(PracticaLaboratorio).join(Reservacion).filter(or_(*vinculos),
                Reservacion.laboratorio_id==data.laboratorio_id,PracticaLaboratorio.fecha_sesion==fecha).order_by(PracticaLaboratorio.id.desc()).first()
            if not practica or practica.estado!='CANCELADA':
                resultado.append(dict(reservacion_id=r.id,practica_id=practica.id if practica else None,
                    fecha=str(fecha),docente=r.docente.nombre,materia=r.materia,hora=r.horario.hora_inicio,
                    recurrente=r.fecha_actividad is None))
            if r.fecha_actividad: break
            fecha+=dt.timedelta(days=7)
    if data.desde<=now_mx().date()<=data.hasta:
        for s in db.query(SesionClase).filter(SesionClase.laboratorio_id==data.laboratorio_id,SesionClase.estado=='ABIERTA').all():
            resultado.append(dict(sesion_id=s.id,mensaje='Sesión en curso: ciérrala antes de bloquear hoy.'))
    return resultado


@router.post('/bloqueos',status_code=201)
def bloquear(data: BloqueoBody, db: Session=Depends(get_db), user: Usuario=Depends(get_current_user)):
    laboratorio_gestion(db,data.laboratorio_id,user)
    afectados=conflictos(db,data)
    if afectados:
        raise HTTPException(409,{'message':'No se creó el bloqueo. Revisa las actividades afectadas y resuelve sus cancelaciones explícitamente.', 'conflictos':afectados})
    existente=db.query(BloqueoLaboratorio).filter(BloqueoLaboratorio.laboratorio_id==data.laboratorio_id,
        BloqueoLaboratorio.activo==True,BloqueoLaboratorio.desde<=data.hasta,BloqueoLaboratorio.hasta>=data.desde,
        BloqueoLaboratorio.hora_inicio<data.hora_fin,BloqueoLaboratorio.hora_fin>data.hora_inicio).first()
    if existente: raise HTTPException(409,'Ya existe un bloqueo que coincide con estas fechas y horas.')
    b=BloqueoLaboratorio(**data.model_dump(),creado_por_id=user.id)
    db.add(b);db.commit();db.refresh(b)
    registrar(db,accion='BLOQUEAR_LABORATORIO',recurso=Recurso.HORARIO,usuario=user,recurso_id=b.id,detalle=serializar(b))
    return serializar(b)


@router.post('/bloqueos/{bloqueo_id}/habilitar')
def habilitar(bloqueo_id: int,data: Motivo,db: Session=Depends(get_db),user: Usuario=Depends(get_current_user)):
    b=db.get(BloqueoLaboratorio,bloqueo_id)
    if not b: raise HTTPException(404,'Bloqueo no encontrado.')
    laboratorio_gestion(db,b.laboratorio_id,user)
    if not b.activo: raise HTTPException(409,'El bloqueo ya está desactivado.')
    b.activo=False;b.desactivado_por_id=user.id;b.desactivado_en=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    db.commit()
    registrar(db,accion='HABILITAR_LABORATORIO',recurso=Recurso.HORARIO,usuario=user,recurso_id=b.id,detalle={'motivo':data.motivo,'laboratorio_id':b.laboratorio_id})
    return {'mensaje':'Disponibilidad habilitada. Las cancelaciones anteriores no se restauran automáticamente.'}


@router.post('/practicas/{practica_id}/cancelar')
def cancelar(practica_id: int,data: CancelarBody,db: Session=Depends(get_db),user: Usuario=Depends(get_current_user)):
    p=db.get(PracticaLaboratorio,practica_id)
    if not p: raise HTTPException(404,'Sesión no encontrada.')
    laboratorio_gestion(db,p.reservacion.laboratorio_id,user)
    from routers.practicas_laboratorio import _bloquear_plan, _reservas_de_practica
    from services.programacion_practicas import sesiones_plan
    from services.requerimientos import cancelar_requerimientos_pendientes
    _bloquear_plan(db,p)
    plan=sesiones_plan(db,p)
    objetivos=[x for x in plan if x.id==p.id or (data.alcance=='SIGUIENTES' and x.fecha_sesion>=p.fecha_sesion and x.estado in {'SOLICITADA','PREPARADA','EN_CURSO'})]
    for x in objetivos:
        if x.reservacion.laboratorio_id != p.reservacion.laboratorio_id:
            raise HTTPException(409,'Las siguientes sesiones incluyen otro laboratorio. Su responsable debe gestionar esas fechas.')
        if x.estado not in {'SOLICITADA','PREPARADA'} or x.iniciada_en or any(m.cantidad_entregada>0 for m in x.materiales):
            raise HTTPException(409,'No se canceló ninguna sesión. Hay una sesión iniciada, cerrada o con materiales entregados; resuelve su devolución y cierre antes de cancelar.')
        reservas=_reservas_de_practica(db,x)
        if any(r.laboratorio_id!=p.reservacion.laboratorio_id or r.docente_id!=p.reservacion.docente_id or r.fecha_actividad!=x.reservacion.fecha_actividad for r in reservas):
            raise HTTPException(409,'No se pudo validar el bloque completo de esta sesión.')
        if db.query(SesionClase).filter(SesionClase.reservacion_id.in_([r.id for r in reservas]),SesionClase.estado=='ABIERTA').first():
            raise HTTPException(409,'La sesión ya inició. Registra su cierre antes de cancelar.')
    for x in objetivos:
        x.estado='CANCELADA'
        for r in _reservas_de_practica(db,x):
            if r.fecha_actividad:
                r.estado='CANCELADA';cancelar_requerimientos_pendientes(db,r.id,user.id)
        db.add(Notificacion(usuario_id=x.reservacion.docente_id,tipo='RESERVACION',titulo='Sesión de laboratorio cancelada',
            mensaje=f'{x.titulo} · {x.fecha_sesion}. Motivo: {data.motivo}',url=f'/docente/practicas-laboratorio?vista=HISTORIAL&practica_id={x.id}'))
    if all(x.estado in {'CANCELADA','CERRADA'} for x in plan):
        next(x for x in plan if x.id==(p.practica_origen_id or p.id)).plan_estado='FINALIZADA'
    db.commit()
    registrar(db,accion='CANCELAR_SESIONES_LABORATORIO',recurso=Recurso.RESERVACION,usuario=user,recurso_id=p.reservacion_id,
        detalle={'sesiones':[x.id for x in objetivos],'motivo':data.motivo,'alcance':data.alcance})
    return {'mensaje':'Sesiones canceladas; el docente tiene una notificación en SIGA.','sesiones':[x.id for x in objetivos]}
