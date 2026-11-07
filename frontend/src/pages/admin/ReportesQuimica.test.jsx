import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Reportes from './Reportes';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi',()=>({get:jest.fn()}));
jest.mock('../../components/AdminLayout',()=>({children})=><div>{children}</div>);
jest.mock('../../context/ThemeContext',()=>({useTheme:()=>({themeKey:'day'})}));
jest.mock('../../components/SelectDark',()=>({value,onChange,options})=><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select>);
jest.mock('../../components/ReporteQuimica',()=>({modo='mensual'})=><div>Fuente química {modo}</div>);

test('Química sustituye reporte y comparativo de PCs en ambas pestañas',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  api.get.mockResolvedValue({data:[{id:4,nombre:'Química ficticia',categoria:'QUIMICA'}]});
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  try {
    await act(async()=>root.render(<Reportes/>));
    expect(container.textContent).toContain('Fuente química mensual');
    expect(api.get.mock.calls.some(([url])=>url.startsWith('/reportes/mensual'))).toBe(false);
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes('Análisis Comparativo')).click());
    expect(container.textContent).toContain('Fuente química comparativo');
    expect(api.get.mock.calls.some(([url])=>url.startsWith('/reportes/comparativo'))).toBe(false);
    expect(container.textContent).not.toContain('PCs operativas');
  } finally {act(()=>root.unmount());container.remove();}
});
