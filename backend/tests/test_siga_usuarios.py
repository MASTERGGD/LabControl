"""
test_siga_usuarios.py -- Tests de integración para el módulo de usuarios.

Cubre:
- CRUD de usuarios (SUPER_ADMIN)
- Perfil propio (/usuarios/me)
- Cambio de contraseña
- Activar/desactivar usuario
- Filtros de listado (rol, laboratorio, activo)
- Validaciones de unicidad de email
- Permisos por rol
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio


# ─────────────────────────── helpers ────────────────────────────────────────

def _lab(db, nombre="Lab Test"):
    lab = Laboratorio(nombre=nombre, ubicacion="X", capacidad=10, activo=True)
    db.add(lab)
    db.commit()
    db.refresh(lab)
    return lab


def _usuario(db, nombre, email, rol, password="Test1234!", lab_id=None, activo=True):
    u = Usuario(
        nombre=nombre, email=email,
        password_hash=hashear_password(password),
        rol=rol, activo=activo,
        laboratorio_id=lab_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _admin(db, email="admin@test.mx"):
    return _usuario(db, "Admin", email, RolUsuario.SUPER_ADMIN)


# ════════════════════════════════════════════════════════════════════════════
# Perfil propio
# ════════════════════════════════════════════════════════════════════════════

class TestPerfilPropio:

    def test_me_devuelve_datos(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/usuarios/me", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "admin@test.mx"
        assert data["rol"] == "SUPER_ADMIN"

    def test_me_sin_token_401(self, client, db):
        r = client.get("/usuarios/me")
        assert r.status_code == 401


# ════════════════════════════════════════════════════════════════════════════
# CRUD de usuarios — SUPER_ADMIN
# ════════════════════════════════════════════════════════════════════════════

class TestCrudUsuarios:

    def test_crear_usuario_docente(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.post("/usuarios", json={
            "nombre": "Juan Docente",
            "email": "juan@utecan.mx",
            "password": "Pass1234!",
            "rol": "DOCENTE",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        data = r.json()
        assert data["email"] == "juan@utecan.mx"
        assert data["rol"] == "DOCENTE"

    def test_crear_usuario_lab_admin_con_lab(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        lab = _lab(db)
        r = client.post("/usuarios", json={
            "nombre": "Laura Admin",
            "email": "laura@utecan.mx",
            "password": "Pass1234!",
            "rol": "LAB_ADMIN",
            "laboratorio_id": lab.id,
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        assert r.json()["laboratorio_id"] == lab.id

    def test_crear_usuario_email_duplicado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        client.post("/usuarios", json={
            "nombre": "U1", "email": "dup@test.mx",
            "password": "Pass1234!", "rol": "DOCENTE",
        }, headers=auth_headers(tok))
        r = client.post("/usuarios", json={
            "nombre": "U2", "email": "dup@test.mx",
            "password": "Pass1234!", "rol": "ALUMNO",
        }, headers=auth_headers(tok))
        assert r.status_code in (400, 409)

    def test_listar_usuarios(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _usuario(db, "U1", "u1@test.mx", RolUsuario.DOCENTE)
        _usuario(db, "U2", "u2@test.mx", RolUsuario.ALUMNO)
        r = client.get("/usuarios", headers=auth_headers(tok))
        assert r.status_code == 200
        # Debe haber al menos admin + 2 creados
        assert len(r.json()) >= 3

    def test_filtrar_por_rol(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _usuario(db, "D1", "d1@test.mx", RolUsuario.DOCENTE)
        _usuario(db, "A1", "a1@test.mx", RolUsuario.ALUMNO)
        r = client.get("/usuarios?rol=DOCENTE", headers=auth_headers(tok))
        assert r.status_code == 200
        for u in r.json():
            assert u["rol"] == "DOCENTE"

    def test_editar_usuario(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        u = _usuario(db, "Original", "orig@test.mx", RolUsuario.DOCENTE)
        r = client.put(f"/usuarios/{u.id}", json={
            "nombre": "Modificado",
            "email": "orig@test.mx",
            "rol": "DOCENTE",
        }, headers=auth_headers(tok))
        assert r.status_code == 200
        assert r.json()["nombre"] == "Modificado"

    def test_desactivar_usuario(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        u = _usuario(db, "Baja", "baja@test.mx", RolUsuario.DOCENTE)
        r = client.delete(f"/usuarios/{u.id}", headers=auth_headers(tok))
        assert r.status_code == 200
        # Verificar inactivo en listado
        r2 = client.get("/usuarios?activo=false", headers=auth_headers(tok))
        ids = [x["id"] for x in r2.json()]
        assert u.id in ids

    def test_usuario_inexistente_404(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.put("/usuarios/9999", json={
            "nombre": "Inexistente", "email": "inexistente@x.mx", "rol": "DOCENTE",
        }, headers=auth_headers(tok))
        assert r.status_code == 404

    def test_crear_usuario_password_invalida(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.post("/usuarios", json={
            "nombre": "U", "email": "u@test.mx",
            "password": "123",  # muy corta
            "rol": "DOCENTE",
        }, headers=auth_headers(tok))
        assert r.status_code == 422


# ════════════════════════════════════════════════════════════════════════════
# Cambio de contraseña
# ════════════════════════════════════════════════════════════════════════════

class TestCambioPassword:

    def test_cambio_password_propio(self, client, db):
        _usuario(db, "User", "user@test.mx", RolUsuario.DOCENTE, password="OldPass1!")
        tok = get_token(client, "user@test.mx", "OldPass1!")
        r = client.put("/usuarios/me/password", json={
            "password_actual": "OldPass1!",
            "password_nuevo": "NewPass2!",
        }, headers=auth_headers(tok))
        assert r.status_code == 200
        # Login con nueva contraseña
        r2 = client.post("/auth/login", data={
            "username": "user@test.mx", "password": "NewPass2!",
        })
        assert r2.status_code == 200

    def test_cambio_password_actual_incorrecta(self, client, db):
        _usuario(db, "User", "user@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "user@test.mx", "Test1234!")
        r = client.put("/usuarios/me/password", json={
            "password_actual": "Incorrecta!",
            "password_nuevo": "NewPass2!",
        }, headers=auth_headers(tok))
        assert r.status_code in (400, 401, 422)

    def test_reset_password_por_admin(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        u = _usuario(db, "User", "user@test.mx", RolUsuario.DOCENTE)
        # reset-password no requiere body - genera contraseña aleatoria
        r = client.post(f"/usuarios/{u.id}/reset-password",
                        headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        assert "password_temporal" in data


# ════════════════════════════════════════════════════════════════════════════
# Permisos por rol
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosUsuarios:

    def test_docente_no_puede_crear_usuario(self, client, db):
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@test.mx", "Test1234!")
        r = client.post("/usuarios", json={
            "nombre": "X", "email": "x@test.mx",
            "password": "Pass1234!", "rol": "ALUMNO",
        }, headers=auth_headers(tok))
        assert r.status_code == 403

    def test_alumno_no_puede_listar_usuarios(self, client, db):
        _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        tok = get_token(client, "alum@test.mx", "Test1234!")
        r = client.get("/usuarios", headers=auth_headers(tok))
        assert r.status_code == 403