import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const POR_PAGINA = 20;
const ESTADOS = {
  CERRADA: { texto: 'Impartida', clase: 'bg-emerald-500/15 text-emerald-400' },
  ABIERTA: { texto: 'En captura', clase: 'bg-blue-500/15 text-blue-400' },
  CORRECCION: { texto: 'En corrección', clase: 'bg-amber-500/15 text-amber-400' },
  NO_IMPARTIDA: { texto: 'No impartida', clase: 'bg-amber-500/15 text-amber-300' },
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
const identidadAcademica = (valor) => String(valor || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('es-MX');
const textoCantidad = (cantidad, singular, plural) => `${cantidad} ${cantidad === 1 ? singular : plural}`;

function Kpi({ valor, etiqueta, detalle, tono = 'text-white', onClick }) {
  const Tag = onClick ? 'button' : 'article';
  return <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`glass rounded-2xl p-4 text-left ${onClick ? 'hover:bg-white/[0.05]' : ''}`}><p className={`text-2xl font-bold ${tono}`}>{valor}</p><p className="mt-1 text-sm font-semibold text-slate-300">{etiqueta}</p><p className="mt-1 text-xs text-slate-500">{detalle}</p></Tag>;
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
  const requiereRevision = Boolean(clase.requiere_revision_clasificacion);
  const grupoIncompleto = !clase.carga.grupo;
  const correcciones = clase.correcciones_asistencia || [];
  const actividades = clase.bitacora?.actividades_realizadas?.trim();
  const trabajoAsignado = clase.bitacora?.tarea_asignada?.trim();
  const temaPendiente = clase.bitacora?.tema_pendiente?.trim();
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
      <button type="button" onClick={onToggle} aria-expanded={abierta} className="grid w-full gap-3 px-4 py-3 text-left md:grid-cols-[140px_minmax(190px,0.9fr)_minmax(260px,1.35fr)_110px_180px_28px] md:items-center">
        <div><p className="text-sm font-semibold text-white">{fechaLarga(clase.fecha)}</p><p className="mt-0.5 font-mono text-[11px] text-slate-500">{clase.carga.hora_inicio}–{clase.carga.hora_fin}</p></div>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{clase.carga.actividad_nombre}</p><p className="truncate text-xs text-slate-500">{clase.carga.grupo || 'Sin grupo'} · {clase.carga.espacio_nombre || 'Sin espacio'}</p></div>
        <p className="truncate text-sm text-slate-300"><span className="md:hidden text-slate-500">Tema: </span>{clase.bitacora?.tema_impartido || 'Sin tema registrado'}</p>
        <div><b className={`text-sm ${porcentaje != null && porcentaje < 80 ? 'text-amber-400' : 'text-emerald-400'}`}>{porcentaje == null ? '—' : `${porcentaje}%`}</b><p className="text-[10px] text-slate-500">{r.total || 0} alumnos</p></div>
        <div className="flex flex-wrap gap-1"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${requiereRevision ? 'bg-amber-500/15 text-amber-300' : est.clase}`}>{requiereRevision ? 'Revisar clasificación' : est.texto}</span>{grupoIncompleto && <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-300">Sin grupo asignado</span>}{tieneIncidencia && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-300">Nota</span>}{!!correcciones.length && <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[10px] font-bold text-blue-400">{correcciones.length} corrección{correcciones.length === 1 ? '' : 'es'}</span>}</div>
        <svg className={`h-4 w-4 text-slate-500 transition ${abierta ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6"/></svg>
      </button>
      {abierta && (
        <div className="border-t border-white/10 px-4 py-4 md:pl-[162px]">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px_auto] lg:items-start">
            <div className="space-y-2 text-sm"><div className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Registro de la sesión</p><p className="mt-1 font-medium text-slate-200">{clase.bitacora?.tema_impartido || 'Sin tema registrado'}</p></div><p className="text-slate-300"><span className="text-slate-500">Periodo:</span> {clase.carga.periodo || '—'}</p><p className="text-slate-300"><span className="text-slate-500">Cumplimiento de lo planeado para la sesión:</span> {clase.bitacora?.avance_planeacion != null ? `${clase.bitacora.avance_planeacion}%` : 'Sin registrar'}</p>{clase.es_extemporanea && <p className="rounded-lg bg-blue-500/[0.07] p-2 text-blue-200"><span className="font-semibold">Captura extemporánea:</span> {clase.motivo_extemporaneo || 'Sin motivo registrado'}</p>}{requiereRevision && <p className="rounded-lg bg-amber-500/10 p-2 text-amber-200">El tema indica que la clase posiblemente no se impartió. Abre el registro y confirma su clasificación.</p>}{tieneIncidencia && <p className="text-amber-300"><span className="font-semibold">Nota:</span> {clase.bitacora?.incidencias || clase.observacion_general}</p>}</div>
            {clase.estado === 'NO_IMPARTIDA'
              ? <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3 text-sm text-red-200"><b>Motivo:</b> {clase.motivo_no_impartida}</div>
              : <div className="grid grid-cols-4 gap-2 text-center">{[['Presentes', r.presente || 0, 'text-emerald-400'], ['Faltas', r.falta || 0, 'text-red-400'], ['Retardos', r.retardo || 0, 'text-amber-400'], ['Justif.', r.justificada || 0, 'text-cyan-400']].map(([label, value, tone]) => <div key={label} className="rounded-xl bg-white/[0.04] px-2 py-2"><b className={`block ${tone}`}>{value}</b><span className="text-[9px] text-slate-500">{label}</span></div>)}</div>}
            {clase.estado !== 'NO_IMPARTIDA' && <div className="flex flex-col gap-2"><button onClick={onDetalle} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">Ver registro completo</button><button onClick={exportarPdf} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300">Descargar lista PDF</button></div>}
          </div>
          {clase.estado !== 'NO_IMPARTIDA' && (actividades || trabajoAsignado || temaPendiente) && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {actividades && <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Actividades realizadas</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{actividades}</p></div>}
              {trabajoAsignado && <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Trabajo asignado al grupo</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{trabajoAsignado}</p></div>}
              {temaPendiente && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Tema para retomar</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{temaPendiente}</p></div>}
            </div>
          )}
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
  const [searchParams] = useSearchParams();
  const [clases, setClases] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState(() => searchParams.get('buscar') || '');
  const [periodo, setPeriodo] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [filtroEspecial, setFiltroEspecial] = useState('TODAS');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [vista, setVista] = useState(() => searchParams.get('vista') === 'MATERIA' ? 'MATERIA' : 'CRONOLOGICA');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [abiertaId, setAbiertaId] = useState(null);
  const [grupoAbierto, setGrupoAbierto] = useState(null);

  useEffect(() => {
    api.get('/docencia/historial').then(({ data }) => setClases(data)).catch((err) => setError(err.response?.data?.detail || 'No se pudo cargar el historial de clases.')).finally(() => setCargando(false));
  }, []);
  useEffect(() => { setPagina(1); setAbiertaId(null); setGrupoAbierto(null); }, [busqueda, periodo, estado, filtroEspecial, desde, hasta, vista]);

  const periodos = useMemo(() => [...new Set(clases.map((c) => c.carga.periodo).filter(Boolean))], [clases]);
  const conteoNoImpartidas = useMemo(() => clases.filter((c) => c.estado === 'NO_IMPARTIDA').length, [clases]);
  const conteoSinTema = useMemo(() => clases.filter((c) => c.estado !== 'NO_IMPARTIDA' && !c.bitacora?.tema_impartido).length, [clases]);
  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es');
    return clases.filter((clase) => {
      const coincide = !texto || `${clase.carga.actividad_nombre} ${clase.carga.grupo || ''} ${clase.carga.carrera || ''} ${clase.bitacora?.tema_impartido || ''} ${clase.bitacora?.actividades_realizadas || ''} ${clase.bitacora?.tarea_asignada || ''} ${clase.bitacora?.tema_pendiente || ''}`.toLocaleLowerCase('es').includes(texto);
      const especial = filtroEspecial === 'TODAS'
        || (filtroEspecial === 'INCIDENCIAS' && (clase.bitacora?.incidencias || clase.observacion_general))
        || (filtroEspecial === 'EXTEMPORANEAS' && clase.es_extemporanea)
        || (filtroEspecial === 'CON_TAREA' && Boolean(clase.bitacora?.tarea_asignada?.trim()))
        || (filtroEspecial === 'CON_PENDIENTE' && Boolean(clase.bitacora?.tema_pendiente?.trim()))
        || (filtroEspecial === 'SIN_TEMA' && !clase.bitacora?.tema_impartido);
      return coincide && especial && (periodo === 'TODOS' || clase.carga.periodo === periodo) && (estado === 'TODOS' || clase.estado === estado) && (!desde || clase.fecha >= desde) && (!hasta || clase.fecha <= hasta);
    });
  }, [clases, busqueda, periodo, estado, filtroEspecial, desde, hasta]);

  const resumen = useMemo(() => {
    const impartidas = filtradas.filter((c) => c.estado === 'CERRADA').length;
    const noImpartidas = filtradas.filter((c) => c.estado === 'NO_IMPARTIDA').length;
    const impartidasConLista = filtradas.filter((c) => c.estado === 'CERRADA');
    const alumnos = impartidasConLista.reduce((t, c) => t + (c.resumen?.total || 0), 0);
    const presentes = impartidasConLista.reduce((t, c) => t + (c.resumen?.presente || 0) + (c.resumen?.retardo || 0) + (c.resumen?.justificada || 0), 0);
    return { impartidas, noImpartidas, concluidas: impartidas + noImpartidas, pendientes: filtradas.length - impartidas - noImpartidas, asistencia: alumnos ? Math.round((presentes / alumnos) * 100) : null };
  }, [filtradas]);
  const grupos = useMemo(() => Object.values(filtradas.reduce((acc, clase) => {
    // Una materia puede tener varias cargas u horarios internos. Para el docente
    // deben formar un solo bloque cuando la identidad académica visible coincide.
    const key = [clase.carga.actividad_nombre, clase.carga.grupo, clase.carga.periodo]
      .map(identidadAcademica)
      .join('::');
    if (!acc[key]) acc[key] = {
      key,
      nombre: clase.carga.actividad_nombre,
      grupo: clase.carga.grupo,
      periodo: clase.carga.periodo,
      clases: [],
    };
    acc[key].clases.push(clase);
    return acc;
  }, {})).map((grupo) => ({
    ...grupo,
    clases: [...grupo.clases].sort((a, b) => `${b.fecha} ${b.carga.hora_inicio || ''}`.localeCompare(`${a.fecha} ${a.carga.hora_inicio || ''}`)),
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX') || (a.grupo || '').localeCompare(b.grupo || '', 'es-MX')), [filtradas]);
  const fuente = vista === 'CRONOLOGICA' ? filtradas : grupos;
  const visibles = fuente.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const filtrosActivos = [periodo !== 'TODOS', estado !== 'TODOS', filtroEspecial !== 'TODAS', Boolean(desde), Boolean(hasta)].filter(Boolean).length;
  const limpiarFiltros = () => {
    setBusqueda(''); setPeriodo('TODOS'); setEstado('TODOS'); setFiltroEspecial('TODAS'); setDesde(''); setHasta('');
  };

  return (
    <AdminLayout><main className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Actividad académica</p><h1 className="mt-1 text-2xl font-bold text-white">Historial de clases</h1><p className="mt-1 text-sm text-slate-400">Consulta muchas sesiones rápidamente y despliega solo el detalle que necesites.</p></div><button onClick={() => navigate('/docente/horario')} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Ver mi horario</button></header>
      <section className="grid gap-3 sm:grid-cols-3"><Kpi valor={filtradas.length} etiqueta="Sesiones registradas" detalle={(busqueda || periodo !== 'TODOS' || estado !== 'TODOS' || filtroEspecial !== 'TODAS' || desde || hasta) ? 'Resultado de los filtros activos' : 'Historial disponible'}/><Kpi valor={`${resumen.concluidas} de ${filtradas.length}`} etiqueta="Capturas concluidas" detalle={resumen.pendientes ? `${resumen.pendientes} pendiente${resumen.pendientes === 1 ? '' : 's'} · ver en captura` : `${resumen.impartidas} ${resumen.impartidas === 1 ? 'impartida' : 'impartidas'} · ${resumen.noImpartidas} ${resumen.noImpartidas === 1 ? 'no impartida' : 'no impartidas'}`} tono={resumen.pendientes ? 'text-amber-400' : 'text-emerald-400'} onClick={resumen.pendientes ? () => setEstado('ABIERTA') : undefined}/><Kpi valor={resumen.asistencia == null ? '—' : `${resumen.asistencia}%`} etiqueta="Asistencia acumulada" detalle="Solo clases impartidas con lista" tono={resumen.asistencia != null && resumen.asistencia < 80 ? 'text-amber-400' : 'text-slate-300'}/></section>
      <section className="glass space-y-4 rounded-2xl p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <label className="text-xs font-semibold text-slate-400">Buscar materia, grupo o bitácora<input className="input-dark mt-1 w-full" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. Cálculo, proyecto final o tema pendiente"/></label>
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1"><button onClick={() => setVista('CRONOLOGICA')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${vista === 'CRONOLOGICA' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Cronológica</button><button onClick={() => setVista('MATERIA')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${vista === 'MATERIA' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Por materia y grupo</button></div>
          <button type="button" onClick={() => setFiltrosAbiertos((valor) => !valor)} aria-expanded={filtrosAbiertos} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Más filtros{filtrosActivos ? ` (${filtrosActivos})` : ''} {filtrosAbiertos ? '↑' : '↓'}</button>
        </div>
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">Accesos rápidos:</span><button type="button" onClick={() => { setEstado(estado === 'NO_IMPARTIDA' ? 'TODOS' : 'NO_IMPARTIDA'); setFiltroEspecial('TODAS'); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${estado === 'NO_IMPARTIDA' ? 'border-amber-400/40 bg-amber-500/15 text-amber-300' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>No impartidas ({conteoNoImpartidas})</button><button type="button" onClick={() => { setFiltroEspecial(filtroEspecial === 'SIN_TEMA' ? 'TODAS' : 'SIN_TEMA'); setEstado('TODOS'); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filtroEspecial === 'SIN_TEMA' ? 'border-amber-400/40 bg-amber-500/15 text-amber-300' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Sin tema registrado ({conteoSinTema})</button>{(filtrosActivos || busqueda) && <button type="button" onClick={limpiarFiltros} className="ml-auto text-xs font-semibold text-emerald-400 hover:text-emerald-300">Limpiar filtros</button>}</div>
        {filtrosAbiertos && <div className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs font-semibold text-slate-400">Cuatrimestre<select className="input-dark mt-1 w-full" value={periodo} onChange={(e) => setPeriodo(e.target.value)}><option value="TODOS">Todos los periodos</option>{periodos.map((p) => <option key={p}>{p}</option>)}</select></label><label className="text-xs font-semibold text-slate-400">Estado<select className="input-dark mt-1 w-full" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="TODOS">Todos los estados</option><option value="CERRADA">Impartidas</option><option value="ABIERTA">En captura</option><option value="CORRECCION">En corrección</option><option value="NO_IMPARTIDA">No impartidas</option></select></label><label className="text-xs font-semibold text-slate-400">Desde<input type="date" className="input-dark themed-date-input mt-1 w-full" value={desde} onChange={(e) => setDesde(e.target.value)}/></label><label className="text-xs font-semibold text-slate-400">Hasta<input type="date" className="input-dark themed-date-input mt-1 w-full" value={hasta} onChange={(e) => setHasta(e.target.value)}/></label><label className="text-xs font-semibold text-slate-400">Mostrar<select className="input-dark mt-1 w-full" value={filtroEspecial} onChange={(e) => setFiltroEspecial(e.target.value)}><option value="TODAS">Todas las clases</option><option value="INCIDENCIAS">Con notas</option><option value="EXTEMPORANEAS">Extemporáneas</option><option value="CON_TAREA">Con trabajo asignado</option><option value="CON_PENDIENTE">Con tema para retomar</option><option value="SIN_TEMA">Sin tema registrado</option></select></label></div>}
      </section>
      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">{error}</p>}
      {cargando ? <div className="glass rounded-2xl p-12 text-center text-sm text-slate-400">Cargando historial…</div> : !fuente.length ? <div className="glass rounded-2xl p-12 text-center"><p className="font-semibold text-white">No hay clases con estos filtros</p><p className="mt-1 text-sm text-slate-500">Ajusta los filtros o consulta otro cuatrimestre.</p></div> : vista === 'CRONOLOGICA' ? <section className="glass overflow-hidden rounded-2xl"><div className="hidden grid-cols-[140px_minmax(190px,0.9fr)_minmax(260px,1.35fr)_110px_180px_28px] gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 md:grid"><span>Fecha</span><span>Materia y grupo</span><span>Tema</span><span>Asistencia</span><span>Estado</span><span/></div>{visibles.map((clase) => <FilaClase key={clase.id} clase={clase} abierta={abiertaId === clase.id} onToggle={() => setAbiertaId(abiertaId === clase.id ? null : clase.id)} onDetalle={() => navigate(`/docente/clase/${clase.id}`)}/>)}</section> : <section className="space-y-3">{visibles.map((grupo) => {
        const cerradas = grupo.clases.filter((c) => c.estado === 'CERRADA').length;
        const clasesImpartidas = grupo.clases.filter((c) => c.estado === 'CERRADA');
        const registros = clasesImpartidas.reduce((total, c) => total + (c.resumen?.total || 0), 0);
        const asistieron = clasesImpartidas.reduce((total, c) => total + (c.resumen?.presente || 0) + (c.resumen?.retardo || 0) + (c.resumen?.justificada || 0), 0);
        const asistencia = registros ? Math.round((asistieron / registros) * 100) : null;
        const abierto = grupoAbierto === grupo.key;
        return <article key={grupo.key} className="glass overflow-hidden rounded-2xl"><button onClick={() => setGrupoAbierto(abierto ? null : grupo.key)} className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-white">{grupo.nombre}</h2><p className="mt-1 text-xs text-slate-500">{grupo.grupo || 'Inconsistencia: sin grupo asignado'} · {grupo.periodo} · Última clase: {fechaLarga(grupo.clases[0].fecha)}</p></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg bg-white/5 px-3 py-2 text-slate-300">{textoCantidad(grupo.clases.length, 'clase', 'clases')}</span><span className="rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-400">{textoCantidad(cerradas, 'cerrada', 'cerradas')}</span><span className="rounded-lg bg-slate-500/10 px-3 py-2 text-slate-300">{asistencia == null ? '—' : `${asistencia}%`} asistencia</span><span className="text-[11px] font-semibold text-slate-500">{abierto ? 'Ocultar clases' : 'Ver clases'}</span><svg className={`h-4 w-4 text-slate-500 transition ${abierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6"/></svg></div></button>{abierto && <div className="border-t border-white/10">{grupo.clases.map((clase) => <FilaClase key={clase.id} clase={clase} abierta={abiertaId === clase.id} onToggle={() => setAbiertaId(abiertaId === clase.id ? null : clase.id)} onDetalle={() => navigate(`/docente/clase/${clase.id}`)}/>)}</div>}</article>;
      })}</section>}
      <Paginacion pagina={pagina} total={fuente.length} porPagina={POR_PAGINA} onChange={(p) => { setPagina(p); setAbiertaId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}/>
    </main></AdminLayout>
  );
}
