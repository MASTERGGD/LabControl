import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';
import NotificacionesBell from './NotificacionesBell';
import SelectDark from './SelectDark';

// ─── Modal: Cambiar contraseña ────────────────────────────────────────────────
function ModalCambiarPassword({ onClose }) {
  const [form, setForm]       = useState({ password_actual: '', password_nuevo: '', confirmar: '' });
  const [error, setError]     = useState('');
  const [ok, setOk]           = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password_nuevo !== form.confirmar) { setError('Las contraseñas nuevas no coinciden'); return; }
    if (form.password_nuevo.length < 6)         { setError('Mínimo 6 caracteres'); return; }
    setLoading(true); setError('');
    try {
      await api.put('/usuarios/me/password', {
        password_actual: form.password_actual,
        password_nuevo:  form.password_nuevo,
      });
      setOk(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cambiar contraseña');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">🔑 Cambiar contraseña</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        {ok ? (
          <div className="p-6 text-center space-y-4">
            <div className="text-4xl">✅</div>
            <p className="text-white font-semibold">¡Contraseña actualizada!</p>
            <p className="text-slate-400 text-sm">Usa tu nueva contraseña en el próximo inicio de sesión.</p>
            <button onClick={onClose} className="btn-blue w-full">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {['password_actual','password_nuevo','confirmar'].map((field, i) => (
              <div key={field}>
                <label className="block text-sm text-slate-400 mb-1">
                  {['Contraseña actual','Nueva contraseña','Confirmar nueva'][i]}
                </label>
                <input type="password" required value={form[field]}
                  onChange={e => setForm({...form, [field]: e.target.value})}
                  placeholder={['Tu contraseña actual','Mínimo 6 caracteres','Repite la nueva'][i]}
                  className="input-dark" />
              </div>
            ))}
            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={loading} className="btn-blue flex-1">
                {loading ? 'Guardando…' : 'Actualizar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Modal: Sesión de uso libre ───────────────────────────────────────────────
function ModalSesionLibre({ usuario, onClose }) {
  const navigate = useNavigate();
  const [labs, setLabs]         = useState([]);
  const [labId, setLabId]       = useState('');
  const [duracion, setDuracion] = useState(45);
  const [nota, setNota]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [sesionActiva, setSesionActiva] = useState(null);

  useEffect(() => {
    api.get('/laboratorios?solo_activos=true').then(res => {
      setLabs(res.data);
      if (usuario?.rol === 'LAB_ADMIN' && usuario?.laboratorio_id) {
        setLabId(usuario.laboratorio_id);
      } else if (res.data.length > 0) {
        setLabId(res.data[0].id);
      }
    }).catch(() => {});
  }, [usuario]);

  useEffect(() => {
    if (!labId) return;
    api.get(`/sesiones?estado=ABIERTA&laboratorio_id=${labId}`)
      .then(res => setSesionActiva(res.data.length > 0 ? res.data[0] : null))
      .catch(() => setSesionActiva(null));
  }, [labId]);

  const handleAbrir = async () => {
    if (!labId) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/sesiones', {
        laboratorio_id:   Number(labId),
        materia:          nota.trim() || 'Uso Libre',
        grupo:            'Acceso Libre',
        fin_estimado_min: duracion,
      });
      onClose();
      navigate(`/admin/sesion/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al abrir la sesión');
    } finally { setSaving(false); }
  };

  const labNombre = labs.find(l => l.id === Number(labId))?.nombre || '';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-glass animate-fadeUp">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{background:'linear-gradient(135deg,#10b981,#059669)'}}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-white">Sesión de uso libre</h3>
              <p className="text-xs text-slate-400">Para alumnos sin clase programada</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {sesionActiva && (
            <div className="bg-amber-950/40 border border-amber-700/40 rounded-xl p-3 text-sm">
              <p className="text-amber-400 font-medium">⚠️ Ya hay una sesión abierta en este laboratorio</p>
              <p className="text-slate-400 text-xs mt-0.5">{sesionActiva.materia} · {sesionActiva.grupo}</p>
              <button onClick={() => { onClose(); navigate(`/admin/sesion/${sesionActiva.id}`); }}
                className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-white py-1.5 rounded-lg text-xs font-semibold transition-colors">
                Ir a la sesión activa →
              </button>
            </div>
          )}

          {usuario?.rol === 'SUPER_ADMIN' ? (
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Laboratorio</label>
              <SelectDark
                value={labId}
                onChange={setLabId}
                options={labs.map(l => ({ value: l.id, label: l.nombre }))}
              />
            </div>
          ) : (
            <div className="glass-sm px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-xs text-slate-400">Laboratorio</p>
                <p className="text-white text-sm font-medium">{labNombre}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">
              Motivo <span className="text-slate-600">(opcional)</span>
            </label>
            <input type="text" value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Ej: Tareas, Exámenes, Acceso abierto…"
              className="input-dark" />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Duración estimada</label>
            <div className="grid grid-cols-4 gap-2">
              {[30, 45, 60, 90].map(m => (
                <button key={m} type="button" onClick={() => setDuracion(m)}
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all
                    ${duracion === m
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-glow-em'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'}`}>
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <div className="glass-sm p-3 text-xs text-slate-400 space-y-1">
            <p>• Los alumnos quedan registrados al asignarles una PC en el mapa</p>
            <p>• Al cerrar la sesión se libera el registro de todos los equipos</p>
            <p>• La sesión aparece en el historial del laboratorio</p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleAbrir} disabled={saving || !labId || !!sesionActiva}
              className="btn-emerald flex-1">
              {saving ? 'Abriendo…' : '🖥️ Abrir sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Navegación ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    label: 'Laboratorios', path: '/admin/laboratorios', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
  },
  {
    label: 'Usuarios', path: '/admin/usuarios', roles: ['SUPER_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  },
  {
    label: 'Horarios', path: '/admin/horarios', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  },
  {
    label: 'Reservaciones', path: '/admin/reservaciones', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  },
  {
    label: 'Inventario', path: '/admin/inventario', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
  },
  {
    label: 'Préstamos', path: '/admin/prestamos', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>,
  },
  {
    label: 'Mantenimiento', path: '/admin/mantenimiento', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  },
  {
    label: 'Catálogos', path: '/admin/catalogo', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>,
  },
  {
    label: 'Reportes', path: '/admin/reportes', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
  },
  {
    label: 'Historial Alumno', path: '/admin/historial-alumno', roles: ['SUPER_ADMIN','LAB_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  },
  {
    label: 'Bitácora', path: '/admin/auditoria', roles: ['SUPER_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>,
  },
];

const ROL_BADGE = {
  SUPER_ADMIN: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  LAB_ADMIN:   'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  DOCENTE:     'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};


// ─── Breadcrumb ───────────────────────────────────────────────────────────────
const BREADCRUMB_MAP = {
  '/admin':                   [{ label: 'Dashboard' }],
  '/admin/laboratorios':      [{ label: 'Laboratorios' }],
  '/admin/usuarios':          [{ label: 'Usuarios' }],
  '/admin/horarios':          [{ label: 'Horarios' }],
  '/admin/reservaciones':     [{ label: 'Reservaciones' }],
  '/admin/inventario':        [{ label: 'Inventario' }],
  '/admin/prestamos':         [{ label: 'Préstamos' }],
  '/admin/mantenimiento':     [{ label: 'Mantenimiento' }],
  '/admin/auditoria':          [{ label: 'Bitacora de Auditoria' }],
  '/admin/catalogo':          [{ label: 'Catálogos' }],
  '/admin/reportes':          [{ label: 'Reportes' }],
};

function Breadcrumb({ pathname }) {
  // Match dynamic routes like /admin/laboratorios/5 or /admin/sesion/3
  let crumbs = BREADCRUMB_MAP[pathname];
  if (!crumbs) {
    const labMatch = pathname.match(/^\/admin\/laboratorios\/(\d+)/);
    const sesMatch = pathname.match(/^\/admin\/sesion\/(\d+)/);
    if (labMatch) crumbs = [{ label: 'Laboratorios', to: '/admin/laboratorios' }, { label: 'Detalle' }];
    else if (sesMatch) crumbs = [{ label: 'Sesión activa' }];
    else return null;
  }

  if (!crumbs || crumbs.length <= 1) return null; // Don't show for single-level

  return (
    <nav className="flex items-center gap-1.5 text-xs text-slate-500 px-6 py-1.5"
         style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(15,23,42,0.5)' }}>
      <span className="text-slate-600">Sistema</span>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          <svg className="w-3 h-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
          </svg>
          {c.to
            ? <NavLink to={c.to} className="text-slate-400 hover:text-white transition-colors">{c.label}</NavLink>
            : <span className={i === crumbs.length - 1 ? 'text-slate-300 font-medium' : 'text-slate-500'}>{c.label}</span>
          }
        </React.Fragment>
      ))}
    </nav>
  );
}

// ─── Layout principal ─────────────────────────────────────────────────────────
export default function AdminLayout({ children }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [modalPwd,    setModalPwd]    = useState(false);
  const [modalLibre,  setModalLibre]  = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const itemsVisibles = NAV_ITEMS.filter(item => item.roles.includes(usuario?.rol));

  return (
    <div className="h-screen overflow-hidden flex" style={{background:'#0f172a'}}>

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-[60px]'} shrink-0 flex flex-col transition-all duration-200`}
        style={{
          background: 'linear-gradient(180deg,#0d1b2e 0%,#0a1628 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          overflow: 'visible',   /* permite que los tooltips salgan del aside */
        }}
      >
        {/* Logo */}
        <div className="px-3 py-5 flex items-center gap-3"
             style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center"
               style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)'}}>
            <svg className="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          {sidebarOpen && (
            <div>
              <p className="text-white font-bold text-sm leading-none">LabControl</p>
              <p className="text-slate-500 text-[10px] mt-0.5">UTECAN</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-visible">
          {itemsVisibles.map(item => (
            <div key={item.path} className="relative group">
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `nav-item flex items-center gap-3 px-2.5 py-2.5 text-sm font-medium
                   ${isActive ? 'nav-active' : 'text-slate-400'}`
                }
              >
                <span className="shrink-0">{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
              </NavLink>

              {/* Tooltip — solo visible cuando sidebar colapsado */}
              {!sidebarOpen && (
                <div
                  className="pointer-events-none absolute left-full top-1/2 ml-3 z-50
                             opacity-0 group-hover:opacity-100
                             transition-opacity duration-150"
                  style={{ transform: 'translateY(-50%)' }}
                >
                  {/* Triángulo izquierdo */}
                  <div style={{
                    position: 'absolute', left: '-4px', top: '50%',
                    transform: 'translateY(-50%)',
                    width: 0, height: 0,
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent',
                    borderRight: '4px solid rgba(30,41,59,0.97)',
                  }} />
                  <span style={{
                    display: 'block',
                    background: 'rgba(30,41,59,0.97)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '5px 11px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#e2e8f0',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                  }}>
                    {item.label}
                  </span>
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="mx-2 mb-4 p-2 text-slate-500 hover:text-white rounded-xl transition-colors flex items-center justify-center"
          style={{background:'rgba(255,255,255,0.04)'}}
        >
          <svg className={`w-4 h-4 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
          </svg>
        </button>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar */}
        <header
          className="px-6 py-3 flex items-center justify-between shrink-0"
          style={{
            background: 'rgba(15,23,42,0.8)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div />
          <div className="flex items-center gap-2.5">

            {/* Uso libre */}
            <button
              onClick={() => setModalLibre(true)}
              className="btn-emerald flex items-center gap-2 px-3 py-1.5 text-sm"
              title="Abrir sesión de uso libre"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <span className="hidden sm:inline">Uso libre</span>
            </button>

            {/* Campana */}
            <NotificacionesBell />

            {/* Nombre + rol */}
            <div className="hidden sm:flex items-center gap-2 pl-1 border-l border-white/10 ml-1">
              <span className="text-sm text-slate-300 font-medium">{usuario?.nombre}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${ROL_BADGE[usuario?.rol] || 'bg-slate-700 text-slate-300'}`}>
                {usuario?.rol}
              </span>
            </div>

            {/* Cambiar contraseña */}
            <button
              onClick={() => setModalPwd(true)}
              className="p-1.5 text-slate-400 hover:text-wh