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

export const claveMateria = carga => JSON.stringify([
  carga.materia_id ?? carga.materia.trim().toLocaleLowerCase('es-MX'),
  carga.grupo_id ?? carga.grupo,
]);

export function etiquetasMaterias(cargas) {
  const etiquetas = new Map();
  const porNombre = new Map();
  for (const carga of cargas) {
    const clave = claveMateria(carga);
    if (etiquetas.has(clave)) continue;
    const principal = [carga.materia, rotuloGrupo(carga.grupo)].filter(Boolean).join(' · ');
    const complemento = carga.programa_educativo || '';
    const nombre = [principal, complemento].filter(Boolean).join(' · ');
    etiquetas.set(clave, { principal, complemento, nombre });
    if (!porNombre.has(nombre)) porNombre.set(nombre, []);
    porNombre.get(nombre).push({ clave, carga });
  }
  for (const [nombre, filas] of porNombre) {
    if (filas.length < 2) continue;
    for (const { clave, carga } of filas) {
      const grupoRepetido = filas.filter(fila => fila.carga.grupo_id === carga.grupo_id).length > 1;
      const referencia = [
        carga.grupo_id != null && `Grupo #${carga.grupo_id}`,
        (grupoRepetido || carga.grupo_id == null) && carga.materia_id != null && `Materia #${carga.materia_id}`,
      ].filter(Boolean).join(' · ');
      if (referencia) {
        const etiqueta = etiquetas.get(clave);
        etiquetas.set(clave, {
          ...etiqueta,
          complemento: [etiqueta.complemento, referencia].filter(Boolean).join(' · '),
          nombre: `${nombre} · ${referencia}`,
        });
      }
    }
  }
  return etiquetas;
}

export function sesionesEnDetalle(carga) {
  const pendientes = sesionesPorAtender(carga);
  const fechas = new Set(pendientes.map(fila => fila.fecha));
  const noImpartidas = carga.resumen.detalle_no_impartidas
    ?? (carga.resumen.fechas_no_impartidas || []).map(fecha => ({ fecha }));
  return [...pendientes, ...noImpartidas.filter(fila => !fechas.has(fila.fecha)).map(fila => ({
    ...fila, tipo: 'no_impartida', hora_inicio: carga.hora_inicio, hora_fin: carga.hora_fin,
  }))];
}

export function resumenParaDocente(nombre, periodo, cargas, etiquetas = etiquetasMaterias(cargas)) {
  const encabezado = [`Pendientes de cierre académico · ${periodo || ''}`.trim(), nombre];
  const materias = new Map();
  for (const carga of cargas) {
    const clave = claveMateria(carga);
    for (const fila of sesionesPorAtender(carga)) {
      if (!materias.has(clave)) materias.set(clave, []);
      materias.get(clave).push(fila);
    }
  }
  for (const [materia, filas] of materias) {
    encabezado.push('', etiquetas.get(materia).nombre);
    for (const fila of filas.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const horario = fila.hora_inicio && fila.hora_fin ? ` · ${fila.hora_inicio}–${fila.hora_fin}` : '';
      encabezado.push(`- ${fila.fecha}${horario} · ${accionesPendientes[fila.tipo]}`);
    }
  }
  return encabezado.join('\n');
}
