import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const ESTADOS = {
  CLASE: ['En clase', 'bg-emerald-500/15 text-emerald-300'],
  TUTORIA: ['En tutoría', 'bg-blue-500/15 text-blue-300'],
  RECESO: ['En receso', 'bg-amber-500/15 text-amber-300'],
  DESCARGA: ['En descarga académica', 'bg-violet-500/15 text-violet-300'],
  OTRA: ['En otra actividad', 'bg-slate-500/15 text-slate-300'],
  SIN_ACTIVIDAD: ['Sin actividad registrada ahora', 'bg-slate-500/15 text-slate-300'],
};

function DetalleActividad({ actividad, siguiente = false }) {
  if (!actividad) return null;
  const esPrivada = ['RECESO', 'DESCARGA'].includes(actividad.tipo_actividad);
  return (
    <div className={`mt-4 rounded-xl border p-4 ${siguiente ? 'border-white/10 bg-white/[0.025]' : 'border-emerald-500/20 bg-emerald-500/[0.06]'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{siguiente ? 'Siguiente actividad' : 'Ubicación programada'}</p>
      <p className="mt-1 text-sm font-semibold text-white">{actividad.actividad}</p>
      <p className="mt-1 text-xs text-slate-400">{actividad.hora_inicio}–{actividad.hora_fin}</p>
      {!esPrivada && (actividad.grupo || actividad.salon) && (
        <p className="mt-2 text-sm text-slate-300">
          {[actividad.grupo && `Grupo ${actividad.grupo}`, actividad.salon].filter(Boolean).join(' · ')}
        </p>
      )}
      {esPrivada && <p className="mt-2 text-xs text-slate-500">Por privacidad, este tipo de actividad no muestra una ubicación.</p>}
    </div>
  );
}

export default function BuscarDocente() {
  const [termino, setTermino] = useState('');
  const [respuesta, setRespuesta] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const buscar = async (evento) => {
    evento.preventDefault();
    const limpio = termino.trim();
    if (limpio.length < 2) {
      setError('Escribe al menos 2 caracteres del nombre.');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/docencia/ubicacion-docentes', { params: { q: limpio } });
      setRespuesta(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No fue posible consultar el horario.');
      setRespuesta(null);
    } finally {
      setCargando(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Consulta entre docentes</p>
          <h1 className="mt-1 text-2xl font-bold text-white">¿Dónde está un docente?</h1>
          <p className="mt-2 text-sm text-slate-400">Consulta su ubicación estimada según el horario oficial. No representa ubicación en tiempo real.</p>
        </header>

        <form onSubmit={buscar} className="glass rounded-2xl p-4 sm:p-5">
          <label htmlFor="buscar-docente" className="text-sm font-semibold text-slate-300">Nombre del docente</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input id="buscar-docente" value={termino} onChange={(e) => setTermino(e.target.value)} autoComplete="off" placeholder="Ej. María López" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50" />
            <button disabled={cargando} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{cargando ? 'Buscando…' : 'Buscar'}</button>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        </form>

        {respuesta && (
          <section className="space-y-3" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-300">{respuesta.resultados.length} resultado{respuesta.resultados.length === 1 ? '' : 's'}</h2>
              <p className="text-xs text-slate-500">Consulta de las {respuesta.hora_consulta} h{respuesta.periodo ? ` · ${respuesta.periodo}` : ''}</p>
            </div>
            {!respuesta.resultados.length && <div className="glass rounded-2xl p-8 text-center text-sm text-slate-400">No se encontró un docente activo con ese nombre.</div>}
            {respuesta.resultados.map((docente) => {
              const estado = ESTADOS[docente.estado] || ESTADOS.SIN_ACTIVIDAD;
              return (
                <article key={docente.docente_id} className="glass rounded-2xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-lg font-bold text-white">{docente.nombre}</p><p className="mt-1 text-xs text-slate-500">Información basada en el horario registrado</p></div>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${estado[1]}`}>{estado[0]}</span>
                  </div>
                  <DetalleActividad actividad={docente.actividad_actual} />
                  {!docente.actividad_actual && docente.siguiente_actividad && <DetalleActividad actividad={docente.siguiente_actividad} siguiente />}
                  {!docente.actividad_actual && !docente.siguiente_actividad && <p className="mt-4 text-sm text-slate-500">No tiene más actividades registradas para hoy.</p>}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
