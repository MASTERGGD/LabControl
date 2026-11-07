import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ModalReservar } from './SesionClase';
let mockRol='DOCENTE';
jest.mock('../../context/AuthContext',()=>({useAuth:()=>({usuario:{id:4,rol:mockRol,roles_adicionales:['RESPONSABLE_LAB'],laboratorio_id:2}})}));
jest.mock('../../components/ProgramarPractica',()=>props=><div data-laboratorio={props.laboratorioInicialId}>Solicitud unificada con propósito</div>);
jest.mock('../../components/AdminLayout',()=>()=>null);
jest.mock('../../context/ThemeContext',()=>({useTheme:()=>({themeKey:'day'})}));
test('modo docente con rol adicional responsable usa el mismo formulario al seleccionar un turno de Química',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;const container=document.createElement('div'),root=createRoot(container);
 await act(async()=>root.render(<ModalReservar laboratorio_id={2} laboratorio={{categoria:'QUIMICA'}} slot={{hora_inicio:'08:00',hora_fin:'09:00'}}/>));
 expect(container.textContent).toContain('Solicitud unificada con propósito');expect(container.firstChild.dataset.laboratorio).toBe('2');
 expect(container.textContent).not.toContain('Reservar horario');act(()=>root.unmount());
});
