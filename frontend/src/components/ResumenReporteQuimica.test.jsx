import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ResumenReporteQuimica from './ResumenReporteQuimica';

const reporte = () => ({consulta_id:'ficticio',indicadores:[
  ['programadas',4],['CANCELADA',4],['cerradas_reales',0],['alumnos',0],['horas',0],['regularizar',1],
].map(([clave,valor])=>({clave,valor})),tablas:{sesiones:[{id:1,regularizacion:'Pendiente de cierre'}],
  programadas:[{id:4,titulo:'Cancelada ficticia'}],materiales_por_unidad:[
    {insumo_id:1,material:'Material A',cantidad:60,unidad:'ml',tipo:'CONSUMO'},
    {insumo_id:2,material:'Material B',cantidad:5,unidad:'g',tipo:'CONSUMO'},
  ],informacion_incompleta:[{motivo:'Falta fecha'}],existencias_actuales:[],activos_actuales:[]}});
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const render=async r=>act(async()=>root.render(<ResumenReporteQuimica reporte={r} renderTabla={filas=><pre>{JSON.stringify(filas)}</pre>}/>));
const click=async texto=>act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===texto).click());

test('tres tarjetas sin tablas iniciales y cancelaciones explícitas',async()=>{
  await render(reporte());
  expect(container.querySelectorAll('article')).toHaveLength(3);
  expect(container.querySelector('#detalle-operativo-quimica')).toBeNull();
  const uso=container.querySelector('[aria-label="Uso del laboratorio"]');
  expect(uso.textContent).toContain('Sesiones canceladas4');
  expect(uso.textContent).toContain('Alumnos atendidos0');
  expect(container.textContent).toContain('Sin insumos registrados');
  expect(container.textContent).toContain('Sin activos registrados');
  expect(container.textContent).not.toContain('65');
  expect(container.textContent).toContain('Material A: 60 ml');
  expect(container.textContent).toContain('Material B: 5 g');
});

test('cada acción abre solo su apartado y permite cerrar',async()=>{
  await render(reporte());await click('Ver actividad');
  expect(container.querySelector('#detalle-operativo-quimica').textContent).toContain('Cancelada ficticia');
  expect(container.querySelector('#detalle-operativo-quimica').textContent).not.toContain('Material A');
  await click('Ver materiales');
  expect(container.querySelector('#detalle-operativo-quimica').textContent).toContain('Material A');
  expect(container.querySelector('#detalle-operativo-quimica').textContent).not.toContain('Cancelada ficticia');
  await click('Revisar pendientes');
  expect(container.querySelector('#detalle-operativo-quimica').textContent).toContain('Pendiente de cierre');
  expect(container.querySelector('#detalle-operativo-quimica').textContent).toContain('Falta fecha');
  await click('Cerrar detalle');expect(container.querySelector('#detalle-operativo-quimica')).toBeNull();
});

test('comparativo presenta ambos periodos en el mismo resumen',async()=>{
  const r=reporte();r.comparacion={actual:'Seleccionado',anterior:'Anterior'};
  r.indicadores=[...r.indicadores.map(x=>({...x,clave:`actual_${x.clave}`})),...r.indicadores.map(x=>({...x,clave:`anterior_${x.clave}`,valor:2}))];
  r.tablas=Object.fromEntries(Object.entries(r.tablas).map(([k,v])=>[`actual_${k}`,v]));
  await render(r);expect(container.querySelectorAll('article')).toHaveLength(3);
  const uso=container.querySelector('[aria-label="Uso del laboratorio"]');
  expect(uso.querySelectorAll('thead th')).toHaveLength(3);
  expect(uso.textContent).toContain('SeleccionadoAnterior');
  expect(uso.textContent).toContain('Alumnos atendidos02');
});

test('sin movimientos no se inventan cantidades y el cambio de consulta cierra detalle',async()=>{
  const r=reporte();r.tablas.materiales_por_unidad=[];
  await render(r);expect(container.textContent).toContain('Sin consumo registrado');
  expect(container.textContent).toContain('Sin residuos registrados');
  await click('Ver actividad');await render({...r,consulta_id:'otra'});
  expect(container.querySelector('#detalle-operativo-quimica')).toBeNull();
});
