import datetime

from dependencies import hashear_password
from models.docencia import (
    AsistenciaDocente, CargaDocente, ClaseDocente, SeguimientoAlumnoDocente,
)
from models.auditoria import AuditLog
from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico
from models.catalogo import GrupoAcademico, PeriodoEscolar
from models.usuario import RolUsuario, Usuario
from tests.conftest import auth_headers, get_token
from tests.test_reportes_tutor import _escenario
from routers.expediente_academico import (
    _clasificar_panorama, _estado_materia, _racha_reciente_por_materia,
    _tendencias_asistencia, _cumplimiento_sesiones, _semaforo,
)


def test_umbrales_y_racha_reciente_se_calculan_por_materia():
    carga_matematicas = CargaDocente(
        id=101, docente_id=1, periodo_id=1, grupo_academico_id=1,
        materia_id=10, tipo_actividad="CLASE", actividad_nombre="Matemáticas",
        dia_semana=1, hora_inicio="08:00", hora_fin="09:00", activo=True,
    )
    carga_ingles = CargaDocente(
        id=102, docente_id=1, periodo_id=1, grupo_academico_id=1,
        materia_id=11, tipo_actividad="CLASE", actividad_nombre="Inglés",
        dia_semana=1, hora_inicio="10:00", hora_fin="11:00", activo=True,
    )
    clases = [
        ClaseDocente(id=201, carga_docente_id=101, fecha=datetime.date(2026, 8, 3)),
        ClaseDocente(id=202, carga_docente_id=101, fecha=datetime.date(2026, 8, 5)),
        ClaseDocente(id=203, carga_docente_id=101, fecha=datetime.date(2026, 8, 7)),
        ClaseDocente(id=204, carga_docente_id=102, fecha=datetime.date(2026, 8, 6)),
    ]
    asistencias = [
        AsistenciaDocente(clase_docente_id=201, alumno_id=1, estado="FALTA"),
        AsistenciaDocente(clase_docente_id=202, alumno_id=1, estado="FALTA"),
        AsistenciaDocente(clase_docente_id=203, alumno_id=1, estado="FALTA"),
        # Esta presencia es más reciente que dos faltas de Matemáticas, pero no
        # debe interrumpir la racha de una materia distinta.
        AsistenciaDocente(clase_docente_id=204, alumno_id=1, estado="PRESENTE"),
    ]
    racha = _racha_reciente_por_materia(
        asistencias,
        {clase.id: clase for clase in clases},
        {101: carga_matematicas, 102: carga_ingles},
    )
    assert racha["cantidad"] == 3
    assert racha["materia"] == "Matemáticas"
    assert racha["desde"] == "2026-08-03"
    assert racha["hasta"] == "2026-08-07"

    estado, razones = _clasificar_panorama(95.0, 9.0, racha, 0, 0, 4)
    assert estado == "RIESGO"
    assert "3 faltas consecutivas en Matemáticas" in razones
    preliminar, razones_preliminares = _clasificar_panorama(
        0.0, None, {"cantidad": 1, "materia": "Matemáticas"}, 0, 0, 1,
    )
    assert preliminar == "BASE_INSUFICIENT"
    assert "1 de 3 clases" in razones_preliminares[0]

    assert _estado_materia(79.9, 9.0) == "RIESGO_ALTO"
    assert _estado_materia(80.0, 7.0) == "RIESGO_MEDIO"
    assert _estado_materia(90.0, 8.0) == "REGULAR"
    assert _estado_materia(100.0, None, 1, 0) == "BASE_INSUFICIENT"
    assert _estado_materia(None, None, 0, 0) == "SIN_DATOS"
    nivel_preliminar, razones_preliminar, asistencia_preliminar = _semaforo([{
        "asistencias_registradas": 1, "presente": 1, "retardo": 0,
        "justificada": 0, "evaluaciones_registradas": 0,
        "estado": "BASE_INSUFICIENT",
    }], [], [])
    assert asistencia_preliminar == 100.0
    assert nivel_preliminar == "GRIS"
    assert "1 de 3 clases" in razones_preliminar[0]


def test_tendencias_usan_la_ultima_clase_como_fecha_de_referencia():
    clases = [
        ClaseDocente(id=301, carga_docente_id=1, fecha=datetime.date(2026, 8, 1)),
        ClaseDocente(id=302, carga_docente_id=1, fecha=datetime.date(2026, 8, 25)),
        ClaseDocente(id=303, carga_docente_id=1, fecha=datetime.date(2026, 8, 30)),
    ]
    asistencias = [
        AsistenciaDocente(clase_docente_id=301, alumno_id=1, estado="PRESENTE"),
        AsistenciaDocente(clase_docente_id=302, alumno_id=1, estado="FALTA"),
        AsistenciaDocente(clase_docente_id=303, alumno_id=1, estado="PRESENTE"),
    ]
    tendencias = _tendencias_asistencia(asistencias, clases, 66.7)
    assert tendencias["fecha_referencia"] == "2026-08-30"
    assert tendencias["ultimos_7_dias"]["desde"] == "2026-08-24"
    assert tendencias["ultimos_7_dias"]["porcentaje"] == 50.0
    assert tendencias["ultimos_30_dias"]["desde"] == "2026-08-01"
    assert tendencias["ultimos_30_dias"]["porcentaje"] == 66.7
    assert tendencias["variacion_7_dias_vs_global"] == -16.7
    assert tendencias["variacion_30_dias_vs_global"] == 0.0


def test_cumplimiento_excluye_suspensiones_y_separa_sesiones_adicionales(db, admin_user):
    periodo = PeriodoEscolar(clave="SEP-DIC 2027", activo=True, es_actual=False)
    db.add(periodo); db.flush()
    grupo = GrupoAcademico(
        periodo_id=periodo.id, carrera="TIC", cuatrimestre=4, grupo="B", activo=True,
    )
    db.add(grupo); db.flush()
    carga = CargaDocente(
        docente_id=admin_user.id, periodo_id=periodo.id,
        grupo_academico_id=grupo.id, materia_id=None, tipo_actividad="CLASE",
        actividad_nombre="Redes", dia_semana=0, hora_inicio="08:00",
        hora_fin="09:00", estado="ACTIVO", activo=True,
    )
    calendario = CalendarioAcademico(
        periodo_id=periodo.id, estado="PUBLICADO", creado_por_id=admin_user.id,
        publicado_por_id=admin_user.id,
    )
    db.add_all([carga, calendario]); db.flush()
    db.add_all([
        EventoCalendarioAcademico(
            calendario_id=calendario.id, titulo="Inicio", tipo="INICIO_CUATRIMESTRE",
            fecha_inicio=datetime.date(2027, 8, 2), fecha_fin=datetime.date(2027, 8, 2),
            requiere_asistencia=True, permite_iniciar_clase=True, genera_alertas=True,
            creado_por_id=admin_user.id,
        ),
        EventoCalendarioAcademico(
            calendario_id=calendario.id, titulo="Fin", tipo="FIN_CUATRIMESTRE",
            fecha_inicio=datetime.date(2027, 8, 15), fecha_fin=datetime.date(2027, 8, 15),
            requiere_asistencia=True, permite_iniciar_clase=True, genera_alertas=True,
            creado_por_id=admin_user.id,
        ),
        EventoCalendarioAcademico(
            calendario_id=calendario.id, titulo="Suspensión", tipo="SUSPENSION_GENERAL",
            fecha_inicio=datetime.date(2027, 8, 9), fecha_fin=datetime.date(2027, 8, 9),
            requiere_asistencia=False, permite_iniciar_clase=False, genera_alertas=False,
            creado_por_id=admin_user.id,
        ),
    ])
    db.flush()
    clase_programada = ClaseDocente(
        carga_docente_id=carga.id, fecha=datetime.date(2027, 8, 2), estado="CERRADA",
    )
    clase_adicional = ClaseDocente(
        carga_docente_id=carga.id, fecha=datetime.date(2027, 8, 11), estado="CERRADA",
        es_reposicion=True,
    )
    db.add_all([clase_programada, clase_adicional]); db.flush()

    cumplimiento = _cumplimiento_sesiones(
        db, periodo.id, [carga], [clase_programada, clase_adicional],
        fecha_corte=datetime.date(2027, 8, 15),
    )
    assert cumplimiento["disponible"] is True
    assert cumplimiento["sesiones_esperadas"] == 1
    assert cumplimiento["sesiones_registradas"] == 1
    assert cumplimiento["sesiones_sin_registro"] == 0
    assert cumplimiento["sesiones_adicionales"] == 1
    assert cumplimiento["porcentaje"] == 100.0


def test_expediente_consolida_materias_asistencia_y_acuerdos(client, db, admin_user):
    reportante, tutor, alumno, carga, _ = _escenario(db)
    clase_1 = ClaseDocente(
        carga_docente_id=carga.id, fecha=datetime.date(2026, 7, 20),
        estado="CERRADA", inicio=datetime.datetime(2026, 7, 20, 8),
        fin=datetime.datetime(2026, 7, 20, 9),
    )
    clase_2 = ClaseDocente(
        carga_docente_id=carga.id, fecha=datetime.date(2026, 7, 21),
        estado="CERRADA", inicio=datetime.datetime(2026, 7, 21, 8),
        fin=datetime.datetime(2026, 7, 21, 9),
    )
    carga_tarde = CargaDocente(
        docente_id=carga.docente_id,
        periodo_id=carga.periodo_id,
        grupo_academico_id=carga.grupo_academico_id,
        materia_id=carga.materia_id,
        tipo_actividad="CLASE",
        actividad_nombre=carga.actividad_nombre,
        dia_semana=1,
        hora_inicio="10:00",
        hora_fin="11:00",
        estado="ACTIVO",
        activo=True,
    )
    db.add_all([clase_1, clase_2, carga_tarde])
    db.flush()
    clase_3 = ClaseDocente(
        carga_docente_id=carga_tarde.id, fecha=datetime.date(2026, 7, 21),
        estado="CERRADA", inicio=datetime.datetime(2026, 7, 21, 10),
        fin=datetime.datetime(2026, 7, 21, 11),
    )
    db.add(clase_3)
    db.flush()
    db.add_all([
        AsistenciaDocente(clase_docente_id=clase_1.id, alumno_id=alumno.id, estado="PRESENTE"),
        AsistenciaDocente(clase_docente_id=clase_2.id, alumno_id=alumno.id, estado="FALTA"),
        AsistenciaDocente(clase_docente_id=clase_3.id, alumno_id=alumno.id, estado="PRESENTE"),
        SeguimientoAlumnoDocente(
            docente_id=reportante.id, carga_docente_id=carga.id, alumno_id=alumno.id,
            tipo="CALIFICACION", titulo="Unidad 1", calificacion=6.5,
        ),
        SeguimientoAlumnoDocente(
            docente_id=reportante.id, carga_docente_id=carga.id, alumno_id=alumno.id,
            tipo="ACUERDO", titulo="Asesoría semanal", estado="PENDIENTE",
            fecha_revision=datetime.date(2026, 7, 25),
        ),
    ])
    db.commit()

    admin_headers = auth_headers(get_token(client, admin_user.email, "AdminPass123"))
    grupos = client.get(
        "/expediente-academico/panorama/grupos", headers=admin_headers,
    )
    assert grupos.status_code == 200, grupos.text
    assert any(
        grupo["id"] == carga.grupo_academico_id
        and grupo["total_alumnos"] == 1
        for grupo in grupos.json()
    )
    panorama = client.get(
        f"/expediente-academico/panorama/grupos/{carga.grupo_academico_id}/alumnos",
        params={"pagina": 1, "limite": 25},
        headers=admin_headers,
    )
    assert panorama.status_code == 200, panorama.text
    vista_grupo = panorama.json()
    assert vista_grupo["resumen"]["total_alumnos"] == 1
    assert vista_grupo["resumen"]["asistencia_global"] == 66.7
    assert vista_grupo["resumen"]["alumnos_riesgo"] == 1
    assert vista_grupo["resumen"]["cobertura_asistencia"] == 100.0
    assert vista_grupo["resumen"]["cobertura_asistencia_detalle"] == {
        "registros_capturados": 3,
        "registros_esperados": 3,
        "alumnos": 1,
        "clases_registradas": 3,
        "descripcion": "Completitud del pase de lista sobre las clases registradas",
    }
    assert vista_grupo["resumen"]["cumplimiento_sesiones"]["disponible"] is False
    assert vista_grupo["resumen"]["cumplimiento_sesiones"]["estado"] == "SIN_CALENDARIO"
    assert vista_grupo["alumnos"][0]["id"] == alumno.id
    assert vista_grupo["alumnos"][0]["estado"] == "RIESGO"
    assert vista_grupo["paginacion"]["total"] == 1
    assert vista_grupo["alcance"] == "GRUPO"
    assert len(vista_grupo["materias"]) == 1
    materia_clave = vista_grupo["materias"][0]["clave"]
    panorama_materia = client.get(
        f"/expediente-academico/panorama/grupos/{carga.grupo_academico_id}/alumnos",
        params={"materia_clave": materia_clave, "pagina": 1, "limite": 25},
        headers=admin_headers,
    )
    assert panorama_materia.status_code == 200, panorama_materia.text
    vista_materia = panorama_materia.json()
    assert vista_materia["alcance"] == "MATERIA"
    assert vista_materia["materia_seleccionada"]["nombre"] == carga.actividad_nombre
    assert vista_materia["materia_seleccionada"]["docentes"] == [reportante.nombre]
    assert vista_materia["resumen"]["asistencia_global"] == 66.7
    materia_invalida = client.get(
        f"/expediente-academico/panorama/grupos/{carga.grupo_academico_id}/alumnos",
        params={"materia_clave": "materia:999999"}, headers=admin_headers,
    )
    assert materia_invalida.status_code == 422

    respuesta = client.get(
        f"/expediente-academico/alumnos/{alumno.id}", headers=admin_headers,
    )
    assert respuesta.status_code == 200, respuesta.text
    data = respuesta.json()
    assert data["resumen"]["materias_inscritas"] == 1
    assert data["resumen"]["asistencia_global"] == 66.7
    assert data["resumen"]["materias_riesgo"] == 1
    assert data["resumen"]["acuerdos_pendientes"] == 1
    assert data["resumen"]["semaforo"] == "ROJO"
    assert data["resumen"]["alerta_inmediata"]["nivel"] == "VERDE"
    assert data["resumen"]["umbrales"]["racha_riesgo"] == 3
    assert data["resumen"]["tendencias_asistencia"]["fecha_referencia"] == "2026-07-21"
    assert data["resumen"]["tendencias_asistencia"]["ultimos_7_dias"]["porcentaje"] == 66.7
    assert data["resumen"]["calidad_datos"]["ultima_clase"] == "2026-07-21"
    assert data["resumen"]["calidad_datos"]["materias_sin_asistencia"] == []
    assert data["resumen"]["calidad_datos"]["materias_sin_evidencias"] == []
    assert data["acuerdos"][0]["materia"] == carga.actividad_nombre
    assert data["acuerdos"][0]["docente"] == reportante.nombre
    assert data["acuerdos"][0]["tipo_contexto"] == "MATERIA"
    assert data["acuerdos"][0]["grupo"] == "3° A"
    assert data["materias"][0]["promedio_evidencias"] == 6.5
    assert data["materias"][0]["falta"] == 1
    patron = data["patrones_asistencia"]["excluyendo_justificadas"]
    assert patron["resumen"]["dias_ausencia_parcial"] == 1
    assert patron["resumen"]["primera_hora_ausente_luego_asistio"] == 1
    assert patron["ausencias_parciales"][0]["primera_hora_ausente"] is True
    assert [registro["estado"] for registro in patron["ausencias_parciales"][0]["registros"]] == [
        "FALTA", "PRESENTE",
    ]
    assert data["timeline_paginada"] is True
    assert "timeline" not in data
    timeline = client.get(
        f"/expediente-academico/alumnos/{alumno.id}/timeline",
        params={"pagina": 1, "limite": 10}, headers=admin_headers,
    )
    assert timeline.status_code == 200, timeline.text
    timeline_data = timeline.json()
    assert timeline_data["paginacion"]["pagina"] == 1
    evento_asistencia = next(evento for evento in timeline_data["items"] if evento["tipo"] == "ASISTENCIA")
    assert evento_asistencia["fecha"].startswith("2026-07-21T")
    assert evento_asistencia["fecha"].endswith("-06:00")
    evento_acuerdo = next(evento for evento in timeline_data["items"] if evento["tipo"] == "ACUERDO")
    assert evento_acuerdo["fecha"].endswith("Z")
    assert any(evento["tipo"] == "EVALUACION" for evento in timeline_data["items"])

    solo_evaluaciones = client.get(
        f"/expediente-academico/alumnos/{alumno.id}/timeline",
        params={"tipo": "EVALUACION", "materia_clave": data["materias"][0]["clave"], "limite": 10},
        headers=admin_headers,
    )
    assert solo_evaluaciones.status_code == 200
    assert [evento["tipo"] for evento in solo_evaluaciones.json()["items"]] == ["EVALUACION"]
    rango_invalido = client.get(
        f"/expediente-academico/alumnos/{alumno.id}/timeline",
        params={"fecha_inicio": "2026-08-01", "fecha_fin": "2026-07-01"},
        headers=admin_headers,
    )
    assert rango_invalido.status_code == 422

    acuerdo_id = data["acuerdos"][0]["id"]
    eliminacion = client.request(
        "DELETE", f"/expediente-academico/acuerdos/{acuerdo_id}",
        json={"motivo": "Captura realizada durante pruebas"}, headers=admin_headers,
    )
    assert eliminacion.status_code == 200, eliminacion.text
    assert db.query(SeguimientoAlumnoDocente).filter(
        SeguimientoAlumnoDocente.id == acuerdo_id,
    ).first() is None
    auditoria = db.query(AuditLog).filter(
        AuditLog.accion == "ELIMINAR_ACUERDO_PRUEBA",
        AuditLog.recurso_id == acuerdo_id,
    ).first()
    assert auditoria is not None
    assert auditoria.detalle["alumno_id"] == alumno.id


def test_solo_tutor_asignado_consulta_expediente(client, db):
    reportante, tutor, alumno, carga, _ = _escenario(db)
    ajeno = Usuario(
        nombre="Docente ajeno", email="ajeno@utecan.edu.mx",
        password_hash=hashear_password("Ajeno123!"), rol=RolUsuario.DOCENTE, activo=True,
    )
    db.add(ajeno)
    db.commit()

    lista_docente_materia = client.get(
        "/expediente-academico/alumnos",
        headers=auth_headers(get_token(client, reportante.email, "Materia123!")),
    )
    assert lista_docente_materia.status_code == 200
    assert alumno.id not in [row["id"] for row in lista_docente_materia.json()]
    grupos_docente_materia = client.get(
        "/expediente-academico/panorama/grupos",
        headers=auth_headers(get_token(client, reportante.email, "Materia123!")),
    )
    assert grupos_docente_materia.status_code == 200
    assert grupos_docente_materia.json() == []

    detalle_docente_materia = client.get(
        f"/expediente-academico/alumnos/{alumno.id}",
        headers=auth_headers(get_token(client, reportante.email, "Materia123!")),
    )
    assert detalle_docente_materia.status_code == 403

    lista_tutor = client.get(
        "/expediente-academico/alumnos",
        headers=auth_headers(get_token(client, tutor.email, "Tutor123!")),
    )
    assert lista_tutor.status_code == 200
    assert alumno.id in [row["id"] for row in lista_tutor.json()]
    grupos_tutor = client.get(
        "/expediente-academico/panorama/grupos",
        headers=auth_headers(get_token(client, tutor.email, "Tutor123!")),
    )
    assert grupos_tutor.status_code == 200
    assert [grupo["id"] for grupo in grupos_tutor.json()] == [
        carga.grupo_academico_id,
    ]

    detalle_tutor = client.get(
        f"/expediente-academico/alumnos/{alumno.id}",
        headers=auth_headers(get_token(client, tutor.email, "Tutor123!")),
    )
    assert detalle_tutor.status_code == 200

    denegado = client.get(
        f"/expediente-academico/alumnos/{alumno.id}",
        headers=auth_headers(get_token(client, ajeno.email, "Ajeno123!")),
    )
    assert denegado.status_code == 403
