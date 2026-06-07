from __future__ import annotations

import logging
import os
import re
import uuid
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{6,64}$")


def _build_logger() -> logging.Logger:
    logger = logging.getLogger("siga.unhandled")
    if logger.handlers:
        return logger

    log_dir = Path(os.getenv("SYSTEM_LOG_DIR", "data/logs")).resolve()
    log_dir.mkdir(parents=True, exist_ok=True)

    handler = RotatingFileHandler(
        log_dir / "system-errors.log",
        maxBytes=int(os.getenv("SYSTEM_LOG_MAX_BYTES", str(5 * 1024 * 1024))),
        backupCount=int(os.getenv("SYSTEM_LOG_BACKUP_COUNT", "5")),
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(message)s"
    ))
    logger.addHandler(handler)
    logger.setLevel(logging.ERROR)
    logger.propagate = True
    return logger


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Asigna un folio a cada solicitud y registra errores no controlados."""

    async def dispatch(self, request: Request, call_next):
        incoming_id = request.headers.get("x-request-id", "")
        request_id = (
            incoming_id
            if _REQUEST_ID_RE.fullmatch(incoming_id)
            else uuid.uuid4().hex[:12].upper()
        )
        request.state.request_id = request_id

        try:
            response = await call_next(request)
        except Exception:
            _build_logger().exception(
                "folio=%s method=%s path=%s",
                request_id,
                request.method,
                request.url.path,
            )
            response = JSONResponse(
                status_code=500,
                content={
                    "detail": "Ocurrio un error interno en el sistema.",
                    "folio": request_id,
                },
            )

        response.headers["X-Request-ID"] = request_id
        return response
