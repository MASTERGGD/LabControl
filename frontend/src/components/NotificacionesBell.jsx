import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

// ── Componente principal ──────────────────────────────────────────────────────
export default function NotificacionesBell() {
  const { usuario }             = useAuth();
  const [open, setOpen]         = useState(false);
  const [notifs, setNotifs]     = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [pos, setPos]           = useState({ top: 0, right: 0 });
  const bellRef                 = useRef(null);
  const dropdownRef             = useRef(null);
  const pollRef                 = useRef(null);

  if (!usuario) return null;

  // ── Cerrar al hacer click fuera (solo cuando está abierto) ────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (bellRef.current?.contains(e.target))     return; // clic en la campana
      if (dropdownRef.current?.contains(e.target)) return; // clic dentro del panel
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Polling conteo no leídas (60 s) ──────────────────────────────────────
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

  // ── Abrir / cerrar dropdown ───────────────────────────────────────────────
  const abrirDropdown = async () => {
    const nextOpen = !open;

    if (nextOpen && bellRef.current) {
      // Calcular posición fija relativa al viewport
      const rect = bellRef.current.getBoundingClientRect();
      setPos({
        top:   rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }

    setOpen(nextOpen);

    if (nextOpen) {
      setCargando(true);
      try {
        const { data } = await api.get('/notificaciones?limite=30');
        setNotifs(data);
        await api.post('/notificaciones/verificar').catch(() => {});
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
    const eliminada = notifs.find(n => n.id === id);
    setNotifs(prev => prev.filter(n => n.id !== id));
    if (eliminada && !eliminada.leida) setNoLeidas(prev => Math.max(0, prev - 1));
  };

  const cfg = (tipo) =>
    TIPO_CONFIG[tipo] || { color: 'text-slate-400', bg: 'bg-white/4', icon: '🔔', label: tipo };

  // ── Panel de notificaciones (portaleado a document.body) ──────────────────
  const panel = open ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position:    'fixed',
        top:         pos.top,
        right:       pos.right,
        width:       384,
        maxHeight:   520,
        zIndex:      2147483647,
        transform:   'translateZ(0)',
        willChange:  'transform',
        background:  '#1e293b',
        border:      '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        boxShadow:   '0 24px 64px rgba(0,0,0,0.6)',
        overflow:    'hidden',
        display:     'flex',
        flexDirection: 'column',
      }}
    >
      {/* Cabecera */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color:'#f1f5f9', fontWeight:600, fontSize:14, margin:0 }}>
          Notificaciones
          {noLeidas > 0 && (
            <span style={{ marginLeft:8, padding:'1px 7px', background:'#ef4444',
                           color:'#fff', fontSize:10, borderRadius:999, fontWeight:700 }}>
              {noLeidas} nuevas
            </span>
          )}
        </h3>
        {noLeidas > 0 && (
          <button onClick={marcarTodas}
            style={{ display:'flex', alignItems:'center', gap:4, fontSize:12,
                     color:'#60a5fa', background:'none', border:'none', cursor:'pointer' }}>
            <IconCheck className="w-3 h-3" /> Marcar todas
          </button>
        )}
      </div>

      {/* Lista */}
      <div style={{ overflowY:'auto', flex:1 }}>
        {cargando ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
            <div style={{ width:24, height:24, border:'2px solid #3b82f6',
                          borderTopColor:'transparent', borderRadius:'50%',
                          animation:'spin 0.7s linear infinite' }} />
          </div>
        ) : notifs.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                        justifyContent:'center', padding:'48px 0', color:'#64748b' }}>
            <span style={{ fontSize:36, marginBottom:8 }}>🔕</span>
            <p style={{ fontSize:14, margin:0 }}>Sin notificaciones</p>
          </div>
        ) : (
          notifs.map(n => {
            const c = cfg(n.tipo);
            return (
              <div key={n.id}
                onClick={() => { if (!n.leida) marcarLeida(n.id); }}
                style={{
                  display:'flex', gap:12, padding:'12px 16px',
                  borderBottom:'1px solid rgba(255,255,255,0.05)',
                  cursor:'pointer', position:'relative',
                  background: n.leida ? 'transparent' : 'rgba(255,255,255,0.03)',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background= n.leida ? 'transparent' : 'rgba(255,255,255,0.03)'}
              >
                {/* Punto no leída */}
                {!n.leida && (
                  <span style={{ position:'absolute', left:6, top:'50%', transform:'translateY(-50%)',
                                 width:6, height:6, background:'#60a5fa', borderRadius:'50%' }} />
                )}

                {/* Ícono */}
                <div className={c.bg} style={{ flexShrink:0, width:32, height:32, borderRadius:'50%',
                                               display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>
                  {c.icon}
                </div>

                {/* Texto */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                    <p className={c.color} style={{ fontSize:12, fontWeight:600,
                                                    overflow:'hidden', textOverflow:'ellipsis',
                                                    whiteSpace:'nowrap', margin:0 }}>
                      {n.titulo}
                    </p>
                    <button onClick={(e) => eliminar(n.id, e)}
                      style={{ flexShrink:0, color:'#475569', background:'none', border:'none',
                               cursor:'pointer', padding:0, marginTop:-2 }}>
                      <IconX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p style={{ fontSize:12, color:'#94a3b8', margin:'3px 0 0',
                               display:'-webkit-box', WebkitLineClamp:2,
                               WebkitBoxOrient:'vertical', overflow:'hidden', lineHeight:1.4 }}>
                    {n.mensaje}
                  </p>
                  <p style={{ fontSize:10, color:'#475569', margin:'4px 0 0' }}>
                    {n.creado_en
                      ? new Date(n.creado_en + (n.creado_en.endsWith('Z') ? '' : 'Z'))
                          .toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' })
                      : ''}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{ padding:'8px 16px', borderTop:'1px solid rgba(255,255,255,0.05)',
                    fontSize:11, color:'#475569', textAlign:'center' }}>
        Mostrando {notifs.length} notificaciónes
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {/* ── Botón campana ── */}
      <button
        ref={bellRef}
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

      {/* ── Panel portaleado al body (escapa stacking context del header) ── */}
      {panel}

      {/* Keyframe para el spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
