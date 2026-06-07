"""
test_siga_laboratorios.py -- Tests de integración para el módulo de laboratorios.

Cubre:
- CRUD de laboratorios (SUPER_ADMIN)
- Listado con filtros (solo_activos, tipo)
- Acceso por rol (LAB_ADMIN sólo ve su lab, DOCENTE sólo lectura)
- Computadoras: alta, edición, baja
- Alta masiva de computadoras (bulk)
- Validaciones de unicidad y campos requeridos
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio


# ─────────────────────────── helpers ────────────────────────────────────────

def _lab(db, nombre="Lab A", categoria="COMPUTO", activo=True):
    lab = Laboratorio(nombre=nombre, categoria=categoria,
                      ubicacion="Edificio X", capacidad=20, activo=activo)
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


def _admin_token(client, db):
    _usuario(db, "Admin", "admin@lab.mx", RolUsuario.SUPER_ADMIN)
    return get_token(client, "admin@lab.mx", "Test1234!")


# ════════════════════════════════════════════════════════════════════════════
# CRUD básico — SUPER_ADMIN
# ════════════════════════════════════════════════════════════════════════════

class TestCrudLaboratorio:

    def test_crear_lab_computo(self, client, db):
        token = _admin_token(client, db)
        r = client.post("/laboratorios", json={
            "nombre": "Lab Cómputo 1", "categoria": "COMPUTO",
            "ubicacion": "Edificio A", "capacidad": 30,
        }, headers=auth_headers(token))
        assert r.status_code == 201
        data = r.json()
        assert data["nombre"] == "Lab Cómputo 1"
        assert data["activo"] is True

    def test_crear_lab_quimica(self, client, db):
        token = _admin_token(client, db)
        r = client.post("/laboratorios", json={
            "nombre": "Lab Química", "categoria": "QUIMICA",
            "ubicacion": "Edificio B", "capacidad": 15,
        }, headers=auth_headers(token))
        assert r.status_code == 201
        assert r.json()["categoria"] == "QUIMICA"

    def test_listar_labs(self, client, db):
        token = _admin_token(client, db)
        _lab(db, "Lab 1")
        _lab(db, "Lab 2")
        r = client.get("/laboratorios", headers=auth_headers(token))
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_listar_solo_activos(self, client, db):
        token = _admin_token(client, db)
        _lab(db, "Activo", activo=True)
        _lab(db, "Inactivo", activo=False)
        r = client.get("/laboratorios?solo_activos=true", headers=auth_headers(token))
        nombres = [x["nombre"] for x in r.json()]
        assert "Activo" in nombres
        assert "Inactivo" not in nombres

    def test_editar_lab(self, client, db):
        token = _admin_token(client, db)
        lab = _lab(db, "Original")
        r = client.put(f"/laboratorios/{lab.id}", json={
            "nombre": "Editado", "ubicacion": "Nuevo edificio", "capacidad": 25,
        }, headers=auth_headers(token))
        assert r.status_code == 200
        assert r.json()["nombre"] == "Editado"

    def test_desactivar_lab(self, client, db):
        token = _admin_token(client, db)
        lab = _lab(db)
        r = client.delete(f"/laboratorios/{lab.id}", headers=auth_headers(token))
        assert r.status_code == 200
        r2 = client.get("/laboratorios?solo_activos=true", headers=auth_headers(token))
        ids = [x["id"] for x in r2.json()]
        assert lab.id not in ids

    def test_crear_lab_nombre_duplicado(self, client, db):
        token = _admin_token(client, db)
        _lab(db, "Lab Único")
        r = client.post("/laboratorios", json={
            "nombre": "Lab Único", "categoria": "COMPUTO",
            "ubicacion": "X", "capacidad": 10,
        }, headers=auth_headers(token))
        assert r.status_code in (400, 409, 422)

    def test_crear_lab_sin_nombre_falla(self, client, db):
        token = _admin_token(client, db)
        r = client.post("/laboratorios", json={
            "categoria": "COMPUTO", "ubicacion": "X", "capacidad": 10,
        }, headers=auth_headers(token))
        assert r.status_code == 422

    def test_lab_inexistente_404(self, client, db):
        token = _admin_token(client, db)
        r = client.put("/laboratorios/9999", json={
            "nombre": "Inexistente", "ubicacion": "Edificio X", "capacidad": 1,
        }, headers=auth_headers(token))
        assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════════════
# Acceso por rol
# ════════════════════════════════════════════════════════════════════════════

class TestAccesoRoles:

    def test_lab_admin_solo_ve_su_lab(self, client, db):
        _usuario(db, "Admin SA", "admin@lab.mx", RolUsuario.SUPER_ADMIN)
        admin_tok = get_token(client, "admin@lab.mx", "Test1234!")

        lab1 = _lab(db, "Lab Admin Own")
        _lab(db, "Lab Otro")

        _usuario(db, "LA", "la@lab.mx", RolUsuario.LAB_ADMIN, lab_id=lab1.id)
        la_tok = get_token(client, "la@lab.mx", "Test1234!")

        r = client.get("/laboratorios", headers=auth_headers(la_tok))
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["id"] == lab1.id

    def test_docente_puede_listar(self, client, db):
        _usuario(db, "Admin SA", "admin@lab.mx", RolUsuario.SUPER_ADMIN)
        _lab(db, "Lab Visible")
        _usuario(db, "Doc", "doc@lab.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@lab.mx", "Test1234!")
        r = client.get("/laboratorios", headers=auth_headers(tok))
        assert r.status_code == 200

    def test_docente_no_puede_crear(self, client, db):
        _usuario(db, "Doc", "doc@lab.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@lab.mx", "Test1234!")
        r = client.post("/laboratorios", json={
            "nombre": "Nuevo", "categoria": "COMPUTO",
            "ubicacion": "X", "capacidad": 10,
        }, headers=auth_headers(tok))
        assert r.status_code == 403

    def test_sin_token_requiere_auth(self, client, db):
        r = client.get("/laboratorios")
        assert r.status_code == 401


# ════════════════════════════════════════════════════════════════════════════
# Computadoras
# ComputadoraCreate: numero (int), codigo (str requerido), fila?, specs?, estado?
# BulkComputadorasCreate: cantidad, prefijo_codigo
# ════════════════════════════════════════════════════════════════════════════

class TestComputadoras:

    def _setup(self, client, db):
        _usuario(db, "Admin SA", "admin@lab.mx", RolUsuario.SUPER_ADMIN)
        tok = get_token(client, "admin@lab.mx", "Test1234!")
        lab = _lab(db, "Lab Cómputo", "COMPUTO")
        return tok, lab

    def test_crear_computadora(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1,
            "codigo": "PC-01",
            "estado": "OPERATIVO",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        assert r.json()["numero"] == 1
        assert r.json()["codigo"] == "PC-01"

    def test_listar_computadoras(self, client, db):
        tok, lab = self._setup(client, db)
        client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1, "codigo": "PC-01",
        }, headers=auth_headers(tok))
        r = client.get(f"/laboratorios/{lab.id}/computadoras",
                       headers=auth_headers(tok))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_alta_masiva_computadoras(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post(f"/laboratorios/{lab.id}/computadoras/bulk", json={
            "cantidad": 5,
            "prefijo_codigo": "PC",
        }, headers=auth_headers(tok))
        assert r.status_code == 201
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 5

    def test_editar_computadora(self, client, db):
        tok, lab = self._setup(client, db)
        r = client.post(f"/laboratorios/{lab.id}/computadoras", json={
            "numero": 1, "codigo": "PC-01",
        }, headers=auth_headers(tok))
        comp_id = r.json()["id"]
        r2 = client.put(f"/laboratorios/{lab.id}/computadoras/{comp_id}", json={
            "numero": 1, "codigo": "PC-01-ED", "estado": "MANTENIMIENTO",
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["estado"] == "MANTENIMIENTO"
