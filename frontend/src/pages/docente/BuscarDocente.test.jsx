import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BuscarDocente from './BuscarDocente';
import api from '../../hooks/useApi';
jest.mock('../../components/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../../context/PeriodoContext', () => ({ usePeriodo: () => ({ periodo: { id: 3, clave: 'SEP-DIC 2026' } }) }));
jest.mock('../../hooks/useApi', () => ({ get: jest.fn() }));
const actividad = { id: 4, dia_semana: 3, actividad: 'Inteligencia artificial', docente: 'Docente Prueba', grupo: '7° A', carrera: 'Tecnologías', salon: 'Salón 14', hora_inicio: '10:15', hora_fin: '12:00' };
const resultado = { grupo_id: 2, nombre: '7° A', carrera: 'Tecnologías', actividades_actuales: [actividad], siguiente_actividad: null, jornada: [actividad], semana: [actividad] };
let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = jest.fn();
  jest.clearAllMocks();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/docencia/consulta-horarios/grupos' ? [{ id: 2, carrera: 'Tecnologías', grupo: '7° A' }, { id: 8, carrera: 'Administración', grupo: '7° A' }] : { fecha: '2026-09-03', hora_consulta: '10:30', periodo: 'SEP-DIC 2026', es_actual: true, resultados: [resultado] } }));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
test('filtra carrera y grupo y muestra docente, espacio y semana usando el selector del tema', async () => {
  await act(async () => root.render(<BuscarDocente />));
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Por grupo').click());
  await act(async () => host.querySelectorAll('[aria-haspopup="listbox"]')[0].click());
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  await act(async () => [...document.querySelectorAll('[role="option"]')].find(o => o.textContent.includes('Tecnologías')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await act(async () => host.querySelectorAll('[aria-haspopup="listbox"]')[1].click());
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await act(async () => document.querySelector('[role="option"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(api.get).toHaveBeenCalledWith('/docencia/consulta-horarios/grupos/2', { params: { periodo_id: 3 } });
  expect(host.textContent).toContain('Docente Prueba');
  expect(host.textContent).toContain('Salón 14');
  expect(host.textContent).toContain('Jornada de hoy');
  expect(host.querySelector('details').textContent).toContain('Jueves');
});
test('buscar nuevamente el mismo docente vuelve a consultar el periodo seleccionado', async () => {
  await act(async () => root.render(<BuscarDocente />));
  await act(async () => {
    const input = host.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Docente');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (let i = 0; i < 2; i++) await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.get.mock.calls.filter(([url]) => url === '/docencia/ubicacion-docentes')).toHaveLength(2);
  expect(api.get).toHaveBeenLastCalledWith('/docencia/ubicacion-docentes', { params: { periodo_id: 3, q: 'Docente' } });
});
