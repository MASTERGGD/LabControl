import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ReporteQuimica, { TablaReporte } from './ReporteQuimica';
import api from '../hooks/useApi';

jest.mock('../hooks/useApi', () => ({ get: jest.fn(), post: jest.fn() }));
const corte = id => ({ firma: `firma-${id}`, reporte: {
  consulta_id:id, generado_en:'2026-11-07T18:00:00Z', generado_por:'Usuario ficticio', zona_horaria:'America/Mexico_City',
  laboratorio:{ id:1,nombre:'Química ficticia',capacidad_registrada:25 },
  periodo:{ desde:'2026-11-01T00:00:00-06:00',hasta_exclusivo:'2026-12-01T00:00:00-06:00' },
  indicadores:[{ clave:'sesiones', titulo:'Sesiones iniciadas', valor:1, detalle:[{id:15,titulo:'Práctica de prueba'}] }],
  tablas:{ movimientos:[{ id:18,tipo:'CONSUMO',cantidad:60,unidad:'ml' }], alertas_actuales:[] }, reglas:['Regla de prueba'],
} });
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  api.get.mockReset();api.post.mockReset();
  api.get.mockResolvedValue({data:corte('consulta-1')});
});
afterEach(() => {act(() => root.unmount());container.remove();jest.restoreAllMocks();});
const render=async props => act(async () => root.render(<ReporteQuimica laboratorioId={1} mes={11} anio={2026} {...props}/>));
const click=async text => act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent===text).click());

test('consulta química explícita con trazabilidad y alcance de alertas', async () => {
  await render();
  expect(api.get).toHaveBeenCalledWith('/reportes/quimica/mensual?laboratorio_id=1&mes=11&anio=2026',{params:{sin_contexto_periodo:true}});
  expect(container.textContent).toContain('ID de consulta: consulta-1');
  expect(container.textContent).toContain('Práctica de prueba');
  expect(container.textContent).toContain('Sin pendientes detectados en las fuentes consultadas');
  expect(container.textContent).not.toContain('PCs operativas');
  expect(container.textContent).toContain('Unidad pendiente de confirmar');
  expect(container.querySelectorAll('details').length).toBeGreaterThan(2);
});

test('descarga envía el mismo corte sin volver a calcular', async () => {
  URL.createObjectURL=jest.fn(()=> 'blob:ficticio');URL.revokeObjectURL=jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  api.post.mockResolvedValue({data:new Blob(['Excel ficticio'])});
  await render(); await click('Descargar Excel de esta consulta');
  expect(api.post).toHaveBeenCalledWith('/reportes/quimica/excel',corte('consulta-1'),{responseType:'blob'});
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ficticio');
});

test('cambio de filtros descarta respuesta anterior y error no se presenta como cero', async () => {
  let resolver;
  api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolver=resolve;}));
  await render();
  await render({mes:10});
  await act(async()=>resolver({data:corte('consulta-obsoleta')}));
  expect(container.textContent).not.toContain('consulta-obsoleta');
  api.get.mockRejectedValueOnce(new Error('Sin conexión'));
  await click('Actualizar reporte');
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain('ID de consulta');
  expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Descargar Excel de esta consulta').disabled).toBe(true);
});

test('comparativo usa la fuente química y muestra alcance temporal', async () => {
  const data=corte('comparativa');data.reporte.comparacion={actual:'Sep–Dic',anterior:'May–Ago',alcance:'Cuatrimestre parcial'};
  api.get.mockResolvedValueOnce({data});
  await render({modo:'comparativo'});
  expect(api.get.mock.calls[0][0]).toContain('/quimica/comparativo');
  expect(container.textContent).toContain('Cuatrimestre parcial');
});

test('detalle pagina registros completos y no cantidad visible en viewport', async () => {
  const filas=Array.from({length:11},(_,i)=>({id:i+1}));
  await act(async()=>root.render(<TablaReporte filas={filas}/>));
  expect(container.textContent).toContain('Mostrando 1–10 de 11 registros');
  await click('Siguiente');
  expect(container.textContent).toContain('Mostrando 11–11 de 11 registros');
});
