import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AvisoInicioDocente from './AvisoInicioDocente';
import api from '../hooks/useApi';

jest.mock('../hooks/useApi', () => ({ get: jest.fn() }));

const aviso = {
  revision: 'aviso-original', titulo: 'Próximo cierre', mensaje: 'Revisa el avance de tus grupos.',
  destino: 'seguimiento', expira_en: '2026-11-24T00:00:00-06:00',
};

let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers().setSystemTime(new Date('2026-11-23T23:59:55-06:00'));
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  api.get.mockResolvedValue({ data: aviso });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
  jest.resetAllMocks();
});

const mostrar = (id = 42) => act(async () => {
  root.render(<MemoryRouter><AvisoInicioDocente key={id} usuarioId={id} /></MemoryRouter>);
});

test('recuerda el cierre por cuenta y permite ver una versión posterior', async () => {
  await mostrar();
  expect(host.querySelector('a').getAttribute('href')).toBe('/docente/seguimiento');
  await act(async () => host.querySelector('button').click());
  expect(host.textContent).toBe('');
  await mostrar(99);
  expect(host.textContent).toContain('Próximo cierre');
  await mostrar();
  expect(host.textContent).toBe('');
  api.get.mockResolvedValue({ data: { ...aviso, revision: 'aviso-editado' } });
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.textContent).toContain('Próximo cierre');
});

test('lo retira al llegar la hora de vencimiento', async () => {
  await mostrar();
  expect(host.textContent).toContain('Próximo cierre');
  await act(async () => jest.advanceTimersByTime(5000));
  expect(host.textContent).toBe('');
});
