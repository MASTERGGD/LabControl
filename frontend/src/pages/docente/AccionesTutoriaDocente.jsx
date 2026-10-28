import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { formatDateInMexico } from '../../utils/timezone';

const estadoAccion = {
  PENDIENTE: ['Pendiente', 'border-amber-500/30 bg-amber-500/10 text-amber-200'],
  ATENDIDA: ['Atendida', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'],
  CANCELADA: ['Cancelada', 'border-slate-500/30 bg-slate-500/10 text-slate-300'],
};

export default function AccionesTutoriaDocente() {
  const [searchParams] = useSearchParams();
  const [reportes, setReportes] = useState([]);
  const [respuestas, setRespuestas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/tutoria/reportes-tutor?bandeja=ENVIADOS');
      setReportes(data.filter(reporte => (reporte.acciones_docente || []).length));
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudieron cargar las solicitudes de Tutoría.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const accionesPendientes = useMemo(() => reportes.flatMap(reporte =>
    (reporte.acciones_docente || []).filter(accion => accion.estado === 'PENDIENTE')
  ), [reportes]);

  const responder = async (reporte, accion) => {
    const respuesta = (respuestas[accion.id] || '').trim();
    if (respuesta.length < 5) return;
    setGuardando(accion.id);
    setError('');
    setMensaje('');
    try {
      await api.post(`/tutoria/reportes-tutor/acciones/${accion.id}/respuesta`, { respuesta });
      setRespuestas(actual => ({ ...actual, [accion.id]: '' }));
      setMensaje(`Se registró tu respuesta para “${reporte.titulo}”.`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo registrar la respuesta.');
    } finally { setGuardando(null); }
  };

  const reporteSeleccionado = Number(searchParams.get('reporte'));

  return <AdminLayout>
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Tutoría · Colaboración docente</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Acciones solicitadas por Tutoría</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Aquí aparecen las acciones concretas que el Responsable de Tutoría te asignó a partir de tus reportes. Registra qué hiciste para que quede en el historial del caso.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{accionesPendientes.length}</p><p className="text-sm text-slate-400">Acciones pendientes</p></div>
        <div className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{reportes.length}</p><p className="text-sm text-slate-400">Reportes con indicaciones de Tutoría</p></div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}<button type="button" onClick={cargar} className="ml-2 font-semibold underline">Reintentar</button></div>}
      {mensaje && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{mensaje}</div>}
      {cargando && <p className="py-8 text-center text-sm text-slate-400">Cargando acciones…</p>}
      {!cargando && !reportes.length && !error && <section className="glass rounded-2xl p-8 text-center"><h2 className="font-semibold text-white">No tienes acciones pendientes</h2><p className="mt-2 text-sm text-slate-400">Cuando Tutoría solicite una actividad a partir de uno de tus reportes, aparecerá aquí y recibirás una notificación.</p></section>}

      <div className="space-y-4">
        {reportes.map(reporte => <article key={reporte.id} id={`reporte-${reporte.id}`} className={`glass scroll-mt-6 rounded-2xl border p-4 sm:p-5 ${reporteSeleccionado === reporte.id ? 'border-emerald-500/60' : 'border-white/10'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="min-w-0">
              <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-200">{reporte.categoria || 'Tutoría'}</span>
              <h2 className="mt-2 font-semibold text-white">{reporte.titulo}</h2>
              <p className="mt-1 text-sm text-slate-300">{reporte.es_reporte_grupal ? `${reporte.alumno_nombre} · Grupo ${reporte.grupo || 'sin identificar'}` : `${reporte.alumno_nombre} · ${reporte.matricula}`}</p>
              <p className="mt-1 text-xs text-slate-500">{reporte.materia || 'Materia no especificada'} · Estado del caso: {reporte.estado?.replaceAll('_', ' ').toLocaleLowerCase('es-MX')}</p>
            </div>
            <span className="text-xs text-slate-500">{reporte.creado_en ? formatDateInMexico(reporte.creado_en) : ''}</span>
          </div>

          <div className="mt-4 space-y-3">
            {reporte.acciones_docente.map(accion => {
              const [label, cls] = estadoAccion[accion.estado] || estadoAccion.PENDIENTE;
              return <section key={accion.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">Indicación de Tutoría</h3>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{accion.instruccion}</p>
                <p className="mt-2 text-xs text-slate-500">Solicitó: {accion.solicitada_por || 'Responsable de Tutoría'}{accion.fecha_limite ? ` · Fecha límite: ${new Date(`${accion.fecha_limite}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' })}` : ''}</p>
                {accion.estado === 'PENDIENTE' && <div className="mt-3 space-y-2">
                  <label htmlFor={`respuesta-${accion.id}`} className="block text-sm font-medium text-slate-300">Resultado de la acción</label>
                  <textarea id={`respuesta-${accion.id}`} rows={3} maxLength={2000} value={respuestas[accion.id] || ''} onChange={e => setRespuestas(actual => ({ ...actual, [accion.id]: e.target.value }))} className="input-dark w-full" placeholder="Describe brevemente la actividad realizada o el seguimiento acordado." />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">La respuesta quedará registrada y se notificará a quien solicitó la acción.</p>
                    <button type="button" disabled={guardando === accion.id || (respuestas[accion.id] || '').trim().length < 5} onClick={() => responder(reporte, accion)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">{guardando === accion.id ? 'Guardando…' : 'Registrar respuesta'}</button>
                  </div>
                </div>}
                {accion.respuesta && <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] p-3"><p className="text-xs font-semibold text-emerald-300">Tu respuesta</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{accion.respuesta}</p></div>}
              </section>;
            })}
          </div>
        </article>)}
      </div>
    </main>
  </AdminLayout>;
}
