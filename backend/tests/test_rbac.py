"""
test_rbac.py — Tests de Control de Acceso Basado en Roles (RBAC)

Verifica que los endpoints protegidos rechacen roles no autorizados.

Casos cubiertos:
  1. DOCENTE intenta GET /usuarios → 403
  2. DOCENTE intenta GET /auditoria/logs → 403
  3. SUPER_ADMIN accede a GET /usuarios → 200
  4. Sin autenticación a endpoint protegido → 401
  5. DOCENTE accede a su propio perfil /auth/me → 200 (permitido)
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.adeudo import Adeudo
from models.horario import HorarioDisponible, Reservacion
from models.laboratorio import Laboratorio
from models.usuario import RolUsuario, Usuario


class TestRBAC:

    def test_docente_no_puede_listar_usuarios(self, client, admin_user, docente_user):
        """DOCENTE intentando GET /usuarios debe recibir 403."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.get("/usuarios", headers=auth_headers(token))
        assert resp.status_code == 403, (
            f"Se esperaba 403, se obtuvo {resp.status_code}: {resp.text}"
        )

    def test_docente_no_puede_ver_auditoria(self, client, admin_user, docente_user):
        """DOCENTE intentando GET /auditoria/logs debe recibir 403."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.get("/auditoria/", headers=auth_headers(token))
        assert resp.status_code == 403

    def test_admin_puede_listar_usuarios(self, client, admin_user):
        """SUPER_ADMIN puede acceder a GET /usuarios."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        resp = client.get("/usuarios", headers=auth_headers(token))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_sin_auth_endpoint_protegido(self, client, admin_user):
        """Sin token, endpoint protegido devuelve 401."""
        resp = client.get("/usuarios")
        assert resp.status_code == 401

    def test_docente_puede_ver_su_propio_perfil(self, client, admin_user, docente_user):
        """DOCENTE sí puede consultar /auth/me (su propio perfil)."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.get("/auth/me", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["rol"] == "DOCENTE"

    def test_docente_no_puede_crear_usuario(self, client, admin_user, docente_user):
        """DOCENTE intentando POST /usuarios debe recibir 403."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.post(
            "/usuarios",
            json={
                "nombre": "Nuevo User",
                "email": "nuevo@test.com",
                "password": "Pass123456",
                "rol": "DOCENTE",
            },
        )
        assert resp.status_code == 403
