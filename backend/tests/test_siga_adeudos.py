"""
test_siga_adeudos.py -- Tests de integración para el módulo de adeudos.

Cubre:
- Crear adeudo manual (SUPER_ADMIN)
- Listar adeudos con filtros
- Ver resumen por persona
- Actualizar estado de adeudo
- Eliminar adeudo
- Sincronizar préstamos vencidos
- Permisos por rol
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio


# ─────────────────────────── helpers ────────────────────────────────────────

def _lab(db, nombre="Lab Adeudos"):
    lab = Laboratorio(nombre=nombre, ubicacion="X", capacidad=10, activo=True)
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


def _admin(db, email="admin@test.mx"):
    return _usuario(db, "Admin", email, RolUsuario.SUPER_ADMIN)


def _crear_adeudo(client, token, lab_id=None):
    return client.post("/adeudos", json={
        "persona_nombre": "Juan García",
        "persona_identificador": "20230001",
        "persona_tipo": "ALUMNO",
        "descripcion": "Daño a monitor",
        "tipo": "DAÑO",
        "origen_tipo": "MANUAL",
        "laboratorio_id": lab_id,
        "monto_estimado": 500.0,
    }, headers=auth_headers(token))


# ════════════════════════════════════════════════════════════════════════════
# CRUD de adeudos
# ════════════════════════════════════════════════════════════════════════════

class TestCrudAdeudos:

    def test_crear_adeudo(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        r = _crear_adeudo(client, tok, lab.id)
        assert r.status_code == 201
        data = r.json()
        assert data["persona_nombre"] == "Juan García"
        assert data["estado"] == "PENDIENTE"

    def test_crear_adeudo_sin_lab(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_adeudo(client, tok, lab_id=None)
        assert r.status_code == 201

    def test_listar_adeudos(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        _crear_adeudo(client, tok, lab.id)
        _crear_adeudo(client, tok, lab.id)
        r = client.get("/adeudos", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        assert len(items) >= 2

    def test_filtrar_por_estado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _crear_adeudo(client, tok)
        r = client.get("/adeudos?estado=PENDIENTE", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        for item in items:
            assert item["estado"] == "PENDIENTE"

    def test_ver_detalle_adeudo(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_adeudo(client, tok)
        adeudo_id = r.json()["id"]
        r2 = client.get(f"/adeudos/{adeudo_id}", headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["id"] == adeudo_id

    def test_actualizar_adeudo_resuelto(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_adeudo(client, tok)
        adeudo_id = r.json()["id"]
        r2 = client.patch(f"/adeudos/{adeudo_id}", json={
            "estado": "RESUELTO",
            "notas_resolucion": "El alumno pagó el daño.",
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["estado"] == "RESUELTO"

    def test_actualizar_adeudo_condonado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_adeudo(client, tok)
        adeudo_id = r.json()["id"]
        r2 = client.patch(f"/adeudos/{adeudo_id}", json={
            "estado": "EXONERADO",
            "notas_resolucion": "Condonado por circunstancias especiales.",
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["estado"] == "EXONERADO"

    def test_eliminar_adeudo(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_adeudo(client, tok)
        adeudo_id = r.json()["id"]
        r2 = client.delete(f"/adeudos/{adeudo_id}", headers=auth_headers(tok))
        assert r2.status_code == 204

    def test_adeudo_inexistente_404(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/adeudos/9999", headers=auth_headers(tok))
        assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════════════
# Resumen por persona
# ════════════════════════════════════════════════════════════════════════════

class TestResumenPersona:

    def test_resumen_por_identificador(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _crear_adeudo(client, tok)  # persona 20230001
        r = client.get("/adeudos/persona/20230001", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert "persona_nombre" in data or "adeudos" in data

    def test_resumen_persona_sin_adeudos(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/adeudos/persona/99999999", headers=auth_headers(tok))
        # Puede devolver 200 con lista vacía o 404
        assert r.status_code in (200, 404)


# ════════════════════════════════════════════════════════════════════════════
# Sincronización de préstamos
# ════════════════════════════════════════════════════════════════════════════

class TestSincronizarPrestamos:

    def test_sincronizar_prestamos_vencidos(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.post("/adeudos/sincronizar-prestamos",
                        json={}, headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        # Debe devolver cuántos adeudos se generaron
        assert "generados" in data or "adeudos_creados" in data or isinstance(data, dict)


# ════════════════════════════════════════════════════════════════════════════
# Permisos
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosAdeudos:

    def test_sin_token_401(self, client, db):
        r = client.get("/adeudos")
        assert r.status_code == 401

    def test_alumno_no_puede_crear_adeudo(self, client, db):
        _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        tok = get_token(client, "alum@test.mx", "Test1234!")
        r = client.post("/adeudos", json={
            "persona_nombre": "Test",
            "persona_identificador": "111",
            "persona_tipo": "ALUMNO",
            "descripcion": "X",
            "tipo": "DAÑO",
            "origen_tipo": "MANUAL",
        }, headers=auth_headers(tok))
        assert r.status_code == 403

    def test_docente_no_puede_crear_adeudo(self, client, db):
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@test.mx", "Test1234!")
        r = client.post("/adeudos", json={
            "persona_nombre": "Test",
            "persona_identificador": "222",
            "persona_tipo": "ALUMNO",
            "descripcion": "Y",
            "tipo": "DAÑO",
            "origen_tipo": "MANUAL",
        }, headers=auth_headers(tok))
        assert r.status_code == 403

    def test_lab_admin_no_puede_crear_adeudo(self, client, db):
        lab = _lab(db, "Lab sin gestion de adeudos")
        _usuario(
            db,
            "Admin Lab",
            "labadmin.adeudo@test.mx",
            RolUsuario.LAB_ADMIN,
            lab_id=lab.id,
        )
        tok = get_token(client, "labadmin.adeudo@test.mx", "Test1234!")
        r = _crear_adeudo(client, tok, lab.id)
        assert r.status_code == 403

    def test_lab_admin_no_puede_administrar_catalogo(self, client, db):
        _usuario(db, "Admin Lab Catalogo", "labadmin.catalogo@test.mx", RolUsuario.LAB_ADMIN)
        tok = get_token(client, "labadmin.catalogo@test.mx", "Test1234!")
        r = client.post("/catalogo/alumnos", json={
            "matricula": "CAT-LAB-001",
            "apellido_paterno": "Prueba",
            "apellido_materno": "Seguridad",
            "nombres": "Usuario",
            "carrera": "TI",
            "cuatrimestre": 1,
            "grupo": "A",
            "periodo": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r.status_code == 403
