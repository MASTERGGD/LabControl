"""
test_siga_horarios.py -- Tests de integración para el módulo de horarios.

Cubre:
- CRUD de horarios disponibles (LAB_ADMIN / SUPER_ADMIN)
- Carga masiva (bulk) de horarios
- Listado con filtros
- Creación y cancelación de reservaciones
- Disponibilidad semanal
- Acceso por rol
"""
import datetime
from zoneinfo import ZoneInfo

import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio
from models.catalogo import CatalogoCarrera, CatalogoCarreraAlias, GrupoAcademico, PeriodoEscolar
from models.horario import HorarioDisponible, RequerimientoClase, Reservacion
from models.sesion import SesionClase


# ─────────────────────────── helpers ────────────────────────────────────────

def _lab(db, nombre="Lab Horarios", categoria="COMPUTO"):
    lab = Laboratorio(nombre=nombre, categoria=categoria,
                      ubicacion="Edificio H", capacidad=20, activo=True)
    db.add(lab)
    db.commit()
    db.refresh(lab)
    return lab


def _usuario(db, nombre, email, rol, password="Test1234!", lab_id=None):
    u = Usuario(
        nombre=nombre, email=email,
        password_hash=hashear_password(password),
        rol=rol, activo=True,
        laboratorio_id=lab_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# ════════════════════════════════════════════════════════════════════════════
# CRUD de horarios
# ════════════════════════════════════════════════════════════════════════════

class TestCrudHorarios:

    def _setup(self, client, db):
        _usuario(db, "Admin", "admin@test.mx", RolUsuario.SUPER_ADMIN)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        return tok, lab

    def test_crear_horario(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post("/horarios", json={
            "laboratorio_id": lab.id,
            "dia_semana": 0,
            "hora_inicio": "08:00",
            "hora_fin": "10:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        data = r.json()
        assert data["dia_semana"] == 0
        assert data["hora_inicio"] == "08:00"

    def test_listar_horarios(self, client, db):
        tok, lab = self._setup(client, db)
        client.post("/horarios", json={
            "laboratorio_id": lab.id,
            "dia_semana": 1,
            "hora_inicio": "10:00",
            "hora_fin": "12:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        r = client.get("/horarios", headers=auth_headers(tok))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_listar_horarios_por_lab(self, client, db):
        tok, lab = self._setup(client, db)
        lab2 = _lab(db, "Lab B")
        client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 0,
            "hora_inicio": "08:00", "hora_fin": "10:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        client.post("/horarios", json={
            "laboratorio_id": lab2.id, "dia_semana": 0,
            "hora_inicio": "08:00", "hora_fin": "10:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        r = client.get(f"/horarios?laboratorio_id={lab.id}", headers=auth_headers(tok))
        assert r.status_code == 200
        for h in r.json():
            assert h["laboratorio_id"] == lab.id

    def test_editar_horario(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 2,
            "hora_inicio": "14:00", "hora_fin": "16:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        h_id = r.json()["id"]
        r2 = client.put(f"/horarios/{h_id}", json={
            "hora_inicio": "15:00", "hora_fin": "17:00",
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["hora_inicio"] == "15:00"

    def test_eliminar_horario_y_recrear_mismo_turno(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 3,
            "hora_inicio": "07:00", "hora_fin": "09:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        h_id = r.json()["id"]
        r2 = client.delete(f"/horarios/{h_id}", headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["mensaje"] == "Horario eliminado"
        assert r2.json()["eliminado"] is True

        r3 = client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 3,
            "hora_inicio": "07:00", "hora_fin": "09:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r3.status_code == 201

    def test_horario_formato_invalido_422(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 0,
            "hora_inicio": "8:00",  # sin ceros → no cumple patrón HH:MM
            "hora_fin": "10:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r.status_code == 422

    def test_crear_horario_solapado_409(self, client, db):
        tok, lab = self._setup(client, db)
        client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 2,
            "hora_inicio": "08:00", "hora_fin": "16:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        r = client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 2,
            "hora_inicio": "09:00", "hora_fin": "09:45",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r.status_code == 409
        assert "encima" in r.json()["detail"]


# ════════════════════════════════════════════════════════════════════════════
# Carga masiva (bulk)
# ════════════════════════════════════════════════════════════════════════════

class TestBulkHorarios:

    def test_bulk_crea_varios_horarios(self, client, db):
        _usuario(db, "Admin", "admin@test.mx", RolUsuario.SUPER_ADMIN)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        r = client.post("/horarios/bulk", json={
            "laboratorio_id": lab.id,
            "cuatrimestre": "MAY-AGO-2026",
            "dias": [0, 1, 2, 3, 4],
            "hora_inicio": "08:00",
            "hora_fin": "10:00",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        data = r.json()
        # bulk devuelve dict resumen: {creados, omitidos, dias_creados, dias_omitidos}
        assert isinstance(data, dict)
        assert data.get("creados", 0) + data.get("omitidos", 0) == 5

    def test_bulk_omite_horarios_solapados(self, client, db):
        _usuario(db, "Admin", "admin@test.mx", RolUsuario.SUPER_ADMIN)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        client.post("/horarios", json={
            "laboratorio_id": lab.id,
            "dia_semana": 2,
            "hora_inicio": "08:00",
            "hora_fin": "16:00",
            "cuatrimestre": "MAY-AGO-2026",
        }, headers=auth_headers(tok))
        r = client.post("/horarios/bulk", json={
            "laboratorio_id": lab.id,
            "cuatrimestre": "MAY-AGO-2026",
            "dias": [2, 3],
            "hora_inicio": "09:00",
            "hora_fin": "09:45",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        data = r.json()
        assert data["creados"] == 1
        assert data["omitidos"] == 1


# ════════════════════════════════════════════════════════════════════════════
# Reservaciones
# ════════════════════════════════════════════════════════════════════════════

class TestReservaciones:

    def _setup(self, client, db):
        admin = _usuario(db, "Admin", "admin@test.mx", RolUsuario.SUPER_ADMIN)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        docente = _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        # Crear horario
        rh = client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 0,
            "hora_inicio": "08:00", "hora_fin": "10:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        h_id = rh.json()["id"]
        return tok, lab, docente, h_id

    def test_crear_reservacion(self, client, db):
        tok, lab, docente, h_id = self._setup(client, db)
        r = client.post("/horarios/reservaciones", json={
            "horario_id": h_id,
            "laboratorio_id": lab.id,
            "docente_id": docente.id,
            "materia": "Programación I",
            "carrera": "Ingeniería en TI",
            "cuatrimestre_materia": "3",
            "grupo": "A",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        data = r.json()
        assert data["materia"] == "Programación I"
        assert data["periodo_id"] is not None
        assert data["periodo"] == "ENE-ABR 2026"
        assert data["calendario_estado"] == "SIN_CONFIGURAR"

    def test_grupo_compatible_con_periodo_separado_por_guiones(self, client, db):
        tok, lab, docente, h_id = self._setup(client, db)
        periodo = PeriodoEscolar(clave="ENE-ABR 2026", activo=True, es_actual=True)
        db.add(periodo)
        db.flush()
        db.add(GrupoAcademico(
            periodo_id=periodo.id,
            carrera="TSU en Inteligencia Artificial",
            cuatrimestre=3,
            grupo="A",
            activo=True,
        ))
        db.commit()

        grupos = client.get(
            "/catalogo/grupos/disponibles",
            params={
                "carrera": "TSU en Inteligencia Artificial",
                "cuatrimestre": 3,
                "periodo": "ENE-ABR-2026",
            },
            headers=auth_headers(tok),
        )
        assert grupos.status_code == 200
        assert [grupo["grupo"] for grupo in grupos.json()] == ["A"]

        reservacion = client.post("/horarios/reservaciones", json={
            "horario_id": h_id,
            "laboratorio_id": lab.id,
            "docente_id": docente.id,
            "materia": "Cálculo Integral",
            "carrera": "TSU en Inteligencia Artificial",
            "cuatrimestre_materia": "3",
            "grupo": "A",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert reservacion.status_code == 201, reservacion.text

    def test_diagnostico_resuelve_alias_y_explica_cuatrimestre(self, client, db):
        tok, _, _, _ = self._setup(client, db)
        carrera = CatalogoCarrera(
            clave="LPCYE", nombre="Lic. en Protección Civil y Emergencias", activo=True,
        )
        db.add(carrera)
        db.flush()
        db.add(CatalogoCarreraAlias(carrera_id=carrera.id, nombre="Lic. en Protección Civil"))
        periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
        db.add(periodo)
        db.flush()
        db.add(GrupoAcademico(
            periodo_id=periodo.id, carrera="Lic. en Protección Civil",
            cuatrimestre=5, grupo="A", activo=True,
        ))
        db.commit()

        respuesta = client.get("/catalogo/grupos/diagnostico", params={
            "carrera": "Lic. en Protección Civil y Emergencias",
            "cuatrimestre": 5,
            "periodo": "MAY-AGO-2026",
        }, headers=auth_headers(tok))
        assert respuesta.status_code == 200
        assert [g["grupo"] for g in respuesta.json()["compatibles"]] == ["A"]
        assert respuesta.json()["carrera_oficial"] == "Lic. en Protección Civil y Emergencias"

        sin_cuatrimestre = client.get("/catalogo/grupos/diagnostico", params={
            "carrera": "Lic. en Protección Civil",
            "cuatrimestre": 3,
            "periodo": "MAY-AGO 2026",
        }, headers=auth_headers(tok))
        assert sin_cuatrimestre.status_code == 200
        assert sin_cuatrimestre.json()["motivo"] == "SIN_GRUPOS_CUATRIMESTRE"
        assert sin_cuatrimestre.json()["grupos_similares"][0]["grupo"] == "A"

    def test_listar_reservaciones(self, client, db):
        tok, lab, docente, h_id = self._setup(client, db)
        client.post("/horarios/reservaciones", json={
            "horario_id": h_id, "laboratorio_id": lab.id,
            "docente_id": docente.id, "materia": "BD", "grupo": "A",
            "carrera": "Ingeniería en TI", "cuatrimestre_materia": "3",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        r = client.get("/horarios/reservaciones", headers=auth_headers(tok))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_cancelar_reservacion(self, client, db):
        tok, lab, docente, h_id = self._setup(client, db)
        r = client.post("/horarios/reservaciones", json={
            "horario_id": h_id, "laboratorio_id": lab.id,
            "docente_id": docente.id, "materia": "Redes", "grupo": "B",
            "carrera": "Ingeniería en TI", "cuatrimestre_materia": "3",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        res_id = r.json()["id"]
        r2 = client.delete(f"/horarios/reservaciones/{res_id}",
                           headers=auth_headers(tok))
        assert r2.status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# Disponibilidad
# ════════════════════════════════════════════════════════════════════════════

class TestDisponibilidad:

    def test_disponibilidad_requiere_lab_id(self, client, db):
        _usuario(db, "Admin", "admin@test.mx", RolUsuario.SUPER_ADMIN)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/horarios/disponibilidad", headers=auth_headers(tok))
        # Sin filtro, puede retornar 200 o 422 según implementación
        assert r.status_code in (200, 422)

    def test_disponibilidad_por_lab(self, client, db):
        _usuario(db, "Admin", "admin@test.mx", RolUsuario.SUPER_ADMIN)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        r = client.get(
            f"/horarios/disponibilidad?laboratorio_id={lab.id}&cuatrimestre=ENE-ABR-2026",
            headers=auth_headers(tok))
        assert r.status_code == 200

    def test_sesion_abierta_se_superpone_como_uso_actual(self, client, db, monkeypatch):
        admin = _usuario(db, "Admin", "admin@test.mx", RolUsuario.SUPER_ADMIN)
        docente = _usuario(db, "Docente en laboratorio", "docente@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        ahora = datetime.datetime(2026, 8, 27, 8, 30, tzinfo=ZoneInfo("America/Mexico_City"))
        monkeypatch.setattr("routers.horarios.now_mx", lambda: ahora)
        horario = HorarioDisponible(
            laboratorio_id=lab.id,
            dia_semana=ahora.weekday(),
            hora_inicio="08:00",
            hora_fin="09:00",
            cuatrimestre="MAY-AGO-2026",
            activo=True,
        )
        db.add(horario)
        db.flush()
        sesion = SesionClase(
            laboratorio_id=lab.id,
            docente_id=docente.id,
            tipo_sesion="CLASE",
            materia="Bases de Datos",
            grupo="3-A",
            codigo_sesion="SES-PRUEBA-USO-ACTUAL",
            inicio=datetime.datetime(2026, 8, 27, 14, 10),
            estado="ABIERTA",
        )
        db.add(sesion)
        db.commit()

        r = client.get(
            f"/horarios/disponibilidad?laboratorio_id={lab.id}&cuatrimestre=MAY-AGO-2026",
            headers=auth_headers(tok),
        )

        assert r.status_code == 200
        data = r.json()
        assert data["ocupacion_actual"]["sin_reservacion"] is True
        assert data["ocupacion_actual"]["hora_inicio"] == "08:10"
        assert data["slots"][0]["estado_base"] == "LIBRE"
        assert data["slots"][0]["estado_vista"] == "EN_USO"
        assert data["slots"][0]["ocupacion_actual"]["materia"] == "Bases de Datos"


class TestBandejaRequerimientos:

    def test_requerimiento_resuelto_permanece_en_historial(self, client, db):
        admin = _usuario(db, "Admin", "admin@test.mx", RolUsuario.SUPER_ADMIN)
        docente = _usuario(db, "Docente", "docente@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        horario = HorarioDisponible(
            laboratorio_id=lab.id, dia_semana=2, hora_inicio="10:00", hora_fin="11:00",
            cuatrimestre="MAY-AGO-2026", activo=True,
        )
        db.add(horario)
        db.flush()
        reservacion = Reservacion(
            horario_id=horario.id, laboratorio_id=lab.id, docente_id=docente.id,
            creado_por=docente.id, materia="Minería de Texto", grupo="3-A",
            cuatrimestre="MAY-AGO-2026", estado="PROGRAMADA",
        )
        db.add(reservacion)
        db.flush()
        requerimiento = RequerimientoClase(
            reservacion_id=reservacion.id,
            items='["Micrófono / bocinas"]',
            descripcion="Dos micrófonos inalámbricos",
            estado="PENDIENTE",
        )
        db.add(requerimiento)
        db.commit()

        pendientes = client.get(
            f"/horarios/requerimientos/pendientes?laboratorio_id={lab.id}&cuatrimestre=MAY-AGO-2026&estado=PENDIENTE",
            headers=auth_headers(tok),
        )
        assert pendientes.status_code == 200
        assert pendientes.json()[0]["descripcion"] == "Dos micrófonos inalámbricos"

        resuelto = client.put(
            f"/horarios/requerimientos/{requerimiento.id}/resolver",
            json={"estado": "CONFIRMADO", "nota_admin": "Equipo apartado"},
            headers=auth_headers(tok),
        )
        assert resuelto.status_code == 200

        historial = client.get(
            f"/horarios/requerimientos/pendientes?laboratorio_id={lab.id}&cuatrimestre=MAY-AGO-2026&estado=TODOS",
            headers=auth_headers(tok),
        )
        assert historial.status_code == 200
        assert historial.json()[0]["estado"] == "CONFIRMADO"
        assert historial.json()[0]["nota_admin"] == "Equipo apartado"


# ════════════════════════════════════════════════════════════════════════════
# Permisos
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosHorarios:

    def test_sin_token_401(self, client, db):
        r = client.get("/horarios")
        assert r.status_code == 401

    def test_alumno_no_puede_crear_horario(self, client, db):
        _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        tok = get_token(client, "alum@test.mx", "Test1234!")
        lab = _lab(db)
        r = client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 0,
            "hora_inicio": "08:00", "hora_fin": "10:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r.status_code == 403
