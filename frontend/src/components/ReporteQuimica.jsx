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
const GRUPOS = [
  { titulo: 'Prácticas y sesiones', claves: ['programadas', 'practicas', 'iniciadas', 'ejecutadas', 'cerradas_reales'] },
  { titulo: 'Tiempo y seguimiento', claves: ['horas', 'regularizar'] },
  { titulo: 'Personas y asistencia', claves: ['docentes', 'alumnos', 'asistencias'] },
  { titulo: 'Estados de sesión', claves: ['SOLICITADA', 'PREPARADA', 'EN_CURSO', 'CERRADA', 'CANCELADA'], compacto: true },
];
const contarObservaciones = n => `${n} ${n === 1 ? 'observación' : 'observaciones'}`;
const rangoLegible = texto => texto.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');
const claveBase = clave => clave.replace(/^(actual|anterior)_/, '');
const grupoIndicador = clave => Math.max(0, GRUPOS.findIndex(g => g.claves.includes(claveBase(clave))));
const fechaReporte = (fecha, zona) => new Date(fecha).toLocaleDateString('es-MX', { timeZone: zona, day: '2-digit', month: '2-digit', year: 'numeric' });

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
  const [aviso, setAviso] = useState('');
  const vigente = useRef(0);
  const observacionesRefs = useRef({});
  useEffect(() => {
    let activo = true;
    const id = ++vigente.current;
    setCorte(null); setError(''); setCargando(true); setAviso('');
    api.get(`/reportes/quimica/${modo}?laboratorio_id=${laboratorioId}&mes=${mes}&anio=${anio}`, { params: { sin_contexto_periodo: true } })
      .then(({ data }) => { if (activo && id === vigente.current) { setCorte(data); if (revision > 0) setAviso('Reporte actualizado.'); } })
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
  const observaciones = Object.entries(r?.tablas || {}).filter(([nombre, filas]) => nombre.endsWith('informacion_incompleta') && filas.length);
  const totalObservaciones = observaciones.reduce((total, [, filas]) => total + filas.length, 0);
  const revisarObservaciones = () => {
    observaciones.forEach(([nombre]) => { if (observacionesRefs.current[nombre]) observacionesRefs.current[nombre].open = true; });
    const primero = observacionesRefs.current[observaciones[0]?.[0]];
    primero?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    primero?.querySelector('summary')?.focus();
  };
  const estadoPeriodo = r ? (new Date(r.generado_en) < new Date(r.periodo.desde) ? 'Periodo futuro' : new Date(r.generado_en) < new Date(r.periodo.hasta_exclusivo) ? 'Periodo en curso: resultados parciales' : '') : '';
  const actual = nombre => nombre.endsWith('actuales');
  const titulo = nombre => {
    const prefijo = nombre.startsWith('actual_') ? 'actual_' : nombre.startsWith('anterior_') ? 'anterior_' : '';
    return `${prefijo ? `${prefijo === 'actual_' ? 'Cuatrimestre seleccionado' : 'Cuatrimestre anterior'}: ` : ''}${TITULOS[nombre.slice(prefijo.length)] || etiqueta(nombre)}`;
  };
  const seccion = (nombre, filas) => <details key={nombre} ref={node => { if (nombre.endsWith('informacion_incompleta')) observacionesRefs.current[nombre] = node; }} className="rounded-xl border p-4" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-panel)', ...(nombre.endsWith('informacion_incompleta') && filas.length ? { borderLeft: '4px solid #d97706' } : {}) }}>
    <summary className="cursor-pointer font-semibold">{titulo(nombre)} {nombre.endsWith('informacion_incompleta') && filas.length ? <span className="ml-2 rounded-full bg-amber-100 text-amber-900 px-2 py-1 text-xs">{contarObservaciones(filas.length)}</span> : `(${filas.length})`}</summary>
    {nombre.endsWith('alertas_actuales') && !filas.length && <p className="mt-2">Sin pendientes detectados en las fuentes consultadas.</p>}
    {nombre.endsWith('informacion_incompleta') && <p className="mt-2 text-sm">Revisa los datos faltantes o anteriores. Una sesión puede tener varias observaciones.</p>}
    <TablaReporte filas={filas}/>
  </details>;
  return <section className="space-y-5" aria-label="Reporte de Química" aria-busy={cargando}>
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-xl font-bold">{modo === 'comparativo' ? 'Comparativo de Química y Agroindustria' : 'Reporte de Química y Agroindustria'}</h2>
      <div className="flex flex-wrap gap-3"><button type="button" className="rounded-xl border px-4 py-2 inline-flex items-center gap-2 disabled:opacity-60" disabled={cargando} onClick={() => setRevision(x => x + 1)}>{cargando && <svg aria-hidden="true" className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25"/><path d="M12 3a9 9 0 019 9" stroke="currentColor" strokeWidth="3"/></svg>}{cargando ? 'Actualizando…' : error && !r ? 'Reintentar reporte' : 'Actualizar'}</button>
        <button type="button" className="rounded-xl bg-emerald-700 text-white px-4 py-2 disabled:opacity-50" disabled={!r || cargando || descargando} onClick={descargar}>{descargando ? 'Generando…' : 'Descargar Excel'}</button></div>
    </div>
    {error && <p role="alert">{error}</p>}
    {cargando && <p role="status">Calculando actividad registrada…</p>}
    <p role="status" aria-live="polite" className="text-sm">{aviso}</p>
    {r && <>
      <div aria-label="Resumen del reporte" className="space-y-2 border-b pb-3" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1"><h3 className="font-bold">{r.laboratorio.nombre}</h3>
          <p>Periodo: {fechaReporte(r.periodo.desde, r.zona_horaria)} al {fechaReporte(new Date(new Date(r.periodo.hasta_exclusivo).getTime() - 86400000), r.zona_horaria)}</p>
          <p className="text-sm">Actualizado: {fechaReporte(r.generado_en, r.zona_horaria)}, {new Date(r.generado_en).toLocaleTimeString('es-MX', { timeZone: r.zona_horaria, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</p>
        </div>
        {r.comparacion && <p className="text-sm">Comparando {rangoLegible(r.comparacion.actual)} frente a {rangoLegible(r.comparacion.anterior)}</p>}
        {estadoPeriodo && <p className="text-sm font-semibold">{estadoPeriodo}</p>}
      </div>
      {totalObservaciones > 0 && <aside aria-label="Observaciones sobre la información" className="rounded-xl border border-amber-300 bg-amber-50 text-amber-950 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1"><p className="font-semibold">{contarObservaciones(totalObservaciones)} sobre los datos</p><button type="button" className="font-semibold underline" onClick={revisarObservaciones}>Revisar</button></aside>}
      <h3 className="text-lg font-bold">Actividad del periodo</h3>
      {GRUPOS.map((grupo, i) => {
        const indicadores = r.indicadores.filter(x => grupoIndicador(x.clave) === i);
        if (!indicadores.length) return null;
        return <section key={grupo.titulo} aria-label={grupo.titulo} className="space-y-3"><h4 className="text-sm font-semibold border-b pb-2" style={{ borderColor: 'var(--surface-border)' }}>{grupo.titulo}</h4>
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${grupo.compacto ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-3`}>{indicadores.map(x => {
            const contenido = <><span className="block text-sm">{x.titulo}</span><span className={`block font-bold ${grupo.compacto ? 'text-lg mt-1' : 'text-2xl mt-2'}`}>{x.valor} {x.unidad}</span></>;
            return x.detalle.length ? <details key={x.clave} className="rounded-xl border p-4 open:col-span-full" style={{ background: 'var(--surface-panel)', borderColor: 'var(--surface-border)' }}><summary className="cursor-pointer">{contenido}<span className="text-xs font-semibold underline">Ver registros ({x.detalle.length})</span></summary><TablaReporte filas={x.detalle}/></details>
              : <div key={x.clave} className="rounded-xl border p-4" style={{ background: 'var(--surface-panel-soft)', borderColor: 'var(--surface-border)' }}>{contenido}<span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sin registros</span></div>;
          })}</div>
        </section>;
      })}
      <p className="text-sm">Las horas sin cierre se muestran como no determinadas. Las cantidades se separan por material, lote, unidad y tipo de movimiento. Las asistencias reflejan el estado guardado en prácticas.</p>
      <div className="space-y-3">{Object.entries(r.tablas).filter(([nombre]) => !actual(nombre)).map(([nombre, filas]) => seccion(nombre, filas))}</div>
      <h3 className="text-lg font-bold">Situación actual al generar el reporte</h3>
      <p className="text-sm">Existencias, activos y pendientes actuales. No representan cómo estaba el inventario en el mes consultado. Las alertas cubren las fuentes registradas; no certifican la seguridad del laboratorio.</p>
      <div className="space-y-3">{Object.entries(r.tablas).filter(([nombre]) => actual(nombre)).map(([nombre, filas]) => seccion(nombre, filas))}</div>
      <details className="rounded-xl border p-4" style={{ borderColor: 'var(--surface-border)' }}><summary className="cursor-pointer font-semibold">Criterios de cálculo y alcance</summary><ul className="list-disc pl-5 space-y-2 mt-3">{r.reglas.map(regla => <li key={regla}>{regla}</li>)}</ul></details>
      <details className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--surface-border)' }}><summary className="cursor-pointer font-semibold">Detalles del reporte</summary>
        <div className="mt-3 space-y-2 break-words"><p>Generado por: {r.generado_por}</p><p>Zona horaria: {r.zona_horaria}</p><p className="break-all">ID de consulta: {r.consulta_id}</p><p>Este ID identifica la consulta y el Excel correspondiente; no permite recuperar reportes anteriores. La firma de integridad es un mecanismo separado.</p><p>El Excel conserva los resultados de esta consulta; actualizar genera otra.</p></div>
      </details>
    </>}
  </section>;
}
