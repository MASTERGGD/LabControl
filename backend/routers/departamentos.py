from __future__ import annotations

import datetime
import io
import re
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_roles
from models.departamento import Departamento
from models.usuario import RolUsuario, Usuario

router = APIRouter(prefix="/departamentos", tags=["Departamentos"])


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _normalizar_clave(valor: str) -> str:
    clave = re.sub(r"[^A-Za-z0-9_-]+", "-", valor.strip().upper()).strip("-")
    return clave[:30] or "DEP"


def _serializar(dep: Departamento) -> dict:
    return {
        "id": dep.id,
        "nombre": dep.nombre,
        "clave": dep.clave,
        "descripcion": dep.descripcion,
        "activo": dep.activo,
        "creado_en": dep.creado_en.isoformat() if dep.creado_en else None,
        "actualizado_en": dep.actualizado_en.isoformat() if dep.actualizado_en else None,
    }


class DepartamentoIn(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=150)
    clave: Optional[str] = Field(None, max_length=30)
    descripcion: Optional[str] = Field(None, max_length=300)
    activo: bool = True


class DepartamentoOut(DepartamentoIn):
    id: int
    creado_en: Optional[str] = None
    actualizado_en: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


def _validar_unicos(db: Session, nombre: str, clave: str, dep_id: int | None = None):
    q = db.query(Departamento).filter(
        or_(
            func.lower(Departamento.nombre) == nombre.lower(),
            func.lower(Departamento.clave) == clave.lower(),
        )
    )
    if dep_id:
        q = q.filter(Departamento.id != dep_id)
    existente = q.first()
    if existente:
        raise HTTPException(status_code=409, detail="Ya existe un departamento con ese nombre o clave")


@router.get("", summary="Listar departamentos")
def listar_departamentos(
    activo: Optional[bool] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(
        RolUsuario.SUPER_ADMIN,
        RolUsuario.LAB_ADMIN,
        RolUsuario.ADMINISTRATIVO,
        RolUsuario.DOCENTE,
    )),
):
    query = db.query(Departamento)
    if activo is not None:
        query = query.filter(Departamento.activo == activo)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Departamento.nombre.ilike(like), Departamento.clave.ilike(like)))
    return [_serializar(dep) for dep in query.order_by(Departamento.nombre).all()]


@router.post("", status_code=status.HTTP_201_CREATED, summary="Crear departamento")
def crear_departamento(
    data: DepartamentoIn,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    clave = _normalizar_clave(data.clave or data.nombre)
    _validar_unicos(db, data.nombre.strip(), clave)
    dep = Departamento(
        nombre=data.nombre.strip(),
        clave=clave,
        descripcion=data.descripcion.strip() if data.descripcion else None,
        activo=data.activo,
        creado_en=_utcnow(),
        actualizado_en=_utcnow(),
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return _serializar(dep)


@router.put("/{departamento_id}", summary="Editar departamento")
def editar_departamento(
    departamento_id: int,
    data: DepartamentoIn,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    dep = db.query(Departamento).filter(Departamento.id == departamento_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    clave = _normalizar_clave(data.clave or data.nombre)
    _validar_unicos(db, data.nombre.strip(), clave, departamento_id)
    dep.nombre = data.nombre.strip()
    dep.clave = clave
    dep.descripcion = data.descripcion.strip() if data.descripcion else None
    dep.activo = data.activo
    dep.actualizado_en = _utcnow()
    db.commit()
    db.refresh(dep)
    return _serializar(dep)


@router.delete("/{departamento_id}", summary="Desactivar departamento")
def desactivar_departamento(
    departamento_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    dep = db.query(Departamento).filter(Departamento.id == departamento_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    dep.activo = False
    dep.actualizado_en = _utcnow()
    db.commit()
    return {"ok": True, "mensaje": f"Departamento '{dep.nombre}' desactivado"}


@router.post("/importar", status_code=status.HTTP_201_CREATED, summary="Importar departamentos desde Excel")
async def importar_departamentos(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=500, detail="pandas no disponible")

    if not archivo.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx o .xls")

    contenido = await archivo.read()
    try:
        df = pd.read_excel(io.BytesIO(contenido))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error al leer el Excel: {exc}")

    df.columns = [str(c).strip().lower() for c in df.columns]
    if "nombre" not in df.columns:
        raise HTTPException(status_code=422, detail="Columna requerida: nombre. Opcionales: clave, descripcion, activo")

    creados, actualizados, errores = [], [], []
    for i, row in df.iterrows():
        fila = i + 2
        nombre = str(row.get("nombre", "")).strip()
        if not nombre or nombre.lower() == "nan":
            errores.append({"fila": fila, "error": "nombre requerido"})
            continue
        clave = _normalizar_clave(str(row.get("clave", "")).strip() if "clave" in df.columns else nombre)
        descripcion = str(row.get("descripcion", "")).strip() if "descripcion" in df.columns else ""
        activo_raw = str(row.get("activo", "true")).strip().lower() if "activo" in df.columns else "true"
        activo = activo_raw not in ("false", "0", "no", "inactivo")

        dep = db.query(Departamento).filter(func.lower(Departamento.clave) == clave.lower()).first()
        if dep:
            dep.nombre = nombre
            dep.descripcion = descripcion if descripcion and descripcion.lower() != "nan" else None
            dep.activo = activo
            dep.actualizado_en = _utcnow()
            actualizados.append({"fila": fila, "nombre": nombre, "clave": clave})
        else:
            db.add(Departamento(
                nombre=nombre,
                clave=clave,
                descripcion=descripcion if descripcion and descripcion.lower() != "nan" else None,
                activo=activo,
                creado_en=_utcnow(),
                actualizado_en=_utcnow(),
            ))
            creados.append({"fila": fila, "nombre": nombre, "clave": clave})

    db.commit()
    return {
        "resumen": {"procesados": len(df), "creados": len(creados), "actualizados": len(actualizados), "errores": len(errores)},
        "creados": creados,
        "actualizados": actualizados,
        "errores": errores,
    }
