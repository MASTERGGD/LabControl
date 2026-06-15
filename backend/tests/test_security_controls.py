"""
Cobertura automatizada de los controles de seguridad añadidos en la auditoría:

  1. Guard de cambio de contraseña obligatorio (dependencies.get_current_user)
     - Bloquea endpoints fuera de la allowlist (403 + cabecera).
     - Permite las operaciones exactas de la allowlist.
     - No se evade manipulando la cabecera Host (se usa scope["path"]).
     - Se desbloquea tras cambiar la contraseña.

  2. Rate limit por ruta ASGI (services.rate_limit)
     - /auth/login cae siempre en la regla estricta usando scope["path"],
       aunque request.url se vea alterado.

  3. Cache-Control de /auth (middleware.security)
     - no-store / no-cache decididos por scope["path"], no por request.url.
"""
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import get_token, auth_headers
from services.rate_limit import RateLimitMiddleware
from middleware.security import SecurityHeadersMiddleware


# ─── 1. Guard de cambio de contraseña obligatorio ──────────────────────────────

class TestPasswordChangeGuard:

    def test_endpoint_normal_bloqueado(self, client, password_change_user):
        token = get_token(client, "cambio@test.com", "TemporalPass123")
        resp = client.get("/usuarios", headers=auth_headers(token))
        assert resp.status_code == 403
        assert resp.headers.get("X-Password-Change-Required") == "true"

    def test_allowlist_permite_auth_me(self, client, password_change_user):
        token = get_token(client, "cambio@test.com", "TemporalPass123")
        resp = client.get("/auth/me", headers=auth_headers(token))
        assert resp.status_code == 200

    def test_bypass_con_host_manipulado_sigue_bloqueado(self, client, password_change_user):
        token = get_token(client, "cambio@test.com", "TemporalPass123")
        headers = auth_headers(token)
        # Intento de evasión: alterar Host para confundir request.url.path.
        # El guard usa scope["path"], así que debe seguir devolviendo 403.
        headers["Host"] = "example.com/auth/me?x="
        resp = client.get("/usuarios", headers=headers)
        assert resp.status_code == 403
        assert resp.headers.get("X-Password-Change-Required") == "true"

    def test_se_desbloquea_tras_cambiar_password(self, client, password_change_user):
        token = get_token(client, "cambio@test.com", "TemporalPass123")
        # Cambiar la contraseña (operación permitida por la allowlist).
        resp = client.put(
            "/usuarios/me/password",
            headers=auth_headers(token),
            json={"password_actual": "TemporalPass123", "password_nuevo": "NuevaClave456"},
        )
        assert resp.status_code == 200
        # Ahora el flag está limpio: el mismo token ya puede usar endpoints normales.
        resp2 = client.get("/usuarios", headers=auth_headers(token))
        assert resp2.status_code == 200

    def test_usuario_normal_no_se_ve_afectado(self, client, admin_user):
        token = get_token(client, "admin@test.com", "AdminPass123")
        resp = client.get("/usuarios", headers=auth_headers(token))
        assert resp.status_code == 200


# ─── 2. Rate limit por ruta ASGI (scope["path"]) ───────────────────────────────

class TestRateLimitScopePath:

    def _mw(self):
        return RateLimitMiddleware(app=lambda *a, **k: None)

    def _fake_request(self, method, scope_path, url_path):
        # request.url.path distinto del scope["path"] para simular manipulación.
        return SimpleNamespace(
            method=method,
            scope={"path": scope_path},
            url=SimpleNamespace(path=url_path),
            headers={},
            client=SimpleNamespace(host="1.2.3.4"),
        )

    def test_login_usa_regla_estricta_por_scope(self):
        mw = self._mw()
        req = self._fake_request("POST", "/auth/login", url_path="/algo-falso")
        rule = mw._match_rule(req)
        assert rule is not None
        assert rule.prefix == "/auth/login"
        assert rule.limit == 10  # regla estricta de login, no la general (300)

    def test_general_para_otras_rutas(self):
        mw = self._mw()
        req = self._fake_request("GET", "/usuarios", url_path="/usuarios")
        rule = mw._match_rule(req)
        assert rule is not None
        assert rule.prefix == "/"
        assert rule.limit == 300


# ─── 3. Cache-Control de /auth por scope["path"] ───────────────────────────────

def _build_security_app():
    app = FastAPI(docs_url=None)
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/auth/ping")
    def auth_ping():
        return {"ok": True}

    @app.get("/publico")
    def publico():
        return {"ok": True}

    return app


class TestCacheControlAuth:

    def setup_method(self):
        self.client = TestClient(_build_security_app())

    def test_auth_no_cacheable(self):
        resp = self.client.get("/auth/ping")
        assert resp.headers.get("Cache-Control") == "no-store"
        assert resp.headers.get("Pragma") == "no-cache"

    def test_ruta_normal_sin_no_store(self):
        resp = self.client.get("/publico")
        assert resp.headers.get("Cache-Control") != "no-store"

    def test_cabeceras_seguridad_presentes(self):
        resp = self.client.get("/publico")
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"
