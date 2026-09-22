import { fusionarHistorialDescargado } from './OfflineDocenteConsultas';

test('el historial distingue una captura local pendiente y conserva el corte descargado', () => {
  const servidor = [{ id: 1, fecha: '2026-09-21', estado: 'CERRADA', carga: { id: 8, hora_inicio: '08:00' } }];
  const snapshots = [{ data: { clase: { id: 'local-9-2026-09-22', es_local: true, fecha: '2026-09-22', estado: 'CERRADA', carga: { id: 9, hora_inicio: '10:15' } } } }];
  const cola = [{ kind: 'OFFLINE_CLASS', data: { carga_id: 9, fecha: '2026-09-22' } }];

  const resultado = fusionarHistorialDescargado(servidor, snapshots, cola);

  expect(resultado).toHaveLength(2);
  expect(resultado[0].pendienteLocal).toBe(true);
  expect(resultado[1].pendienteLocal).toBe(false);
});

test('una clase local no duplica el mismo bloque descargado', () => {
  const servidor = [{ id: 1, fecha: '2026-09-22', estado: 'ABIERTA', carga: { id: 8 } }];
  const snapshots = [{ data: { clase: { id: 'local-8-2026-09-22', es_local: true, fecha: '2026-09-22', estado: 'CERRADA', carga: { id: 8 } } } }];
  expect(fusionarHistorialDescargado(servidor, snapshots, [])).toHaveLength(1);
});
