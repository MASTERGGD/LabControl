import datetime as dt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import get_db
from dependencies import get_current_user
from models.catalogo import PeriodoEscolar, GrupoAcademico, CatalogoAlumno, InscripcionAlumno
from models.docencia import CargaDocente, ClaseDocente, AsistenciaDocente
from models.horario import HorarioDisponible, Reservacion, BloqueoSlot
from models.practica_laboratorio import PracticaLaboratorio
from models.notificacion import Notificacion
from models.usuario import Usuario
from routers.practicas_laboratorio import router
from services.timezone import MEXICO_TZ


@pytest.fixture
def plan(db, lab, docente_user, monkeypatch):
    import services.programacion_practicas as service
    import routers.practicas_laboratorio as practicas
    ahora = dt.datetime(2026,11,9,8,0,tzinfo=MEXICO_TZ)
    monkeypatch.setattr(service,'now_mx',lambda:ahora)
    monkeypatch.setattr(practicas,'now_mx',lambda:ahora)
    lab.categoria='QUIMICA'
    periodo=PeriodoEscolar(clave='SEP-DIC 2026',es_actual=True,activo=True)
    db.add(periodo);db.flush()
    grupo=GrupoAcademico(periodo_id=periodo.id,carrera='Agricultura',cuatrimestre=3,grupo='A',activo=True)
    db.add(grupo);db.flush()
    cargas=[]
    for dia in [0,2,4]:
        c=CargaDocente(docente_id=docente_user.id,periodo_id=periodo.id,grupo_academico_id=grupo.id,
            actividad_nombre='Manejo de Postcosecha',tipo_actividad='CLASE',dia_semana=dia,hora_inicio='08:00',hora_fin='10:00',estado='ACTIVO',activo=True)
        db.add(c);db.flush();cargas.append(c)
        for inicio,fin in [('08:00','09:00'),('09:00','10:00'),('16:00','17:00')]:
            db.add(HorarioDisponible(laboratorio_id=lab.id,dia_semana=dia,hora_inicio=inicio,hora_fin=fin,cuatrimestre='SEP-DIC-2026',activo=True))
    alumno=CatalogoAlumno(matricula='TEST1',apellido_paterno='Prueba',apellido_materno='Ficticia',nombres='Alumno',carrera='Agricultura',cuatrimestre=3,grupo='A',periodo=periodo.clave,activo=True)
    db.add(alumno);db.flush();db.add(InscripcionAlumno(alumno_id=alumno.id,grupo_academico_id=grupo.id,estado='ACTIVO'));db.commit()
    app=FastAPI();app.include_router(router)
    from routers.notificaciones import router as notificaciones
    app.include_router(notificaciones)
    from routers.docencia import router as docencia
    app.include_router(docencia)
    from routers.sesiones import router as sesiones
    app.include_router(sesiones)
    import routers.sesiones as sesiones_mod
    monkeypatch.setattr(sesiones_mod, "now_mx", lambda: ahora)
    import routers.docencia as docencia_mod
    monkeypatch.setattr(docencia_mod, "_ahora_mx", lambda: ahora)
    app.dependency_overrides[get_db]=lambda:db
    app.dependency_overrides[get_current_user]=lambda:docente_user
    with TestClient(app) as client:
        yield client, {'laboratorio_id':lab.id,'titulo':'Conservación de frutos','sesiones':[
            {'fecha':fecha,'carga_id':c.id,'hora_inicio':'08:00','hora_fin':'10:00'}
            for fecha,c in zip(['2026-11-09','2026-11-11','2026-11-13'],cargas)]},cargas,alumno


def test_tres_sesiones_atomicas_vinculadas_con_materiales_por_fecha(plan,db):
    client,payload,cargas,_=plan
    payload['materiales']=[{'descripcion':'Frutos de prueba','cantidad_solicitada':3}]
    r=client.post('/practicas-laboratorio/programacion/validar',json=payload)
    assert r.status_code==200 and r.json()['disponible'],r.text
    assert db.query(Reservacion).count()==0
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==201,r.text
    sesiones=r.json()['sesiones'];assert len(sesiones)==3
    assert {p['practica_origen_id'] for p in sesiones}=={r.json()['practica_id']}
    assert all(p['total_sesiones']==3 and p['materiales'][0]['cantidad_solicitada']==3 for p in sesiones)
    assert db.query(Reservacion).count()==6
    assert [p['carga_docente_id'] for p in sesiones]==[c.id for c in cargas]
    assert all(p['hora_inicio']=='08:00' and p['hora_fin']=='10:00' for p in sesiones)


def test_conflicto_en_segunda_fecha_no_guarda_reservas_parciales(plan,db):
    client,payload,cargas,_=plan
    slot=db.query(HorarioDisponible).filter_by(dia_semana=2,hora_inicio='09:00').one()
    db.add(BloqueoSlot(horario_id=slot.id,motivo='Mantenimiento',creado_por_id=cargas[0].docente_id,activo=True));db.commit()
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==409 and r.json()['detail']['conflictos'][0]['sesion']==2,r.text
    assert db.query(Reservacion).count()==0 and db.query(PracticaLaboratorio).count()==0


def test_fuera_horario_permitido_y_cruces_docente_grupo_rechazados(plan,db):
    client,payload,cargas,_=plan
    payload['sesiones']=payload['sesiones'][:1]
    payload['sesiones'][0].update(hora_inicio='16:00',hora_fin='17:00',fuera_horario=True)
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==201,r.text
    assert r.json()['sesiones'][0]['fuera_horario'] is True
    assert client.post('/practicas-laboratorio/programacion',json=payload).status_code==409
    payload['sesiones'][0].update(hora_inicio='08:00',hora_fin='09:00')
    r=client.post('/practicas-laboratorio/programacion/validar',json=payload)
    assert r.json()['disponible'] is False


def test_no_reservar_ajena_ni_sesion_fuera_de_horario_sin_indicarlo(plan,db,admin_user):
    client,payload,cargas,_=plan
    cargas[0].docente_id=admin_user.id;db.commit()
    assert client.post('/practicas-laboratorio/programacion/validar',json=payload).json()['disponible'] is False
    cargas[0].docente_id=cargas[1].docente_id;db.commit()
    payload['sesiones'][0]['hora_inicio']='09:00'
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==409 and db.query(Reservacion).count()==0


def test_cerrar_sesion_sin_finalizar_conserva_plan_y_asistencia_academica(plan,db):
    client,payload,cargas,alumno=plan
    response=client.post('/practicas-laboratorio/programacion',json=payload).json()
    p=db.get(PracticaLaboratorio,response['practica_id']);p.estado='PREPARADA';db.commit()
    r=client.post(f'/practicas-laboratorio/{p.id}/iniciar');assert r.status_code==200,r.text
    assert db.query(ClaseDocente).count()==1
    r=client.put(f'/practicas-laboratorio/{p.id}/asistencia',json={'alumnos':[{'alumno_id':alumno.id,'estado':'RETARDO'}]})
    assert r.status_code==200 and db.query(AsistenciaDocente).one().estado=='RETARDO'
    r=client.post(f'/practicas-laboratorio/{p.id}/cerrar',json={'materiales':[],'resultados':'Primera observación'})
    assert r.status_code==200 and r.json()['plan_estado']=='PLANIFICADA',r.text
    assert db.query(ClaseDocente).one().estado=='CERRADA'
    assert db.query(Reservacion).filter_by(estado='PROGRAMADA').count()==4
    assert db.query(Reservacion).filter_by(estado='IMPARTIDA').count()==2


def test_inicio_fuera_de_ventana_y_sin_preparacion_no_crea_asistencia(plan,db,monkeypatch):
    client,payload,_,_=plan
    p_id=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    assert client.post(f'/practicas-laboratorio/{p_id}/iniciar').status_code==409
    p=db.get(PracticaLaboratorio,p_id);p.estado='PREPARADA';db.commit()
    import services.programacion_practicas as service
    monkeypatch.setattr(service,'now_mx',lambda:dt.datetime(2026,11,9,10,16,tzinfo=MEXICO_TZ))
    assert client.post(f'/practicas-laboratorio/{p_id}/iniciar').status_code==409
    assert db.query(ClaseDocente).count()==0


def test_finalizar_anticipadamente_exige_confirmacion_y_libera_futuras(plan,db):
    client,payload,_,_=plan
    p_id=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    assert client.post(f'/practicas-laboratorio/{p_id}/finalizar-plan',json={}).status_code==409
    r=client.post(f'/practicas-laboratorio/{p_id}/finalizar-plan',json={'cancelar_futuras':True})
    assert r.status_code==200 and r.json()['plan_estado']=='FINALIZADA',r.text
    assert db.query(Reservacion).filter_by(estado='PROGRAMADA').count()==0
    payload['practica_origen_id']=p_id
    assert client.post('/practicas-laboratorio/programacion',json=payload).status_code==409


def test_agregar_sesiones_conserva_practica_y_valida_otra_vez(plan,db):
    client,payload,_,_=plan
    p_id=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    payload['practica_origen_id']=p_id
    payload['sesiones']=payload['sesiones'][:1];payload['sesiones'][0]['fecha']='2026-11-16'
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==201 and r.json()['practica_id']==p_id,r.text
    assert r.json()['sesiones'][0]['total_sesiones']==4
    assert client.post('/practicas-laboratorio/programacion',json=payload).status_code==409

def test_panel_y_horario_apuntan_a_la_practica_sin_duplicar_clase(plan):
    client,payload,_,_=plan
    p_id=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    hoy=client.get('/docencia/hoy');assert hoy.status_code==200,hoy.text
    assert hoy.json()[0]['practica_id']==p_id
    tablero=client.get('/docencia/dashboard');assert tablero.status_code==200,tablero.text
    assert len(tablero.json()['jornada'])==1
    assert tablero.json()['jornada'][0]['practica_url'].endswith(f'practica_id={p_id}')
    assert client.post(f"/docencia/horario/{payload['sesiones'][0]['carga_id']}/iniciar").status_code==409


def test_aviso_proximo_se_deduplica_y_apunta_a_sesion_exacta(plan,db,monkeypatch):
    client,payload,_,_=plan
    p_id=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    import services.timezone as timezone
    monkeypatch.setattr(timezone,'now_mx',lambda:dt.datetime(2026,11,9,7,40,tzinfo=MEXICO_TZ))
    assert client.post('/notificaciones/verificar').status_code==200
    assert client.post('/notificaciones/verificar').status_code==200
    avisos=db.query(Notificacion).filter_by(tipo='PRACTICA_PROXIMA').all()
    assert len(avisos)==1
    assert avisos[0].url.endswith(f'practica_id={p_id}')
    assert 'pendiente' in avisos[0].mensaje


def test_ultima_sesion_deja_pendiente_continuacion_visible(plan,db):
    client,payload,_,_=plan
    payload['sesiones']=payload['sesiones'][:1]
    p_id=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    p=db.get(PracticaLaboratorio,p_id);p.estado='PREPARADA';db.commit()
    assert client.post(f'/practicas-laboratorio/{p_id}/iniciar').status_code==200
    r=client.post(f'/practicas-laboratorio/{p_id}/cerrar',json={})
    assert r.status_code==200 and r.json()['plan_estado']=='PENDIENTE_CONTINUACION',r.text
    hist=client.get('/docencia/historial');assert hist.status_code==200,hist.text
    assert hist.json()[0]['practicas'][0]['practica_id']==p_id
    agenda=client.get('/practicas-laboratorio/agenda-docente').json()
    assert agenda[0]['plan_estado']=='PENDIENTE_CONTINUACION'


def test_migracion_conserva_practicas_y_permite_relacionar_sesiones(tmp_path):
    import importlib.util
    from pathlib import Path
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    engine=sa.create_engine('sqlite:///'+str(tmp_path/'practicas.db'))
    metadata=sa.MetaData()
    sa.Table('practicas_laboratorio',metadata,sa.Column('id',sa.Integer,primary_key=True),sa.Column('titulo',sa.String(180),nullable=False))
    metadata.create_all(engine)
    file=Path(__file__).parents[1]/'alembic/versions/e6f7a8b9c0d1_practicas_multisesion.py'
    spec=importlib.util.spec_from_file_location('migration',file);migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO practicas_laboratorio(id,titulo) VALUES (1,'Práctica existente')"))
        with Operations.context(MigrationContext.configure(conn)):migration.upgrade()
        assert conn.execute(sa.text('SELECT titulo, practica_origen_id, plan_estado, fuera_horario FROM practicas_laboratorio')).one()==('Práctica existente',None,None,False)
        conn.execute(sa.text("INSERT INTO practicas_laboratorio(id,titulo,practica_origen_id) VALUES (2,'Continuación',1)"))
        assert conn.execute(sa.text('SELECT count(*) FROM practicas_laboratorio')).scalar_one()==2
    engine.dispose()

def test_reutiliza_reserva_recurrente_de_materia_sin_cancelar_horario_oficial(plan,db):
    client,payload,cargas,_=plan
    for slot in db.query(HorarioDisponible).filter_by(dia_semana=0).all():
        if slot.hora_inicio >= '10:00':continue
        db.add(Reservacion(horario_id=slot.id,laboratorio_id=payload['laboratorio_id'],docente_id=cargas[0].docente_id,
            creado_por=cargas[0].docente_id,carga_docente_id=cargas[0].id,periodo_id=cargas[0].periodo_id,
            materia=cargas[0].actividad_nombre,carrera='Agricultura',cuatrimestre='SEP-DIC-2026',cuatrimestre_materia='3',grupo='A',estado='PROGRAMADA',bloque_reserva_id='recurrente-de-prueba'))
    db.commit()
    payload['sesiones']=payload['sesiones'][:1]
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==201,r.text
    assert db.query(Reservacion).count()==2
    p_id=r.json()['practica_id']
    assert client.post(f'/practicas-laboratorio/{p_id}/finalizar-plan',json={'cancelar_futuras':True}).status_code==200
    assert db.query(Reservacion).filter_by(estado='PROGRAMADA').count()==2


def test_no_iniciar_cuando_bloquean_laboratorio_despues_de_programar(plan,db):
    client,payload,cargas,_=plan
    p_id=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    p=db.get(PracticaLaboratorio,p_id);p.estado='PREPARADA'
    db.add(BloqueoSlot(horario_id=p.reservacion.horario_id,motivo='Bloqueo nuevo',creado_por_id=cargas[0].docente_id,activo=True));db.commit()
    assert client.post(f'/practicas-laboratorio/{p_id}/iniciar').status_code==409
    assert db.query(ClaseDocente).count()==0


def test_materiales_por_sesion_y_devolucion_conservan_existencias(plan,db,docente_user):
    from models.practica_laboratorio import InsumoLaboratorio, MovimientoInsumoLaboratorio
    from models.usuario import RolUsuario
    client,payload,_,_=plan
    stock=InsumoLaboratorio(laboratorio_id=payload['laboratorio_id'],nombre='Insumo ficticio',cantidad_disponible=7,stock_minimo=0,unidad='PIEZA')
    db.add(stock);db.commit()
    payload['sesiones']=payload['sesiones'][:1]
    payload['materiales']=[{'insumo_id':stock.id,'descripcion':stock.nombre,'cantidad_solicitada':3}]
    r=client.post('/practicas-laboratorio/programacion',json=payload).json()
    p_id=r['practica_id'];material_id=r['sesiones'][0]['materiales'][0]['id']
    docente_user.rol=RolUsuario.RESPONSABLE_LAB;docente_user.laboratorio_id=payload['laboratorio_id'];db.commit()
    preparada=client.post(f'/practicas-laboratorio/{p_id}/preparar',json={'materiales':[{'material_id':material_id,'cantidad_entregada':3}]})
    assert preparada.status_code==200,preparada.text
    db.refresh(stock);assert stock.cantidad_disponible==4
    docente_user.rol=RolUsuario.DOCENTE;db.commit()
    assert client.post(f'/practicas-laboratorio/{p_id}/iniciar').status_code==200
    cierre=client.post(f'/practicas-laboratorio/{p_id}/cerrar',json={'finalizar_practica':True,'materiales':[{'material_id':material_id,'cantidad_consumida':2,'cantidad_merma':0,'cantidad_devuelta':1}]})
    assert cierre.status_code==200,cierre.text
    db.refresh(stock);assert stock.cantidad_disponible==5
    assert db.query(MovimientoInsumoLaboratorio).filter_by(tipo='DEVOLUCION').one().cantidad==1

def test_uso_individual_sin_carga_inicia_y_cierra_sin_clase_ni_lista(plan,db):
    client,payload,cargas,_=plan
    for c in cargas:c.activo=False
    db.commit()
    payload.update(proposito='INDIVIDUAL',incluye_practica=False,objetivo='Estudiar conservación de muestras',participantes='Trabajo del solicitante')
    payload['sesiones']=[{'fecha':'2026-11-09','hora_inicio':'08:00','hora_fin':'10:00'}]
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==201,r.text
    p=r.json()['sesiones'][0];assert p['proposito']=='INDIVIDUAL' and p['carga_docente_id'] is None
    assert p['estado']=='PREPARADA' and p['participantes']=='Trabajo del solicitante'
    iniciado=client.post(f"/practicas-laboratorio/{p['id']}/iniciar")
    assert iniciado.status_code==200 and iniciado.json()['asistencias']==[],iniciado.text
    assert db.query(ClaseDocente).count()==0 and db.query(AsistenciaDocente).count()==0
    assert client.put(f"/practicas-laboratorio/{p['id']}/asistencia",json={'alumnos':[{'alumno_id':1,'estado':'PRESENTE'}]}).status_code==409
    cerrado=client.post(f"/practicas-laboratorio/{p['id']}/cerrar",json={'resultados':'Se registró el avance','finalizar_practica':True})
    assert cerrado.status_code==200 and cerrado.json()['resultados']=='Se registró el avance',cerrado.text
    assert db.query(ClaseDocente).count()==0
    historial=client.get('/practicas-laboratorio/agenda-docente?historial=true').json()
    assert historial[0]['proposito']=='INDIVIDUAL'


def test_individual_exige_objetivo_y_no_permite_carga_disfrazada(plan,db):
    client,payload,_,_=plan
    payload.update(proposito='INDIVIDUAL',objetivo='',incluye_practica=False)
    assert client.post('/practicas-laboratorio/programacion',json=payload).status_code==422
    payload['objetivo']='Estudio de muestras'
    assert client.post('/practicas-laboratorio/programacion',json=payload).status_code==409
    assert db.query(Reservacion).count()==0


def test_individual_varias_fechas_conflicto_del_docente_no_guarda_parcial(plan,db):
    client,payload,_,_=plan
    payload.update(proposito='INDIVIDUAL',incluye_practica=False,objetivo='Estudio individual de muestras')
    payload['sesiones']=[{'fecha':'2026-11-09','hora_inicio':'16:00','hora_fin':'17:00'}, {'fecha':'2026-11-11','hora_inicio':'08:00','hora_fin':'10:00'}]
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==409 and r.json()['detail']['conflictos'][0]['sesion']==2,r.text
    assert db.query(Reservacion).count()==0


def test_academica_sin_practica_reserva_espacio_y_asistencia_sin_preparar(plan,db):
    client,payload,_,_=plan
    payload['incluye_practica']=False;payload['sesiones']=payload['sesiones'][:1]
    r=client.post('/practicas-laboratorio/programacion',json=payload)
    assert r.status_code==201,r.text
    p=r.json()['sesiones'][0];assert p['estado']=='PREPARADA' and not p['incluye_practica']
    r=client.post(f"/practicas-laboratorio/{p['id']}/iniciar")
    assert r.status_code==200 and len(r.json()['asistencias'])==1,r.text
    assert db.query(ClaseDocente).count()==1


def test_no_materiales_sin_activar_practica_y_no_cambiar_proposito_al_continuar(plan):
    client,payload,_,_=plan
    payload['incluye_practica']=False;payload['materiales']=[{'descripcion':'Reactivo ficticio','cantidad_solicitada':1}]
    assert client.post('/practicas-laboratorio/programacion',json=payload).status_code==422
    payload['materiales']=[];payload['incluye_practica']=True
    origen=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    payload.update(practica_origen_id=origen,proposito='INDIVIDUAL',objetivo='Cambiar propósito no autorizado')
    payload['sesiones']=[{'fecha':'2026-11-16','hora_inicio':'16:00','hora_fin':'17:00'}]
    assert client.post('/practicas-laboratorio/programacion',json=payload).status_code==422


def test_formulario_anterior_no_permite_docente_sin_carga_y_conserva_solicitudes(plan,db):
    client,payload,cargas,_=plan
    from routers.horarios import crear_reservacion, ReservacionCreate
    from fastapi import BackgroundTasks, HTTPException
    slot=db.query(HorarioDisponible).filter_by(dia_semana=0,hora_inicio='08:00').one()
    datos=ReservacionCreate(horario_id=slot.id,laboratorio_id=payload['laboratorio_id'],docente_id=cargas[0].docente_id,materia='Manejo de Postcosecha',carrera='Agricultura',cuatrimestre='SEP-DIC-2026',cuatrimestre_materia='3',grupo='A')
    with pytest.raises(HTTPException) as error:crear_reservacion(datos,BackgroundTasks(),db,db.get(Usuario,cargas[0].docente_id))
    assert error.value.status_code==422 and db.query(Reservacion).count()==0
    slot=db.query(HorarioDisponible).filter_by(dia_semana=0,hora_inicio='16:00').one()
    reserva=Reservacion(horario_id=slot.id,laboratorio_id=payload['laboratorio_id'],docente_id=cargas[0].docente_id,creado_por=cargas[0].docente_id,materia='Manejo de Postcosecha',periodo_id=cargas[0].periodo_id,cuatrimestre='SEP-DIC-2026',grupo='A',fecha_actividad=dt.date(2026,11,9))
    db.add(reserva);db.flush();anterior=PracticaLaboratorio(reservacion_id=reserva.id,titulo='Registro anterior',fecha_sesion=dt.date(2026,11,9));db.add(anterior);db.commit()
    detalle=client.get(f'/practicas-laboratorio/{anterior.id}').json()
    assert detalle['proposito']=='SIN_VINCULACION'
    vinculada=client.post(f'/practicas-laboratorio/{anterior.id}/vincular-carga',json={'carga_id':cargas[0].id,'fuera_horario':True})
    assert vinculada.status_code==200 and vinculada.json()['proposito']=='ACADEMICA',vinculada.text
    assert db.query(PracticaLaboratorio).count()==1

def test_individual_con_practica_requiere_preparacion_y_responsable_no_suplanta_docente(plan,db,docente_user):
    from models.usuario import RolUsuario
    client,payload,_,_=plan
    payload.update(proposito='INDIVIDUAL',objetivo='Estudio individual con insumos')
    payload['sesiones']=[{'fecha':'2026-11-09','hora_inicio':'16:00','hora_fin':'17:00'}]
    p_id=client.post('/practicas-laboratorio/programacion',json=payload).json()['practica_id']
    assert client.post(f'/practicas-laboratorio/{p_id}/iniciar').status_code==409
    docente_user.rol=RolUsuario.RESPONSABLE_LAB;docente_user.laboratorio_id=payload['laboratorio_id'];db.commit()
    assert client.post('/practicas-laboratorio/programacion',json=payload).status_code==403


def test_migracion_proposito_no_reclasifica_registros_previos(tmp_path):
    import importlib.util
    from pathlib import Path
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    engine=sa.create_engine('sqlite:///'+str(tmp_path/'proposito.db'))
    with engine.begin() as conn:
        conn.execute(sa.text('CREATE TABLE practicas_laboratorio (id INTEGER PRIMARY KEY, titulo TEXT NOT NULL)'))
        conn.execute(sa.text("INSERT INTO practicas_laboratorio VALUES (1,'Solicitud anterior')"))
        path=Path(__file__).parents[1]/'alembic/versions/f7a8b9c0d1e2_proposito_laboratorio.py'
        spec=importlib.util.spec_from_file_location('migration_proposito',path);migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
        with Operations.context(MigrationContext.configure(conn)):migration.upgrade()
        assert conn.execute(sa.text('SELECT titulo, proposito, incluye_practica, participantes FROM practicas_laboratorio')).one()==('Solicitud anterior',None,True,None)
    engine.dispose()


def test_reservacion_con_seguimiento_dirige_a_sesion_y_no_permite_inicio_alterno(plan,db):
    client,payload,_,_=plan
    r=client.post('/practicas-laboratorio/programacion',json=payload).json()
    p=db.get(PracticaLaboratorio,r['practica_id'])
    from routers.sesiones import clase_reservada_hoy
    user=db.get(Usuario,p.reservacion.docente_id)
    contexto=clase_reservada_hoy(p.reservacion_id,db,user)
    assert contexto['practica_id']==p.id and contexto['practica_url'].endswith(f'practica_id={p.id}')
    intento=client.post('/sesiones',json={'laboratorio_id':p.reservacion.laboratorio_id,'reservacion_id':p.reservacion_id,'fin_estimado_min':60})
    assert intento.status_code==409 and 'seguimiento propio' in intento.json()['detail'],intento.text


def test_cors_conserva_origen_en_preflight_y_rechazo_de_solicitud():
    import main
    client=TestClient(main.app)
    origin='https://siga-utecan.up.railway.app'
    preflight=client.options('/practicas-laboratorio/programacion/validar',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'})
    assert preflight.status_code==200
    assert preflight.headers.get('access-control-allow-origin') in {origin,'*'}
    respuesta=client.post('/practicas-laboratorio/programacion/validar',headers={'Origin':origin},json={})
    assert respuesta.status_code==401 and respuesta.headers.get('access-control-allow-origin') in {origin,'*'}
