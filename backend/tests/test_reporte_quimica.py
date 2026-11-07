import copy
import datetime as dt
import io
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from database import get_db
from dependencies import get_current_user
from models.usuario import RolUsuario
from models.laboratorio import Laboratorio
from models.horario import HorarioDisponible, Reservacion
from models.sesion import SesionClase
from models.catalogo import CatalogoAlumno
from models.inventario import Activo, Prestamo, Incidente
from models.practica_laboratorio import (
    PracticaLaboratorio, AsistenciaPractica, InsumoLaboratorio, MovimientoInsumoLaboratorio,
    IncidentePractica, ResiduoPractica,
)
from routers.reportes import router
from services.reporte_quimica import generar, comparativo, firma, horas_intervalo, limites


@pytest.fixture
def escenario(db, lab, admin_user, docente_user):
    lab.categoria = 'QUIMICA'
    slot = HorarioDisponible(laboratorio_id=lab.id, dia_semana=2, hora_inicio='08:00', hora_fin='09:00', cuatrimestre='SEP-DIC-2026')
    db.add(slot); db.flush()
    r = Reservacion(horario_id=slot.id, laboratorio_id=lab.id, docente_id=docente_user.id,
        creado_por=docente_user.id, materia='Materia ficticia', grupo='A', cuatrimestre='SEP-DIC-2026')
    db.add(r); db.flush()
    p = PracticaLaboratorio(reservacion_id=r.id, fecha_sesion=dt.date(2026, 11, 4),
        titulo='Práctica ficticia', estado='CERRADA', proposito='ACADEMICA', plan_estado='PENDIENTE_CONTINUACION',
        iniciada_en=dt.datetime(2026, 11, 4, 14), cerrada_en=dt.datetime(2026, 11, 4, 15))
    db.add(p); db.flush()
    alumno = CatalogoAlumno(matricula='FICTICIA-1', apellido_paterno='Prueba', apellido_materno='Ficticia',
        nombres='Alumno', carrera='Prueba', cuatrimestre=1, grupo='A', periodo='SEP-DIC-2026')
    db.add(alumno); db.flush()
    db.add(AsistenciaPractica(practica_id=p.id, alumno_id=alumno.id, matricula=alumno.matricula,
        alumno_nombre='Alumno ficticio', estado='PRESENTE'))
    for dia, estado in [(11, 'CERRADA'), (18, 'EN_CURSO')]:
        otra = PracticaLaboratorio(reservacion_id=r.id, practica_origen_id=p.id, fecha_sesion=dt.date(2026, 11, dia),
            titulo='Continuación ficticia', estado=estado, proposito='ACADEMICA',
            iniciada_en=dt.datetime(2026, 11, dia, 14), cerrada_en=dt.datetime(2026, 11, dia, 15) if estado == 'CERRADA' else None)
        db.add(otra); db.flush()
        db.add(AsistenciaPractica(practica_id=otra.id, alumno_id=alumno.id, matricula=alumno.matricula,
            alumno_nombre='Alumno ficticio', estado='RETARDO' if dia == 11 else 'FALTA'))
    db.commit()
    return lab, admin_user, docente_user, r, p


def metricas(reporte):
    return {x['clave']: x['valor'] for x in reporte['indicadores']}


def test_multisesion_asistencia_y_duracion_sin_cierre(db, escenario):
    lab, user, _, _, p = escenario
    reporte = generar(db, lab, 11, 2026, user)
    m = metricas(reporte)
    assert m['practicas'] == 1 and m['programadas'] == m['iniciadas'] == 3
    assert m['alumnos'] == 1 and m['asistencias'] == 2 and m['docentes'] == 1
    assert m['horas'] == 2 and m['regularizar'] == 1
    assert reporte['tablas']['practicas'][0]['estado_plan'] == 'PENDIENTE_CONTINUACION'
    assert reporte['tablas']['sesiones'][-1]['horas_confirmadas'] is None
    assert p.estado == 'CERRADA'  # consulta sin mutaciones


def test_cruce_mes_zona_horaria_y_fin_exclusivo(db, escenario):
    lab, user, _, r, _ = escenario
    # 31 octubre 23:00 a 1 noviembre 01:00, Ciudad de México.
    db.add(PracticaLaboratorio(reservacion_id=r.id, fecha_sesion=dt.date(2026, 10, 31), titulo='Cruce ficticio',
        estado='CERRADA', iniciada_en=dt.datetime(2026, 11, 1, 5), cerrada_en=dt.datetime(2026, 11, 1, 7)))
    db.commit()
    oct = generar(db, lab, 10, 2026, user); nov = generar(db, lab, 11, 2026, user)
    assert metricas(oct)['horas'] == 1 and metricas(nov)['horas'] == 3
    assert metricas(oct)['iniciadas'] == 1 and metricas(nov)['iniciadas'] == 3


def test_movimientos_cancelados_unidades_y_fechas_independientes(db, escenario):
    lab, user, _, r, _ = escenario
    p = PracticaLaboratorio(reservacion_id=r.id, fecha_sesion=dt.date(2026, 10, 8), titulo='Cancelada ficticia', estado='CANCELADA')
    db.add(p); db.flush()
    for unidad in ['ml', 'g']:
        ins = InsumoLaboratorio(laboratorio_id=lab.id, nombre=f'Material {unidad}', unidad=unidad,
            cantidad_disponible=3, stock_minimo=5, caduca_en=dt.date(2020, 1, 1))
        db.add(ins); db.flush()
        for tipo, cantidad in [('ENTREGA', 100), ('CONSUMO', 60), ('DEVOLUCION', 40)]:
            db.add(MovimientoInsumoLaboratorio(insumo_id=ins.id, practica_id=p.id,
                tipo=tipo, cantidad=cantidad, usuario_id=user.id, creado_en=dt.datetime(2026, 11, 5, 14)))
        db.add(MovimientoInsumoLaboratorio(insumo_id=ins.id, practica_id=p.id, tipo='AJUSTE', cantidad=-1,
            usuario_id=user.id, creado_en=dt.datetime(2026, 12, 5, 14)))
    db.add(ResiduoPractica(practica_id=p.id, reportado_por_id=user.id, descripcion='Residuo ficticio',
        clasificacion='QUIMICO', cantidad=2, unidad='ml', creado_en=dt.datetime(2026, 11, 5, 14)))
    db.commit()
    r = generar(db, lab, 11, 2026, user)
    assert len(r['tablas']['movimientos']) == 6
    assert {(x['tipo'], x['unidad'], x['cantidad']) for x in r['tablas']['materiales_por_unidad']} == {
        (tipo, unidad, cantidad) for tipo, cantidad in [('ENTREGA',100),('CONSUMO',60),('DEVOLUCION',40)] for unidad in ['ml','g']}
    assert r['tablas']['residuos_por_unidad'][0]['cantidad'] == 2
    assert len(r['tablas']['alertas_actuales']) == 2
    assert not any(x['tipo'] == 'AJUSTE' for x in r['tablas']['movimientos'])
    assert len(generar(db, lab, 12, 2026, user)['tablas']['movimientos']) == 2


def test_sesion_legacy_se_cuenta_sin_duplicar_ni_inferir_alumnos_pc(db, escenario):
    lab, user, docente, r, p = escenario
    for dia in [4, 25]:
        db.add(SesionClase(laboratorio_id=lab.id, reservacion_id=r.id, docente_id=docente.id,
            codigo_sesion=f'FICTICIA-{dia}', inicio=dt.datetime(2026, 11, dia, 14), fin_real=dt.datetime(2026, 11, dia, 15)))
    db.commit()
    reporte = generar(db, lab, 11, 2026, user)
    assert metricas(reporte)['iniciadas'] == 4 and metricas(reporte)['horas'] == 3
    assert metricas(reporte)['alumnos'] == 1
    assert any(x.get('fuente') == 'SesionClase' for x in reporte['tablas']['informacion_incompleta'])


def test_alertas_actuales_no_limitadas_al_mes_y_sin_incidente_duplicado(db, escenario):
    lab, user, _, _, p = escenario
    equipo = Activo(laboratorio_id=lab.id, codigo_inventario='FICTICIO', nombre='Balanza ficticia', categoria='EQUIPO', estado='MANTENIMIENTO')
    db.add(equipo); db.flush()
    inc = IncidentePractica(practica_id=p.id, reportado_por_id=user.id, tipo='EQUIPO', severidad='ALTA', descripcion='Incidente ficticio', creado_en=dt.datetime(2026, 11, 4, 14))
    db.add(inc); db.flush()
    db.add(Incidente(laboratorio_id=lab.id, activo_id=equipo.id, reportado_por_id=user.id,
        origen='PRACTICA', origen_id=inc.id, tipo='DAÑO', descripcion='Espejo ficticio', estado='PENDIENTE', fecha_reporte=inc.creado_en))
    db.add(Prestamo(activo_id=equipo.id, solicitante_nombre='Ficticio', solicitante_id_escolar='FICTICIA', autorizado_por=user.id,
        fecha_salida=dt.datetime(2020,1,1), fecha_retorno_esperada=dt.datetime(2020,1,2), estado='ACTIVO'))
    db.commit()
    r = generar(db, lab, 11, 2026, user)
    assert len(r['tablas']['incidentes']) == 1
    assert len(r['tablas']['alertas_actuales']) == 3
    assert len(r['tablas']['prestamos_vencidos_actuales']) == 1


@pytest.fixture
def api_reporte(db, escenario):
    lab, user, _, _, _ = escenario
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app) as client:
        yield client, lab, user


def test_excel_mismo_corte_inmutable_y_textos_no_formula(db, api_reporte):
    client, lab, user = api_reporte
    corte = client.get('/reportes/quimica/mensual', params={'laboratorio_id':lab.id, 'mes':11, 'anio':2026}).json()
    assert 'reporte' in corte
    # La base puede cambiar; el Excel sigue representando exactamente la consulta mostrada.
    db.query(PracticaLaboratorio).update({'titulo':'=1+1'}); db.commit()
    respuesta = client.post('/reportes/quimica/excel', json=corte)
    assert respuesta.status_code == 200, respuesta.text
    wb = load_workbook(io.BytesIO(respuesta.content))
    assert corte['reporte']['consulta_id'] in str(list(wb['Identificación'].values))
    assert [row[1] for row in list(wb['Resumen'].values)[1:]] == [x['valor'] for x in corte['reporte']['indicadores']]
    assert 'Práctica ficticia' in str(list(wb['programadas'].values))
    alterado = copy.deepcopy(corte); alterado['reporte']['indicadores'][0]['valor'] = 999
    assert client.post('/reportes/quimica/excel', json=alterado).status_code == 409
    nuevo = client.get('/reportes/quimica/mensual', params={'laboratorio_id':lab.id,'mes':11,'anio':2026}).json()
    wb = load_workbook(io.BytesIO(client.post('/reportes/quimica/excel', json=nuevo).content))
    assert all(c.data_type == 's' for row in wb['programadas'] for c in row if c.value == '=1+1')


def test_exportacion_revalida_permisos_y_propietario(db, api_reporte):
    client, lab, user = api_reporte
    corte = client.get('/reportes/quimica/mensual', params={'laboratorio_id':lab.id,'mes':11,'anio':2026}).json()
    otro = Laboratorio(nombre='Ajeno ficticio', categoria='QUIMICA'); db.add(otro); db.flush()
    user.rol=RolUsuario.RESPONSABLE_LAB; user.laboratorio_id=otro.id; db.commit()
    assert client.get('/reportes/quimica/mensual',params={'laboratorio_id':lab.id,'mes':11,'anio':2026}).status_code == 403
    assert client.post('/reportes/quimica/excel',json=corte).status_code == 403
    user.rol=RolUsuario.DOCENTE; db.commit()
    assert client.get('/reportes/quimica/comparativo',params={'laboratorio_id':lab.id,'mes':11,'anio':2026}).status_code == 403


@pytest.mark.parametrize('mes,anio', [(0,2026),(13,2026),(11,0),(11,9999)])
def test_filtros_invalidos(api_reporte, mes, anio):
    client, lab, _ = api_reporte
    assert client.get('/reportes/quimica/mensual',params={'laboratorio_id':lab.id,'mes':mes,'anio':anio}).status_code == 422


def test_comparativo_mismas_reglas_y_alumnos_no_se_suman_por_mes(db, escenario):
    lab, user, _, _, _ = escenario
    otra = db.query(PracticaLaboratorio).filter(PracticaLaboratorio.fecha_sesion == dt.date(2026,11,11)).one()
    otra.fecha_sesion=dt.date(2026,10,11)
    otra.iniciada_en=dt.datetime(2026,10,11,14); otra.cerrada_en=dt.datetime(2026,10,11,15)
    db.commit()
    reporte = comparativo(db, lab, 11, 2026, user)
    m=metricas(reporte)
    assert m['actual_practicas']==1 and m['actual_alumnos']==1 and m['actual_asistencias']==2
    assert m['anterior_practicas']==0
    assert reporte['comparacion']['actual']=='2026-09-01 a 2026-12-31'


def test_corte_expirado_y_usuario_ajeno(api_reporte):
    client, lab, _ = api_reporte
    corte=client.get('/reportes/quimica/mensual',params={'laboratorio_id':lab.id,'mes':11,'anio':2026}).json()
    corte['reporte']['generado_en']=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=2)).isoformat()
    corte['firma']=firma(corte['reporte'])
    assert client.post('/reportes/quimica/excel',json=corte).status_code==409
    corte['reporte']['generado_en']=dt.datetime.now(dt.timezone.utc).isoformat()
    corte['reporte']['usuario_id']=99999; corte['firma']=firma(corte['reporte'])
    assert client.post('/reportes/quimica/excel',json=corte).status_code==409


def test_firma_tolera_roundtrip_numerico_del_navegador(api_reporte):
    client, lab, _ = api_reporte
    corte=client.get('/reportes/quimica/mensual',params={'laboratorio_id':lab.id,'mes':11,'anio':2026}).json()
    # JSON.stringify de JavaScript no conserva .0 en números enteros.
    def navegador(value):
        if isinstance(value,dict): return {k:navegador(v) for k,v in value.items()}
        if isinstance(value,list): return [navegador(v) for v in value]
        return int(value) if isinstance(value,float) and value.is_integer() else value
    assert client.post('/reportes/quimica/excel',json=navegador(corte)).status_code==200


def test_cierre_exactamente_en_limite_se_cuenta_sin_horas_del_mes(db, escenario):
    lab,user,_,r,_=escenario
    db.add(PracticaLaboratorio(reservacion_id=r.id,fecha_sesion=dt.date(2026,10,31),titulo='Cierre límite',
        estado='CERRADA',iniciada_en=dt.datetime(2026,11,1,5),cerrada_en=dt.datetime(2026,11,1,6)))
    db.commit()
    m=metricas(generar(db,lab,11,2026,user))
    assert m['cerradas_reales']==3 and m['iniciadas']==3 and m['horas']==2


def test_duracion_real_en_cambio_historico_de_horario():
    desde,hasta=limites(10,2022)
    # Dos horas reales a través del cambio de horario de Ciudad de México de 2022.
    assert horas_intervalo(dt.datetime(2022,10,30,6,30),dt.datetime(2022,10,30,8,30),desde,hasta)==2
