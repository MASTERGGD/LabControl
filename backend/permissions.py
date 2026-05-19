"""
RBAC — Role-Based Access Control — LabControl UTECAN
=====================================================
Fuente única de verdad para permisos del sistema.

Cada permiso tiene la forma  "recurso:acción"  y mapea a los roles
que pueden ejecutarlo. Todos los routers deben usar require_permission()
en vez de require_roles() con roles hardcodeados.

Roles disponibles:
  SUPER_ADMIN  → control total institucional
  LAB_ADMIN    → control de su laboratorio asignado
  ADMINISTRATIVO → gestión de comunicados de su departamento
  DOCENTE      → reservaciones y sesiones de clase propias

Convención de acciones:
  :read    → GET lista o detalle
  :write   → POST / PUT / PATCH crear o editar
  :delete  → DELETE / dar de baja
  :admin   → acciones privilegiadas (resolver conflictos, bloquear, etc.)
  :own     → cualquier rol autenticado accede solo a sus propios recursos
  :import  → importación masiva desde Excel
"""

from fastapi import Depends, HTTPException, status
from models.usuario import RolUsuario, Usuario
from dependencies import get_current_user

# Alias cortos para leer la matriz más fácil
SA  = RolUsuario.SUPER_ADMIN
LA  = RolUsuario.LAB_ADMIN
AD  = RolUsuario.ADMINISTRATIVO
DO  = RolUsuario.DOCENTE

# ── Matriz de permisos ─────────────────────────────────────────────────────────
#
# PERMISSIONS[permiso] = frozenset de roles que lo tienen
#
PERMISSIONS: dict[str, frozenset[RolUsuario]] = {

    # ── Laboratorios ────────────────────────────────────────────────────────────
    "laboratorios:read":        frozenset({SA, LA, DO}),   # ver lista y detalle
    "laboratorios:write":       frozenset({SA}),            # crear / editar lab
    "laboratorios:delete":      frozenset({SA}),            # desactivar lab
    "pcs:read":                 frozenset({SA, LA, DO}),   # ver PCs
    "pcs:write":                frozenset({SA, LA}),        # agregar / editar PCs
    "pcs:admin":                frozenset({SA, LA}),        # marcar BAJA / estado

    # ── Usuarios ────────────────────────────────────────────────────────────────
    "usuarios:read":            frozenset({SA, LA}),        # listar usuarios
    "usuarios:write":           frozenset({SA}),            # crear / editar usuario
    "usuarios:delete":          frozenset({SA}),            # desactivar
    "usuarios:reset":           frozenset({SA}),            # reset de contraseña
    "usuarios:self":            frozenset({SA, LA, AD, DO}),   # cambiar propia contraseña
    "usuarios:import":          frozenset({SA}),            # importar desde Excel

    # ── Horarios ────────────────────────────────────────────────────────────────
    "horarios:read":            frozenset({SA, LA, DO}),   # ver slots disponibles
    "horarios:write":           frozenset({SA, LA}),        # crear / editar slots
    "horarios:delete":          frozenset({SA, LA}),        # desactivar slot

    # ── Reservaciones ───────────────────────────────────────────────────────────
    "reservaciones:read":       frozenset({SA, LA, DO}),   # ver reservaciones
    "reservaciones:write":      frozenset({SA, LA, DO}),   # crear / editar propia
    "reservaciones:admin":      frozenset({SA, LA}),        # resolver conflictos, bloquear

    # ── Sesiones de clase ───────────────────────────────────────────────────────
    "sesiones:read":            frozenset({SA, LA, DO}),   # ver sesiones
    "sesiones:write":           frozenset({SA, LA, DO}),   # abrir / cerrar sesión propia
    "sesiones:admin":           frozenset({SA, LA}),        # ver y cerrar cualquier sesión
    "sesiones:asignar":         frozenset({SA, LA, DO}),   # asignar alumno a PC
    "sesiones:incidencia":      frozenset({SA, LA, DO}),   # reportar incidencia en sesión

    # ── Inventario ──────────────────────────────────────────────────────────────
    "inventario:read":          frozenset({SA, LA, DO}),   # ver activos
    "inventario:write":         frozenset({SA, LA}),        # crear / editar activo
    "inventario:delete":        frozenset({SA, LA}),        # dar de baja activo
    "inventario:import":        frozenset({SA, LA}),        # importar Excel

    # ── Préstamos ────────────────────────────────────────────────────────────────
    "prestamos:read":           frozenset({SA, LA, DO}),   # ver préstamos
    "prestamos:write":          frozenset({SA, LA, DO}),   # registrar préstamo
    "prestamos:devolver":       frozenset({SA, LA}),        # registrar devolución

    # ── Mantenimiento ────────────────────────────────────────────────────────────
    "mantenimiento:read":       frozenset({SA, LA, DO}),   # ver incidentes / preventivos
    "mantenimiento:write":      frozenset({SA, LA}),        # crear / editar
    "mantenimiento:delete":     frozenset({SA, LA}),        # eliminar preventivo

    # ── Incidentes ───────────────────────────────────────────────────────────────
    "incidentes:read":          frozenset({SA, LA, DO}),
    "incidentes:write":         frozenset({SA, LA, DO}),   # cualquiera puede reportar
    "incidentes:admin":         frozenset({SA, LA}),        # cambiar estado / resolver

    # ── Catálogo académico ───────────────────────────────────────────────────────
    "catalogo:read":            frozenset({SA, LA, DO}),   # buscar alumnos / materias
    "catalogo:write":           frozenset({SA, LA}),        # crear / editar
    "catalogo:delete":          frozenset({SA, LA}),        # desactivar
    "catalogo:import":          frozenset({SA, LA}),        # importar Excel

    # ── Reportes ─────────────────────────────────────────────────────────────────
    "reportes:read":            frozenset({SA, LA}),        # ver reportes mensuales
    "reportes:export":          frozenset({SA, LA}),        # descargar Excel

    # ── Notificaciones ───────────────────────────────────────────────────────────
    "notificaciones:own":       frozenset({SA, LA, AD, DO}),   # ver / marcar las propias

    # Departamentos y comunicados institucionales
    "departamentos:read":       frozenset({SA, LA, AD, DO}),
    "departamentos:write":      frozenset({SA}),
    "comunicados:own":          frozenset({SA, LA, AD, DO}),
    "comunicados:write":        frozenset({SA, LA, AD}),
}


# ── Helper: consulta puntual desde código ─────────────────────────────────────

def can(rol: RolUsuario, permiso: str) -> bool:
    """
    Verifica en tiempo de ejecución si un rol tiene un permiso.

    Ejemplo:
        if can(usuario.rol, "reportes:read"):
            ...
    """
    return rol in PERMISSIONS.get(permiso, frozenset())


# ── Dependency factory para FastAPI ───────────────────────────────────────────

def require_permission(permiso: str):
    """
    Dependency que lanza HTTP 403 si el usuario no tiene el permiso requerido.

    Uso en routers:
        @router.post("/activos")
        def crear_activo(
            data: ActivoCreate,
            current_user: Usuario = Depends(require_permission("inventario:write"))
        ):
            ...

    Ventaja sobre require_roles(): el permiso queda documentado en la firma
    del endpoint y en la matriz PERMISSIONS — no hay que buscar en el código
    qué roles están permitidos.
    """
    allowed = PERMISSIONS.get(permiso, frozenset())

    if not allowed:
        # Permiso no definido en la matriz → error de programación, no de runtime
        raise ValueError(
            f"Permiso '{permiso}' no existe en la matriz PERMISSIONS. "
            f"Agrégalo en backend/permissions.py"
        )

    def _check(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        if current_user.rol not in allowed:
            roles_str = ", ".join(r.value for r in allowed)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error":     "Acceso denegado",
                    "permiso":   permiso,
                    "tu_rol":    current_user.rol.value,
                    "roles_permitidos": [r.value for r in allowed],
                }
            )
        return current_user

    return _check


# ── Endpoint de introspección (solo SUPER_ADMIN) ───────────────────────────────

def get_permission_matrix() -> dict:
    """
    Devuelve la matriz completa de permisos serializada.
    Útil para el endpoint GET /rbac/permissions.
    """
    return {
        permiso: sorted(r.value for r in roles)
        for permiso, roles in sorted(PERMISSIONS.items())
    }
