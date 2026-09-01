import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { usePeriodo } from '../../context/PeriodoContext';
import api from '../../hooks/useApi';

const pct = (valor) => valor == null ? '—' : `${valor}%`;
const normalizar = (valor = '') => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ReporteAcademicoGrupos() {
  const { periodo } = usePeriodo();
  const [catalogos, setCatalogos] = useState({ periodos: [], grupos: [] });
  const [seleccion, setSeleccion] = useState([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const periodoId = periodo?.id ? String(periodo.id) : '';

  useEffect(() => {
    api.get('/reportes-academicos/catalogos').then(({ data }) => {
      setCatalogos(data);
    }).catch((err) => setError(err.response?.data?.detail || 'No se pudieron cargar los grupos.'));
  }, []);

  useEffect(() => {
    setSeleccion([]);
    setDatos(null);
    setError('');
    setBusqueda('');
  }, [periodoId]);

  const grupos = useMemo(() => catalogos.grupos
    .filter((g) => String(g.periodo_id) === periodoId)
    .sort((a, b) => a.carrera.localeCompare(b.carrera, 'es') || a.nombre.localeCompare(b.nombre, 'es', { numeric: true })), [catalogos.grupos, periodoId]);
  const gruposFiltrados = useMemo(() => {
    const termino = normalizar(busqueda.trim());
    return termino ? grupos.filter((g) => normalizar(`${g.nombre} ${g.carrera} ${g.turno || ''}`).includes(termino)) : grupos;
  }, [grupos, busqueda]);
  const gruposPorCarrera = useMemo(() => gruposFiltrados.reduce((acc, grupo) => {
    (acc[grupo.carrera] ||= []).push(grupo);
    return acc;
  }, {}), [gruposFiltrados]);
  const gruposSeleccionados = useMemo(() => grupos.filter((g) => seleccion.includes(g.id)), [grupos, seleccion]);
  const params = () => ({ periodo_id: periodoId, grupos: seleccion.join(','), ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) });

  const alternar = (id) => setSeleccion((actual) => actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]);
  const alternarConjunto = (ids) => setSeleccion((actual) => ids.every((id) => actual.includes(id)) ? actual.filter((id) => !ids.includes(id)) : [...new Set([...actual, ...ids])]);
  const consultar = async () => {
    if (!seleccion.length) { setError('Selecciona al menos un grupo.'); return; }
    setCargando(true); setError('');
    try { const { data } = await api.get('/reportes-academicos', { params: params() }); setDatos(data); }
    catch (err) { setError(err.response?.data?.detail || 'No se pudo generar el reporte.'); }
    finally { setCargando(false); }
  };
  const exportar = async (formato) => {
    setExportando(formato); setError('');
    try {
      const { data, headers } = await api.get(`/reportes-academicos/exportar.${formato}`, { params: params(), responseType: 'blob' });
      const url = URL.createObjectURL(data); const enlace = document.createElement('a'); enlace.href = url;
      const indicado = headers['content-disposition']?.match(/filename="?([^";]+)"?/i)?.[1];
      enlace.download = indicado || `reporte_academico.${formato}`; enlace.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err.response?.data?.detail || `No se pudo exportar el ${formato.toUpperCase()}.`); }
    finally { setExportando(''); }
  };

  return <AdminLayout><div className="space-y-5">
    <header><h1 className="text-2xl font-bold text-white">Reporte académico de grupos</h1><p className="text-sm text-slate-400">Compara uno o varios grupos para reuniones académicas y seguimiento de División de Carrera.</p></header>
    <section className="glass space-y-4 rounded-2xl p-5">
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-[260px] flex-1 text-sm font-semibold text-slate-300">Buscar grupos<input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Grupo, carrera o turno" className="input-dark mt-1" /></label>
          <button type="button" onClick={() => alternarConjunto(gruposFiltrados.map((g) => g.id))} disabled={!gruposFiltrados.length} className="pb-2 text-xs font-semibold text-emerald-400 disabled:opacity-40">{gruposFiltrados.length && gruposFiltrados.every((g) => seleccion.includes(g.id)) ? 'Quitar grupos visibles' : 'Seleccionar grupos visibles'}</button>
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-white/10 p-3">
          {Object.entries(gruposPorCarrera).map(([carrera, gruposCarrera]) => <section key={carrera} className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{carrera}</h2><button type="button" onClick={() => alternarConjunto(gruposCarrera.map((g) => g.id))} className="shrink-0 text-xs font-semibold text-emerald-400">{gruposCarrera.every((g) => seleccion.includes(g.id)) ? 'Quitar carrera' : 'Seleccionar carrera'}</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{gruposCarrera.map((g) => <label key={g.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${seleccion.includes(g.id) ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/5 bg-white/[0.025]'}`}><input type="checkbox" checked={seleccion.includes(g.id)} onChange={() => alternar(g.id)} className="mt-1 accent-emerald-500"/><span><b className="block text-sm text-white">{g.nombre}{g.turno ? ` · ${g.turno}` : ''}</b></span></label>)}</div></section>)}
          {!gruposFiltrados.length && <p className="p-5 text-center text-sm text-slate-400">{grupos.length ? 'No hay grupos que coincidan con la búsqueda.' : `No hay grupos registrados para ${periodo?.clave || 'el periodo seleccionado'}.`}</p>}
        </div>
        {gruposSeleccionados.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-400">Seleccionados:</span>{gruposSeleccionados.map((g) => <button key={g.id} type="button" onClick={() => alternar(g.id)} className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200" title="Quitar de la selección">{g.nombre} · {g.carrera} ×</button>)}</div>}
      </div>
      <details className="rounded-xl border border-white/10 bg-white/[0.02] p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-300">Filtros adicionales de fecha{desde || hasta ? ' · activos' : ''}</summary><div className="mt-3 grid gap-4 md:grid-cols-2"><label className="text-sm text-slate-300">Desde <span className="text-slate-500">(opcional)</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input-dark mt-1" /></label><label className="text-sm text-slate-300">Hasta <span className="text-slate-500">(opcional)</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input-dark mt-1" /></label></div></details>
      <div className="flex flex-wrap items-center gap-3"><button onClick={consultar} disabled={cargando || !seleccion.length} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{cargando ? 'Generando…' : `Generar reporte (${seleccion.length})`}</button>{datos && <>{['pdf', 'xlsx'].map((formato) => <button key={formato} onClick={() => exportar(formato)} disabled={Boolean(exportando)} className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 disabled:opacity-50">{exportando === formato ? 'Preparando…' : `Exportar ${formato === 'xlsx' ? 'Excel' : 'PDF'}`}</button>)}</>}</div>
    </section>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {datos && <>
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3 text-sm text-blue-100"><b>Alcance:</b> Periodo {datos.periodo.clave} · {datos.resumen.grupos} {datos.resumen.grupos === 1 ? 'grupo' : 'grupos'} · {desde || hasta ? `${desde || 'inicio del periodo'} a ${hasta || 'fin del periodo'}` : 'periodo completo'}</div>
      {datos.resumen.materias === 0 ? <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100"><h2 className="font-semibold">No hay información académica para reportar</h2><p className="mt-1 text-sm">El periodo {datos.periodo.clave} no tiene materias configuradas para {datos.grupos.map((g) => `${g.nombre} · ${g.carrera}`).join('; ')}. Configure la carga académica antes de evaluar sesiones, asistencia o indicadores.</p></div> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[['Alumnos',datos.resumen.alumnos],['Materias',datos.resumen.materias],['Sesiones registradas',`${datos.resumen.sesiones} de ${datos.resumen.sesiones_programadas}`],['Cobertura',pct(datos.resumen.cobertura)],['Alumnos con indicador académico',datos.resumen.alumnos_atencion]].map(([k,v])=><div key={k} className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{v}</p><p className="text-xs text-slate-300">{k}</p></div>)}</div>
        <div className="rounded-xl border border-slate-500/20 bg-white/[0.025] p-4 text-sm text-slate-200"><b>Asistencia observada:</b> {datos.resumen.asistencia_detalle.publicable ? pct(datos.resumen.asistencia) : datos.resumen.asistencia_detalle.registros === 0 ? `Aún no hay registros de asistencia; el porcentaje se publicará al contar con ${datos.criterios.min_sesiones_porcentaje} sesiones.` : `${datos.resumen.asistencia_detalle.texto}; todavía no se publica porcentaje porque hay menos de ${datos.criterios.min_sesiones_porcentaje} sesiones.`}<span className="mt-1 block text-xs text-slate-400">No existe una meta institucional configurada para calificar este resultado.</span></div>
      </>}
      <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Comparación de grupos</h2><p className="text-xs text-slate-300">Una fila por grupo para identificar diferencias de configuración y seguimiento.</p></header><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">Grupo</th><th>Alumnos</th><th>Materias</th><th>Sesiones</th><th>Cobertura</th><th>Asistencia</th><th>Alumnos con indicador</th><th>Estado</th></tr></thead><tbody className="divide-y divide-white/5">{datos.grupos.map((g)=><tr key={g.id}><td className="px-5 py-3"><b className="text-white">{g.nombre}</b><small className="block max-w-xs text-slate-400">{g.carrera}</small></td><td>{g.alumnos}</td><td>{g.materias}</td><td>{g.sesiones}/{g.sesiones_programadas}</td><td>{pct(g.cobertura)}</td><td>{g.asistencia_detalle.publicable ? pct(g.asistencia) : 'Muestra insuficiente'}</td><td>{g.alumnos_atencion}</td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${g.materias === 0 ? 'bg-amber-500/15 text-amber-300' : g.sesiones === 0 ? 'bg-blue-500/15 text-blue-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{g.materias === 0 ? 'Sin carga académica' : g.sesiones === 0 ? 'Sin sesiones registradas' : 'Con información'}</span></td></tr>)}</tbody></table></div></section>
      {datos.materias.length > 0 && <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Detalle de materias</h2><p className="text-xs text-slate-300">Información académica registrada por grupo y docente.</p></header><div className="grid gap-4 p-4 lg:grid-cols-2">{datos.grupos.filter((g) => datos.materias.some((m) => m.grupo_id === g.id)).map((g)=><article key={g.id} className="overflow-hidden rounded-xl border border-white/10"><header className="border-b border-white/10 px-4 py-3"><h3 className="font-semibold text-white">{g.nombre}</h3><p className="text-xs text-slate-400">{g.carrera}</p></header><div className="divide-y divide-white/5">{datos.materias.filter((m)=>m.grupo_id===g.id).map((m)=><div key={`${m.materia}-${m.docente}`} className="px-4 py-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium text-white">{m.materia}</p><p className="text-xs text-slate-400">{m.docente} · {m.sesiones}/{m.sesiones_programadas} sesiones</p></div><span className="text-sm font-semibold text-emerald-300">{pct(m.cobertura)} cobertura</span></div><p className="mt-2 text-xs text-slate-300">Asistencia: {m.asistencia_detalle.publicable ? pct(m.asistencia) : `${m.asistencia_detalle.texto} · muestra insuficiente`}{m.avance_sesion != null ? ` · Cumplimiento de la sesión: ${m.avance_sesion}%` : ''}</p>{m.ultimo_tema && <p className="mt-2 text-xs text-slate-300"><b>Tema reciente:</b> {m.ultimo_tema}</p>}{m.pendiente && <p className="mt-1 text-xs text-amber-300"><b>Pendiente:</b> {m.pendiente}</p>}</div>)}</div></article>)}</div></section>}
      <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Alumnos con indicador académico</h2><p className="text-xs text-slate-300">La clasificación considera registros de asistencia y seguimientos abiertos.</p></header><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">Alumno</th><th>Grupo</th><th>Asistencias / registros</th><th>Faltas</th><th>Seguimientos</th><th>Clasificación</th></tr></thead><tbody className="divide-y divide-white/5">{datos.alumnos_atencion.map((a)=><tr key={a.alumno_id}><td className="px-5 py-3"><b className="text-white">{a.nombre}</b><small className="block text-slate-400">{a.matricula}</small></td><td>{datos.grupos.find((g)=>g.id===a.grupo_id)?.nombre}</td><td>{a.asistencias_registradas}/{a.registros}{a.asistencia != null ? ` · ${pct(a.asistencia)}` : ''}</td><td>{a.faltas}</td><td>{a.seguimientos_abiertos}</td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${a.nivel==='PRIORITARIO'?'bg-red-500/15 text-red-300':a.nivel==='DATOS INSUFICIENTES'?'bg-slate-500/15 text-slate-300':'bg-amber-500/15 text-amber-300'}`}>{a.nivel}</span></td></tr>)}</tbody></table>{!datos.alumnos_atencion.length&&<p className="p-6 text-center text-sm text-slate-300">{datos.resumen.sesiones === 0 ? 'Aún no hay sesiones registradas para evaluar indicadores académicos.' : 'No hay alumnos con indicador académico en la selección.'}</p>}</div><div className="border-t border-white/10 bg-white/[0.02] px-5 py-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Criterios de clasificación</p><div className="grid gap-2 text-xs text-slate-300 md:grid-cols-3"><p><b className="text-slate-200">Datos insuficientes:</b> menos de 3 registros sin seguimiento.</p><p><b className="text-amber-300">Atención:</b> seguimiento abierto o asistencia menor a 85% con 3 sesiones.</p><p><b className="text-red-300">Prioritario:</b> dos seguimientos abiertos o asistencia menor a 80% con 5 sesiones.</p></div></div></section>
      {datos.sesiones_especiales.length > 0 && <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Sesiones con registro extemporáneo o corregido</h2><p className="text-xs text-slate-400">Eventos que requieren contexto adicional para interpretar el reporte.</p></header><div className="divide-y divide-white/5">{datos.sesiones_especiales.map((s,i)=><div key={`${s.fecha}-${s.materia}-${i}`} className="px-5 py-3 text-sm"><b className="text-white">{s.materia}</b><span className="ml-2 text-xs text-slate-500">{s.fecha} · {datos.grupos.find((g)=>g.id===s.grupo_id)?.nombre} · {s.docente}</span><p className="mt-1 text-xs text-slate-300">{s.extemporanea ? `Registro extemporáneo${s.motivo_extemporaneo ? `: ${s.motivo_extemporaneo}` : ''}` : ''}{s.extemporanea && s.correcciones ? ' · ' : ''}{s.correcciones ? `${s.correcciones} movimiento(s) de corrección` : ''}</p></div>)}</div></section>}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Observaciones académicas de las sesiones</h2><p className="text-xs text-slate-400">Temas, actividades y pendientes registrados por cada docente.</p></header><div className="max-h-[420px] divide-y divide-white/5 overflow-y-auto">{datos.observaciones_academicas.map((o, i)=><article key={`${o.grupo_id}-${o.fecha}-${o.materia}-${i}`} className="px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-white">{o.materia}</b><span className="text-xs text-slate-500">{o.fecha} · {datos.grupos.find((g)=>g.id===o.grupo_id)?.nombre}</span></div><p className="text-xs text-slate-400">{o.docente}</p>{o.tema&&<p className="mt-2 text-sm text-slate-200"><b>Tema:</b> {o.tema}</p>}{o.actividades&&<p className="mt-1 text-xs text-slate-300"><b>Actividades:</b> {o.actividades}</p>}{o.pendiente&&<p className="mt-1 text-xs text-amber-300"><b>Pendiente:</b> {o.pendiente}</p>}</article>)}{!datos.observaciones_academicas.length&&<p className="p-6 text-center text-sm text-slate-400">No hay observaciones académicas en el periodo indicado.</p>}</div></section>
        <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Incidencias generales</h2><p className="text-xs text-slate-400">Situaciones registradas para el grupo completo.</p></header><div className="max-h-[420px] divide-y divide-white/5 overflow-y-auto">{datos.incidencias.map((i, index)=><article key={`${i.grupo_id}-${i.fecha}-${index}`} className="px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-amber-300">{i.tipo}</b><span className="text-xs text-slate-500">{i.fecha} · {datos.grupos.find((g)=>g.id===i.grupo_id)?.nombre}</span></div><p className="mt-1 text-xs text-slate-400">{i.materia} · {i.docente}</p><p className="mt-2 text-sm text-slate-200">{i.descripcion}</p>{i.requiere_seguimiento&&<span className="mt-2 inline-flex rounded-full bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-blue-300">Canalizada a seguimiento</span>}</article>)}{!datos.incidencias.length&&<p className="p-6 text-center text-sm text-slate-400">No hay incidencias generales en la selección.</p>}</div></section>
      </div>
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4 text-sm text-blue-200"><b>Privacidad:</b> {datos.privacidad}</div>
    </>}
  </div></AdminLayout>;
}
