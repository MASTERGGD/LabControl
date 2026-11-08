import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Horarios from './Horarios';
import api from '../../hooks/useApi';
jest.mock('../../hooks/useApi',()=>({get:jest.fn(),post:jest.fn()}));
jest.mock('../../components/AdminLayout',()=>({children})=><div>{children}</div>);
let mockUsuario={rol:'ADMIN'};
jest.mock('../../context/AuthContext',()=>({useAuth:()=>({usuario:mockUsuario})}));
jest.mock('../../context/ThemeContext',()=>({useTheme:()=>({themeKey:'day'})}));
jest.mock('../../components/CuatrimestreSelect',()=>({__esModule:true,default:()=>null,getCuatrimestreActual:()=> 'SEP-DIC-2026'}));
jest.mock('../../components/SelectDark',()=>()=>null);
let root,container;
beforeEach(()=>{mockUsuario={rol:'ADMIN'};global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);window.history.replaceState({},'', '/');});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const render=()=>act(async()=>root.render(<Horarios/>));
const button=text=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
test('sin laboratorio no ofrece carga masiva ni creación',async()=>{
 api.get.mockResolvedValue({data:[]});await render();
 expect(container.textContent).toContain('No tienes laboratorios activos disponibles');
 expect(button('Nuevo turno').disabled).toBe(true);expect(button('Carga masiva').disabled).toBe(true);
 expect(button('Crear con carga masiva')).toBeUndefined();expect(api.post).not.toHaveBeenCalled();
});
test('un laboratorio del enlace no disponible requiere selección',async()=>{
 window.history.replaceState({},'', '/admin/horarios?laboratorio_id=4');api.get.mockResolvedValue({data:[{id:5,nombre:'Laboratorio de prueba'}]});await render();
 expect(container.textContent).toContain('Selecciona un laboratorio disponible');expect(api.get).toHaveBeenCalledTimes(1);
});
test('la carga masiva conserva la pantalla ante validación 422',async()=>{
 api.get.mockImplementation(url=>Promise.resolve({data:url.startsWith('/laboratorios')?[{id:4,nombre:'Laboratorio de prueba'}]:[]}));
 api.post.mockRejectedValue({response:{data:{detail:[{loc:['body','laboratorio_id'],msg:'Campo requerido',type:'missing'}]}}});
 await render();await act(async()=>button('Crear con carga masiva').click());
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(container.textContent).toContain('laboratorio_id: Campo requerido');expect(container.textContent).toContain('Carga masiva de horarios');
});


test.each(['RESPONSABLE_LAB','DOCENTE'])('gestión de Química respeta modo %s',async rol=>{
 mockUsuario={rol,laboratorio_id:4};
 api.get.mockImplementation(url=>Promise.resolve({data:url.startsWith('/laboratorios')?[{id:4,nombre:'Química ficticia',categoria:'QUIMICA'}]:url.includes('/gestion/agenda')?{practicas:[],bloqueos:[]}:[]}));
 await render();
 expect(container.textContent.includes('Administrar disponibilidad y reservaciones')).toBe(rol==='RESPONSABLE_LAB');
 if(rol==='RESPONSABLE_LAB') expect(container.textContent.indexOf('Horarios')).toBeLessThan(container.textContent.indexOf('Administrar disponibilidad y reservaciones'));
});
