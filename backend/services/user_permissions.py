from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError, ProgrammingError

from models.departamento import Departamento
from models.usuario import RolUsuario, Usuario
from models.usuario_permiso import UsuarioPermiso

PERM_COMUNICADOS_WRITE = "comunicados:write"
PERM_INVENTARIO_WRITE = "inventario:write"


def es_responsable_departamento(db: Session, usuario: Usuario, departamento_id: int | None) -> bool:
    if not departamento_id:
        return False
    return db.query(Departamento.id).filter(
        Departamento.id == departamento_id,
        Departamento.responsable_id == usuario.id,
        Departamento.activo == True,
    ).first() is not None


def tiene_permiso_departamento(
    db: Session,
    usuario: Usuario,
    permiso: str,
    departamento_id: int | None,
) -> bool:
    query = db.query(UsuarioPermiso.id).filter(
        UsuarioPermiso.usuario_id == usuario.id,
        UsuarioPermiso.permiso == permiso,
        UsuarioPermiso.activo == True,
    )
    if departamento_id is None:
        query = query.filter(UsuarioPermiso.departamento_id.is_(None))
    else:
        query = query.filter(UsuarioPermiso.departamento_id == departamento_id)
    return query.first() is not None


def departamentos_con_permiso(db: Session, usuario: Usuario, permiso: str) -> list[int]:
    try:
        ids = {
            row[0]
            for row in db.query(UsuarioPermiso.departamento_id).filter(
                UsuarioPermiso.usuario_id == usuario.id,
                UsuarioPermiso.permiso == permiso,
                UsuarioPermiso.activo == True,
                UsuarioPermiso.departamento_id.isnot(None),
            ).all()
        }
    except (OperationalError, ProgrammingError):
        db.rollback()
        ids = set()
    ids.update(
        row[0]
        for row in db.query(Departamento.id).filter(
            Departamento.responsable_id == usuario.id,
            Departamento.activo == True,
        ).all()
    )
    return sorted(ids)


def puede_emitir_comunicados(
    db: Session,
    usuario: Usuario,
    departamento_id: int | None = None,
) -> bool:
    if usuario.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN):
        return True
    if usuario.rol == RolUsuario.TUTORIA_ADMIN and departamento_id is None:
        return True
    if departamento_id is None:
        departamento_id = usuario.departamento_id
    if es_responsable_departamento(db, usuario, departamento_id):
        return True
    return tiene_permiso_departamento(db, usuario, PERM_COMUNICADOS_WRITE, departamento_id)


def departamentos_inventario(db: Session, usuario: Usuario) -> list[int]:
    return departamentos_con_permiso(db, usuario, PERM_INVENTARIO_WRITE)


def puede_gestionar_inventario(
    db: Session,
    usuario: Usuario,
    departamento_id: int | None = None,
) -> bool:
    if usuario.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB):
        return True
    if departamento_id is None:
        departamento_id = usuario.departamento_id
    if es_responsable_departamento(db, usuario, departamento_id):
        return True
    return tiene_permiso_departamento(db, usuario, PERM_INVENTARIO_WRITE, departamento_id)


def permisos_efectivos(db: Session, usuario: Usuario) -> list[str]:
    permisos = set()
    if usuario.rol in (RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN, RolUsuario.TUTORIA_ADMIN):
        permisos.add(PERM_COMUNICADOS_WRITE)
    if usuario.rol == RolUsuario.RESPONSABLE_LAB:
        permisos.add(PERM_INVENTARIO_WRITE)
    if departamentos_con_permiso(db, usuario, PERM_COMUNICADOS_WRITE):
        permisos.add(PERM_COMUNICADOS_WRITE)
    if departamentos_con_permiso(db, usuario, PERM_INVENTARIO_WRITE):
        permisos.add(PERM_INVENTARIO_WRITE)
    return sorted(permisos)
