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


def test_grupo_academico_se_vincula_y_reasigna_reporte_sin_tutor(client, db):
    reportante, tutor, alumno, carga, grupo_legacy = _escenario(db)
    db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id == grupo_legacy.id
    ).delete()
    db.delete(grupo_legacy)
    responsable = Usuario(
        nombre="Responsable Tutoría", email="responsable@utecan.edu.mx",
        password_hash=hashear_password("Responsable123!"),
        rol=RolUsuario.TUTORIA_ADMIN, activo=True,
    )
    db.add(responsable)
    db.commit()

    creado = client.post(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumno.id}/registros",
        headers=auth_headers(get_token(client, reportante.email, "Materia123!")),
        json={"tipo": "TUTORIA", "titulo": "Caso sin tutor", "estado": "PENDIENTE"},
    )
    assert creado.status_code == 200, creado.text
    assert creado.json()["destinatario"] == "Responsable de Tutoría"
    reporte = db.query(ReporteTutor).one()
    assert reporte.estado == "SIN_TUTOR"
    assert reporte.grupo_tutorado_id is not None
    grupo = db.query(GrupoTutorado).filter(GrupoTutorado.id == reporte.grupo_tutorado_id).one()
    assert grupo.grupo_academico_id == carga.grupo_academico_id
    assert grupo.tutor_id is None
    assert db.query(AsignacionTutoria).filter(
        AsignacionTutoria.grupo_tutorado_id == grupo.id,
        AsignacionTutoria.alumno_id == alumno.id,
        AsignacionTutoria.activo == True,
    ).count() == 1

    responsable_headers = auth_headers(get_token(client, responsable.email, "Responsable123!"))
    dashboard = client.get("/tutoria/dashboard", headers=responsable_headers)
    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["total_grupos"] == 1
    assert dashboard.json()["total_tutores"] == 0

    actualizado = client.put(
        f"/tutoria/grupos/{grupo.id}",
        headers=responsable_headers,
        json={"tutor_id": tutor.id},
    )
    assert actualizado.status_code == 200, actualizado.text
    db.refresh(reporte)
    assert reporte.estado == "ENVIADO"
    assert reporte.tutor_destinatario_id == tutor.id


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


def test_vista_contextual_oculta_detalles_y_alerta_temprana_llega_al_tutor(client, db):
    reportante, tutor, alumno, carga, grupo_tutorado = _escenario(db)
    canalizacion = Canalizacion(
        tutor_id=tutor.id,
        alumno_id=alumno.id,
        grupo_tutorado_id=grupo_tutorado.id,
        tipo_psicologico=True,
        motivo="Detalle clínico que el docente no debe conocer",
        estado="EN_SEGUIMIENTO",
    )
    db.add(canalizacion)
    db.commit()
    headers = auth_headers(get_token(client, reportante.email, "Materia123!"))

    contexto = client.get(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumno.id}/contexto",
        headers=headers,
    )
    assert contexto.status_code == 200, contexto.text
    datos = contexto.json()
    assert datos["canalizacion_activa"] is True
    assert datos["tutor_asignado"] == tutor.nombre
    assert "motivo" not in datos
    assert "tipo_psicologico" not in datos

    alerta = client.post(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumno.id}/alerta-temprana",
        headers=headers,
        json={
            "senal": "CAMBIO_CONDUCTA",
            "nivel": "ATENCION",
            "comentario": "Se mostró apática y dejó de participar durante esta semana.",
        },
    )
    assert alerta.status_code == 200, alerta.text
    assert alerta.json()["destinatario"] == tutor.nombre
    reporte = db.query(ReporteTutor).filter(
        ReporteTutor.id == alerta.json()["id"],
    ).one()
    assert reporte.categoria == "CONDUCTA"
    assert reporte.tutor_destinatario_id == tutor.id
    assert reporte.prioridad == "MEDIA"

    repetida = client.post(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumno.id}/alerta-temprana",
        headers=headers,
        json={"senal": "CAMBIO_CONDUCTA", "nivel": "ATENCION"},
    )
    assert repetida.status_code == 409
