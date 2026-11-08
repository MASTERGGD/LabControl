import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Gestion from './GestionDisponibilidadLaboratorio';
import api from '../hooks/useApi';
jest.mock('../hooks/useApi',()=>({get:jest.fn(),post:jest.fn()}));
const agenda={bloqueos:[],practicas:[{id:1,raiz:1,titulo:'Ficticia',fecha:'2099-11-02',hora:'08:00',fin:'09:00',estado:'SOLICITADA',docente:'Ficticio'},{id:2,raiz:1,titulo:'Continuación',fecha:'2099-11-09',hora:'08:00',fin:'09:00',estado:'PREPARADA',docente:'Ficticio'}]};
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockReset().mockResolvedValue({data:agenda});api.post.mockReset().mockResolvedValue({data:{}});});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const render=()=>act(async()=>root.render(<Gestion laboratorioId={4}/>));
const cambiar=async(element,value)=>act(async()=>{const proto=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});
const enviar=form=>act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));

test('bloqueo comunica conflictos sin anunciar éxito ni cancelar automáticamente',async()=>{
  await render();api.post.mockRejectedValueOnce({response:{data:{detail:{message:'Revisa las actividades',conflictos:[{practica_id:1,docente:'Ficticio',fecha:'2099-11-02'}]}}}});
  const f=container.querySelector('[aria-label="Bloquear disponibilidad"]');await cambiar(f.querySelector('textarea'),'Mantenimiento de equipo');await enviar(f);
  expect(container.querySelector('[role="alert"]').textContent).toBe('Revisa las actividades');
  expect(container.querySelector('[aria-label="Actividades afectadas"]')).not.toBeNull();
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toBe('/horarios/gestion/bloqueos');
});

test('cancelación muestra fechas y envía motivo y alcance explícitos',async()=>{
  await render();const f=container.querySelector('[aria-label="Cancelar sesiones de laboratorio"]');
  await cambiar(f.querySelector('select'),'1');await cambiar(f.querySelectorAll('select')[1],'SIGUIENTES');
  expect(f.textContent).toContain('2099-11-02');expect(f.textContent).toContain('2099-11-09');
  await cambiar(f.querySelector('textarea'),'Reprogramación por mantenimiento');await enviar(f);
  expect(api.post).toHaveBeenCalledWith('/horarios/gestion/practicas/1/cancelar',{motivo:'Reprogramación por mantenimiento',alcance:'SIGUIENTES'});
  expect(container.textContent).toContain('Sesiones canceladas.');
});

test('falla de consulta no afirma ausencia de bloqueos',async()=>{
  api.get.mockRejectedValueOnce(new Error('Sin conexión'));await render();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain('No hay bloqueos por fecha registrados');
  expect(container.querySelector('[aria-label="Bloquear disponibilidad"] button').disabled).toBe(true);
});
