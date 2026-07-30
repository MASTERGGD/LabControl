import datetime

from dependencies import hashear_password
from models.catalogo import CatalogoAlumno, GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.docencia import CargaDocente, SeguimientoAlumnoDocente
from models.notificacion import Notificacion
from models.tutoria import AsignacionTutoria, Canalizacion, GrupoTutorado, ReporteTutor
from models.usuario import RolUsuario, Usuario
from tests.conftest import auth_headers, get_token


def _escenario(db):
    reportante = Usuario(
        nombre="Docente de materia", email="materia@utecan.edu.mx",
        password_hash=hashear_password("Materia123!"), rol=RolUsuario.DOCENTE, activo=True,
    )
    tutor = Usuario(
        nombre="Tutor del grupo", email="tutor@utecan.edu.mx",
        password_hash=hashear_password("Tutor123!"), rol=RolUsuario.DOCENTE, activo=True,
    )
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([reportante, tutor, periodo])
    db.flush()
    grupo_academico = GrupoAcademico(
        periodo_id=periodo.id, carrera="TIEID", cuatrimestre=3, grupo="A", activo=True,
    )
    alumno = CatalogoAlumno(
        matricula="UTC-REPORT-1", apellido_paterno="Pérez", apellido_materno="López",
        nombres="Ana", carrera="TIEID", cuatrimestre=3, grupo="A",
        periodo=periodo.clave, activo=True,
    )
    db.add_all([grupo_academico, alumno])
    db.flush()
    db.add(InscripcionAlumno(
        alumno_id=alumno.id, grupo_academico_id=grupo_academico.id, estado="ACTIVO",
    ))
    carga = CargaDocente(
        docente_id=reportante.id, periodo_id=periodo.id,
        grupo_academico_id=grupo_academico.id, tipo_actividad="CLASE",
        actividad_nombre="Programación", dia_semana=1, hora_inicio="08:00",
        hora_fin="09:00", estado="ACTIVA", activo=True,
    )
    grupo_tutorado = GrupoTutorado(
        tutor_id=tutor.id, carrera="TIEID", cuatrimestre=3, grupo="A",
        periodo=periodo.clave, activo=True, creado_por=tutor.id,
    )
    db.add_all([carga, grupo_tutorado])
    db.flush()
    db.add(AsignacionTutoria(
        grupo_tutorado_id=grupo_tutorado.id, alumno_id=alumno.id, activo=True,
    ))
    db.commit()
    return reportante, tutor, alumno, carga, grupo_tutorado


def test_docente_envia_reporte_y_tutor_lo_cierra(client, db):
    reportante, tutor, alumno, carga, _ = _escenario(db)
    reportante_headers = auth_headers(get_token(client, reportante.email, "Materia123!"))
    tutor_headers = auth_headers(get_token(client, tutor.email, "Tutor123!"))

    creado = client.post(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumno.id}/registros",
        headers=reportante_headers,
        json={
            "tipo": "TUTORIA",
            "titulo": "Tres faltas consecutivas",
            "detalle": "La alumna no se presentó durante la semana.",
            "estado": "PENDIENTE",
            "fecha_revision": "2026-08-05",
            "categoria_reporte": "ASISTENCIA",
            "prioridad_reporte": "ALTA",
            "confidencial": False,
        },
    )
    assert creado.status_code == 200, creado.text
    assert creado.json()["destinatario"] == tutor.nombre
    reporte = db.query(ReporteTutor).one()
    assert reporte.tutor_destinatario_id == tutor.id
    assert reporte.prioridad == "ALTA"
    assert db.query(Notificacion).filter(Notificacion.usuario_id == tutor.id).count() == 1

    recibidos = client.get(
        "/tutoria/reportes-tutor?bandeja=RECIBIDOS", headers=tutor_headers,
    )
    assert recibidos.status_code == 200, recibidos.text
    assert recibidos.json()[0]["materia"] == "Programación"
    assert recibidos.json()[0]["reportado_por"] == reportante.nombre

    cerrado = client.put(
        f"/tutoria/reportes-tutor/{reporte.id}/estado",
        headers=tutor_headers,
        json={"estado": "CERRADO", "resultado": "Se entrevistó a la alumna y se acordó seguimiento semanal."},
    )
    assert cerrado.status_code == 200, cerrado.text
    assert cerrado.json()["estado"] == "CERRADO"
    seguimiento = db.query(SeguimientoAlumnoDocente).one()
    db.refresh(seguimiento)
    assert seguimiento.estado == "ATENDIDO"
    assert "seguimiento semanal" in seguimiento.resultado_atencion


def test_tutor_convierte_reporte_en_canalizacion(client, db):
    reportante, tutor, alumno, carga, grupo_tutorado = _escenario(db)
    reportante_headers = auth_headers(get_token(client, reportante.email, "Materia123!"))
    tutor_headers = auth_headers(get_token(client, tutor.email, "Tutor123!"))
    creado = client.post(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumno.id}/registros",
        headers=reportante_headers,
        json={
            "tipo": "TUTORIA", "titulo": "Requiere apoyo",
            "detalle": "Se detectó una situación que requiere valoración.",
            "estado": "PENDIENTE", "categoria_reporte": "PERSONAL",
        },
    )
    reporte_id = creado.json()["reporte_tutor_id"]
    canalizada = client.post(
        f"/tutoria/reportes-tutor/{reporte_id}/canalizar",
        headers=tutor_headers,
        json={
            "tipo_psicologico": True, "tipo_pedagogico": False,
            "tipo_personal": True, "modalidad": "INDIVIDUAL",
            "motivo": "Se solicita valoración y acompañamiento.",
        },
    )
    assert canalizada.status_code == 201, canalizada.text
    canalizacion = db.query(Canalizacion).one()
    assert canalizacion.tutor_id == tutor.id
    assert canalizacion.grupo_tutorado_id == grupo_tutorado.id
    reporte = db.query(ReporteTutor).filter(ReporteTutor.id == reporte_id).one()
    assert reporte.estado == "CANALIZADO"
    assert reporte.canalizacion_id == canalizacion.id
