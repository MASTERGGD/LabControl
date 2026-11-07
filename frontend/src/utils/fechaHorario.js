import { todayISOInMexico } from './timezone';

export const DIAS_HORARIO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function validarFechaHorario(fecha, diaSemana, hoy = todayISOInMexico()) {
  if (!fecha) return '';
  const fechaDate = new Date(`${fecha}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(fechaDate.getTime()) || fechaDate.toISOString().slice(0, 10) !== fecha) return 'Selecciona una fecha válida.';
  if ((fechaDate.getUTCDay() + 6) % 7 !== diaSemana) return `Este horario corresponde al ${DIAS_HORARIO[diaSemana].toLowerCase()}. Selecciona una fecha que coincida.`;
  if (fecha < hoy) return 'Selecciona una fecha de hoy en adelante.';
  return '';
}

export function primeraFechaHorario(diaSemana, hoy = todayISOInMexico()) {
  const fecha = new Date(`${hoy}T12:00:00Z`);
  const dia = (fecha.getUTCDay() + 6) % 7;
  fecha.setUTCDate(fecha.getUTCDate() + (diaSemana - dia + 7) % 7);
  return fecha.toISOString().slice(0, 10);
}
