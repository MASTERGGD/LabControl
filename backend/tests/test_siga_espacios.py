"""
test_siga_espacios.py -- Tests de integración para el módulo de espacios institucionales.

Cubre:
- CRUD de espacios institucionales (SUPER_ADMIN)
- Asignación de responsables
- Solicitudes de espacio: crear, listar, aprobar, rechazar, cancelar
- Mis solicitudes y bandeja
- Acceso por rol
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.departamento import Departamento
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


def _departamento(db, nombre="Coordinacion Academica", clave="COOR-ACA"):
    departamento = Departamento(nombre=nombre, clave=clave, activo=True)
    db.add(departamento)
    db.commit()
    db.refresh(departamento)
    return departamento


def _crear_espacio(client, token, nombre="Sala Central"):
    """Tipo válido: AUDIOVISUAL | RECTORIA | OTRO"""
    r = client.post("/espacios/institucionales", json={
        "nombre": nombre,
        "tipo": "OTRO",
        "ubicacion": "Edificio Central",
        "capacidad": 100,
    }, headers=auth_headers(token))
    return r


# ════════════════════════════════════════════════════════════════════════════
# CRUD de espacios
# ════════════════════════════════════════════════════════════════════════════

class TestCrudEspacios:

    def test_crear_espacio(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_espacio(client, tok, "Sala A")
        assert r.status_code == 201
        data = r.json()
        assert data["nombre"] == "Sala A"
        assert data["activo"] is True

    def test_listar_espacios(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _crear_espacio(client, tok, "Sala 1")
        _crear_espacio(client, tok, "Sala 2")
        r = client.get("/espacios/institucionales", headers=auth_headers(tok))
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_editar_espacio(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_espacio(client, tok, "Original")
        esp_id = r.json()["id"]
        r2 = client.put(f"/espacios/institucionales/{esp_id}", json={
            "nombre": "Editado", "tipo": "AUDIOVISUAL",
            "ubicacion": "Bloque C", "capacidad": 50,
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["nombre"] == "Editado"

    def test_desactivar_espacio(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_espacio(client, tok, "Para Desactivar")
        esp_id = r.json()["id"]
        r2 = client.delete(f"/espacios/institucionales/{esp_id}",
                           headers=auth_headers(tok))
        assert r2.status_code == 200

    def test_espacio_inexistente_404(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.put("/espacios/institucionales/9999", json={
            "nombre": "Inexistente", "tipo": "OTRO",
        }, headers=auth_headers(tok))
        assert r.status_code == 404

    def test_crear_espacio_sin_nombre_422(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.post("/espacios/institucionales", json={
            "tipo": "OTRO", "ubicacion": "X",
        }, headers=auth_headers(tok))
        assert r.status_code == 422

    def test_tipo_invalido_422(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.post("/espacios/institucionales", json={
            "nombre": "Sala X", "tipo": "AULA",  # tipo inválido
        }, headers=auth_headers(tok))
        assert r.status_code == 422


# ════════════════════════════════════════════════════════════════════════════
# Responsables
# ════════════════════════════════════════════════════════════════════════════

class TestResponsables:

    def _setup(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_espacio(client, tok, "Sala Responsable")
        esp_id = r.json()["id"]
        return tok, esp_id

    def test_asignar_responsable(self, client, db):
        tok, esp_id = self._setup(client, db)
        resp = _usuario(db, "Resp", "resp@test.mx", RolUsuario.ADMINISTRATIVO)
        r = client.post(f"/espacios/institucionales/{esp_id}/responsables", json={
            "usuario_id": resp.id,
        }, headers=auth_headers(tok))
        assert r.status_code == 201

    def test_listar_responsables(self, client, db):
        tok, esp_id = self._setup(client, db)
        resp = _usuario(db, "Resp2", "resp2@test.mx", RolUsuario.ADMINISTRATIVO)
        client.post(f"/espacios/institucionales/{esp_id}/responsables", json={
            "usuario_id": resp.id,
        }, headers=auth_headers(tok))
        r = client.get(f"/espacios/institucionales/{esp_id}/responsables",
                       headers=auth_headers(tok))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_quitar_responsable(self, client, db):
        tok, esp_id = self._setup(client, db)
        resp = _usuario(db, "Resp3", "resp3@test.mx", RolUsuario.ADMINISTRATIVO)
        r = client.post(f"/espacios/institucionales/{esp_id}/responsables", json={
            "usuario_id": resp.id,
        }, headers=auth_headers(tok))
        resp_rel_id = r.json()["id"]
        r2 = client.delete(
            f"/espacios/institucionales/{esp_id}/responsables/{resp_rel_id}",
            headers=auth_headers(tok))
        assert r2.status_code == 200

    def test_responsable_duplicado_409(self, client, db):
        tok, esp_id = self._setup(client, db)
        resp = _usuario(db, "Dup", "dup@test.mx", RolUsuario.ADMINISTRATIVO)
        client.post(f"/espacios/institucionales/{esp_id}/responsables", json={
            "usuario_id": resp.id,
        }, headers=auth_headers(tok))
        r = client.post(f"/espacios/institucionales/{esp_id}/responsables", json={
            "usuario_id": resp.id,
        }, headers=auth_headers(tok))
        assert r.status_code == 409


# ════════════════════════════════════════════════════════════════════════════
# Solicitudes de espacio
# ════════════════════════════════════════════════════════════════════════════

class TestSolicitudesEspacio:

    def _setup(self, client, db):
        _admin(db)
        tok_admin = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_espacio(client, tok_admin, "Sala Solicitudes")
        esp_id = r.json()["id"]
        # Asignar responsable (requerido para algunas operaciones)
        resp = _usuario(db, "Resp", "resp@test.mx", RolUsuario.ADMINISTRATIVO)
        client.post(f"/espacios/institucionales/{esp_id}/responsables", json={
            "usuario_id": resp.id,
        }, headers=auth_headers(tok_admin))
        # Solicitante
        departamento_doc = _departamento(db, "Departamento Docente", "DEP-DOC")
        doc = _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        doc.departamento_id = departamento_doc.id
        db.commit()
        tok_doc = get_token(client, "doc@test.mx", "Test1234!")
        return tok_admin, tok_doc, esp_id

    def _crear_solicitud(self, client, tok, esp_id, fecha="2026-08-01",
                         h_ini="09:00", h_fin="11:00", **extra):
        payload = {
            "espacio_id": esp_id,
            "fecha": fecha,
            "hora_inicio": h_ini,
            "hora_fin": h_fin,
            "motivo": "Reunión de academia departamental",
            "numero_asistentes": 20,
        }
        payload.update(extra)
        return client.post(
            "/espacios/solicitudes",
            json=payload,
            headers=auth_headers(tok),
        )

    def test_crear_solicitud(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        r = self._crear_solicitud(client, tok_doc, esp_id)
        assert r.status_code == 201
        data = r.json()
        assert data["espacio_id"] == esp_id
        assert data["estado"] == "PENDIENTE"
        assert data["departamento_nombre"] == "Departamento Docente"

    def test_listar_departamentos_disponibles(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        activo = _departamento(db)
        inactivo = _departamento(db, "Departamento Inactivo", "DEP-INACT")
        inactivo.activo = False
        db.commit()

        r = client.get(
            f"/espacios/departamentos-disponibles?espacio_id={esp_id}",
            headers=auth_headers(tok_admin),
        )

        assert r.status_code == 200
        ids = {item["id"] for item in r.json()}
        assert activo.id in ids
        assert inactivo.id not in ids

    def test_usuario_normal_no_puede_listar_catalogo_para_representar(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)

        r = client.get(
            f"/espacios/departamentos-disponibles?espacio_id={esp_id}",
            headers=auth_headers(tok_doc),
        )

        assert r.status_code == 403

    def test_responsable_crea_solicitud_para_otro_departamento(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        departamento = _departamento(db)

        r = self._crear_solicitud(
            client,
            tok_admin,
            esp_id,
            fecha="2026-08-11",
            departamento_id=departamento.id,
            area_solicitante="Texto que no debe prevalecer",
        )

        assert r.status_code == 201
        data = r.json()
        assert data["departamento_id"] == departamento.id
        assert data["departamento_nombre"] == departamento.nombre
        assert data["area_solicitante"] == departamento.nombre

    def test_responsable_crea_solicitud_externa(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)

        r = self._crear_solicitud(
            client,
            tok_admin,
            esp_id,
            fecha="2026-08-12",
            departamento_id=None,
            solicitante_externo_nombre="Institucion invitada",
        )

        assert r.status_code == 201
        assert r.json()["departamento_id"] is None
        assert r.json()["area_solicitante"] == "Institucion invitada"
        assert r.json()["solicitante_externo_nombre"] == "Institucion invitada"

    def test_responsable_asignado_puede_registrar_externo(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        tok_responsable = get_token(client, "resp@test.mx", "Test1234!")

        r = self._crear_solicitud(
            client,
            tok_responsable,
            esp_id,
            fecha="2026-08-16",
            solicitante_externo_nombre="Visitante institucional",
        )

        assert r.status_code == 201
        assert r.json()["solicitante_nombre"] == "Resp"
        assert r.json()["solicitante_externo_nombre"] == "Visitante institucional"

    def test_usuario_normal_no_puede_elegir_otro_departamento(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        departamento = _departamento(db)

        r = self._crear_solicitud(
            client,
            tok_doc,
            esp_id,
            fecha="2026-08-14",
            departamento_id=departamento.id,
        )

        assert r.status_code == 403

    def test_usuario_normal_no_puede_registrar_externo(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)

        r = self._crear_solicitud(
            client,
            tok_doc,
            esp_id,
            fecha="2026-08-15",
            solicitante_externo_nombre="Empresa externa",
        )

        assert r.status_code == 403

    def test_departamento_invalido_422(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)

        r = self._crear_solicitud(
            client,
            tok_admin,
            esp_id,
            fecha="2026-08-13",
            departamento_id=9999,
        )

        assert r.status_code == 422

    def test_mis_solicitudes(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        self._crear_solicitud(client, tok_doc, esp_id, "2026-08-02")
        r = client.get("/espacios/mis-solicitudes", headers=auth_headers(tok_doc))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_aprobar_solicitud(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        r = self._crear_solicitud(client, tok_doc, esp_id, "2026-08-03")
        sol_id = r.json()["id"]
        r2 = client.post(f"/espacios/solicitudes/{sol_id}/aprobar",
                         json={}, headers=auth_headers(tok_admin))
        assert r2.status_code == 200
        assert r2.json()["estado"] == "APROBADA"

    def test_rechazar_solicitud(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        r = self._crear_solicitud(client, tok_doc, esp_id, "2026-08-04")
        sol_id = r.json()["id"]
        r2 = client.post(f"/espacios/solicitudes/{sol_id}/rechazar",
                         json={"motivo_rechazo": "Sin disponibilidad en esa fecha"},
                         headers=auth_headers(tok_admin))
        assert r2.status_code == 200
        assert r2.json()["estado"] == "RECHAZADA"

    def test_cancelar_solicitud_propio(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        r = self._crear_solicitud(client, tok_doc, esp_id, "2026-08-05")
        sol_id = r.json()["id"]
        r2 = client.post(f"/espacios/solicitudes/{sol_id}/cancelar",
                         json={"motivo_cancelacion": "Ya no se necesita"},
                         headers=auth_headers(tok_doc))
        assert r2.status_code == 200
        assert r2.json()["estado"] == "CANCELADA"

    def test_bandeja_admin(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        self._crear_solicitud(client, tok_doc, esp_id, "2026-08-06")
        r = client.get("/espacios/bandeja", headers=auth_headers(tok_admin))
        assert r.status_code == 200

    def test_solicitud_sin_espacio_404(self, client, db):
        tok_admin, tok_doc, esp_id = self._setup(client, db)
        r = client.post("/espacios/solicitudes", json={
            "espacio_id": 9999,
            "fecha": "2026-08-10",
            "hora_inicio": "09:00",
            "hora_fin": "11:00",
            "motivo": "Motivo de prueba para test",
        }, headers=auth_headers(tok_doc))
        assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════════════
# Mis espacios
# ════════════════════════════════════════════════════════════════════════════

class TestMisEspacios:

    def test_mis_espacios(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/espacios/mis-espacios", headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ════════════════════════════════════════════════════════════════════════════
# Permisos
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosEspacios:

    def test_sin_token_401(self, client, db):
        r = client.get("/espacios/institucionales")
        assert r.status_code == 401

    def test_alumno_no_puede_crear_espacio(self, client, db):
        _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        tok = get_token(client, "alum@test.mx", "Test1234!")
        r = client.post("/espacios/institucionales", json={
            "nombre": "X", "tipo": "OTRO",
        }, headers=auth_headers(tok))
        assert r.status_code == 403

    def test_docente_no_puede_crear_espacio(self, client, db):
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@test.mx", "Test1234!")
        r = client.post("/espacios/institucionales", json={
            "nombre": "X", "tipo": "OTRO",
        }, headers=auth_headers(tok))
        assert r.status_code == 403
