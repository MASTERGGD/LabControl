import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

// ── Íconos SVG inline ─────────────────────────────────────────────────────────
const IconBell = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-9.33-5 6 6 0 00-2.67 5v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const IconCheck = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const IconX = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// ── Colores y emojis por tipo ─────────────────────────────────────────────────
const TIPO_CONFIG = {
  PRESTAMO_VENCIDO: { color: 'text-red-400',    bg: 'bg-red-900/30',    icon: '🔴', label: 'Préstamo' },
  MANTENIMIENTO:    { color: 'text-orange-400',  bg: 'bg-orange-900/30', icon: '🔧', label: 'Mantenimiento' },
  RESERVACION:      { color: 'text-blue-400',    bg: 'bg-blue-900/30',   icon: '📅', label: 'Reservación' },
  OVERTIME:         { color: 'text-purple-400',  bg: 'bg-purple-900/30', icon: '⏰', label: 'Overtime' },
};

function tiempoRelativo(fechaIso) {
  const diff = Math.floor((Date.now() - new Date(fechaIso)) / 1000);
  if (diff < 60)    return 'Ahora';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} día(s)`;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function NotificacionesBell() {
  const { usuario }                   = useAuth();
  const [open, setOpen]               = useState(false);
  const [notifs, setNotifs]           = useState([]);
  const [noLeidas, setNoLeidas]       = useState(0);
  const [cargando, setCargando]       = useState(false);
  const dropdownRef                   = useRef(null);
  const pollRef                       = useRef(null);

  // No renderizar nada si no hay sesión activa
  if (!usuario) return null;

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Polling del conteo no leídas (cada 60s) — solo si hay token
  const fetchCount = useCallback(async () => {
    if (!sessionStorage.getItem('token')) return;
    try {
      const { data } = await api.get('/notificaciones/no-leidas');
      setNoLeidas(data.count);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchCount();
    pollRef.current = setInterval(fetchCount, 60_000);
    return () => clearInterval(pollRef.current);
  }, [fetchCount]);

  // Cargar lista completa al abrir
  const abrirDropdown = async () => {
    setOpen(v => !v);
    if (!open) {
      setCargando(true);
      try {
        const { data } = await api.get('/notificaciones?limite=30');
        setNotifs(data);
        // Disparar verificación de eventos nuevos
        await api.post('/notificaciones/verificar').catch(() => {});
        // Refrescar lista
        const { data: fresh } = await api.get('/notificaciones?limite=30');
        setNotifs(fresh);
        setNoLeidas(fresh.filter(n => !n.leida).length);
      } catch (_) {
      } finally {
        setCargando(false);
      }
    }
  };

  const marcarLeida = async (id) => {
    await api.put(`/notificaciones/${id}/leer`).catch(() => {});
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
    setNoLeidas(prev => Math.max(0, prev - 1));
  };

  const marcarTodas = async () => {
    await api.put('/notificaciones/leer-todas').catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })));
    setNoLeidas(0);
  };

  const eliminar = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/notificaciones/${id}`).catch(() => {});
    setNotifs(prev => prev.filter(n => n.id !== id));
    setNoLeidas(prev => {
      const eliminada = notifs.find(n => n.id === id);
      return eliminada && !eliminada.leida ? Math.max(0, prev - 1) : prev;
    });
  };

  const cfg = (tipo) => TIPO_CONFIG[tipo] || { color: 'text-slate-400', bg: 'bg-white/4', icon: '🔔', label: tipo };

  return (
    <div className="relative">
      {/* ── Botón campana ── */}
      <button
        onClick={abrirDropdown}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
        title="Notificaciones"
      >
        <IconBell className="w-5 h-5" />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
                           bg-red-500 text-white text-[10px] font-bold rounded-full
                           flex items-center justify-center leading-none">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {/* ── Dropdown vía Portal (escapa el stacking context del header) ── */}
      {open && (
        <div ref={dropdownRef}
             className="absolute right-0 mt-2 w-96 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
             style={{ maxHeight: '520px', zIndex: 9999 }}>
          {/* Cabecera */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h3 className="text-white font-semibold text-sm">
              Notificaciones
              {noLeidas > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full">
                  {noLeidas} nuevas
                </span>
              )}
            </h3>
            {noLeidas > 0 && (
              <button
                onClick={marcarTodas}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                <IconCheck className="w-3 h-3" /> Marcar todas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
            {cargando ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <span className="text-4xl mb-2">🔕</span>
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : (
              notifs.map(n => {
                const c = cfg(n.tipo);
                return (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.leida) marcarLeida(n.id); }}
                    className={`flex gap-3 px-4 py-3 border-b border-white/5/50 cursor-pointer
                                hover:bg-white/4 transition-colors relative
                                ${!n.leida ? 'bg-white/3' : ''}`}
                  >
                    {/* Indicador no leída */}
                    {!n.leida && (
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2
                                       w-1.5 h-1.5 bg-blue-400 rounded-full" />
                    )}

                    {/* Ícono tipo */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base ${c.bg}`}>
                      {c.icon}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs font-semibold truncate ${c.color}`}>
                          {n.titulo}
                        </p>
                        <button
                          onClick={(e) => eliminar(n.id, e)}
                          className="flex-shrink-0 text-slate-600 hover:text-slate-400 transition-colors -mt-0.5"
                        >
                          <IconX className="w-3.5 h-3.5" />
                        </button>
                      </div>
                                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {n.mensaje}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-1">
                        {n.creado_en ? new Date(n.creado_en + (n.creado_en.endsWith('Z') ? '' : 'Z')).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : ''}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
