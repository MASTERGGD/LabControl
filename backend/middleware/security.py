"""
Security Headers Middleware — LabControl UTECAN
================================================
Aplica cabeceras de seguridad HTTP en cada respuesta del backend.

Cabeceras implementadas:
  X-Content-Type-Options      → Evita MIME-sniffing
  X-Frame-Options             → Previene clickjacking
  X-XSS-Protection            → Capa extra en browsers legacy
  Referrer-Policy             → Controla info del Referer
  Permissions-Policy          → Deshabilita APIs de hardware innecesarias
  Content-Security-Policy     → Política de recursos permitidos
  Cache-Control               → No cachear respuestas de API sensibles
  Strict-Transport-Security   → HSTS (solo en producción HTTPS)

Cabeceras eliminadas:
  Server                      → No revelar "uvicorn"
  X-Powered-By                → No revelar el stack

Uso:
    from middleware.security import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
"""

import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# ── Determinar si estamos en producción ────────────────────────────────────────
_ENV = os.getenv("APP_ENV", "development").lower()
_IS_PROD = _ENV in ("production", "prod")

# ── CSP — Content Security Policy ─────────────────────────────────────────────
# Permite:
#   - Scripts propios + Tailwind CDN (necesario por el inline tailwind.config)
#   - Estilos propios + inline (glassmorphism CSS en index.html) + Google Fonts
#   - Fuentes de Google
#   - Imágenes propias + data: (iconos SVG inline y base64)
#   - Conexiones al mismo origen + WebSockets (WS en tiempo real) + API backend
#   - Workers propios (Service Worker PWA)
#   - frame-ancestors 'none' — equivale a X-Frame-Options: DENY
#   - base-uri 'self' — previene base tag injection
#   - form-action 'self' — previene form hijacking

_CSP_DIRECTIVES = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss: http://localhost:8000 http://localhost:3000",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests" if _IS_PROD else "",
]).rstrip("; ")


# ── Cabeceras invariables (aplican siempre) ─────────────────────────────────────
_STATIC_HEADERS: dict[str, str] = {
    # Previene que el browser "adivine" el Content-Type
    "X-Content-Type-Options": "nosniff",

    # Previene clickjacking — el frame-ancestors en CSP lo duplica para compatibilidad
    "X-Frame-Options": "DENY",

    # Protección XSS en browsers legacy (IE/Edge pre-Chromium)
    "X-XSS-Protection": "1; mode=block",

    # No enviar URL completa como Referer a dominios externos
    "Referrer-Policy": "strict-origin-when-cross-origin",

    # Deshabilitar APIs de hardware que esta app no usa
    "Permissions-Policy": (
        "camera=(), microphone=(), geolocation=(), "
        "payment=(), usb=(), bluetooth=(), "
        "accelerometer=(), gyroscope=()"
    ),

    # Política de recursos
    "Content-Security-Policy": _CSP_DIRECTIVES,

    # No cachear respuestas de API (contienen datos sensibles / JWT)
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",

    # Ocultar stack tecnológico
    "X-Powered-By": "",  # se elimina en el middleware
}

# HSTS — solo en producción con HTTPS real
# En desarrollo con HTTP causaría problemas
if _IS_PROD:
    _STATIC_HEADERS["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains; preload"
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware que inyecta cabeceras de seguridad en cada respuesta HTTP.

    También elimina cabeceras que revelan información del servidor:
      - Server (uvicorn lo pone automáticamente)
      - X-Powered-By
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # ── Inyectar cabeceras de seguridad ────────────────────────────────────
        for header, value in _STATIC_HEADERS.items():
            if value:  # No agregar si value es string vacío
                response.headers[header] = value

        # ── Eliminar cabeceras que revelan el stack ─────────────────────────────
        # MutableHeaders no tiene .pop() — usar del con try/except
        for _hdr in ("server", "x-powered-by"):
            try:
                del response.headers[_hdr]
            except KeyError:
                pass

        # Ruta autoritativa desde el scope ASGI (no manipulable por Host header).
        path = str(request.scope.get("path") or "")

        # ── Cache-Control especial para endpoints de auth ──────────────────────
        # Los tokens JWT y datos de sesión nunca deben cachearse
        if path.startswith("/auth"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"

        # ── Recursos estáticos pueden cachearse (imágenes, iconos, etc.) ───────
        # No aplica al backend puro, pero por si se sirven assets algún día
        if path.startswith("/static") or path.endswith((".ico", ".png", ".svg")):
            response.headers["Cache-Control"] = "public, max-age=86400"
            try:
                del response.headers["Pragma"]
            except KeyError:
                pass

        return response
