import { formatCarrera, formatNombre } from './presentacion';

test('presenta nombres institucionales sin mayúsculas sostenidas', () => {
  expect(formatNombre('ARCOS PASCUAL KEVIN DEL ANGEL')).toBe('Arcos Pascual Kevin del Angel');
  expect(formatNombre('MARÍA DE LA CRUZ')).toBe('María de la Cruz');
});

test('resume carreras frecuentes y conserva el nombre para consulta', () => {
  expect(formatCarrera('TÉCNICO SUPERIOR UNIVERSITARIO EN INTELIGENCIA ARTIFICIAL')).toBe('TSU IA');
  expect(formatCarrera('LICENCIATURA EN INGENIERÍA EN DESARROLLO Y GESTIÓN DE SOFTWARE')).toBe('DGS');
  expect(formatCarrera('TÉCNICO SUPERIOR UNIVERSITARIO EN AGRICULTURA SUSTENTABLE Y PROTEGIDA')).toBe('ASP');
});
