"""
test_siga_departamentos.py -- Tests de integración para el módulo de departamentos.

Cubre:
- CRUD de departamentos (SUPER_ADMIN)
- Asignación de responsable
- Listado de usuarios del departamento
- Activar permisos departamentales
- Validaciones de unicidad de nombre/clave
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


def _crear_depto(client, token, nombre="Depto Test", clave="DPT"):
    r = client.post("/departamentos", json={
        "nombre": nombre, "clave": clave,
    }, headers=auth_headers(token))
    return r


# ════════════════════════════════════════════════════════════════════════════
# CRUD básico
# ════════════════════════════════════════════════════════════════════════════

class TestCrudDepartamentos:

    def test_crear_departamento(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Sistemas", "SIS")
        assert r.status_code == 201
        data = r.json()
        assert data["nombre"] == "Sistemas"
        assert data["clave"] == "SIS"
        assert data["activo"] is True

    def test_listar_departamentos(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _crear_depto(client, tok, "Sistemas", "SIS")
        _crear_depto(client, tok, "Química", "QUI")
        r = client.get("/departamentos", headers=auth_headers(tok))
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_editar_departamento(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Original", "ORI")
        dep_id = r.json()["id"]
        r2 = client.put(f"/departamentos/{dep_id}", json={
            "nombre": "Editado", "clave": "EDI",
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["nombre"] == "Editado"

    def test_desactivar_departamento(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Para Borrar", "PBR")
        dep_id = r.json()["id"]
        r2 = client.delete(f"/departamentos/{dep_id}", headers=auth_headers(tok))
        assert r2.status_code == 200

    def test_nombre_duplicado_falla(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _crear_depto(client, tok, "Único", "UNI")
        r = _crear_depto(client, tok, "Único", "UNI2")
        assert r.status_code in (400, 409)

    def test_clave_duplicada_falla(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _crear_depto(client, tok, "Depto A", "CLA")
        r = _crear_depto(client, tok, "Depto B", "CLA")
        assert r.status_code in (400, 409)

    def test_depto_inexistente_404(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.put("/departamentos/9999", json={
            "nombre": "Inexistente", "clave": "INX",
        }, headers=auth_headers(tok))
        assert r.status_code == 404

    def test_sin_nombre_422(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.post("/departamentos", json={"clave": "X"}, headers=auth_headers(tok))
        assert r.status_code == 422


# ════════════════════════════════════════════════════════════════════════════
# Responsable
# ════════════════════════════════════════════════════════════════════════════

class TestResponsableDepartamento:

    def test_asignar_responsable(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Depto Resp", "DRS")
        dep_id = r.json()["id"]
        u = _usuario(db, "Responsable", "resp@test.mx", RolUsuario.ADMINISTRATIVO)
        r2 = client.patch(f"/departamentos/{dep_id}/responsable", json={
            "responsable_id": u.id,
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        data = r2.json()
        assert data.get("responsable_id") == u.id

    def test_quitar_responsable(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Depto Sin Resp", "DSR")
        dep_id = r.json()["id"]
        u = _usuario(db, "Resp", "resp2@test.mx", RolUsuario.ADMINISTRATIVO)
        # Asignar
        client.patch(f"/departamentos/{dep_id}/responsable", json={
            "responsable_id": u.id,
        }, headers=auth_headers(tok))
        # Quitar (responsable_id null)
        r2 = client.patch(f"/departamentos/{dep_id}/responsable", json={
            "responsable_id": None,
        }, headers=auth_headers(tok))
        assert r2.status_code == 200

    def test_listar_usuarios_departamento(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Depto Usuarios", "DUS")
        dep_id = r.json()["id"]
        r2 = client.get(f"/departamentos/{dep_id}/usuarios",
                        headers=auth_headers(tok))
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)


# ════════════════════════════════════════════════════════════════════════════
# Permisos
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosDepartamento:

    def test_activar_permiso_inventario(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Depto Inv", "DIN")
        dep_id = r.json()["id"]
        # El endpoint requiere un usuario que pertenezca al departamento
        u = _usuario(db, "Miembro", "miembro_inv@test.mx", RolUsuario.ADMINISTRATIVO)
        u.departamento_id = dep_id
        db.commit()
        r2 = client.patch(f"/departamentos/{dep_id}/permisos", json={
            "usuario_id": u.id,
            "permiso": "inventario:write",
            "activo": True,
        }, headers=auth_headers(tok))
        assert r2.status_code == 200

    def test_activar_permiso_validacion_inventario(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Depto Inv Val", "DIV")
        dep_id = r.json()["id"]
        u = _usuario(db, "Validador", "validador_inv@test.mx", RolUsuario.ADMINISTRATIVO)
        u.departamento_id = dep_id
        db.commit()
        r2 = client.patch(f"/departamentos/{dep_id}/permisos", json={
            "usuario_id": u.id,
            "permiso": "inventario:validar",
            "activo": True,
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        body = r2.json()
        assert body["puede_validar_inventario"] is True
        assert body["permisos_departamento"]["inventario:validar"] is True

    def test_activar_permiso_comunicados(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_depto(client, tok, "Depto Com", "DCM")
        dep_id = r.json()["id"]
        u = _usuario(db, "MiembroCom", "miembro_com@test.mx", RolUsuario.ADMINISTRATIVO)
        u.departamento_id = dep_id
        db.commit()
        # permisos/comunicados hardcodea el permiso a "comunicados:write"
        r2 = client.patch(f"/departamentos/{dep_id}/permisos/comunicados", json={
            "usuario_id": u.id,
            "permiso": "comunicados:write",
            "activo": True,
        }, headers=auth_headers(tok))
        assert r2.status_code == 200

    def test_buscar_usuario_para_responsable(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _usuario(db, "Buscado", "buscar@test.mx", RolUsuario.ADMINISTRATIVO)
        r = client.get("/departamentos/usuarios/buscar?q=buscar",
                       headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ════════════════════════════════════════════════════════════════════════════
# Permisos de acceso
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosAccesoDepartamentos:

    def test_docente_no_puede_crear(self, client, db):
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@test.mx", "Test1234!")
        r = client.post("/departamentos", json={
            "nombre": "X", "clave": "X",
        }, headers=auth_headers(tok))
        assert r.status_code == 403

    def test_sin_token_401(self, client, db):
        r = client.get("/departamentos")
        assert r.status_code == 401
