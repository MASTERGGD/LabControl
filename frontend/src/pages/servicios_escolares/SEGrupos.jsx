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
            <p className="text-sm text-slate-400">Organización académica generada desde la carga de alumnos.</p>
          </div>
          <select
            className="input-dark"
            value={periodo || ''}
            disabled={periodo === null}
            onChange={(evento) => setPeriodo(evento.target.value)}
          >
            {periodo === null && <option value="">Cargando periodos...</option>}
            {periodos.map((p) => <option key={p.id} value={p.clave}>{p.clave}</option>)}
          </select>
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
            <div className="glass w-full max-w-2xl max-h-[80vh] overflow-auto p-5" onClick={(evento) => evento.stopPropagation()}>
              <div className="flex justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{detalle.cuatrimestre}° {detalle.grupo}</h2>
                  <p className="text-sm text-slate-400">{detalle.carrera} · {alumnos.length} alumnos</p>
                </div>
                <button type="button" onClick={() => setDetalle(null)} className="text-slate-400">✕</button>
              </div>
              <div className="mt-4 divide-y divide-white/5">
                {alumnos.map((alumno) => (
                  <div key={alumno.id} className="py-2">
                    <p className="text-white">{alumno.nombre}</p>
                    <p className="text-xs text-slate-500">{alumno.matricula}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
