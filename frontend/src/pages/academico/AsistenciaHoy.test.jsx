import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AsistenciaHoy, { csvAsistencia } from './AsistenciaHoy';
import api from '../../hooks/useApi';

jest.mock('../../components/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../../context/PeriodoContext', () => ({ usePeriodo: () => ({ periodo: { id: 1, clave: 'SEP-DIC 2026' } }) }));
jest.mock('../../hooks/useApi', () => ({ get: jest.fn() }));

const data = {
  fecha: '2026-09-22', corte: '2026-09-22T10:30:00-06:00', periodo: { id: 1, clave: 'SEP-DIC 2026' },
  carreras_disponibles: ['IA'], carreras: [], grupos: [], criterio: 'Solo listas cerradas',
  resumen: { asistentes: 3, grupos_con_lista: 1, grupos_sin_lista: 2, grupos_por_iniciar: 1, listas_confirmadas: 2, listas_pendientes: 2 },
};

test('exporta el mismo corte e impide interpretar nombres como fórmulas', () => {
  const csv = csvAsistencia({ ...data, grupos: [{ carrera: '=1+1', nombre: '1° "A"', estado: 'SIN_LISTA', asistentes: 0 }] });
  expect(csv).toContain('"Alumnos únicos con asistencia","3"');
  expect(csv).toContain('"\'=1+1"');
  expect(csv).toContain('"1° ""A"""');
  expect(csv).toContain('Solo listas cerradas');
});

test('consulta el corte, filtra por carrera y no muestra datos anteriores ante un error', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockResolvedValue({ data });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AsistenciaHoy /></MemoryRouter>));
    expect(container.textContent).toContain('3 alumnos únicos');
    await act(async () => {
      const select = container.querySelector('select');
      select.value = 'IA'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(api.get).toHaveBeenLastCalledWith('/reportes-academicos/asistencia-diaria', { params: { periodo_id: 1, carrera: 'IA' } });
    api.get.mockRejectedValueOnce(new Error('offline'));
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Actualizar corte').click());
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('3 alumnos únicos');
    expect([...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Exportar')).disabled).toBe(true);
  } finally {
    act(() => root.unmount()); container.remove();
  }
});
