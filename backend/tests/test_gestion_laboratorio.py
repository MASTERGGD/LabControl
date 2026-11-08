import datetime as dt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import get_db
from dependencies import get_current_user
from models.usuario import RolUsuario
from models.horario import BloqueoLaboratorio, BloqueoSlot, HorarioDisponible, Reservacion
from models.laboratorio import Laboratorio
from models.practica_laboratorio import PracticaLaboratorio, MaterialPractica
from models.notificacion import Notificacion
from routers.horarios import router
from services.disponibilidad_laboratorio import bloqueo_en


@pytest.fixture
def gestion(db,lab,admin_user,docente_user):
    lab.categoria='QUIMICA'
    slot=HorarioDisponible(laboratorio_id=lab.id,dia_semana=0,hora_inicio='08:00',hora_fin='09:00',cuatrimestre='SEP-DIC-2099')
    db.add(slot);db.flush()
    fecha=dt.date(2099,11,1);fecha+=dt.timedelta(days=(0-fecha.weekday())%7)
    sesiones=[]
    for i in range(3):
        r=Reservacion(laboratorio_id=lab.id,horario_id=slot.id,docente_id=docente_user.id,creado_por=docente_user.id,
            materia='Prueba ficticia',grupo='A',cuatrimestre='SEP-DIC-2099',fecha_actividad=fecha+dt.timedelta(days=7*i))
        db.add(r);db.flush()
        p=PracticaLaboratorio(reservacion_id=r.id,fecha_sesion=r.fecha_actividad,titulo='Actividad ficticia',estado='SOLICITADA',
            practica_origen_id=sesiones[0].id if sesiones else None,plan_estado='PLANIFICADA' if not sesiones else None)
        db.add(p);db.flush();sesiones.append(p)
    db.commit()
    app=FastAPI();app.include_router(router)
    app.dependency_overrides[get_db]=lambda:db
    app.dependency_overrides[get_current_user]=lambda:admin_user
    with TestClient(app) as c:yield c,lab,admin_user,sesiones,slot


def body(lab,fecha):
    return dict(laboratorio_id=lab.id,desde=str(fecha),hasta=str(fecha),hora_inicio='08:00',hora_fin='09:00',motivo='Mantenimiento preventivo')


def test_bloqueo_con_conflictos_no_cancela_ni_guarda(db,gestion):
    c,lab,_,sesiones,_=gestion
    r=c.post('/horarios/gestion/bloqueos',json=body(lab,sesiones[0].fecha_sesion))
    assert r.status_code==409 and r.json()['detail']['conflictos'][0]['practica_id']==sesiones[0].id
    assert db.query(BloqueoLaboratorio).count()==0
    assert all(p.estado=='SOLICITADA' for p in sesiones)


def test_bloqueo_por_fecha_rango_horas_y_habilitacion_conserva_historial(db,gestion):
    c,lab,_,sesiones,_=gestion
    fecha=sesiones[-1].fecha_sesion+dt.timedelta(days=7)
    data=body(lab,fecha);data['hasta']=str(fecha+dt.timedelta(days=2))
    r=c.post('/horarios/gestion/bloqueos',json=data);assert r.status_code==201,r.text
    bid=r.json()['id']
    assert bloqueo_en(db,lab.id,fecha,'08:15','08:45')
    assert not bloqueo_en(db,lab.id,fecha,'09:00','10:00')
    assert not bloqueo_en(db,lab.id,fecha+dt.timedelta(days=3),'08:00','09:00')
    assert c.post('/horarios/gestion/bloqueos',json=data).status_code==409
    assert c.post(f'/horarios/gestion/bloqueos/{bid}/habilitar',json={'motivo':'Mantenimiento terminado'}).status_code==200
    db.expire_all();b=db.get(BloqueoLaboratorio,bid)
    assert not b.activo and b.desactivado_por_id and b.desactivado_en
    assert c.get('/horarios/gestion/agenda',params={'laboratorio_id':lab.id}).json()['bloqueos']==[]


def test_cancelar_una_sesion_y_notificar_sin_afectar_las_siguientes(db,gestion):
    c,lab,_,sesiones,_=gestion
    r=c.post(f'/horarios/gestion/practicas/{sesiones[0].id}/cancelar',json={'motivo':'Laboratorio en revisión','alcance':'SESION'})
    assert r.status_code==200,r.text
    assert [p.estado for p in sesiones]==['CANCELADA','SOLICITADA','SOLICITADA']
    assert sesiones[0].reservacion.estado=='CANCELADA'
    assert db.query(Notificacion).filter(Notificacion.tipo=='RESERVACION').count()==1
    assert c.post('/horarios/gestion/bloqueos',json=body(lab,sesiones[0].fecha_sesion)).status_code==201


def test_cancelar_siguientes_es_atomico_con_materiales_o_sesion_iniciada(db,gestion):
    c,_,_,sesiones,_=gestion
    sesiones[1].estado='PREPARADA'
    db.add(MaterialPractica(practica_id=sesiones[1].id,descripcion='Material ficticio',unidad='ml',cantidad_solicitada=3,cantidad_entregada=3));db.commit()
    r=c.post(f'/horarios/gestion/practicas/{sesiones[0].id}/cancelar',json={'motivo':'Reprogramación de actividad','alcance':'SIGUIENTES'})
    assert r.status_code==409
    assert [p.estado for p in sesiones]==['SOLICITADA','PREPARADA','SOLICITADA']
    assert db.query(Notificacion).count()==0


def test_cancelar_siguientes_no_toca_sesion_anterior_y_preserva_reserva_semanal(db,gestion):
    c,_,_,sesiones,_=gestion
    sesiones[1].reservacion.fecha_actividad=None;db.commit()
    r=c.post(f'/horarios/gestion/practicas/{sesiones[1].id}/cancelar',json={'motivo':'Falta de disponibilidad','alcance':'SIGUIENTES'})
    assert r.status_code==200,r.text
    assert [p.estado for p in sesiones]==['SOLICITADA','CANCELADA','CANCELADA']
    assert sesiones[1].reservacion.estado=='PROGRAMADA'


def test_responsable_solo_su_lab_y_docente_no_hereda_modo(db,gestion):
    c,lab,user,sesiones,slot=gestion
    otro=Laboratorio(nombre='Ajeno ficticio',categoria='QUIMICA');db.add(otro);db.flush()
    user.rol=RolUsuario.RESPONSABLE_LAB;user.laboratorio_id=otro.id;db.commit()
    assert c.get('/horarios/gestion/agenda',params={'laboratorio_id':lab.id}).status_code==403
    assert c.post('/horarios/gestion/bloqueos',json=body(lab,sesiones[0].fecha_sesion)).status_code==403
    assert c.post(f'/horarios/gestion/practicas/{sesiones[0].id}/cancelar',json={'motivo':'Motivo ficticio'}).status_code==403
    user.laboratorio_id=lab.id;db.commit()
    assert c.get('/horarios/gestion/agenda',params={'laboratorio_id':lab.id}).status_code==200
    user.rol=RolUsuario.DOCENTE;db.commit()
    assert c.get('/horarios/gestion/agenda',params={'laboratorio_id':lab.id}).status_code==403


def test_bloqueo_legacy_no_omite_revision_quimica(db,gestion):
    c,_,_,sesiones,slot=gestion
    assert c.post(f'/horarios/{slot.id}/bloquear',json={'motivo':'Prueba de bloqueo'}).status_code==422
    assert db.query(BloqueoSlot).count()==0 and sesiones[0].estado=='SOLICITADA'


def test_reserva_semanal_de_periodo_anterior_no_impide_bloqueo_actual(db,gestion):
    c,lab,user,sesiones,slot=gestion
    db.add(Reservacion(laboratorio_id=lab.id,horario_id=slot.id,docente_id=sesiones[0].reservacion.docente_id,
        creado_por=user.id,materia='Histórica ficticia',grupo='A',cuatrimestre='SEP-DIC 2098',estado='PROGRAMADA'))
    db.commit()
    fecha=sesiones[-1].fecha_sesion+dt.timedelta(days=7)
    r=c.post('/horarios/gestion/bloqueos',json=body(lab,fecha))
    assert r.status_code==201,r.text


@pytest.mark.parametrize('cambios',[{'hora_fin':'07:00'},{'desde':'2000-01-01'},{'motivo':'     '},{'hora_inicio':'8:00'}])
def test_bloqueos_invalidos(gestion,cambios):
    c,lab,_,sesiones,_=gestion
    data=body(lab,sesiones[0].fecha_sesion);data.update(cambios)
    assert c.post('/horarios/gestion/bloqueos',json=data).status_code==422
