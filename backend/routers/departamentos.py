from __future__ import annotations

import datetime
import io
import re
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_roles
from models.departamento import Departamento
from models.usuario import Usuario
from models.usuario_permiso import UsuarioPermiso
from services.auditoria import registrar as _audit, Accion, Recurso
from models.usuario import RolUsuario, Usuario
from services.user_permissions import (
    PERM_COMUNICADOS_WRITE,
    PERM_INVENTARIO_VALIDATE,
    PERM_INVENTARIO_WRITE,
    es_responsable_departamento,
)

router = APIRouter(prefix="/departamentos", tags=["Departamentos"])


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _normalizar_clave(valor: str) -> str:
    clave = re.sub(r"[^A-Za-z0-9_-]+", "-", valor.strip().upper()).strip("-")
    return clave[:30] or "DEP"


def _serializar(dep: Departamento) -> dict:
    resp = dep.responsable
    return {
        "id": dep.id,
        "nombre": dep.nombre,
        "clave": dep.clave,
        "descripcion": dep.descripcion,
        "activo": dep.activo,
        "responsable_id": dep.responsable_id,
        "responsable_nombre": resp.nombre if resp else None,
        "responsable_email": resp.email if resp else None,
        "responsable_rol": resp.rol.value if resp else None,
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
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
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
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un departamento con ese nombre o clave")
    db.refresh(dep)
    _audit(db, accion=Accion.CREAR_DEPARTAMENTO, recurso=Recurso.DEPARTAMENTO,
           usuario=current_user, recurso_id=dep.id,
           detalle={"nombre": dep.nombre, "clave": dep.clave})
    return _serializar(dep)


@router.put("/{departamento_id}", summary="Editar departamento")
def editar_departamento(
    departamento_id: int,
    data: DepartamentoIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
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
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un departamento con ese nombre o clave")
    db.refresh(dep)
    _audit(db, accion=Accion.EDITAR_DEPARTAMENTO, recurso=Recurso.DEPARTAMENTO,
           usuario=current_user, recurso_id=dep.id,
           detalle={"nombre": dep.nombre, "clave": dep.clave})
    return _serializar(dep)


@router.delete("/{departamento_id}", summary="Desactivar departamento")
def desactivar_departamento(
    departamento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    dep = db.query(Departamento).filter(Departamento.id == departamento_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    dep.activo = False
    dep.actualizado_en = _utcnow()
    db.commit()
    _audit(db, accion=Accion.DESACTIVAR_DEPARTAMENTO, recurso=Recurso.DEPARTAMENTO,
           usuario=current_user, recurso_id=departamento_id,
           detalle={"nombre": dep.nombre, "clave": dep.clave})
    return {"ok": True, "mensaje": f"Departamento '{dep.nombre}' desactivado"}


class ResponsableIn(BaseModel):
    responsable_id: Optional[int] = None   # None = quitar responsable


PERMISOS_DEPARTAMENTO = {
    PERM_COMUNICADOS_WRITE,
    PERM_INVENTARIO_WRITE,
    PERM_INVENTARIO_VALIDATE,
}


class PermisoDepartamentoIn(BaseModel):
    usuario_id: int
    permiso: str = PERM_COMUNICADOS_WRITE
    activo: bool


def _puede_administrar_permisos_departamento(dep: Departamento, usuario: Usuario) -> bool:
    return usuario.rol == RolUsuario.SUPER_ADMIN or dep.responsable_id == usuario.id


def _serializar_usuario_departamento(db: Session, u: Usuario, departamento_id: int) -> dict:
    permisos_activos = {
        row[0]
        for row in db.query(UsuarioPermiso.permiso).filter(
            UsuarioPermiso.usuario_id == u.id,
            UsuarioPermiso.departamento_id == departamento_id,
            UsuarioPermiso.permiso.in_(PERMISOS_DEPARTAMENTO),
            UsuarioPermiso.activo == True,
        ).all()
    }
    es_responsable = es_responsable_departamento(db, u, departamento_id)
    puede_comunicados = PERM_COMUNICADOS_WRITE in permisos_activos or es_responsable
    puede_inventario = PERM_INVENTARIO_WRITE in permisos_activos or es_responsable
    puede_validar_inventario = PERM_INVENTARIO_VALIDATE in permisos_activos
    return {
        "id": u.id,
        "nombre": u.nombre,
        "email": u.email,
        "rol": u.rol.value,
        "departamento_id": u.departamento_id,
        "es_responsable": es_responsable,
        "permisos_departamento": {
            PERM_COMUNICADOS_WRITE: puede_comunicados,
            PERM_INVENTARIO_WRITE: puede_inventario,
            PERM_INVENTARIO_VALIDATE: puede_validar_inventario,
        },
        "puede_enviar_comunicados": puede_comunicados,
        "puede_gestionar_inventario": puede_inventario,
        "puede_validar_inventario": puede_validar_inventario,
    }


def _upsert_permiso_departamento(
    db: Session,
    usuario: Usuario,
    departamento_id: int,
    permiso_nombre: str,
    activo: bool,
    otorgado_por_id: int,
):
    permiso = db.query(UsuarioPermiso).filter(
        UsuarioPermiso.usuario_id == usuario.id,
        UsuarioPermiso.departamento_id == departamento_id,
        UsuarioPermiso.permiso == permiso_nombre,
    ).first()
    now = _utcnow()
    if permiso:
        permiso.activo = activo
        permiso.otorgado_por_id = otorgado_por_id if activo else permiso.otorgado_por_id
        permiso.actualizado_en = now
        return permiso
    permiso = UsuarioPermiso(
        usuario_id=usuario.id,
        permiso=permiso_nombre,
        departamento_id=departamento_id,
        activo=activo,
        otorgado_por_id=otorgado_por_id if activo else None,
        creado_en=now,
        actualizado_en=now,
    )
    db.add(permiso)
    return permiso


@router.patch("/{departamento_id}/responsable", summary="Asignar o quitar responsable del departamento")
def asignar_responsable(
    departamento_id: int,
    data: ResponsableIn,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    dep = db.query(Departamento).filter(Departamento.id == departamento_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    if data.responsable_id is not None:
        usuario = db.query(Usuario).filter(Usuario.id == data.responsable_id, Usuario.activo == True).first()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado o inactivo")
    dep.responsable_id = data.responsable_id
    dep.actualizado_en = _utcnow()
    db.commit()
    db.refresh(dep)
    return _serializar(dep)


@router.get("/{departamento_id}/usuarios", summary="Usuarios del departamento")
def usuarios_departamento(
    departamento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    dep = db.query(Departamento).filter(Departamento.id == departamento_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    if current_user.rol not in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN) and dep.responsable_id != current_user.id:
        raise HTTPException(status_code=403, detail="No puedes consultar usuarios de este departamento")
    usuarios = db.query(Usuario).filter(
        Usuario.departamento_id == departamento_id,
        Usuario.activo == True,
    ).order_by(Usuario.nombre).all()
    return [_serializar_usuario_departamento(db, u, departamento_id) for u in usuarios]


@router.patch("/{departamento_id}/permisos", summary="Activar permisos departamentales")
def actualizar_permiso_departamental(
    departamento_id: int,
    data: PermisoDepartamentoIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    dep = db.query(Departamento).filter(Departamento.id == departamento_id, Departamento.activo == True).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    if not _puede_administrar_permisos_departamento(dep, current_user):
        raise HTTPException(status_code=403, detail="Solo el responsable del departamento o Super Admin puede cambiar permisos")
    if data.permiso not in PERMISOS_DEPARTAMENTO:
        raise HTTPException(status_code=422, detail="Permiso departamental invalido")

    usuario = db.query(Usuario).filter(
        Usuario.id == data.usuario_id,
        Usuario.departamento_id == departamento_id,
        Usuario.activo == True,
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en este departamento")
    if dep.responsable_id == usuario.id and data.permiso != PERM_INVENTARIO_VALIDATE and not data.activo:
        raise HTTPException(status_code=400, detail="El responsable del departamento siempre conserva sus permisos")

    _upsert_permiso_departamento(
        db,
        usuario,
        departamento_id,
        data.permiso,
        data.activo,
        current_user.id,
    )
    db.commit()
    return _serializar_usuario_departamento(db, usuario, departamento_id)


@router.patch("/{departamento_id}/permisos/comunicados", summary="Activar permiso para enviar comunicados")
def actualizar_permiso_comunicados(
    departamento_id: int,
    data: PermisoDepartamentoIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    data.permiso = PERM_COMUNICADOS_WRITE
    return actualizar_permiso_departamental(departamento_id, data, db, current_user)


_ROLES_RESPONSABLE = (
    RolUsuario.SUPER_ADMIN,
    RolUsuario.LAB_ADMIN,
    RolUsuario.ADMINISTRATIVO,
)


@router.get("/usuarios/buscar", summary="Buscar usuarios para asignar como responsable")
def buscar_usuarios(
    q: str = "",
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    query = db.query(Usuario).filter(
        Usuario.activo == True,
        Usuario.rol.in_(_ROLES_RESPONSABLE),
    )
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(Usuario.nombre.ilike(term), Usuario.email.ilike(term))
        )
    return [
        {"id": u.id, "nombre": u.nombre, "email": u.email, "rol": u.rol.value,
         "departamento_id": u.departamento_id}
        for u in query.order_by(Usuario.nombre).limit(20).all()
    ]


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
