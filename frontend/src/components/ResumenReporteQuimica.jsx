import React, { useEffect, useRef, useState } from 'react';

const GRUPOS = {
  actividad: { titulo: 'Actividad del laboratorio', tablas: ['sesiones', 'programadas', 'practicas', 'asistencias', 'participantes_declarados'] },
  materiales: { titulo: 'Materiales y residuos', tablas: ['materiales_por_unidad', 'movimientos', 'residuos', 'residuos_por_unidad'] },
  pendientes: { titulo: 'Pendientes por revisar', tablas: ['sesiones', 'informacion_incompleta', 'alertas_actuales', 'prestamos_vencidos_actuales', 'activos_actuales', 'existencias_actuales'] },
};
const NOMBRES = {
  sesiones: 'Sesiones y horas de uso', programadas: 'Sesiones en agenda y cancelaciones', practicas: 'Prácticas en agenda',
  asistencias: 'Asistencia de alumnos', participantes_declarados: 'Participantes anotados', materiales_por_unidad: 'Consumos, entregas y devoluciones',
  movimientos: 'Movimientos de materiales', residuos: 'Registro de residuos', residuos_por_unidad: 'Cantidades de residuos',
  informacion_incompleta: 'Observaciones sobre los datos', alertas_actuales: 'Alertas actuales', prestamos_vencidos_actuales: 'Préstamos vencidos',
  activos_actuales: 'Estado de los activos', existencias_actuales: 'Existencias de materiales', incidentes: 'Incidentes registrados',
};
const base = clave => clave.replace(/^(actual|anterior)_/, '');
const esActual = clave => clave.endsWith('actuales');

export default function ResumenReporteQuimica({ reporte: r, renderTabla }) {
  const [detalle, setDetalle] = useState(null);
  const panel = useRef(null);
  useEffect(() => setDetalle(null), [r.consulta_id]);
  useEffect(() => { if (detalle) { panel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); panel.current?.focus(); } }, [detalle]);
  const comparar = Boolean(r.comparacion);
  const prefijo = comparar ? 'actual_' : '';
  const tabla = (clave, anterior = false) => r.tablas[`${anterior ? 'anterior_' : prefijo}${clave}`] || [];
  const valor = (clave, anterior = false) => r.indicadores.find(x => x.clave === `${anterior ? 'anterior_' : prefijo}${clave}`)?.valor ?? 'No disponible';
  const consumo = anterior => tabla('materiales_por_unidad', anterior).filter(x => x.tipo === 'CONSUMO');
  const materiales = anterior => new Set(consumo(anterior).map(x => `${x.insumo_id ?? x.material}|${x.unidad}`)).size;
  const observaciones = tabla('informacion_incompleta').length;
  const stocks = tabla('existencias_actuales');
  const activos = tabla('activos_actuales');
  const filasUso = [['programadas', 'Sesiones programadas'], ['CANCELADA', 'Sesiones canceladas'], ['cerradas_reales', 'Sesiones terminadas'], ['alumnos', 'Alumnos atendidos'], ['horas', 'Horas de uso confirmadas']];
  const resumenMateriales = anterior => <div className="space-y-2">
    <p>{materiales(anterior) ? `${materiales(anterior)} materiales con consumo registrado` : 'Sin consumo registrado'}</p>
    {!comparar && consumo(anterior).slice(0, 2).map((x, i) => <p key={i} className="text-sm">{x.material}: {x.cantidad} {x.unidad}</p>)}
    <p>{tabla('residuos', anterior).length ? `${tabla('residuos', anterior).length} registros de residuos` : 'Sin residuos registrados'}</p>
  </div>;
  const abrir = grupo => setDetalle(actual => actual === grupo ? null : grupo);
  const boton = (grupo, texto) => <button type="button" aria-expanded={detalle === grupo} aria-controls="detalle-operativo-quimica" className="mt-auto pt-4 text-left font-semibold underline" onClick={() => abrir(grupo)}>{texto}</button>;
  const estilo = { background: 'var(--surface-panel)', borderColor: 'var(--surface-border)' };
  const filas = detalle ? Object.entries(r.tablas).filter(([clave]) => GRUPOS[detalle].tablas.includes(base(clave))).map(([clave, datos]) => {
    if (detalle !== 'pendientes') return [clave, datos];
    if (base(clave) === 'sesiones') return [clave, datos.filter(x => x.regularizacion)];
    if (base(clave) === 'existencias_actuales') return [clave, datos.filter(x => x.bajo || x.caducado)];
    if (base(clave) === 'activos_actuales') return [clave, datos.filter(x => ['MANTENIMIENTO', 'DAÑADO'].includes(x.estado))];
    return [clave, datos];
  }).filter(([, datos]) => datos.length) : [];
  return <section aria-label="Resumen operativo" className="space-y-4">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <article aria-label="Uso del laboratorio" className="rounded-xl border p-5 flex flex-col gap-3" style={estilo}><h3 className="text-lg font-bold">Uso del laboratorio</h3><p className="text-xs">Actividad del periodo seleccionado</p>
        {comparar ? <div className="overflow-x-auto"><table className="text-sm w-full"><thead><tr><th className="text-left">Actividad</th><th>Seleccionado</th><th>Anterior</th></tr></thead><tbody>{filasUso.map(([clave, texto]) => <tr key={clave}><th className="text-left py-2 font-normal">{texto}</th><td className="text-center font-semibold">{valor(clave)}</td><td className="text-center">{valor(clave, true)}</td></tr>)}</tbody></table></div>
          : <dl className="space-y-2">{filasUso.map(([clave, texto]) => <div key={clave} className="flex justify-between gap-3"><dt>{texto}</dt><dd className="font-semibold">{valor(clave)}</dd></div>)}</dl>}
        {boton('actividad', 'Ver actividad')}
      </article>
      <article aria-label="Materiales y residuos" className="rounded-xl border p-5 flex flex-col gap-3" style={estilo}><h3 className="text-lg font-bold">Materiales y residuos</h3><p className="text-xs">Registros del periodo · cantidades por material y unidad</p>
        {comparar ? <><h4 className="text-sm font-semibold">Seleccionado</h4>{resumenMateriales(false)}<h4 className="text-sm font-semibold">Anterior</h4>{resumenMateriales(true)}</> : resumenMateriales(false)}
        {boton('materiales', 'Ver materiales')}
      </article>
      <article aria-label="Pendientes por revisar" className="rounded-xl border p-5 flex flex-col gap-3" style={estilo}><h3 className="text-lg font-bold">Pendientes por revisar</h3>
        <div className="space-y-2"><p className="text-xs font-semibold">Datos del periodo</p><p>{observaciones} {observaciones === 1 ? 'observación' : 'observaciones'} por revisar</p><p>{valor('regularizar')} sesiones sin cierre o con fechas por revisar</p>
          {comparar && <p className="text-sm">Anterior: {tabla('informacion_incompleta', true).length} observaciones · {valor('regularizar', true)} sesiones por revisar</p>}
          <p className="text-xs font-semibold pt-2">Estado actual del inventario</p>
          {stocks.length ? <><p>{stocks.filter(x => x.caducado).length} materiales caducados</p><p>{stocks.filter(x => x.bajo).length} materiales con existencia baja</p></> : <p>Sin insumos registrados</p>}
          {activos.length ? <><p>{activos.filter(x => x.estado === 'MANTENIMIENTO').length} activos en mantenimiento</p><p>{activos.filter(x => x.estado === 'DAÑADO').length} activos dañados</p></> : <p>Sin activos registrados</p>}
          <p>{tabla('prestamos_vencidos_actuales').length} préstamos vencidos</p>
          <p>{tabla('alertas_actuales').filter(x => ['Incidente', 'IncidentePractica'].includes(x.fuente)).length} incidentes pendientes</p>
        </div>{boton('pendientes', 'Revisar pendientes')}
      </article>
    </div>
    {detalle && <section id="detalle-operativo-quimica" ref={panel} tabIndex={-1} aria-label={GRUPOS[detalle].titulo} className="rounded-xl border p-4 space-y-3" style={estilo}>
      <div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold text-lg">{GRUPOS[detalle].titulo}</h3><button type="button" className="underline" onClick={() => setDetalle(null)}>Cerrar detalle</button></div>
      {detalle === 'pendientes' && <p className="text-sm">Una sesión puede tener varias observaciones. Los pendientes de inventario corresponden al estado actual; no se suman como un total de asuntos independientes.</p>}
      {!filas.length && <p>Sin registros en este apartado para la consulta.</p>}
      {filas.map(([clave, datos]) => <details key={clave} className="border rounded-lg p-3" style={{ borderColor: 'var(--surface-border)' }}><summary className="cursor-pointer font-semibold">{NOMBRES[base(clave)]}{comparar && !esActual(clave) ? clave.startsWith('anterior_') ? ' · Anterior' : ' · Seleccionado' : ''} ({datos.length})</summary>{renderTabla(datos)}</details>)}
    </section>}
  </section>;
}
