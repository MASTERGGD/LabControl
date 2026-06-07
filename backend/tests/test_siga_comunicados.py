"""
test_siga_comunicados.py -- Tests de integración para el módulo de comunicados.

Cubre:
- Crear, listar, publicar y archivar comunicados (SUPER_ADMIN)
- Marcar como leído y confirmar (destinatario)
- Responder a un comunicado
- Categorías permitidas por rol
- Conteo de pendientes
- Permisos
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


def _crear_comunicado(client, token, titulo="Comunicado Test",
                      destinatarios=None, requiere_confirmacion=False,
                      requiere_retroalimentacion=False):
    body = {
        "titulo": titulo,
        "contenido": "Contenido del comunicado de prueba.",
        "categoria": "GENERAL",
        "prioridad": "INFORMATIVO",
        "requiere_confirmacion": requiere_confirmacion,
        "requiere_retroalimentacion": requiere_retroalimentacion,
        "destinatarios": destinatarios if destinatarios is not None else [{"tipo": "TODOS", "ref": None}],
    }
    return client.post("/comunicados", json=body, headers=auth_headers(token))


# ════════════════════════════════════════════════════════════════════════════
# CRUD básico
# ════════════════════════════════════════════════════════════════════════════

class TestCrudComunicados:

    def test_crear_comunicado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_comunicado(client, tok, "Comunicado General")
        assert r.status_code == 201
        data = r.json()
        assert data["titulo"] == "Comunicado General"
        assert data["estado"] == "BORRADOR"

    def test_listar_comunicados(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _crear_comunicado(client, tok, "C1")
        _crear_comunicado(client, tok, "C2")
        r = client.get("/comunicados", headers=auth_headers(tok))
        assert r.status_code == 200
        # Puede devolver lista o paginado
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data)
        assert len(items) >= 2

    def test_publicar_comunicado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_comunicado(client, tok, "Para Publicar")
        com_id = r.json()["id"]
        r2 = client.post(f"/comunicados/{com_id}/publicar",
                         json={}, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["estado"] == "PUBLICADO"

    def test_archivar_comunicado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_comunicado(client, tok, "Para Archivar")
        com_id = r.json()["id"]
        # Publicar primero
        client.post(f"/comunicados/{com_id}/publicar",
                    json={}, headers=auth_headers(tok))
        r2 = client.post(f"/comunicados/{com_id}/archivar",
                         json={}, headers=auth_headers(tok))
        assert r2.status_code == 200

    def test_editar_comunicado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_comunicado(client, tok, "Original")
        com_id = r.json()["id"]
        r2 = client.put(f"/comunicados/{com_id}", json={
            "titulo": "Editado",
            "contenido": "Nuevo contenido.",
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["titulo"] == "Editado"

    def test_eliminar_comunicado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = _crear_comunicado(client, tok, "Para Eliminar")
        com_id = r.json()["id"]
        r2 = client.delete(f"/comunicados/{com_id}", headers=auth_headers(tok))
        assert r2.status_code in (200, 204)

    def test_comunicado_inexistente_404(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/comunicados/9999", headers=auth_headers(tok))
        assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════════════
# Lectura, confirmación y respuesta
# ════════════════════════════════════════════════════════════════════════════

class TestLecturaConfirmacion:

    def _setup_publicado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        doc = _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        r = _crear_comunicado(client, tok, "Para Leer",
                               destinatarios=[{"tipo": "TODOS", "ref": None}],
                               requiere_confirmacion=True)
        com_id = r.json()["id"]
        client.post(f"/comunicados/{com_id}/publicar", json={}, headers=auth_headers(tok))
        tok_doc = get_token(client, "doc@test.mx", "Test1234!")
        return com_id, tok_doc, tok

    def test_marcar_leido(self, client, db):
        com_id, tok_doc, tok_admin = self._setup_publicado(client, db)
        r = client.post(f"/comunicados/{com_id}/leer",
                        json={}, headers=auth_headers(tok_doc))
        assert r.status_code == 200

    def test_confirmar_recepcion(self, client, db):
        com_id, tok_doc, tok_admin = self._setup_publicado(client, db)
        r = client.post(f"/comunicados/{com_id}/confirmar",
                        json={}, headers=auth_headers(tok_doc))
        assert r.status_code == 200

    def test_responder_comunicado(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        # requiere_retroalimentacion=True para que el endpoint permita responder
        r = _crear_comunicado(client, tok, "Para Responder",
                               destinatarios=[{"tipo": "TODOS", "ref": None}],
                               requiere_retroalimentacion=True)
        com_id = r.json()["id"]
        client.post(f"/comunicados/{com_id}/publicar", json={}, headers=auth_headers(tok))
        tok_doc = get_token(client, "doc@test.mx", "Test1234!")
        # El endpoint usa Form(comentario), no JSON
        r2 = client.post(f"/comunicados/{com_id}/responder",
                         data={"comentario": "Recibido, gracias."},
                         headers=auth_headers(tok_doc))
        assert r2.status_code in (200, 201)


# ════════════════════════════════════════════════════════════════════════════
# Mis comunicados y pendientes
# ════════════════════════════════════════════════════════════════════════════

class TestMisComunicados:

    def test_mis_comunicados_emisor(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        _crear_comunicado(client, tok, "Mi Comunicado")
        r = client.get("/comunicados/mis-comunicados", headers=auth_headers(tok))
        assert r.status_code == 200

    def test_pendientes_count(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/comunicados/pendientes-count", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        # El endpoint devuelve {"pendientes": N}
        assert "pendientes" in data or "total" in data or "count" in data or isinstance(data, int)

    def test_categorias_permitidas(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/comunicados/categorias-permitidas",
                       headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ════════════════════════════════════════════════════════════════════════════
# Permisos
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosComunicados:

    def test_sin_token_401(self, client, db):
        r = client.get("/comunicados")
        assert r.status_code == 401

    def test_alumno_no_puede_crear_comunicado(self, client, db):
        _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        tok = get_token(client, "alum@test.mx", "Test1234!")
        r = client.post("/comunicados", json={
            "titulo": "X", "contenido": "Y", "destinatarios": [],
        }, headers=auth_headers(tok))
        assert r.status_code == 403
