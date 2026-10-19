import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { DrawerDetalle } from './Mantenimiento';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({ put: jest.fn(), post: jest.fn() }));
jest.mock('../../components/AdminLayout', () => () => null);
jest.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ themeKey: 'day' }) }));
jest.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast: jest.fn() }) }));

let container;
let root;
const button = text => [...container.querySelectorAll('button')].find(el => el.textContent.trim() === text);
const click = async text => act(async () => button(text).click());
const input = (selector, value) => act(() => {
  const el = container.querySelector(selector);
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const render = (estado = 'EN_REVISION') => act(() => root.render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <DrawerDetalle incidente={{ id: 12, estado, prioridad: 'MEDIA', computadora_id: 12,
      pc_codigo: 'PC-12', fecha_reporte: '2026-09-25', seguimientos: [] }}
      laboratorios={[]} onClose={jest.fn()} onActualizado={jest.fn()} />
  </MemoryRouter>
));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.put.mockImplementation(async (url, payload) => ({ data: {
    estado: payload.estado, seguimientos: payload.notas_seguimiento
      ? [{ id: 1, texto: payload.notas_seguimiento }] : [],
  } }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

test('cierra con nota y costo en una sola solicitud', async () => {
  render();
  await click('Cerrar incidencia');
  expect(api.put).not.toHaveBeenCalled();
  expect(button('💾 Guardar')).toBeUndefined();
  input('textarea', 'Se cambió el cable de red y se verificó la conexión.');
  input('input[type="number"]', '150');
  await click('Guardar y cerrar');
  expect(api.put).toHaveBeenLastCalledWith('/inventario/incidentes/12', {
    estado: 'CERRADO', prioridad: 'MEDIA', costo_reparacion: 150,
    notas_seguimiento: 'Se cambió el cable de red y se verificó la conexión.',
  });
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.post).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Incidencia cerrada. No hay cambios pendientes.');
  ['Marcar reparado', 'Confirmar cierre', 'Guardar y cerrar', '💾 Guardar', 'Editar detalles avanzados'].forEach(text => expect(button(text)).toBeUndefined());
  expect(button('Listo')).toBeDefined();
  expect(button('Reabrir incidencia')).toBeDefined();
});

test('cancelar el cierre conserva el estado original', async () => {
  render('EN_REVISION');
  await click('Cerrar incidencia');
  await click('Cancelar cierre');
  expect(api.put).not.toHaveBeenCalled();
  expect(button('Cerrar incidencia')).toBeDefined();
});

test('abrir el cierre no cambia el estado antes de guardar', async () => {
  render();
  await click('Cerrar incidencia');
  expect(api.put).not.toHaveBeenCalled();
  expect(button('Guardar y cerrar')).toBeDefined();
});

test('rechaza costos negativos antes de cerrar', async () => {
  render('REPARADO');
  await click('Cerrar incidencia');
  input('textarea', 'Reparación verificada');
  input('input[type="number"]', '-1');
  await click('Guardar y cerrar');
  expect(api.put).not.toHaveBeenCalled();
  expect(container.textContent).toContain('mayor o igual a cero');
});

test('un cierre fallido conserva la nota y permite reintentar', async () => {
  render('EN_REVISION');
  await click('Cerrar incidencia');
  await click('Guardar y cerrar');
  expect(api.put).not.toHaveBeenCalled();
  input('textarea', 'Reparación verificada');
  api.put.mockRejectedValueOnce({ response: { data: { detail: 'No fue posible guardar' } } });
  await click('Guardar y cerrar');
  expect(container.textContent).toContain('No fue posible guardar');
  expect(container.querySelector('textarea').value).toBe('Reparación verificada');
  expect(button('Guardar y cerrar')).toBeDefined();
  await click('Guardar y cerrar');
  expect(button('Listo')).toBeDefined();
});

test('una incidencia cerrada permite agregar seguimiento sin editar su estado', async () => {
  render('CERRADO');
  expect(button('Cerrar incidencia')).toBeUndefined();
  await click('Agregar nota al seguimiento');
  input('textarea', 'Se confirmó que el equipo funciona');
  api.post.mockResolvedValueOnce({ data: { seguimientos: [{ id: 2, texto: 'Se confirmó que el equipo funciona' }] } });
  await click('Guardar en historial');
  expect(api.put).not.toHaveBeenCalled();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(button('Listo')).toBeDefined();
});
