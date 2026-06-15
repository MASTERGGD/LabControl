import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _scope_path(request: Request) -> str:
    """Ruta autoritativa desde el scope ASGI (la que usa el enrutador).

    No se deriva de request.url, que en versiones afectadas de Starlette podia
    manipularse con una cabecera Host malformada (GHSA-86qp-5c8j-p5mr).
    """
    return str(request.scope.get("path") or "")


def get_client_ip(request: Request) -> str:
    """Return a stable client IP, respecting proxy headers only when enabled."""
    trust_proxy = os.getenv("TRUST_PROXY_HEADERS", "false").lower() in ("1", "true", "yes")
    if trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
    return request.client.host if request.client else "unknown"


@dataclass(frozen=True)
class RateLimitRule:
    prefix: str
    methods: tuple[str, ...]
    limit: int
    window_seconds: int
    scope: str = "ip"


class SlidingWindowLimiter:
    def __init__(self):
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
          hits = self._hits[key]
          while hits and hits[0] <= cutoff:
              hits.popleft()
          if len(hits) >= limit:
              retry_after = max(1, int(window_seconds - (now - hits[0])))
              return False, retry_after
          hits.append(now)
          return True, 0


_limiter = SlidingWindowLimiter()
_login_failures: dict[str, deque[float]] = defaultdict(deque)
_login_lock = Lock()


def _login_key(request: Request, email: str) -> str:
    return f"{get_client_ip(request)}:{email.strip().lower()}"


def ensure_login_not_locked(request: Request, email: str) -> None:
    max_failures = _env_int("LOGIN_MAX_FAILURES", 5)
    lock_minutes = _env_int("LOGIN_LOCK_MINUTES", 15)
    window_seconds = lock_minutes * 60
    key = _login_key(request, email)
    now = time.time()
    cutoff = now - window_seconds
    with _login_lock:
        failures = _login_failures[key]
        while failures and failures[0] <= cutoff:
            failures.popleft()
        if len(failures) >= max_failures:
            retry_after = max(1, int(window_seconds - (now - failures[0])))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos fallidos. Intenta nuevamente mas tarde.",
                headers={"Retry-After": str(retry_after)},
            )


def register_login_failure(request: Request, email: str) -> None:
    key = _login_key(request, email)
    with _login_lock:
        _login_failures[key].append(time.time())


def clear_login_failures(request: Request, email: str) -> None:
    key = _login_key(request, email)
    with _login_lock:
        _login_failures.pop(key, None)


def reset_rate_limit_state() -> None:
    """Used by tests to avoid leaking counters across cases."""
    with _limiter._lock:
        _limiter._hits.clear()
    with _login_lock:
        _login_failures.clear()


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.enabled = os.getenv("RATE_LIMIT_ENABLED", "true").lower() not in ("0", "false", "no")
        self.rules = [
            RateLimitRule("/auth/login", ("POST",), _env_int("RATE_LIMIT_LOGIN_PER_MINUTE", 10), 60),
            RateLimitRule("/sesiones/autoasignacion", ("GET", "POST"), _env_int("RATE_LIMIT_QR_PER_MINUTE", 30), 60),
            RateLimitRule("/catalogo/alumnos/buscar", ("GET",), _env_int("RATE_LIMIT_SEARCH_PER_MINUTE", 60), 60, "user_or_ip"),
            RateLimitRule("/inventario/incidentes", ("POST", "PUT", "PATCH"), _env_int("RATE_LIMIT_WRITE_PER_MINUTE", 60), 60, "user_or_ip"),
            RateLimitRule("/comunicados", ("POST", "PUT", "PATCH"), _env_int("RATE_LIMIT_WRITE_PER_MINUTE", 60), 60, "user_or_ip"),
            RateLimitRule("/", ("GET", "POST", "PUT", "PATCH", "DELETE"), _env_int("RATE_LIMIT_GENERAL_PER_MINUTE", 300), 60, "user_or_ip"),
        ]

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self.enabled or request.method == "OPTIONS":
            return await call_next(request)
        # Ruta desde el scope ASGI (la misma que usa el router), no desde
        # request.url, para que no se pueda evadir el rate limit de /auth/login
        # manipulando la cabecera Host.
        if _scope_path(request).startswith(("/health", "/docs", "/openapi.json")):
            return await call_next(request)

        rule = self._match_rule(request)
        if rule:
            ident = self._identifier(request, rule)
            key = f"{rule.prefix}:{request.method}:{ident}"
            allowed, retry_after = _limiter.check(key, rule.limit, rule.window_seconds)
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Demasiadas solicitudes. Intenta nuevamente en unos segundos."},
                    headers={"Retry-After": str(retry_after)},
                )
        return await call_next(request)

    def _match_rule(self, request: Request) -> RateLimitRule | None:
        path = _scope_path(request)
        for rule in self.rules:
            if request.method in rule.methods and path.startswith(rule.prefix):
                return rule
        return None

    def _identifier(self, request: Request, rule: RateLimitRule) -> str:
        if rule.scope == "user_or_ip":
            auth = request.headers.get("authorization", "")
            if auth.lower().startswith("bearer "):
                return auth[:48]
        return get_client_ip(request)
