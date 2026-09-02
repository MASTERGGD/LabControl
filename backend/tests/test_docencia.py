import datetime
from zoneinfo import ZoneInfo

import routers.docencia as docencia_router

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
from models.tutoria import GrupoTutorado
from tests.conftest import auth_headers, get_token


def test_flujo_horario_clase_y_asistencia(client, db, monkeypatch):
    reloj = {
        "ahora": datetime.datetime(2026, 8, 24, 7, 30, tzinfo=ZoneInfo("America/Mexico_City")),
    }
    monkeypatch.setattr(docencia_router, "_ahora_mx", lambda: reloj["ahora"])
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
        laboratorio_id=laboratorio.id, dia_semana=reloj["ahora"].weekday(),
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
    dia_hoy = reloj["ahora"].weekday()
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
        "uso_laboratorio": "SOLO_AULA",
    }
    creada = client.post("/docencia/horario", json=payload, headers=headers)
    assert creada.status_code == 200, creada.text
    assert creada.json()["carga"]["uso_laboratorio"] == "SOLO_AULA"
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

    anticipada = client.post(f"/docencia/horario/{carga_id}/iniciar", headers=headers)
    assert anticipada.status_code == 409
    assert "desde las 07:45" in anticipada.json()["detail"]

    reloj["ahora"] = reloj["ahora"].replace(hour=8, minute=30)
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
    assert corregida.status_code == 422, corregida.text
    recerrada = client.post(
        f"/docencia/clases/{clase['id']}/cerrar",
        json={},
        headers=headers,
    )
    assert recerrada.status_code == 200
    justificada = client.post(
        f"/docencia/seguimiento/{carga_id}/alumnos/{clase['alumnos'][0]['alumno_id']}/justificar-faltas",
        json={
            "fecha_inicio": clase["fecha"],
            "fecha_fin": clase["fecha"],
            "asistencia_ids": [asistencia_id],
            "motivo": "Justificante validado por División de Carrera",
            "folio": "DC-2026-0001",
        },
        headers=headers,
    )
    assert justificada.status_code == 200, justificada.text
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
            "estado": "PENDIENTE", "fecha_limite": "2026-08-04", "fecha_revision": "2026-08-05",
        },
        headers=headers,
    )
    ficha_acuerdo = client.get(
        f"/docencia/seguimiento/{carga_id}/alumnos/{alumno_id}",
        headers=headers,
    )
    assert ficha_acuerdo.json()["registros"][0]["fecha_revision"] == "2026-08-05"
    assert ficha_acuerdo.json()["registros"][0]["fecha_limite"] == "2026-08-04"
    reprogramado = client.patch(
        f"/docencia/seguimiento/registros/{acuerdo.json()['id']}",
        json={
            "estado": "REPROGRAMADO", "resultado_atencion": "El alumno solicitó una extensión justificada.",
            "fecha_limite": "2026-08-07", "fecha_revision": "2026-08-08",
        },
        headers=headers,
    )
    assert reprogramado.status_code == 200
    assert reprogramado.json()["estado"] == "REPROGRAMADO"
    atendido = client.patch(
        f"/docencia/seguimiento/registros/{acuerdo.json()['id']}",
        json={"estado": "CUMPLIDO_PARCIAL", "resultado_atencion": "El alumno entregó una parte y mostró avance verificable."},
        headers=headers,
    )
    assert atendido.status_code == 200
    assert atendido.json()["estado"] == "CUMPLIDO_PARCIAL"

    dashboard = client.get("/docencia/dashboard", headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    tablero = dashboard.json()
    assert tablero["resumen"]["clases_hoy"] == 1
    assert tablero["resumen"]["clases_cerradas"] == 1
    assert tablero["jornada"][0]["materia"] == materia.nombre
    assert tablero["jornada"][0]["estado"] == "CERRADA"
    assert tablero["grupos"][0]["total_alumnos"] == 2
    assert tablero["grupos"][0]["asistencia_promedio"] == 100.0


def test_cambio_de_periodo_separa_horarios_y_protege_historial(client, db):
    docente = Usuario(
        nombre="Docente Cambio Periodo",
        email="cambio.periodo@test.mx",
        password_hash=hashear_password("Periodo123!"),
        rol=RolUsuario.DOCENTE,
        activo=True,
    )
    # Simula una bandera administrativa rezagada durante el cambio de cuatrimestre:
    # la fecha ya corresponde a MAY-AGO, aunque ENE-ABR siga marcado en la base.
    anterior = PeriodoEscolar(clave="ENE-ABR 2026", activo=True, es_actual=True)
    actual = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=False)
    db.add_all([docente, anterior, actual])
    db.flush()
    carga_anterior = CargaDocente(
        docente_id=docente.id,
        periodo_id=anterior.id,
        tipo_actividad="CLASE",
        actividad_nombre="Materia anterior",
        dia_semana=datetime.datetime.now(ZoneInfo("America/Mexico_City")).weekday(),
        hora_inicio="08:00",
        hora_fin="09:00",
        espacio_nombre="Aula 1",
        estado="ACTIVO",
        activo=True,
    )
    db.add(carga_anterior)
    db.commit()

    headers = auth_headers(get_token(client, docente.email, "Periodo123!"))
    horario_actual = client.get("/docencia/horario", headers=headers)
    assert horario_actual.status_code == 200
    assert horario_actual.json() == []

    historial = client.get(
        "/docencia/horario",
        params={"periodo_id": anterior.id},
        headers=headers,
    )
    assert historial.status_code == 200
    assert [carga["id"] for carga in historial.json()] == [carga_anterior.id]

    iniciar_historica = client.post(
        f"/docencia/horario/{carga_anterior.id}/iniciar",
        headers=headers,
    )
    assert iniciar_historica.status_code == 409
    assert "solo para consulta" in iniciar_historica.json()["detail"]

    copia_retirada = client.post(
        "/docencia/horario/copiar-periodo",
        json={
            "periodo_origen_id": anterior.id,
            "periodo_destino_id": actual.id,
        },
        headers=headers,
    )
    assert copia_retirada.status_code == 405
    assert db.query(CargaDocente).filter(
        CargaDocente.docente_id == docente.id,
        CargaDocente.periodo_id == actual.id,
    ).count() == 0


def test_servicios_escolares_confirma_periodo_vigente(client, db):
    escolares = Usuario(
        nombre="Servicios Escolares Periodos",
        email="periodos.escolares@test.mx",
        password_hash=hashear_password("Escolares123!"),
        rol=RolUsuario.SERVICIOS_ESCOLARES,
        activo=True,
    )
    anterior = PeriodoEscolar(clave="ENE-ABR 2026", activo=True, es_actual=True)
    vigente = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=False)
    db.add_all([escolares, anterior, vigente])
    db.commit()
    headers = auth_headers(get_token(client, escolares.email, "Escolares123!"))

    listado = client.get("/servicios-escolares/periodos", headers=headers)
    assert listado.status_code == 200, listado.text
    periodos = {periodo["clave"]: periodo for periodo in listado.json()}
    assert periodos["MAY-AGO 2026"]["es_actual"] is True
    assert periodos["MAY-AGO 2026"]["es_actual_configurado"] is False
    assert periodos["MAY-AGO 2026"]["coincide_con_fecha"] is True

    activado = client.patch(
        f"/servicios-escolares/periodos/{vigente.id}/establecer-actual",
        headers=headers,
    )
    assert activado.status_code == 200, activado.text
    db.refresh(anterior)
    db.refresh(vigente)
    assert vigente.es_actual is True
    assert anterior.es_actual is False


def test_captura_extemporanea_solo_dentro_de_48_horas(client, db, monkeypatch):
    ahora = datetime.datetime(2026, 7, 31, 10, 0, tzinfo=ZoneInfo("America/Mexico_City"))
    monkeypatch.setattr(docencia_router, "_ahora_mx", lambda: ahora)
    docente = Usuario(
        nombre="Docente Extemporáneo", email="extemporaneo@test.mx",
        password_hash=hashear_password("Extemporaneo123!"),
        rol=RolUsuario.DOCENTE, activo=True,
    )
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([docente, periodo])
    db.flush()
    grupo = GrupoAcademico(
        periodo_id=periodo.id, carrera="TIEID", cuatrimestre=3, grupo="A", activo=True,
    )
    alumno = CatalogoAlumno(
        matricula="UTC-EXT-1", apellido_paterno="Pérez", apellido_materno="",
        nombres="Karen", carrera="TIEID", cuatrimestre=3, grupo="A",
        periodo=periodo.clave, activo=True,
    )
    db.add_all([grupo, alumno])
    db.flush()
    db.add(InscripcionAlumno(
        alumno_id=alumno.id, grupo_academico_id=grupo.id, estado="ACTIVO",
    ))
    vigente = CargaDocente(
        docente_id=docente.id, periodo_id=periodo.id, grupo_academico_id=grupo.id,
        tipo_actividad="CLASE", actividad_nombre="Clase del jueves",
        dia_semana=3, hora_inicio="08:00", hora_fin="09:00",
        estado="ACTIVO", activo=True,
    )
    vencida = CargaDocente(
        docente_id=docente.id, periodo_id=periodo.id, grupo_academico_id=grupo.id,
        tipo_actividad="CLASE", actividad_nombre="Clase del miércoles",
        dia_semana=2, hora_inicio="08:00", hora_fin="09:00",
        estado="ACTIVO", activo=True,
    )
    db.add_all([vigente, vencida])
    db.commit()
    headers = auth_headers(get_token(client, docente.email, "Extemporaneo123!"))

    disponibles = client.get("/docencia/capturas-extemporaneas/disponibles", headers=headers)
    assert disponibles.status_code == 200, disponibles.text
    assert [(item["carga_id"], item["fecha"]) for item in disponibles.json()] == [
        (vigente.id, "2026-07-30"),
    ]

    creada = client.post(
        f"/docencia/horario/{vigente.id}/captura-extemporanea",
        headers=headers,
        json={"fecha": "2026-07-30", "motivo": "No fue posible capturar al finalizar."},
    )
    assert creada.status_code == 200, creada.text
    assert creada.json()["es_extemporanea"] is True
    assert creada.json()["resumen"]["total"] == 1
    assert creada.json()["motivo_extemporaneo"] == "No fue posible capturar al finalizar."

    duplicada = client.post(
        f"/docencia/horario/{vigente.id}/captura-extemporanea",
        headers=headers,
        json={"fecha": "2026-07-30", "motivo": "Segundo intento inválido."},
    )
    assert duplicada.status_code == 409

    clase_extemporanea = db.query(ClaseDocente).filter(ClaseDocente.id == creada.json()["id"]).one()
    db.delete(clase_extemporanea)
    db.commit()
    no_impartida = client.post(
        f"/docencia/horario/{vigente.id}/no-impartida",
        headers=headers,
        json={
            "fecha": "2026-07-30", "motivo": "No hubo energia electrica en el edificio.",
            "programar_reposicion": True, "fecha_reposicion": "2026-08-01",
            "hora_inicio": "10:00", "hora_fin": "11:00", "tema": "Tema pendiente",
        },
    )
    assert no_impartida.status_code == 200, no_impartida.text
    assert no_impartida.json()["clase_original"]["estado"] == "NO_IMPARTIDA"
    assert no_impartida.json()["clase_original"]["motivo_no_impartida"] == "No hubo energia electrica en el edificio."
    assert no_impartida.json()["reposicion"]["clase_origen_id"] == no_impartida.json()["clase_original"]["id"]
    assert no_impartida.json()["reposicion"]["estado_reposicion"] == "PROGRAMADA"

    fuera_plazo = client.post(
        f"/docencia/horario/{vencida.id}/captura-extemporanea",
        headers=headers,
        json={"fecha": "2026-07-29", "motivo": "Intento fuera del plazo permitido."},
    )
    assert fuera_plazo.status_code == 409
    assert "48 horas" in fuera_plazo.json()["detail"]


def test_clase_en_curso_no_aparece_como_pendiente(client, db, monkeypatch):
    ahora = datetime.datetime(2026, 8, 26, 9, 34, tzinfo=ZoneInfo("America/Mexico_City"))
    monkeypatch.setattr(docencia_router, "_ahora_mx", lambda: ahora)
    docente = Usuario(
        nombre="Docente Clase En Curso", email="clase.en.curso@test.mx",
        password_hash=hashear_password("ClaseEnCurso123!"),
        rol=RolUsuario.DOCENTE, activo=True,
    )
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([docente, periodo])
    db.flush()
    grupo = GrupoAcademico(
        periodo_id=periodo.id, carrera="TIEID", cuatrimestre=3, grupo="A", activo=True,
    )
    db.add(grupo)
    db.flush()
    carga = CargaDocente(
        docente_id=docente.id, periodo_id=periodo.id, grupo_academico_id=grupo.id,
        tipo_actividad="CLASE", actividad_nombre="Bases de Datos",
        dia_semana=2, hora_inicio="08:00", hora_fin="09:45",
        estado="ACTIVO", activo=True,
    )
    db.add(carga)
    db.commit()
    headers = auth_headers(get_token(client, docente.email, "ClaseEnCurso123!"))

    disponibles = client.get("/docencia/capturas-extemporaneas/disponibles", headers=headers)
    assert disponibles.status_code == 200, disponibles.text
    assert disponibles.json() == []

    captura = client.post(
        f"/docencia/horario/{carga.id}/captura-extemporanea",
        headers=headers,
        json={"fecha": "2026-08-26", "motivo": "Intento durante la clase."},
    )
    assert captura.status_code == 409
    assert "en curso" in captura.json()["detail"]


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
    assert creada.json()["periodo"] is None
    assert creada.json()["alcance"] == "PLAN_ESTUDIOS"
    repetida_otro_periodo = client.post(
        "/catalogo/materias",
        json={**payload, "periodo": "MAY-AGO 2027"},
        headers=auth_headers(token_division),
    )
    assert repetida_otro_periodo.status_code == 409
    listado_2027 = client.get(
        "/catalogo/materias",
        params={"periodo": "MAY-AGO 2027", "activo": True},
        headers=auth_headers(token_division),
    )
    assert listado_2027.status_code == 200
    assert [materia["nombre"] for materia in listado_2027.json()] == ["Programación"]

    token_escolares = get_token(client, escolares.email, "Escolares123!")
    denegada = client.post(
        "/catalogo/materias",
        json={**payload, "nombre": "Materia no autorizada"},
        headers=auth_headers(token_escolares),
    )
    assert denegada.status_code == 403


def test_materia_grupo_solo_puede_pertenecer_a_un_docente(client, db):
    docentes = [Usuario(
        nombre=nombre, email=correo, password_hash=hashear_password("Docente123!"),
        rol=RolUsuario.DOCENTE, activo=True,
    ) for nombre, correo in (("Gilberto", "gilberto.asignacion@test.mx"), ("Bruno", "bruno.asignacion@test.mx"))]
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([*docentes, periodo]); db.flush()
    grupos = [GrupoAcademico(
        periodo_id=periodo.id, carrera="TIEID", cuatrimestre=9, grupo=letra, activo=True,
    ) for letra in ("A", "B")]
    materia = CatalogoMateria(
        nombre="Extracción de conocimiento", carrera="TIEID",
        # Dato legado de alta: no debe limitar la reutilización de la materia.
        cuatrimestre_oficial=9, periodo="MAY-AGO 2025", activo=True,
    )
    db.add_all([*grupos, materia]); db.commit()
    base = {
        "periodo_id": periodo.id, "materia_id": materia.id, "tipo_actividad": "CLASE",
        "actividad_nombre": materia.nombre, "hora_inicio": "08:00", "hora_fin": "09:00",
        "espacio_nombre": "S3", "laboratorio_id": None,
    }
    gilberto_h = auth_headers(get_token(client, docentes[0].email, "Docente123!"))
    bruno_h = auth_headers(get_token(client, docentes[1].email, "Docente123!"))

    primera = client.post("/docencia/horario", headers=gilberto_h, json={
        **base, "grupo_academico_id": grupos[0].id, "dia_semana": 0,
    })
    assert primera.status_code == 200, primera.text
    segundo_bloque = client.post("/docencia/horario", headers=gilberto_h, json={
        **base, "grupo_academico_id": grupos[0].id, "dia_semana": 2,
    })
    assert segundo_bloque.status_code == 200, segundo_bloque.text
    duplicada = client.post("/docencia/horario", headers=bruno_h, json={
        **base, "grupo_academico_id": grupos[0].id, "dia_semana": 1,
    })
    assert duplicada.status_code == 409
    assert "Gilberto" in duplicada.json()["detail"]
    otro_grupo = client.post("/docencia/horario", headers=bruno_h, json={
        **base, "grupo_academico_id": grupos[1].id, "dia_semana": 1,
    })
    assert otro_grupo.status_code == 200, otro_grupo.text

    catalogos = client.get("/docencia/catalogos", headers=bruno_h).json()
    asignacion_a = next(a for a in catalogos["asignaciones_materias"] if a["grupo_academico_id"] == grupos[0].id)
    assert asignacion_a["docente"] == "Gilberto"
    assert asignacion_a["es_propia"] is False


def test_reposicion_es_evento_unico_y_no_modifica_horario(client, db):
    docente = Usuario(nombre="Docente Reposición", email="reposicion@test.mx", password_hash=hashear_password("Docente123!"), rol=RolUsuario.DOCENTE, activo=True)
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([docente, periodo]); db.flush()
    grupo = GrupoAcademico(periodo_id=periodo.id, carrera="TIEID", cuatrimestre=9, grupo="A", activo=True)
    materia = CatalogoMateria(nombre="Extracción", carrera="TIEID", cuatrimestre_oficial=9, periodo=periodo.clave, activo=True)
    db.add_all([grupo, materia]); db.flush()
    hoy = datetime.datetime.now(ZoneInfo("America/Mexico_City")).date()
    fecha_original = hoy - datetime.timedelta(days=7)
    carga = CargaDocente(docente_id=docente.id, periodo_id=periodo.id, grupo_academico_id=grupo.id, materia_id=materia.id, tipo_actividad="CLASE", actividad_nombre=materia.nombre, dia_semana=fecha_original.weekday(), hora_inicio="08:00", hora_fin="09:00", estado="ACTIVO", activo=True)
    db.add(carga); db.flush()
    original = ClaseDocente(carga_docente_id=carga.id, fecha=fecha_original, estado="NO_IMPARTIDA", motivo_no_impartida="Suspensión institucional")
    db.add(original); db.commit()
    headers = auth_headers(get_token(client, docente.email, "Docente123!"))
    pendientes = client.get("/docencia/reposiciones/pendientes", headers=headers)
    assert pendientes.status_code == 200
    assert pendientes.json()[0]["clase_id"] == original.id
    fecha_reposicion = hoy + datetime.timedelta(days=1)
    respuesta = client.post(f"/docencia/horario/{carga.id}/reposiciones", headers=headers, json={
        "fecha_original": fecha_original.isoformat(), "fecha": fecha_reposicion.isoformat(),
        "hora_inicio": "14:00", "hora_fin": "15:00", "motivo": "Suspensión institucional",
        "tema": "Continuación del tema pendiente",
    })
    assert respuesta.status_code == 200, respuesta.text
    clase = db.query(ClaseDocente).filter(ClaseDocente.es_reposicion == True).one()
    assert clase.es_reposicion is True
    assert clase.clase_origen_id == original.id
    assert clase.estado == "PROGRAMADA"
    assert clase.fecha_original == fecha_original
    assert carga.dia_semana == fecha_original.weekday()
    assert carga.hora_inicio == "08:00"
    assert client.get("/docencia/reposiciones/pendientes", headers=headers).json() == []
    cancelada = client.post(f"/docencia/reposiciones/{clase.id}/cancelar", headers=headers, json={"motivo": "Se acordó otra fecha"})
    assert cancelada.status_code == 200
    db.refresh(clase)
    assert clase.estado_reposicion == "CANCELADA"
    assert "Se acordó otra fecha" in clase.observacion_general


def test_bloque_tutoria_exige_grupo_formal_asignado(client, db):
    docente = Usuario(nombre="Tutor Formal", email="tutor.formal@test.mx", password_hash=hashear_password("Docente123!"), rol=RolUsuario.DOCENTE, activo=True)
    ajeno = Usuario(nombre="Tutor Ajeno", email="tutor.ajeno@test.mx", password_hash=hashear_password("Docente123!"), rol=RolUsuario.DOCENTE, activo=True)
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([docente, ajeno, periodo]); db.flush()
    # La asignación puede haberse realizado mientras el periodo aún estaba en
    # preparación. Al convertirse en vigente debe estar disponible en horario
    # aunque la sincronización de Tutoría todavía conserve ese estado.
    grupo = GrupoTutorado(tutor_id=docente.id, carrera="TIEID", cuatrimestre=9, grupo="A", periodo=periodo.clave, activo=True, estado="PREPARACION")
    db.add(grupo); db.commit()
    payload = {"periodo_id": periodo.id, "grupo_tutorado_id": grupo.id, "tipo_actividad": "TUTORIA", "actividad_nombre": "texto ignorado", "dia_semana": 2, "hora_inicio": "08:00", "hora_fin": "09:00"}
    headers = auth_headers(get_token(client, docente.email, "Docente123!"))
    catalogos = client.get("/docencia/catalogos", headers=headers)
    assert catalogos.status_code == 200
    assert catalogos.json()["grupos_tutorados"][0]["id"] == grupo.id
    creada = client.post("/docencia/horario", headers=headers, json=payload)
    assert creada.status_code == 200, creada.text
    assert creada.json()["carga"]["grupo_tutorado_id"] == grupo.id
    assert creada.json()["carga"]["actividad_nombre"] == "Tutoría grupal · 9° A"
    denegada = client.post("/docencia/horario", headers=auth_headers(get_token(client, ajeno.email, "Docente123!")), json=payload)
    assert denegada.status_code == 409
