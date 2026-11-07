import { MemoryRouter } from 'react-router-dom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PracticasLaboratorio from './PracticasLaboratorio';
import api from '../../hooks/useApi';
let mockUsuario = { id: 1, rol: 'DOCENTE' };
jest.mock('../../hooks/useApi', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn() }));
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
      return { data: { items: filtrado ? [] : [practica(historial ? 30 : pagina===2 ? 11 : 1, historial ? 'CANCELADA':'SOLICITADA')], total:filtrado?0:historial?1:11, pagina:filtrado?1:pagina, paginas:filtrado||historial?1:2, totales:{activas:filtrado?0:11,historial:filtrado?0:1}, periodos:['SEP-DIC-2099'],reservaciones_con_practica:[1,11,30],proxima:null } };
    }
    if(url.startsWith('/laboratorios')) return {data:[{id:1,nombre:'Lab ficticio',categoria:'QUIMICA'}]};
    if(url.includes('/resumen')) return {data:{}};
    return {data:[]};
  });
  api.post.mockResolvedValue({data:{}}); api.put.mockResolvedValue({data:{}});
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = async () => act(async () => root.render(<MemoryRouter><PracticasLaboratorio /></MemoryRouter>));

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
  expect(container.textContent).toContain('No hay actividades con estos filtros.');
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


test('enlace directo abre la sesión exacta y el cierre confirma la liberación de fechas', async () => {
  const detalle={...practica(45,'EN_CURSO'),materiales:[],asistencias:[{alumno_id:3,estado:'PRESENTE',matricula:'FICTICIA',alumno_nombre:'Alumno de prueba'}],numero_sesion:1,total_sesiones:3,plan_estado:'PLANIFICADA',sesiones_plan:[{id:45,fecha:'2099-11-04',estado:'EN_CURSO'},{id:46,fecha:'2099-11-11',estado:'SOLICITADA'}]};
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(url=>url==='/practicas-laboratorio/45'?Promise.resolve({data:detalle}):original(url));
  await act(async()=>root.render(<MemoryRouter initialEntries={['/docente/practicas-laboratorio?practica_id=45']}><PracticasLaboratorio/></MemoryRouter>));
  expect(container.textContent).toContain('Lista oficial del grupo');
  expect(container.textContent).toContain('Sesión 1 de 3');
  await click('Cerrar sesión y guardar avance');
  const dialog=container.querySelector('[aria-label="Cerrar sesión de práctica"]');
  expect(api.post).not.toHaveBeenCalled();
  await act(async()=>dialog.querySelector('input[type="checkbox"]').click());
  expect(dialog.textContent).toContain('2099-11-11');
  await click('Confirmar cierre');
  expect(api.put).toHaveBeenCalledWith('/practicas-laboratorio/45/asistencia',expect.objectContaining({alumnos:expect.any(Array)}));
  expect(api.post).toHaveBeenCalledWith('/practicas-laboratorio/45/cerrar',expect.objectContaining({finalizar_practica:true,cancelar_futuras:true}));
});

test('enlace al historial abre directamente la vista con canceladas y conserva el acceso a activas',async()=>{
 await act(async()=>root.render(<MemoryRouter initialEntries={['/docente/practicas-laboratorio?vista=HISTORIAL']}><PracticasLaboratorio/></MemoryRouter>));
 const llamada=api.get.mock.calls.filter(([url])=>url.includes('/seguimiento?')).at(-1)[0];expect(new URLSearchParams(llamada.split('?')[1]).get('vista')).toBe('HISTORIAL');
 expect(container.querySelector('article').textContent).toContain('CANCELADA');
 await click('Activas');expect(container.querySelector('article').textContent).toContain('SOLICITADA');
});

test('contador del historial llega a cero con los filtros y no muestra paginación vacía',async()=>{
 await act(async()=>root.render(<MemoryRouter initialEntries={['/docente/practicas-laboratorio?vista=HISTORIAL']}><PracticasLaboratorio/></MemoryRouter>));
 expect(container.textContent).toContain('Historial (1)');
 const form=container.querySelector('[aria-label="Filtros de prácticas"]');await cambiar(form.querySelector('input'),'Sin coincidencias');
 expect(container.textContent).toContain('Hay cambios sin aplicar');expect(container.textContent).toContain('Historial (1)');
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(container.textContent).toContain('Historial (0)');expect(container.textContent).not.toContain('Aún no tienes prácticas solicitadas');expect(container.textContent).toContain('0 resultados');expect(container.textContent).toContain('No hay actividades con estos filtros.');
 expect(container.querySelector('[aria-label="Paginación de prácticas"]')).toBeNull();expect(container.textContent).not.toContain('Página 1 de 1');
 await click('Limpiar filtros');expect(container.textContent).toContain('Historial (1)');expect(container.querySelector('article')).not.toBeNull();
});

test('cambiar de pestaña conserva filtros aplicados y no aplica borradores',async()=>{
 await render();const form=container.querySelector('[aria-label="Filtros de prácticas"]');
 await cambiar(form.querySelectorAll('select')[1],'CANCELADA');await cambiar(form.querySelector('input'),'Anterior');
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await cambiar(form.querySelector('input'),'Borrador sin aplicar');await click('Historial');
 const ultima=api.get.mock.calls.filter(([url])=>url.includes('/seguimiento?')).at(-1)[0],params=new URLSearchParams(ultima.split('?')[1]);
 expect(params.get('estado')).toBe('CANCELADA');expect(params.get('buscar')).toBe('Anterior');expect(params.get('vista')).toBe('HISTORIAL');
 expect(form.querySelectorAll('select')[1].value).toBe('CANCELADA');expect(container.textContent).toContain('Hay cambios sin aplicar');
});

test('carga y error muestran contadores no disponibles en lugar de ceros confirmados',async()=>{
 let rechazar;const original=api.get.getMockImplementation();api.get.mockImplementation(url=>url.includes('/seguimiento?')?new Promise((_,reject)=>{rechazar=reject;}):original(url));
 await render();expect(container.textContent).toContain('Activas (—)');expect(container.textContent).toContain('Historial (—)');expect(container.textContent).not.toContain('0 resultados');
 await act(async()=>rechazar(new Error('Sin red')));expect(container.textContent).toContain('Historial (—)');expect(container.textContent).not.toContain('No hay actividades');expect(container.textContent).not.toContain('0 resultados');
});
