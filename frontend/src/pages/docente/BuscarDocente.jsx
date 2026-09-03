import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import SelectDark from '../../components/SelectDark';
import { usePeriodo } from '../../context/PeriodoContext';
import { getApiErrorMessage } from '../../utils/apiError';
import api from '../../hooks/useApi';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const texto = { color: 'var(--input-color)' };
const fechaCorta = fecha => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
const noLectivo = calendario => calendario && (!calendario.requiere_asistencia || !calendario.permite_iniciar_clase);

function Actividad({ actividad, actual = false, porGrupo = false }) {
  const privada = ['RECESO', 'DESCARGA'].includes(actividad.tipo_actividad);
  return <div className={`rounded-xl border p-4 ${actual ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.025]'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-bold" style={texto}>{actividad.actividad}</p>
      <span className="text-xs font-semibold text-slate-400">{actividad.hora_inicio}–{actividad.hora_fin}</span>
    </div>
    <p className="mt-1 text-sm text-slate-400">{porGrupo ? actividad.docente : [actividad.grupo && `Grupo ${actividad.grupo}`, actividad.carrera].filter(Boolean).join(' · ')}</p>
    <p className="mt-1 text-xs text-slate-400">{privada ? 'Ubicación privada' : actividad.salon || 'Sin espacio asignado'}</p>
  </div>;
}

function Resultado({ resultado, respuesta, porGrupo }) {
  const actuales = respuesta.es_actual ? resultado.actividades_actuales || [] : [];
  const suspendido = noLectivo(respuesta.calendario_hoy);
  return <article className="glass rounded-2xl p-4 sm:p-5" style={texto}>
    <h2 className="text-lg font-bold">{porGrupo ? `Grupo ${resultado.nombre}` : resultado.nombre}</h2>
    {resultado.carrera && <p className="mt-1 text-sm text-slate-400">{resultado.carrera}</p>}
    {!respuesta.es_actual ? <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-slate-400">Periodo de consulta: revisa el horario semanal registrado. No corresponde a la actividad de hoy.</p>
      : suspendido ? <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-slate-400">Día no lectivo · {respuesta.calendario_hoy.motivo || 'Sin clases programadas'}</p>
      : <div className="mt-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-400">Ahora, según el horario</p>
        {actuales.length ? actuales.map(a => <Actividad key={a.id} actividad={a} actual porGrupo={porGrupo} />)
          : <p className="text-sm text-slate-400">Sin {porGrupo ? 'clase' : 'actividad'} programada ahora.</p>}
        {actuales.length > 1 && <p className="text-xs text-amber-500">Hay actividades que coinciden en este horario.</p>}
      </div>}
    {respuesta.es_actual && resultado.siguiente_actividad && <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold text-slate-400">Siguiente actividad · {fechaCorta(resultado.siguiente_actividad.fecha)}</p>
      <Actividad actividad={resultado.siguiente_actividad} porGrupo={porGrupo} />
    </div>}
    {respuesta.es_actual && !actuales.length && !resultado.siguiente_actividad && resultado.semana.length > 0 && <p className="mt-3 text-xs text-slate-400">No hay otra actividad lectiva prevista en los próximos 7 días de este cuatrimestre.</p>}
    {respuesta.es_actual && <section className="mt-5 border-t border-white/10 pt-4">
      <h3 className="text-sm font-bold">Jornada de hoy</h3>
      {suspendido ? <p className="mt-2 text-sm text-slate-400">Las clases del horario recurrente no aplican hoy por el calendario académico.</p>
        : resultado.jornada.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{resultado.jornada.map(a => <Actividad key={a.id} actividad={a} actual={actuales.some(c => c.id === a.id)} porGrupo={porGrupo} />)}</div>
        : <p className="mt-2 text-sm text-slate-400">No hay actividades registradas para hoy.</p>}
    </section>}
    <details className="mt-5 border-t border-white/10 pt-4" open={!respuesta.es_actual || undefined}>
      <summary className="cursor-pointer text-sm font-semibold text-emerald-400">Ver horario semanal</summary>
      <p className="mt-2 text-xs text-slate-400">Horario recurrente de {respuesta.periodo}. Los días no lectivos se rigen por el calendario académico.</p>
      {!resultado.semana.length ? <p className="mt-3 text-sm text-slate-400">Sin horario activo registrado en este periodo.</p>
        : <div className="mt-3 grid gap-3 md:grid-cols-2">{DIAS.map((dia, indice) => {
          const actividades = resultado.semana.filter(a => a.dia_semana === indice);
          return actividades.length > 0 && <section key={dia} className="space-y-2"><h4 className="text-sm font-bold">{dia}</h4>{actividades.map(a => <Actividad key={a.id} actividad={a} porGrupo={porGrupo} />)}</section>;
        })}</div>}
    </details>
  </article>;
}

export default function BuscarDocente() {
  const { periodo } = usePeriodo();
  const periodoId = periodo?.id;
  const [tab, setTab] = useState('docente');
  const [termino, setTermino] = useState('');
  const [consulta, setConsulta] = useState('');
  const [busqueda, setBusqueda] = useState(0);
  const [grupos, setGrupos] = useState([]);
  const [carrera, setCarrera] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [respuesta, setRespuesta] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoGrupos, setCargandoGrupos] = useState(false);
  const [error, setError] = useState('');
  const [errorGrupos, setErrorGrupos] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let vigente = true;
    setGrupos([]); setCarrera(''); setGrupoId(''); setRespuesta(null); setConsulta('');
    if (!periodoId) return;
    setCargandoGrupos(true); setErrorGrupos('');
    api.get('/docencia/consulta-horarios/grupos', { params: { periodo_id: periodoId } })
      .then(({ data }) => { if (vigente) setGrupos(data); })
      .catch(err => { if (vigente) setErrorGrupos(getApiErrorMessage(err, 'No se pudieron cargar los grupos.')); })
      .finally(() => { if (vigente) setCargandoGrupos(false); });
    return () => { vigente = false; };
  }, [periodoId, revision]);

  useEffect(() => {
    let vigente = true;
    let peticion = 0;
    setRespuesta(null); setError(''); setCargando(false);
    if (!periodoId || (tab === 'docente' ? !consulta : !grupoId)) return;
    const cargar = async (silencioso = false) => {
      const turno = ++peticion;
      if (!silencioso) setCargando(true);
      try {
        const { data } = await api.get(tab === 'docente' ? '/docencia/ubicacion-docentes' : `/docencia/consulta-horarios/grupos/${grupoId}`, { params: { periodo_id: periodoId, ...(tab === 'docente' ? { q: consulta } : {}) } });
        if (vigente && turno === peticion) { setRespuesta(data); setError(''); }
      } catch (err) {
        if (vigente && turno === peticion) { setRespuesta(null); setError(getApiErrorMessage(err, 'No fue posible consultar el horario.')); }
      } finally { if (vigente && turno === peticion) setCargando(false); }
    };
    cargar();
    const refrescar = () => cargar(true);
    const intervalo = setInterval(refrescar, 60_000);
    window.addEventListener('focus', refrescar);
    return () => { vigente = false; clearInterval(intervalo); window.removeEventListener('focus', refrescar); };
  }, [tab, consulta, grupoId, periodoId, busqueda]);

  const buscar = evento => {
    evento.preventDefault();
    if (termino.trim().length < 2) { setError('Escribe al menos 2 caracteres del nombre.'); return; }
    setConsulta(termino.trim());
    setBusqueda(n => n + 1);
  };
  const carreras = [...new Set(grupos.map(g => g.carrera))];
  return <AdminLayout><div className="mx-auto max-w-5xl space-y-5" style={texto}>
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Consulta entre docentes</p>
      <h1 className="mt-1 text-2xl font-bold">Consultar horarios</h1>
      <p className="mt-2 text-sm text-slate-400">Encuentra la actividad, el docente y el espacio por docente o por grupo.</p>
      <p className="mt-1 text-xs text-slate-400">Información según el horario oficial · {periodo?.clave || 'Selecciona un periodo'}. No confirma presencia en tiempo real.</p>
    </header>
    <div className="flex gap-1 rounded-xl border border-white/10 p-1" aria-label="Tipo de consulta">{[['docente', 'Por docente'], ['grupo', 'Por grupo']].map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold ${tab === id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}>{label}</button>)}</div>
    {tab === 'docente' ? <form onSubmit={buscar} className="glass rounded-2xl p-4 sm:p-5">
      <label htmlFor="buscar-docente" className="text-sm font-semibold">Nombre del docente</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input id="buscar-docente" value={termino} onChange={e => setTermino(e.target.value)} autoComplete="off" placeholder="Ej. María López" className="min-w-0 flex-1 rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500" style={{ background: 'var(--input-bg)', color: 'var(--input-color)', borderColor: 'var(--input-border-color)' }} />
        <button disabled={cargando || !periodoId} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{cargando ? 'Buscando…' : 'Buscar'}</button></div>
    </form> : <section className="glass rounded-2xl p-4 sm:p-5">
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]"><div><p className="mb-2 text-sm font-semibold">Carrera</p><SelectDark value={carrera} onChange={value => { setCarrera(value); setGrupoId(''); }} disabled={cargandoGrupos || !grupos.length} placeholder={cargandoGrupos ? 'Cargando carreras…' : 'Selecciona una carrera'} wrapSelected options={carreras.map(c => ({ value: c, label: c, wrap: true }))} /></div>
        <div><p className="mb-2 text-sm font-semibold">Grupo</p><SelectDark value={grupoId} onChange={value => setGrupoId(String(value))} disabled={!carrera} placeholder="Selecciona un grupo" options={grupos.filter(g => g.carrera === carrera).map(g => ({ value: g.id, label: [g.grupo, g.turno].filter(Boolean).join(' · ') }))} /></div></div>
      {!cargandoGrupos && !errorGrupos && !grupos.length && <p className="mt-3 text-sm text-slate-400">No hay grupos disponibles en este periodo.</p>}
      {errorGrupos && <p role="alert" className="mt-3 text-sm text-red-400">{errorGrupos} <button onClick={() => setRevision(r => r + 1)} className="underline">Reintentar</button></p>}
    </section>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {cargando && <p role="status" className="text-sm text-slate-400">Consultando horario…</p>}
    {respuesta && <section className="space-y-3" aria-live="polite"><div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span>{respuesta.resultados.length} resultado{respuesta.resultados.length === 1 ? '' : 's'}</span><span>{fechaCorta(respuesta.fecha)} · Actualizado a las {respuesta.hora_consulta} h</span></div>
      {!respuesta.resultados.length && <p className="glass rounded-2xl p-6 text-sm text-slate-400">No se encontró un docente activo con ese nombre.</p>}
      {respuesta.resultados.map(r => <Resultado key={r.docente_id || `grupo-${r.grupo_id}`} resultado={r} respuesta={respuesta} porGrupo={tab === 'grupo'} />)}
    </section>}
  </div></AdminLayout>;
}
