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
import hashlib
import json
import os
import shutil
import unicodedata
import uuid
import zipfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_roles
from models.comunicado import (
    Comunicado, ComunicadoAdjunto, ComunicadoDestinatario, ComunicadoLectura,
    ComunicadoRespaldo, ComunicadoRespuesta, ComunicadoRespuestaAdjunto,
    CategoriaComunicado, EstadoComunicado, PrioridadComunicado, TipoDestinatario,
)
from models.departamento import Departamento
from models.usuario import RolUsuario, Usuario
from services.auditoria import registrar

router = APIRouter(prefix="/comunicados", tags=["Comunicados"])

ROLES_ADMIN = [RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.ADMINISTRATIVO, RolUsuario.TUTORIA_ADMIN]
RESPALDOS_DIR = Path(os.getenv("COMUNICADOS_RESPALDOS_DIR", "data/comunicados_respaldos"))
ADJUNTOS_DIR = Path(os.getenv("COMUNICADOS_ADJUNTOS_DIR", "data/comunicados_adjuntos"))
MAX_ADJUNTO_BYTES = int(os.getenv("COMUNICADOS_MAX_ADJUNTO_MB", "5")) * 1024 * 1024
MAX_TOTAL_ADJUNTOS_BYTES = int(os.getenv("COMUNICADOS_MAX_TOTAL_ADJUNTOS_MB", "15")) * 1024 * 1024
MAX_ADJUNTOS_COMUNICADO = int(os.getenv("COMUNICADOS_MAX_ADJUNTOS", "5"))
ALLOWED_MIME = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

CATEGORIAS_COMUNICADOS = [
    {"value": "GENERAL", "label": "General", "color": "teal"},
    {"value": "URGENTE", "label": "Urgente", "color": "red"},
    {"value": "EVENTOS", "label": "Eventos institucionales", "color": "purple"},
    {"value": "ACADEMICO", "label": "Academico", "color": "blue"},
    {"value": "SERVICIOS_ESCOLARES", "label": "Servicios Escolares", "color": "cyan"},
    {"value": "TUTORIA", "label": "Tutoria", "color": "indigo"},
    {"value": "LABORATORIOS", "label": "Laboratorios / TI", "color": "sky"},
    {"value": "ADMINISTRATIVO", "label": "Administrativo", "color": "slate"},
    {"value": "RRHH", "label": "Recursos Humanos", "color": "pink"},
    {"value": "MANTENIMIENTO", "label": "Mantenimiento", "color": "orange"},
    {"value": "CONVOCATORIAS", "label": "Convocatorias", "color": "violet"},
    {"value": "BECAS", "label": "Becas y apoyos", "color": "emerald"},
    {"value": "CALENDARIO_ACADEMICO", "label": "Calendario academico", "color": "amber"},
    {"value": "SEGURIDAD", "label": "Seguridad / Proteccion Civil", "color": "rose"},
    {"value": "VINCULACION", "label": "Vinculacion", "color": "lime"},
]
CATEGORIA_VALUES = {c["value"] for c in CATEGORIAS_COMUNICADOS}
CATEGORIAS_TRANSVERSALES = {"GENERAL", "URGENTE", "EVENTOS"}
CATEGORIAS_POR_PROCESO = {
    "RH": {"RRHH", "ADMINISTRATIVO", "CONVOCATORIAS"},
    "TUTORIA": {"TUTORIA", "ACADEMICO"},
    "SERVICIOS_ESCOLARES": {"SERVICIOS_ESCOLARES", "BECAS", "CALENDARIO_ACADEMICO", "ACADEMICO"},
    "LABORATORIOS": {"LABORATORIOS", "MANTENIMIENTO", "SEGURIDAD"},
    "ACADEMICO": {"ACADEMICO", "CALENDARIO_ACADEMICO", "CONVOCATORIAS"},
    "MANTENIMIENTO": {"MANTENIMIENTO", "SEGURIDAD"},
    "ADMINISTRATIVO": {"ADMINISTRATIVO", "RRHH"},
    "VINCULACION": {"VINCULACION", "CONVOCATORIAS", "EVENTOS"},
}

# ─── Helpers ───────────────────────────────────────────────────────────────────

def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _normalizar_texto(valor: str | None) -> str:
    if not valor:
        return ""
    limpio = unicodedata.normalize("NFKD", valor)
    limpio = "".join(ch for ch in limpio if not unicodedata.combining(ch))
    return limpio.upper()


def _proceso_departamento(dep: Departamento | None) -> str | None:
    texto = _normalizar_texto(f"{dep.clave if dep else ''} {dep.nombre if dep else ''}")
    if any(k in texto for k in ("TUTOR", "PSICOPED")):
        return "TUTORIA"
    if any(k in texto for k in ("SERVICIOS ESCOLARES", "ESCOLAR", "CONTROL ESCOLAR")) or texto.strip() == "SE":
        return "SERVICIOS_ESCOLARES"
    if any(k in texto for k in ("LAB", "LABORATORIO", "TI", "SISTEM", "TECNOLOG")):
        return "LABORATORIOS"
    if any(k in texto for k in ("RECURSOS HUMANOS", "RRHH", "RH")):
        return "RH"
    if any(k in texto for k in ("MANTENIMIENTO", "SERVICIOS GENERALES", "INFRAESTRUCTURA")):
        return "MANTENIMIENTO"
    if any(k in texto for k in ("ACADEMIC", "DIRECCION ACADEMICA", "DOCENCIA")):
        return "ACADEMICO"
    if any(k in texto for k in ("VINCUL", "EXTENSION")):
        return "VINCULACION"
    if any(k in texto for k in ("ADMIN", "FINANZ", "CONTAB", "RECURSOS MATERIALES")):
        return "ADMINISTRATIVO"
    return None


def _categorias_por_proceso(proceso: str | None) -> set[str]:
    if not proceso:
        return set(CATEGORIA_VALUES)
    return CATEGORIAS_TRANSVERSALES | CATEGORIAS_POR_PROCESO.get(proceso, set())


def _categorias_permitidas(db: Session, usuario: Usuario, departamento_id: int | None = None) -> list[dict]:
    proceso = None
    dep = None
    if usuario.rol == RolUsuario.TUTORIA_ADMIN:
        proceso = "TUTORIA"
    elif usuario.rol == RolUsuario.ADMINISTRATIVO:
        dep = db.query(Departamento).filter(Departamento.id == usuario.departamento_id).first() if usuario.departamento_id else None
        proceso = _proceso_departamento(dep)
    elif departamento_id:
        dep = db.query(Departamento).filter(Departamento.id == departamento_id).first()
        proceso = _proceso_departamento(dep)
    elif usuario.rol == RolUsuario.LAB_ADMIN:
        proceso = "LABORATORIOS"

    permitidas = _categorias_por_proceso(proceso)
    return [c for c in CATEGORIAS_COMUNICADOS if c["value"] in permitidas]


def _validar_categoria_comunicado(
    db: Session,
    usuario: Usuario,
    categoria: str,
    departamento_emisor_id: int | None,
) -> None:
    if categoria not in CATEGORIA_VALUES:
        raise HTTPException(422, "Categoria de comunicado invalida")
    permitidas = {c["value"] for c in _categorias_permitidas(db, usuario, departamento_emisor_id)}
    if categoria not in permitidas:
        raise HTTPException(403, "La categoria no corresponde al departamento o proceso emisor")


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


def _get_respuesta_from_rel(c: Comunicado, usuario_id: int) -> ComunicadoRespuesta | None:
    for respuesta in c.respuestas:
        if respuesta.usuario_id == usuario_id:
            return respuesta
    return None


def _serializar(c: Comunicado, lectura: ComunicadoLectura | None = None) -> dict:
    respuesta = _get_respuesta_from_rel(c, lectura.usuario_id) if lectura else None
    return {
        "id":                    c.id,
        "titulo":                c.titulo,
        "contenido":             c.contenido,
        "categoria":             c.categoria,
        "prioridad":             c.prioridad,
        "estado":                c.estado,
        "requiere_confirmacion": c.requiere_confirmacion,
        "requiere_retroalimentacion": c.requiere_retroalimentacion,
        "fecha_limite_respuesta": c.fecha_limite_respuesta.isoformat() if c.fecha_limite_respuesta else None,
        "fijado":                c.fijado,
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
        "adjuntos":              [_serializar_adjunto(a) for a in c.adjuntos],
        "respuestas_total":      len(c.respuestas),
        # campos de lectura
        "leido":       lectura is not None and lectura.leido_en is not None,
        "confirmado":  lectura is not None and lectura.confirmado_en is not None,
        "leido_en":    lectura.leido_en.isoformat() if lectura and lectura.leido_en else None,
        "confirmado_en": lectura.confirmado_en.isoformat() if lectura and lectura.confirmado_en else None,
        "respuesta":   _serializar_respuesta(respuesta),
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


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _respaldo_path(nombre_archivo: str) -> Path:
    base = RESPALDOS_DIR.resolve()
    path = (RESPALDOS_DIR / nombre_archivo).resolve()
    if base not in path.parents and path != base:
        raise HTTPException(400, "Ruta de respaldo invalida")
    return path


def _storage_path(base_dir: Path, *parts: str) -> Path:
    base = base_dir.resolve()
    path = base.joinpath(*parts).resolve()
    if base not in path.parents and path != base:
        raise HTTPException(400, "Ruta de archivo invalida")
    return path


def _serializar_adjunto(a: ComunicadoAdjunto | ComunicadoRespuestaAdjunto) -> dict:
    return {
        "id": a.id,
        "nombre_original": a.nombre_original,
        "tipo_mime": a.tipo_mime,
        "tamano_bytes": a.tamano_bytes,
        "tamano_mb": round((a.tamano_bytes or 0) / (1024 * 1024), 2),
        "sha256": a.sha256,
        "creado_en": a.creado_en.isoformat() if a.creado_en else None,
    }


def _serializar_respuesta(r: ComunicadoRespuesta | None) -> dict | None:
    if not r:
        return None
    return {
        "id": r.id,
        "usuario_id": r.usuario_id,
        "usuario_nombre": r.usuario.nombre if r.usuario else None,
        "comentario": r.comentario,
        "estado": r.estado,
        "revisado_por_id": r.revisado_por_id,
        "revisado_por_nombre": r.revisado_por.nombre if r.revisado_por else None,
        "revisado_en": r.revisado_en.isoformat() if r.revisado_en else None,
        "creado_en": r.creado_en.isoformat() if r.creado_en else None,
        "actualizado_en": r.actualizado_en.isoformat() if r.actualizado_en else None,
        "adjuntos": [_serializar_adjunto(a) for a in r.adjuntos],
    }


def _get_respuesta(db: Session, comunicado_id: int, usuario_id: int) -> ComunicadoRespuesta | None:
    return db.query(ComunicadoRespuesta).filter_by(
        comunicado_id=comunicado_id, usuario_id=usuario_id
    ).first()


async def _guardar_upload(
    archivo: UploadFile,
    destino_dir: Path,
    prefix: str,
    max_bytes: int = MAX_ADJUNTO_BYTES,
) -> dict:
    if not archivo.filename:
        raise HTTPException(400, "Archivo sin nombre")
    tipo = archivo.content_type or ""
    if tipo not in ALLOWED_MIME:
        raise HTTPException(400, "Solo se aceptan PDF, JPG, PNG o WEBP")

    destino_dir.mkdir(parents=True, exist_ok=True)
    extension = ALLOWED_MIME[tipo]
    nombre_archivo = f"{prefix}_{uuid.uuid4().hex}{extension}"
    path = _storage_path(destino_dir, nombre_archivo)
    h = hashlib.sha256()
    total = 0
    try:
        with path.open("wb") as fh:
            while True:
                chunk = await archivo.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(400, f"El archivo supera el limite de {max_bytes // (1024 * 1024)} MB")
                h.update(chunk)
                fh.write(chunk)
    except Exception:
        path.unlink(missing_ok=True)
        raise

    if total <= 0:
        path.unlink(missing_ok=True)
        raise HTTPException(400, "El archivo esta vacio")

    return {
        "nombre_original": Path(archivo.filename).name,
        "nombre_archivo": nombre_archivo,
        "ruta_archivo": str(path),
        "tipo_mime": tipo,
        "tamano_bytes": total,
        "sha256": h.hexdigest(),
    }


def _serializar_respaldo(r: ComunicadoRespaldo) -> dict:
    return {
        "id": r.id,
        "nombre_archivo": r.nombre_archivo,
        "tamano_bytes": r.tamano_bytes,
        "tamano_mb": round((r.tamano_bytes or 0) / (1024 * 1024), 2),
        "sha256": r.sha256,
        "total_comunicados": r.total_comunicados,
        "fecha_inicio": r.fecha_inicio.isoformat() if r.fecha_inicio else None,
        "fecha_fin": r.fecha_fin.isoformat() if r.fecha_fin else None,
        "criterios": json.loads(r.criterios) if r.criterios else None,
        "creado_por_id": r.creado_por_id,
        "creado_por_nombre": r.creado_por.nombre if r.creado_por else "Sistema",
        "creado_en": r.creado_en.isoformat() if r.creado_en else None,
        "disponible": Path(r.ruta_archivo).exists(),
    }


def _manifest_comunicados(comunicados: list[Comunicado]) -> dict:
    return {
        "version": 1,
        "generado_en": _utcnow().isoformat(),
        "total_comunicados": len(comunicados),
        "comunicados": [
            {
                "id": c.id,
                "titulo": c.titulo,
                "contenido": c.contenido,
                "categoria": c.categoria,
                "prioridad": c.prioridad,
                "estado": c.estado,
                "requiere_confirmacion": c.requiere_confirmacion,
                "requiere_retroalimentacion": c.requiere_retroalimentacion,
                "fecha_limite_respuesta": c.fecha_limite_respuesta.isoformat() if c.fecha_limite_respuesta else None,
                "fijado": c.fijado,
                "area_emisora": c.area_emisora,
                "departamento_emisor_id": c.departamento_emisor_id,
                "departamento_emisor_nombre": c.departamento_emisor.nombre if c.departamento_emisor else None,
                "fecha_publicacion": c.fecha_publicacion.isoformat() if c.fecha_publicacion else None,
                "fecha_expiracion": c.fecha_expiracion.isoformat() if c.fecha_expiracion else None,
                "autor_id": c.autor_id,
                "autor_nombre": c.autor.nombre if c.autor else "Sistema",
                "creado_en": c.creado_en.isoformat() if c.creado_en else None,
                "actualizado_en": c.actualizado_en.isoformat() if c.actualizado_en else None,
                "destinatarios": [
                    {
                        "tipo_destinatario": d.tipo_destinatario,
                        "destinatario_ref": d.destinatario_ref,
                    }
                    for d in c.destinatarios
                ],
                "lecturas": [
                    {
                        "usuario_id": l.usuario_id,
                        "usuario_nombre": l.usuario.nombre if l.usuario else None,
                        "usuario_email": l.usuario.email if l.usuario else None,
                        "leido_en": l.leido_en.isoformat() if l.leido_en else None,
                        "confirmado_en": l.confirmado_en.isoformat() if l.confirmado_en else None,
                        "creado_en": l.creado_en.isoformat() if l.creado_en else None,
                    }
                    for l in c.lecturas
                ],
                "adjuntos": [
                    {
                        **_serializar_adjunto(a),
                        "nombre_archivo": a.nombre_archivo,
                        "ruta_zip": f"adjuntos/comunicado_{c.id}/{a.nombre_archivo}",
                    }
                    for a in c.adjuntos
                ],
                "respuestas": [
                    {
                        **(_serializar_respuesta(r) or {}),
                        "adjuntos": [
                            {
                                **_serializar_adjunto(a),
                                "nombre_archivo": a.nombre_archivo,
                                "ruta_zip": f"adjuntos/respuesta_{r.id}/{a.nombre_archivo}",
                            }
                            for a in r.adjuntos
                        ],
                    }
                    for r in c.respuestas
                ],
            }
            for c in comunicados
        ],
    }


def _leer_manifest(path: Path) -> dict:
    if not path.exists():
        raise HTTPException(404, "Archivo de respaldo no disponible")
    try:
        with zipfile.ZipFile(path, "r") as zf:
            with zf.open("manifest.json") as fh:
                return json.loads(fh.read().decode("utf-8"))
    except KeyError:
        raise HTTPException(400, "El respaldo no contiene manifest.json")
    except (zipfile.BadZipFile, json.JSONDecodeError):
        raise HTTPException(400, "Archivo de respaldo invalido")


def _es_emisor_limitado(usuario: Usuario) -> bool:
    return usuario.rol in {RolUsuario.ADMINISTRATIVO, RolUsuario.TUTORIA_ADMIN}


def _validar_acceso_gestion(c: Comunicado, usuario: Usuario, accion: str = "gestionar") -> None:
    if usuario.rol == RolUsuario.ADMINISTRATIVO and c.departamento_emisor_id != usuario.departamento_id:
        raise HTTPException(403, f"No puedes {accion} comunicados de otro departamento")
    if usuario.rol == RolUsuario.TUTORIA_ADMIN and c.autor_id != usuario.id:
        raise HTTPException(403, f"No puedes {accion} comunicados de otro responsable")


def _usuario_puede_ver(c: Comunicado, usuario: Usuario) -> bool:
    if usuario.rol in set(ROLES_ADMIN):
        try:
            _validar_acceso_gestion(c, usuario, "consultar")
            return True
        except HTTPException:
            pass
    return _esta_activo(c) and _comunicado_aplica_a(c, usuario)


def _validar_destinatarios_tutoria(db: Session, destinatarios: List["DestinatarioIn"]) -> None:
    if not destinatarios:
        return
    for dest in destinatarios:
        if dest.tipo == TipoDestinatario.ROL:
            if dest.ref != RolUsuario.DOCENTE.value:
                raise HTTPException(403, "El Responsable de Tutoría solo puede enviar comunicados a docentes")
            continue
        if dest.tipo == TipoDestinatario.USUARIO and dest.ref:
            try:
                usuario_id = int(dest.ref)
            except ValueError:
                raise HTTPException(422, "Destinatario de usuario inválido")
            usuario = db.query(Usuario).filter(Usuario.id == usuario_id, Usuario.activo == True).first()
            if not usuario or usuario.rol != RolUsuario.DOCENTE:
                raise HTTPException(403, "El Responsable de Tutoría solo puede seleccionar docentes como destinatarios")
            continue
        raise HTTPException(403, "El Responsable de Tutoría solo puede enviar a todos los docentes o a docentes específicos")


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
    requiere_retroalimentacion: bool = False
    fecha_limite_respuesta: Optional[datetime.datetime] = None
    fijado:                bool = False
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
    requiere_retroalimentacion: Optional[bool] = None
    fecha_limite_respuesta: Optional[datetime.datetime] = None
    fijado:                Optional[bool] = None
    area_emisora:          Optional[str] = None
    departamento_emisor_id: Optional[int] = None
    fecha_publicacion:     Optional[datetime.datetime] = None
    fecha_expiracion:      Optional[datetime.datetime] = None
    destinatarios:         Optional[List[DestinatarioIn]] = None


class RespaldoCreate(BaseModel):
    estado: Optional[str] = "ARCHIVADO"
    antiguedad_dias: Optional[int] = None
    max_mb: Optional[int] = 500


class RespuestaCreate(BaseModel):
    comentario: str


class RespuestaEstadoUpdate(BaseModel):
    estado: str


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
            Comunicado.fijado.desc(),
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


@router.get("/categorias-permitidas")
def get_categorias_permitidas(
    departamento_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    return _categorias_permitidas(db, usuario, departamento_id)


@router.get("/respaldos")
def listar_respaldos(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    respaldos = db.query(ComunicadoRespaldo).order_by(ComunicadoRespaldo.creado_en.desc()).all()
    return [_serializar_respaldo(r) for r in respaldos]


@router.get("/respaldos/estado")
def estado_respaldos(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    q = db.query(Comunicado)
    if usuario.rol == RolUsuario.ADMINISTRATIVO:
        if not usuario.departamento_id:
            return {"total_comunicados": 0, "archivados": 0, "tamano_estimado_bytes": 0}
        q = q.filter(Comunicado.departamento_emisor_id == usuario.departamento_id)
    if usuario.rol == RolUsuario.TUTORIA_ADMIN:
        q = q.filter(Comunicado.autor_id == usuario.id)

    comunicados = q.all()
    manifest = json.dumps(_manifest_comunicados(comunicados), ensure_ascii=False).encode("utf-8")
    archivados = sum(1 for c in comunicados if c.estado == EstadoComunicado.ARCHIVADO)
    return {
        "total_comunicados": len(comunicados),
        "archivados": archivados,
        "tamano_estimado_bytes": len(manifest),
        "tamano_estimado_mb": round(len(manifest) / (1024 * 1024), 2),
        "umbral_sugerido_mb": 500,
        "ruta_respaldos": str(RESPALDOS_DIR),
    }


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

@router.post("/{comunicado_id}/responder", status_code=status.HTTP_201_CREATED)
async def responder_comunicado(
    comunicado_id: int,
    comentario: str = Form(...),
    archivo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if not _esta_activo(c):
        raise HTTPException(400, "El comunicado no esta activo")
    if not _comunicado_aplica_a(c, usuario):
        raise HTTPException(403, "No tienes acceso a este comunicado")
    if not c.requiere_retroalimentacion:
        raise HTTPException(400, "Este comunicado no requiere retroalimentacion")
    comentario = comentario.strip()
    if not comentario:
        raise HTTPException(422, "Escribe una respuesta")

    now = _utcnow()
    lectura = _ensure_lectura(db, comunicado_id, usuario.id)
    if not lectura.leido_en:
        lectura.leido_en = now

    respuesta = _get_respuesta(db, comunicado_id, usuario.id)
    if not respuesta:
        respuesta = ComunicadoRespuesta(
            comunicado_id=comunicado_id,
            usuario_id=usuario.id,
            comentario=comentario,
            estado="RESPONDIDO",
            creado_en=now,
            actualizado_en=now,
        )
        db.add(respuesta)
        db.flush()
    else:
        respuesta.comentario = comentario
        respuesta.estado = "RESPONDIDO"
        respuesta.revisado_por_id = None
        respuesta.revisado_en = None
        respuesta.actualizado_en = now

    if archivo and archivo.filename:
        if len(respuesta.adjuntos) >= 1:
            raise HTTPException(400, "Solo se permite un archivo por respuesta")
        data = await _guardar_upload(
            archivo,
            _storage_path(ADJUNTOS_DIR, "respuestas", str(respuesta.id)),
            f"respuesta_{respuesta.id}",
        )
        db.add(ComunicadoRespuestaAdjunto(respuesta_id=respuesta.id, **data))

    db.commit()
    db.refresh(respuesta)
    return _serializar_respuesta(respuesta)


@router.get("/{comunicado_id}/adjuntos/{adjunto_id}/descargar")
def descargar_adjunto_comunicado(
    comunicado_id: int,
    adjunto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    if not _usuario_puede_ver(c, usuario):
        raise HTTPException(403, "No tienes acceso a este comunicado")
    adjunto = db.query(ComunicadoAdjunto).filter_by(id=adjunto_id, comunicado_id=comunicado_id).first()
    if not adjunto:
        raise HTTPException(404, "Adjunto no encontrado")
    path = Path(adjunto.ruta_archivo)
    if not path.exists():
        raise HTTPException(404, "Archivo no disponible")
    return FileResponse(path, filename=adjunto.nombre_original, media_type=adjunto.tipo_mime)


@router.get("/{comunicado_id}/respuestas/{respuesta_id}/adjuntos/{adjunto_id}/descargar")
def descargar_adjunto_respuesta(
    comunicado_id: int,
    respuesta_id: int,
    adjunto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    respuesta = db.query(ComunicadoRespuesta).filter_by(id=respuesta_id, comunicado_id=comunicado_id).first()
    if not respuesta:
        raise HTTPException(404, "Respuesta no encontrada")
    if usuario.id != respuesta.usuario_id:
        if usuario.rol not in set(ROLES_ADMIN):
            raise HTTPException(403, "No tienes acceso a esta respuesta")
        _validar_acceso_gestion(c, usuario, "consultar")
    adjunto = db.query(ComunicadoRespuestaAdjunto).filter_by(id=adjunto_id, respuesta_id=respuesta_id).first()
    if not adjunto:
        raise HTTPException(404, "Adjunto no encontrado")
    path = Path(adjunto.ruta_archivo)
    if not path.exists():
        raise HTTPException(404, "Archivo no disponible")
    return FileResponse(path, filename=adjunto.nombre_original, media_type=adjunto.tipo_mime)


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
    if usuario.rol == RolUsuario.TUTORIA_ADMIN:
        q = q.filter(Comunicado.autor_id == usuario.id)
    if estado:
        q = q.filter(Comunicado.estado == estado)
    if categoria:
        q = q.filter(Comunicado.categoria == categoria)
    comunicados = q.order_by(Comunicado.fijado.desc(), Comunicado.creado_en.desc()).all()
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
    if usuario.rol == RolUsuario.TUTORIA_ADMIN:
        _validar_destinatarios_tutoria(db, body.destinatarios)
        departamento_emisor_id = None
    if departamento_emisor_id:
        dep = db.query(Departamento).filter(Departamento.id == departamento_emisor_id, Departamento.activo == True).first()
        if not dep:
            raise HTTPException(404, "Departamento emisor no encontrado o inactivo")
    _validar_categoria_comunicado(db, usuario, body.categoria, departamento_emisor_id)

    c = Comunicado(
        titulo=body.titulo,
        contenido=body.contenido,
        categoria=body.categoria,
        prioridad=body.prioridad,
        estado=EstadoComunicado.BORRADOR,
        requiere_confirmacion=body.requiere_confirmacion,
        requiere_retroalimentacion=body.requiere_retroalimentacion,
        fecha_limite_respuesta=body.fecha_limite_respuesta,
        fijado=body.fijado,
        area_emisora="Tutoría" if usuario.rol == RolUsuario.TUTORIA_ADMIN else body.area_emisora,
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


@router.post("/{comunicado_id}/adjuntos", status_code=status.HTTP_201_CREATED)
async def subir_adjunto_comunicado(
    comunicado_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    _validar_acceso_gestion(c, usuario, "editar")
    if c.estado == EstadoComunicado.ARCHIVADO:
        raise HTTPException(400, "No se puede adjuntar a un comunicado archivado")
    if len(c.adjuntos) >= MAX_ADJUNTOS_COMUNICADO:
        raise HTTPException(400, f"Maximo {MAX_ADJUNTOS_COMUNICADO} archivos por comunicado")
    total_actual = sum(a.tamano_bytes or 0 for a in c.adjuntos)
    if total_actual >= MAX_TOTAL_ADJUNTOS_BYTES:
        raise HTTPException(400, "El comunicado ya alcanzo el limite total de adjuntos")

    data = await _guardar_upload(
        archivo,
        _storage_path(ADJUNTOS_DIR, "comunicados", str(comunicado_id)),
        f"comunicado_{comunicado_id}",
    )
    if total_actual + data["tamano_bytes"] > MAX_TOTAL_ADJUNTOS_BYTES:
        Path(data["ruta_archivo"]).unlink(missing_ok=True)
        raise HTTPException(400, f"Los adjuntos del comunicado superan {MAX_TOTAL_ADJUNTOS_BYTES // (1024 * 1024)} MB")

    adjunto = ComunicadoAdjunto(
        comunicado_id=comunicado_id,
        subido_por_id=usuario.id,
        **data,
    )
    db.add(adjunto)
    c.actualizado_en = _utcnow()
    db.commit()
    db.refresh(adjunto)
    return _serializar_adjunto(adjunto)


@router.delete("/{comunicado_id}/adjuntos/{adjunto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_adjunto_comunicado(
    comunicado_id: int,
    adjunto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    _validar_acceso_gestion(c, usuario, "editar")
    if c.estado == EstadoComunicado.ARCHIVADO:
        raise HTTPException(400, "No se puede editar un comunicado archivado")
    adjunto = db.query(ComunicadoAdjunto).filter_by(id=adjunto_id, comunicado_id=comunicado_id).first()
    if not adjunto:
        raise HTTPException(404, "Adjunto no encontrado")
    Path(adjunto.ruta_archivo).unlink(missing_ok=True)
    db.delete(adjunto)
    c.actualizado_en = _utcnow()
    db.commit()


@router.post("/respaldos", status_code=status.HTTP_201_CREATED)
def generar_respaldo(
    body: RespaldoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    q = db.query(Comunicado)
    if usuario.rol == RolUsuario.ADMINISTRATIVO:
        if not usuario.departamento_id:
            raise HTTPException(403, "Tu usuario administrativo no tiene departamento asignado")
        q = q.filter(Comunicado.departamento_emisor_id == usuario.departamento_id)
    if usuario.rol == RolUsuario.TUTORIA_ADMIN:
        q = q.filter(Comunicado.autor_id == usuario.id)
    if body.estado:
        q = q.filter(Comunicado.estado == body.estado)
    if body.antiguedad_dias:
        corte = _utcnow() - datetime.timedelta(days=body.antiguedad_dias)
        q = q.filter(Comunicado.creado_en <= corte)

    comunicados = q.order_by(Comunicado.creado_en.asc()).all()
    if not comunicados:
        raise HTTPException(400, "No hay comunicados que cumplan los criterios de respaldo")

    manifest = _manifest_comunicados(comunicados)
    fechas = [c.creado_en for c in comunicados if c.creado_en]
    now = _utcnow()
    nombre_archivo = f"comunicados_{now.strftime('%Y%m%d_%H%M%S')}_{len(comunicados)}.zip"
    RESPALDOS_DIR.mkdir(parents=True, exist_ok=True)
    path = _respaldo_path(nombre_archivo)

    criterios = {
        "estado": body.estado,
        "antiguedad_dias": body.antiguedad_dias,
        "max_mb": body.max_mb,
        "incluye_adjuntos": True,
    }
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr("criterios.json", json.dumps(criterios, ensure_ascii=False, indent=2))
        zf.writestr(
            "README.txt",
            "Respaldo de comunicados LabControl. Este paquete contiene manifest.json con comunicados, destinatarios, lecturas, respuestas y adjuntos.\n",
        )
        for c in comunicados:
            for adjunto in c.adjuntos:
                file_path = Path(adjunto.ruta_archivo)
                if file_path.exists():
                    zf.write(file_path, f"adjuntos/comunicado_{c.id}/{adjunto.nombre_archivo}")
            for respuesta in c.respuestas:
                for adjunto in respuesta.adjuntos:
                    file_path = Path(adjunto.ruta_archivo)
                    if file_path.exists():
                        zf.write(file_path, f"adjuntos/respuesta_{respuesta.id}/{adjunto.nombre_archivo}")

    digest = _sha256(path)
    existente = db.query(ComunicadoRespaldo).filter(ComunicadoRespaldo.sha256 == digest).first()
    if existente:
        path.unlink(missing_ok=True)
        return _serializar_respaldo(existente)

    respaldo = ComunicadoRespaldo(
        nombre_archivo=nombre_archivo,
        ruta_archivo=str(path),
        sha256=digest,
        tamano_bytes=path.stat().st_size,
        total_comunicados=len(comunicados),
        fecha_inicio=min(fechas) if fechas else None,
        fecha_fin=max(fechas) if fechas else None,
        criterios=json.dumps(criterios, ensure_ascii=False),
        creado_por_id=usuario.id,
        creado_en=now,
    )
    db.add(respaldo)
    db.commit()
    db.refresh(respaldo)
    registrar(db, usuario.id, "RESPALDAR_COMUNICADOS",
              f"Respaldo #{respaldo.id} generado con {len(comunicados)} comunicado(s)")
    return _serializar_respaldo(respaldo)


@router.post("/respaldos/importar", status_code=status.HTTP_201_CREATED)
async def importar_respaldo(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    if not archivo.filename or not archivo.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Solo se aceptan respaldos .zip")
    RESPALDOS_DIR.mkdir(parents=True, exist_ok=True)
    nombre_limpio = Path(archivo.filename).name
    temporal = _respaldo_path(f"importando_{_utcnow().strftime('%Y%m%d_%H%M%S')}_{nombre_limpio}")
    with temporal.open("wb") as fh:
        shutil.copyfileobj(archivo.file, fh)

    manifest = _leer_manifest(temporal)
    digest = _sha256(temporal)
    existente = db.query(ComunicadoRespaldo).filter(ComunicadoRespaldo.sha256 == digest).first()
    if existente:
        temporal.unlink(missing_ok=True)
        return _serializar_respaldo(existente)

    nombre_final = f"importado_{_utcnow().strftime('%Y%m%d_%H%M%S')}_{nombre_limpio}"
    final = _respaldo_path(nombre_final)
    temporal.replace(final)
    comunicados = manifest.get("comunicados", [])
    fechas = []
    for c in comunicados:
        raw = c.get("creado_en")
        if raw:
            try:
                fechas.append(datetime.datetime.fromisoformat(raw))
            except ValueError:
                pass
    respaldo = ComunicadoRespaldo(
        nombre_archivo=nombre_final,
        ruta_archivo=str(final),
        sha256=digest,
        tamano_bytes=final.stat().st_size,
        total_comunicados=len(comunicados),
        fecha_inicio=min(fechas) if fechas else None,
        fecha_fin=max(fechas) if fechas else None,
        criterios=json.dumps({"origen": "importado"}, ensure_ascii=False),
        creado_por_id=usuario.id,
        creado_en=_utcnow(),
    )
    db.add(respaldo)
    db.commit()
    db.refresh(respaldo)
    registrar(db, usuario.id, "IMPORTAR_RESPALDO_COMUNICADOS",
              f"Respaldo #{respaldo.id} importado")
    return _serializar_respaldo(respaldo)


@router.get("/respaldos/{respaldo_id}/contenido")
def ver_contenido_respaldo(
    respaldo_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    respaldo = db.query(ComunicadoRespaldo).filter_by(id=respaldo_id).first()
    if not respaldo:
        raise HTTPException(404, "Respaldo no encontrado")
    manifest = _leer_manifest(Path(respaldo.ruta_archivo))
    return {
        "respaldo": _serializar_respaldo(respaldo),
        "manifest": manifest,
    }


@router.get("/respaldos/{respaldo_id}/descargar")
def descargar_respaldo(
    respaldo_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    respaldo = db.query(ComunicadoRespaldo).filter_by(id=respaldo_id).first()
    if not respaldo:
        raise HTTPException(404, "Respaldo no encontrado")
    path = Path(respaldo.ruta_archivo)
    if not path.exists():
        raise HTTPException(404, "Archivo de respaldo no disponible")
    return FileResponse(path, filename=respaldo.nombre_archivo, media_type="application/zip")


@router.post("/{comunicado_id}/respuestas/{respuesta_id}/revisar")
def revisar_respuesta(
    comunicado_id: int,
    respuesta_id: int,
    body: RespuestaEstadoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    _validar_acceso_gestion(c, usuario, "revisar")
    respuesta = db.query(ComunicadoRespuesta).filter_by(id=respuesta_id, comunicado_id=comunicado_id).first()
    if not respuesta:
        raise HTTPException(404, "Respuesta no encontrada")
    estado = body.estado.upper()
    if estado not in {"RESPONDIDO", "REVISADO"}:
        raise HTTPException(422, "Estado invalido")
    respuesta.estado = estado
    if estado == "REVISADO":
        respuesta.revisado_por_id = usuario.id
        respuesta.revisado_en = _utcnow()
    else:
        respuesta.revisado_por_id = None
        respuesta.revisado_en = None
    respuesta.actualizado_en = _utcnow()
    db.commit()
    db.refresh(respuesta)
    return _serializar_respuesta(respuesta)


@router.get("/{comunicado_id}")
def get_comunicado(
    comunicado_id: int,
    db:      Session = Depends(get_db),
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    _validar_acceso_gestion(c, usuario, "consultar")
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
    _validar_acceso_gestion(c, usuario, "editar")
    if c.estado == EstadoComunicado.ARCHIVADO:
        raise HTTPException(400, "No se puede editar un comunicado archivado")
    if usuario.rol == RolUsuario.TUTORIA_ADMIN and body.destinatarios is not None:
        _validar_destinatarios_tutoria(db, body.destinatarios)
    datos_update = body.model_dump(exclude_none=True)
    categoria_final = datos_update.get("categoria", c.categoria)
    departamento_final = datos_update.get("departamento_emisor_id", c.departamento_emisor_id)
    if usuario.rol == RolUsuario.ADMINISTRATIVO:
        departamento_final = usuario.departamento_id
    elif usuario.rol == RolUsuario.TUTORIA_ADMIN:
        departamento_final = None
    _validar_categoria_comunicado(db, usuario, categoria_final, departamento_final)

    for field, val in datos_update.items():
        if field == "destinatarios":
            continue
        if field == "departamento_emisor_id":
            if usuario.rol == RolUsuario.ADMINISTRATIVO:
                val = usuario.departamento_id
            elif usuario.rol == RolUsuario.TUTORIA_ADMIN:
                val = None
            elif val and not db.query(Departamento).filter(Departamento.id == val, Departamento.activo == True).first():
                raise HTTPException(404, "Departamento emisor no encontrado o inactivo")
        if field == "area_emisora" and usuario.rol == RolUsuario.TUTORIA_ADMIN:
            val = "Tutoría"
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
    usuario: Usuario = Depends(require_roles(*ROLES_ADMIN)),
):
    c = db.query(Comunicado).filter_by(id=comunicado_id).first()
    if not c:
        raise HTTPException(404, "Comunicado no encontrado")
    _validar_acceso_gestion(c, usuario, "eliminar")
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
    _validar_acceso_gestion(c, usuario, "publicar")
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
    _validar_acceso_gestion(c, usuario, "archivar")
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
    _validar_acceso_gestion(c, usuario, "consultar")

    # Todos los usuarios que aplican
    todos_usuarios = db.query(Usuario).filter(Usuario.activo == True).all()
    aplican = [u for u in todos_usuarios if _comunicado_aplica_a(c, u)]
    respuestas = {
        r.usuario_id: r
        for r in db.query(ComunicadoRespuesta).filter_by(comunicado_id=comunicado_id).all()
    }

    resultado = []
    for u in aplican:
        lec = _get_lectura(db, comunicado_id, u.id)
        respuesta = respuestas.get(u.id)
        resultado.append({
            "usuario_id":    u.id,
            "nombre":        u.nombre,
            "email":         u.email,
            "rol":           u.rol.value,
            "leido":         lec is not None and lec.leido_en is not None,
            "confirmado":    lec is not None and lec.confirmado_en is not None,
            "leido_en":      lec.leido_en.isoformat() if lec and lec.leido_en else None,
            "confirmado_en": lec.confirmado_en.isoformat() if lec and lec.confirmado_en else None,
            "respuesta_estado": respuesta.estado if respuesta else "PENDIENTE",
            "respuesta": _serializar_respuesta(respuesta),
        })

    leidos    = sum(1 for r in resultado if r["leido"])
    pendientes = len(resultado) - leidos
    respondidos = sum(1 for r in resultado if r["respuesta"] is not None)
    revisados = sum(1 for r in resultado if r["respuesta_estado"] == "REVISADO")
    return {
        "comunicado_id": comunicado_id,
        "titulo":        c.titulo,
        "total":         len(resultado),
        "leidos":        leidos,
        "pendientes":    pendientes,
        "respondidos":   respondidos,
        "sin_responder": len(resultado) - respondidos,
        "revisados":     revisados,
        "detalle":       resultado,
    }
