import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const RESOLUCIONES = [
  ['PENDIENTE', 'Pendiente'], ['PROMOVIDO', 'Promovido'], ['REPITE', 'Repite'],
  ['ESTADIA', 'Estadía'], ['EGRESO', 'Egreso'], ['BAJA_TEMPORAL', 'Baja temporal'], ['BAJA_DEFINITIVA', 'Baja definitiva'],
];

const siguientePeriodo = (clave = '') => {
  const normalizada = clave.toUpperCase().replace(/–/g, '-').trim();
  const match = normalizada.match(/^(ENE-ABR|MAY-AGO|SEP-DIC)[ -](\d{4})$/);
  if (!match) return '';
  const [, bloque, anioTexto] = match; const anio = Number(anioTexto);
  if (bloque === 'ENE-ABR') return `MAY-AGO ${anio}`;
  if (bloque === 'MAY-AGO') return `SEP-DIC ${anio}`;
  return `ENE-ABR ${anio + 1}`;
};

export default function SEPromociones() {
  const [periodos, setPeriodos] = useState([]);
  const [origen, setOrigen] = useState(''); const [destino, setDestino] = useState('');
  const [data, setData] = useState(null); const [filtro, setFiltro] = useState('');
  const [modal, setModal] = useState(null); const [form, setForm] = useState({});
  const [confirmarAplicacion, setConfirmarAplicacion] = useState(false);
  const [mensaje, setMensaje] = useState(''); const [error, setError] = useState(''); const [cargando, setCargando] = useState(false); const [creandoPeriodo, setCreandoPeriodo] = useState(false);

  useEffect(() => { api.get('/servicios-escolares/periodos').then(({ data: rows }) => {
    setPeriodos(rows); const actual = rows.find(p => p.es_actual) || rows[0]; const claveSiguiente = siguientePeriodo(actual?.clave);
    const siguiente = rows.find(p => p.clave.toUpperCase().replace(/–/g, '-').trim() === claveSiguiente);
    setOrigen(String(actual?.id || '')); setDestino(String(siguiente?.id || ''));
  }).catch(() => setError('No se pudieron cargar los periodos.')); }, []);

  const cargar = async () => {
    if (!origen || !destino) { setData(null); setError('Crea o selecciona un periodo destino.'); return; }
    if (origen === destino) { setData(null); setError('El periodo que concluye y el periodo destino deben ser diferentes.'); return; }
    setCargando(true); setError('');
    try { const { data: respuesta } = await api.get('/servicios-escolares/promociones', { params: { periodo_origen_id: origen, periodo_destino_id: destino } }); setData(respuesta); }
    catch (e) { setError(e.response?.data?.detail || 'No se pudo cargar la promoción.'); }
    finally { setCargando(false); }
  };
  const crearSiguiente = async () => {
    const periodoOrigen = periodos.find(p => String(p.id) === String(origen));
    const clave = siguientePeriodo(periodoOrigen?.clave);
    if (!clave) { setError('No se pudo calcular el siguiente periodo escolar.'); return; }
    setCreandoPeriodo(true); setError(''); setMensaje('');
    try {
      const { data: nuevo } = await api.post('/servicios-escolares/periodos', { clave });
      setPeriodos(actuales => [nuevo, ...actuales]); setDestino(String(nuevo.id));
      setMensaje(`${nuevo.clave} fue creado en preparación. Su agenda de laboratorios inicia vacía.`);
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo crear el periodo destino.'); }
    finally { setCreandoPeriodo(false); }
  };
  useEffect(() => { if (origen && destino) cargar(); }, [origen, destino]);

  const filas = useMemo(() => (data?.alumnos || []).filter(a => `${a.matricula} ${a.alumno} ${a.carrera}`.toLowerCase().includes(filtro.toLowerCase())), [data, filtro]);
  const abrir = alumno => { setModal(alumno); setForm({ resolucion: alumno.resolucion, cuatrimestre_destino: alumno.cuatrimestre_destino || '', grupo_destino: alumno.grupo_destino || '', observaciones: alumno.observaciones || '' }); };
  const guardar = async e => { e.preventDefault(); try {
    await api.put(`/servicios-escolares/promociones/${modal.inscripcion_id}`, { ...form, periodo_destino_id: Number(destino), cuatrimestre_destino: ['PROMOVIDO','REPITE'].includes(form.resolucion) ? Number(form.cuatrimestre_destino) : null, grupo_destino: ['PROMOVIDO','REPITE'].includes(form.resolucion) ? form.grupo_destino : null });
    setModal(null); setMensaje('Resolución guardada. Aún no modifica la inscripción del alumno.'); await cargar();
  } catch (e2) { setError(e2.response?.data?.detail || 'No se pudo guardar la resolución.'); } };
  const aplicar = async () => { try {
    const { data: r } = await api.post('/servicios-escolares/promociones/aplicar', null, { params: { periodo_origen_id: origen, periodo_destino_id: destino } }); setConfirmarAplicacion(false); setMensaje(r.mensaje); await cargar();
  } catch (e) { setError(e.response?.data?.detail || 'No se pudieron aplicar las promociones.'); } };

  return <AdminLayout><div className="space-y-5 p-6">
    <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-500">Servicios Escolares</p><h1 className="mt-1 text-2xl font-bold text-white">Promoción de cuatrimestre</h1><p className="mt-1 text-sm text-slate-400">Resuelve el destino de cada alumno sin alterar sus periodos anteriores.</p></div>
    <section className="glass grid gap-4 rounded-2xl p-5 md:grid-cols-[1fr_1fr_auto]"><label className="text-sm text-slate-300">Periodo que concluye<select className="input-dark mt-1" value={origen} onChange={e => { setOrigen(e.target.value); setData(null); }}>{periodos.map(p => <option key={p.id} value={p.id}>{p.clave}{p.es_actual ? ' · Actual' : ''}</option>)}</select></label><label className="text-sm text-slate-300">Periodo destino<select className="input-dark mt-1" value={destino} onChange={e => { setDestino(e.target.value); setData(null); }}><option value="">Selecciona un periodo</option>{periodos.filter(p => String(p.id) !== String(origen)).map(p => <option key={p.id} value={p.id}>{p.clave}</option>)}</select>{!destino && origen && <button type="button" disabled={creandoPeriodo} onClick={crearSiguiente} className="mt-2 text-xs font-semibold text-emerald-400 disabled:opacity-50">{creandoPeriodo ? 'Creando periodo…' : `Crear ${siguientePeriodo(periodos.find(p => String(p.id) === String(origen))?.clave) || 'periodo siguiente'} en preparación`}</button>}</label><button disabled={!origen || !destino || origen === destino} onClick={cargar} className="self-end rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Actualizar propuesta</button></section>
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}{mensaje && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{mensaje}</div>}
    {data && <><div className={`rounded-xl border p-4 ${data.puede_aplicar ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-amber-500/25 bg-amber-500/10'}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><b className="text-white">{data.periodo_origen} → {data.periodo_destino}</b><p className="text-sm text-slate-300">{data.revisados}/{data.total} revisados · {data.aplicados} aplicados · cierre {data.cierre_academico.replaceAll('_',' ')}</p></div><button disabled={!data.puede_aplicar || data.revisados === 0} onClick={() => setConfirmarAplicacion(true)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Aplicar resoluciones</button></div></div>
    <section className="glass overflow-hidden rounded-2xl"><div className="border-b border-white/10 p-4"><input className="input-dark" placeholder="Buscar alumno, matrícula o carrera…" value={filtro} onChange={e => setFiltro(e.target.value)} /></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-white/[.03] text-xs uppercase text-slate-500"><tr><th className="p-4">Alumno</th><th>Origen</th><th>Resolución</th><th>Destino</th><th></th></tr></thead><tbody className="divide-y divide-white/5">{filas.map(a => <tr key={a.inscripcion_id}><td className="p-4"><b className="text-white">{a.alumno}</b><br/><span className="text-xs text-slate-500">{a.matricula} · {a.carrera}</span></td><td className="text-slate-300">{a.origen}</td><td><span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-300">{a.resolucion.replaceAll('_',' ')}</span></td><td className="text-slate-300">{['PROMOVIDO','REPITE'].includes(a.resolucion) ? `${a.cuatrimestre_destino}° ${a.grupo_destino}` : '—'}</td><td className="pr-4 text-right"><button disabled={a.estado === 'APLICADA'} onClick={() => abrir(a)} className="rounded-lg border border-blue-500/30 px-3 py-2 text-xs font-semibold text-blue-400 disabled:opacity-30">{a.estado === 'APLICADA' ? 'Aplicada' : 'Resolver'}</button></td></tr>)}</tbody></table>{!cargando && !filas.length && <p className="p-8 text-center text-sm text-slate-500">No hay alumnos para mostrar.</p>}</div></section></>}
    {modal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"><form onSubmit={guardar} className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Resolución académica</p><h2 className="mt-1 text-lg font-bold text-white">{modal.alumno}</h2><p className="text-sm text-slate-400">{modal.matricula} · origen {modal.origen}</p></div><button type="button" onClick={() => setModal(null)} className="text-2xl text-slate-400">×</button></div><div className="mt-5 space-y-4"><label className="block text-sm text-slate-300">Destino del alumno<select required className="input-dark mt-1" value={form.resolucion} onChange={e => setForm({...form, resolucion:e.target.value})}>{RESOLUCIONES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></label>{['PROMOVIDO','REPITE'].includes(form.resolucion) && <div className="grid grid-cols-2 gap-3"><label className="text-sm text-slate-300">Cuatrimestre<input required min="1" max="12" type="number" className="input-dark mt-1" value={form.cuatrimestre_destino} onChange={e => setForm({...form,cuatrimestre_destino:e.target.value})}/></label><label className="text-sm text-slate-300">Grupo<input required className="input-dark mt-1" value={form.grupo_destino} onChange={e => setForm({...form,grupo_destino:e.target.value.toUpperCase()})}/></label></div>}<label className="block text-sm text-slate-300">Observaciones<textarea className="input-dark mt-1 min-h-24" value={form.observaciones} onChange={e => setForm({...form,observaciones:e.target.value})}/></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300">Cancelar</button><button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Guardar resolución</button></div></form></div>}
    {confirmarAplicacion && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"><section className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-wider text-amber-400">Confirmación institucional</p><h2 className="mt-1 text-lg font-bold text-white">Aplicar resoluciones revisadas</h2><p className="mt-2 text-sm leading-6 text-slate-300">Se crearán las inscripciones de <b>{data?.periodo_destino}</b> y las del periodo <b>{data?.periodo_origen}</b> quedarán concluidas. El historial no será eliminado.</p><div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">Las resoluciones pendientes no serán aplicadas y continuarán en la bandeja.</div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setConfirmarAplicacion(false)} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300">Cancelar</button><button onClick={aplicar} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Confirmar y aplicar</button></div></section></div>}
  </div></AdminLayout>;
}
