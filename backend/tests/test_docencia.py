import datetime
from zoneinfo import ZoneInfo

from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.departamento import Departamento
from models.catalogo import (
    CatalogoAlumno, CatalogoMateria, GrupoAcademico, InscripcionAlumno,
    PeriodoEscolar,
)
from models.horario import HorarioDisponible, Reservacion
from models.laboratorio import Laboratorio
from models.docencia import (
    AsistenciaDocente, CargaDocente, ClaseDocente,
    DetalleJustificacionAsistencia, JustificacionAsistenciaDocente,
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
    laboratorio = Laboratorio(nombre="Laboratorio docente", categoria="COMPUTO", activo=True)
    db.add(laboratorio)
    db.flush()
    db.add(HorarioDisponible(
        laboratorio_id=laboratorio.id, dia_semana=datetime.datetime.now(ZoneInfo("America/Mexico_City")).weekday(),
        hora_inicio="08:00", hora_fin="09:00", cuatrimestre="MAY-AGO-2026", activo=True,
    ))
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
        "laboratorio_id": laboratorio.id,
    }
    creada = client.post("/docencia/horario", json=payload, headers=headers)
    assert creada.status_code == 200, creada.text
    carga_id = creada.json()["carga"]["id"]
    activada = client.post(f"/docencia/horario/{carga_id}/activar", headers=headers)
    assert activada.status_code == 200, activada.text
    disponible = client.post(
        "/docencia/horario/verificar-laboratorio",
        params={"carga_id": carga_id},
        json=payload,
        headers=headers,
    )
    assert disponible.status_code == 200, disponible.text
    assert disponible.json()["estado"] == "DISPONIBLE"
    reservada = client.post(
        f"/docencia/horario/{carga_id}/reservar-laboratorio", headers=headers,
    )
    assert reservada.status_code == 200, reservada.text
    assert reservada.json()["estado"] == "RESERVADO"
    assert db.query(Reservacion).filter(Reservacion.carga_docente_id == carga_id).count() == 1
    ocupada = client.post(
        "/docencia/horario/verificar-laboratorio", json=payload, headers=headers,
    )
    assert ocupada.status_code == 200
    assert ocupada.json()["estado"] == "OCUPADO"
    assert ocupada.json()["ocupaciones"][0]["docente"] == docente.nombre

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
        json={"estado": "ATENDIDO", "resultado_atencion": "Se contactó al alumno y se acordó una revisión semanal."},
        headers=headers,
    )
    assert atendido.status_code == 200
    assert atendido.json()["estado"] == "ATENDIDO"


def test_docente_justifica_varias_faltas_del_mismo_alumno(client, db):
    docente = Usuario(
        nombre="Marco Docente", email="marco.justifica@test.mx",
        password_hash=hashear_password("Marco123!"),
        rol=RolUsuario.DOCENTE, activo=True,
    )
    docente_ajeno = Usuario(
        nombre="Docente Ajeno", email="ajeno.justifica@test.mx",
        password_hash=hashear_password("Ajeno123!"),
        rol=RolUsuario.DOCENTE, activo=True,
    )
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([docente, docente_ajeno, periodo])
    db.flush()
    grupo = GrupoAcademico(
        periodo_id=periodo.id, carrera="TIEID", cuatrimestre=3,
        grupo="A", activo=True,
    )
    alumna = CatalogoAlumno(
        matricula="UTC-KAREN", apellido_paterno="Cabrera",
        apellido_materno="", nombres="Karen", carrera="TIEID",
        cuatrimestre=3, grupo="A", periodo=periodo.clave, activo=True,
    )
    db.add_all([grupo, alumna])
    db.flush()
    db.add(InscripcionAlumno(
        alumno_id=alumna.id, grupo_academico_id=grupo.id, estado="ACTIVO",
    ))
    carga = CargaDocente(
        docente_id=docente.id, periodo_id=periodo.id,
        grupo_academico_id=grupo.id, tipo_actividad="CLASE",
        actividad_nombre="Cálculo Integral", dia_semana=0,
        hora_inicio="08:00", hora_fin="09:00", estado="ACTIVO", activo=True,
    )
    db.add(carga)
    db.flush()
    clases = [
        ClaseDocente(
            carga_docente_id=carga.id, fecha=datetime.date(2026, 7, dia),
            estado="CERRADA",
        )
        for dia in (20, 22)
    ]
    db.add_all(clases)
    db.flush()
    faltas = [
        AsistenciaDocente(
            clase_docente_id=clase.id, alumno_id=alumna.id, estado="FALTA",
        )
        for clase in clases
    ]
    db.add_all(faltas)
    db.commit()

    headers = auth_headers(get_token(client, docente.email, "Marco123!"))
    disponibles = client.get(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumna.id}/faltas",
        params={"fecha_inicio": "2026-07-20", "fecha_fin": "2026-07-22"},
        headers=headers,
    )
    assert disponibles.status_code == 200, disponibles.text
    assert [fila["asistencia_id"] for fila in disponibles.json()["faltas"]] == [
        falta.id for falta in faltas
    ]

    ajeno = client.post(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumna.id}/justificar-faltas",
        json={
            "fecha_inicio": "2026-07-20", "fecha_fin": "2026-07-22",
            "asistencia_ids": [falta.id for falta in faltas],
            "motivo": "Justificante emitido por División de Carrera",
        },
        headers=auth_headers(get_token(client, docente_ajeno.email, "Ajeno123!")),
    )
    assert ajeno.status_code == 404

    respuesta = client.post(
        f"/docencia/seguimiento/{carga.id}/alumnos/{alumna.id}/justificar-faltas",
        json={
            "fecha_inicio": "2026-07-20", "fecha_fin": "2026-07-22",
            "asistencia_ids": [falta.id for falta in faltas],
            "motivo": "Justificante emitido por División de Carrera",
            "folio": "DC-2026-0142",
        },
        headers=headers,
    )
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["faltas_justificadas"] == 2
    db.expire_all()
    assert all(
        falta.estado == "JUSTIFICADA"
        and "DC-2026-0142" in (falta.observacion or "")
        for falta in faltas
    )
    justificacion = db.query(JustificacionAsistenciaDocente).one()
    assert justificacion.docente_id == docente.id
    assert justificacion.motivo == "Justificante emitido por División de Carrera"
    detalles = db.query(DetalleJustificacionAsistencia).all()
    assert len(detalles) == 2
    assert all(
        detalle.estado_anterior == "FALTA"
        and detalle.estado_nuevo == "JUSTIFICADA"
        for detalle in detalles
    )


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
