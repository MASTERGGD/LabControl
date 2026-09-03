import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { abreviarCarrera, esDemo, ordenarResultados, resumenConsultaHorario } from '../../utils/resumenConsultaHorario';
import AdminLayout from '../../components/AdminLayout';
import SelectDark from '../../components/SelectDark';
import { usePeriodo } from '../../context/PeriodoContext';
import { getApiErrorMessage } from '../../utils/apiError';
import api from '../../hooks/useApi';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const texto = { color: 'var(--input-color)' };
const fechaCorta = fecha => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
const secundario = { color: 'var(--text-muted)' };
const borde = { borderColor: 'var(--surface-border)' };

function Carrera({ nombre }) {
  return nombre ? <span title={nombre} className="rounded border px-1.5 py-0.5 text-[10px] font-semibold" style={borde}>{abreviarCarrera(nombre)}</span> : null;
}

function Actividad({ actividad, actual = false, pasada = false, porGrupo = false }) {
  const privada = ['RECESO', 'DESCARGA'].includes(actividad.tipo_actividad);
  return <li className={`grid gap-1 border-l-2 px-3 py-3 sm:grid-cols-[110px_1fr] sm:gap-4 ${actual ? 'border-emerald-500 bg-emerald-500/5' : 'border-transparent'}`} style={{ opacity: pasada ? 0.6 : 1 }}>
    <p className="text-xs tabular-nums" style={secundario}>{actividad.hora_inicio}–{actividad.hora_fin}{actual && <span className="mt-1 block font-semibold" style={{ color: 'var(--accent-success-ui)' }}>En curso</span>}</p>
    <div><p className={`text-sm ${actual ? 'font-semibold' : ''}`} style={texto}>{actividad.actividad}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" style={secundario}>
        {porGrupo ? <span>{actividad.docente}</span> : <><span>{actividad.grupo}</span><Carrera nombre={actividad.carrera} /></>}
        <span>· {privada ? 'Sin ubicación' : actividad.salon || 'Sin espacio asignado'}</span>
      </div>
    </div>
  </li>;
}

export function Resultado({ resultado, respuesta, porGrupo, automatico, onSemana }) {
  const [abierto, setAbierto] = useState(automatico);
  const resumen = resumenConsultaHorario(resultado, respuesta);
  const carreras = [...new Set([resultado.carrera, ...resultado.semana.map(a => a.carrera)].filter(Boolean))];
  const identidad = [resultado.departamento, resultado.numero_empleado && `Emp. ${resultado.numero_empleado}`].filter(Boolean).join(' · ');
  return <article style={{ ...texto, ...borde }} className="border-b last:border-b-0">
    <button type="button" aria-expanded={abierto} onClick={() => setAbierto(v => !v)} className="grid w-full grid-cols-[12px_1fr_16px] items-center gap-x-3 gap-y-2 px-4 py-4 text-left hover:bg-white/[0.025] sm:grid-cols-[12px_1fr_minmax(140px,220px)_16px] sm:px-5">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${resumen.color}`} />
      <span className="min-w-0"><span className="text-sm font-bold">{porGrupo ? `Grupo ${resultado.nombre}` : resultado.nombre}</span>
        {esDemo(resultado) && <span className="ml-2 rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: 'var(--accent-warning-ui)' }}>Cuenta de prueba</span>}
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" style={secundario}>{carreras.map(c => <Carrera key={c} nombre={c} />)}{identidad || (!carreras.length ? 'Sin adscripción registrada' : '')}</span>
      </span>
      <span className="col-start-2 row-start-2 min-w-0 text-xs sm:col-start-3 sm:row-start-1 sm:text-right">
        <span className="block font-semibold" style={resumen.prioridad === 0 ? { color: 'var(--accent-success-ui)' } : texto}>{resumen.titulo}</span>
        <span className="mt-1 block text-[11px] tabular-nums" style={secundario}>{resumen.estado && resumen.estado !== resumen.titulo && `${resumen.estado} · `}{resumen.detalle}</span>
      </span>
      <span aria-hidden="true" className="col-start-3 row-start-1 text-xs sm:col-start-4" style={secundario}>{abierto ? '▼' : '▶'}</span>
    </button>
    {abierto && <div className="pb-4 pl-10 pr-4 sm:pl-11 sm:pr-5">
      {resumen.vacio ? <p className="mb-3 text-sm" style={secundario}>{resumen.vacio}</p> : <>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={secundario}>Jornada de hoy</h3>
        {resumen.conflicto && <p className="mb-2 text-xs" style={{ color: 'var(--accent-warning-ui)' }}>Hay actividades con horarios coincidentes.</p>}
        <ul className="space-y-1">{resultado.jornada.map(a => <Actividad key={a.id} actividad={a} porGrupo={porGrupo} actual={resultado.actividades_actuales.some(c => c.id === a.id)} pasada={a.hora_fin <= respuesta.hora_consulta} />)}</ul>
      </>}
      <button type="button" onClick={onSemana} className="mt-3 text-xs font-semibold hover:underline" style={{ color: 'var(--accent-success-ui)' }}>Ver horario semanal →</button>
    </div>}
  </article>;
}

function PanelSemana({ resultado, respuesta, porGrupo, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialogo = ref.current;
    const anterior = document.activeElement;
    dialogo.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialogo.close(); document.body.style.overflow = overflow; anterior?.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} onCancel={e => { e.preventDefault(); onClose(); }} aria-labelledby="titulo-horario-semanal" className="fixed inset-y-0 left-auto right-0 m-0 h-[100dvh] max-h-none w-full max-w-xl border-l p-0 shadow-2xl backdrop:bg-black/50" style={{ background: 'var(--layout-bg)', ...texto, ...borde }}>
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5" style={{ background: 'var(--layout-bg)', ...borde }}><div><h2 id="titulo-horario-semanal" className="font-bold">Horario semanal</h2><p className="mt-1 text-sm">{resultado.nombre}</p><p className="mt-1 text-xs" style={secundario}>{respuesta.periodo} · Horario recurrente</p></div><button autoFocus type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm" style={borde}>Cerrar</button></header>
    <div className="space-y-5 p-5"><p className="text-xs" style={secundario}>Los días no lectivos se rigen por el calendario académico.</p>
      {!resultado.semana.length ? <p className="text-sm" style={secundario}>Sin carga activa registrada en este periodo.</p> : DIAS.map((dia, indice) => {
        const actividades = resultado.semana.filter(a => a.dia_semana === indice);
        return actividades.length > 0 && <section key={dia}><h3 className="border-b pb-2 text-xs font-bold uppercase" style={borde}>{dia}</h3><ul>{actividades.map(a => <Actividad key={a.id} actividad={a} porGrupo={porGrupo} />)}</ul></section>;
      })}
    </div>
  </dialog>, document.body);
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
  const [semanaId, setSemanaId] = useState(null);

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
    setRespuesta(null); setSemanaId(null); setError(''); setCargando(false);
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
  const resultados = respuesta ? ordenarResultados(respuesta.resultados, respuesta) : [];
  const semanaSeleccionada = resultados.find(r => (r.docente_id || `grupo-${r.grupo_id}`) === semanaId);
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
      <div className="overflow-hidden rounded-2xl border" style={borde}>{resultados.map(r => <Resultado key={`${tab}-${consulta}-${busqueda}-${r.docente_id || r.grupo_id}`} resultado={r} respuesta={respuesta} porGrupo={tab === 'grupo'} automatico={resultados.length === 1} onSemana={() => setSemanaId(r.docente_id || `grupo-${r.grupo_id}`)} />)}</div>
    </section>}
    {semanaSeleccionada && <PanelSemana resultado={semanaSeleccionada} respuesta={respuesta} porGrupo={tab === 'grupo'} onClose={() => setSemanaId(null)} />}
  </div></AdminLayout>;
}
