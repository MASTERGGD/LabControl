import { useState } from 'react';
import api from '../hooks/useApi';

const FORM_INICIAL = { senal: 'INASISTENCIA', nivel: 'ATENCION', comentario: '' };

export default function ContextoAlumnoDocente({
  cargaId, alumnoId, nombre, contexto, onEnviada, compacto = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  if (!contexto) return null;

  const enviar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const { data } = await api.post(
        `/docencia/seguimiento/${cargaId}/alumnos/${alumnoId}/alerta-temprana`,
        { ...form, comentario: form.comentario.trim() || null },
      );
      setAbierto(false);
      setForm(FORM_INICIAL);
      onEnviada?.(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo enviar la alerta temprana.');
    } finally {
      setGuardando(false);
    }
  };

  const tieneIndicadores = contexto.canalizacion_activa || contexto.riesgo_global || contexto.seguimiento_activo;

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1.5 ${compacto ? 'mt-1.5' : ''}`}>
        {contexto.canalizacion_activa && <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-blue-300">Canalización activa</span>}
        {contexto.riesgo_global && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-300">Riesgo global</span>}
        {contexto.seguimiento_activo && <span className="rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-semibold text-violet-300">En seguimiento</span>}
        {!tieneIndicadores && !compacto && <span className="text-xs text-emerald-400">Sin alertas institucionales activas</span>}
        <button
          type="button"
          onClick={() => { setError(''); setAbierto(true); }}
          className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/15"
        >
          + Alerta temprana
        </button>
      </div>

      {abierto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => !guardando && setAbierto(false)}>
          <form onSubmit={enviar} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">Enviar alerta temprana</h2>
                <p className="mt-1 text-xs text-slate-400">{nombre} · Se enviará al tutor asignado.</p>
              </div>
              <button type="button" disabled={guardando} onClick={() => setAbierto(false)} className="text-2xl text-slate-400">×</button>
            </header>
            <div className="space-y-4 p-5">
              {contexto.alerta_reciente && (
                <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-xs text-blue-200">
                  Ya enviaste una alerta reciente con estado {contexto.alerta_reciente.estado}. El sistema evitará duplicados de la misma categoría durante siete días.
                </div>
              )}
              <label className="block text-sm text-slate-300">Señal observada
                <select value={form.senal} onChange={(e) => setForm({ ...form, senal: e.target.value })} className="input-dark mt-1">
                  <option value="INASISTENCIA">Inasistencia</option>
                  <option value="BAJO_DESEMPENO">Bajo desempeño</option>
                  <option value="CAMBIO_CONDUCTA">Cambio de conducta</option>
                  <option value="FALTA_PARTICIPACION">Falta de participación</option>
                  <option value="SITUACION_PERSONAL">Posible situación personal</option>
                  <option value="OTRO">Otra señal</option>
                </select>
              </label>
              <label className="block text-sm text-slate-300">Nivel
                <select value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value })} className="input-dark mt-1">
                  <option value="OBSERVACION">Observación</option>
                  <option value="ATENCION">Requiere atención</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </label>
              <label className="block text-sm text-slate-300">Comentario {['OTRO', 'URGENTE'].includes(form.senal) || form.nivel === 'URGENTE' ? '*' : '(opcional)'}
                <textarea
                  rows={3}
                  maxLength={1000}
                  required={form.senal === 'OTRO' || form.nivel === 'URGENTE'}
                  value={form.comentario}
                  onChange={(e) => setForm({ ...form, comentario: e.target.value })}
                  className="input-dark mt-1"
                  placeholder="Describe únicamente lo observado, sin diagnósticos ni suposiciones."
                />
              </label>
              <p className="text-xs text-slate-500">El tutor recibirá el contexto de la materia, fecha y docente. Esta acción no revela ni solicita información confidencial del alumno.</p>
              {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
            </div>
            <footer className="flex gap-3 border-t border-white/10 px-5 py-4">
              <button type="button" disabled={guardando} onClick={() => setAbierto(false)} className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-300">Cancelar</button>
              <button disabled={guardando} className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Enviando…' : 'Enviar al tutor'}</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
