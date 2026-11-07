import React, { useEffect, useRef, useState } from 'react';
import api from '../hooks/useApi';
import { getApiErrorMessage } from '../utils/apiError';

const TITULOS = {
  sesiones: 'Ejecución y horas reales', programadas: 'Sesiones programadas y estados', practicas: 'Prácticas y estado del plan',
  asistencias: 'Asistencia registrada', participantes_declarados: 'Participantes declarados (sin conteo de personas únicas)',
  materiales_por_unidad: 'Entregado, consumido, devuelto y ajustes por material y unidad', movimientos: 'Bitácora de movimientos de materiales',
  residuos: 'Bitácora de residuos', residuos_por_unidad: 'Residuos por descripción, clasificación y unidad', incidentes: 'Incidentes del periodo',
  informacion_incompleta: 'Información incompleta y datos anteriores', existencias_actuales: 'Existencias y caducidades actuales',
  activos_actuales: 'Activos asignados: estado actual', prestamos_vencidos_actuales: 'Préstamos vencidos actualmente', alertas_actuales: 'Pendientes actuales detectados',
};
const etiqueta = texto => texto.replaceAll('_', ' ');
const mostrar = value => value === null || value === undefined ? 'No registrado' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);

export function TablaReporte({ filas }) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [filas]);
  if (!filas.length) return <p className="py-3 text-sm">Sin registros en esta fuente para la consulta. No implica ausencia de información en otras fuentes.</p>;
  const columnas = [...new Set(filas.flatMap(f => Object.keys(f)))];
  const totalPaginas = Math.ceil(filas.length / 10);
  const visibles = filas.slice((pagina - 1) * 10, pagina * 10);
  return <div className="space-y-2 mt-3">
    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{columnas.map(c => <th key={c} className="p-2 border-b whitespace-nowrap">{etiqueta(c)}</th>)}</tr></thead>
      <tbody>{visibles.map((fila, i) => <tr key={i}>{columnas.map(c => <td key={c} className="p-2 border-b align-top">{c === 'horas_confirmadas' && fila[c] == null ? 'No determinada' : mostrar(fila[c])}</td>)}</tr>)}</tbody></table></div>
    <div className="flex flex-wrap justify-between gap-2 text-sm"><span>Mostrando {(pagina - 1) * 10 + 1}–{Math.min(pagina * 10, filas.length)} de {filas.length} registros</span>
      {totalPaginas > 1 && <div className="flex gap-3"><button type="button" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</button><button type="button" disabled={pagina === totalPaginas} onClick={() => setPagina(p => p + 1)}>Siguiente</button></div>}</div>
  </div>;
}

export default function ReporteQuimica({ laboratorioId, mes, anio, modo = 'mensual' }) {
  const [corte, setCorte] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [revision, setRevision] = useState(0);
  const vigente = useRef(0);
  useEffect(() => {
    let activo = true;
    const id = ++vigente.current;
    setCorte(null); setError(''); setCargando(true);
    api.get(`/reportes/quimica/${modo}?laboratorio_id=${laboratorioId}&mes=${mes}&anio=${anio}`, { params: { sin_contexto_periodo: true } })
      .then(({ data }) => { if (activo && id === vigente.current) setCorte(data); })
      .catch(e => { if (activo) setError(getApiErrorMessage(e, 'No se pudo cargar el reporte de Química.')); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; vigente.current++; };
  }, [laboratorioId, mes, anio, modo, revision]);
  const descargar = async () => {
    const id = vigente.current;
    setDescargando(true); setError('');
    try {
      const { data } = await api.post('/reportes/quimica/excel', corte, { responseType: 'blob' });
      if (id !== vigente.current) return;
      const url = URL.createObjectURL(data);
      const link = document.createElement('a'); link.href = url;
      link.download = `Reporte_Quimica_${corte.reporte.consulta_id}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (e) {
      if (id === vigente.current) {
        let mensaje = 'No se pudo descargar. Actualiza el reporte e inténtalo de nuevo.';
        if (e.response?.data instanceof Blob) {
          try { mensaje = JSON.parse(await e.response.data.text()).detail || mensaje; } catch { /* respuesta no JSON */ }
        } else mensaje = getApiErrorMessage(e, mensaje);
        setError(mensaje);
      }
    } finally { setDescargando(false); }
  };
  const r = corte?.reporte;
  const actual = nombre => nombre.endsWith('actuales');
  const titulo = nombre => {
    const prefijo = nombre.startsWith('actual_') ? 'actual_' : nombre.startsWith('anterior_') ? 'anterior_' : '';
    return `${prefijo ? `${prefijo === 'actual_' ? 'Cuatrimestre seleccionado' : 'Cuatrimestre anterior'}: ` : ''}${TITULOS[nombre.slice(prefijo.length)] || etiqueta(nombre)}`;
  };
  const seccion = (nombre, filas) => <details key={nombre} className="rounded-xl border p-4" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-panel)' }}>
    <summary className="cursor-pointer font-semibold">{titulo(nombre)} ({filas.length})</summary>
    {nombre.endsWith('alertas_actuales') && !filas.length && <p className="mt-2">Sin pendientes detectados en las fuentes consultadas.</p>}
    <TablaReporte filas={filas}/>
  </details>;
  return <section className="space-y-5" aria-label="Reporte de Química">
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-xl font-bold">{modo === 'comparativo' ? 'Comparativo de Química y Agroindustria' : 'Reporte de Química y Agroindustria'}</h2>
      <div className="flex gap-3"><button type="button" className="rounded-xl border px-4 py-2" disabled={cargando} onClick={() => setRevision(x => x + 1)}>Actualizar reporte</button>
        <button type="button" className="rounded-xl bg-emerald-700 text-white px-4 py-2 disabled:opacity-50" disabled={!r || cargando || descargando} onClick={descargar}>{descargando ? 'Generando…' : 'Descargar Excel de esta consulta'}</button></div>
    </div>
    {error && <p role="alert">{error}</p>}
    {cargando && <p role="status">Calculando actividad registrada…</p>}
    {r && <>
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--surface-border)' }}><h3 className="font-bold">{r.laboratorio.nombre}</h3>
        <p>Capacidad registrada: {r.laboratorio.capacidad_registrada ?? 'No registrada'} · Unidad pendiente de confirmar.</p>
        <p>Periodo: {r.periodo.desde.slice(0, 10)} a {new Date(new Date(r.periodo.hasta_exclusivo).getTime() - 86400000).toLocaleDateString('es-MX', { timeZone: r.zona_horaria })}</p>
        {r.comparacion && <p>Seleccionado: {r.comparacion.actual} · Anterior: {r.comparacion.anterior}. {r.comparacion.alcance}</p>}
        <p className="mt-2 text-sm">Generado el {new Date(r.generado_en).toLocaleString('es-MX', { timeZone: r.zona_horaria })} por {r.generado_por} · {r.zona_horaria}</p>
        <p className="text-xs break-all">ID de consulta: {r.consulta_id}. El Excel conserva este mismo corte; actualizar crea uno nuevo.</p>
      </div>
      <h3 className="text-lg font-bold">Actividad del periodo</h3>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{r.indicadores.map(x => <details key={x.clave} className="rounded-xl border p-4 open:col-span-full" style={{ background: 'var(--surface-panel)', borderColor: 'var(--surface-border)' }}>
        <summary className="cursor-pointer"><span className="block text-sm">{x.titulo}</span><span className="block text-2xl font-bold mt-2">{x.valor} {x.unidad}</span><span className="text-xs">Ver registros</span></summary>
        <TablaReporte filas={x.detalle}/>
      </details>)}</div>
      <p className="text-sm">Las horas sin cierre se muestran como no determinadas. Las cantidades se separan por material, lote, unidad y tipo de movimiento. Las asistencias reflejan el estado guardado en prácticas.</p>
      <div className="space-y-3">{Object.entries(r.tablas).filter(([nombre]) => !actual(nombre)).map(([nombre, filas]) => seccion(nombre, filas))}</div>
      <h3 className="text-lg font-bold">Situación actual al generar el reporte</h3>
      <p className="text-sm">Existencias, activos y pendientes actuales. No representan cómo estaba el inventario en el mes consultado. Las alertas cubren las fuentes registradas; no certifican la seguridad del laboratorio.</p>
      <div className="space-y-3">{Object.entries(r.tablas).filter(([nombre]) => actual(nombre)).map(([nombre, filas]) => seccion(nombre, filas))}</div>
      <details className="rounded-xl border p-4" style={{ borderColor: 'var(--surface-border)' }}><summary className="cursor-pointer font-semibold">Criterios de cálculo y alcance</summary><ul className="list-disc pl-5 space-y-2 mt-3">{r.reglas.map(regla => <li key={regla}>{regla}</li>)}</ul></details>
    </>}
  </section>;
}
