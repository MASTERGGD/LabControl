import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Panel from './PanelOperacionLaboratorio';
import api from '../hooks/useApi';
jest.mock('../hooks/useApi',()=>({get:jest.fn()}));
jest.mock('../hooks/usePermission',()=>()=>({can:p=>p==='inventario:write'}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({themeKey:'day'})}));
let root,container,navigate;
const stats={activos_inventario:0,prestamos:{activos:0,vencidos:0},incidentes_abiertos:0,proximas_reservaciones:[]};
const render=async props=>act(async()=>root.render(<Panel categoria="QUIMICA" laboratorioId={4} stats={stats} navigate={navigate} {...props}/>));
const click=async text=>act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===text).click());
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);navigate=jest.fn();api.get.mockResolvedValue({data:{insumos_total:0,stock_bajo:0,reactivos_por_vencer:0,insumos_caducados:0,practicas_solicitadas:0,alertas_insumos:{}}});});
afterEach(()=>{act(()=>root.unmount());container.remove();});

test('ceros explicados y atajos directos conservan contexto',async()=>{
 await render();expect(container.textContent).toContain('Sin préstamos activos');expect(container.textContent).toContain('Sin incidentes pendientes');expect(container.textContent).toContain('Sin insumos registrados');
 await click('Agregar primer activo');expect(navigate).toHaveBeenLastCalledWith('/admin/inventario?laboratorio_id=4&nuevo=1');
 await click('Revisar solicitudes');expect(navigate).toHaveBeenLastCalledWith('/admin/practicas-laboratorio?laboratorio_id=4&estado=SOLICITADA');
 await click('Registrar primer insumo');expect(navigate).toHaveBeenLastCalledWith('/admin/practicas-laboratorio?laboratorio_id=4&accion=registrar-insumo#insumos');
 await click('Consultar préstamos activos');expect(navigate).toHaveBeenLastCalledWith('/admin/prestamos?laboratorio_id=4&estado=ACTIVO');
});

test('errores no se convierten en ceros ni agenda vacía y permiten reintentar',async()=>{
 api.get.mockRejectedValueOnce(new Error('Sin red'));const retry=jest.fn();
 await render({stats:null,errorStats:true,onRetry:retry});
 expect(container.textContent).toContain('No se pudieron cargar las alertas');expect(container.textContent).toContain('No se pudo consultar la agenda');expect(container.textContent).not.toContain('Sin incidentes pendientes');expect(container.textContent).not.toContain('Agregar primer activo');
 await click('Reintentar resumen');expect(retry).toHaveBeenCalled();
 await click('Reintentar alertas');expect(container.textContent).toContain('Sin insumos registrados');
});

test('alertas enlazan los insumos afectados y el filtro correcto',async()=>{
 api.get.mockResolvedValueOnce({data:{insumos_total:2,stock_bajo:1,reactivos_por_vencer:1,insumos_caducados:0,practicas_solicitadas:2,alertas_insumos:{por_vencer:[{id:7,nombre:'Reactivo ficticio',caduca_en:'2026-11-20'}]}}});
 await render();await click('Reactivo ficticio · 2026-11-20');expect(navigate).toHaveBeenLastCalledWith('/admin/practicas-laboratorio?laboratorio_id=4&alerta=por_vencer#insumo-7');
});

test('la carga muestra esqueletos y termina con ceros reales sin avisos de error',async()=>{
 let resolver;api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolver=resolve;}));
 await render({stats:null,cargandoStats:true});
 expect(container.querySelector('[aria-label="Cargando Prácticas pendientes de preparar"]')).not.toBeNull();
 expect(container.querySelector('[aria-label="Cargando Activos registrados"]')).not.toBeNull();
 expect(container.querySelector('[role="alert"]')).toBeNull();
 await act(async()=>resolver({data:{insumos_total:0,stock_bajo:0,reactivos_por_vencer:0,insumos_caducados:0,practicas_solicitadas:0,alertas_insumos:{}}}));
 await render({stats,cargandoStats:false});
 expect(container.querySelector('.op-skeleton')).toBeNull();
 expect(container.querySelectorAll('.op-number')).toHaveLength(7);
 expect([...container.querySelectorAll('.op-number')].every(el=>el.textContent==='0')).toBe(true);
});

test('el error termina la carga, muestra folio y mantiene la jerarquía del panel',async()=>{
 api.get.mockRejectedValueOnce({response:{data:{folio:'TEST-1234'}}});
 await render();
 const aviso=container.querySelector('[role="alert"]');
 expect(aviso.textContent).toContain('Folio: TEST-1234');
 expect(container.querySelector('[aria-label="Prioridades del laboratorio"]').getAttribute('aria-busy')).toBe('false');
 expect(container.querySelector('.op-skeleton')).toBeNull();
 expect([...container.querySelectorAll('h3')].map(el=>el.textContent)).toEqual(['Por atender en el laboratorio','Próximas reservaciones 0','Resumen operativo','Acciones frecuentes']);
});


test('las prioridades explican la acción y las reservaciones aparecen solo en la agenda',async()=>{
 api.get.mockResolvedValueOnce({data:{insumos_total:4,stock_bajo:1,reactivos_por_vencer:1,insumos_caducados:1,practicas_solicitadas:2,alertas_insumos:{}}});
 await render();
 const prioridades=container.querySelector('[aria-label="Prioridades del laboratorio"]');
 expect(prioridades.textContent).toContain('Preparar materiales');
 expect(prioridades.textContent).toContain('Planificar reposición');
 expect(prioridades.textContent).toContain('Revisar vencimiento');
 expect(prioridades.textContent).toContain('Revisar antes de usar');
 expect(container.querySelector('[aria-label="Resumen operativo"]').textContent).not.toContain('Próximas reservaciones');
 expect(container.querySelector('[aria-label="Agenda del laboratorio"]').textContent).toContain('Próximas reservaciones');
});

test('reintentar cambia el error por esqueletos y conserva la navegación disponible',async()=>{
 api.get.mockRejectedValueOnce(new Error('Sin red'));
 await render();
 let resolver;api.get.mockImplementationOnce(()=>new Promise(resolve=>{resolver=resolve;}));
 await click('Reintentar alertas');
 expect(container.querySelector('[aria-label="Prioridades del laboratorio"]').getAttribute('aria-busy')).toBe('true');
 expect(container.querySelector('[role="alert"]')).toBeNull();
 expect(container.querySelector('[aria-label="Cargando Insumos caducados"]')).not.toBeNull();
 await click('Revisar solicitudes');
 expect(navigate).toHaveBeenLastCalledWith('/admin/practicas-laboratorio?laboratorio_id=4&estado=SOLICITADA');
 await act(async()=>resolver({data:{insumos_total:0,stock_bajo:0,reactivos_por_vencer:0,insumos_caducados:0,practicas_solicitadas:0,alertas_insumos:{}}}));
 expect(container.querySelector('.op-skeleton')).toBeNull();
});

test('identificación pendiente o fallida conserva el bloque de alertas sin asumir una categoría',async()=>{
 await render({categoria:'',estadoCategoria:'cargando'});
 expect(api.get).not.toHaveBeenCalled();
 expect(container.querySelector('[aria-label="Prioridades del laboratorio"]')).not.toBeNull();
 expect(container.querySelector('[aria-label="Cargando Insumos caducados"]')).not.toBeNull();
 await render({categoria:'',estadoCategoria:'error'});
 expect(container.querySelector('[aria-label="Prioridades del laboratorio"]')).not.toBeNull();
 expect(container.textContent).toContain('Reintentar identificación');
 expect(container.querySelector('.op-skeleton')).toBeNull();
 expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Revisar solicitudes').disabled).toBe(true);
});

test('química con formato distinto conserva alertas y el fallo del resumen no las oculta',async()=>{
 api.get.mockRejectedValueOnce(new Error('Sin red'));
 await render({categoria:' Química '});
 expect(api.get).toHaveBeenCalled();
 expect(container.querySelector('[aria-label="Prioridades del laboratorio"]')).not.toBeNull();
 expect(container.textContent).toContain('Revisar prácticas solicitadas');
 expect(container.querySelector('[role="alert"]').textContent).toContain('No se pudieron cargar las alertas');
});

test('contador de agenda distingue cero confirmado de datos no disponibles',async()=>{
 await render();
 expect(container.querySelector('[aria-label="0 próximas reservaciones"]')).not.toBeNull();
 expect(container.querySelector('[aria-label="Resumen operativo"]').querySelectorAll('article')).toHaveLength(3);
 await render({stats:null,errorStats:true});
 expect(container.querySelector('[aria-label="0 próximas reservaciones"]')).toBeNull();
});
