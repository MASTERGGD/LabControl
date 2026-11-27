import { resumenParaDocente, sesionesPorAtender } from './pendientesAcademicos';

test('cuenta una sesión abierta una sola vez y conserva horarios distintos del mismo día al copiar', () => {
  const carga = {
    materia: 'Minería de Texto', grupo: '4° A', hora_inicio: '09:00', hora_fin: '10:00',
    resumen: {
      fechas_sin_registro: ['2026-11-17', '2026-11-24'],
      sesiones: [{ fecha: '2026-11-17', estado: 'ABIERTA' }],
      detalle_no_impartidas: [
        { fecha: '2026-11-03', estado_reposicion: 'NO_REQUERIDA' },
        { fecha: '2026-11-10', estado_reposicion: 'PENDIENTE' },
      ],
    },
  };
  expect(sesionesPorAtender(carga).map(fila => fila.tipo)).toEqual(['reposicion', 'abierta', 'faltante']);
  const texto = resumenParaDocente('Docente de prueba', 'SEP-DIC 2026', [carga, {
    ...carga, hora_inicio: '12:00', hora_fin: '13:00',
    resumen: { fechas_sin_registro: ['2026-11-17'] },
  }]);
  expect(texto).toContain('2026-11-17 · 09:00–10:00 · Terminar el registro');
  expect(texto).toContain('2026-11-17 · 12:00–13:00 · Revisar la fecha');
  expect(texto).not.toContain('2026-11-03');
  expect(texto.match(/2026-11-17/g)).toHaveLength(2);
});

test('separa programas y distingue referencias internas cuando el rótulo coincide', () => {
  const carga = { materia: 'Inglés IX', materia_id: 9, grupo: '10° A', resumen: { fechas_sin_registro: ['2026-11-24'] } };
  const texto = resumenParaDocente('Docente', 'SEP-DIC 2026', [
    { ...carga, grupo_id: 1, programa_educativo: 'Ingeniería Industrial' },
    { ...carga, grupo_id: 2, programa_educativo: 'Ingeniería Industrial' },
    { ...carga, grupo_id: 3, programa_educativo: 'Agroindustria' },
  ]);
  expect(texto).toContain('Inglés IX · 10.º A · Ingeniería Industrial · Grupo #1');
  expect(texto).toContain('Inglés IX · 10.º A · Ingeniería Industrial · Grupo #2');
  expect(texto).toContain('Inglés IX · 10.º A · Agroindustria');
});
