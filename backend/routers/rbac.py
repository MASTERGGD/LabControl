"""
RBAC Router — LabControl UTECAN
================================
Endpoint de introspección: devuelve la matriz de permisos y los permisos
del usuario autenticado actual.

Uso:
  GET /rbac/permissions        → matriz completa (solo SUPER_ADMIN)
  GET /rbac/my-permissions     → permisos del usuario actual (cualquier rol)
"""

from fastapi import APIRouter, Depends
from models.usuario import Usuario
from dependencies import get_current_user, require_roles
from models.usuario import RolUsuario
from permissions import PERMISSIONS, get_permission_matrix, can

router = APIRouter(prefix="/rbac", tags=["RBAC"])


@router.get("/permissions", summary="Matriz completa de permisos (solo SUPER_ADMIN)")
def listar_permisos(
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN))
):
    """
    Devuelve la tabla completa: permiso → roles que lo tienen.
    Útil para auditoría y debugging.
    """
    return {
        "permissions": get_permission_matrix(),
        "total": len(PERMISSIONS),
    }


@router.get("/my-permissions", summary="Permisos del usuario autenticado")
def mis_permisos(
    current_user: Usuario = Depends(get_current_user)
):
    """
    Devuelve todos los permisos que tiene el usuario actual.
    El frontend lo usa para mostrar/ocultar elementos de la UI.
    """
    mis = [
        permiso
        for permiso, roles in PERMISSIONS.items()
        if current_user.rol in roles
    ]
    return {
        "rol":         current_user.rol.value,
        "permissions": sorted(mis),
        "total":       len(mis),
    }


@router.get("/check/{permiso}", summary="Verificar un permiso específico")
def verificar_permiso(
    permiso: str,
    current_user: Usuario = Depends(get_current_user)
):
    """
    Verifica si el usuario actual tiene un permiso específico.
    Retorna { "allowed": true/false }.
    """
    tiene = can(current_user.rol, permiso)
    return {
        "permiso":  permiso,
        "rol":      current_user.rol.value,
        "allowed":  tiene,
    }
