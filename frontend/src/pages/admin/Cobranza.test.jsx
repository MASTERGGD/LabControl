import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import api from '../../hooks/useApi';
import Cobranza from './Cobranza';

jest.mock('../../components/AdminLayout', () => ({ __esModule: true, default: ({ children }) => children }));
jest.mock('../../hooks/useApi', () => ({ __esModule: true, default: { get: jest.fn() } }));

test('muestra coincidencias al escribir e ignora respuestas de búsquedas anteriores', async () => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let responderAnterior;
  api.get.mockImplementation((url, options) => {
    if (url === '/cobranza') return Promise.resolve({ data: [{ id: 1 }] });
    if (url.endsWith('/conceptos')) return Promise.resolve({ data: [] });
    if (options.params.q === 'Al') return new Promise(resolve => { responderAnterior = resolve; });
    return Promise.resolve({ data: [{ id: 7, nombre: 'Alumna Ejemplo', matricula: 'TEST007', periodo: 'SEP-DIC 2026' }] });
  });
  const escribir = async valor => act(async () => {
    const input = host.querySelector('input[type="search"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  try {
    await act(async () => root.render(<Cobranza />));
    await escribir('Al');
    await act(async () => jest.advanceTimersByTime(300));
    await escribir('Alumna');
    await act(async () => jest.advanceTimersByTime(300));
    await act(async () => responderAnterior({
      data: [{ id: 8, nombre: 'Resultado anterior', matricula: 'TEST008', periodo: 'SEP-DIC 2026' }],
    }));
    const lista = host.querySelector('ul[aria-label="Coincidencias de alumnos"]');
    expect(lista.textContent).toContain('TEST007');
    expect(lista.textContent).not.toContain('TEST008');
    await act(async () => lista.querySelector('button').click());
    expect(host.querySelector('input[type="search"]')).toBeNull();
    expect(host.textContent).toContain('Cambiar alumno');
    expect(host.textContent).toContain('TEST007');
  } finally {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  }
});
