/**
 * BandejaEspacios.jsx
 * Bandeja de aprobación para responsables y SUPER_ADMIN.
 * Muestra solicitudes pendientes/aprobadas/rechazadas por espacio.
 * Permite aprobar, rechazar, cancelar y finalizar.
 */
import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

// ─── Constantes ────────────────────────────────────────────────────────────────
const ESTADO_CFG = {
  PENDIENTE:  { label: 'Pendiente',  color: 'text-amber-400',  bg: 'bg-amber-500/20 border-amber-500/30',  dot: 'bg-amber-400'  },
  APROBADA:   { label: 'Aprobada',   color: 'text-green-400',  bg: 'bg-green-500/20 border-green-500/30',  dot: 'bg-green-400'  },
  RECHAZADA:  { label: 'Rechazada',  color: 'text-red-400',    bg: 'bg-red-500/20 border-red-500/30',      dot: 'bg-red-400'    },
  CANCELADA:  { label: 'Cancelada',  color: 'text-slate-400',  bg: 'bg-slate-500/20 border-slate-500/30', dot: 'bg-slate-400'  },
  LIBERADA:   { label: 'Liberada',   color: 'text-violet-300',  bg: 'bg-violet-500/20 border-violet-500/30', dot: 'bg-violet-400' },
  FINALIZADA: { label: 'Finalizada', color: 'text-blue-400',   bg: 'bg-blue-500/20 border-blue-500/30',   dot: 'bg-blue-400'   },
};

const TIPO_ICON  = { AUDIOVISUAL: '🎥', RECTORIA: '🏛️', OTRO: '🏢' };

const REQS_LABEL = {
  PROYECTOR:'Proyector', AUDIO:'Audio', MICROFONO:'Micrófono',
  ACOMODO_SILLAS:'Acomodo sillas', MANTELES:'Manteles',
  COFFEE_BREAK:'Coffee break', PRESIDIUM:'Presidium', INTERNET:'Internet', OTRO:'Otro',
};

const solicitudDateTime = (solicitud, hora) => new Date(`${solicitud.fecha}T${hora}:00`);

const estaEnHorario = (solicitud) => {
  const ahora = new Date();
  return ahora >= solicitudDateTime(solicitud, solicitud.hora_inicio) &&
         ahora <= solicitudDateTime(solicitud, solicitud.hora_fin);
};

function ModalLiberarRango({ espacios, onClose, onLiberado }) {
  const { toast: showToast } = useToast();
  const [form, setForm] = useState({
    espacio_id: espacios?.[0]?.id || '',
    fecha: new Date().toISOString().slice(0, 10),
    hora_inicio: '08:00',
    hora_fin: '11:00',
    motivo: '',
    nombre_evento: '',
    crear_evento_prioritario: true,
    numero_asistentes: '',
    observaciones: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/espacios/solicitudes/liberar-rango', {
        ...form,
        espacio_id: Number(form.espacio_id),
        numero_asistentes: form.numero_asistentes ? Number(form.numero_asistentes) : null,
      });
      showToast(`Horario liberado. Solicitudes afectadas: ${data.afectadas?.length || 0}`, 'success');
      onLiberado();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al liberar horario', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="glass w-full max-w-lg shadow-glass animate-fadeUp p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Liberar horario prioritario</h3>
            <p className="text-xs text-slate-400 mt-1">Busca reservas aprobadas en todo el rango y notifica a los solicitantes.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <select className="input-dark" value={form.espacio_id} onChange={e => set('espacio_id', e.target.value)} required>
          <option value="">Selecciona sala</option>
          {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-3">
          <input type="date" className="input-dark" value={form.fecha} onChange={e => set('fecha', e.target.value)} required />
          <input type="time" className="input-dark" value={form.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} required />
          <input type="time" className="input-dark" value={form.hora_fin} onChange={e => set('hora_fin', e.target.value)} required />
        </div>
        <input className="input-dark" value={form.nombre_evento} onChange={e => set('nombre_evento', e.target.value)}
          placeholder="Nombre del evento prioritario" />
        <textarea className="input-dark resize-none" rows={3} value={form.motivo} onChange={e => set('motivo', e.target.value)}
          placeholder="Motivo institucional obligatorio" required />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" min="1" className="input-dark" value={form.numero_asistentes}
            onChange={e => set('numero_asistentes', e.target.value)} placeholder="Asistentes" />
          <label className="flex items-center gap-2 text-sm text-slate-300 bg-white/5 rounded-xl px-3">
            <input type="checkbox" checked={form.crear_evento_prioritario}
              onChange={e => set('crear_evento_prioritario', e.target.checked)} />
            Crear evento aprobado
          </label>
        </div>
        <textarea className="input-dark resize-none" rows={2} value={form.observaciones}
          onChange={e => set('observaciones', e.target.value)} placeholder="Observaciones para infraestructura/apoyo" />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-blue flex-1">
            {saving ? 'Liberando...' : 'Liberar horario'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Modal Rechazo ─────────────────────────────────────────────────────────────
function ModalRechazo({ solicitud, onClose, onRechazada }) {
  const { toast: showToast } = useToast();
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!motivo.trim()) return;
    setSaving(true);
    try {
      await api.post(`/espacios/solicitudes/${solicitud.id}/rechazar`, { motivo_rechazo: motivo });
      showToast('Solicitud rechazada', 'success');
      onRechazada();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">❌ Rechazar solicitud</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-400">
            Solicitud de <strong className="text-white">{solicitud.solicitante_nombre}</strong> el{' '}
            <strong className="text-white">{solicitud.fecha}</strong> ({solicitud.hora_inicio}–{solicitud.hora_fin})
          </p>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Motivo del rechazo *</label>
            <textarea className="input-dark resize-none" rows={3} value={motivo} required
              onChange={e => setMotivo(e.target.value)}
              placeholder="Explica brevemente el motivo…" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving || !motivo.trim()}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl py-2.5 font-medium text-sm transition-colors disabled:opacity-50">
              {saving ? 'Rechazando…' : 'Rechazar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalCancelarReserva({ solicitud, onClose, onCancelada }) {
  const { toast: showToast } = useToast();
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!motivo.trim()) return;
    setSaving(true);
    try {
      await api.post(`/espacios/solicitudes/${solicitud.id}/cancelar`, {
        motivo_cancelacion: motivo.trim(),
      });
      showToast('Reserva liberada y solicitante notificado', 'success');
      onCancelada();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al liberar reserva', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <form onSubmit={submit} className="glass w-full max-w-md shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Liberar reserva</h3>
            <p className="text-xs text-slate-400 mt-0.5">{solicitud.espacio_nombre} · {solicitud.fecha} {solicitud.hora_inicio}-{solicitud.hora_fin}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-100">
            Esta acción notificará al solicitante que su evento ya no podrá realizarse en este horario. El motivo quedará guardado como evidencia.
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Motivo institucional *</label>
            <textarea className="input-dark resize-none" rows={4} value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: Evento institucional prioritario de Rectoría, visita externa, ajuste operativo de sala..."
              required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Volver</button>
            <button type="submit" disabled={saving || !motivo.trim()}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2.5 font-medium text-sm transition-colors disabled:opacity-50">
              {saving ? 'Liberando...' : 'Liberar y notificar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Drawer Detalle ────────────────────────────────────────────────────────────
function DrawerDetalle({ solicitud, onClose, onActualizada }) {
  const { toast: showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const cfg = ESTADO_CFG[solicitud.estado] || ESTADO_CFG.PENDIENTE;
  const puedeFinalizar = solicitud.estado === 'APROBADA' && estaEnHorario(solicitud);

  const aprobar = async () => {
    setLoading(true);
    try {
      await api.post(`/espacios/solicitudes/${solicitud.id}/aprobar`);
      showToast('Solicitud aprobada', 'success');
      onActualizada();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al aprobar', 'error');
    } finally { setLoading(false); }
  };

  const finalizar = async () => {
    if (!puedeFinalizar) {
      showToast('Solo se puede finalizar dentro del horario reservado. Si aun no inicia, corresponde cancelar/liberar.', 'error');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/espacios/solicitudes/${solicitud.id}/finalizar`, {
        climas_apagados: true,
        luces_apagadas: true,
        microfonos_apagados: true,
        equipo_apagado: true,
        sala_cerrada: true,
        sin_incidencias: true,
        observaciones: 'Cierre confirmado por responsable',
      });
      showToast('Marcada como finalizada', 'success');
      onActualizada();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error');
    } finally { setLoading(false); }
  };

  const resolverExtension = async (aprobar) => {
    setLoading(true);
    try {
      await api.post(`/espacios/solicitudes/${solicitud.id}/resolver-extension`, { aprobar });
      showToast(aprobar ? 'Extension aprobada' : 'Extension rechazada', 'success');
      onActualizada();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error al resolver extension', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border-l border-white/10 flex flex-col h-full overflow-hidden animate-slideInRight">

        {/* Header */}
        <div className={`px-6 py-5 border-b border-white/5 bg-gradient-to-r ${
          solicitud.estado === 'APROBADA' ? 'from-green-950/50' :
          solicitud.estado === 'PENDIENTE' ? 'from-amber-950/50' :
          solicitud.estado === 'RECHAZADA' ? 'from-red-950/50' : 'from-slate-900'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${cfg.bg} ${cfg.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
                {solicitud.conflicto_pendiente && (
                  <span className="text-xs text-orange-400 bg-orange-500/20 border border-orange-500/30 rounded-full px-2 py-0.5">
                    ⚠ Conflicto pendiente
                  </span>
                )}
              </div>
              <h3 className="font-bold text-white text-lg leading-tight">{solicitud.espacio_nombre}</h3>
              <p className="text-sm text-slate-400 mt-0.5">{solicitud.motivo}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors mt-1 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Cuándo */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Cuándo</h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Fecha',   value: solicitud.fecha },
                { label: 'Inicio',  value: solicitud.hora_inicio },
                { label: 'Fin',     value: solicitud.hora_fin },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Solicitante */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Solicitante</h4>
            <div className="bg-white/5 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/30 flex items-center justify-center text-lg flex-shrink-0">
                👤
              </div>
              <div>
                <p className="font-medium text-white">{solicitud.solicitante_nombre}</p>
                {solicitud.area_solicitante && (
                  <p className="text-xs text-slate-400">{solicitud.area_solicitante}</p>
                )}
              </div>
              {solicitud.numero_asistentes && (
                <div className="ml-auto text-right">
                  <p className="text-xs text-slate-500">Asistentes</p>
                  <p className="font-semibold text-white">{solicitud.numero_asistentes}</p>
                </div>
              )}
            </div>
          </section>

          {/* Requerimientos */}
          {solicitud.requerimientos?.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Requerimientos</h4>
              <div className="flex flex-wrap gap-2">
                {solicitud.requerimientos.map(r => (
                  <div key={r.id} className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-1.5 text-sm text-blue-300">
                    <span>{REQS_LABEL[r.tipo] || r.tipo}</span>
                    {r.descripcion && <span className="text-blue-400/60">· {r.descripcion}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Observaciones */}
          {solicitud.observaciones && (
            <section>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Observaciones</h4>
              <p className="text-sm text-slate-300 bg-white/5 rounded-xl p-3 whitespace-pre-line">{solicitud.observaciones}</p>
            </section>
          )}

          {solicitud.extension?.estado === 'PENDIENTE' && (
            <section>
              <h4 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">Extension solicitada</h4>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-2">
                <p className="text-sm text-amber-100">
                  Solicita <strong>{solicitud.extension.minutos_solicitados} min</strong> extra.
                </p>
                <p className="text-xs text-slate-300">{solicitud.extension.motivo}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => resolverExtension(false)} disabled={loading}
                    className="bg-red-600/80 hover:bg-red-600 text-white rounded-xl py-2 text-xs font-medium">
                    Rechazar
                  </button>
                  <button onClick={() => resolverExtension(true)} disabled={loading}
                    className="bg-green-600 hover:bg-green-500 text-white rounded-xl py-2 text-xs font-medium">
                    Aprobar tiempo
                  </button>
                </div>
              </div>
            </section>
          )}

          {solicitud.finalizado_en && (
            <section>
              <h4 className="text-xs font-semibold text-blue-400/80 uppercase tracking-wider mb-2">Checklist de cierre</h4>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-sm text-slate-300 space-y-1">
                <p>Climas: {solicitud.cierre?.climas_apagados ? 'apagados' : 'sin confirmar'}</p>
                <p>Lamparas: {solicitud.cierre?.luces_apagadas ? 'apagadas' : 'sin confirmar'}</p>
                <p>Microfonos: {solicitud.cierre?.microfonos_apagados ? 'apagados' : 'sin confirmar'}</p>
                <p>Sala: {solicitud.cierre?.sala_cerrada ? 'cerrada' : 'sin confirmar'}</p>
                {solicitud.cierre?.observaciones && <p className="text-slate-400 pt-1">{solicitud.cierre.observaciones}</p>}
              </div>
            </section>
          )}

          {/* Motivo rechazo */}
          {solicitud.motivo_rechazo && (
            <section>
              <h4 className="text-xs font-semibold text-red-400/70 uppercase tracking-wider mb-2">Motivo de rechazo</h4>
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{solicitud.motivo_rechazo}</p>
            </section>
          )}

          {/* Aprobación */}
          {solicitud.aprobado_en && (
            <section>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Aprobación</h4>
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-sm">
                <p className="text-green-300">Aprobado por: <strong>{solicitud.aprobado_por_nombre || '—'}</strong></p>
                <p className="text-slate-400 text-xs mt-0.5">{solicitud.aprobado_en?.slice(0, 16).replace('T', ' ')}</p>
              </div>
            </section>
          )}

          {/* Meta */}
          <section className="text-xs text-slate-600 space-y-1 border-t border-white/5 pt-4">
            <p>Solicitud #{solicitud.id} · Creada: {solicitud.creado_en?.slice(0, 16).replace('T', ' ')}</p>
          </section>
        </div>

        {/* Footer de acciones */}
        {solicitud.estado === 'PENDIENTE' && (
          <div className="p-4 border-t border-white/5 flex gap-3">
            <button onClick={() => onActualizada('rechazar')} disabled={loading}
              className="flex-1 bg-red-600/80 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
              Rechazar
            </button>
            <button onClick={aprobar} disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
              {loading ? 'Aprobando…' : 'Aprobar ✓'}
            </button>
          </div>
        )}
        {solicitud.estado === 'APROBADA' && (
          <div className="p-4 border-t border-white/5 flex gap-3">
            <button onClick={() => onActualizada('cancelar')} disabled={loading}
              className="flex-1 btn-ghost text-sm">
              Liberar reserva
            </button>
            <button onClick={finalizar} disabled={loading || !puedeFinalizar}
              title={!puedeFinalizar ? 'Solo dentro del horario reservado' : undefined}
              className="flex-1 btn-blue text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? '…' : 'Marcar finalizada'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta solicitud ─────────────────────────────────────────────────────────
function TarjetaSolicitud({ s, onClick }) {
  const cfg = ESTADO_CFG[s.estado] || ESTADO_CFG.PENDIENTE;
  return (
    <div onClick={onClick}
      className="glass rounded-2xl p-4 cursor-pointer hover:bg-white/5 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            {s.conflicto_pendiente && (
              <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5">⚠ Conflicto</span>
            )}
            <span className="text-xs text-slate-500">{TIPO_ICON[s.espacio_tipo]} {s.espacio_nombre}</span>
          </div>
          <p className="font-medium text-white text-sm truncate">{s.motivo}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {s.solicitante_nombre} · {s.area_solicitante || 'Sin área'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-white">{s.fecha}</p>
          <p className="text-xs text-slate-400">{s.hora_inicio} – {s.hora_fin}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function BandejaEspacios() {
  const { toast: showToast } = useToast();
  const [solicitudes, setSolicitudes]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('PENDIENTE');
  const [filtroEspacio, setFiltroEspacio] = useState('');
  const [espacios, setEspacios]         = useState([]);
  const [detalle, setDetalle]           = useState(null);
  const [modalRechazo, setModalRechazo] = useState(null);
  const [modalCancelar, setModalCancelar] = useState(null);
  const [modalLiberar, setModalLiberar] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado)  params.set('estado', filtroEstado);
      if (filtroEspacio) params.set('espacio_id', filtroEspacio);
      const { data } = await api.get(`/espacios/bandeja?${params}`);
      setSolicitudes(data);
    } catch { showToast('Error al cargar bandeja', 'error'); }
    finally { setLoading(false); }
  }, [filtroEstado, filtroEspacio]);

  useEffect(() => {
    api.get('/espacios/mis-espacios').then(r => setEspacios(r.data)).catch(() => {});
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleActualizada = (accion) => {
    if (accion === 'rechazar') {
      setModalRechazo(detalle);
    } else if (accion === 'cancelar') {
      setModalCancelar(detalle);
    } else {
      setDetalle(null);
      cargar();
    }
  };

  const pendientes = solicitudes.filter(s => s.estado === 'PENDIENTE').length;

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">Bandeja de aprobación</h1>
              {pendientes > 0 && (
                <span className="text-xs font-bold text-white bg-red-500 rounded-full w-6 h-6 flex items-center justify-center">
                  {pendientes}
                </span>
              )}
            </div>
            <p className="text-slate-400 text-sm mt-0.5">Solicitudes de espacios institucionales</p>
          </div>
          <button onClick={() => setModalLiberar(true)} className="btn-blue self-start">
            Liberar horario prioritario
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3">
          {/* Estado */}
          <div className="flex gap-1 glass rounded-xl p-1">
            {[
              { k: 'PENDIENTE',  l: 'Pendientes' },
              { k: 'APROBADA',   l: 'Aprobadas'  },
              { k: 'RECHAZADA',  l: 'Rechazadas' },
              { k: 'CANCELADA',  l: 'Canceladas' },
              { k: 'LIBERADA',   l: 'Liberadas' },
              { k: 'FINALIZADA', l: 'Finalizadas' },
            ].map(({ k, l }) => (
              <button key={k} onClick={() => setFiltroEstado(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filtroEstado === k ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}>
                {l}
              </button>
            ))}
          </div>
          {/* Espacio */}
          {espacios.length > 1 && (
            <select value={filtroEspacio} onChange={e => setFiltroEspacio(e.target.value)}
              className="input-dark text-sm py-1.5 h-auto">
              <option value="">Todos los espacios</option>
              {espacios.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="glass rounded-2xl h-20 animate-pulse" />)}
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-white font-semibold">Sin solicitudes {filtroEstado ? ESTADO_CFG[filtroEstado]?.label?.toLowerCase() : ''}</p>
            <p className="text-slate-400 text-sm mt-1">
              {filtroEstado === 'PENDIENTE' ? 'No hay solicitudes pendientes de revisión.' : 'No hay resultados con estos filtros.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {solicitudes.map(s => (
              <TarjetaSolicitud key={s.id} s={s} onClick={() => setDetalle(s)} />
            ))}
          </div>
        )}
      </div>

      {/* Drawer detalle */}
      {detalle && (
        <DrawerDetalle
          solicitud={detalle}
          onClose={() => setDetalle(null)}
          onActualizada={handleActualizada}
        />
      )}

      {/* Modal rechazo */}
      {modalRechazo && (
        <ModalRechazo
          solicitud={modalRechazo}
          onClose={() => setModalRechazo(null)}
          onRechazada={() => {
            setModalRechazo(null);
            setDetalle(null);
            cargar();
          }}
        />
      )}
      {modalCancelar && (
        <ModalCancelarReserva
          solicitud={modalCancelar}
          onClose={() => setModalCancelar(null)}
          onCancelada={() => {
            setModalCancelar(null);
            setDetalle(null);
            cargar();
          }}
        />
      )}
      {modalLiberar && (
        <ModalLiberarRango
          espacios={espacios}
          onClose={() => setModalLiberar(false)}
          onLiberado={() => {
            setModalLiberar(false);
            cargar();
          }}
        />
      )}
    </AdminLayout>
  );
}
