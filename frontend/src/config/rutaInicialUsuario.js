const RUTAS_POR_ROL = {
  SUPER_ADMIN: '/admin',
  LAB_ADMIN: '/lab',
  RESPONSABLE_LAB: '/admin/inventario',
  ADMINISTRATIVO: '/administrativo',
  SERVICIOS_ESCOLARES: '/servicios-escolares',
  TUTORIA_ADMIN: '/admin/tutoria',
  MEDICO: '/medico/consultorio',
  DOCENTE: '/docente',
  ALUMNO: '/alumno/estudio-socioeconomico',
};

export function rutaInicialUsuario(usuario) {
  if (usuario?.rol !== 'SUPER_ADMIN' && usuario?.permisos?.includes('servicios_escolares:manage')) {
    return '/servicios-escolares';
  }
  return RUTAS_POR_ROL[usuario?.rol] || '/login';
}
