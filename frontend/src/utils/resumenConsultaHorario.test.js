import { abreviarCarrera, esDemo, ordenarResultados, resumenConsultaHorario } from './resumenConsultaHorario';
const clase = { tipo_actividad: 'CLASE', salon: 'Salón 14', hora_inicio: '10:15', hora_fin: '12:00' };
const contexto = { es_actual: true, fecha: '2026-09-03', hora_consulta: '10:30' };
const persona = { nombre: 'Pérez Juan', semana: [clase], jornada: [clase], actividades_actuales: [] };
test('distingue vacíos, libre y jornada terminada', () => {
  expect(resumenConsultaHorario({ ...persona, semana: [] }, contexto).titulo).toBe('Sin carga');
  expect(resumenConsultaHorario(persona, { ...contexto, calendario_hoy: { requiere_asistencia: false, motivo: 'Suspensión' } }).titulo).toBe('Día no lectivo');
  expect(resumenConsultaHorario({ ...persona, jornada: [] }, contexto).titulo).toBe('Sin clases hoy');
  expect(resumenConsultaHorario(persona, { ...contexto, hora_consulta: '12:00' }).titulo).toBe('Jornada terminada');
  expect(resumenConsultaHorario(persona, contexto).titulo).toBe('Libre');
  expect(resumenConsultaHorario(persona, { ...contexto, es_actual: false }).titulo).toBe('Otro periodo');
});
test('clase da salón y fin; receso oculta la ubicación incluso si llega un salón', () => {
  expect(resumenConsultaHorario({ ...persona, actividades_actuales: [clase] }, contexto)).toMatchObject({ titulo: 'Salón 14', detalle: 'hasta 12:00', estado: 'En clase' });
  const resumen = resumenConsultaHorario({ ...persona, actividades_actuales: [{ ...clase, tipo_actividad: 'RECESO' }] }, contexto);
  expect(resumen.titulo).toBe('Receso');
  expect(resumen.detalle).toContain('Sin ubicación');
  expect(JSON.stringify({ titulo: resumen.titulo, detalle: resumen.detalle })).not.toContain('Salón 14');
});
test('ordena homónimos poniendo a quien está en clase primero y marca las demos', () => {
  const demo = { ...persona, nombre: 'Pérez (demo)', semana: [] };
  const ocupado = { ...persona, nombre: 'Pérez Z', actividades_actuales: [clase] };
  expect(ordenarResultados([demo, persona, ocupado], contexto)).toEqual([ocupado, persona, demo]);
  expect(esDemo(demo)).toBe(true);
  expect(esDemo(persona)).toBe(false);
});
test('abrevia las carreras extensas', () => {
  expect(abreviarCarrera('LICENCIATURA EN INGENIERÍA EN TECNOLOGÍAS DE LA INFORMACIÓN E INNOVACIÓN DIGITAL')).toBe('TIID');
  expect(abreviarCarrera('TÉCNICO SUPERIOR UNIVERSITARIO EN INTELIGENCIA ARTIFICIAL')).toBe('TSU IA');
});
