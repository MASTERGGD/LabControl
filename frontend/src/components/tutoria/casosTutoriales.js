export const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export const fecha = valor => {
  if (!valor) return null;
  const parsed = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(valor) ? valor : `${valor}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
export const antiguedad = valor => {
  const parsed = fecha(valor);
  if (!parsed) return 'Sin fecha';
  const dias = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
  return dias === 0 ? 'Hoy' : `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
};
const cerrados = new Set(['ATENDIDO', 'CERRADO', 'CERRADO_ADMINISTRATIVO']);
const sinAccion = new Set(['SIN_TUTOR', 'ENVIADO', 'RECIBIDO']);
export const esActivo = reporte => !cerrados.has(reporte.estado);
export function agruparCasos(reportes) {
  const grupos = new Map();
  reportes.forEach(r => {
    // Los reportes grupales no deben fusionarse como si fueran un alumno.
    const key = r.alumno_id != null ? `alumno:${r.alumno_id}` : r.matricula ? `matricula:${r.matricula}` : `reporte:${r.id}`;
    if (!grupos.has(key)) grupos.set(key, { key, nombre: r.alumno_nombre, matricula: r.matricula, grupal: r.alumno_id == null && !r.matricula, reportes: [] });
    grupos.get(key).reportes.push(r);
  });
  return [...grupos.values()].map(caso => {
    const activos = caso.reportes.filter(esActivo);
    const prioritario = activos.some(r => r.prioridad_confirmada && r.prioridad === 'ALTA');
    const sinTutor = activos.some(r => !r.tutor_destinatario_id && !r.tutor_destinatario);
    const sinSeguimiento = activos.some(r => sinAccion.has(r.estado));
    const atrasado = activos.some(r => sinAccion.has(r.estado) && fecha(r.creado_en) && Date.now() - fecha(r.creado_en).getTime() >= 3 * 86400000);
    const fechas = (activos.length ? activos : caso.reportes).map(r => fecha(r.creado_en)?.getTime()).filter(t => t != null);
    return { ...caso, activos, prioritario, sinTutor, sinSeguimiento, atrasado,
      repetidos: !caso.grupal && activos.length > 1,
      enSeguimiento: activos.some(r => ['EN_SEGUIMIENTO', 'REUNION_SOLICITADA', 'CANALIZADO'].includes(r.estado)),
      resuelto: !activos.length && caso.reportes.some(r => ['ATENDIDO', 'CERRADO'].includes(r.estado)),
      cerradoAdministrativo: caso.reportes.every(r => r.estado === 'CERRADO_ADMINISTRATIVO'),
      primero: fechas.length ? Math.min(...fechas) : null, reciente: fechas.length ? Math.max(...fechas) : null,
      rango: prioritario ? 4 : sinTutor ? 3 : atrasado ? 2 : sinSeguimiento ? 1 : 0,
    };
  });
}
export const coincideFiltro = (c, filtro) => ({ TODOS: true, PENDIENTES: !!c.activos.length, PRIORITARIOS: c.prioritario, SIN_SEGUIMIENTO: c.sinSeguimiento, REPETIDOS: c.repetidos, SIN_TUTOR: c.sinTutor, EN_SEGUIMIENTO: c.enSeguimiento, RESUELTOS: c.resuelto, CIERRE_ADMIN: c.cerradoAdministrativo }[filtro] ?? c.reportes.some(r => r.estado === filtro));
export function filtrarCasos(casos, filtro, busqueda, orden) {
  const q = normalizar(busqueda).trim();
  return casos.filter(c => coincideFiltro(c, filtro) && (!q || c.reportes.some(r => [r.alumno_nombre, r.matricula, r.materia, r.reportado_por, r.tutor_destinatario, r.titulo].some(v => normalizar(v).includes(q)))))
    .sort((a, b) => {
      if (orden === 'PRIORIDAD' && a.rango !== b.rango) return b.rango - a.rango;
      const campo = orden === 'RECIENTE' ? 'reciente' : 'primero';
      if (a[campo] == null || b[campo] == null) return a[campo] == null ? (b[campo] == null ? 0 : 1) : -1;
      return (orden === 'RECIENTE' ? b[campo] - a[campo] : a[campo] - b[campo]) || a.key.localeCompare(b.key);
    });
}
export function eventosCaso(caso) {
  const eventos = [];
  caso.reportes.forEach(r => {
    [['creado_en', 'Reporte enviado'], ['recibido_en', 'Lectura registrada por el tutor'], ['reasignado_en', 'Tutor reasignado'], ['ultimo_recordatorio_en', 'Último recordatorio enviado'], ['cerrado_en', r.estado === 'CERRADO_ADMINISTRATIVO' ? 'Cierre administrativo' : 'Atención registrada']].forEach(([campo, label]) => {
      const date = fecha(r[campo]);
      if (date) eventos.push({ key: `${r.id}:${campo}`, date, label, reporte: r });
    });
  });
  return eventos.sort((a, b) => a.date - b.date);
}
