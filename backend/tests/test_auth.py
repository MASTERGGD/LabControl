"""
test_auth.py — Tests de integración para /auth/login y /auth/me

Casos cubiertos:
  1. Login con credenciales correctas → 200 + token
  2. Login con contraseña incorrecta  → 401
  3. Login con email inexistente      → 401
  4. /auth/me con token válido        → 200 + datos del usuario
  5. /auth/me sin token               → 401
  6. /auth/me con token malformado    → 401
  7. Usuario desactivado no puede loguear → 403
"""
import pytest
from tests.conftest import get_token, auth_headers


class TestLogin:

    def test_login_credenciales_correctas(self, client, admin_user):
        """Login exitoso devuelve token y datos del usuario."""
        resp = client.post(
            "/auth/login",
            data={"username": "admin@test.com", "password": "AdminPass123"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["usuario"]["email"] == "admin@test.com"
        assert body["usuario"]["rol"] == "SUPER_ADMIN"

    def test_login_password_incorrecta(self, client, admin_user):
        """Contraseña errónea devuelve 401."""
        resp = client.post(
            "/auth/login",
            data={"username": "admin@test.com", "password": "MalPassword"},
        )
        assert resp.status_code == 401
        assert "detail" in resp.json()

    def test_login_email_inexistente(self, client):
        """Email que no existe devuelve 401 (no revela si existe o no)."""
        resp = client.post(
            "/auth/login",
            data={"username": "noexiste@test.com", "password": "cualquier"},
        )
        assert resp.status_code == 401

    def test_login_usuario_desactivado(self, client, db, admin_user):
        """Usuario desactivado recibe 403 con mensaje claro."""
        admin_user.activo = False
        db.commit()

        resp = client.post(
            "/auth/login",
            data={"username": "admin@test.com", "password": "AdminPass123"},
        )
        assert resp.status_code == 403
        assert "desactivada" in resp.json()["detail"].lower()

    def test_login_docente_exitoso(self, client, docente_user):
        """Un DOCENTE también puede loguear correctamente."""
        resp = client.post(
            "/auth/login",
            data={"username": "docente@test.com", "password": "DocentePass123"},
        )
        assert resp.status_code == 200
        assert resp.json()["usuario"]["rol"] == "DOCENTE"

    def test_login_se_bloquea_temporalmente_por_fallos(self, client, admin_user):
        """Tras varios intentos fallidos, el login devuelve 429 temporalmente."""
        for _ in range(5):
            resp = client.post(
                "/auth/login",
                data={"username": "admin@test.com", "password": "MalPassword"},
            )
            assert resp.status_code == 401

        resp = client.post(
            "/auth/login",
            data={"username": "admin@test.com", "password": "MalPassword"},
        )
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers

    def test_rate_limit_login_por_ip(self, client):
        """El middleware corta exceso de solicitudes al endpoint de login."""
        for _ in range(10):
            client.post(
                "/auth/login",
                data={"username": "nadie@test.com", "password": "x"},
            )

        resp = client.post(
            "/auth/login",
            data={"username": "otro@test.com", "password": "x"},
        )
        assert resp.status_code == 429


class TestMe:

    def test_me_con_token_valido(self, client, admin_user):
        """GET /auth/me con token válido devuelve datos del usuario autenticado."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        resp = client.get("/auth/me", headers=auth_headers(token))

        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == "admin@test.com"
        assert body["rol"] == "SUPER_ADMIN"
        assert body["activo"] is True

    def test_me_sin_token(self, client, admin_user):
        """GET /auth/me sin Authorization header devuelve 401."""
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_token_malformado(self, client):
        """Token completamente inválido devuelve 401."""
        resp = client.get(
            "/auth/me",
            headers={"Authorization": "Bearer esto.no.es.un.jwt.valido"},
        )
        assert resp.status_code == 401

    def test_me_token_sin_bearer(self, client, admin_user):
        """Enviar el token sin el prefijo 'Bearer' devuelve 401."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        resp = client.get("/auth/me", headers={"Authorization": token.replace("Bearer ", "")})
        assert resp.status_code == 401
