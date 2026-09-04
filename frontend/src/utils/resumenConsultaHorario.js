export { formatCarrera as abreviarCarrera } from './presentacion';

export const esDemo = resultado => /\b(demo|prueba)\b/i.test(resultado.nombre);
export const esNoLectivo = calendario => calendario && (!calendario.requiere_asistencia || !calendario.permite_iniciar_clase);

export function resumenConsultaHorario(resultado, respuesta) {
  const semana = resultado.semana || [];
  const jornada = resultado.jornada || [];
  const base = { color: 'bg-slate-400', prioridad: 5 };
  if (!semana.length) return { ...base, titulo: 'Sin carga', detalle: 'Sin horario activo en este periodo', vacio: 'No tiene carga activa registrada en el periodo seleccionado.' };
  if (!respuesta.es_actual) return { ...base, titulo: 'Otro periodo', detalle: 'Consultar horario semanal', vacio: 'El periodo seleccionado no corresponde a la jornada de hoy.' };
  if (esNoLectivo(respuesta.calendario_hoy)) return { ...base, titulo: 'Día no lectivo', detalle: respuesta.calendario_hoy.motivo || 'Calendario académico', vacio: 'Hoy no se imparten las actividades del horario recurrente por el calendario académico.' };
  const actuales = resultado.actividades_actuales || [];
  const actual = actuales.find(a => a.tipo_actividad === 'CLASE') || actuales[0];
  if (actual) {
    const privada = ['RECESO', 'DESCARGA'].includes(actual.tipo_actividad);
    const estado = { CLASE: 'En clase', TUTORIA: 'Tutoría', RECESO: 'Receso', DESCARGA: 'Descarga académica' }[actual.tipo_actividad] || 'En actividad';
    return { color: privada ? 'bg-amber-400' : 'bg-emerald-400', prioridad: actual.tipo_actividad === 'CLASE' ? 0 : 1,
      titulo: privada ? estado : actual.salon || 'Sin espacio asignado',
      detalle: `hasta ${actual.hora_fin}${privada ? ' · Sin ubicación' : ''}`, estado,
      conflicto: actuales.length > 1, actual };
  }
  const siguiente = resultado.siguiente_actividad;
  const detalle = siguiente ? `${siguiente.fecha === respuesta.fecha ? 'sigue' : siguiente.fecha} ${siguiente.hora_inicio}${siguiente.salon ? ` · ${siguiente.salon}` : ''}` : 'Sin otra actividad próxima';
  if (!jornada.length) return { ...base, titulo: 'Sin clases hoy', detalle, vacio: 'Tiene carga en el periodo, pero no tiene actividades programadas para hoy.' };
  if (jornada.every(a => a.hora_fin <= respuesta.hora_consulta)) return { ...base, titulo: 'Jornada terminada', detalle };
  return { ...base, prioridad: 2, titulo: 'Libre', detalle };
}

export function ordenarResultados(resultados, respuesta) {
  return [...resultados].sort((a, b) => resumenConsultaHorario(a, respuesta).prioridad - resumenConsultaHorario(b, respuesta).prioridad
    || Number(esDemo(a)) - Number(esDemo(b)) || a.nombre.localeCompare(b.nombre, 'es'));
}
