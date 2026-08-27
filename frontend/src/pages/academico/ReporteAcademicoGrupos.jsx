import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const pct = (valor) => valor == null ? '—' : `${valor}%`;

export default function ReporteAcademicoGrupos() {
  const [catalogos, setCatalogos] = useState({ periodos: [], grupos: [] });
  const [periodoId, setPeriodoId] = useState('');
  const [seleccion, setSeleccion] = useState([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState('');

  useEffect(() => {
    api.get('/reportes-academicos/catalogos').then(({ data }) => {
      setCatalogos(data);
      const actual = data.periodos.find((p) => p.es_actual) || data.periodos[0];
      if (actual) setPeriodoId(String(actual.id));
    }).catch((err) => setError(err.response?.data?.detail || 'No se pudieron cargar los grupos.'));
  }, []);

  const grupos = useMemo(() => catalogos.grupos.filter((g) => String(g.periodo_id) === periodoId), [catalogos.grupos, periodoId]);
  const params = () => ({ periodo_id: periodoId, grupos: seleccion.join(','), ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) });

  const cambiarPeriodo = (valor) => { setPeriodoId(valor); setSeleccion([]); setDatos(null); };
  const alternar = (id) => setSeleccion((actual) => actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]);
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
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-300">Periodo escolar<select value={periodoId} onChange={(e) => cambiarPeriodo(e.target.value)} className="input-dark mt-1">{catalogos.periodos.map((p) => <option key={p.id} value={p.id}>{p.clave}{p.es_actual ? ' · Actual' : ''}</option>)}</select></label>
        <label className="text-sm text-slate-300">Desde <span className="text-slate-500">(opcional)</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input-dark mt-1" /></label>
        <label className="text-sm text-slate-300">Hasta <span className="text-slate-500">(opcional)</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input-dark mt-1" /></label>
      </div>
      <div><div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-300">Grupos</p><button type="button" onClick={() => setSeleccion(seleccion.length === grupos.length ? [] : grupos.map((g) => g.id))} className="text-xs font-semibold text-emerald-400">{seleccion.length === grupos.length && grupos.length ? 'Quitar todos' : 'Seleccionar todos'}</button></div>
        <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-white/10 p-3 sm:grid-cols-2 lg:grid-cols-3">{grupos.map((g) => <label key={g.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${seleccion.includes(g.id) ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/5 bg-white/[0.025]'}`}><input type="checkbox" checked={seleccion.includes(g.id)} onChange={() => alternar(g.id)} className="mt-1 accent-emerald-500"/><span><b className="block text-sm text-white">{g.nombre}{g.turno ? ` · ${g.turno}` : ''}</b><span className="text-xs text-slate-400">{g.carrera}</span></span></label>)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3"><button onClick={consultar} disabled={cargando || !seleccion.length} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{cargando ? 'Generando…' : `Generar reporte (${seleccion.length})`}</button>{datos && <><button onClick={() => exportar('pdf')} disabled={Boolean(exportando)} className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300">{exportando === 'pdf' ? 'Preparando…' : 'Exportar PDF'}</button><button onClick={() => exportar('xlsx')} disabled={Boolean(exportando)} className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-300">{exportando === 'xlsx' ? 'Preparando…' : 'Exportar Excel'}</button></>}</div>
    </section>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {datos && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">{[['Grupos',datos.resumen.grupos],['Alumnos',datos.resumen.alumnos],['Materias',datos.resumen.materias],['Sesiones',datos.resumen.sesiones],['Asistencia',pct(datos.resumen.asistencia)],['Incidencias',datos.resumen.incidencias],['En atención',datos.resumen.alumnos_atencion]].map(([k,v])=><div key={k} className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{v}</p><p className="text-xs text-slate-400">{k}</p></div>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">{datos.grupos.map((g)=><article key={g.id} className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">{g.nombre}</h2><p className="text-xs text-slate-400">{g.carrera} · {g.alumnos} alumnos</p></header><div className="grid grid-cols-4 gap-2 p-4 text-center text-xs"><div><b className="block text-lg text-white">{g.materias}</b><span className="text-slate-500">Materias</span></div><div><b className="block text-lg text-white">{g.sesiones}</b><span className="text-slate-500">Sesiones</span></div><div><b className="block text-lg text-emerald-300">{pct(g.asistencia)}</b><span className="text-slate-500">Asistencia</span></div><div><b className="block text-lg text-amber-300">{g.alumnos_atencion}</b><span className="text-slate-500">Atención</span></div></div><div className="divide-y divide-white/5 border-t border-white/10">{datos.materias.filter((m)=>m.grupo_id===g.id).map((m)=><div key={`${m.materia}-${m.docente}`} className="px-5 py-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium text-white">{m.materia}</p><p className="text-xs text-slate-500">{m.docente} · {m.sesiones} sesiones</p></div><span className="text-sm font-semibold text-emerald-300">{pct(m.asistencia)}</span></div>{m.ultimo_tema && <p className="mt-2 text-xs text-slate-300"><b>Tema reciente:</b> {m.ultimo_tema}</p>}{m.pendiente && <p className="mt-1 text-xs text-amber-300"><b>Pendiente:</b> {m.pendiente}</p>}</div>)}</div></article>)}</div>
      <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Alumnos que requieren atención</h2><p className="text-xs text-slate-400">Se muestran indicadores académicos; abre el expediente individual para consultar información autorizada.</p></header><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Alumno</th><th>Grupo</th><th>Asistencia</th><th>Faltas</th><th>Seguimientos</th><th>Nivel</th></tr></thead><tbody className="divide-y divide-white/5">{datos.alumnos_atencion.map((a)=><tr key={a.alumno_id}><td className="px-5 py-3"><b className="text-white">{a.nombre}</b><small className="block text-slate-500">{a.matricula}</small></td><td>{datos.grupos.find((g)=>g.id===a.grupo_id)?.nombre}</td><td>{pct(a.asistencia)}</td><td>{a.faltas}</td><td>{a.seguimientos_abiertos}</td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${a.nivel==='PRIORITARIO'?'bg-red-500/15 text-red-300':'bg-amber-500/15 text-amber-300'}`}>{a.nivel}</span></td></tr>)}</tbody></table>{!datos.alumnos_atencion.length&&<p className="p-6 text-center text-sm text-slate-400">No hay alumnos con faltas o seguimientos abiertos en la selección.</p>}</div></section>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Observaciones académicas de las sesiones</h2><p className="text-xs text-slate-400">Temas, actividades y pendientes registrados por cada docente.</p></header><div className="max-h-[420px] divide-y divide-white/5 overflow-y-auto">{datos.observaciones_academicas.map((o, i)=><article key={`${o.grupo_id}-${o.fecha}-${o.materia}-${i}`} className="px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-white">{o.materia}</b><span className="text-xs text-slate-500">{o.fecha} · {datos.grupos.find((g)=>g.id===o.grupo_id)?.nombre}</span></div><p className="text-xs text-slate-400">{o.docente}</p>{o.tema&&<p className="mt-2 text-sm text-slate-200"><b>Tema:</b> {o.tema}</p>}{o.actividades&&<p className="mt-1 text-xs text-slate-300"><b>Actividades:</b> {o.actividades}</p>}{o.pendiente&&<p className="mt-1 text-xs text-amber-300"><b>Pendiente:</b> {o.pendiente}</p>}</article>)}{!datos.observaciones_academicas.length&&<p className="p-6 text-center text-sm text-slate-400">No hay observaciones académicas en el periodo indicado.</p>}</div></section>
        <section className="glass overflow-hidden rounded-2xl"><header className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">Incidencias generales</h2><p className="text-xs text-slate-400">Situaciones registradas para el grupo completo.</p></header><div className="max-h-[420px] divide-y divide-white/5 overflow-y-auto">{datos.incidencias.map((i, index)=><article key={`${i.grupo_id}-${i.fecha}-${index}`} className="px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-amber-300">{i.tipo}</b><span className="text-xs text-slate-500">{i.fecha} · {datos.grupos.find((g)=>g.id===i.grupo_id)?.nombre}</span></div><p className="mt-1 text-xs text-slate-400">{i.materia} · {i.docente}</p><p className="mt-2 text-sm text-slate-200">{i.descripcion}</p>{i.requiere_seguimiento&&<span className="mt-2 inline-flex rounded-full bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-blue-300">Canalizada a seguimiento</span>}</article>)}{!datos.incidencias.length&&<p className="p-6 text-center text-sm text-slate-400">No hay incidencias generales en la selección.</p>}</div></section>
      </div>
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4 text-sm text-blue-200"><b>Privacidad:</b> {datos.privacidad}</div>
    </>}
  </div></AdminLayout>;
}
