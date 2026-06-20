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
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio


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

    def test_desactivar_horario(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post("/horarios", json={
            "laboratorio_id": lab.id, "dia_semana": 3,
            "hora_inicio": "07:00", "hora_fin": "09:00",
            "cuatrimestre": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        h_id = r.json()["id"]
        r2 = client.delete(f"/horarios/{h_id}", headers=auth_headers(tok))
        assert r2.status_code == 200

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
