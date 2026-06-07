from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.engine import make_url

from database import DATABASE_URL, SessionLocal
from services.system_backup import BACKUP_DIR, DATA_DIR, MIN_FREE_MB, list_backups


def get_system_health(detailed: bool = False) -> dict:
    checks: dict[str, dict] = {}

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = {"status": "ok"}
    except Exception:
        checks["database"] = {"status": "error"}
    finally:
        db.close()

    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        storage_ok = DATA_DIR.is_dir() and os.access(DATA_DIR, os.W_OK)
        checks["storage"] = {"status": "ok" if storage_ok else "error"}
    except OSError:
        checks["storage"] = {"status": "error"}

    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        disk = shutil.disk_usage(BACKUP_DIR)
        free_mb = round(disk.free / (1024 * 1024))
        checks["disk"] = {
            "status": "ok" if free_mb >= MIN_FREE_MB else "warning",
            "free_mb": free_mb,
            "minimum_mb": MIN_FREE_MB,
        }
    except OSError:
        checks["disk"] = {"status": "error"}

    statuses = {item["status"] for item in checks.values()}
    if "error" in statuses:
        status = "unhealthy"
    elif "warning" in statuses:
        status = "degraded"
    else:
        status = "healthy"

    result = {
        "status": status,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
    }

    if detailed:
        backups = list_backups()
        result["database_engine"] = make_url(DATABASE_URL).get_backend_name()
        result["last_backup"] = backups[0] if backups else None
        result["backup_count"] = len(backups)

    return result
