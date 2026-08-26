import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../hooks/useApi';

const FORM_INICIAL = {
  tipo: 'OBSERVACION', categoria_reporte: 'ACADEMICO', prioridad_reporte: 'BAJA',
  titulo: '', detalle: '', canalizar_tutor: false, confidencial: false,
  fecha_limite: '', fecha_revision: '',
};

export default function ContextoAlumnoDocente({
  cargaId, alumnoId, nombre, contexto, onEnviada, compacto = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!abierto) return undefined;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflowAnterior; };
  }, [abierto]);
  if (!contexto) return null;

  const enviar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const tipo = form.canalizar_tutor ? 'TUTORIA' : form.tipo;
      const { data } = await api.post(`/docencia/seguimiento/${cargaId}/alumnos/${alumnoId}/registros`, {
        tipo,
        titulo: form.titulo.trim(),
        detalle: form.detalle.trim() || null,
        estado: form.tipo === 'ACUERDO' && !form.canalizar_tutor ? 'PENDIENTE' : 'REGISTRADO',
        fecha_limite: form.tipo === 'ACUERDO' && !form.canalizar_tutor ? form.fecha_limite : null,
        fecha_revision: form.tipo === 'ACUERDO' && !form.canalizar_tutor ? form.fecha_revision : null,
        categoria_reporte: form.categoria_reporte,
        prioridad_reporte: form.prioridad_reporte,
        confidencial: form.confidencial,
      });
      setAbierto(false);
      setForm(FORM_INICIAL);
      onEnviada?.(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo registrar el seguimiento.');
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
          + Reportar
        </button>
      </div>

      {abierto && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={() => !guardando && setAbierto(false)}>
          <form onSubmit={enviar} onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-900 shadow-2xl sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl">
            <header className="flex shrink-0 items-start justify-between border-b border-white/10 bg-slate-900 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">Registrar seguimiento</h2>
                <p className="mt-1 text-xs text-slate-400">{nombre} · Registra hechos y acciones concretas.</p>
              </div>
              <button type="button" aria-label="Cerrar" disabled={guardando} onClick={() => setAbierto(false)} className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl text-slate-400 hover:bg-white/5 hover:text-white">×</button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 overscroll-contain">
              <label className="block text-sm text-slate-300">Tipo de registro
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, fecha_limite: '', fecha_revision: '' })} className="input-dark mt-1">
                  <option value="OBSERVACION">Observación o incidencia</option>
                  <option value="ACUERDO">Acuerdo con el alumno</option>
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-300">Categoría
                  <select value={form.categoria_reporte} onChange={(e) => setForm({ ...form, categoria_reporte: e.target.value })} className="input-dark mt-1">
                    <option value="ACADEMICO">Académico, participación o logro</option>
                    <option value="ASISTENCIA">Asistencia recurrente</option>
                    <option value="CONDUCTA">Conducta o convivencia</option>
                    <option value="PERSONAL">Situación personal</option>
                    <option value="OTRO">Otra situación</option>
                  </select>
                </label>
                <label className="text-sm text-slate-300">Prioridad
                  <select value={form.prioridad_reporte} onChange={(e) => setForm({ ...form, prioridad_reporte: e.target.value })} className="input-dark mt-1">
                    <option value="BAJA">Informativo</option>
                    <option value="MEDIA">Requiere seguimiento</option>
                    <option value="ALTA">Urgente</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm text-slate-300">Título
                <input required minLength={2} maxLength={180} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="input-dark mt-1" placeholder="Resumen breve de lo ocurrido" />
              </label>
              {form.tipo === 'ACUERDO' && !form.canalizar_tutor && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-300">Fecha límite
                  <input required type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} className="input-dark mt-1" />
                </label>
                <label className="text-sm text-slate-300">Fecha de revisión
                  <input required type="date" min={form.fecha_limite || undefined} value={form.fecha_revision} onChange={(e) => setForm({ ...form, fecha_revision: e.target.value })} className="input-dark mt-1" />
                </label>
              </div>}
              <label className="block text-sm text-slate-300">Detalle
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={form.detalle}
                  onChange={(e) => setForm({ ...form, detalle: e.target.value })}
                  className="input-dark mt-1"
                  placeholder="Describe únicamente hechos observables, acciones realizadas o acuerdos."
                />
              </label>
              <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3">
                <label className="flex items-start gap-3 text-sm text-slate-200">
                  <input type="checkbox" className="mt-1" checked={form.canalizar_tutor} onChange={(e) => setForm({ ...form, canalizar_tutor: e.target.checked })} />
                  <span><b>Canalizar al tutor del grupo</b><span className="mt-1 block text-xs font-normal text-slate-400">Si el grupo no tiene tutor, se enviará al Responsable de Tutoría.</span></span>
                </label>
                {form.canalizar_tutor && <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={form.confidencial} onChange={(e) => setForm({ ...form, confidencial: e.target.checked })} />
                  Contiene información sensible
                </label>}
              </div>
              <p className="text-xs text-slate-500">El registro quedará vinculado automáticamente con esta materia, grupo, docente y alumno.</p>
              {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
            </div>
            <footer className="flex shrink-0 gap-3 border-t border-white/10 bg-slate-900 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" disabled={guardando} onClick={() => setAbierto(false)} className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-300">Cancelar</button>
              <button disabled={guardando || form.titulo.trim().length < 2} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Guardando…' : form.canalizar_tutor ? 'Guardar y canalizar' : 'Guardar seguimiento'}</button>
            </footer>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
