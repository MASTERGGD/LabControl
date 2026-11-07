import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useAccesoPracticas from './useAccesoPracticas';
import api from './useApi';
jest.mock('./useApi', () => ({ get: jest.fn() }));
let container, root;
const usuario={id:1,rol:'DOCENTE'};
function Menu({ user=usuario, offline=false }) {
  const acceso=useAccesoPracticas(user,offline,'/docente/laboratorio');
  return acceso ? <a>Seguimiento de prácticas</a> : null;
}
const render=async props=>act(async()=>root.render(<Menu {...props}/>));
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});

test('sin práctica oculta opción y aparece tras primera solicitud sin recargar',async()=>{
  api.get.mockResolvedValueOnce({data:{tiene_practicas:false}});
  await render();expect(container.querySelector('a')).toBeNull();
  api.get.mockResolvedValueOnce({data:{tiene_practicas:true}});
  await act(async()=>window.dispatchEvent(new Event('labcontrol:practicas-updated')));
  expect(container.textContent).toContain('Seguimiento de prácticas');
  expect(api.get).toHaveBeenCalledWith('/practicas-laboratorio/acceso-docente',{params:{sin_contexto_periodo:true}});
});

test('historial conserva opción ante fallo transitorio de consulta',async()=>{
  api.get.mockResolvedValueOnce({data:{tiene_practicas:true}});await render();
  api.get.mockRejectedValueOnce(new Error('Sin red'));
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(container.querySelector('a')).not.toBeNull();
});

test('cambiar de docente no hereda el acceso de la cuenta anterior',async()=>{
  let resolver;
  api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolver=resolve;}));
  await render();
  api.get.mockResolvedValueOnce({data:{tiene_practicas:false}});
  await render({user:{id:2,rol:'DOCENTE'}});
  await act(async()=>resolver({data:{tiene_practicas:true}}));
  expect(container.querySelector('a')).toBeNull();
});

test.each([{user:{id:1,rol:'RESPONSABLE_LAB'}},{offline:true}])('no consulta en otras funciones o sin conexión',async props=>{
  await render(props);expect(api.get).not.toHaveBeenCalled();expect(container.querySelector('a')).toBeNull();
});
