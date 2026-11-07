import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WidgetProximas } from './DashboardAdmin';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({themeKey:'day'})}));

test('agenda integrada muestra el número de reservaciones junto al título',()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 try{
  act(()=>root.render(<WidgetProximas integrado navigate={jest.fn()} reservaciones={[{id:1,fecha:'2099-11-04',materia:'Materia ficticia',docente:'Ficticio',hora_ini:'08:00',hora_fin:'09:00'}]}/>));
  expect(container.querySelector('[aria-label="1 próximas reservaciones"]').textContent).toBe('1');
 }finally{act(()=>root.unmount());container.remove();}
});
