"""
Politica de retencion para la bitacora de auditoria.

Mantiene la tabla operativa pequena y permite conservar historial antiguo en
archivos comprimidos verificables. No se ejecuta automaticamente: se invoca
desde endpoints administrativos o tareas programadas futuras.
"""

from __future__ import annotations

import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from models.auditoria import AuditLog


DEFAULT_RETENTION_DAYS = 365
MIN_RETENTION_DAYS = 30
DEFAULT_BATCH_SIZE = 5000
MAX_BATCH_SIZE = 50000


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _int_env(name: str, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def audit_retention_days() -> int:
    return _int_env("AUDIT_RETENTION_DAYS", DEFAULT_RETENTION_DAYS, minimum=MIN_RETENTION_DAYS)


def audit_archive_batch_size() -> int:
    return _int_env("AUDIT_ARCHIVE_BATCH_SIZE", DEFAULT_BATCH_SIZE, minimum=1, maximum=MAX_BATCH_SIZE)


def audit_archive_dir() -> Path:
    return Path(os.getenv("AUDIT_ARCHIVE_DIR", "data/audit_archives")).resolve()


def audit_archive_enabled() -> bool:
    return os.getenv("AUDIT_ARCHIVE_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


def _cutoff(retention_days: int | None = None) -> datetime.datetime:
    days = max(MIN_RETENTION_DAYS, retention_days or audit_retention_days())
    return _utcnow() - datetime.timedelta(days=days)


def _serialize_log(log: AuditLog) -> dict[str, Any]:
    return {
        "id": log.id,
        "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        "usuario_id": log.usuario_id,
        "usuario_nombre": log.usuario_nombre,
        "usuario_email": log.usuario_email,
        "accion": log.accion,
        "recurso": log.recurso,
        "recurso_id": log.recurso_id,
        "detalle": log.detalle,
        "exito": log.exito,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
    }


def retention_status(db: Session, retention_days: int | None = None) -> dict[str, Any]:
    days = max(MIN_RETENTION_DAYS, retention_days or audit_retention_days())
    cutoff = _cutoff(days)
    total = db.query(AuditLog).count()
    archivables = db.query(AuditLog).filter(AuditLog.timestamp < cutoff).count()
    newest = db.query(AuditLog.timestamp).order_by(AuditLog.timestamp.desc()).first()
    oldest = db.query(AuditLog.timestamp).order_by(AuditLog.timestamp.asc()).first()
    archive_dir = audit_archive_dir()
    archives = sorted(archive_dir.glob("audit_logs_*.jsonl.gz")) if archive_dir.exists() else []
    return {
        "retention_days": days,
        "cutoff": cutoff.isoformat() + "Z",
        "total_operativo": total,
        "archivables": archivables,
        "oldest": oldest[0].isoformat() + "Z" if oldest and oldest[0] else None,
        "newest": newest[0].isoformat() + "Z" if newest and newest[0] else None,
        "archive_enabled": audit_archive_enabled(),
        "archive_dir": str(archive_dir),
        "archives_count": len(archives),
    }


def archive_old_logs(
    db: Session,
    usuario,
    request: Request | None = None,
    retention_days: int | None = None,
    limit: int | None = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    days = max(MIN_RETENTION_DAYS, retention_days or audit_retention_days())
    batch_limit = min(max(1, limit or audit_archive_batch_size()), MAX_BATCH_SIZE)
    cutoff = _cutoff(days)
    query = (
        db.query(AuditLog)
        .filter(AuditLog.timestamp < cutoff)
        .order_by(AuditLog.timestamp.asc(), AuditLog.id.asc())
    )
    total_archivable = query.count()
    logs = query.limit(batch_limit).all()

    result: dict[str, Any] = {
        "dry_run": dry_run,
        "retention_days": days,
        "cutoff": cutoff.isoformat() + "Z",
        "total_archivable": total_archivable,
        "seleccionados": len(logs),
        "archivados": 0,
        "eliminados_operativo": 0,
        "archivo": None,
        "sha256": None,
        "bytes": 0,
    }

    if dry_run or not logs:
        return result
    if not audit_archive_enabled():
        raise RuntimeError("El archivado de auditoria esta deshabilitado por AUDIT_ARCHIVE_ENABLED=false")

    archive_dir = audit_archive_dir()
    archive_dir.mkdir(parents=True, exist_ok=True)
    first_id = logs[0].id
    last_id = logs[-1].id
    filename = f"audit_logs_{_utcnow().strftime('%Y%m%d_%H%M%S')}_{first_id}_{last_id}.jsonl.gz"
    path = archive_dir / filename

    with gzip.open(path, "wt", encoding="utf-8") as fh:
        for log in logs:
            fh.write(json.dumps(_serialize_log(log), ensure_ascii=False, default=str))
            fh.write("\n")

    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    ids = [log.id for log in logs]
    deleted = (
        db.query(AuditLog)
        .filter(AuditLog.id.in_(ids))
        .delete(synchronize_session=False)
    )
    db.commit()

    result.update({
        "archivados": len(logs),
        "eliminados_operativo": deleted,
        "archivo": str(path),
        "sha256": digest,
        "bytes": path.stat().st_size,
    })

    from services.auditoria import Accion, Recurso, registrar

    registrar(
        db,
        accion=Accion.ARCHIVAR_AUDITORIA,
        recurso=Recurso.SISTEMA,
        usuario=usuario,
        detalle={
            "retention_days": days,
            "cutoff": result["cutoff"],
            "archivo": result["archivo"],
            "sha256": result["sha256"],
            "archivados": result["archivados"],
            "eliminados_operativo": result["eliminados_operativo"],
        },
        request=request,
    )

    return result
