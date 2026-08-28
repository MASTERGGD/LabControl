import datetime
from zoneinfo import ZoneInfo

import routers.docencia as docencia_router

from dependencies import hashear_password
from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico, HistorialCalendarioAcademico
from models.catalogo import GrupoAcademico, PeriodoEscolar
from models.docencia import CargaDocente
from models.usuario import RolUsuario, Usuario
from tests.conftest import auth_headers, get_token


def test_selector_docente_muestra_actual_y_solo_historial_propio(client, db):
    docente = Usuario(
        nombre="Docente periodos", email="periodos.docente@test.mx",
        password_hash=hashear_password("Docente123!"), rol=RolUsuario.DOCENTE, activo=True,
    )
    actual = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    historico = PeriodoEscolar(clave="ENE-ABR 2020", activo=True, es_actual=False)
    futuro = PeriodoEscolar(clave="SEP-DIC 2099", activo=True, es_actual=False)
    ajeno = PeriodoEscolar(clave="SEP-DIC 2019", activo=True, es_actual=False)
    db.add_all([docente, actual, historico, futuro, ajeno]); db.flush()
    for periodo, nombre in ((historico, "Materia histórica"), (futuro, "Materia futura")):
        db.add(CargaDocente(
            docente_id=docente.id, periodo_id=periodo.id,
            tipo_actividad="CLASE", actividad_nombre=nombre, dia_semana=0,
            hora_inicio="08:00", hora_fin="09:00", estado="ACTIVO", activo=True,
        ))
    db.commit()

    headers = auth_headers(get_token(client, docente.email, "Docente123!"))
    respuesta = client.get("/calendario-academico/periodos", headers=headers)

    assert respuesta.status_code == 200, respuesta.text
    assert [periodo["clave"] for periodo in respuesta.json()] == ["MAY-AGO 2026", "ENE-ABR 2020"]


def test_calendario_publicado_suprime_pendientes_y_bloquea_inicio(client, db, monkeypatch):
    ahora = datetime.datetime(2026, 8, 11, 12, 0, tzinfo=ZoneInfo("America/Mexico_City"))
    monkeypatch.setattr(docencia_router, "_ahora_mx", lambda: ahora)
    admin = Usuario(
        nombre="Administrador", email="cal.admin@test.mx",
        password_hash=hashear_password("Admin123!"), rol=RolUsuario.SUPER_ADMIN, activo=True,
    )
    docente = Usuario(
        nombre="Docente calendario", email="cal.docente@test.mx",
        password_hash=hashear_password("Docente123!"), rol=RolUsuario.DOCENTE, activo=True,
    )
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([admin, docente, periodo]); db.flush()
    grupo = GrupoAcademico(periodo_id=periodo.id, carrera="TIEID", cuatrimestre=3, grupo="A", activo=True)
    db.add(grupo); db.flush()
    carga = CargaDocente(
        docente_id=docente.id, periodo_id=periodo.id, grupo_academico_id=grupo.id,
        tipo_actividad="CLASE", actividad_nombre="Programación", dia_semana=1,
        hora_inicio="08:00", hora_fin="09:00", estado="ACTIVO", activo=True,
    )
    db.add(carga); db.commit()
    admin_headers = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_headers = auth_headers(get_token(client, docente.email, "Docente123!"))

    creado = client.post("/calendario-academico", headers=admin_headers, json={"periodo_id": periodo.id})
    assert creado.status_code == 200, creado.text
    calendario_id = creado.json()["id"]
    borrador_oculto = client.get(
        "/calendario-academico", headers=docente_headers, params={"periodo_id": periodo.id},
    )
    assert borrador_oculto.status_code == 200
    assert borrador_oculto.json() is None
    evento = client.post(
        f"/calendario-academico/{calendario_id}/eventos", headers=admin_headers,
        json={
            "titulo": "Receso de clases", "tipo": "RECESO_CLASES",
            "fecha_inicio": "2026-08-10", "fecha_fin": "2026-08-28",
            "requiere_asistencia": False, "permite_iniciar_clase": False,
            "genera_alertas": False, "color": "#64748b",
        },
    )
    assert evento.status_code == 200, evento.text
    publicado = client.put(
        f"/calendario-academico/{calendario_id}/estado", headers=admin_headers,
        json={"estado": "PUBLICADO"},
    )
    assert publicado.status_code == 200, publicado.text
    visible = client.get(
        "/calendario-academico", headers=docente_headers, params={"periodo_id": periodo.id},
    )
    assert visible.json()["estado"] == "PUBLICADO"

    dashboard = client.get("/docencia/dashboard", headers=docente_headers)
    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["resumen"]["clases_hoy"] == 0
    assert dashboard.json()["resumen"]["asistencias_pendientes"] == 0
    assert dashboard.json()["resumen"]["actividades_suspendidas_hoy"] == 1
    assert dashboard.json()["resumen"]["clases_semana_lectivas"] == 0
    assert dashboard.json()["jornada"][0]["estado"] == "NO_LECTIVA"
    assert dashboard.json()["jornada"][0]["calendario"]["motivo"] == "Receso de clases"
    assert dashboard.json()["calendario_hoy"]["motivo"] == "Receso de clases"
    assert dashboard.json()["proxima_clase"]["fecha"] == "2026-09-01"
    iniciar = client.post(f"/docencia/horario/{carga.id}/iniciar", headers=docente_headers)
    assert iniciar.status_code == 409
    assert "Receso de clases" in iniciar.json()["detail"]
    disponibles = client.get("/docencia/capturas-extemporaneas/disponibles", headers=docente_headers)
    assert disponibles.status_code == 200
    assert disponibles.json() == []


def test_modificacion_publicada_exige_motivo_y_conserva_historial(client, db):
    admin = Usuario(
        nombre="Administrador", email="hist.cal@test.mx",
        password_hash=hashear_password("Admin123!"), rol=RolUsuario.SUPER_ADMIN, activo=True,
    )
    periodo = PeriodoEscolar(clave="SEP-DIC 2026", activo=True, es_actual=True)
    db.add_all([admin, periodo]); db.flush()
    calendario = CalendarioAcademico(periodo_id=periodo.id, creado_por_id=admin.id, estado="PUBLICADO")
    db.add(calendario); db.flush()
    evento = EventoCalendarioAcademico(
        calendario_id=calendario.id, titulo="Suspensión", tipo="SUSPENSION_GENERAL",
        fecha_inicio=datetime.date(2026, 9, 16), fecha_fin=datetime.date(2026, 9, 16),
        requiere_asistencia=False, permite_iniciar_clase=False, genera_alertas=False,
        creado_por_id=admin.id,
    )
    db.add(evento); db.commit()
    headers = auth_headers(get_token(client, admin.email, "Admin123!"))
    payload = {
        "titulo": "Suspensión oficial", "tipo": "SUSPENSION_GENERAL",
        "fecha_inicio": "2026-09-16", "fecha_fin": "2026-09-16",
        "requiere_asistencia": False, "permite_iniciar_clase": False,
        "genera_alertas": False,
    }
    sin_motivo = client.put(
        f"/calendario-academico/{calendario.id}/eventos/{evento.id}", headers=headers, json=payload,
    )
    assert sin_motivo.status_code == 422
    editado = client.put(
        f"/calendario-academico/{calendario.id}/eventos/{evento.id}", headers=headers,
        json={**payload, "motivo_cambio": "Actualización del documento oficial"},
    )
    assert editado.status_code == 200, editado.text
    historial = db.query(HistorialCalendarioAcademico).one()
    assert historial.datos_anteriores["titulo"] == "Suspensión"
    assert historial.datos_nuevos["titulo"] == "Suspensión oficial"
    assert historial.motivo == "Actualización del documento oficial"
