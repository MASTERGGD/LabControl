import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const POR_PAGINA = 20;
const ESTADOS = {
  CERRADA: { texto: 'Impartida', clase: 'bg-emerald-500/15 text-emerald-400' },
  ABIERTA: { texto: 'En captura', clase: 'bg-blue-500/15 text-blue-400' },
  CORRECCION: { texto: 'En corrección', clase: 'bg-amber-500/15 text-amber-400' },
  NO_IMPARTIDA: { texto: 'No impartida', clase: 'bg-red-500/15 text-red-400' },
};
const fechaLarga = (fecha) => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
});
const fechaHora = (fecha) => fecha ? new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City',
}).format(new Date(`${fecha}Z`)) : 'Registro anterior';
const asistenciaClase = (clase) => {
  const r = clase.resumen || {};
  const asistieron = (r.presente || 0) + (r.retardo || 0) + (r.justificada || 0);
  return r.total ? Math.round((asistieron / r.total) * 100) : null;
};

function Kpi({ valor, etiqueta, detalle, tono = 'text-white' }) {
  return <article className="glass rounded-2xl p-4"><p className={`text-2xl font-bold ${tono}`}>{valor}</p><p className="mt-1 text-sm font-semibold text-slate-300">{etiqueta}</p><p className="mt-1 text-xs text-slate-500">{detalle}</p></article>;
}

function Paginacion({ pagina, total, porPagina, onChange }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">Mostrando {(pagina - 1) * porPagina + 1}–{Math.min(pagina * porPagina, total)} de {total}</p>
      <div className="flex items-center gap-2">
        <button disabled={pagina === 1} onClick={() => onChange(pagina - 1)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-40">Anterior</button>
        <span className="px-2 text-xs font-semibold text-slate-400">Página {pagina} de {paginas}</span>
        <button disabled={pagina === paginas} onClick={() => onChange(pagina + 1)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-40">Siguiente</button>
      </div>
    </div>
  );
}

function FilaClase({ clase, abierta, onToggle, onDetalle }) {
  const est = ESTADOS[clase.estado] || { texto: clase.estado, clase: 'bg-slate-500/15 text-slate-400' };
  const r = clase.resumen || {};
  const porcentaje = asistenciaClase(clase);
  const tieneIncidencia = Boolean(clase.bitacora?.incidencias || clase.observacion_general);
  const correcciones = clase.correcciones_asistencia || [];
  const exportarPdf = async () => {
    const { data, headers } = await api.get(`/docencia/clases/${clase.id}/exportar.pdf`, { responseType: 'blob' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(data);
    enlace.download = headers['content-disposition']?.match(/filename="?([^";]+)"?/i)?.[1] || `lista_${clase.fecha}.pdf`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };
  return (
    <article className={`border-b border-white/10 transition last:border-b-0 ${abierta ? 'bg-white/[0.035]' : 'hover:bg-white/[0.025]'}`}>
      <button type="button" onClick={onToggle} aria-expanded={abierta} className="grid w-full gap-3 px-4 py-3 text-left md:grid-cols-[130px_minmax(210px,1.25fr)_minmax(180px,1fr)_120px_125px_28px] md:items-center">
        <div><p className="text-sm font-semibold text-white">{fechaLarga(clase.fecha)}</p><p className="mt-0.5 font-mono text-[11px] text-slate-500">{clase.carga.hora_inicio}–{clase.carga.hora_fin}</p></div>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{clase.carga.actividad_nombre}</p><p className="truncate text-xs text-slate-500">{clase.carga.grupo || 'Sin grupo'} · {clase.carga.espacio_nombre || 'Sin espacio'}</p></div>
        <p className="truncate text-sm text-slate-300"><span className="md:hidden text-slate-500">Tema: </span>{clase.bitacora?.tema_impartido || 'Sin tema registrado'}</p>
        <div><b className={`text-sm ${porcentaje != null && porcentaje < 80 ? 'text-amber-400' : 'text-emerald-400'}`}>{porcentaje == null ? '—' : `${porcentaje}%`}</b><p className="text-[10px] text-slate-500">{r.total || 0} alumnos</p></div>
        <div className="flex flex-wrap gap-1"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${est.clase}`}>{est.texto}</span>{tieneIncidencia && <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-400">Incidencia</span>}{!!correcciones.length && <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[10px] font-bold text-blue-400">{correcciones.length} corrección{correcciones.length === 1 ? '' : 'es'}</span>}</div>
        <svg className={`h-4 w-4 text-slate-500 transition ${abierta ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6"/></svg>
      </button>
      {abierta && (
        <div className="border-t border-white/10 px-4 py-4 md:pl-[162px]">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px_auto] lg:items-center">
            <div className="space-y-1 text-sm"><p className="text-slate-300"><span className="text-slate-500">Periodo:</span> {clase.carga.periodo || '—'}{clase.es_extemporanea ? ' · Captura extemporánea' : ''}</p><p className="text-slate-300"><span className="text-slate-500">Avance:</span> {clase.bitacora?.avance_planeacion != null ? `${clase.bitacora.avance_planeacion}%` : 'Sin registrar'}</p>{tieneIncidencia && <p className="text-amber-300"><span className="font-semibold">Observaciones:</span> {clase.bitacora?.incidencias || clase.observacion_general}</p>}</div>
            {clase.estado === 'NO_IMPARTIDA'
              ? <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3 text-sm text-red-200"><b>Motivo:</b> {clase.motivo_no_impartida}</div>
              : <div className="grid grid-cols-4 gap-2 text-center">{[['Presentes', r.presente || 0, 'text-emerald-400'], ['Faltas', r.falta || 0, 'text-red-400'], ['Retardos', r.retardo || 0, 'text-amber-400'], ['Justif.', r.justificada || 0, 'text-cyan-400']].map(([label, value, tone]) => <div key={label} className="rounded-xl bg-white/[0.04] px-2 py-2"><b className={`block ${tone}`}>{value}</b><span className="text-[9px] text-slate-500">{label}</span></div>)}</div>}
            {clase.estado !== 'NO_IMPARTIDA' && <div className="flex flex-col gap-2"><button onClick={onDetalle} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">Ver registro completo</button><button onClick={exportarPdf} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300">Descargar lista PDF</button></div>}
          </div>
          {!!correcciones.length && (
            <div className="mt-4 overflow-hidden rounded-xl border border-blue-500/20 bg-blue-500/[0.04]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-500/15 px-4 py-3">
                <div><p className="text-sm font-semibold text-blue-300">Historial de correcciones</p><p className="text-[11px] text-slate-500">Bitácora independiente de las observaciones académicas de la clase.</p></div>
                <span className="text-xs text-slate-400">Última modificación: {fechaHora(correcciones[0]?.creado_en)}</span>
              </div>
              <div className="divide-y divide-white/10">
                {correcciones.map((correccion) => (
                  <div key={correccion.id} className="grid gap-1 px-4 py-3 text-xs sm:grid-cols-[145px_minmax(160px,1fr)_150px_minmax(180px,1.2fr)] sm:gap-3">
                    <span className="text-slate-500">{fechaHora(correccion.creado_en)}</span>
                    <span className="font-medium text-slate-300">{correccion.alumno || (correccion.tipo === 'APERTURA' ? 'Apertura de corrección' : 'Cambio general')}</span>
                    <span className="text-slate-400">{correccion.estado_anterior && correccion.estado_nuevo ? `${correccion.estado_anterior} → ${correccion.estado_nuevo}` : correccion.tipo}</span>
                    <span className="text-slate-400"><span className="text-slate-500">Motivo:</span> {correccion.motivo}{correccion.docente ? ` · ${correccion.docente}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function HistorialClasesDocente() {
  const navigate = useNavigate();
  const [clases, setClases] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [periodo, setPeriodo] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [filtroEspecial, setFiltroEspecial] = useState('TODAS');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [vista, setVista] = useState('CRONOLOGICA');
  const [pagina, setPagina] = useState(1);
  const [abiertaId, setAbiertaId] = useState(null);
  const [grupoAbierto, setGrupoAbierto] = useState(null);

  useEffect(() => {
    api.get('/docencia/historial').then(({ data }) => setClases(data)).catch((err) => setError(err.response?.data?.detail || 'No se pudo cargar el historial de clases.')).finally(() => setCargando(false));
  }, []);
  useEffect(() => { setPagina(1); setAbiertaId(null); }, [busqueda, periodo, estado, filtroEspecial, desde, hasta, vista]);

  const periodos = useMemo(() => [...new Set(clases.map((c) => c.carga.periodo).filter(Boolean))], [clases]);
  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es');
    return clases.filter((clase) => {
      const coincide = !texto || `${clase.carga.actividad_nombre} ${clase.carga.grupo || ''} ${clase.carga.carrera || ''}`.toLocaleLowerCase('es').includes(texto);
      const especial = filtroEspecial === 'TODAS'
        || (filtroEspecial === 'INCIDENCIAS' && (clase.bitacora?.incidencias || clase.observacion_general))
        || (filtroEspecial === 'EXTEMPORANEAS' && clase.es_extemporanea)
        || (filtroEspecial === 'SIN_TEMA' && !clase.bitacora?.tema_impartido);
      return coincide && especial && (periodo === 'TODOS' || clase.carga.periodo === periodo) && (estado === 'TODOS' || clase.estado === estado) && (!desde || clase.fecha >= desde) && (!hasta || clase.fecha <= hasta);
    });
  }, [clases, busqueda, periodo, estado, filtroEspecial, desde, hasta]);

  const resumen = useMemo(() => {
    const impartidas = filtradas.filter((c) => c.estado === 'CERRADA').length;
    const noImpartidas = filtradas.filter((c) => c.estado === 'NO_IMPARTIDA').length;
    const alumnos = filtradas.reduce((t, c) => t + (c.resumen?.total || 0), 0);
    const presentes = filtradas.reduce((t, c) => t + (c.resumen?.presente || 0) + (c.resumen?.retardo || 0) + (c.resumen?.justificada || 0), 0);
    return { impartidas, noImpartidas, pendientes: filtradas.length - impartidas - noImpartidas, asistencia: alumnos ? Math.round((presentes / alumnos) * 100) : null };
  }, [filtradas]);
  const grupos = useMemo(() => Object.values(filtradas.reduce((acc, clase) => {
    const key = `${clase.carga.id}`;
    if (!acc[key]) acc[key] = { key, nombre: clase.carga.actividad_nombre, grupo: clase.carga.grupo, periodo: clase.carga.periodo, clases: [] };
    acc[key].clases.push(clase); return acc;
  }, {})), [filtradas]);
  const fuente = vista === 'CRONOLOGICA' ? filtradas : grupos;
  const visibles = fuente.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <AdminLayout><main className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Actividad académica</p><h1 className="mt-1 text-2xl font-bold text-white">Historial de clases</h1><p className="mt-1 text-sm text-slate-400">Consulta muchas sesiones rápidamente y despliega solo el detalle que necesites.</p></div><button onClick={() => navigate('/docente/horario')} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Ver mi horario</button></header>
      <section className="grid gap-3 sm:grid-cols-3"><Kpi valor={filtradas.length} etiqueta="Sesiones registradas" detalle="Según los filtros seleccionados"/><Kpi valor={resumen.impartidas} etiqueta="Clases cerradas" detalle={resumen.pendientes ? `${resumen.pendientes} requieren concluir captura` : 'Todas las capturas están concluidas'} tono="text-emerald-400"/><Kpi valor={resumen.asistencia == null ? '—' : `${resumen.asistencia}%`} etiqueta="Asistencia acumulada" detalle="Presentes, retardos y justificadas" tono={resumen.asistencia != null && resumen.asistencia < 80 ? 'text-amber-400' : 'text-cyan-400'}/></section>
      <section className="glass space-y-4 rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_190px_190px]"><label className="text-xs font-semibold text-slate-400">Buscar materia o grupo<input className="input-dark mt-1 w-full" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. Cálculo Integral o 3° A"/></label><label className="text-xs font-semibold text-slate-400">Cuatrimestre<select className="input-dark mt-1 w-full" value={periodo} onChange={(e) => setPeriodo(e.target.value)}><option value="TODOS">Todos los periodos</option>{periodos.map((p) => <option key={p}>{p}</option>)}</select></label><label className="text-xs font-semibold text-slate-400">Estado<select className="input-dark mt-1 w-full" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="TODOS">Todos los estados</option><option value="CERRADA">Impartidas</option><option value="ABIERTA">En captura</option><option value="CORRECCION">En corrección</option><option value="NO_IMPARTIDA">No impartidas</option></select></label></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_180px_220px_1fr]"><label className="text-xs font-semibold text-slate-400">Desde<input type="date" className="input-dark themed-date-input mt-1 w-full" value={desde} onChange={(e) => setDesde(e.target.value)}/></label><label className="text-xs font-semibold text-slate-400">Hasta<input type="date" className="input-dark themed-date-input mt-1 w-full" value={hasta} onChange={(e) => setHasta(e.target.value)}/></label><label className="text-xs font-semibold text-slate-400">Mostrar<select className="input-dark mt-1 w-full" value={filtroEspecial} onChange={(e) => setFiltroEspecial(e.target.value)}><option value="TODAS">Todas las clases</option><option value="INCIDENCIAS">Con incidencias</option><option value="EXTEMPORANEAS">Extemporáneas</option><option value="SIN_TEMA">Sin tema registrado</option></select></label><div className="flex items-end justify-start gap-1 lg:justify-end"><button onClick={() => setVista('CRONOLOGICA')} className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${vista === 'CRONOLOGICA' ? 'bg-emerald-600 text-white' : 'bg-white/5 text-slate-400'}`}>Cronológica</button><button onClick={() => setVista('MATERIA')} className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${vista === 'MATERIA' ? 'bg-emerald-600 text-white' : 'bg-white/5 text-slate-400'}`}>Por materia y grupo</button></div></div>
      </section>
      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">{error}</p>}
      {cargando ? <div className="glass rounded-2xl p-12 text-center text-sm text-slate-400">Cargando historial…</div> : !fuente.length ? <div className="glass rounded-2xl p-12 text-center"><p className="font-semibold text-white">No hay clases con estos filtros</p><p className="mt-1 text-sm text-slate-500">Ajusta los filtros o consulta otro cuatrimestre.</p></div> : vista === 'CRONOLOGICA' ? <section className="glass overflow-hidden rounded-2xl"><div className="hidden grid-cols-[130px_minmax(210px,1.25fr)_minmax(180px,1fr)_120px_125px_28px] gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 md:grid"><span>Fecha</span><span>Materia y grupo</span><span>Tema</span><span>Asistencia</span><span>Estado</span><span/></div>{visibles.map((clase) => <FilaClase key={clase.id} clase={clase} abierta={abiertaId === clase.id} onToggle={() => setAbiertaId(abiertaId === clase.id ? null : clase.id)} onDetalle={() => navigate(`/docente/clase/${clase.id}`)}/>)}</section> : <section className="space-y-3">{visibles.map((grupo) => {
        const cerradas = grupo.clases.filter((c) => c.estado === 'CERRADA').length; const promedio = grupo.clases.map(asistenciaClase).filter((v) => v != null); const asistencia = promedio.length ? Math.round(promedio.reduce((a, b) => a + b, 0) / promedio.length) : null; const abierto = grupoAbierto === grupo.key;
        return <article key={grupo.key} className="glass overflow-hidden rounded-2xl"><button onClick={() => setGrupoAbierto(abierto ? null : grupo.key)} className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-white">{grupo.nombre}</h2><p className="mt-1 text-xs text-slate-500">{grupo.grupo || 'Sin grupo'} · {grupo.periodo}</p></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg bg-white/5 px-3 py-2 text-slate-300">{grupo.clases.length} sesiones</span><span className="rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-400">{cerradas} cerradas</span><span className="rounded-lg bg-cyan-500/10 px-3 py-2 text-cyan-400">{asistencia == null ? '—' : `${asistencia}%`} asistencia</span><svg className={`h-4 w-4 text-slate-500 transition ${abierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6"/></svg></div></button>{abierto && <div className="border-t border-white/10">{grupo.clases.map((clase) => <FilaClase key={clase.id} clase={clase} abierta={abiertaId === clase.id} onToggle={() => setAbiertaId(abiertaId === clase.id ? null : clase.id)} onDetalle={() => navigate(`/docente/clase/${clase.id}`)}/>)}</div>}</article>;
      })}</section>}
      <Paginacion pagina={pagina} total={fuente.length} porPagina={POR_PAGINA} onChange={(p) => { setPagina(p); setAbiertaId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}/>
    </main></AdminLayout>
  );
}
