import datetime
from zoneinfo import ZoneInfo
import pytest
from fastapi import HTTPException
from models.catalogo import PeriodoEscolar, GrupoAcademico
from models.docencia import CargaDocente
from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico
from routers import docencia as router
from tests.conftest import auth_headers, get_token

@pytest.fixture
def datos(db, docente_user, lab, monkeypatch):
    monkeypatch.setattr(router, "_ahora_mx", lambda: datetime.datetime(2026, 9, 3, 10, 30, tzinfo=ZoneInfo("America/Mexico_City")))
    actual = PeriodoEscolar(clave="SEP-DIC 2026", es_actual=True)
    anterior = PeriodoEscolar(clave="MAY-AGO 2026")
    db.add_all([actual, anterior]); db.flush()
    grupo = GrupoAcademico(periodo_id=actual.id, carrera="Tecnologías", cuatrimestre=7, grupo="A")
    otro = GrupoAcademico(periodo_id=anterior.id, carrera="Tecnologías", cuatrimestre=7, grupo="A")
    vacio = GrupoAcademico(periodo_id=actual.id, carrera="Administración", cuatrimestre=7, grupo="A")
    db.add_all([grupo, otro, vacio]); db.flush()
    def carga(nombre, dia, inicio, fin, **extra):
        valores = dict(docente_id=docente_user.id, periodo_id=actual.id, grupo_academico_id=grupo.id, tipo_actividad="CLASE", actividad_nombre=nombre, dia_semana=dia, hora_inicio=inicio, hora_fin=fin, estado="ACTIVO", activo=True)
        valores.update(extra)
        db.add(CargaDocente(**valores))
    carga("Inteligencia artificial", 3, "10:15", "12:00", laboratorio_id=lab.id)
    carga("Algoritmos", 4, "08:00", "09:00")
    carga("Descarga", 3, "12:00", "13:00", tipo_actividad="DESCARGA", espacio_nombre="Privado", grupo_academico_id=None)
    carga("Borrador", 3, "10:00", "11:00", estado="BORRADOR")
    carga("Anterior", 3, "10:00", "11:00", periodo_id=anterior.id, grupo_academico_id=otro.id)
    db.commit()
    return actual, anterior, grupo, otro, vacio

def test_consulta_grupo_y_docente_solo_horario_publico(db, docente_user, datos, lab):
    actual, anterior, grupo, otro, vacio = datos
    catalogo = router.grupos_consulta_horarios(actual.id, db, docente_user)
    assert {g["id"] for g in catalogo} == {grupo.id, vacio.id}
    respuesta = router.horario_publico_grupo(grupo.id, actual.id, db, docente_user)
    r = respuesta["resultados"][0]
    assert r["actividad_actual"]["actividad"] == "Inteligencia artificial"
    assert r["actividad_actual"]["docente"] == docente_user.nombre
    assert r["actividad_actual"]["salon"] == lab.nombre
    assert len(r["semana"]) == 2
    assert r["siguiente_actividad"]["fecha"] == "2026-09-04"
    docente = router.buscar_ubicacion_docentes("Docente", actual.id, db, docente_user)["resultados"][0]
    privado = next(a for a in docente["semana"] if a["tipo_actividad"] == "DESCARGA")
    assert privado["salon"] is None and privado["grupo"] is None
    assert "Privado" not in str(docente)
    assert not router.horario_publico_grupo(vacio.id, actual.id, db, docente_user)["resultados"][0]["semana"]
    with pytest.raises(HTTPException) as error:
        router.horario_publico_grupo(otro.id, actual.id, db, docente_user)
    assert error.value.status_code == 404

def test_periodo_historico_no_simula_actividad_actual(db, docente_user, datos):
    actual, anterior, grupo, otro, vacio = datos
    respuesta = router.horario_publico_grupo(otro.id, anterior.id, db, docente_user)
    assert respuesta["es_actual"] is False
    r = respuesta["resultados"][0]
    assert r["actividad_actual"] is None and not r["jornada"]
    assert r["semana"][0]["actividad"] == "Anterior"

def test_dia_no_lectivo_y_limite_horario(db, docente_user, datos, monkeypatch):
    actual, _, grupo, _, _ = datos
    calendario = CalendarioAcademico(periodo_id=actual.id, estado="PUBLICADO", creado_por_id=docente_user.id)
    db.add(calendario); db.flush()
    db.add(EventoCalendarioAcademico(calendario_id=calendario.id, titulo="Suspensión", tipo="SUSPENSION", fecha_inicio=datetime.date(2026,9,3), fecha_fin=datetime.date(2026,9,3), requiere_asistencia=False, permite_iniciar_clase=False, creado_por_id=docente_user.id))
    db.commit()
    respuesta = router.horario_publico_grupo(grupo.id, actual.id, db, docente_user)
    assert respuesta["calendario_hoy"]["motivo"] == "Suspensión"
    assert respuesta["resultados"][0]["actividad_actual"] is None
    assert respuesta["resultados"][0]["siguiente_actividad"]["fecha"] == "2026-09-04"
    monkeypatch.setattr(router, "_ahora_mx", lambda: datetime.datetime(2026,9,4,9,0,tzinfo=ZoneInfo("America/Mexico_City")))
    assert router.horario_publico_grupo(grupo.id, actual.id, db, docente_user)["resultados"][0]["actividad_actual"] is None

def test_rutas_http_y_permisos(client, db, docente_user, admin_user, datos):
    actual, _, grupo, _, _ = datos
    headers = auth_headers(get_token(client, docente_user.email, "DocentePass123"))
    urls = [f"/docencia/consulta-horarios/grupos?periodo_id={actual.id}", f"/docencia/consulta-horarios/grupos/{grupo.id}?periodo_id={actual.id}", f"/docencia/ubicacion-docentes?q=Docente&periodo_id={actual.id}"]
    for url in urls:
        assert client.get(url, headers=headers).status_code == 200
        assert client.get(url).status_code in (401,403)
    with pytest.raises(HTTPException) as error:
        router.grupos_consulta_horarios(actual.id, db, admin_user)
    assert error.value.status_code == 403


def test_busqueda_incluye_docentes_con_funcion_adicional(db, docente_user, datos):
    from models.usuario import Usuario, RolUsuario
    actual, _, grupo, _, _ = datos
    docente_user.nombre = "Gilberto García D. (demo)"
    multi = Usuario(nombre="MTI García Delgado Gilberto", email="multi@test.mx", password_hash="no-login", rol=RolUsuario.ADMINISTRATIVO, roles_adicionales='["DOCENTE"]', activo=True)
    solo_admin = Usuario(nombre="Gilberto Administrativo", email="admin-sin-docencia@test.mx", password_hash="no-login", rol=RolUsuario.ADMINISTRATIVO, activo=True)
    inactivo = Usuario(nombre="Gilberto Inactivo", email="inactivo@test.mx", password_hash="no-login", rol=RolUsuario.DOCENTE, activo=False)
    db.add_all([multi, solo_admin, inactivo]); db.flush()
    db.add(CargaDocente(docente_id=multi.id, periodo_id=actual.id, grupo_academico_id=grupo.id, tipo_actividad="CLASE", actividad_nombre="Materia de docente con dos funciones", dia_semana=3, hora_inicio="10:00", hora_fin="11:00", estado="ACTIVO", activo=True))
    db.commit()
    resultados = router.buscar_ubicacion_docentes("gilberto", actual.id, db, docente_user)["resultados"]
    assert {r["docente_id"] for r in resultados} == {docente_user.id, multi.id}
    real = next(r for r in resultados if r["docente_id"] == multi.id)
    assert real["actividad_actual"]["actividad"] == "Materia de docente con dos funciones"
    horario = router.horario_publico_grupo(grupo.id, actual.id, db, docente_user)["resultados"][0]
    assert any(a["docente"] == multi.nombre for a in horario["actividades_actuales"])
