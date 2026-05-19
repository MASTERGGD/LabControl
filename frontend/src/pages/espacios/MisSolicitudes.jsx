/**
 * MisSolicitudes.jsx
 * Vista del solicitante: historial de sus propias solicitudes de espacios.
 * Filtros por estado, espacio y fecha.
 * Permite cancelar solicitudes pendientes.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

// ─── Constantes ────────────────────────────────────────────────────────────────
const ESTADO_CFG = {
  PENDIENTE:  { label: 'Pendiente',   dot: 'bg-amber-400',  bg: 'bg-amber-500/20 border-amber-500/30',  text: 'text-amber-300'  },
  APROBADA:   { label: 'Aprobada',    dot: 'bg-green-400',  bg: 'bg-green-500/20 border-green-500/30',  text: 'text-green-300'  },
  RECHAZADA:  { label: 'Rechazada',   dot: 'bg-red-400',    bg: 'bg-red-500/20 border-red-500/30',      text: 'text-red-300'    },
  CANCELADA:  { label: 'Cancelada',   dot: 'bg-slate-400',  bg: 'bg-slate-500/20 border-slate-500/30', text: 'text-slate-400'  },
  FINALIZADA: { label: 'Finalizada',  dot: 'bg-blue-400',   bg: 'bg-blue-500/20 border-blue-500/30',   text: 'text-blue-300'   },
};
const TIPO_ICON = { AUDIOVISUAL: '🎥', RECTORIA: '🏛️', OTRO: '🏢' };
const REQS_LABEL = {
  PROYECTOR:'Proyector', AUDIO:'Audio', MICROFONO:'Micrófono',
  ACOMODO_SILLAS:'Acomodo sillas', MANTELES:'Manteles',
  COFFEE_BREAK:'Coffee break', PRESIDIUM:'Presidium', INTERNET:'Internet', OTRO:'Otro',
};

// ─── Drawer Detalle ────────────────────────────────────────────────────────────
function DrawerDetalle({ solicitud, onClose, onCancelada }) {
  const { toast: showToast } = useToast();
  const [canceling, setCanceling]   = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cfg = ESTADO_CFG[solicitud.estado] || ESTADO_CFG.PENDIENTE;

  const cancelar = async () => {
    setCanceling(true);
    try {
      await api.post(`/espacios/solicitudes/${solicitud.id}/cancelar`, {});
      showToast('Solicitud cancelada', 'success');
      onCancelada();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error');
      setConfirming(false);
    } finally { setCanceling(false); }
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
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${cfg.bg} ${cfg.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
              </div>
              <h3 className="font-bold text-white text-lg">
                {TIPO_ICON[solicitud.espacio_tipo]} {solicitud.espacio_nombre}
              </h3>
              <p className="text-sm text-slate-400 mt-0.5">{solicitud.motivo}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white mt-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
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

          {/* Área */}
          {solicitud.area_solicitante && (
            <section>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Área solicitante</h4>
              <p className="text-sm text-slate-300 bg-white/5 rounded-xl px-4 py-2">{solicitud.area_solicitante}</p>
            </section>
          )}

          {/* Asistentes */}
          {solicitud.numero_asistentes && (
            <section>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Asistentes</h4>
              <p className="text-sm text-slate-300 bg-white/5 rounded-xl px-4 py-2">{solicitud.numero_asistentes} personas</p>
            </section>
          )}

          {/* Requerimientos */}
          {solicitud.requerimientos?.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Requerimientos solicitados</h4>
              <div className="flex flex-wrap gap-2">
                {solicitud.requerimientos.map(r => (
                  <span key={r.id} className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-xl px-3 py-1.5">
                    {REQS_LABEL[r.tipo] || r.tipo}
                    {r.descripcion && ` · ${r.descripcion}`}
                  </span>
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

          {/* Estado especial */}
          {solicitud.estado === 'APROBADA' && solicitud.aprobado_en && (
            <section>
              <h4 className="text-xs font-semibold text-green-400/70 uppercase tracking-wider mb-2">Aprobación</h4>
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-sm">
                <p className="text-green-300">✅ Aprobado por: <strong>{solicitud.aprobado_por_nombre || 'Responsable'}</strong></p>
                <p className="text-xs text-slate-400 mt-0.5">{solicitud.aprobado_en?.slice(0,16).replace('T',' ')}</p>
              </div>
            </section>
          )}
          {solicitud.estado === 'RECHAZADA' && solicitud.motivo_rechazo && (
            <section>
              <h4 className="text-xs font-semibold text-red-400/70 uppercase tracking-wider mb-2">Motivo de rechazo</h4>
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{solicitud.motivo_rechazo}</p>
            </section>
          )}

          {/* Meta */}
          <p className="text-xs text-slate-600 border-t border-white/5 pt-3">
            Solicitud #{solicitud.id} · {solicitud.creado_en?.slice(0,16).replace('T',' ')}
          </p>
        </div>

        {/* Footer */}
        {(solicitud.estado === 'PENDIENTE' || solicitud.estado === 'APROBADA') && (
          <div className="p-4 border-t border-white/5">
            {!confirming ? (
              <button onClick={() => setConfirming(true)}
                className="w-full bg-red-600/70 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
                ✕ Cancelar mi solicitud
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-300 text-center">¿Cancelar esta solicitud?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(false)} disabled={canceling}
                    className="flex-1 bg-white/10 hover:bg-white/15 text-slate-300 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
                    No, volver
                  </button>
                  <button onClick={cancelar} disabled={canceling}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
                    {canceling ? 'Cancelando…' : 'Sí, cancelar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function MisSolicitudes() {
  const navigate = useNavigate();
  const { toast: showToast } = useToast();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filtro, setFiltro]           = useState('');
  const [detalle, setDetalle]         = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtro ? `?estado=${filtro}` : '';
      const { data } = await api.get(`/espacios/mis-solicitudes${params}`);
      setSolicitudes(data);
    } catch { showToast('Error al cargar solicitudes', 'error'); }
    finally { setLoading(false); }
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleCancelada = () => {
    setDetalle(null);
    cargar();
  };

  // Agrupar por mes
  const grupos = {};
  for (const s of solicitudes) {
    const mes = s.fecha?.slice(0, 7) || '—';
    if (!grupos[mes]) grupos[mes] = [];
    grupos[mes].push(s);
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Mis solicitudes</h1>
            <p className="text-slate-400 text-sm mt-0.5">Historial de tus solicitudes de espacios institucionales</p>
          </div>
          <button onClick={() => navigate('/espacios/apartar')} className="btn-blue flex items-center gap-2 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nueva solicitud
          </button>
        </div>

        {/* Filtros de estado */}
        <div className="flex gap-1 glass rounded-xl p-1 self-start w-fit">
          {[
            { k: '',           l: 'Todas' },
            { k: 'PENDIENTE',  l: 'Pendientes' },
            { k: 'APROBADA',   l: 'Aprobadas'  },
            { k: 'RECHAZADA',  l: 'Rechazadas' },
            { k: 'CANCELADA',  l: 'Canceladas' },
          ].map(({ k, l }) => (
            <button key={k} onClick={() => setFiltro(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtro === k ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}>
              {l}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="glass rounded-2xl h-24 animate-pulse" />)}
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center space-y-3">
            <div className="text-5xl">📋</div>
            <p className="text-white font-semibold">Sin solicitudes {filtro ? ESTADO_CFG[filtro]?.label?.toLowerCase() : ''}</p>
            <p className="text-slate-400 text-sm">
              {!filtro ? 'Aún no has solicitado ningún espacio.' : 'Prueba con otro filtro.'}
            </p>
            {!filtro && (
              <button onClick={() => navigate('/espacios/apartar')} className="btn-blue mx-auto">
                Apartar mi primer espacio
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grupos).sort(([a],[b]) => b.localeCompare(a)).map(([mes, items]) => (
              <div key={mes}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
                  {new Date(mes + '-01').toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}
                </h3>
                <div className="space-y-2">
                  {items.map(s => {
                    const cfg = ESTADO_CFG[s.estado] || ESTADO_CFG.PENDIENTE;
                    return (
                      <div key={s.id} onClick={() => setDetalle(s)}
                        className="glass rounded-2xl p-4 cursor-pointer hover:bg-white/5 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                              <span className="text-xs text-slate-500">
                                {TIPO_ICON[s.espacio_tipo]} {s.espacio_nombre}
                              </span>
                            </div>
                            <p className="font-medium text-white text-sm truncate">{s.motivo}</p>
                            {s.estado === 'RECHAZADA' && s.motivo_rechazo && (
                              <p className="text-xs text-red-400 mt-0.5 truncate">Rechazada: {s.motivo_rechazo}</p>
                            )}
                            {s.requerimientos?.length > 0 && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {s.requerimientos.length} requerimiento{s.requerimientos.length > 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-white">{s.fecha}</p>
                            <p className="text-xs text-slate-400">{s.hora_inicio} – {s.hora_fin}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drawer detalle */}
      {detalle && (
        <DrawerDetalle
          solicitud={detalle}
          onClose={() => setDetalle(null)}
          onCancelada={handleCancelada}
        />
      )}
    </AdminLayout>
  );
}
