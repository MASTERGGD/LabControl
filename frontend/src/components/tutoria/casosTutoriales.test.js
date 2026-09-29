import { agruparCasos, filtrarCasos, coincideFiltro, eventosCaso, fecha } from './casosTutoriales';

const reporte = (id, overrides = {}) => ({ id, alumno_id: id, alumno_nombre: 'Alumno', estado: 'ENVIADO', creado_en: '2026-09-01T12:00:00', tutor_destinatario_id: 7, ...overrides });

test('agrupa por identidad y conserva el expediente completo al buscar una materia', () => {
  const casos = agruparCasos([reporte(1, { alumno_id: 8, materia: 'Álgebra' }), reporte(2, { alumno_id: 8, materia: 'Historia', estado: 'CERRADO' }), reporte(3)]);
  const resultado = filtrarCasos(casos, 'PENDIENTES', 'algebra', 'PRIORIDAD');
  expect(resultado).toHaveLength(1);
  expect(resultado[0].reportes).toHaveLength(2);
  expect(resultado[0].activos).toHaveLength(1);
  expect(resultado[0].repetidos).toBe(false);
});

test('no mezcla incidencias grupales ni alumnos con nombres iguales', () => {
  const casos = agruparCasos([reporte(1), reporte(2), reporte(3, { alumno_id: null }), reporte(4, { alumno_id: null })]);
  expect(casos).toHaveLength(4);
  expect(casos.every(c => !c.repetidos)).toBe(true);
});

test('prioridad confirmada precede a casos antiguos; prioridad histórica no se presume', () => {
  const casos = agruparCasos([reporte(1, { prioridad: 'ALTA', prioridad_confirmada: false }), reporte(2, { prioridad: 'ALTA', prioridad_confirmada: true, creado_en: '2026-09-28T12:00:00' })]);
  expect(filtrarCasos(casos, 'TODOS', '', 'PRIORIDAD')[0].key).toBe('alumno:2');
  expect(filtrarCasos(casos, 'PRIORITARIOS', '', 'PRIORIDAD')).toHaveLength(1);
  expect(filtrarCasos(casos, 'TODOS', '', 'ANTIGUO')[0].key).toBe('alumno:1');
  expect(filtrarCasos(casos, 'TODOS', '', 'RECIENTE')[0].key).toBe('alumno:2');
});

test('canalizado sigue activo y cierre administrativo no se cuenta como resuelto', () => {
  const [canalizado, admin, resuelto] = agruparCasos([reporte(1, { estado: 'CANALIZADO' }), reporte(2, { estado: 'CERRADO_ADMINISTRATIVO' }), reporte(3, { estado: 'CERRADO' })]);
  expect(coincideFiltro(canalizado, 'PENDIENTES')).toBe(true);
  expect(coincideFiltro(canalizado, 'EN_SEGUIMIENTO')).toBe(true);
  expect(coincideFiltro(admin, 'RESUELTOS')).toBe(false);
  expect(coincideFiltro(admin, 'CIERRE_ADMIN')).toBe(true);
  expect(coincideFiltro(resuelto, 'RESUELTOS')).toBe(true);
});

test('lecturas y recordatorios no acreditan seguimiento; eventos quedan en orden cronológico', () => {
  const [caso] = agruparCasos([reporte(1, { estado: 'RECIBIDO', recibido_en: '2026-09-03T12:00:00', ultimo_recordatorio_en: '2026-09-05T12:00:00', actualizado_en: '2026-09-06T12:00:00' }), reporte(2, { alumno_id: 1, creado_en: '2026-09-02T12:00:00' })]);
  expect(caso.sinSeguimiento).toBe(true);
  expect(caso.repetidos).toBe(true);
  expect(eventosCaso(caso).map(e => e.key)).toEqual(['1:creado_en', '2:creado_en', '1:recibido_en', '1:ultimo_recordatorio_en']);
});

test('fechas inválidas quedan al final y se respetan los offsets', () => {
  expect(fecha('2026-09-01T06:00:00-06:00').getTime()).toBe(fecha('2026-09-01T12:00:00').getTime());
  expect(fecha('desconocida')).toBeNull();
  const casos = agruparCasos([reporte(1, { creado_en: null }), reporte(2)]);
  expect(filtrarCasos(casos, 'TODOS', '', 'ANTIGUO')[1].key).toBe('alumno:1');
});
