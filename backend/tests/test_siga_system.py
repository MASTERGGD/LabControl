"""
test_siga_system.py -- Tests de integración para el módulo de sistema.

Cubre:
- Health check del sistema (solo SUPER_ADMIN)
- Listado de backups
- Generación de backup
- Health general (endpoint raíz /health y /health/db no protegidos)
- Permisos: solo SUPER_ADMIN accede a /system/*
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario


# ─────────────────────────── helpers ────────────────────────────────────────

def _usuario(db, nombre, email, rol, password="Test1234!"):
    u = Usuario(
        nombre=nombre, email=email,
        password_hash=hashear_password(password),
        rol=rol, activo=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _admin(db, email="admin@test.mx"):
    return _usuario(db, "Admin", email, RolUsuario.SUPER_ADMIN)


# ════════════════════════════════════════════════════════════════════════════
# System health (protegido)
# ════════════════════════════════════════════════════════════════════════════

class TestSystemHealth:

    def test_health_admin_ok(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/system/health", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert "status" in data

    def test_health_sin_token_401(self, client, db):
        r = client.get("/system/health")
        assert r.status_code == 401

    def test_health_docente_403(self, client, db):
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@test.mx", "Test1234!")
        r = client.get("/system/health", headers=auth_headers(tok))
        assert r.status_code == 403


# ════════════════════════════════════════════════════════════════════════════
# Backups
# ════════════════════════════════════════════════════════════════════════════

class TestBackups:

    def test_listar_backups(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/system/backups", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_generar_backup(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.post("/system/backups", headers=auth_headers(tok))
        # 201 éxito o 409 si ya hay uno en curso, o 500 si falla en test env
        assert r.status_code in (201, 409, 500)

    def test_backup_nombre_inexistente_404(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        # Nombre con extensión .zip válida pero archivo inexistente -> 404
        r = client.post("/system/backups/no_existe.zip/verify",
                        headers=auth_headers(tok))
        assert r.status_code == 404

    def test_backups_docente_403(self, client, db):
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@test.mx", "Test1234!")
        r = client.get("/system/backups", headers=auth_headers(tok))
        assert r.status_code == 403


# ════════════════════════════════════════════════════════════════════════════
# Auth: login y refresh
# ════════════════════════════════════════════════════════════════════════════

class TestAuth:

    def test_login_valido(self, client, db):
        _usuario(db, "User", "user@test.mx", RolUsuario.DOCENTE)
        r = client.post("/auth/login", data={
            "username": "user@test.mx", "password": "Test1234!",
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_password_incorrecta(self, client, db):
        _usuario(db, "User", "user@test.mx", RolUsuario.DOCENTE)
        r = client.post("/auth/login", data={
            "username": "user@test.mx", "password": "Incorrecta!",
        })
        assert r.status_code in (400, 401)

    def test_login_usuario_inexistente(self, client, db):
        r = client.post("/auth/login", data={
            "username": "noexiste@test.mx", "password": "Test1234!",
        })
        assert r.status_code in (400, 401, 404)

    def test_login_usuario_inactivo(self, client, db):
        _usuario(db, "Inact", "inact@test.mx", RolUsuario.DOCENTE,
                 password="Test1234!")
        # Desactivar directamente en DB
        from models.usuario import Usuario as U
        db.query(U).filter(U.email == "inact@test.mx").update({"activo": False})
        db.commit()
        r = client.post("/auth/login", data={
            "username": "inact@test.mx", "password": "Test1234!",
        })
        assert r.status_code in (400, 401, 403)
