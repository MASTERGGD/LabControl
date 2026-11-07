import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useCategoriaLaboratorio, { normalizarCategoriaLaboratorio } from './useCategoriaLaboratorio';
import api from './useApi';
jest.mock('./useApi',()=>({get:jest.fn()}));
let container,root;
function Prueba({id=4}){const datos=useCategoriaLaboratorio(id);return <div><span>{datos.estado}:{datos.categoria}</span><button onClick={datos.reintentar}>Reintentar</button></div>;}
const render=async props=>act(async()=>root.render(<Prueba {...props}/>));
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});

test('normaliza variantes de categoría sin convertir otros laboratorios en química',()=>{
 expect(normalizarCategoriaLaboratorio(' Química ')).toBe('QUIMICA');
 expect(normalizarCategoriaLaboratorio('agroindustrial')).toBe('AGROINDUSTRIA');
 expect(normalizarCategoriaLaboratorio('Cómputo')).toBe('COMPUTO');
 expect(normalizarCategoriaLaboratorio('GENERAL')).toBe('GENERAL');
});

test('fallo de identificación informa error y permite recuperar química sin recargar',async()=>{
 api.get.mockRejectedValueOnce(new Error('Sin red'));await render();
 expect(container.textContent).toContain('error:');
 api.get.mockResolvedValueOnce({data:{categoria:' Química '}});
 await act(async()=>container.querySelector('button').click());
 expect(container.textContent).toContain('listo:QUIMICA');
});

test('un fallo posterior conserva la categoría confirmada del mismo laboratorio',async()=>{
 api.get.mockResolvedValueOnce({data:{categoria:'QUIMICA'}});await render();
 api.get.mockRejectedValueOnce(new Error('Sin red'));
 await act(async()=>container.querySelector('button').click());
 expect(container.textContent).toContain('error:QUIMICA');
});

test('cambiar laboratorio ignora respuestas tardías de la consulta anterior',async()=>{
 let resolver;api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolver=resolve;}));await render();
 api.get.mockResolvedValueOnce({data:{categoria:'COMPUTO'}});await render({id:5});
 await act(async()=>resolver({data:{categoria:'QUIMICA'}}));
 expect(container.textContent).toContain('listo:COMPUTO');
});
