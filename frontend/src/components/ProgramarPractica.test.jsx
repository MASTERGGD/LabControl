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
const preparar=async()=>{await act(async()=>root.render(<ProgramarPractica onGuardado={guardar} onClose={cerrar}/>));await act(async()=>container.querySelector('input[value="ACADEMICA"]').click());await input('Materia y grupo','1');await input('Laboratorio de la práctica','2');await input('Título de la práctica','Conservación de frutos');await input('Fecha inicial','2026-11-09');await click('Proponer fechas de mi horario');};
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

test('sin carga académica bloquea captura y permite cambiar a uso individual',async()=>{
 api.get.mockImplementation(url=>Promise.resolve({data:url.startsWith('/laboratorios')?[{id:2,nombre:'Química',categoria:'QUIMICA'}]:[]}));
 await act(async()=>root.render(<ProgramarPractica onGuardado={guardar} onClose={cerrar}/>));
 await act(async()=>container.querySelector('input[value="ACADEMICA"]').click());
 expect(container.textContent).toContain('No tienes materias activas');
 expect(container.querySelector('[aria-label="Título de la práctica"]')).toBeNull();
 expect(container.querySelector('[aria-label="Número de sesiones"]')).toBeNull();
 expect(container.querySelector('a').getAttribute('href')).toBe('/docente/horario');
 await act(async()=>container.querySelector('input[value="INDIVIDUAL"]').click());
 expect(container.querySelector('[aria-label="Título de la práctica"]')).not.toBeNull();
 expect(container.querySelector('[aria-label="Materia y grupo"]')).toBeNull();
 await input('Laboratorio de la práctica','2');await input('Título de la práctica','Conservación de muestras');
 await act(async()=>{const el=container.querySelector('[aria-label="Objetivo de la actividad"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Evaluar conservación de frutos');el.dispatchEvent(new Event('input',{bubbles:true}));});
 await input('Fecha sesión 1','2026-11-11');
 expect(container.querySelector('[aria-label="Intervalo de sesiones"]')).toBeNull();
 expect(container.querySelector('[aria-label="Número de sesiones"]')).toBeNull();
 await input('Fin sesión 1','10:00');
 api.post.mockResolvedValue({data:{disponible:true,conflictos:[]}});await click('Verificar disponibilidad');
 expect(api.post.mock.calls[0][1]).toEqual(expect.objectContaining({proposito:'INDIVIDUAL',incluye_practica:false,sesiones:[expect.objectContaining({carga_id:null})]}));
 await click('Agregar otra sesión');
 expect(container.querySelector('[aria-label="Fecha sesión 2"]').value).toBe('');
 expect(container.querySelector('[aria-label="Fin sesión 2"]').value).toBe('10:00');
 await click('Verificar disponibilidad');
 expect(api.post).toHaveBeenCalledTimes(1);
 await input('Fecha sesión 2','2026-11-12');
 await click('Agregar otra sesión');
 await input('Fecha sesión 3','2026-11-13');
 await input('Inicio sesión 3','09:00');
 await click('Verificar disponibilidad');
 expect(api.post.mock.calls[1][1].sesiones).toEqual([
   expect.objectContaining({fecha:'2026-11-11',hora_inicio:'08:00',hora_fin:'10:00'}),
   expect.objectContaining({fecha:'2026-11-12',hora_inicio:'08:00',hora_fin:'10:00'}),
   expect.objectContaining({fecha:'2026-11-13',hora_inicio:'09:00',hora_fin:'10:00'}),
 ]);
 await act(async()=>container.querySelector('[aria-label="Quitar sesión 2"]').click());
 expect(container.textContent).not.toContain('Confirmar 3 sesiones');
 await click('Verificar disponibilidad');
 expect(api.post.mock.calls[2][1].sesiones.map(s=>s.fecha)).toEqual(['2026-11-11','2026-11-13']);
});

test('fallo de consulta no se presenta como ausencia de materias y permite reintentar',async()=>{
 api.get.mockImplementation(url=>url==='/docencia/horario'?Promise.reject(new Error('Network Error')):Promise.resolve({data:[{id:2,nombre:'Química',categoria:'QUIMICA'}]}));
 await act(async()=>root.render(<ProgramarPractica onGuardado={guardar} onClose={cerrar}/>));
 await act(async()=>container.querySelector('input[value="ACADEMICA"]').click());
 expect(container.textContent).toContain('No se pudo consultar tu carga docente');expect(container.textContent).not.toContain('No tienes materias activas');
 expect(container.querySelector('[aria-label="Título de la práctica"]')).toBeNull();
 api.get.mockResolvedValue({data:cargas});await click('Reintentar carga docente');
 expect(container.querySelector('[aria-label="Materia y grupo"]')).not.toBeNull();
});

test('una fecha elegida desde el horario precarga la sesión académica o individual', async () => {
 const slot = { fecha: '2026-11-18', dia_semana: 2, hora_inicio: '08:00', hora_fin: '10:00' };
 await act(async () => root.render(<ProgramarPractica laboratorioInicialId={2} slotInicial={slot} onClose={cerrar}/>));
 await act(async () => container.querySelector('input[value="ACADEMICA"]').click());
 await input('Materia y grupo', '1');
 expect(container.querySelector('[aria-label="Fecha sesión 1"]').value).toBe(slot.fecha);
 expect(container.querySelector('[aria-label="Fin sesión 1"]').value).toBe(slot.hora_fin);
 expect(container.querySelector('[aria-label="Fin sesión 1"]').disabled).toBe(true);
 await act(async () => container.querySelector('input[value="INDIVIDUAL"]').click());
 expect(container.querySelector('[aria-label="Fecha sesión 1"]').value).toBe(slot.fecha);
 expect(container.querySelector('[aria-label="Fin sesión 1"]').value).toBe(slot.hora_fin);
 expect(container.querySelector('[aria-label="Fin sesión 1"]').disabled).toBe(false);
});
