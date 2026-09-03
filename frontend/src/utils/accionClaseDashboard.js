import { MEXICO_TIME_ZONE, todayISOInMexico } from './timezone';

export function accionClaseDashboard(item, fecha, ahora = new Date()) {
  if (item.estado === 'NO_LECTIVA' || item.calendario?.requiere_asistencia === false || item.calendario?.permite_iniciar_clase === false) {
    return { texto: 'Ver calendario', path: '/calendario-academico' };
  }
  if (item.clase_id) {
    return { texto: ['EN_CURSO', 'CORRECCION'].includes(item.estado) ? 'Continuar clase' : 'Ver clase', path: `/docente/clase/${item.clase_id}` };
  }
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: MEXICO_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(ahora);
  const valor = tipo => Number(partes.find(p => p.type === tipo)?.value);
  const minutos = valor('hour') * 60 + valor('minute') + valor('second') / 60;
  const hora = texto => { const [h, m] = String(texto).split(':').map(Number); return h * 60 + m; };
  if (fecha === todayISOInMexico(ahora) && ['PROGRAMADA', 'SIN_REGISTRO'].includes(item.estado)
      && minutos >= hora(item.hora_inicio) - 15 && minutos <= hora(item.hora_fin) + 15) {
    return { texto: 'Iniciar clase', iniciar: true };
  }
  return { texto: 'Ver horario', path: '/docente/horario' };
}
