import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import HistorialClasesDocente from './HistorialClasesDocente';
import api from '../../hooks/useApi';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));
jest.mock('../../components/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/AgendaPracticasDocente', () => () => null);
jest.mock('../../hooks/useApi', () => ({ get: jest.fn() }));

const motivo = 'Desfile del 20 de noviembre';
const base = {
  id: 1, estado: 'NO_IMPARTIDA', fecha: '2026-11-20', motivo_no_impartida: motivo,
  estado_reposicion: 'NO_REQUERIDA', resumen: { total: 0 },
  carga: { actividad_nombre: 'Minería de Texto', grupo: '7° A', periodo: 'SEP-DIC 2026', hora_inicio: '10:15', hora_fin: '12:00' },
};

let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.resetAllMocks();
});

async function abrirHistorial(clases) {
  api.get.mockResolvedValue({ data: clases });
  await act(async () => root.render(<HistorialClasesDocente />));
  return host.querySelector('button[aria-expanded="false"].grid');
}

test('prioriza motivo y reposición y omite la nota automática repetida', async () => {
  const fila = await abrirHistorial([{
    ...base, observacion_general: `Clase no impartida\nReposicion no requerida: ${motivo}`,
  }]);
  expect(fila.textContent).toContain(motivo);
  expect(fila.textContent).toContain('Sin reposición');
  expect(fila.textContent).not.toMatch(/Sin tema registrado|0 alumnos|Nota/);
  await act(async () => fila.click());
  const detalle = fila.parentElement.querySelector('dl');
  expect(detalle.textContent).toContain('SEP-DIC 2026');
  expect(detalle.textContent).not.toMatch(/Cumplimiento|Observación adicional/);
  expect(detalle.textContent.split(motivo)).toHaveLength(2);
});

test('conserva una observación distinta y reconoce la reposición vinculada', async () => {
  const reposicion = {
    ...base, id: 2, fecha: '2026-11-27', estado: 'PROGRAMADA',
    es_reposicion: true, clase_origen_id: 1, estado_reposicion: 'PROGRAMADA',
  };
  const fila = await abrirHistorial([{
    ...base, estado_reposicion: 'PENDIENTE',
    observacion_general: `Clase no impartida: ${motivo}\nSe avisó al grupo por el canal institucional.`,
  }, reposicion]);
  expect(fila.textContent).toContain('Reposición programada');
  await act(async () => fila.click());
  expect(fila.parentElement.querySelector('dl').textContent).toContain('Se avisó al grupo por el canal institucional.');
});

test('conserva tema, asistencia y avance de una clase impartida', async () => {
  const fila = await abrirHistorial([{
    ...base, estado: 'CERRADA', motivo_no_impartida: null,
    resumen: { total: 10, presente: 9 }, bitacora: { tema_impartido: 'Evaluación', avance_planeacion: 80 },
  }]);
  expect(fila.textContent).toContain('Evaluación');
  expect(fila.textContent).toContain('90%');
  await act(async () => fila.click());
  expect(fila.parentElement.textContent).toContain('80%');
});
