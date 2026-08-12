import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const TIPOS = [
  ['RECESO_CLASES', 'Receso de clases', '#64748b', false],
  ['SUSPENSION_DOCENTE', 'Suspensión de labores docentes', '#111827', false],
  ['SUSPENSION_GENERAL', 'Suspensión general de labores', '#dc2626', false],
  ['REPOSICION', 'Reposición autorizada', '#16a34a', true],
  ['EVALUACION', 'Evaluación', '#2563eb', true],
  ['ACTIVIDAD_INSTITUCIONAL', 'Actividad institucional', '#7c3aed', true],
  ['INSCRIPCIONES', 'Inscripciones o reinscripciones', '#d97706', true],
  ['INICIO_CUATRIMESTRE', 'Inicio de cuatrimestre', '#0891b2', true],
  ['FIN_CUATRIMESTRE', 'Fin de cuatrimestre', '#0f766e', true],
  ['FIN_ACTIVIDADES_ACADEMICAS', 'Fin de actividades académicas', '#be123c', true],
  ['OTRO', 'Otra actividad', '#475569', true],
];
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t[0], t]));
const VACIO = {
  titulo: '', tipo: 'RECESO_CLASES', fecha_inicio: '', fecha_fin: '', descripcion: '',
  color: '#64748b', requiere_asistencia: false, permite_iniciar_clase: false,
  genera_alertas: false, motivo_cambio: '',
};
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function isoLocal(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function CalendarGrid({ cursor, eventos, onDay, onEvent }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstMondayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstMondayIndex).fill(null).concat(Array.from({ length: days }, (_, i) => i + 1));
  while (cells.length % 7) cells.push(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
      <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.04] text-center text-xs font-semibold uppercase text-slate-400">
        {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => <div key={d} className="py-3">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`blank-${idx}`} className="min-h-28 border-b border-r border-white/5 bg-black/10" />;
          const iso = isoLocal(year, month, day);
          const delDia = eventos.filter(e => e.fecha_inicio <= iso && e.fecha_fin >= iso);
          const today = new Date();
          const esHoy = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          return (
            <button type="button" key={iso} onClick={() => onDay(iso)} className="min-h-28 border-b border-r border-white/5 p-2 text-left transition hover:bg-white/[0.04]">
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${esHoy ? 'bg-blue-600 font-bold text-white' : 'text-slate-400'}`}>{day}</span>
              <div className="mt-1 space-y-1">
                {delDia.slice(0, 3).map(e => (
                  <span key={e.id} onClick={ev => { ev.stopPropagation(); onEvent(e); }} className="block truncate rounded px-1.5 py-1 text-[10px] font-semibold text-white" style={{ backgroundColor: e.color || TIPO_MAP[e.tipo]?.[2] }} title={e.titulo}>{e.titulo}</span>
                ))}
                {delDia.length > 3 && <span className="text-[10px] text-slate-500">+{delDia.length - 3} más</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarioAcademico() {
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState('');
  const [calendario, setCalendario] = useState(null);
  const [cursor, setCursor] = useState(new Date());
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [historial, setHistorial] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async id => {
    if (!id) return;
    try {
      const { data } = await api.get('/calendario-academico', { params: { periodo_id: id } });
      setCalendario(data);
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo cargar el calendario.'); }
  }, []);

  useEffect(() => {
    api.get('/calendario-academico/periodos').then(({ data }) => {
      setPeriodos(data);
      const actual = data.find(p => p.es_actual) || data[0];
      if (actual) { setPeriodoId(String(actual.id)); cargar(actual.id); }
    }).catch(() => setError('No se pudieron cargar los periodos escolares.'));
  }, [cargar]);

  const eventos = useMemo(() => calendario?.eventos || [], [calendario]);
  const periodo = periodos.find(p => String(p.id) === String(periodoId));
  const puedeAdministrar = Boolean(periodo?.puede_administrar);

  const crearCalendario = async () => {
    setGuardando(true); setError('');
    try {
      const { data } = await api.post('/calendario-academico', { periodo_id: Number(periodoId) });
      setCalendario(data); setMensaje('Calendario creado en borrador. Agrega las actividades oficiales antes de publicarlo.');
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo crear el calendario.'); }
    finally { setGuardando(false); }
  };

  const abrirNuevo = fecha => {
    if (!calendario?.puede_editar) return;
    setForm({ ...VACIO, fecha_inicio: fecha, fecha_fin: fecha }); setModal({ tipo: 'nuevo' });
  };
  const abrirEditar = evento => {
    if (!calendario?.puede_editar) return;
    setForm({ ...VACIO, ...evento, motivo_cambio: '' }); setModal({ tipo: 'editar', evento });
  };
  const cambiarTipo = tipo => {
    const spec = TIPO_MAP[tipo];
    const requiere = spec?.[3] ?? true;
    setForm(f => ({ ...f, tipo, color: spec?.[2] || f.color, requiere_asistencia: requiere, permite_iniciar_clase: requiere, genera_alertas: requiere }));
  };
  const guardarEvento = async e => {
    e.preventDefault(); setGuardando(true); setError('');
    try {
      const payload = { ...form };
      if (modal.tipo === 'nuevo') await api.post(`/calendario-academico/${calendario.id}/eventos`, payload);
      else await api.put(`/calendario-academico/${calendario.id}/eventos/${modal.evento.id}`, payload);
      await cargar(periodoId); setModal(null); setMensaje(modal.tipo === 'nuevo' ? 'Actividad agregada al calendario.' : 'Actividad actualizada y registrada en el historial.');
    } catch (err) { setError(err.response?.data?.detail || 'No se pudo guardar la actividad.'); }
    finally { setGuardando(false); }
  };
  const cancelarEvento = async () => {
    const motivo = window.prompt('Motivo de la cancelación (se conservará en el historial):');
    if (!motivo) return;
    try {
      await api.delete(`/calendario-academico/${calendario.id}/eventos/${modal.evento.id}`, { params: { motivo } });
      await cargar(periodoId); setModal(null); setMensaje('Actividad cancelada; el registro histórico se conservó.');
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo cancelar la actividad.'); }
  };
  const cambiarEstado = async estado => {
    const motivo = estado === 'BORRADOR' || estado === 'CERRADO' ? window.prompt('Motivo del cambio de estado:') : null;
    if ((estado === 'BORRADOR' || estado === 'CERRADO') && !motivo) return;
    try {
      const { data } = await api.put(`/calendario-academico/${calendario.id}/estado`, { estado, motivo });
      setCalendario(data); setMensaje(estado === 'PUBLICADO' ? 'Calendario publicado. Sus reglas ya alimentan el sistema docente.' : `Calendario cambiado a ${estado.toLowerCase()}.`);
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo cambiar el estado.'); }
  };
  const abrirHistorial = async () => {
    try { const { data } = await api.get(`/calendario-academico/${calendario.id}/historial`); setHistorial(data); setVerHistorial(true); }
    catch (e) { setError(e.response?.data?.detail || 'No se pudo consultar el historial.'); }
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-white">Calendario académico</h1><p className="mt-1 text-sm text-slate-400">Fuente oficial para asistencias, alertas y operación docente.</p></div>
          <select value={periodoId} onChange={e => { setPeriodoId(e.target.value); cargar(e.target.value); }} className="input-dark max-w-xs">
            {periodos.map(p => <option key={p.id} value={p.id}>{p.clave}{p.es_actual ? ' · Actual' : ''}</option>)}
          </select>
        </div>
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}
        {mensaje && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{mensaje}</div>}
        {!calendario ? (
          <div className="glass rounded-2xl p-8 text-center"><h2 className="text-lg font-semibold text-white">{periodo?.clave} todavía no tiene calendario publicado</h2><p className="mt-2 text-sm text-slate-400">Mientras no exista un calendario publicado, Docencia conserva su operación habitual.</p>{puedeAdministrar && <button onClick={crearCalendario} disabled={guardando} className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Crear calendario en borrador</button>}</div>
        ) : <>
          <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${calendario.estado === 'PUBLICADO' ? 'bg-emerald-500/15 text-emerald-300' : calendario.estado === 'CERRADO' ? 'bg-slate-500/20 text-slate-300' : 'bg-amber-500/15 text-amber-300'}`}>{calendario.estado}</span><span className="text-xs text-slate-500">Versión {calendario.version}</span></div><p className="mt-2 text-xs text-slate-400">{calendario.estado === 'PUBLICADO' ? 'Las reglas están activas en el sistema docente.' : calendario.estado === 'BORRADOR' ? 'Los cambios aún no afectan al sistema docente.' : 'Periodo cerrado para edición.'}</p></div>
            <div className="flex flex-wrap gap-2">{calendario.puede_editar && calendario.estado === 'BORRADOR' && <button onClick={() => cambiarEstado('PUBLICADO')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Publicar calendario</button>}{calendario.puede_editar && calendario.estado === 'PUBLICADO' && <><button onClick={() => cambiarEstado('BORRADOR')} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Volver a borrador</button><button onClick={() => cambiarEstado('CERRADO')} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white">Cerrar periodo</button></>} {calendario.puede_editar && <button onClick={abrirHistorial} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300">Ver historial</button>}</div>
          </div>
          <div className="flex items-center justify-between"><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="rounded-lg bg-white/5 px-4 py-2 text-slate-300">←</button><h2 className="text-lg font-semibold capitalize text-white">{MESES[cursor.getMonth()]} {cursor.getFullYear()}</h2><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="rounded-lg bg-white/5 px-4 py-2 text-slate-300">→</button></div>
          <CalendarGrid cursor={cursor} eventos={eventos} onDay={abrirNuevo} onEvent={abrirEditar} />
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">{TIPOS.slice(0, 7).map(t => <span key={t[0]} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t[2] }} />{t[1]}</span>)}</div>
        </>}
      </div>
      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={guardarEvento} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-lg font-bold text-white">{modal.tipo === 'nuevo' ? 'Nueva actividad' : 'Editar actividad'}</h2><p className="text-xs text-slate-400">Define cómo esta fecha afecta la operación docente.</p></div><button type="button" onClick={() => setModal(null)} className="text-2xl text-slate-400">×</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300 sm:col-span-2">Nombre *<input required value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="input-dark mt-1" /></label><label className="text-sm text-slate-300 sm:col-span-2">Tipo<select value={form.tipo} onChange={e => cambiarTipo(e.target.value)} className="input-dark mt-1">{TIPOS.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label><label className="text-sm text-slate-300">Fecha inicial<input required type="date" value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} className="input-dark mt-1" /></label><label className="text-sm text-slate-300">Fecha final<input required type="date" value={form.fecha_fin} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} className="input-dark mt-1" /></label><label className="text-sm text-slate-300 sm:col-span-2">Descripción<textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="input-dark mt-1 min-h-20" /></label><div className="space-y-2 rounded-xl border border-white/10 p-4 text-sm text-slate-300 sm:col-span-2">{[['requiere_asistencia','Requiere registro de asistencia'],['permite_iniciar_clase','Permite iniciar una clase'],['genera_alertas','Genera alertas por falta de registro']].map(([key,label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}</div>{calendario.estado === 'PUBLICADO' && <label className="text-sm text-slate-300 sm:col-span-2">Motivo del cambio *<textarea required minLength={5} value={form.motivo_cambio} onChange={e => setForm({ ...form, motivo_cambio: e.target.value })} className="input-dark mt-1" /></label>}</div><div className="mt-6 flex justify-between gap-3">{modal.tipo === 'editar' ? <button type="button" onClick={cancelarEvento} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-300">Cancelar actividad</button> : <span />}<div className="flex gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300">Cerrar</button><button disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{guardando ? 'Guardando…' : 'Guardar'}</button></div></div></form></div>}
      {verHistorial && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6"><div className="flex justify-between"><h2 className="text-lg font-bold text-white">Historial del calendario</h2><button onClick={() => setVerHistorial(false)} className="text-2xl text-slate-400">×</button></div><div className="mt-4 divide-y divide-white/10">{historial.map(h => <div key={h.id} className="py-3"><div className="flex justify-between gap-3"><p className="text-sm font-semibold text-white">{h.accion.replaceAll('_',' ')}</p><span className="text-xs text-slate-500">{new Date(`${h.creado_en}Z`).toLocaleString('es-MX')}</span></div><p className="mt-1 text-xs text-slate-400">{h.usuario}{h.motivo ? ` · ${h.motivo}` : ''}</p></div>)}</div></div></div>}
    </AdminLayout>
  );
}
