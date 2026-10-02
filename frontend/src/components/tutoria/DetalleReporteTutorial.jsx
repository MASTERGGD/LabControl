import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fecha, nombreAlumno } from './casosTutoriales';
import './DetalleReporteTutorial.css';

export function ModalTutorial({ children, onClose, tituloId, isDay, compacto = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('[data-dialog-heading]')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  return createPortal(<dialog ref={ref} aria-labelledby={tituloId}
    className={`tutorial-detail ${isDay ? 'is-day' : ''} ${compacto ? 'is-compact' : ''}`}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => {
      if (e.target !== e.currentTarget) return;
      const bounds = e.currentTarget.getBoundingClientRect();
      if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) onClose();
    }}>
    {children}
  </dialog>, document.body);
}

const fechaTexto = valor => fecha(valor)?.toLocaleString('es-MX', {
  timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short',
}) || 'Sin fecha';

export default function DetalleReporteTutorial({ reporte: r, estado, prioridad, isDay, grupos,
  asignacion, onAsignacion, onAsignar, onRecordar, onCerrarReporte, onClose }) {
  const [reasignar, setReasignar] = useState(!r.tutor_destinatario);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const accionesRef = useRef(null);
  const asignacionRef = useRef(null);
  useEffect(() => {
    if (reasignar) {
      asignacionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      asignacionRef.current?.querySelector('select')?.focus({ preventScroll: true });
    }
  }, [reasignar]);
  const cerrado = ['CERRADO', 'CERRADO_ADMINISTRATIVO', 'ATENDIDO', 'CANALIZADO'].includes(r.estado);
  const reciente = fecha(r.ultimo_recordatorio_en) && Date.now() - fecha(r.ultimo_recordatorio_en).getTime() < 48 * 3600000;
  const ejecutar = async accion => {
    setOcupado(true);
    setError('');
    try {
      const resultado = await accion();
      if (resultado?.error) setError(resultado.error);
    } catch {
      setError('No se pudo completar la acción. Vuelve a intentarlo.');
    } finally { setOcupado(false); }
  };
  const eventos = [
    ['creado_en', 'Enviado'], ['recibido_en', 'Visto por el tutor'],
    ['ultimo_recordatorio_en', 'Recordatorio enviado'], ['reasignado_en', 'Reasignado'],
    ['cerrado_en', estado.label],
  ].filter(([campo]) => r[campo]).sort(([a], [b]) => fecha(r[a]) - fecha(r[b]));

  return <ModalTutorial tituloId="detalle-tutorial-titulo" onClose={onClose} isDay={isDay}>
    <header className="tutorial-detail-header">
      <div className="min-w-0">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${estado.cls}`}>{estado.label}</span>
        <h2 id="detalle-tutorial-titulo" data-dialog-heading tabIndex={-1} className="mt-2 text-xl font-semibold sm:text-2xl">
          {r.es_reporte_grupal ? r.alumno_nombre : nombreAlumno(r.alumno_nombre)}
        </h2>
        <p className="tutorial-muted mt-1 text-sm">{[r.matricula, r.materia].filter(Boolean).join(' · ')}</p>
      </div>
      <button type="button" onClick={onClose} className="tutorial-secondary shrink-0" aria-label="Cerrar detalle">✕</button>
    </header>
    <div className="tutorial-detail-body">
      <div className="tutorial-detail-columns">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="detalle-motivo">
            <h3 id="detalle-motivo" className="tutorial-muted text-xs font-semibold uppercase tracking-wide">Motivo del reporte</h3>
            <p className="mt-2 text-lg font-semibold">{r.titulo}</p>
            <p className="tutorial-copy mt-4 whitespace-pre-wrap text-sm leading-7">{r.detalle || 'Sin descripción adicional.'}</p>
          </section>
          <section className="tutorial-result rounded-xl border p-4" aria-labelledby="detalle-resultado">
            <h3 id="detalle-resultado" className="font-semibold">{r.resultado ? 'Resultado registrado' : 'Resultado de la atención'}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{r.resultado || 'Este reporte aún no tiene un resultado registrado.'}</p>
          </section>
        </div>
        <aside className="tutorial-context min-w-0 space-y-6" aria-label="Datos y trazabilidad del reporte">
          <section>
            <h3 className="text-sm font-semibold">Datos del reporte</h3>
            <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-1">
              {[
                ['Reportó', r.reportado_por || 'Sin registro'], ['Tutor actual', r.tutor_destinatario || 'Sin asignar'],
                ['Fecha de envío', fechaTexto(r.creado_en)], ['Prioridad', r.prioridad_confirmada ? prioridad : 'No confirmada (registro histórico)'],
              ].map(([label, value]) => <div key={label}><dt className="tutorial-muted text-xs">{label}</dt><dd className="mt-1">{value}</dd></div>)}
            </dl>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Trazabilidad</h3>
            <ol className="tutorial-timeline mt-4 space-y-4 border-l pl-4 text-sm">
              {eventos.map(([campo, label]) => <li key={campo}><p className="font-medium">{label}</p><time className="tutorial-muted mt-1 block text-xs" dateTime={fecha(r[campo])?.toISOString()}>{fechaTexto(r[campo])}</time></li>)}
            </ol>
          </section>
        </aside>
      </div>
      {!cerrado && reasignar && <section ref={asignacionRef} className="tutorial-assignment mt-6 rounded-xl border p-4" aria-labelledby="asignacion-titulo">
        <h3 id="asignacion-titulo" className="text-sm font-semibold">{r.tutor_destinatario ? 'Reasignar atención' : 'Asignar tutor'}</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm">Grupo y tutor
            <select className="tutorial-select mt-1 w-full rounded-lg border p-2.5" value={asignacion || ''} disabled={ocupado} onChange={e => onAsignacion(e.target.value)}>
              <option value="">Seleccionar grupo y tutor</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.grupo} · {g.tutor_nombre}</option>)}
            </select>
          </label>
          <button type="button" className="tutorial-primary" disabled={ocupado || !asignacion} onClick={() => ejecutar(onAsignar)}>{ocupado ? 'Guardando…' : r.tutor_destinatario ? 'Confirmar reasignación' : 'Asignar tutor'}</button>
          {r.tutor_destinatario && <button type="button" className="tutorial-secondary" disabled={ocupado} onClick={() => setReasignar(false)}>Cancelar</button>}
        </div>
      </section>}
    </div>
    <footer className="tutorial-detail-footer">
      {error && <p role="alert" className="w-full rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p>}
      <button type="button" className="tutorial-secondary" onClick={onClose}>Listo</button>
      {!cerrado && <div className="flex flex-wrap items-center justify-end gap-2">
        <details ref={accionesRef} className="tutorial-more">
          <summary className="tutorial-secondary cursor-pointer">Más acciones</summary>
          <div className="tutorial-more-options rounded-xl border p-2 shadow-xl">
            {r.tutor_destinatario && <button type="button" disabled={ocupado} onClick={() => {
              setReasignar(true); accionesRef.current.open = false;
            }}>Reasignar tutor</button>}
            <button type="button" disabled={ocupado} onClick={onCerrarReporte}>Cierre administrativo</button>
          </div>
        </details>
        {r.tutor_destinatario && <button type="button" className="tutorial-primary" disabled={ocupado || reciente} onClick={() => ejecutar(onRecordar)}>
          {ocupado ? 'Procesando…' : reciente ? 'Recordatorio enviado recientemente' : 'Recordar al tutor'}
        </button>}
      </div>}
    </footer>
  </ModalTutorial>;
}
