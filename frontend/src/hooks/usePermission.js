/**
 * usePermission — Hook de RBAC para componentes React
 * SIGA UTECAN
 *
 * Usa la matriz de PERMISSIONS definida en src/config/permissions.js
 * y el usuario autenticado del AuthContext.
 *
 * @example Ocultar botón si no tiene permiso
 *   const { can } = usePermission();
 *   {can('inventario:write') && <button>Agregar activo</button>}
 *
 * @example Verificar múltiples permisos
 *   const { canAny, canAll } = usePermission();
 *   if (canAny(['reportes:read', 'reportes:export'])) { ... }
 */

import { useAuth } from '../context/AuthContext';
import { can as _can, getPermissions, canAccessRoute } from '../config/permissions';

export default function usePermission() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;

  /**
   * Verifica si el usuario actual tiene un permiso específico.
   * @param {string} permiso
   * @returns {boolean}
   */
  function can(permiso) {
    if (!rol) return false;
    return usuario?.permisos?.includes(permiso) || _can(rol, permiso);
  }

  /**
   * Verifica si el usuario tiene AL MENOS UNO de los permisos dados.
   * @param {string[]} permisos
   * @returns {boolean}
   */
  function canAny(permisos) {
    return permisos.some(p => can(p));
  }

  /**
   * Verifica si el usuario tiene TODOS los permisos dados.
   * @param {string[]} permisos
   * @returns {boolean}
   */
  function canAll(permisos) {
    return permisos.every(p => can(p));
  }

  /**
   * Verifica si el usuario tiene acceso a una ruta de React Router.
   * @param {string} path
   * @returns {boolean}
   */
  function canRoute(path) {
    if (!rol) return false;
    return canAccessRoute(rol, path);
  }

  /**
   * Lista todos los permisos del usuario actual.
   * @returns {string[]}
   */
  function myPermissions() {
    if (!rol) return [];
    return Array.from(new Set([...getPermissions(rol), ...(usuario?.permisos || [])]));
  }

  /**
   * Verifica si el usuario es de un rol específico.
   * @param {string|string[]} roles
   * @returns {boolean}
   */
  function hasRole(roles) {
    if (!rol) return false;
    const list = Array.isArray(roles) ? roles : [roles];
    return list.includes(rol);
  }

  return {
    rol,
    can,
    canAny,
    canAll,
    canRoute,
    myPermissions,
    hasRole,
    isSuperAdmin: rol === 'SUPER_ADMIN',
    isLabAdmin:   rol === 'LAB_ADMIN',
    isResponsableLab: rol === 'RESPONSABLE_LAB',
    isDocente:    rol === 'DOCENTE',
  };
}
