import datetime
from zoneinfo import ZoneInfo

from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.departamento import Departamento
from models.catalogo import (
    CatalogoAlumno, CatalogoMateria, GrupoAcademico, InscripcionAlumno,
    PeriodoEscolar,
)
from tests.conftest import auth_headers, get_token


def test_flujo_horario_clase_y_asistencia(client, db):
    docente = Usuario(
        nombre="Docente Horario",
        email="docencia@test.mx",
        password_hash=hashear_password("Docente123!"),
        rol=RolUsuario.DOCENTE,
        activo=True,
    )
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([docente, periodo])
    db.flush()
    grupo = GrupoAcademico(
        periodo_id=periodo.id, carrera="TIEID", cuatrimestre=3, grupo="A", activo=True
    )
    materia = CatalogoMateria(
        nombre="Bases de datos", carrera="TIEID", cuatrimestre_oficial=3,
        periodo=periodo.clave, activo=True,
    )
    db.add_all([grupo, materia])
    db.flush()
    alumnos = [
        CatalogoAlumno(
            matricula=f"UTC{i}", apellido_paterno=f"Alumno{i}", apellido_materno="",
            nombres="Prueba", carrera="TIEID", cuatrimestre=3, grupo="A",
            periodo=periodo.clave, activo=True,
        )
        for i in (1, 2)
    ]
    db.add_all(alumnos)
    db.flush()
    db.add_all([
        InscripcionAlumno(alumno_id=a.id, grupo_academico_id=grupo.id, estado="ACTIVO")
        for a in alumnos
    ])
    db.commit()

    token = get_token(client, docente.email, "Docente123!")
    headers = auth_headers(token)
    dia_hoy = datetime.datetime.now(ZoneInfo("America/Mexico_City")).weekday()
    payload = {
        "periodo_id": periodo.id,
        "grupo_academico_id": grupo.id,
        "materia_id": materia.id,
        "tipo_actividad": "CLASE",
        "actividad_nombre": materia.nombre,
        "dia_semana": dia_hoy,
        "hora_inicio": "08:00",
        "hora_fin": "09:00",
        "espacio_nombre": "S3",
    }
    creada = client.post("/docencia/horario", json=payload, headers=headers)
    assert creada.status_code == 200, creada.text
    carga_id = creada.json()["carga"]["id"]
    activada = client.post(f"/docencia/horario/{carga_id}/activar", headers=headers)
    assert activada.status_code == 200, activada.text

    solapada = client.post(
        "/docencia/horario",
        json={**payload, "hora_inicio": "08:30", "hora_fin": "09:30"},
        headers=headers,
    )
    assert solapada.status_code == 409

    iniciada = client.post(f"/docencia/horario/{carga_id}/iniciar", headers=headers)
    assert iniciada.status_code == 200, iniciada.text
    clase = iniciada.json()
    assert clase["estado"] == "ABIERTA"
    assert clase["resumen"]["total"] == 2
    asistencia_id = clase["alumnos"][0]["asistencia_id"]

    falta = client.patch(
        f"/docencia/clases/{clase['id']}/asistencia/{asistencia_id}",
        json={"estado": "FALTA", "observacion": "No asistió"},
        headers=headers,
    )
    assert falta.status_code == 200, falta.text
    cerrada = client.post(
        f"/docencia/clases/{clase['id']}/cerrar",
        json={
            "observacion_general": "Clase finalizada",
            "tema_impartido": "Consultas y relaciones",
            "avance_planeacion": 85,
            "actividades_realizadas": "Ejercicio guiado",
            "tarea_asignada": "Modelo relacional",
            "incidencias": "",
            "tema_pendiente": "Índices",
        },
        headers=headers,
    )
    assert cerrada.status_code == 200, cerrada.text
    assert cerrada.json()["resumen"]["falta"] == 1
    assert cerrada.json()["resumen"]["presente"] == 1
    assert cerrada.json()["bitacora"]["tema_impartido"] == "Consultas y relaciones"
    assert cerrada.json()["bitacora"]["avance_planeacion"] == 85

    bloqueada = client.patch(
        f"/docencia/clases/{clase['id']}/asistencia/{asistencia_id}",
        json={"estado": "PRESENTE"},
        headers=headers,
    )
    assert bloqueada.status_code == 409
    correccion = client.post(
        f"/docencia/clases/{clase['id']}/habilitar-correccion",
        json={"motivo": "El alumno presentó justificante"},
        headers=headers,
    )
    assert correccion.status_code == 200, correccion.text
    assert correccion.json()["estado"] == "CORRECCION"
    corregida = client.patch(
        f"/docencia/clases/{clase['id']}/asistencia/{asistencia_id}",
        json={"estado": "JUSTIFICADA"},
        headers=headers,
    )
    assert corregida.status_code == 200, corregida.text
    recerrada = client.post(
        f"/docencia/clases/{clase['id']}/cerrar",
        json={},
        headers=headers,
    )
    assert recerrada.status_code == 200
    seguimiento = client.get(f"/docencia/seguimiento/{carga_id}", headers=headers)
    assert seguimiento.status_code == 200, seguimiento.text
    assert seguimiento.json()["total_clases"] == 1
    assert seguimiento.json()["alumnos"][0]["justificada"] == 1

    alumno_id = clase["alumnos"][0]["alumno_id"]
    registro = client.post(
        f"/docencia/seguimiento/{carga_id}/alumnos/{alumno_id}/registros",
        json={
            "tipo": "CALIFICACION", "titulo": "Primer parcial",
            "detalle": "Evaluación escrita", "calificacion": 8.5,
        },
        headers=headers,
    )
    assert registro.status_code == 200, registro.text
    ficha = client.get(
        f"/docencia/seguimiento/{carga_id}/alumnos/{alumno_id}",
        headers=headers,
    )
    assert ficha.status_code == 200, ficha.text
    assert ficha.json()["registros"][0]["calificacion"] == 8.5
    acuerdo = client.post(
        f"/docencia/seguimiento/{carga_id}/alumnos/{alumno_id}/registros",
        json={
            "tipo": "ACUERDO", "titulo": "Actividad de recuperación",
            "estado": "PENDIENTE", "fecha_revision": "2026-08-05",
        },
        headers=headers,
    )
    ficha_acuerdo = client.get(
        f"/docencia/seguimiento/{carga_id}/alumnos/{alumno_id}",
        headers=headers,
    )
    assert ficha_acuerdo.json()["registros"][0]["fecha_revision"] == "2026-08-05"
    atendido = client.patch(
        f"/docencia/seguimiento/registros/{acuerdo.json()['id']}",
        json={"estado": "ATENDIDO"},
        headers=headers,
    )
    assert atendido.status_code == 200
    assert atendido.json()["estado"] == "ATENDIDO"


def test_materias_corresponden_a_division_de_carrera(client, db):
    division = Departamento(
        nombre="Dirección de División de Carrera", clave="DDC", activo=True
    )
    db.add(division)
    db.flush()
    responsable = Usuario(
        nombre="Responsable División", email="division@test.mx",
        password_hash=hashear_password("Division123!"),
        rol=RolUsuario.ADMINISTRATIVO, activo=True, departamento_id=division.id,
    )
    escolares = Usuario(
        nombre="Servicios Escolares", email="escolares@test.mx",
        password_hash=hashear_password("Escolares123!"),
        rol=RolUsuario.SERVICIOS_ESCOLARES, activo=True,
    )
    db.add_all([responsable, escolares])
    db.flush()
    division.responsable_id = responsable.id
    db.commit()

    payload = {
        "nombre": "Programación",
        "carrera": "TIEID",
        "cuatrimestre_oficial": 3,
        "periodo": "MAY-AGO 2026",
    }
    token_division = get_token(client, responsable.email, "Division123!")
    creada = client.post(
        "/catalogo/materias", json=payload, headers=auth_headers(token_division)
    )
    assert creada.status_code == 201, creada.text

    token_escolares = get_token(client, escolares.email, "Escolares123!")
    denegada = client.post(
        "/catalogo/materias",
        json={**payload, "nombre": "Materia no autorizada"},
        headers=auth_headers(token_escolares),
    )
    assert denegada.status_code == 403
