import datetime
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import get_db
from dependencies import get_current_user
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio
from models.horario import HorarioDisponible, Reservacion
from models.practica_laboratorio import PracticaLaboratorio
from routers.practicas_laboratorio import router


@pytest.fixture
def seguimiento(db, lab, docente_user):
    lab.categoria = 'QUIMICA'
    slot = HorarioDisponible(laboratorio_id=lab.id, dia_semana=2, hora_inicio='08:00', hora_fin='09:00', cuatrimestre='SEP-DIC-2099')
    db.add(slot); db.flush()
    reserva = Reservacion(horario_id=slot.id, laboratorio_id=lab.id, docente_id=docente_user.id, creado_por=docente_user.id, materia='Química de prueba', cuatrimestre='SEP-DIC-2099', grupo='A')
    db.add(reserva); db.flush()
    for i in range(12):
        db.add(PracticaLaboratorio(reservacion_id=reserva.id, fecha_sesion=datetime.date(2099,11,1)+datetime.timedelta(days=i), titulo=f'Activa {i}', estado='SOLICITADA'))
    for i in range(205):
        db.add(PracticaLaboratorio(reservacion_id=reserva.id, fecha_sesion=datetime.date(2098,1,1)+datetime.timedelta(days=i), titulo=f'Anterior {i}', estado='CANCELADA' if i % 2 else 'CERRADA'))
    otro = Usuario(nombre='Otro ficticio', email='otro@example.test', password_hash='test', rol=RolUsuario.DOCENTE, activo=True)
    db.add(otro); db.flush()
    ajena = Reservacion(horario_id=slot.id, laboratorio_id=lab.id, docente_id=otro.id, creado_por=otro.id, materia='Materia ajena', cuatrimestre='OTRO-PERIODO', grupo='B')
    db.add(ajena); db.flush()
    db.add(PracticaLaboratorio(reservacion_id=ajena.id, fecha_sesion=datetime.date(2099,11,4), titulo='Privada de otro docente', estado='SOLICITADA'))
    db.commit()
    app=FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: docente_user
    with TestClient(app) as client:
        yield client


def test_activas_por_defecto_paginadas_sin_canceladas_y_sin_datos_ajenos(seguimiento):
    r = seguimiento.get('/practicas-laboratorio/seguimiento').json()
    assert r['total'] == 12 and len(r['items']) == 10 and r['paginas'] == 2
    assert r['totales'] == {'activas': 12, 'historial': 205}
    assert r['periodos'] == ['SEP-DIC-2099']
    assert all(p['estado'] == 'SOLICITADA' for p in r['items'])
    assert r['proxima']['titulo'] == 'Activa 0'
    segundo = seguimiento.get('/practicas-laboratorio/seguimiento?pagina=2').json()
    assert len(segundo['items']) == 2
    assert not set(p['id'] for p in r['items']) & set(p['id'] for p in segundo['items'])


def test_historial_supera_limite_antiguo_de_200_y_filtra(seguimiento):
    r=seguimiento.get('/practicas-laboratorio/seguimiento?vista=HISTORIAL&pagina=21').json()
    assert r['total'] == 205 and len(r['items']) == 5
    assert r['items'][-1]['titulo'] == 'Anterior 0'
    r=seguimiento.get('/practicas-laboratorio/seguimiento', params={'vista':'HISTORIAL','estado':'CANCELADA','buscar':'Anterior','periodo':'SEP-DIC-2099','desde':'2098-01-01','hasta':'2098-01-04'}).json()
    assert r['total'] == 2
    assert all(p['estado'] == 'CANCELADA' for p in r['items'])


def test_filtros_sin_resultados_y_pagina_fuera_de_rango(seguimiento):
    r=seguimiento.get('/practicas-laboratorio/seguimiento?buscar=inexistente&pagina=99').json()
    assert r['items'] == [] and r['total'] == 0 and r['pagina'] == 1
    assert seguimiento.get('/practicas-laboratorio/seguimiento?desde=2099-12-31&hasta=2099-01-01').status_code == 422
    assert seguimiento.get('/practicas-laboratorio/seguimiento?tamano=500').status_code == 422


def test_responsable_solo_ve_su_laboratorio(db, seguimiento, docente_user):
    otro = Laboratorio(nombre='Laboratorio ajeno', categoria='QUIMICA', activo=True)
    db.add(otro); db.flush()
    docente_user.rol = RolUsuario.RESPONSABLE_LAB; docente_user.laboratorio_id = otro.id; db.commit()
    r = seguimiento.get('/practicas-laboratorio/seguimiento').json()
    assert r['items'] == [] and r['totales'] == {'activas':0,'historial':0}
    assert r['reservaciones_con_practica'] == [] and r['proxima'] is None


def test_acceso_menu_sin_practicas_no_se_activa_por_reservar_o_por_otro_docente(db, seguimiento, docente_user):
    db.query(PracticaLaboratorio).filter(PracticaLaboratorio.titulo != 'Privada de otro docente').delete(synchronize_session=False)
    db.commit()
    assert seguimiento.get('/practicas-laboratorio/acceso-docente').json() == {'tiene_practicas': False}


@pytest.mark.parametrize('categoria', ['QUIMICA', 'AGROINDUSTRIA'])
def test_acceso_menu_conserva_historial_cancelado_sin_depender_del_periodo(db, seguimiento, lab, categoria):
    lab.categoria = categoria
    db.query(PracticaLaboratorio).update({'estado':'CANCELADA'}, synchronize_session=False)
    db.commit()
    r = seguimiento.get('/practicas-laboratorio/acceso-docente?periodo_id=9999&periodo=AJENO')
    assert r.status_code == 200 and r.json() == {'tiene_practicas': True}


def test_acceso_menu_es_consulta_docente_no_cambia_permisos_de_responsables(db, seguimiento, docente_user):
    docente_user.rol = RolUsuario.RESPONSABLE_LAB; db.commit()
    assert seguimiento.get('/practicas-laboratorio/acceso-docente').status_code == 403

def test_contadores_y_resultados_comparten_busqueda_fechas_y_estado(seguimiento):
    r=seguimiento.get('/practicas-laboratorio/seguimiento',params={'vista':'HISTORIAL','buscar':'inexistente'}).json()
    assert r['total']==0 and r['items']==[] and r['totales']=={'activas':0,'historial':0}
    r=seguimiento.get('/practicas-laboratorio/seguimiento',params={'vista':'HISTORIAL','estado':'CANCELADA','buscar':'Anterior','desde':'2098-01-01','hasta':'2098-01-04'}).json()
    assert r['total']==r['totales']['historial']==2 and r['totales']['activas']==0
    r=seguimiento.get('/practicas-laboratorio/seguimiento',params={'vista':'ACTIVAS','estado':'CANCELADA','buscar':'Anterior','desde':'2098-01-01','hasta':'2098-01-04'}).json()
    assert r['total']==r['totales']['activas']==0 and r['totales']['historial']==2


@pytest.mark.parametrize('periodo',['SEP-DIC 2099','sep-dic-2099',' SEP–DIC\u00a02099 ','SEPDIC2099'])
def test_periodo_heredado_reconoce_formatos_equivalentes(seguimiento,periodo):
    r=seguimiento.get('/practicas-laboratorio/seguimiento',params={'vista':'HISTORIAL','periodo':periodo}).json()
    assert r['total']==r['totales']['historial']==205
    assert r['totales']['activas']==12


def test_periodo_formal_prevalece_y_opciones_no_se_duplican(db,seguimiento):
    from models.catalogo import PeriodoEscolar
    formal=PeriodoEscolar(clave='SEP-DIC 2099',activo=True,es_actual=True)
    db.add(formal);db.flush()
    reserva=db.query(Reservacion).filter_by(materia='Química de prueba').one()
    reserva.periodo_id=formal.id
    reserva.cuatrimestre='TEXTO HEREDADO INCONSISTENTE'
    db.commit()
    r=seguimiento.get('/practicas-laboratorio/seguimiento',params={'vista':'HISTORIAL','periodo':'SEP-DIC-2099'}).json()
    assert r['total']==r['totales']['historial']==205 and r['periodos']==['SEP-DIC 2099']
    r=seguimiento.get('/practicas-laboratorio/seguimiento',params={'vista':'HISTORIAL','periodo':'TEXTO HEREDADO INCONSISTENTE'}).json()
    assert r['total']==0 and r['totales']=={'activas':0,'historial':0}


def test_periodos_equivalentes_de_activa_e_historial_se_consultan_juntos(db,seguimiento):
    original=db.query(Reservacion).filter_by(materia='Química de prueba').one()
    otra=Reservacion(horario_id=original.horario_id,laboratorio_id=original.laboratorio_id,docente_id=original.docente_id,
        creado_por=original.creado_por,materia=original.materia,grupo=original.grupo,cuatrimestre='SEP-DIC 2099')
    db.add(otra);db.flush()
    registro=db.query(PracticaLaboratorio).filter_by(titulo='Anterior 0').one();registro.reservacion_id=otra.id;db.commit()
    r=seguimiento.get('/practicas-laboratorio/seguimiento',params={'vista':'HISTORIAL','periodo':'SEP-DIC-2099','buscar':'Anterior 0'}).json()
    assert r['total']==r['totales']['historial']==1 and r['items'][0]['id']==registro.id
    assert len(r['periodos'])==1
    assert r['totales']['activas']==0
