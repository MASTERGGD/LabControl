import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SesionClase, { ModalReservar } from './SesionClase';
import api from '../../hooks/useApi';
let mockRol='DOCENTE';
jest.mock('../../context/AuthContext',()=>({useAuth:()=>({usuario:{id:4,rol:mockRol,roles_adicionales:['RESPONSABLE_LAB'],laboratorio_id:2}})}));
jest.mock('../../components/ProgramarPractica',()=>props=><div data-laboratorio={props.laboratorioInicialId}>Solicitud unificada con propósito</div>);
jest.mock('../../components/AdminLayout',()=>({children})=>children);
jest.mock('../../components/AgendaPracticasDocente',()=>()=>null);
jest.mock('../../components/SelectDark',()=>({value,onChange,options})=><select value={value} onChange={e=>onChange(e.target.value)}>
 {options.map(opcion=><option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}
</select>);
jest.mock('../../hooks/useApi',()=>({get:jest.fn(),post:jest.fn()}));
jest.mock('../../context/ThemeContext',()=>({useTheme:()=>({themeKey:'day'})}));
test('modo docente con rol adicional responsable usa el mismo formulario al seleccionar un turno de Química',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const container=document.createElement('div'),root=createRoot(container);
 await act(async()=>root.render(<ModalReservar laboratorio_id={2} laboratorio={{categoria:'QUIMICA'}} slot={{hora_inicio:'08:00',hora_fin:'09:00'}}/>));
 expect(container.textContent).toContain('Solicitud unificada con propósito');expect(container.firstChild.dataset.laboratorio).toBe('2');
 expect(container.textContent).not.toContain('Reservar horario');act(()=>root.unmount());
});

test('la sesión sin reservación solo se ofrece en cómputo y usa el laboratorio elegido', async () => {
 global.IS_REACT_ACT_ENVIRONMENT = true;
 const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
 const container = document.createElement('div');
 const root = createRoot(container);
 const labs = [
   {id:1,nombre:'Química',categoria:'QUIMICA'},
   {id:2,nombre:'Cómputo A',categoria:'COMPUTO'},
   {id:3,nombre:'Cómputo B',categoria:'COMPUTO'},
   {id:4,nombre:'Agroindustria',categoria:'AGROINDUSTRIA'},
 ];
 api.get.mockImplementation(url => Promise.resolve({data:url.startsWith('/laboratorios?') ? labs : []}));
 api.post.mockRejectedValue(new Error('Respuesta de prueba'));
 const botonLibre = () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Iniciar sesión sin reservación');
 const elegirLab = valor => act(async () => {
   const select = container.querySelector('select');
   select.value = valor;
   select.dispatchEvent(new Event('change', {bubbles:true}));
 });
 try {
   await act(async () => root.render(<MemoryRouter><SesionClase/></MemoryRouter>));
   expect(botonLibre()).toBeUndefined();
   await elegirLab('4');
   expect(botonLibre()).toBeUndefined();
   await elegirLab('3');
   await act(async () => botonLibre().click());
   expect(container.querySelector('form').textContent).toContain('Cómputo B');
   expect(container.querySelector('form select')).toBeNull();
   await act(async () => container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   expect(api.post).toHaveBeenCalledWith('/sesiones',expect.objectContaining({laboratorio_id:3,tipo_sesion:'LIBRE'}));
 } finally {
   await act(async () => root.unmount());
   scroll.mockRestore();
 }
});
