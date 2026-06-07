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

from sqlalchemy import text
from sqlalchemy.engine import make_url

from database import DATABASE_URL, SessionLocal


DATA_DIR = Path(os.getenv("SYSTEM_DATA_DIR", "data")).resolve()
BACKUP_DIR = Path(os.getenv("SYSTEM_BACKUP_DIR", "data/system_backups")).resolve()
MIN_FREE_MB = int(os.getenv("SYSTEM_BACKUP_MIN_FREE_MB", "500"))
_BACKUP_LOCK = threading.Lock()


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


def create_backup() -> dict[str, Any]:
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
        filename = f"SIGA_backup_{created_at:%Y%m%d_%H%M%S}_{suffix}.zip"
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
            for source, archive_name in data_files:
                payload.append({
                    "path": archive_name,
                    "size_bytes": source.stat().st_size,
                    "sha256": _sha256(source),
                })

            manifest = {
                "format_version": 1,
                "system": "SIGA UTECAN",
                "created_at": created_at.isoformat(),
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
                for source, archive_name in data_files:
                    archive.write(source, archive_name)
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
