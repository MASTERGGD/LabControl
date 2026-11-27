export const accionesPendientes = {
  abierta: 'Terminar el registro',
  correccion: 'Completar la corrección',
  faltante: 'Revisar la fecha y regularizar el registro si procede',
  reposicion: 'Programar o aclarar la reposición',
};

export const rotuloGrupo = grupo => grupo?.replace(/^(\d+)°(?=\s|$)/, '$1.º');

export function sesionesPorAtender(carga) {
  const filas = new Map();
  const agregar = (sesion, tipo) => filas.set(sesion.fecha, {
    ...sesion, tipo, hora_inicio: sesion.hora_inicio || carga.hora_inicio,
    hora_fin: sesion.hora_fin || carga.hora_fin,
  });
  for (const fecha of carga.resumen.fechas_sin_registro || []) agregar({ fecha }, 'faltante');
  for (const clase of carga.resumen.detalle_no_impartidas || []) {
    if (clase.estado_reposicion === 'PENDIENTE') agregar(clase, 'reposicion');
  }
  for (const sesion of carga.resumen.sesiones || []) {
    if (sesion.estado === 'ABIERTA') agregar(sesion, 'abierta');
    if (sesion.estado === 'CORRECCION') agregar(sesion, 'correccion');
  }
  return [...filas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function resumenParaDocente(nombre, periodo, cargas) {
  const encabezado = [`Pendientes de cierre académico · ${periodo || ''}`.trim(), nombre];
  const materias = new Map();
  for (const carga of cargas) {
    const nombreMateria = [carga.materia, rotuloGrupo(carga.grupo)].filter(Boolean).join(' · ');
    for (const fila of sesionesPorAtender(carga)) {
      if (!materias.has(nombreMateria)) materias.set(nombreMateria, []);
      materias.get(nombreMateria).push(fila);
    }
  }
  for (const [materia, filas] of materias) {
    encabezado.push('', materia);
    for (const fila of filas.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const horario = fila.hora_inicio && fila.hora_fin ? ` · ${fila.hora_inicio}–${fila.hora_fin}` : '';
      encabezado.push(`- ${fila.fecha}${horario} · ${accionesPendientes[fila.tipo]}`);
    }
  }
  return encabezado.join('\n');
}
