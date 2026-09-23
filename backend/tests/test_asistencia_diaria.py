import datetime
from zoneinfo import ZoneInfo

import pytest

from models.catalogo import CatalogoAlumno, GrupoAcademico, PeriodoEscolar
from models.docencia import AsistenciaDocente, CargaDocente, ClaseDocente
from services.asistencia_diaria import asistencia_diaria
from tests.conftest import auth_headers, get_token


@pytest.fixture
def jornada(db, admin_user, monkeypatch):
    corte = datetime.datetime(2026, 9, 22, 10, 30, tzinfo=ZoneInfo('America/Mexico_City'))
    monkeypatch.setattr('services.asistencia_diaria.now_mx', lambda: corte)
    periodo = PeriodoEscolar(clave='SEP-DIC 2026', es_actual=True, activo=True)
    db.add(periodo); db.flush()
    grupos = [GrupoAcademico(periodo_id=periodo.id, carrera='IA' if i < 4 else 'Software',
                            cuatrimestre=1, grupo=str(i), activo=True) for i in range(6)]
    alumnos = [CatalogoAlumno(matricula=f'DIA-{i}', apellido_paterno='Prueba', apellido_materno='Diaria', nombres=f'Alumno {i}',
                             carrera='IA', cuatrimestre=1, grupo='0', periodo=periodo.clave, activo=True) for i in range(5)]
    db.add_all(grupos + alumnos); db.flush()

    def sesion(grupo, estados=None, estado='CERRADA', inicio='08:00', **extra):
        carga = CargaDocente(docente_id=admin_user.id, periodo_id=periodo.id,
                             grupo_academico_id=grupo.id, tipo_actividad='CLASE', actividad_nombre='Materia',
                             dia_semana=1, hora_inicio=inicio, hora_fin='11:00', estado='ACTIVO', activo=True)
        db.add(carga); db.flush()
        if estados is not None:
            clase = ClaseDocente(carga_docente_id=carga.id, fecha=corte.date(), estado=estado, **extra)
            db.add(clase); db.flush()
            for alumno, valor in estados:
                db.add(AsistenciaDocente(clase_docente_id=clase.id, alumno_id=alumno.id, estado=valor))
        db.flush()
        return carga

    sesion(grupos[0], list(zip(alumnos[:4], ['PRESENTE', 'RETARDO', 'JUSTIFICADA', 'FALTA'])))
    sesion(grupos[0], [(alumnos[0], 'PRESENTE'), (alumnos[3], 'PRESENTE')])
    sesion(grupos[0], [(alumnos[4], 'PRESENTE')], estado='ABIERTA')
    sesion(grupos[1])  # horario iniciado, sin captura
    sesion(grupos[2], inicio='15:00')  # no se debe marcar pendiente todavía
    sesion(grupos[3], [(alumnos[4], 'PRESENTE')], motivo_no_impartida='Suspensión')
    sesion(grupos[4], [(alumnos[0], 'PRESENTE')])  # alumno repetido entre grupos/carreras
    sesion(grupos[5], [(alumnos[4], 'PRESENTE')], estado='CORRECCION')
    db.commit()
    return periodo, grupos, alumnos, sesion


def test_corte_deduplica_y_distingue_cobertura(db, jornada):
    periodo, grupos, _, _ = jornada
    data = asistencia_diaria(db, periodo.id)
    assert data['fecha'] == '2026-09-22'
    assert data['corte'].endswith('-06:00')
    r = data['resumen']
    assert r['asistentes'] == 3  # ni justificación, ni abiertas, ni en corrección
    assert r['alumnos_con_registro'] == 4
    assert r['grupos_con_lista'] == 2
    assert r['grupos_sin_lista'] == 2
    assert r['grupos_por_iniciar'] == 1
    assert r['listas_confirmadas'] == 3
    assert r['listas_pendientes'] == 3
    por_id = {g['id']: g for g in data['grupos']}
    assert por_id[grupos[0].id]['asistentes'] == 3
    assert por_id[grupos[3].id]['estado'] == 'SIN_ACTIVIDAD'
    assert por_id[grupos[5].id]['listas_en_captura'] == 1
    assert sum(c['asistentes'] for c in data['carreras']) == 4  # total institucional deduplicado = 3


def test_filtro_carrera_y_calendario(db, jornada, monkeypatch):
    periodo, _, _, _ = jornada
    data = asistencia_diaria(db, periodo.id, carrera='Software')
    assert data['resumen']['asistentes'] == 1
    assert len(data['grupos']) == 2
    monkeypatch.setattr('services.asistencia_diaria.estado_fecha_academica', lambda *args: {
        'requiere_asistencia': False, 'permite_iniciar_clase': False, 'motivo': 'Suspensión',
    })
    data = asistencia_diaria(db, periodo.id)
    assert data['nota_calendario'] == 'Suspensión'
    # No inventa pendientes por horario en día suspendido; conserva capturas reales.
    assert data['resumen']['grupos_sin_lista'] == 1
    assert data['resumen']['grupos_por_iniciar'] == 0


def test_endpoint_autorizacion_fecha_y_aislamiento(client, db, admin_user, docente_user, jornada):
    periodo, _, _, _ = jornada
    admin = auth_headers(get_token(client, 'admin@test.com', 'AdminPass123'))
    url = '/reportes-academicos/asistencia-diaria'
    response = client.get(url, params={'periodo_id': periodo.id}, headers=admin)
    assert response.status_code == 200, response.text
    assert response.json()['resumen']['asistentes'] == 3
    assert client.get(url, params={'periodo_id': periodo.id, 'fecha': '2026-09-23'}, headers=admin).status_code == 422
    assert client.get(url, params={'periodo_id': periodo.id, 'carrera': 'Ajena'}, headers=admin).status_code == 422
    assert client.get(url, params={'periodo_id': 999999}, headers=admin).status_code == 404
    otro = PeriodoEscolar(clave='ENE-ABR 2027', es_actual=False, activo=True)
    db.add(otro); db.commit()
    empty = client.get(url, params={'periodo_id': otro.id}, headers=admin).json()
    assert empty['resumen']['asistentes'] == 0
    from dependencies import get_current_user
    client.app.dependency_overrides[get_current_user] = lambda: docente_user
    try:
        assert client.get(url, params={'periodo_id': periodo.id}).status_code == 403
    finally:
        client.app.dependency_overrides.pop(get_current_user, None)
