from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.engine import make_url

from database import DATABASE_URL, SessionLocal


DATA_DIR = Path(os.getenv("SYSTEM_DATA_DIR", "data")).resolve()
BACKUP_DIR = Path(os.getenv("SYSTEM_BACKUP_DIR", "data/system_backups")).resolve()
MIN_FREE_MB = int(os.getenv("SYSTEM_BACKUP_MIN_FREE_MB", "500"))
_BACKUP_LOCK = threading.Lock()
_SCHEDULER_STOP = threading.Event()
_SCHEDULER_THREAD: threading.Thread | None = None
BACKUP_TYPES = {"MANUAL", "DAILY", "WEEKLY", "MONTHLY", "TERM"}
BACKUP_TIMEZONE = ZoneInfo(os.getenv("SYSTEM_BACKUP_TIMEZONE", "America/Mexico_City"))


class BackupError(RuntimeError):
    pass


class BackupBusyError(BackupError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _human_metadata(path: Path, manifest: dict[str, Any], archive_sha256: str) -> dict[str, Any]:
    database = manifest.get("database", {})
    return {
        "filename": path.name,
        "created_at": manifest.get("created_at"),
        "size_bytes": path.stat().st_size,
        "archive_sha256": archive_sha256,
        "database_engine": database.get("engine"),
        "alembic_version": database.get("alembic_version"),
        "file_count": manifest.get("file_count", 0),
        "payload_bytes": manifest.get("payload_bytes", 0),
        "integrity": "verified",
        "backup_type": manifest.get("backup_type", "MANUAL"),
        "source": manifest.get("source", "MANUAL"),
    }


def _metadata_path(backup_path: Path) -> Path:
    return backup_path.with_suffix(".meta.json")


def _safe_backup_path(filename: str) -> Path:
    if Path(filename).name != filename or not filename.endswith(".zip"):
        raise BackupError("Nombre de respaldo invalido.")
    path = (BACKUP_DIR / filename).resolve()
    if path.parent != BACKUP_DIR:
        raise BackupError("Ruta de respaldo invalida.")
    if not path.is_file():
        raise FileNotFoundError(filename)
    return path


def _alembic_version() -> str | None:
    db = SessionLocal()
    try:
        row = db.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).first()
        return row[0] if row else None
    except Exception:
        return None
    finally:
        db.close()


def _sqlite_source_path() -> Path:
    url = make_url(DATABASE_URL)
    database = url.database
    if not database or database == ":memory:":
        raise BackupError("La base SQLite no tiene un archivo respaldable.")
    return Path(database).resolve()


def _export_database(destination: Path) -> dict[str, Any]:
    destination.mkdir(parents=True, exist_ok=True)
    engine_name = make_url(DATABASE_URL).get_backend_name()

    if engine_name == "sqlite":
        source = _sqlite_source_path()
        if not source.is_file():
            raise BackupError(f"No se encontro la base SQLite: {source}")
        output = destination / "database.sqlite3"
        source_conn = sqlite3.connect(str(source), timeout=30)
        target_conn = sqlite3.connect(str(output))
        try:
            source_conn.backup(target_conn)
        finally:
            target_conn.close()
            source_conn.close()
        return {
            "engine": "sqlite",
            "file": "database/database.sqlite3",
            "alembic_version": _alembic_version(),
        }

    if engine_name == "postgresql":
        pg_dump = shutil.which("pg_dump")
        if not pg_dump:
            raise BackupError(
                "pg_dump no esta instalado en el servidor; no se puede exportar PostgreSQL."
            )
        output = destination / "database.dump"
        pg_url = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://", 1)
        result = subprocess.run(
            [
                pg_dump,
                "--format=custom",
                "--no-owner",
                "--no-privileges",
                "--file",
                str(output),
                pg_url,
            ],
            capture_output=True,
            text=True,
            timeout=int(os.getenv("SYSTEM_BACKUP_TIMEOUT_SECONDS", "300")),
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or "Error desconocido de pg_dump").strip()
            raise BackupError(f"No se pudo exportar PostgreSQL: {detail[-500:]}")
        return {
            "engine": "postgresql",
            "file": "database/database.dump",
            "alembic_version": _alembic_version(),
        }

    raise BackupError(f"Motor de base de datos no soportado: {engine_name}")


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _collect_data_files() -> list[tuple[Path, str]]:
    if not DATA_DIR.exists():
        return []

    excluded_dirs = {
        BACKUP_DIR,
        (DATA_DIR / "logs").resolve(),
        (DATA_DIR / "comunicados_respaldos").resolve(),
    }
    sqlite_source = _sqlite_source_path() if DATABASE_URL.startswith("sqlite") else None
    files: list[tuple[Path, str]] = []

    for path in DATA_DIR.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        resolved = path.resolve()
        if sqlite_source and resolved == sqlite_source:
            continue
        if any(_is_within(resolved, excluded) for excluded in excluded_dirs):
            continue
        relative = path.relative_to(DATA_DIR).as_posix()
        files.append((path, f"data/{relative}"))

    return sorted(files, key=lambda item: item[1])


def create_backup(backup_type: str = "MANUAL", source: str = "MANUAL") -> dict[str, Any]:
    backup_type = backup_type.upper()
    source = source.upper()
    if backup_type not in BACKUP_TYPES:
        raise BackupError("Tipo de respaldo no valido.")
    if not _BACKUP_LOCK.acquire(blocking=False):
        raise BackupBusyError("Ya hay un respaldo en proceso.")

    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        free_bytes = shutil.disk_usage(BACKUP_DIR).free
        if free_bytes < MIN_FREE_MB * 1024 * 1024:
            raise BackupError(
                f"Espacio insuficiente. Se requieren al menos {MIN_FREE_MB} MB libres."
            )

        created_at = datetime.now(timezone.utc)
        suffix = uuid.uuid4().hex[:6].upper()
        filename = f"SIGA_backup_{backup_type}_{created_at:%Y%m%d_%H%M%S}_{suffix}.zip"
        final_path = BACKUP_DIR / filename

        with tempfile.TemporaryDirectory(prefix="siga_backup_") as temp_name:
            temp_dir = Path(temp_name)
            database = _export_database(temp_dir / "database")
            payload: list[dict[str, Any]] = []

            db_file = temp_dir / database["file"]
            payload.append({
                "path": database["file"],
                "size_bytes": db_file.stat().st_size,
                "sha256": _sha256(db_file),
            })

            data_files = _collect_data_files()
            for file_source, archive_name in data_files:
                payload.append({
                    "path": archive_name,
                    "size_bytes": file_source.stat().st_size,
                    "sha256": _sha256(file_source),
                })

            manifest = {
                "format_version": 1,
                "system": "SIGA UTECAN",
                "created_at": created_at.isoformat(),
                "backup_type": backup_type,
                "source": source,
                "database": database,
                "file_count": len(payload),
                "payload_bytes": sum(item["size_bytes"] for item in payload),
                "files": payload,
                "excluded": [
                    "data/system_backups",
                    "data/logs",
                    "data/comunicados_respaldos",
                ],
            }
            manifest_path = temp_dir / "manifest.json"
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=True, indent=2),
                encoding="utf-8",
            )

            partial_path = temp_dir / filename
            with zipfile.ZipFile(
                partial_path,
                "w",
                compression=zipfile.ZIP_DEFLATED,
                compresslevel=6,
            ) as archive:
                archive.write(db_file, database["file"])
                for file_source, archive_name in data_files:
                    archive.write(file_source, archive_name)
                archive.write(manifest_path, "manifest.json")

            bad_file = None
            with zipfile.ZipFile(partial_path, "r") as archive:
                bad_file = archive.testzip()
            if bad_file:
                raise BackupError(f"El ZIP generado esta danado en: {bad_file}")

            shutil.move(str(partial_path), str(final_path))

        archive_sha256 = _sha256(final_path)
        metadata = _human_metadata(final_path, manifest, archive_sha256)
        _metadata_path(final_path).write_text(
            json.dumps(metadata, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
        return metadata
    finally:
        _BACKUP_LOCK.release()


def _read_manifest(backup_path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(backup_path, "r") as archive:
        try:
            raw = archive.read("manifest.json")
        except KeyError as exc:
            raise BackupError("El respaldo no contiene manifest.json.") from exc
    return json.loads(raw.decode("utf-8"))


def list_backups() -> list[dict[str, Any]]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    items = []
    for path in BACKUP_DIR.glob("SIGA_backup_*.zip"):
        try:
            metadata_file = _metadata_path(path)
            if metadata_file.is_file():
                metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
                metadata["size_bytes"] = path.stat().st_size
            else:
                manifest = _read_manifest(path)
                metadata = _human_metadata(path, manifest, _sha256(path))
                metadata["integrity"] = "not_verified"
            items.append(metadata)
        except Exception:
            items.append({
                "filename": path.name,
                "created_at": datetime.fromtimestamp(
                    path.stat().st_mtime, timezone.utc
                ).isoformat(),
                "size_bytes": path.stat().st_size,
                "integrity": "invalid",
            })
    return sorted(items, key=lambda item: item.get("created_at") or "", reverse=True)


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, "true" if default else "false").strip().lower() in {
        "1", "true", "yes", "on",
    }


def _retention_limits() -> dict[str, int]:
    return {
        "DAILY": int(os.getenv("SYSTEM_BACKUP_KEEP_DAILY", "30")),
        "WEEKLY": int(os.getenv("SYSTEM_BACKUP_KEEP_WEEKLY", "12")),
        "MONTHLY": int(os.getenv("SYSTEM_BACKUP_KEEP_MONTHLY", "24")),
    }


def apply_retention_policy() -> list[str]:
    """Elimina únicamente copias automáticas que exceden la política.

    Las copias MANUAL y TERM nunca se eliminan automáticamente.
    """
    removed: list[str] = []
    limits = _retention_limits()
    items = list_backups()
    for backup_type, keep in limits.items():
        candidates = [item for item in items if item.get("backup_type") == backup_type]
        for item in candidates[max(0, keep):]:
            try:
                delete_backup(item["filename"])
                removed.append(item["filename"])
            except FileNotFoundError:
                continue
    return removed


def _automatic_type(now: datetime) -> str:
    if now.day == 1:
        return "MONTHLY"
    if now.weekday() == 6:
        return "WEEKLY"
    return "DAILY"


def _last_automatic_backup() -> dict[str, Any] | None:
    return next(
        (item for item in list_backups() if item.get("source") == "SCHEDULED"),
        None,
    )


def get_backup_policy_status() -> dict[str, Any]:
    now = datetime.now(BACKUP_TIMEZONE)
    hour = int(os.getenv("SYSTEM_BACKUP_HOUR", "2"))
    minute = int(os.getenv("SYSTEM_BACKUP_MINUTE", "0"))
    last = _last_automatic_backup()
    last_local = None
    if last and last.get("created_at"):
        last_local = datetime.fromisoformat(last["created_at"]).astimezone(BACKUP_TIMEZONE)
    scheduled_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    overdue = bool(
        _env_bool("SYSTEM_BACKUP_AUTO_ENABLED", True)
        and now >= scheduled_today
        and (not last_local or last_local.date() < now.date())
    )
    return {
        "enabled": _env_bool("SYSTEM_BACKUP_AUTO_ENABLED", True),
        "timezone": str(BACKUP_TIMEZONE),
        "schedule": f"{hour:02d}:{minute:02d}",
        "next_type": _automatic_type(now),
        "last_automatic": last,
        "overdue": overdue,
        "retention": _retention_limits(),
        "term_retention": "INDEFINITE",
        "persistent_storage": _env_bool("SYSTEM_BACKUP_STORAGE_PERSISTENT", False),
        "offsite_copy": _env_bool("SYSTEM_BACKUP_OFFSITE_CONFIGURED", False),
        "rpo_target_minutes": int(os.getenv("SYSTEM_BACKUP_RPO_MINUTES", "1440")),
    }


def run_scheduled_backup_if_due(force: bool = False) -> dict[str, Any] | None:
    policy = get_backup_policy_status()
    if not policy["enabled"] and not force:
        return None
    now = datetime.now(BACKUP_TIMEZONE)
    hour, minute = (int(part) for part in policy["schedule"].split(":"))
    scheduled_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    last = policy["last_automatic"]
    if not force:
        if now < scheduled_today:
            return None
        if last and datetime.fromisoformat(last["created_at"]).astimezone(BACKUP_TIMEZONE).date() >= now.date():
            return None
    result = create_backup(_automatic_type(now), source="SCHEDULED")
    result["retention_removed"] = apply_retention_policy()
    return result


def _scheduler_loop() -> None:
    initial_delay = int(os.getenv("SYSTEM_BACKUP_STARTUP_DELAY_SECONDS", "60"))
    if _SCHEDULER_STOP.wait(max(0, initial_delay)):
        return
    interval = max(300, int(os.getenv("SYSTEM_BACKUP_CHECK_INTERVAL_SECONDS", "3600")))
    while not _SCHEDULER_STOP.is_set():
        try:
            run_scheduled_backup_if_due()
        except Exception as exc:
            print(f"Respaldos automaticos: {exc}")
        _SCHEDULER_STOP.wait(interval)


def start_backup_scheduler() -> None:
    global _SCHEDULER_THREAD
    if not _env_bool("SYSTEM_BACKUP_AUTO_ENABLED", True):
        print("Respaldos automaticos: desactivados.")
        return
    if _SCHEDULER_THREAD and _SCHEDULER_THREAD.is_alive():
        return
    _SCHEDULER_STOP.clear()
    _SCHEDULER_THREAD = threading.Thread(
        target=_scheduler_loop, name="siga-backup-scheduler", daemon=True,
    )
    _SCHEDULER_THREAD.start()
    print("Respaldos automaticos: programador iniciado.")


def stop_backup_scheduler() -> None:
    _SCHEDULER_STOP.set()
    if _SCHEDULER_THREAD and _SCHEDULER_THREAD.is_alive():
        _SCHEDULER_THREAD.join(timeout=2)


def verify_backup(filename: str) -> dict[str, Any]:
    backup_path = _safe_backup_path(filename)
    archive_sha256 = _sha256(backup_path)

    with zipfile.ZipFile(backup_path, "r") as archive:
        bad_file = archive.testzip()
        if bad_file:
            raise BackupError(f"Archivo ZIP danado: {bad_file}")

        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        names = set(archive.namelist())
        checked = 0
        for item in manifest.get("files", []):
            path = item.get("path")
            if not path or path not in names:
                raise BackupError(f"Falta el archivo requerido: {path}")
            digest = hashlib.sha256()
            with archive.open(path, "r") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != item.get("sha256"):
                raise BackupError(f"Checksum incorrecto: {path}")
            checked += 1

    metadata = _human_metadata(backup_path, manifest, archive_sha256)
    metadata["checked_files"] = checked
    _metadata_path(backup_path).write_text(
        json.dumps(metadata, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    return metadata


def delete_backup(filename: str) -> None:
    backup_path = _safe_backup_path(filename)
    backup_path.unlink()
    metadata_path = _metadata_path(backup_path)
    if metadata_path.exists():
        metadata_path.unlink()


def get_backup_path(filename: str) -> Path:
    return _safe_backup_path(filename)
