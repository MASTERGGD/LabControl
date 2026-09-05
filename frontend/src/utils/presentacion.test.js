import { formatAsistencia, formatCarrera, formatNombre } from './presentacion';

test('presenta nombres institucionales sin mayúsculas sostenidas', () => {
  expect(formatNombre('ARCOS PASCUAL KEVIN DEL ANGEL')).toBe('Arcos Pascual Kevin del Angel');
  expect(formatNombre('MARÍA DE LA CRUZ')).toBe('María de la Cruz');
});

test('resume carreras frecuentes y conserva el nombre para consulta', () => {
  expect(formatCarrera('TÉCNICO SUPERIOR UNIVERSITARIO EN INTELIGENCIA ARTIFICIAL')).toBe('TSU IA');
  expect(formatCarrera('LICENCIATURA EN INGENIERÍA EN DESARROLLO Y GESTIÓN DE SOFTWARE')).toBe('DGS');
  expect(formatCarrera('TÉCNICO SUPERIOR UNIVERSITARIO EN AGRICULTURA SUSTENTABLE Y PROTEGIDA')).toBe('ASP');
});

test('distingue ausencia de registros y una muestra insuficiente', () => {
  expect(formatAsistencia(null, 0)).toMatchObject({ texto: 'Sin registro', corto: '—', estado: 'SIN_REGISTRO' });
  expect(formatAsistencia(100, 2)).toMatchObject({ texto: '100%', estado: 'MUESTRA_INSUFICIENTE' });
  expect(formatAsistencia(75, 3)).toMatchObject({ texto: '75%', estado: 'CON_DATOS', clase: 'text-red-400' });
});
