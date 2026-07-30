import datetime

from dependencies import hashear_password
from models.docencia import (
    AsistenciaDocente, CargaDocente, ClaseDocente, SeguimientoAlumnoDocente,
)
from models.usuario import RolUsuario, Usuario
from tests.conftest import auth_headers, get_token
from tests.test_reportes_tutor import _escenario


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
    assert vista_grupo["alumnos"][0]["id"] == alumno.id
    assert vista_grupo["alumnos"][0]["estado"] == "RIESGO"
    assert vista_grupo["paginacion"]["total"] == 1

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
    assert data["materias"][0]["promedio_evidencias"] == 6.5
    assert data["materias"][0]["falta"] == 1
    patron = data["patrones_asistencia"]["excluyendo_justificadas"]
    assert patron["resumen"]["dias_ausencia_parcial"] == 1
    assert patron["resumen"]["primera_hora_ausente_luego_asistio"] == 1
    assert patron["ausencias_parciales"][0]["primera_hora_ausente"] is True
    assert [registro["estado"] for registro in patron["ausencias_parciales"][0]["registros"]] == [
        "FALTA", "PRESENTE",
    ]
    assert any(evento["tipo"] == "ASISTENCIA" for evento in data["timeline"])
    assert any(evento["tipo"] == "EVALUACION" for evento in data["timeline"])


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
