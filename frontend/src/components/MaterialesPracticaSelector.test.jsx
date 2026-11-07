import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MaterialesPracticaSelector from './MaterialesPracticaSelector';
import api from '../hooks/useApi';
jest.mock('../hooks/useApi', () => ({ get: jest.fn() }));
const catalogo = [
  { clave: 'insumo:1', insumo_id: 1, nombre: 'Alcohol', codigo: 'CAS-1', tipo: 'REACTIVO', unidad: 'ml', existencia: 6, disponible: 6, estado: 'Disponible' },
  { clave: 'insumo:2', insumo_id: 2, nombre: 'Guantes', tipo: 'MATERIAL', unidad: 'PAR', existencia: 0, disponible: 0, estado: 'Sin existencias' },
  { clave: 'activo:3', activo_id: 3, nombre: 'Balanza analítica', codigo: 'EQ-3', tipo: 'EQUIPO', unidad: 'PIEZA', existencia: 1, disponible: 1, estado: 'Disponible' },
];
let root, container, cambios;
function Harness() {
  const [materiales, setMateriales] = useState([{ insumo_id: '', descripcion: '', cantidad_solicitada: '', unidad: 'PIEZA' }]);
  return <MaterialesPracticaSelector laboratorioId={7} materiales={materiales} onChange={m => { cambios(m); setMateriales(m); }} />;
}
const render = async () => act(async () => root.render(<Harness />));
const input = async (element, value) => act(async () => {
  const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const click = async text => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text)).click());
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  cambios = jest.fn(); api.get.mockResolvedValue({ data: catalogo });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test('busca por nombre sin acentos, código y tipo; permite incluir agotados', async () => {
  await render();
  expect(api.get).toHaveBeenCalledWith('/practicas-laboratorio/catalogo-materiales?laboratorio_id=7');
  expect(container.querySelector('[aria-label="Insumo del catálogo"]').textContent).not.toContain('Guantes');
  await input(container.querySelector('input[type="search"]'), 'analitica');
  expect(container.querySelector('[aria-label="Insumo del catálogo"]').textContent).toContain('Balanza');
  expect(container.querySelector('[aria-label="Insumo del catálogo"]').textContent).not.toContain('Alcohol');
  await input(container.querySelector('input[type="search"]'), 'CAS-1');
  expect(container.querySelector('[aria-label="Insumo del catálogo"]').textContent).toContain('Alcohol');
  await input(container.querySelector('input[type="search"]'), '');
  await act(async () => container.querySelector('input[type="checkbox"]').click());
  expect(container.querySelector('[aria-label="Insumo del catálogo"]').textContent).toContain('Guantes');
  await input(container.querySelectorAll('select')[0], 'EQUIPO');
  expect(container.querySelector('[aria-label="Insumo del catálogo"]').textContent).not.toContain('Alcohol');
});

test('avisa faltantes sumando filas repetidas y conserva selección al filtrar', async () => {
  await render();
  await input(container.querySelector('[aria-label="Insumo del catálogo"]'), 'insumo:1');
  await input(container.querySelector('[aria-label="Cantidad"]'), '4');
  await click('Agregar material');
  await input(container.querySelectorAll('[aria-label="Insumo del catálogo"]')[1], 'insumo:1');
  await input(container.querySelectorAll('[aria-label="Cantidad"]')[1], '6');
  expect(container.textContent).toContain('Faltan 4 ml');
  await input(container.querySelector('input[type="search"]'), 'Nada coincide');
  expect(container.querySelector('[aria-label="Insumo del catálogo"]').value).toBe('insumo:1');
  expect(container.querySelector('[aria-label="Descripción"]').readOnly).toBe(true);
});

test('equipo conserva código y nota para responsable; captura libre queda pendiente', async () => {
  await render();
  await input(container.querySelector('[aria-label="Insumo del catálogo"]'), 'activo:3');
  let material = cambios.mock.calls.at(-1)[0][0];
  expect(material.insumo_id).toBe('');
  expect(material.descripcion).toContain('EQ-3');
  expect(material.nota).toContain('Equipo de inventario: EQ-3');
  await input(container.querySelector('[aria-label="Insumo del catálogo"]'), '');
  expect(cambios.mock.calls.at(-1)[0][0].nota).toContain('pendiente de confirmar');
  expect(container.querySelector('[aria-label="Descripción"]').readOnly).toBe(false);
});

test('distingue error de catálogo vacío y permite reintentar', async () => {
  api.get.mockRejectedValueOnce(new Error('Sin red'));
  await render();
  expect(container.textContent).toContain('No se pudo consultar el inventario');
  expect(container.textContent).not.toContain('No hay materiales ni equipos registrados');
  api.get.mockResolvedValueOnce({ data: [] });
  await click('Reintentar');
  expect(container.textContent).toContain('No hay materiales ni equipos registrados');
  expect(container.textContent).not.toContain('No se pudo consultar el inventario');
});
