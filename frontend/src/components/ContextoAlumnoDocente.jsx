import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../hooks/useApi';

const FORM_INICIAL = {
  tipo: 'OBSERVACION', categoria_reporte: 'ACADEMICO', prioridad_reporte: '',
  titulo: '', detalle: '', canalizar_tutor: false, confidencial: false,
  fecha_limite: '', fecha_revision: '', solicitar_reunion: false,
};
const MOTIVOS_REPORTE = [
  ['RIESGO_REPROBACION', 'Riesgo de reprobación', 'ACADEMICO'],
  ['BAJO_DESEMPENO', 'Bajo desempeño académico', 'ACADEMICO'],
  ['REGULARIZACION', 'Regularización académica', 'ACADEMICO'],
  ['INASISTENCIAS', 'Inasistencias recurrentes', 'ASISTENCIA'],
  ['CONDUCTA', 'Conducta o convivencia', 'CONDUCTA'],
  ['SITUACION_PERSONAL', 'Situación personal', 'PERSONAL'],
  ['OTRO', 'Otra situación', 'OTRO'],
];

export default function ContextoAlumnoDocente({
  cargaId, alumnoId, nombre, contexto, onEnviada, compacto = false, permitirNota = true,
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
        solicitar_reunion: form.solicitar_reunion,
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

  const tieneIndicadores = contexto.canalizacion_activa || contexto.riesgo_materia || contexto.seguimiento_activo;
  const motivosRiesgo = contexto.motivos_riesgo || [];
  const etiquetaRiesgo = motivosRiesgo.length === 1
    ? motivosRiesgo[0] === 'ASISTENCIA' ? 'Asistencia baja en tu materia' : 'Bajo desempeño en tu materia'
    : 'Riesgo en tu materia';

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1.5 ${compacto ? 'mt-1.5' : ''}`}>
        {contexto.canalizacion_activa && <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-blue-300">Canalización activa</span>}
        {contexto.riesgo_materia && (
          <span title="Este indicador se calcula únicamente con tus clases y seguimientos de esta materia." className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-300">
            {etiquetaRiesgo}
          </span>
        )}
        {contexto.seguimiento_activo && <span className="rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-semibold text-violet-300">En seguimiento</span>}
        {!tieneIndicadores && !compacto && <span className="text-xs text-emerald-400">Sin alertas institucionales activas</span>}
        {permitirNota && (
          <button
            type="button"
            onClick={() => { setError(''); setAbierto(true); }}
            className="rounded-lg border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            + Seguimiento del alumno
          </button>
        )}
      </div>

      {permitirNota && abierto && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={() => !guardando && setAbierto(false)}>
          <form
            onSubmit={enviar}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl border shadow-2xl sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl"
            style={{ background: 'var(--surface-panel)', borderColor: 'var(--surface-border)' }}
          >
            <header className="theme-divider flex shrink-0 items-start justify-between border-b px-5 py-4" style={{ background: 'var(--surface-panel)' }}>
              <div>
                <h2 className="theme-title font-semibold">Seguimiento del alumno</h2>
                <p className="theme-muted mt-1 text-xs">{nombre} · Se guardará con la fecha y hora actuales en el historial de la materia.</p>
              </div>
              <button type="button" aria-label="Cerrar" disabled={guardando} onClick={() => setAbierto(false)} className="theme-muted -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl hover:bg-black/5">×</button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 overscroll-contain">
              <label className="block text-sm text-slate-300">Tipo de registro
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, fecha_limite: '', fecha_revision: '' })} className="input-dark mt-1">
                  <option value="OBSERVACION">Nota informativa</option>
                  <option value="ACUERDO">Acuerdo con el alumno</option>
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-300">Motivo del registro *
                  <select required value={form.titulo} onChange={(e) => {
                    const motivo = MOTIVOS_REPORTE.find(([, etiqueta]) => etiqueta === e.target.value);
                    setForm({ ...form, titulo: e.target.value, categoria_reporte: motivo?.[2] || 'OTRO' });
                  }} className="input-dark mt-1">
                    <option value="">Selecciona un motivo</option>
                    {MOTIVOS_REPORTE.map(([clave, etiqueta]) => <option key={clave} value={etiqueta}>{etiqueta}</option>)}
                  </select>
                </label>
                <label className="text-sm text-slate-300">Prioridad *
                  <select value={form.prioridad_reporte} onChange={(e) => setForm({ ...form, prioridad_reporte: e.target.value })} className="input-dark mt-1">
                    <option value="">Selecciona una prioridad</option>
                    <option value="BAJA">Informativo</option>
                    <option value="MEDIA">Requiere seguimiento</option>
                    <option value="ALTA">Urgente</option>
                  </select>
                </label>
              </div>
              {form.tipo === 'ACUERDO' && !form.canalizar_tutor && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-300">Fecha límite
                  <input required type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} className="input-dark mt-1" />
                </label>
                <label className="text-sm text-slate-300">Fecha de revisión
                  <input required type="date" min={form.fecha_limite || undefined} value={form.fecha_revision} onChange={(e) => setForm({ ...form, fecha_revision: e.target.value })} className="input-dark mt-1" />
                </label>
              </div>}
              <label className="block text-sm text-slate-300">¿Qué observaste y qué acción realizaste con el alumno? {form.canalizar_tutor && '*'}
                <textarea
                  required={form.canalizar_tutor}
                  rows={4}
                  minLength={form.canalizar_tutor ? 5 : undefined}
                  maxLength={800}
                  spellCheck="true"
                  value={form.detalle}
                  onChange={(e) => setForm({ ...form, detalle: e.target.value })}
                  className="input-dark mt-1"
                  placeholder="Describe únicamente hechos observables, acciones realizadas o acuerdos."
                />
                <span className={`mt-1 block text-right text-xs ${form.detalle.length >= 650 ? 'text-amber-400' : 'text-slate-500'}`}>{form.detalle.length}/800</span>
              </label>
              {form.detalle.length >= 650 && <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2 text-xs text-blue-200"><p>Si el caso requiere más contexto, registra aquí un resumen factual.</p>{form.canalizar_tutor && <label className="mt-2 flex items-center gap-2 font-semibold"><input type="checkbox" checked={form.solicitar_reunion} onChange={e => setForm({ ...form, solicitar_reunion: e.target.checked })} />Solicitar una reunión rastreable con el tutor</label>}</div>}
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs" style={{ color: 'var(--accent-warning-ui)' }}>Revisa la redacción antes de guardar: este texto formará parte del registro institucional. Los problemas de inscripción deben comunicarse a Servicios Escolares.</p>
              <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3">
                <label className="flex items-start gap-3 text-sm text-slate-200">
                  <input type="checkbox" className="mt-1" checked={form.canalizar_tutor} onChange={(e) => setForm({ ...form, canalizar_tutor: e.target.checked })} />
                  <span><b>Notificar al tutor del grupo</b><span className="mt-1 block text-xs font-normal text-slate-400">Si el grupo no tiene tutor, se enviará al Responsable de Tutoría.</span></span>
                </label>
                {form.canalizar_tutor && <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={form.confidencial} onChange={(e) => setForm({ ...form, confidencial: e.target.checked })} />
                  Contiene información sensible
                </label>}
              </div>
              <p className="text-xs text-slate-500">El registro quedará vinculado automáticamente con esta materia, grupo, docente y alumno.</p>
              {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
            </div>
            <footer className="theme-divider flex shrink-0 gap-3 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ background: 'var(--surface-panel)' }}>
              <button type="button" disabled={guardando} onClick={() => setAbierto(false)} className="theme-text flex-1 rounded-xl border px-4 py-2.5 text-sm" style={{ background: 'var(--surface-panel-soft)', borderColor: 'var(--surface-border)' }}>Cancelar</button>
              <button disabled={guardando || form.titulo.trim().length < 2 || !form.prioridad_reporte || (form.canalizar_tutor && form.detalle.trim().length < 5)} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-700 disabled:text-slate-500">{guardando ? 'Guardando…' : form.canalizar_tutor ? 'Guardar y notificar' : 'Guardar nota'}</button>
            </footer>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
