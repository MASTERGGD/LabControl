import datetime

from dependencies import hashear_password
from models.docencia import AsistenciaDocente, ClaseDocente, SeguimientoAlumnoDocente
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
    db.add_all([clase_1, clase_2])
    db.flush()
    db.add_all([
        AsistenciaDocente(clase_docente_id=clase_1.id, alumno_id=alumno.id, estado="PRESENTE"),
        AsistenciaDocente(clase_docente_id=clase_2.id, alumno_id=alumno.id, estado="FALTA"),
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
    respuesta = client.get(
        f"/expediente-academico/alumnos/{alumno.id}", headers=admin_headers,
    )
    assert respuesta.status_code == 200, respuesta.text
    data = respuesta.json()
    assert data["resumen"]["materias_inscritas"] == 1
    assert data["resumen"]["asistencia_global"] == 50.0
    assert data["resumen"]["materias_riesgo"] == 1
    assert data["resumen"]["acuerdos_pendientes"] == 1
    assert data["resumen"]["semaforo"] == "ROJO"
    assert data["materias"][0]["promedio_evidencias"] == 6.5
    assert data["materias"][0]["falta"] == 1
    assert any(evento["tipo"] == "ASISTENCIA" for evento in data["timeline"])
    assert any(evento["tipo"] == "EVALUACION" for evento in data["timeline"])


def test_docente_solo_consulta_alumnos_relacionados(client, db):
    reportante, _, alumno, _, _ = _escenario(db)
    ajeno = Usuario(
        nombre="Docente ajeno", email="ajeno@utecan.edu.mx",
        password_hash=hashear_password("Ajeno123!"), rol=RolUsuario.DOCENTE, activo=True,
    )
    db.add(ajeno)
    db.commit()

    propios = client.get(
        "/expediente-academico/alumnos",
        headers=auth_headers(get_token(client, reportante.email, "Materia123!")),
    )
    assert propios.status_code == 200
    assert alumno.id in [row["id"] for row in propios.json()]

    denegado = client.get(
        f"/expediente-academico/alumnos/{alumno.id}",
        headers=auth_headers(get_token(client, ajeno.email, "Ajeno123!")),
    )
    assert denegado.status_code == 403
