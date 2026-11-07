import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Agenda from './AgendaPracticasDocente';
import api from '../hooks/useApi';
const mockNavigate=jest.fn();
jest.mock('react-router-dom',()=>({useNavigate:()=>mockNavigate}));
jest.mock('../hooks/useApi',()=>({get:jest.fn()}));
jest.mock('./ProgramarPractica',()=>()=>null);
let root,container;
const actividad=(id,fecha,estado='SOLICITADA',extras={})=>({id,fecha,estado,titulo:`Actividad ${id}`,materia:'Materia de prueba',hora_inicio:'08:00',hora_fin:'09:00',laboratorio:'Lab ficticio',practica_url:`/docente/practicas-laboratorio?practica_id=${id}`,proposito:'ACADEMICA',practica_origen_id:id,...extras});
const render=props=>act(async()=>root.render(<Agenda {...props}/>));
const click=text=>act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===text).click());
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-11-09T08:00:00-06:00'));global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockResolvedValue({data:[]});});
afterEach(()=>{act(()=>root.unmount());container.remove();jest.useRealTimers();});

test('treinta actividades dejan solo tres filas con prioridad para en curso y hoy',async()=>{
 const futuras=Array.from({length:28},(_,i)=>actividad(i+3,'2026-11-18'));
 api.get.mockResolvedValue({data:[...futuras,actividad(2,'2026-11-09','PREPARADA'),actividad(1,'2026-11-02','EN_CURSO'),actividad(99,'2026-11-18','CANCELADA')]});
 await render();expect(container.querySelectorAll('li')).toHaveLength(3);
 expect([...container.querySelectorAll('li')].map(n=>n.querySelector('p').textContent.match(/Actividad \d+/)[0])).toEqual(['Actividad 1','Actividad 2','Actividad 3']);
 expect(container.textContent).not.toContain('Actividad 99');expect(container.textContent).toContain('Hoy y en curso');
 await click('Ver agenda completa · 30 activas');expect(mockNavigate).toHaveBeenCalledWith('/docente/practicas-laboratorio?vista=ACTIVAS');
});

test('canceladas y finalizadas producen una franja vacía compacta con acceso al historial',async()=>{
 api.get.mockResolvedValue({data:[actividad(1,'2026-11-18','CANCELADA',{proposito:'SIN_VINCULACION'}),actividad(2,'2026-11-18','CERRADA',{plan_estado:'FINALIZADA'})]});
 await render();expect(container.querySelector('li')).toBeNull();expect(container.textContent).toContain('No tienes sesiones de laboratorio próximas.');expect(container.textContent).not.toContain('Sin vinculación académica');
 await click('Ver historial');expect(mockNavigate).toHaveBeenCalledWith('/docente/practicas-laboratorio?vista=HISTORIAL');
});

test('continuaciones pendientes se agrupan por práctica y no rescatan una cancelada',async()=>{
 api.get.mockResolvedValue({data:[actividad(1,'2026-11-02','CERRADA',{plan_estado:'PENDIENTE_CONTINUACION'}),actividad(2,'2026-11-04','CERRADA',{plan_estado:'PENDIENTE_CONTINUACION',practica_origen_id:1}),actividad(3,'2026-11-18','CANCELADA',{plan_estado:'PENDIENTE_CONTINUACION'})]});
 await render();expect(container.querySelector('details').open).toBe(false);expect(container.querySelector('summary').textContent).toContain('1 práctica por continuar o finalizar');expect(container.querySelectorAll('li')).toHaveLength(1);
 await click('Decidir continuación o cierre');expect(mockNavigate).toHaveBeenCalledWith('/docente/practicas-laboratorio?practica_id=2');
});

test('error de consulta permite reintento sin afirmar que no hay actividades',async()=>{
 api.get.mockRejectedValueOnce(new Error('Sin red'));await render();expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(container.textContent).not.toContain('No tienes sesiones');
 api.get.mockResolvedValueOnce({data:[actividad(1,'2026-11-09')]});await click('Reintentar agenda');expect(container.querySelector('[role="alert"]')).toBeNull();expect(container.textContent).toContain('Actividad 1');
});

test('cancelación exitosa actualiza agenda y confirma temporalmente la liberación',async()=>{
 api.get.mockResolvedValueOnce({data:[actividad(1,'2026-11-18')]}).mockResolvedValue({data:[]});await render();
 await act(async()=>window.dispatchEvent(new Event('labcontrol:reserva-cancelada')));
 expect(container.textContent).toContain('Actividad cancelada. El horario quedó disponible.');expect(container.textContent).not.toContain('Actividad 1');
 await act(async()=>jest.advanceTimersByTime(6000));expect(container.textContent).not.toContain('Actividad cancelada.');
});

test('historial académico conserva solo un acceso compacto sin descargar todas las actividades',async()=>{
 await render({historial:true});expect(api.get).not.toHaveBeenCalled();expect(container.querySelector('li')).toBeNull();await click('Ver historial de laboratorio');expect(mockNavigate).toHaveBeenCalledWith('/docente/practicas-laboratorio?vista=HISTORIAL');
});
