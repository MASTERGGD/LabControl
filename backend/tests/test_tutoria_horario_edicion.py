import datetime
import pytest
from dependencies import get_current_user
from models.catalogo import PeriodoEscolar, CatalogoAlumno
from models.docencia import CargaDocente
from models.tutoria import GrupoTutorado, AsignacionTutoria, SesionTutoria, Canalizacion, CierreTutoria


@pytest.fixture
def escenario(client, db, docente_user, monkeypatch):
    fecha = datetime.date(2026, 9, 28)
    from services.timezone import MEXICO_TZ
    monkeypatch.setattr('routers.tutoria.today_mx', lambda: fecha)
    monkeypatch.setattr('routers.docencia._ahora_mx', lambda: datetime.datetime(2026, 9, 28, 12, tzinfo=MEXICO_TZ))
    periodo = PeriodoEscolar(clave='SEP-DIC 2026', es_actual=True, activo=True)
    db.add(periodo); db.flush()
    grupo = GrupoTutorado(tutor_id=docente_user.id, carrera='TI', cuatrimestre=1, grupo='A', periodo=periodo.clave, activo=True)
    db.add(grupo); db.flush()
    alumno = CatalogoAlumno(matricula='TUT-1', apellido_paterno='Alumno', apellido_materno='Prueba', nombres='Uno', carrera='TI', cuatrimestre=1, grupo='A', periodo=periodo.clave, activo=True)
    db.add(alumno); db.flush()
    db.add(AsignacionTutoria(grupo_tutorado_id=grupo.id, alumno_id=alumno.id, activo=True))
    carga = CargaDocente(docente_id=docente_user.id, periodo_id=periodo.id, grupo_tutorado_id=grupo.id, tipo_actividad='TUTORIA', actividad_nombre='Tutoría', dia_semana=0, hora_inicio='11:00', hora_fin='12:00', estado='ACTIVO', activo=True)
    db.add(carga); db.commit()
    client.app.dependency_overrides[get_current_user] = lambda: docente_user
    payload = dict(grupo_tutorado_id=grupo.id, fecha='2026-09-28', hora_inicio='11:00', tipo_sesion='GRUPAL', tema='Seguimiento', categoria='ACADEMICO', registros=[dict(alumno_id=alumno.id, asistio=True)])
    yield client, db, grupo, carga, payload
    client.app.dependency_overrides.pop(get_current_user, None)


def test_vincula_horario_y_panel_sin_duplicados(escenario):
    client, db, grupo, carga, payload = escenario
    opciones = client.get('/tutoria/horario-sesiones', params={'grupo_id': grupo.id, 'fecha': payload['fecha']})
    assert opciones.status_code == 200
    assert opciones.json()[0]['hora_inicio'] == '11:00'
    r = client.post('/tutoria/sesiones', json=payload)
    assert r.status_code == 201, r.text
    assert r.json()['fecha'] == '2026-09-28'
    assert r.json()['carga_docente_id'] == carga.id
    sid = r.json()['id']
    assert client.post('/tutoria/sesiones', json=payload).status_code == 409
    hoy = client.get('/docencia/hoy')
    assert hoy.status_code == 200, hoy.text
    assert hoy.json()[0]['sesion_tutoria_id'] == sid
    panel = client.get('/docencia/dashboard')
    assert panel.status_code == 200, panel.text
    assert panel.json()['jornada'][0]['sesion_tutoria_id'] == sid
    assert panel.json()['jornada'][0]['estado'] == 'CERRADA'


def test_extraordinaria_individual_y_grupal_no_completan_horario(escenario):
    client, db, grupo, carga, payload = escenario
    for tipo in ['INDIVIDUAL', 'GRUPAL']:
        r = client.post('/tutoria/sesiones', json={**payload, 'tipo_sesion': tipo, 'extraordinaria': True, 'motivo_extraordinaria': 'Atención solicitada por alumno'})
        assert r.status_code == 201, r.text
        assert r.json()['carga_docente_id'] is None
    assert client.get('/docencia/hoy').json()[0]['sesion_tutoria_id'] is None
    assert client.post('/tutoria/sesiones', json={**payload, 'extraordinaria': True}).status_code == 422


def test_editar_con_historial_conserva_fecha_y_canalizacion(escenario):
    client, db, grupo, carga, payload = escenario
    payload['registros'][0].update(requiere_canalizacion=True, canalizacion={'area': 'PEDAGOGIA', 'motivo': 'Seguimiento académico'})
    r = client.post('/tutoria/sesiones', json=payload)
    assert r.status_code == 201, r.text
    sid = r.json()['id']
    detalle = client.get(f'/tutoria/sesiones/{sid}').json()
    cambio = {**detalle, 'tema': 'Tema corregido', 'motivo_cambio': 'Corregir descripción'}
    r = client.put(f'/tutoria/sesiones/{sid}', json=cambio)
    assert r.status_code == 200, r.text
    assert r.json()['revision'] == 2
    nuevo = client.get(f'/tutoria/sesiones/{sid}').json()
    assert nuevo['fecha'] == '2026-09-28'
    assert nuevo['fecha_programada'] == '2026-09-28'
    assert nuevo['historial'][0]['antes']['tema'] == 'Seguimiento'
    assert nuevo['historial'][0]['despues']['tema'] == 'Tema corregido'
    assert db.query(Canalizacion).filter(Canalizacion.sesion_id == sid).count() == 1
    assert db.query(SesionTutoria).count() == 1
    assert client.put(f'/tutoria/sesiones/{sid}', json=cambio).status_code == 409
    assert client.put(f'/tutoria/sesiones/{sid}', json={**nuevo, 'motivo_cambio': ''}).status_code == 422
    db.add(CierreTutoria(periodo=grupo.periodo, alcance='CUATRIMESTRE', estado='CERRADO', cerrado_por=grupo.tutor_id)); db.commit()
    assert client.put(f'/tutoria/sesiones/{sid}', json={**nuevo, 'motivo_cambio': 'Corrección'}).status_code == 409


def test_reprogramacion_conserva_fecha_original_y_permisos(escenario):
    client, db, grupo, carga, payload = escenario
    r = client.post('/tutoria/sesiones', json={**payload, 'fecha': '2026-09-27', 'carga_docente_id': carga.id, 'fecha_programada': '2026-09-28'})
    assert r.status_code == 201, r.text
    sid = r.json()['id']
    detalle = client.get(f'/tutoria/sesiones/{sid}').json()
    assert detalle['fecha'] == '2026-09-27' and detalle['fecha_programada'] == '2026-09-28'
    from types import SimpleNamespace
    from models.usuario import RolUsuario
    alumno_user = SimpleNamespace(id=9999, rol=RolUsuario.ALUMNO)
    client.app.dependency_overrides[get_current_user] = lambda: alumno_user
    assert client.get(f'/tutoria/sesiones/{sid}').status_code == 403
    assert client.put(f'/tutoria/sesiones/{sid}', json={**detalle, 'motivo_cambio': 'Cambio'}).status_code == 403
    assert client.post('/tutoria/sesiones', json=payload).status_code == 403


def test_migracion_vincula_solo_coincidencias_inequivocas():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).parents[1] / 'alembic/versions/o4p5q6r7s8t9_vincular_sesiones_tutoria_horario.py'
    spec = importlib.util.spec_from_file_location('migration_tutoria', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    engine = create_engine('sqlite://')
    with engine.begin() as conn:
        for statement in [
            'CREATE TABLE usuarios (id INTEGER PRIMARY KEY)',
            'CREATE TABLE periodos_escolares (id INTEGER PRIMARY KEY, clave TEXT)',
            'CREATE TABLE grupos_tutorados (id INTEGER PRIMARY KEY, periodo TEXT)',
            'CREATE TABLE cargas_docentes (id INTEGER PRIMARY KEY, docente_id INTEGER, grupo_tutorado_id INTEGER, periodo_id INTEGER, tipo_actividad TEXT, activo BOOLEAN, estado TEXT, dia_semana INTEGER, hora_inicio TEXT, hora_fin TEXT)',
            'CREATE TABLE sesiones_tutoria (id INTEGER PRIMARY KEY, tutor_id INTEGER, grupo_tutorado_id INTEGER, fecha DATE, hora_inicio TIME, tipo_sesion TEXT)',
            'CREATE TABLE programaciones_sesion_tutoria (id INTEGER PRIMARY KEY, sesion_id INTEGER, fecha_programada DATE)',
            "INSERT INTO periodos_escolares VALUES (1, 'SEP-DIC 2026')",
            "INSERT INTO grupos_tutorados VALUES (1, 'SEP-DIC 2026')",
            "INSERT INTO cargas_docentes VALUES (1, 1, 1, 1, 'TUTORIA', true, 'ACTIVO', 0, '11:00', '12:00')",
            "INSERT INTO sesiones_tutoria VALUES (1, 1, 1, '2026-09-28', '11:00:00', 'GRUPAL')",
            "INSERT INTO sesiones_tutoria VALUES (2, 1, 1, '2026-09-21', '11:00:00', 'GRUPAL')",
            "INSERT INTO sesiones_tutoria VALUES (3, 1, 1, '2026-09-21', '11:30:00', 'GRUPAL')",
            "INSERT INTO sesiones_tutoria VALUES (4, 1, 1, '2026-09-28', '11:00:00', 'INDIVIDUAL')",
        ]: conn.execute(text(statement))
        module.op = Operations(MigrationContext.configure(conn))
        module.upgrade()
        rows = conn.execute(text('SELECT id, carga_docente_id, fecha, fecha_programada FROM sesiones_tutoria ORDER BY id')).all()
        assert rows[0] == (1, 1, '2026-09-28', '2026-09-28')
        assert all(r[1] is None for r in rows[1:])
        module.downgrade()
        assert conn.execute(text('SELECT COUNT(*) FROM sesiones_tutoria')).scalar() == 4
    engine.dispose()
