import datetime
from zoneinfo import ZoneInfo

import pytest
import routers.docencia as docencia
import routers.sesiones as sesiones
from models.catalogo import PeriodoEscolar, GrupoAcademico
from models.docencia import CargaDocente, ClaseDocente
from models.horario import HorarioDisponible, Reservacion
from models.sesion import SesionClase
from tests.conftest import get_token, auth_headers


@pytest.fixture
def actividad(db, docente_user, lab, monkeypatch):
    ahora = datetime.datetime(2026, 11, 5, 13, 10, tzinfo=ZoneInfo('America/Mexico_City'))
    monkeypatch.setattr(docencia, '_ahora_mx', lambda: ahora)
    monkeypatch.setattr(sesiones, 'now_mx', lambda: ahora)
    periodo = PeriodoEscolar(clave='SEP-DIC 2026', activo=True, es_actual=True)
    db.add(periodo); db.flush()
    grupo = GrupoAcademico(periodo_id=periodo.id, carrera='TIEID', cuatrimestre=4, grupo='A', activo=True)
    db.add(grupo); db.flush()
    carga = CargaDocente(docente_id=docente_user.id, periodo_id=periodo.id, grupo_academico_id=grupo.id, tipo_actividad='CLASE', actividad_nombre='Clase de prueba', dia_semana=3, hora_inicio='13:00', hora_fin='14:00', laboratorio_id=lab.id, uso_laboratorio='EQUIPOS', estado='ACTIVO', activo=True)
    slot = HorarioDisponible(laboratorio_id=lab.id, dia_semana=3, hora_inicio='13:00', hora_fin='14:00', cuatrimestre=periodo.clave, activo=True)
    db.add_all([carga, slot]); db.flush()
    reserva = Reservacion(laboratorio_id=lab.id, docente_id=docente_user.id, horario_id=slot.id, periodo_id=periodo.id, carga_docente_id=carga.id, creado_por=docente_user.id, materia='Clase de prueba', carrera='TIEID', cuatrimestre_materia='4', grupo='A', cuatrimestre=periodo.clave, estado='PROGRAMADA')
    db.add(reserva); db.commit()
    return carga, reserva


@pytest.mark.parametrize('estado', ['CERRADA', 'NO_IMPARTIDA', 'CORRECCION'])
@pytest.mark.parametrize('tipo', ['CLASE', 'LIBRE'])
def test_reserva_no_reabre_clase_finalizada(client, db, docente_user, lab, actividad, estado, tipo):
    carga, reserva = actividad
    clase = ClaseDocente(carga_docente_id=carga.id, fecha=datetime.date(2026, 11, 5), estado=estado)
    db.add(clase); db.commit()
    headers = auth_headers(get_token(client, 'docente@test.com', 'DocentePass123'))
    consulta = client.get(f'/sesiones/reservaciones/{reserva.id}/clase-hoy', headers=headers)
    assert consulta.status_code == 200
    assert consulta.json() == {'clase_id': clase.id, 'estado': estado}
    respuesta = client.post('/sesiones', json={'laboratorio_id': lab.id, 'reservacion_id': reserva.id, 'tipo_sesion': tipo}, headers=headers)
    assert respuesta.status_code == 409, respuesta.text
    assert respuesta.json()['detail']['clase_id'] == clase.id
    assert db.query(SesionClase).count() == 0
    db.refresh(clase)
    assert clase.estado == estado


def test_reservacion_crea_y_reutiliza_una_sola_clase(client, db, docente_user, lab, actividad):
    carga, reserva = actividad
    headers = auth_headers(get_token(client, 'docente@test.com', 'DocentePass123'))
    payload = {'laboratorio_id': lab.id, 'reservacion_id': reserva.id}
    primera = client.post('/sesiones', json=payload, headers=headers)
    assert primera.status_code == 201, primera.text
    clase = db.query(ClaseDocente).one()
    assert primera.json()['clase_docente_id'] == clase.id
    assert db.query(SesionClase).one().clase_docente_id == clase.id
    segunda = client.post('/sesiones', json=payload, headers=headers)
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()['id'] == primera.json()['id']
    assert db.query(ClaseDocente).count() == 1

    cierre_directo = client.post(f"/sesiones/{primera.json()['id']}/cerrar", json={}, headers=headers)
    assert cierre_directo.status_code == 409
    assert cierre_directo.json()['detail']['clase_id'] == clase.id
    cerrada = client.post(f'/docencia/clases/{clase.id}/cerrar', json={'tema_impartido': 'Tema de prueba', 'avance_planeacion': 100}, headers=headers)
    assert cerrada.status_code == 200, cerrada.text
    assert cerrada.json()['laboratorio_cerrado'] is True
    db.refresh(clase)
    sesion = db.query(SesionClase).one()
    db.refresh(sesion)
    assert clase.estado == sesion.estado == 'CERRADA'
    repetida = client.post('/sesiones', json=payload, headers=headers)
    assert repetida.status_code == 409, repetida.text
    assert db.query(SesionClase).count() == 1
