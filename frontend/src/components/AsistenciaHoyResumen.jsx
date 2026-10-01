import { useState } from 'react';
import AsistenciaHorarioChart from './AsistenciaHorarioChart';

const TABS = ['Vista general', 'Por carrera', 'Por grupo'];
const COLUMNAS = [['carrera', 'Carrera'], ['asistentes', 'Alumnos del día'], ['a_tiempo', 'A tiempo'], ['retardos', 'Retardos'], ['faltaron', 'Faltas al corte'], ['justificados', 'Justificados'], ['listas_confirmadas', 'Listas confirmadas'], ['listas_pendientes', 'Pendientes']];

function EstadoGrupo({ grupo: g }) {
  return <div className="flex flex-wrap gap-1">
    <span className={`attendance-badge ${g.estado === 'CON_LISTA' ? 'is-complete' : g.estado === 'SIN_LISTA' ? 'is-pending' : 'is-neutral'}`}>
      {{ CON_LISTA: 'Confirmada', SIN_LISTA: 'Sin confirmar', POR_INICIAR: 'Por iniciar', SIN_ACTIVIDAD: 'Sin actividad' }[g.estado]}
    </span>
    {g.listas_en_captura > 0 && <span className="attendance-badge is-pending">En captura / corrección: {g.listas_en_captura}</span>}
    {g.estado === 'CON_LISTA' && g.listas_pendientes > 0 && <span className="attendance-badge is-pending">Con pendientes</span>}
  </div>;
}

export default function AsistenciaHoyResumen({ datos }) {
  const [tab, setTab] = useState(0);
  const [mostrarSinActividad, setMostrarSinActividad] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [orden, setOrden] = useState({ campo: 'asistentes', asc: false });
  const r = datos.resumen;
  const sinActividad = datos.grupos.filter(g => g.estado === 'SIN_ACTIVIDAD').length;
  const grupos = datos.grupos.filter(g => (mostrarSinActividad || g.estado !== 'SIN_ACTIVIDAD') && (!soloPendientes || g.listas_pendientes > 0));
  const carreras = [...datos.carreras].sort((a, b) => {
    const comparacion = orden.campo === 'carrera' ? a.carrera.localeCompare(b.carrera, 'es') : a[orden.campo] - b[orden.campo];
    return (orden.asc ? 1 : -1) * comparacion;
  });
  const pendientes = () => { setSoloPendientes(true); setTab(2); };
  return <>
    <section aria-label="Indicadores principales" className="attendance-kpis grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ['Alumnos del día', r.asistentes, 'Distintos, con asistencia confirmada'],
        ['A tiempo', r.a_tiempo, 'Sin retardos registrados'],
        ['Con retardo', r.retardos, 'Al menos un retardo registrado'],
        ['Listas pendientes', r.listas_pendientes, 'De clases iniciadas al corte'],
      ].map(([nombre, cantidad, nota], i) => <div key={nombre} className={`attendance-kpi ${i === 0 ? 'is-primary' : ''}`}>
        <p className="text-sm text-slate-300">{nombre}</p><p className="my-1 text-3xl font-bold tabular-nums text-white">{cantidad}</p><p className="text-xs text-slate-400">{nota}</p>
      </div>)}
    </section>
    {r.listas_pendientes > 0 && <div className="attendance-pending-row flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm" role="status">
      <span><b>{r.listas_pendientes} listas pendientes.</b> {r.grupos_sin_lista} grupos aún sin lista confirmada. El corte está incompleto.</span>
      <button type="button" onClick={pendientes} className="font-semibold underline underline-offset-2">Ver pendientes</button>
    </div>}
    {datos.nota_calendario && <p className="attendance-calendar rounded-lg border px-3 py-2 text-sm">Calendario: {datos.nota_calendario}</p>}
    <div>
      <div role="tablist" aria-label="Vistas de asistencia" className="attendance-tabs flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((nombre, i) => <button type="button" role="tab" id={`asistencia-tab-${i}`} aria-selected={tab === i} aria-controls={`asistencia-panel-${i}`} tabIndex={tab === i ? 0 : -1} key={nombre}
          onClick={() => setTab(i)} onKeyDown={e => {
            let siguiente;
            if (e.key === 'ArrowRight') siguiente = (i + 1) % TABS.length;
            if (e.key === 'ArrowLeft') siguiente = (i + TABS.length - 1) % TABS.length;
            if (e.key === 'Home') siguiente = 0;
            if (e.key === 'End') siguiente = TABS.length - 1;
            if (siguiente !== undefined) { e.preventDefault(); setTab(siguiente); document.getElementById(`asistencia-tab-${siguiente}`)?.focus(); }
          }} className="whitespace-nowrap px-4 py-3 text-sm font-semibold">{nombre}</button>)}
      </div>
      <section role="tabpanel" id={`asistencia-panel-${tab}`} aria-labelledby={`asistencia-tab-${tab}`} tabIndex="0" className="pt-4">
        {tab === 0 && <>
          <AsistenciaHorarioChart key={datos.corte} serie={datos.asistencia_por_horario} />
          <details className="attendance-disclosure mt-3 rounded-lg border border-white/10 p-3 text-sm text-slate-300">
            <summary className="cursor-pointer font-semibold">Ver desglose y cobertura del día</summary>
            <dl className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">{[
              ['Faltas al corte', r.faltaron], ['Justificados', r.justificados], ['Listas confirmadas', r.listas_confirmadas], ['Grupos con lista', r.grupos_con_lista], ['Grupos sin lista', r.grupos_sin_lista], ['Grupos por iniciar', r.grupos_por_iniciar],
            ].map(([nombre, valor]) => <div key={nombre}><dt className="text-xs text-slate-400">{nombre}</dt><dd className="mt-1 font-semibold text-white">{valor}</dd></div>)}</dl>
          </details>
        </>}
        {tab === 1 && <div className="attendance-table overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[850px] text-left text-sm"><caption className="p-3 text-left text-xs text-slate-400">Comparación por carrera · Pulsa un encabezado para ordenar.</caption>
            <thead className="text-slate-400"><tr>{COLUMNAS.map(([campo, nombre]) => <th key={campo} scope="col" aria-sort={orden.campo === campo ? orden.asc ? 'ascending' : 'descending' : 'none'} className="px-3 py-3">
              <button type="button" className="text-left" onClick={() => setOrden({ campo, asc: orden.campo === campo ? !orden.asc : campo === 'carrera' })}>{nombre}{orden.campo === campo ? orden.asc ? ' ↑' : ' ↓' : ''}</button>
            </th>)}</tr></thead>
            <tbody className="divide-y divide-white/10 text-slate-200">{carreras.map(c => <tr key={c.carrera}>{COLUMNAS.map(([campo]) => <td key={campo} className="px-3 py-3 tabular-nums">{campo === 'carrera' ? <b>{c.carrera}</b> : !c.listas_confirmadas && ['asistentes', 'a_tiempo', 'retardos', 'faltaron', 'justificados'].includes(campo) ? '—' : c[campo]}</td>)}</tr>)}</tbody>
          </table>{!carreras.length && <p className="p-4 text-sm text-slate-400">No hay carreras para este corte.</p>}
        </div>}
        {tab === 2 && <>
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={mostrarSinActividad} onChange={e => setMostrarSinActividad(e.target.checked)} />Mostrar grupos sin actividad ({sinActividad})</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />Solo con listas pendientes</label>
            <span className="text-xs text-slate-400">{grupos.length} de {datos.grupos.length} grupos</span>
          </div>
          <div className="attendance-table overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[850px] text-left text-sm">
            <caption className="sr-only">Detalle por grupo</caption><thead className="text-slate-400"><tr>{['Grupo / carrera', 'Alumnos del día', 'Confirmadas', 'Pendientes', 'Estado', 'Desglose'].map(t => <th key={t} scope="col" className="px-3 py-3">{t}</th>)}</tr></thead>
            <tbody className="divide-y divide-white/10 text-slate-200">{grupos.map(g => <tr key={g.id}>
              <td className="px-3 py-3"><b>{g.nombre}{g.turno ? ` · ${g.turno}` : ''}</b><span className="block max-w-xs text-xs text-slate-400">{g.carrera}</span></td>
              <td className="px-3 py-3 font-semibold tabular-nums">{g.listas_confirmadas ? g.asistentes : '—'}</td><td className="px-3 py-3 tabular-nums">{g.listas_confirmadas}</td><td className="px-3 py-3 tabular-nums">{g.listas_pendientes}</td>
              <td className="px-3 py-3"><EstadoGrupo grupo={g} /></td>
              <td className="px-3 py-3"><details><summary className="cursor-pointer text-xs font-semibold" aria-label={`Ver desglose de ${g.nombre}, ${g.carrera}`}>Ver detalle</summary><dl className="mt-2 min-w-[150px] space-y-1 text-xs">{[['A tiempo', 'a_tiempo'], ['Retardos', 'retardos'], ['Faltas al corte', 'faltaron'], ['Justificados', 'justificados'], ['Con registro', 'alumnos_con_registro']].map(([label, campo]) => <div key={campo} className="flex justify-between gap-3"><dt>{label}</dt><dd>{g.listas_confirmadas ? g[campo] : '—'}</dd></div>)}</dl></details></td>
            </tr>)}</tbody>
          </table>{!grupos.length && <p className="p-5 text-sm text-slate-400">No hay grupos que coincidan con estos filtros.</p>}</div>
        </>}
      </section>
    </div>
    <details className="attendance-disclosure text-sm text-slate-400"><summary className="cursor-pointer font-semibold">Cómo interpretar estos datos</summary>
      <div className="mt-3 space-y-2 text-xs leading-relaxed"><p>El total diario cuenta a cada alumno una sola vez. A tiempo y con retardo forman ese total; las faltas al corte no indican necesariamente ausencia de todo el día.</p>
        <p>Sin lista confirmada se muestra —, no una falta. Un grupo puede tener listas confirmadas y otras pendientes. Las capturas sin conexión aparecen tras sincronizarse y cerrar su lista.</p>
        <p>El corte cambia al pulsar Actualizar. El Excel consulta un nuevo corte al exportar e incluye todos los grupos de la carrera seleccionada, aunque estén ocultos en esta vista.</p>
        <p>{datos.criterio} “Con registro” incluye cualquier estado. Los totales se deduplican en cada nivel; no se obtienen sumando filas.</p>
      </div>
    </details>
  </>;
}
