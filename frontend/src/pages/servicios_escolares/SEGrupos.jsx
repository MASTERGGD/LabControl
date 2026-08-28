import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const normalizarPeriodo = (valor = '') => valor.toUpperCase().replace(/[^A-Z0-9]/g, '');

const periodoEsperado = () => {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const bloque = mes <= 4 ? 'ENE-ABR' : mes <= 8 ? 'MAY-AGO' : 'SEP-DIC';
  return `${bloque} ${hoy.getFullYear()}`;
};

export default function SEGrupos() {
  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [resumen, setResumen] = useState({});
  const [detalle, setDetalle] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  const [activandoPeriodo, setActivandoPeriodo] = useState(false);
  const [confirmandoPeriodo, setConfirmandoPeriodo] = useState(false);
  const [carreras, setCarreras] = useState([]);
  const [nuevoGrupo, setNuevoGrupo] = useState(false);
  const [formGrupo, setFormGrupo] = useState({ carrera_id: '', cuatrimestre: '', grupo: 'A', turno: '', capacidad: '' });
  const [busqueda, setBusqueda] = useState('');
  const [candidatos, setCandidatos] = useState([]);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [matriculas, setMatriculas] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;

    api.get('/servicios-escolares/periodos')
      .then(({ data }) => {
        if (!vigente) return;
        setPeriodos(data);
        const esperado = normalizarPeriodo(periodoEsperado());
        const seleccionado = data.find((p) => p.es_actual)
          || data.find((p) => normalizarPeriodo(p.clave) === esperado)
          || data.find((p) => normalizarPeriodo(p.clave) !== 'ACTUAL')
          || data[0];
        setPeriodo(seleccionado?.clave || '');
        if (!seleccionado) setCargando(false);
      })
      .catch(() => {
        if (!vigente) return;
        setError('No se pudieron cargar los periodos. Intenta nuevamente.');
        setCargando(false);
      });
    api.get('/catalogo/carreras-opciones').then(({ data }) => setCarreras(data)).catch(() => {});

    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    if (!periodo) return undefined;
    let vigente = true;
    const qs = `?periodo=${encodeURIComponent(periodo)}`;
    setError('');
    setCargando(true);

    Promise.all([
      api.get(`/servicios-escolares/grupos${qs}`),
      api.get(`/servicios-escolares/organizacion/resumen${qs}`),
    ])
      .then(([respuestaGrupos, respuestaResumen]) => {
        if (!vigente) return;
        setGrupos(respuestaGrupos.data);
        setResumen(respuestaResumen.data);
      })
      .catch(() => {
        if (!vigente) return;
        setError('No se pudieron cargar los grupos. Intenta nuevamente.');
        setGrupos([]);
        setResumen({});
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => { vigente = false; };
  }, [periodo]);

  const abrir = async (grupo) => {
    try {
      const { data } = await api.get(`/servicios-escolares/grupos/${grupo.id}/alumnos`);
      setDetalle(grupo);
      setAlumnos(data);
    } catch {
      setError('No se pudieron cargar los alumnos del grupo.');
    }
  };

  const crearGrupo = async (evento) => {
    evento.preventDefault();
    const periodoObj = periodos.find(p => p.clave === periodo);
    if (!periodoObj) return;
    setGuardando(true); setError('');
    try {
      const { data } = await api.post('/servicios-escolares/grupos', {
        periodo_id: periodoObj.id, carrera_id: Number(formGrupo.carrera_id),
        cuatrimestre: Number(formGrupo.cuatrimestre), grupo: formGrupo.grupo,
        turno: formGrupo.turno || null, capacidad: formGrupo.capacidad ? Number(formGrupo.capacidad) : null,
      });
      setGrupos(actual => [...actual, data]); setNuevoGrupo(false);
      setFormGrupo({ carrera_id: '', cuatrimestre: '', grupo: 'A', turno: '', capacidad: '' });
      setMensaje('Grupo creado. Ya puedes agregar alumnos individualmente o por matrícula.');
    } catch (err) { setError(err.response?.data?.detail || 'No se pudo crear el grupo.'); }
    finally { setGuardando(false); }
  };

  useEffect(() => {
    if (!detalle) return undefined;
    const timer = setTimeout(() => {
      api.get(`/servicios-escolares/grupos/${detalle.id}/candidatos`, { params: { q: busqueda } })
        .then(({ data }) => setCandidatos(data)).catch(() => setCandidatos([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [detalle, busqueda]);

  const recargarDetalle = async () => {
    const { data } = await api.get(`/servicios-escolares/grupos/${detalle.id}/alumnos`);
    setAlumnos(data); setGrupos(actual => actual.map(g => g.id === detalle.id ? { ...g, total_alumnos: data.length } : g));
    const respuesta = await api.get(`/servicios-escolares/grupos/${detalle.id}/candidatos`, { params: { q: busqueda } });
    setCandidatos(respuesta.data);
  };

  const asignarSeleccionados = async () => {
    if (!seleccionados.size) return;
    setGuardando(true); setError('');
    try { await api.post(`/servicios-escolares/grupos/${detalle.id}/alumnos`, { alumno_ids: [...seleccionados] }); setSeleccionados(new Set()); await recargarDetalle(); }
    catch (err) { setError(err.response?.data?.detail || 'No se pudieron asignar los alumnos.'); }
    finally { setGuardando(false); }
  };

  const asignarMatriculas = async () => {
    const lista = matriculas.split(/[\s,;]+/).map(v => v.trim()).filter(Boolean);
    if (!lista.length) return;
    setGuardando(true); setError('');
    try {
      const { data } = await api.post(`/servicios-escolares/grupos/${detalle.id}/alumnos/matriculas`, { matriculas: lista });
      setMatriculas(''); await recargarDetalle();
      setMensaje(data.no_encontradas?.length ? `Asignados: ${data.asignados}. No encontradas: ${data.no_encontradas.join(', ')}` : `${data.asignados} alumno(s) asignado(s).`);
    } catch (err) { setError(err.response?.data?.detail || 'No se pudo procesar la lista.'); }
    finally { setGuardando(false); }
  };

  const retirar = async (alumno) => {
    try { await api.delete(`/servicios-escolares/grupos/${detalle.id}/alumnos/${alumno.id}`); await recargarDetalle(); }
    catch (err) { setError(err.response?.data?.detail || 'No se pudo retirar al alumno.'); }
  };

  const periodoSeleccionado = periodos.find((item) => item.clave === periodo);

  const establecerActual = async () => {
    if (!periodoSeleccionado || activandoPeriodo) return;
    setActivandoPeriodo(true);
    setError('');
    setMensaje('');
    try {
      const { data } = await api.patch(`/servicios-escolares/periodos/${periodoSeleccionado.id}/establecer-actual`);
      setPeriodos((actuales) => actuales.map((item) => ({
        ...item,
        es_actual: item.id === periodoSeleccionado.id,
        es_actual_configurado: item.id === periodoSeleccionado.id,
      })));
      setMensaje(data.mensaje);
      setConfirmandoPeriodo(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo establecer el periodo actual.');
    } finally {
      setActivandoPeriodo(false);
    }
  };

  const indicadores = [
    ['Grupos', resumen.grupos],
    ['Inscripciones', resumen.inscripciones_activas],
    ['Grupos vacíos', resumen.grupos_sin_alumnos],
    ['Sin grupo', resumen.alumnos_sin_grupo],
  ];

  return (
    <AdminLayout>
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Grupos e inscripciones</h1>
            <p className="text-sm text-slate-400">Crea grupos oficiales y asigna alumnos de forma individual o masiva.</p>
          </div>
          <div className="flex gap-2"><button type="button" onClick={() => setNuevoGrupo(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">+ Nuevo grupo</button><select
            className="input-dark"
            value={periodo || ''}
            disabled={periodo === null}
            onChange={(evento) => setPeriodo(evento.target.value)}
          >
            {periodo === null && <option value="">Cargando periodos...</option>}
            {periodos.map((p) => <option key={p.id} value={p.clave}>{p.clave}</option>)}
          </select></div>
        </div>

        {periodoSeleccionado && (
          <div className={`rounded-xl border px-4 py-3 ${
            periodoSeleccionado.es_actual
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-amber-500/30 bg-amber-500/10'
          }`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`font-semibold ${periodoSeleccionado.es_actual ? 'text-emerald-200' : 'text-amber-200'}`}>
                  {periodoSeleccionado.es_actual ? 'Periodo vigente' : 'Periodo histórico o de preparación'} · {periodoSeleccionado.clave}
                </p>
                <p className="text-sm text-slate-300">
                  {periodoSeleccionado.coincide_con_fecha
                    ? 'Este periodo corresponde a la fecha actual.'
                    : 'Este periodo no corresponde al bloque académico calculado para la fecha actual.'}
                </p>
              </div>
              {periodoSeleccionado.coincide_con_fecha && !periodoSeleccionado.es_actual_configurado && (
                <button
                  type="button"
                  disabled={activandoPeriodo}
                  onClick={() => setConfirmandoPeriodo(true)}
                  className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {activandoPeriodo ? 'Estableciendo…' : 'Establecer como actual'}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {indicadores.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="glass rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{cargando ? '—' : (valor ?? 0)}</p>
              <p className="text-xs text-slate-400">{etiqueta}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {mensaje && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {mensaje}
          </div>
        )}

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="p-3 text-left">Grupo</th>
                  <th className="p-3 text-left">Carrera</th>
                  <th className="p-3 text-left">Periodo</th>
                  <th className="p-3 text-right">Alumnos</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">Cargando grupos del periodo...</td>
                  </tr>
                )}
                {!cargando && grupos.length === 0 && !error && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">No hay grupos registrados en este periodo.</td>
                  </tr>
                )}
                {!cargando && grupos.map((grupo) => (
                  <tr
                    key={grupo.id}
                    onClick={() => abrir(grupo)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                  >
                    <td className="p-3 font-semibold text-white">{grupo.cuatrimestre}° {grupo.grupo}</td>
                    <td className="p-3 text-slate-300">{grupo.carrera}</td>
                    <td className="p-3 text-slate-400">{grupo.periodo}</td>
                    <td className="p-3 text-right text-emerald-400">{grupo.total_alumnos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {confirmandoPeriodo && periodoSeleccionado && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            onMouseDown={() => !activandoPeriodo && setConfirmandoPeriodo(false)}
          >
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="titulo-confirmar-periodo"
              aria-describedby="descripcion-confirmar-periodo"
              onMouseDown={(evento) => evento.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
              style={{ background: 'var(--surface-panel)', borderColor: 'var(--surface-border)' }}
            >
              <header className="flex items-start gap-4 border-b px-5 py-5" style={{ borderColor: 'var(--surface-border)' }}>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M12 9v4m0 4h.01M10.3 4.2 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-500">Cambio de periodo académico</p>
                  <h2 id="titulo-confirmar-periodo" className="mt-1 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    Establecer {periodoSeleccionado.clave} como periodo actual
                  </h2>
                  <p id="descripcion-confirmar-periodo" className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                    Confirma el cambio únicamente cuando Servicios Escolares haya concluido la preparación del nuevo cuatrimestre.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={activandoPeriodo}
                  onClick={() => setConfirmandoPeriodo(false)}
                  className="rounded-lg p-1.5 transition hover:bg-white/5 disabled:opacity-40"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Cerrar confirmación"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18"/></svg>
                </button>
              </header>

              <div className="space-y-4 px-5 py-5">
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-500">¿Qué sucederá?</p>
                  <ul className="mt-2 space-y-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <li className="flex gap-2"><span className="text-amber-500">•</span><span>La operación docente quedará habilitada para <b>{periodoSeleccionado.clave}</b>.</span></li>
                    <li className="flex gap-2"><span className="text-amber-500">•</span><span>Los demás periodos pasarán a consulta histórica y ya no permitirán correcciones ordinarias.</span></li>
                    <li className="flex gap-2"><span className="text-emerald-500">✓</span><span>No se eliminarán alumnos, clases, asistencias ni historiales anteriores.</span></li>
                  </ul>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Esta acción quedará registrada en la bitácora institucional.
                </p>
              </div>

              <footer className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end" style={{ borderColor: 'var(--surface-border)' }}>
                <button
                  type="button"
                  disabled={activandoPeriodo}
                  onClick={() => setConfirmandoPeriodo(false)}
                  className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-50"
                  style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
                >
                  Conservar configuración actual
                </button>
                <button
                  type="button"
                  disabled={activandoPeriodo}
                  onClick={establecerActual}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {activandoPeriodo ? 'Estableciendo periodo…' : `Sí, establecer ${periodoSeleccionado.clave}`}
                </button>
              </footer>
            </section>
          </div>
        )}

        {detalle && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDetalle(null)}>
            <div className="glass w-full max-w-4xl max-h-[90vh] overflow-auto p-5" onClick={(evento) => evento.stopPropagation()}>
              <div className="flex justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{detalle.cuatrimestre}° {detalle.grupo}</h2>
                  <p className="text-sm text-slate-400">{detalle.carrera} · {alumnos.length} alumnos</p>
                </div>
                <button type="button" onClick={() => setDetalle(null)} className="text-slate-400">✕</button>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <section><h3 className="mb-2 text-sm font-semibold text-white">Alumnos inscritos</h3><div className="max-h-80 divide-y divide-white/5 overflow-auto rounded-xl border border-white/10 p-3">
                {alumnos.map((alumno) => (
                  <div key={alumno.id} className="flex items-center justify-between gap-2 py-2">
                    <div><p className="text-white">{alumno.nombre}</p><p className="text-xs text-slate-500">{alumno.matricula}</p></div>
                    <button onClick={() => retirar(alumno)} className="text-xs text-red-400">Retirar</button>
                  </div>
                ))}
                {!alumnos.length && <p className="py-6 text-center text-sm text-slate-500">Grupo vacío</p>}</div></section>
                <section className="space-y-3"><h3 className="text-sm font-semibold text-white">Agregar alumnos</h3>
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-dark w-full" placeholder="Buscar matrícula o nombre" />
                  <div className="max-h-44 overflow-auto rounded-xl border border-white/10 p-2">{candidatos.map(a => <label key={a.id} className="flex cursor-pointer gap-2 border-b border-white/5 p-2 text-sm text-slate-300"><input type="checkbox" checked={seleccionados.has(a.id)} onChange={() => setSeleccionados(actual => { const next = new Set(actual); next.has(a.id) ? next.delete(a.id) : next.add(a.id); return next; })}/><span>{a.matricula} · {a.nombre}</span></label>)}</div>
                  <button disabled={!seleccionados.size || guardando} onClick={asignarSeleccionados} className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Agregar seleccionados ({seleccionados.size})</button>
                  <div className="border-t border-white/10 pt-3"><p className="mb-1 text-xs text-slate-400">Carga masiva por matrículas (separadas por coma o salto)</p><textarea value={matriculas} onChange={e => setMatriculas(e.target.value)} className="input-dark min-h-20 w-full" placeholder="20260001, 20260002"/><button disabled={!matriculas.trim() || guardando} onClick={asignarMatriculas} className="mt-2 w-full rounded-xl border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-400 disabled:opacity-40">Asignar lista</button></div>
                </section>
              </div>
            </div>
          </div>
        )}

        {nuevoGrupo && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setNuevoGrupo(false)}><form onSubmit={crearGrupo} onMouseDown={e => e.stopPropagation()} className="glass w-full max-w-lg space-y-4 p-6"><div><h2 className="text-lg font-bold text-white">Crear grupo</h2><p className="text-sm text-slate-400">{periodo}</p></div><label className="block text-sm text-slate-300">Carrera oficial<select required value={formGrupo.carrera_id} onChange={e => setFormGrupo(f => ({ ...f, carrera_id: e.target.value }))} className="input-dark mt-1 w-full"><option value="">Selecciona…</option>{carreras.map(c => <option key={c.id} value={c.id}>{c.clave} · {c.nombre}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm text-slate-300">Cuatrimestre<input required type="number" min="1" max="12" value={formGrupo.cuatrimestre} onChange={e => setFormGrupo(f => ({ ...f, cuatrimestre: e.target.value }))} className="input-dark mt-1 w-full"/></label><label className="text-sm text-slate-300">Grupo<input required value={formGrupo.grupo} onChange={e => setFormGrupo(f => ({ ...f, grupo: e.target.value.toUpperCase() }))} className="input-dark mt-1 w-full"/></label><label className="text-sm text-slate-300">Turno<input value={formGrupo.turno} onChange={e => setFormGrupo(f => ({ ...f, turno: e.target.value }))} className="input-dark mt-1 w-full" placeholder="Matutino"/></label><label className="text-sm text-slate-300">Capacidad<input type="number" min="1" max="100" value={formGrupo.capacidad} onChange={e => setFormGrupo(f => ({ ...f, capacidad: e.target.value }))} className="input-dark mt-1 w-full" placeholder="Opcional"/></label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setNuevoGrupo(false)} className="rounded-xl border border-white/10 px-4 py-2 text-slate-300">Cancelar</button><button disabled={guardando} className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Crear grupo</button></div></form></div>}
      </div>
    </AdminLayout>
  );
}
