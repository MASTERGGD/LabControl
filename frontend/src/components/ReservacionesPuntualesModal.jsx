import React, { useState } from 'react';
import api from '../hooks/useApi';

const fechaLabel = value => {
  if (!value) return 'Fecha por confirmar';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

export default function ReservacionesPuntualesModal({ slot, esPersonalLaboratorio = false, onClose, onActualizada }) {
  const [seleccionada, setSeleccionada] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState('');
  const reservas = slot.reservaciones_puntuales || [];

  const cancelar = async () => {
    if (!seleccionada || (esPersonalLaboratorio && motivo.trim().length < 5)) return;
    setCancelando(true);
    setError('');
    try {
      await api.delete(`/horarios/reservaciones/${seleccionada.id}`, {
        data: { motivo: motivo.trim() || undefined },
      });
      onActualizada();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cancelar la sesión.');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-semibold text-white">Sesiones de fecha única</h2>
            <p className="text-sm text-slate-400">{slot.dia_nombre} · {slot.hora_inicio}–{slot.hora_fin}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl text-slate-400 hover:text-white">×</button>
        </header>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          {reservas.map(reserva => (
            <article key={reserva.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">{fechaLabel(reserva.fecha_actividad)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">
                Sesión completa · {reserva.hora_inicio_sesion || reserva.hora_inicio}–{reserva.hora_fin_sesion || reserva.hora_fin}
              </p>
              <p className="mt-1 font-semibold text-white">{reserva.materia}</p>
              <p className="text-sm text-slate-300">Grupo {reserva.grupo}</p>
              {reserva.bloque_reserva_id && (reserva.hora_inicio_sesion !== reserva.hora_inicio || reserva.hora_fin_sesion !== reserva.hora_fin) && (
                <p className="mt-1 text-xs text-slate-400">Al cancelar se liberarán todos los bloques consecutivos de esta sesión.</p>
              )}
              {reserva.puede_cancelar ? (
                <button type="button" onClick={() => { setSeleccionada(reserva); setMotivo(''); setError(''); }}
                  className="mt-3 rounded-lg border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10">
                  Cancelar esta sesión
                </button>
              ) : <p className="mt-3 text-xs text-slate-500">Reservada por otro docente</p>}
            </article>
          ))}
          {seleccionada && (
            <div className="space-y-3 rounded-xl border border-red-400/30 bg-red-500/5 p-4">
              <p className="text-sm text-slate-200">
                ¿Cancelar la sesión completa de <strong>{seleccionada.materia}</strong> del {fechaLabel(seleccionada.fecha_actividad)}?
                <span className="mt-1 block text-xs text-slate-400">
                  Se liberará el horario de {seleccionada.hora_inicio_sesion || seleccionada.hora_inicio} a {seleccionada.hora_fin_sesion || seleccionada.hora_fin} en una sola acción.
                </span>
              </p>
              <label className="block text-xs text-slate-400">
                Motivo {esPersonalLaboratorio ? '(obligatorio)' : '(opcional)'}
                <textarea rows={2} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)}
                  className="input-dark mt-1 w-full" placeholder={esPersonalLaboratorio ? 'Describe brevemente el motivo (mínimo 5 caracteres)' : 'Registra el motivo de la cancelación'} />
              </label>
              {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setSeleccionada(null)} className="btn-ghost flex-1 py-2 text-sm">Volver</button>
                <button type="button" onClick={cancelar} disabled={cancelando || (esPersonalLaboratorio && motivo.trim().length < 5)}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {cancelando ? 'Cancelando…' : 'Cancelar sesión completa'}
                </button>
              </div>
            </div>
          )}
          {!reservas.length && <p className="text-sm text-slate-400">No hay sesiones activas en este horario.</p>}
        </div>
        <footer className="border-t border-white/10 p-4"><button type="button" onClick={onClose} className="btn-ghost w-full py-2 text-sm">Cerrar</button></footer>
      </div>
    </div>
  );
}
