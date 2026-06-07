from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_roles
from models.usuario import RolUsuario, Usuario
from services.auditoria import Accion, Recurso, registrar
from services.system_backup import (
    BackupBusyError,
    BackupError,
    create_backup,
    delete_backup,
    get_backup_path,
    list_backups,
    verify_backup,
)
from services.system_health import get_system_health


router = APIRouter(prefix="/system", tags=["Sistema"])
_super_admin = require_roles(RolUsuario.SUPER_ADMIN)


@router.get("/health")
def system_health(_: Usuario = Depends(_super_admin)):
    return get_system_health(detailed=True)


@router.get("/backups")
def backups(_: Usuario = Depends(_super_admin)):
    return {"items": list_backups()}


@router.post("/backups", status_code=201)
def generate_backup(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_super_admin),
):
    try:
        result = create_backup()
    except BackupBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except BackupError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    registrar(
        db,
        Accion.GENERAR_RESPALDO,
        Recurso.SISTEMA,
        usuario=current_user,
        detalle={
            "archivo": result["filename"],
            "tamano_bytes": result["size_bytes"],
            "sha256": result["archive_sha256"],
        },
        request=request,
    )
    return result


@router.post("/backups/{filename}/verify")
def check_backup(
    filename: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_super_admin),
):
    try:
        result = verify_backup(filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Respaldo no encontrado.") from exc
    except (BackupError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    registrar(
        db,
        Accion.VERIFICAR_RESPALDO,
        Recurso.SISTEMA,
        usuario=current_user,
        detalle={"archivo": filename, "archivos_verificados": result["checked_files"]},
        request=request,
    )
    return result


@router.get("/backups/{filename}/download")
def download_backup(
    filename: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_super_admin),
):
    try:
        path = get_backup_path(filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Respaldo no encontrado.") from exc
    except BackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    registrar(
        db,
        Accion.DESCARGAR_RESPALDO,
        Recurso.SISTEMA,
        usuario=current_user,
        detalle={"archivo": filename},
        request=request,
    )
    return FileResponse(
        path,
        media_type="application/zip",
        filename=filename,
    )


@router.delete("/backups/{filename}", status_code=204)
def remove_backup(
    filename: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_super_admin),
):
    try:
        delete_backup(filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Respaldo no encontrado.") from exc
    except BackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    registrar(
        db,
        Accion.ELIMINAR_RESPALDO,
        Recurso.SISTEMA,
        usuario=current_user,
        detalle={"archivo": filename},
        request=request,
    )
