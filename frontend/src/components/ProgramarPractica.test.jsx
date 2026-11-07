import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProgramarPractica from './ProgramarPractica';
import api from '../hooks/useApi';
jest.mock('../hooks/useApi',()=>({get:jest.fn(),post:jest.fn()}));
jest.mock('./MaterialesPracticaSelector',()=>()=>null);
let root,container,guardar,cerrar;
const cargas=[0,2,4].map((dia,i)=>({id:i+1,tipo_actividad:'CLASE',estado:'ACTIVO',grupo_academico_id:4,materia_id:7,actividad_nombre:'Manejo de Postcosecha',grupo:'3 A',carrera:'Agricultura',dia_semana:dia,hora_inicio:'08:00',hora_fin:'10:00'}));
const click=text=>act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===text).click());
const input=(label,value)=>act(async()=>{const el=container.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);guardar=jest.fn();cerrar=jest.fn();api.get.mockImplementation(url=>Promise.resolve({data:url==='/docencia/horario'?cargas:url.startsWith('/laboratorios')?[{id:2,nombre:'Química',categoria:'QUIMICA'}]:[]}));});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const preparar=async()=>{await act(async()=>root.render(<ProgramarPractica onGuardado={guardar} onClose={cerrar}/>));await input('Materia y grupo','1');await input('Laboratorio de la práctica','2');await input('Título de la práctica','Conservación de frutos');await input('Fecha inicial','2026-11-09');await click('Proponer fechas de mi horario');};
test('propone tres bloques y verifica antes de confirmar todas las sesiones',async()=>{
 api.post.mockResolvedValueOnce({data:{disponible:true,conflictos:[]}}).mockResolvedValueOnce({data:{practica_id:8}});
 await preparar();expect(container.querySelectorAll('input[type="date"]')).toHaveLength(4);
 await click('Verificar disponibilidad');expect(guardar).not.toHaveBeenCalled();
 expect(api.post.mock.calls[0][1].sesiones.map(s=>s.fecha)).toEqual(['2026-11-09','2026-11-11','2026-11-13']);
 await click('Confirmar 3 sesiones');expect(api.post.mock.calls[1][0]).toBe('/practicas-laboratorio/programacion');expect(guardar).toHaveBeenCalled();expect(cerrar).toHaveBeenCalled();
});
test('conflictos identifican fecha y no confirman ni cierran el formulario',async()=>{
 api.post.mockResolvedValue({data:{disponible:false,conflictos:[{sesion:2,fecha:'2026-11-11',mensaje:'Laboratorio ocupado'}]}});
 await preparar();await click('Verificar disponibilidad');expect(container.textContent).toContain('Sesión 2 · 2026-11-11: Laboratorio ocupado');expect(guardar).not.toHaveBeenCalled();expect(cerrar).not.toHaveBeenCalled();
});
test('editar una sesión fuera de horario invalida la revisión anterior',async()=>{
 api.post.mockResolvedValue({data:{disponible:true,conflictos:[]}});await preparar();await click('Verificar disponibilidad');
 await act(async()=>[...container.querySelectorAll('input[type="checkbox"]')].find(e=>e.parentElement.textContent.includes('fuera de mi horario')).click());
 await input('Inicio sesión 1','16:00');await input('Fin sesión 1','17:00');expect(container.textContent).not.toContain('Confirmar 3 sesiones');await click('Verificar disponibilidad');expect(api.post.mock.calls[1][1].sesiones[0]).toEqual(expect.objectContaining({fuera_horario:true,hora_inicio:'16:00',hora_fin:'17:00'}));
});
