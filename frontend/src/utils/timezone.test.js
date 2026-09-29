import { formatDateInMexico, todayISOInMexico } from './timezone';

test('la fecha académica del 28 de septiembre no retrocede al 27', () => {
  expect(formatDateInMexico('2026-09-28', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('28/09/2026');
  expect(formatDateInMexico('2026-09-28', { weekday: 'long' })).toBe('lunes');
});

test('los instantes UTC sí se convierten a la fecha de México', () => {
  expect(todayISOInMexico(new Date('2026-09-29T02:00:00Z'))).toBe('2026-09-28');
  expect(formatDateInMexico('2026-09-29T02:00:00', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('28/09/2026');
});
