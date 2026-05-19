/**
 * RBAC — Matriz de permisos del frontend
 * LabControl UTECAN
 *
 * Espejo del archivo backend/permissions.py
 * Mantener sincronizados cuando se agreguen módulos.
 *
 * Uso:
 *   import { can, ROUTE_PERMISSIONS } from '../config/permissions';
 *   if (can(usuario.rol, 'reportes:read')) { ... }
 */

// ── Roles ──────────────────────────────────────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  LAB_ADMIN:   'LAB_ADMIN',
  ADMINISTRATIVO: 'ADMINISTRATIVO',
  DOCENTE:     'DOCENTE',
};

const SA = ROLES.SUPER_ADMIN;
const LA = ROLES.LAB_ADMIN;
const AD = ROLES.ADMINISTRATIVO;
const DO = ROLES.DOCENTE;

// ── Matriz de permisos ─────────────────────────────────────────────────────────
// permiso → array de roles que lo tienen
export const PERMISSIONS = {
  // Laboratorios
  'laboratorios:read':      [SA, LA, DO],
  'laboratorios:write':     [SA],
  'laboratorios:delete':    [SA],
  'pcs:read':               [SA, LA, DO],
  'pcs:write':              [SA, LA],
  'pcs:admin':              [SA, LA],

  // Usuarios
  'usuarios:read':          [SA, LA],
  'usuarios:write':         [SA],
  'usuarios:delete':        [SA],
  'usuarios:reset':         [SA],
  'usuarios:self':          [SA, LA, DO],
  'usuarios:import':        [SA],

  // Horarios
  'horarios:read':          [SA, LA, DO],
  'horarios:write':         [SA, LA],
  'horarios:delete':        [SA, LA],

  // Reservaciones
  'reservaciones:read':     [SA, LA, DO],
  'reservaciones:write':    [SA, LA, DO],
  'reservaciones:admin':    [SA, LA],

  // Sesiones
  'sesiones:read':          [SA, LA, DO],
  'sesiones:write':         [SA, LA, DO],
  'sesiones:admin':         [SA, LA],
  'sesiones:asignar':       [SA, LA, DO],
  'sesiones:incidencia':    [SA, LA, DO],

  // Inventario
  'inventario:read':        [SA, LA, DO],
  'inventario:write':       [SA, LA],
  'inventario:delete':      [SA, LA],
  'inventario:import':      [SA, LA],

  // Préstamos
  'prestamos:read':         [SA, LA, DO],
  'prestamos:write':        [SA, LA, DO],
  'prestamos:devolver':     [SA, LA],

  // Mantenimiento
  'mantenimiento:read':     [SA, LA, DO],
  'mantenimiento:write':    [SA, LA],
  'mantenimiento:delete':   [SA, LA],

  // Incidentes
  'incidentes:read':        [SA, LA, DO],
  'incidentes:write':       [SA, LA, DO],
  'incidentes:admin':       [SA, LA],

  // Catálogo
  'catalogo:read':          [SA, LA, DO],
  'catalogo:write':         [SA, LA],
  'catalogo:delete':        [SA, LA],
  'catalogo:import':        [SA, LA],

  // Reportes
  'reportes:read':          [SA, LA],
  'reportes:export':        [SA, LA],

  // Notificaciones
  'notificaciones:own':     [SA, LA, DO],
  'comunicados:own':        [SA, LA, AD, DO],
  'comunicados:write':      [SA, LA, AD],
  'departamentos:read':     [SA, LA, AD, DO],
  'departamentos:write':    [SA],
};

// ── Permisos requeridos por ruta ───────────────────────────────────────────────
// Fuente de verdad para RutaProtegida en App.jsx
export const ROUTE_PERMISSIONS = {
  '/admin':                       [SA, LA],
  '/lab':                         [SA, LA],
  '/administrativo':              [AD],
  '/admin/laboratorios':          [SA, LA],
  '/admin/laboratorios/:labId':   [SA, LA],
  '/admin/usuarios':              [SA],
  '/admin/departamentos':         [SA],
  '/admin/horarios':              [SA, LA],
  '/admin/reservaciones':         [SA, LA, DO],
  '/admin/inventario':            [SA, LA],
  '/admin/prestamos':             [SA, LA],
  '/admin/mantenimiento':         [SA, LA],
  '/admin/catalogo':              [SA, LA],
  '/admin/reportes':                      [SA, LA],
  '/admin/historial-alumno':              [SA, LA],
  '/admin/sesion/:sesionId':              [SA, LA, DO],
  '/admin/sesion/:sesionId/asistencia':   [SA, LA, DO],
  '/docente':                             [DO],
  '/docente/reservaciones':       [DO],
  '/docente/sesion/:sesionId':    [SA, LA, DO],
  '/comunicados':                 [SA, LA, AD, DO],
  '/admin/comunicados':           [SA, LA, AD],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Verifica si un rol tiene un permiso.
 *
 * @param {string} rol   - 'SUPER_ADMIN' | 'LAB_ADMIN' | 'DOCENTE'
 * @param {string} perm  - clave de PERMISSIONS, ej. 'inventario:write'
 * @returns {boolean}
 *
 * @example
 *   import { can } from '../config/permissions';
 *   const puedeEditar = can(usuario.rol, 'inventario:write');
 */
export function can(rol, perm) {
  const allowed = PERMISSIONS[perm];
  if (!allowed) {
    console.warn(`[RBAC] Permiso desconocido: "${perm}"`);
    return false;
  }
  return allowed.includes(rol);
}

/**
 * Devuelve todos los permisos de un rol.
 *
 * @param {string} rol
 * @returns {string[]}
 */
export function getPermissions(rol) {
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(rol))
    .map(([perm]) => perm);
}

/**
 * Verifica si un rol tiene acceso a una ruta dada.
 *
 * @param {string} rol
 * @param {string} path  - ruta de React Router, ej. '/admin/reportes'
 * @returns {boolean}
 */
export function canAccessRoute(rol, path) {
  const allowed = ROUTE_PERMISSIONS[path];
  if (!allowed) return true; // ruta pública o no controlada
  return allowed.includes(rol);
}
