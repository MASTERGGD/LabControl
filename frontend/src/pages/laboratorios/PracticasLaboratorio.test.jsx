import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PracticasLaboratorio from './PracticasLaboratorio';
import api from '../../hooks/useApi';
let mockUsuario = { id: 1, rol: 'DOCENTE' };
jest.mock('../../hooks/useApi', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ usuario: mockUsuario }) }));
jest.mock('../../components/AdminLayout', () => ({ children }) => <div>{children}</div>);
const practica = (id, estado) => ({ id, reservacion_id: id, titulo: `Práctica ${id}`, estado, fecha: '2099-11-04', materia: 'Materia de prueba', grupo:'A', laboratorio_nombre:'Lab ficticio', objetivo:'Objetivo reservado al detalle', materiales:[{ id:1, descripcion:'Matraz', cantidad_solicitada:2, unidad:'PIEZA' }], asistencias:[], incidentes:[], residuos:[] });
let root, container;
const click = async text => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith(text)).click());
const cambiar = async (element, value) => act(async () => {
  Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value').set.call(element,value);
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true}));
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUsuario = { id:1, rol:'DOCENTE' };
  container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container);
  api.get.mockImplementation(async url => {
    if(url.includes('/seguimiento?')) {
      const q = new URLSearchParams(url.split('?')[1]); const pagina=Number(q.get('pagina'));
      const historial=q.get('vista') === 'HISTORIAL'; const filtrado=q.get('buscar');
      return { data: { items: filtrado ? [] : [practica(historial ? 30 : pagina===2 ? 11 : 1, historial ? 'CANCELADA':'SOLICITADA')], total:filtrado?0:historial?1:11, pagina:filtrado?1:pagina, paginas:filtrado||historial?1:2, totales:{activas:11,historial:1}, periodos:['SEP-DIC-2099'],reservaciones_con_practica:[1,11,30],proxima:null } };
    }
    if(url.startsWith('/laboratorios')) return {data:[{id:1,nombre:'Lab ficticio',categoria:'QUIMICA'}]};
    if(url.includes('/resumen')) return {data:{}};
    return {data:[]};
  });
  api.post.mockResolvedValue({data:{}});
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = async () => act(async () => root.render(<PracticasLaboratorio />));

test('vista activa compacta abre detalle y separa canceladas en historial', async () => {
  await render();
  expect(container.querySelector('article').textContent).toContain('SOLICITADA');
  expect(container.querySelector('article').textContent).not.toContain('Objetivo reservado');
  expect(container.querySelector('article span').className).toContain('amber');
  await click('Ver detalle');
  expect(container.querySelector('article').textContent).toContain('Objetivo reservado');
  expect(container.querySelector('article').textContent).toContain('Matraz');
  await click('Historial');
  expect(container.querySelector('article').textContent).toContain('CANCELADA');
  expect(container.querySelector('article span').className).toContain('gray');
  expect(container.querySelector('article').textContent).not.toContain('Objetivo reservado');
});

test('paginación y filtros consultan servidor y muestran estado vacío', async () => {
  await render();
  await click('Siguiente');
  expect(container.querySelector('article').textContent).toContain('Práctica 11');
  const form = container.querySelector('[aria-label="Filtros de prácticas"]');
  await cambiar(form.querySelector('input'), 'No coincide');
  await act(async () => form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(container.querySelector('article')).toBeNull();
  expect(container.textContent).toContain('No hay prácticas en esta vista');
  const call = api.get.mock.calls.filter(([url])=>url.includes('/seguimiento?')).at(-1)[0];
  const q=new URLSearchParams(call.split('?')[1]);
  expect(q.get('pagina')).toBe('1'); expect(q.get('buscar')).toBe('No coincide');
  await click('Limpiar');
  expect(container.querySelector('article').textContent).toContain('Práctica 1');
});

test('responsable conserva preparación de materiales dentro del detalle', async () => {
  mockUsuario={id:1,rol:'RESPONSABLE_LAB',laboratorio_id:1};
  await render();
  expect(container.querySelector('article').textContent).not.toContain('Preparar y entregar');
  await click('Ver detalle');
  await click('Preparar y entregar materiales');
  expect(api.post).toHaveBeenCalledWith('/practicas-laboratorio/1/preparar',{materiales:[{material_id:1,cantidad_entregada:2}]});
});
