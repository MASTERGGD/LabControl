"""
routers/comunicados.py — Módulo de Comunicados Institucionales

Endpoints usuario:
  GET  /comunicados/mis-comunicados        — comunicados activos para el usuario actual
  GET  /comunicados/pendientes-count       — conteo de no leídos
  POST /comunicados/{id}/leer              — marcar como leído
  POST /comunicados/{id}/confirmar         — confirmar lectura (cuando requiere_confirmacion)

Endpoints admin (SUPER_ADMIN / LAB_ADMIN):
  GET    /comunicados                      — listado completo
  POST   /comunicados                      — crear
  GET    /comunicados/{id}                 — detalle
  PUT    /comunicados/{id}                 — editar
  DELETE /comunicados/{id}                 — eliminar (solo BORRADOR)
  POST   /comunicados/{id}/publicar        — publicar
  POST   /comunicados/{id}/archivar        — archivar
  GET    /comunicados/{id}/lecturas        — reporte de lecturas
"""
from __future__ import annotations

import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_roles
from models.comunicado import (
    Comunicado, ComunicadoDestinatario, ComunicadoLectura,
    CategoriaComunicado, EstadoComunicado, PrioridadComunicado, TipoDestinatario,
)
from models.departamento import Departamento
from models.usuario import RolUsuario, Usuario
from services.auditoria import registrar

router = APIRouter(prefix="/comunicados", tags=["Comunicados"])

ROLES_ADMIN = [RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.ADMINISTRATIVO]

# ─── Helpers ───────────────────────────────────────────────────────────────────

def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _comunicado_aplica_a(comunicado: Comunicado, usuario: Usuario) -> bool:
    """True si el comunicado está dirigido al usuario según sus destinatarios."""
    for dest in comunicado.destinatarios:
        if dest.tipo_destinatario == TipoDestinatario.TODOS:
            return True
        if dest.tipo_destinatario == TipoDestinatario.ROL and dest.destinatario_ref == usuario.rol.value:
            return True
        if dest.tipo_destinatario == TipoDestinatario.USUARIO and dest.destinatario_ref == str(usuario.id):
            return True
        if (
            dest.tipo_destinatario == TipoDestinatario.DEPARTAMENTO
            and usuario.departamento_id
            and dest.destinatario_ref == str(usuario.departamento_id)
        ):
            return True
    return False


def _esta_activo(c: Comunicado) -> bool:
    now = _utcnow()
    if c.estado != EstadoComunicado.PUBLICADO:
        return False
    if c.fecha_publicacion and c.fecha_publicacion > now:
        return False
    if c.fecha_expiracion and c.fecha_expiracion <= now:
        return False
    return True


def _serializar(c: Comunicado, lectura: ComunicadoLectura | None = None) -> dict:
    return {
        "id":                    c.id,
        "titulo":                c.titulo,
        "contenido":             c.contenido,
        "categoria":             c.categoria,
        "prioridad":             c.prioridad,
        "estado":                c.estado,
        "requiere_confirmacion": c.requiere_confirmacion,
        "area_emisora":          c.area_emisora,
        "departamento_emisor_id": c.departamento_emisor_id,
        "departamento_emisor_nombre": c.departamento_emisor.nombre if c.departamento_emisor else None,
        "fecha_publicacion":     c.fecha_publicacion.isoformat() if c.fecha_publicacion else None,
        "fecha_expiracion":      c.fecha_expiracion.isoformat() if c.fecha_expiracion else None,
        "autor_id":              c.autor_id,
        "autor_nombre":          c.autor.nombre if c.autor else "Sistema",
        "creado_en":             c.creado_en.isoformat() if c.creado_en else None,
        "actualizado_en":        c.actualizado_en.isoformat() if c.actualizado_en else None,
        "destinatarios":         [
            {"tipo": d.tipo_destinatario, "ref": d.destinatario_ref}
            for d in c.destinatarios
        ],
        # campos de lectura
        "leido":       lectura is not None and lectura.leido_en is not None,
        "confirmado":  lectura is not None and lectura.confirmado_en is not None,
        "leido_en":    lectura.leido_en.isoformat() if lectura and lectura.leido_en else None,
        "confirmado_en": lectura.confirmado_en.isoformat() if lectura and lectura.confirmado_en else None,
    }


def _get_lectura(db: Session, comunicado_id: int, usuario_id: int) -> ComunicadoLectura | None:
    return db.query(ComunicadoLectura).filter_by(
        comunicado_id=comunicado_id, usuario_id=usuario_id
    ).first()


def _ensure_lectura(db: Session, comunicado_id: int, usuario_id: int) -> ComunicadoLectura:
    lec = _get_lectura(db, comunicado_id, usuario_id)
    if not lec:
        lec = ComunicadoLectura(comunicado_id=comunicado_id, usuario_id=usuario_id)
        db.add(lec)
        db.flush()
    return lec


# ─── Schemas Pydantic ──────────────────────────────────────────────────────────

class DestinatarioIn(BaseModel):
    tipo: str          # TODOS | ROL | USUARIO | DEPARTAMENTO
    ref:  Optional[str] = None


class ComunicadoCreate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    titulo:                str
    contenido:             str
    categoria:             str = "GENERAL"
    prioridad:             str = "INFORMATIVO"
    requiere_confirmacion: bool = False
    area_emisora:          Optional[str] = None
    departamento_emisor_id: Optional[int] = None
    fecha_publicacion:     Optional[datetime.datetime] = None
    fecha_expiracion:      Optional[datetime.datetime] = None
    destinatarios:         List[DestinatarioIn] = []


class ComunicadoUpdate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    titulo:                Optional[str] = None
    contenido:             Optional[str] = None
    categoria:             Optional[str] = None
    prioridad:             Optional[str] = None
    requiere_confirmacion: Optional[bool] = None
    area_emisora:          Optional[str] = None
    departamento_emisor_id: Optional[int] = None
    fecha_publicacion:     Optional[datetime.datetime] = None
    fecha_expiracion:      Optional[datetime.datetime] = None
    destinatarios:         Optional[List[DestinatarioIn]] = None


# ─── Endpoints usuario ─────────────────────────────────────────────────────────

@router.get("/pendientes-count")
def get_pendientes_count(
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Conteo de comunicados activos no leídos para el usuario actual."""
    todos = db.query(Comunicado).all()
    count = 0
    for c in todos:
        if not _esta_activo(c):
            continue
        if not _comunicado_aplica_a(c, usuario):
            continue
        lec = _get_lectura(db, c.id, usuario.id)
        if lec is None or lec.leido_en is None:
            count += 1
    return {"pendientes": count}


@router.get("/mis-comunicados")
def get_mis_comunicados(
    solo_pendientes: bool = Query(False),
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Comunicados activos del usuario, con estado de lectura."""
    todos = (
        db.query(Comunicado)
        .filter(Comunicado.estado == EstadoComunicado.PUBLICADO)
        .order_by(
            Comunicado.prioridad.desc(),   # URGENTE primero
            Comunicado.fecha_publicacion.desc(),
        )
        .all()
    )
    resultado = []
    for c in todos:
        if not _esta_activo(c):
            continue
        if not _comunicado_aplica_a(c, usuario):
            continue
        lec = _get_lectura(db, c.id, usuario.id)
        if solo_pendientes and lec and lec.leido_en:
            continue
        resultado.append(_serializar(c, lec))
    return resultado


@router.post("/{comunicado_id}/leer", status_code=status.HTTP_200_OK)
def marcar_leido(
    comunicado_id: int,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if not _esta_activo(c):
        raise HTTPException(400, "El comunicado no está activo")
    if not _comunicado_aplica_a(c, usuario):
        raise HTTPException(403, "No tienes acceso a este comunicado")

    lec = _ensure_lectura(db, comunicado_id, usuario.id)
    if not lec.leido_en:
        lec.leido_en = _utcnow()
    db.commit()
    return {"ok": True}


@router.post("/{comunicado_id}/confirmar", status_code=status.HTTP_200_OK)
def confirmar_lectura(
    comunicado_id: int,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if not c.requiere_confirmacion:
        raise HTTPException(400, "Este comunicado no requiere confirmación")
    if not _comunicado_aplica_a(c, usuario):
        raise HTTPException(403, "No tienes acceso a este comunicado")

    lec = _ensure_lectura(db, comunicado_id, usuario.id)
    now = _utcnow()
    if not lec.leido_en:
        lec.leido_en = now
    if not lec.confirmado_en:
        lec.confirmado_en = now
    db.commit()
    return {"ok": True}


# ─── Endpoints admin ───────────────────────────────────────────────────────────

@router.get("")
def listar_comunicados(
    estado:    Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    db:        Session = Depends(get_db),
    usuario:   Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    q = db.query(Comunicado)
    if usuario.rol == RolUsuario.ADMINISTRATIVO:
        if not usuario.departamento_id:
            return []
        q = q.filter(Comunicado.departamento_emisor_id == usuario.departamento_id)
    if estado:
        q = q.filter(Comunicado.estado == estado)
    if categoria:
        q = q.filter(Comunicado.categoria == categoria)
    comunicados = q.order_by(Comunicado.creado_en.desc()).all()
    return [_serializar(c) for c in comunicados]


@router.post("", status_code=status.HTTP_201_CREATED)
def crear_comunicado(
    body:    ComunicadoCreate,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    departamento_emisor_id = body.departamento_emisor_id
    if usuario.rol == RolUsuario.ADMINISTRATIVO:
        if not usuario.departamento_id:
            raise HTTPException(403, "Tu usuario administrativo no tiene departamento asignado")
        departamento_emisor_id = usuario.departamento_id
    if departamento_emisor_id:
        dep = db.query(Departamento).filter(Departamento.id == departamento_emisor_id, Departamento.activo == True).first()
        if not dep:
            raise HTTPException(404, "Departamento emisor no encontrado o inactivo")

    c = Comunicado(
        titulo=body.titulo,
        contenido=body.contenido,
        categoria=body.categoria,
        prioridad=body.prioridad,
        estado=EstadoComunicado.BORRADOR,
        requiere_confirmacion=body.requiere_confirmacion,
        area_emisora=body.area_emisora,
        departamento_emisor_id=departamento_emisor_id,
        fecha_publicacion=body.fecha_publicacion,
        fecha_expiracion=body.fecha_expiracion,
        autor_id=usuario.id,
        creado_en=_utcnow(),
        actualizado_en=_utcnow(),
    )
    db.add(c)
    db.flush()

    for dest in body.destinatarios:
        db.add(ComunicadoDestinatario(
            comunicado_id=c.id,
            tipo_destinatario=dest.tipo,
            destinatario_ref=dest.ref,
        ))

    db.commit()
    db.refresh(c)
    registrar(db, usuario.id, "CREAR_COMUNICADO",
              f"Comunicado #{c.id} '{c.titulo}' creado")
    return _serializar(c)


@router.get("/{comunicado_id}")
def get_comunicado(
    comunicado_id: int,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if usuario.rol == RolUsuario.ADMINISTRATIVO and c.departamento_emisor_id != usuario.departamento_id:
        raise HTTPException(403, "No tienes acceso a este comunicado")
    return _serializar(c)


@router.put("/{comunicado_id}")
def editar_comunicado(
    comunicado_id: int,
    body:    ComunicadoUpdate,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if usuario.rol == RolUsuario.ADMINISTRATIVO and c.departamento_emisor_id != usuario.departamento_id:
        raise HTTPException(403, "No puedes editar comunicados de otro departamento")
    if c.estado == EstadoComunicado.ARCHIVADO:
        raise HTTPException(400, "No se puede editar un comunicado archivado")

    for field, val in body.model_dump(exclude_none=True).items():
        if field == "destinatarios":
            continue
        if field == "departamento_emisor_id":
            if usuario.rol == RolUsuario.ADMINISTRATIVO:
                val = usuario.departamento_id
            elif val and not db.query(Departamento).filter(Departamento.id == val, Departamento.activo == True).first():
                raise HTTPException(404, "Departamento emisor no encontrado o inactivo")
        setattr(c, field, val)

    if body.destinatarios is not None:
        # Reemplazar destinatarios
        for d in c.destinatarios:
            db.delete(d)
        db.flush()
        for dest in body.destinatarios:
            db.add(ComunicadoDestinatario(
                comunicado_id=c.id,
                tipo_destinatario=dest.tipo,
                destinatario_ref=dest.ref,
            ))

    c.actualizado_en = _utcnow()
    db.commit()
    db.refresh(c)
    registrar(db, usuario.id, "EDITAR_COMUNICADO",
              f"Comunicado #{c.id} editado")
    return _serializar(c)


@router.delete("/{comunicado_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_comunicado(
    comunicado_id: int,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if usuario.rol == RolUsuario.ADMINISTRATIVO and c.departamento_emisor_id != usuario.departamento_id:
        raise HTTPException(403, "No puedes publicar comunicados de otro departamento")
    if c.estado == EstadoComunicado.PUBLICADO:
        raise HTTPException(400, "Archiva el comunicado antes de eliminarlo")
    registrar(db, usuario.id, "ELIMINAR_COMUNICADO",
              f"Comunicado #{c.id} '{c.titulo}' eliminado")
    db.delete(c)
    db.commit()


@router.post("/{comunicado_id}/publicar")
def publicar_comunicado(
    comunicado_id: int,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if usuario.rol == RolUsuario.ADMINISTRATIVO and c.departamento_emisor_id != usuario.departamento_id:
        raise HTTPException(403, "No puedes archivar comunicados de otro departamento")
    if c.estado == EstadoComunicado.PUBLICADO:
        raise HTTPException(400, "Ya está publicado")
    if not c.destinatarios:
        raise HTTPException(400, "Define al menos un destinatario antes de publicar")

    c.estado = EstadoComunicado.PUBLICADO
    if not c.fecha_publicacion:
        c.fecha_publicacion = _utcnow()
    c.actualizado_en = _utcnow()
    db.commit()
    registrar(db, usuario.id, "PUBLICAR_COMUNICADO",
              f"Comunicado #{c.id} '{c.titulo}' publicado")
    return _serializar(c)


@router.post("/{comunicado_id}/archivar")
def archivar_comunicado(
    comunicado_id: int,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if usuario.rol == RolUsuario.ADMINISTRATIVO and c.departamento_emisor_id != usuario.departamento_id:
        raise HTTPException(403, "No tienes acceso al reporte de este comunicado")
    c.estado = EstadoComunicado.ARCHIVADO
    c.actualizado_en = _utcnow()
    db.commit()
    registrar(db, usuario.id, "ARCHIVAR_COMUNICADO",
              f"Comunicado #{c.id} '{c.titulo}' archivado")
    return _serializar(c)


@router.get("/{comunicado_id}/lecturas")
def get_lecturas(
    comunicado_id: int,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    """Reporte de quién leyó / está pendiente."""
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")

    # Todos los usuarios que aplican
    todos_usuarios = db.query(Usuario).filter(Usuario.activo == True).all()
    aplican = [u for u in todos_usuarios if _comunicado_aplica_a(c, u)]

    resultado = []
    for u in aplican:
        lec = _get_lectura(db, comunicado_id, u.id)
        resultado.append({
            "usuario_id":    u.id,
            "nombre":        u.nombre,
            "email":         u.email,
            "rol":           u.rol.value,
            "leido":         lec is not None and lec.leido_en is not None,
            "confirmado":    lec is not None and lec.confirmado_en is not None,
            "leido_en":      lec.leido_en.isoformat() if lec and lec.leido_en else None,
            "confirmado_en": lec.confirmado_en.isoformat() if lec and lec.confirmado_en else None,
        })

    leidos    = sum(1 for r in resultado if r["leido"])
    pendientes = len(resultado) - leidos
    return {
        "comunicado_id": comunicado_id,
        "titulo":        c.titulo,
        "total":         len(resultado),
        "leidos":        leidos,
        "pendientes":    pendientes,
        "detalle":       resultado,
    }
