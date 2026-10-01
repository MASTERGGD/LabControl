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
  resumen: { asistentes: 3, a_tiempo: 2, retardos: 1, faltaron: 0, justificados: 1, grupos_con_lista: 1, grupos_sin_lista: 2, grupos_por_iniciar: 1, listas_confirmadas: 2, listas_pendientes: 2 },
};

test('exporta el mismo corte e impide interpretar nombres como fórmulas', () => {
  const csv = csvAsistencia({ ...data, grupos: [{ carrera: '=1+1', nombre: '1° "A"', estado: 'SIN_LISTA', asistentes: 0 }] });
  expect(csv).toContain('"Alumnos únicos con asistencia","3"');
  expect(csv).toContain('"\'=1+1"');
  expect(csv).toContain('"1° ""A"""');
  expect(csv).toContain('Solo listas cerradas');
  expect(csv).toContain('"Con retardo","1"');
  expect(csv).toContain('"Faltaron al corte","0"');
});

test('consulta el corte, filtra por carrera y no muestra datos anteriores ante un error', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockResolvedValue({ data });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AsistenciaHoy /></MemoryRouter>));
    expect(container.textContent).toContain('Total de alumnos distintos durante el día: 3');
    expect(container.textContent).toContain('2A tiempo');
    expect(container.textContent).toContain('1Con retardo');
    expect(container.textContent).toContain('0Faltaron al corte');
    await act(async () => {
      const select = container.querySelector('select');
      select.value = 'IA'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(api.get).toHaveBeenLastCalledWith('/reportes-academicos/asistencia-diaria', { params: { periodo_id: 1, carrera: 'IA' } });
    api.get.mockRejectedValueOnce(new Error('offline'));
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Actualizar corte').click());
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Total de alumnos distintos durante el día: 3');
    expect([...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Exportar')).disabled).toBe(true);
  } finally {
    act(() => root.unmount()); container.remove();
  }
});

test('exporta Excel con el periodo y carrera seleccionados', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockResolvedValue({ data });
  const container = document.createElement('div');
  const root = createRoot(container);
  URL.createObjectURL = jest.fn(() => 'blob:excel');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AsistenciaHoy /></MemoryRouter>));
    await act(async () => {
      const select = container.querySelector('select');
      select.value = 'IA'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    api.get.mockResolvedValueOnce({ data: new Blob(['excel']) });
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Exportar Excel con detalle').click());
    expect(api.get).toHaveBeenLastCalledWith('/reportes-academicos/asistencia-diaria/excel', {
      params: { periodo_id: 1, fecha: '2026-09-22', carrera: 'IA' }, responseType: 'blob',
    });
    expect(click).toHaveBeenCalledTimes(1);
    api.get.mockRejectedValueOnce(new Error('offline'));
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Exportar Excel con detalle').click());
    expect(container.querySelector('[role="alert"]').textContent).toContain('No se pudo exportar');
  } finally {
    act(() => root.unmount()); click.mockRestore();
  }
});
