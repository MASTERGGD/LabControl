import { primeraFechaHorario, validarFechaHorario } from './fechaHorario';

test('el mínimo es el siguiente día del horario, incluso al cambiar de mes o año', () => {
  expect(primeraFechaHorario(2, '2026-11-06')).toBe('2026-11-11');
  expect(primeraFechaHorario(2, '2026-11-11')).toBe('2026-11-11');
  expect(primeraFechaHorario(0, '2026-12-31')).toBe('2027-01-04');
});

test('valida día, fecha real y pasado sin depender de la zona horaria del navegador', () => {
  expect(validarFechaHorario('2026-11-07', 2, '2026-11-06')).toContain('miércoles');
  expect(validarFechaHorario('2026-11-11', 2, '2026-11-06')).toBe('');
  expect(validarFechaHorario('2026-11-04', 2, '2026-11-06')).toContain('hoy en adelante');
  expect(validarFechaHorario('2026-02-30', 0, '2026-01-01')).toContain('fecha válida');
  expect(validarFechaHorario('', 2, '2026-11-06')).toBe('');
});
