import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';
import NotificacionesBell from './NotificacionesBell';
import SelectDark from './SelectDark';
import ThemeSwitcher from './ThemeSwitcher';
import { useTheme } from '../context/ThemeContext';

function BrandMark({ size = 'w-8 h-8', imageSize = 'w-[78%] h-[78%]' }) {
  return (
    <div
      className={`${size} rounded-xl shrink-0 flex items-center justify-center overflow-hidden group-hover:opacity-80 transition-opacity`}
      style={{ background: 'var(--logo-bg)' }}
    >
      <img
        src="/icons/icon-192.png"
        alt=""
        aria-hidden="true"
        draggable="false"
        className={`${imageSize} object-contain`}
      />
    </div>
  );
}

// Modal: Cambiar contraseña
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
          <h3 className="font-semibold text-white">Cambiar contraseña</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        {ok ? (
          <div className="p-6 text-center space-y-4">
            <div className="text-4xl">OK</div>
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
                {loading ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Modal: Sesión de uso libre
function ModalSesionLibre({ usuario, onClose }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
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
        tipo_sesion:      'LIBRE',
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
      <div
        className="w-full max-w-md animate-fadeUp"
        style={{
          background: isDay ? '#FFFFFF' : 'var(--glass-bg)',
          border: `1px solid ${isDay ? '#CBD5E1' : 'var(--glass-border)'}`,
          borderRadius: '1rem',
          boxShadow: isDay ? '0 24px 70px rgba(15,23,42,0.20)' : '0 20px 60px rgba(0,0,0,0.30)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${isDay ? '#E2E8F0' : 'rgba(255,255,255,0.05)'}` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{background:'linear-gradient(135deg,#10b981,#059669)'}}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <h3 className={`font-semibold ${isDay ? 'text-slate-950' : 'text-white'}`}>Sesión de uso libre</h3>
              <p className={`text-xs ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Para alumnos sin clase programada</p>
            </div>
          </div>
          <button onClick={onClose} className={`${isDay ? 'text-slate-500 hover:text-slate-950' : 'text-slate-400 hover:text-white'} transition-colors`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {sesionActiva && (
            <div className={`rounded-xl p-3 text-sm border ${
              isDay ? 'bg-amber-50 border-amber-300' : 'bg-amber-950/40 border-amber-700/40'
            }`}>
              <p className={`font-semibold ${isDay ? 'text-amber-900' : 'text-amber-400'}`}>Ya hay una sesión abierta en este laboratorio</p>
              <p className={`text-xs mt-0.5 ${isDay ? 'text-amber-800/80' : 'text-slate-400'}`}>{sesionActiva.materia} · {sesionActiva.grupo}</p>
              <button onClick={() => { onClose(); navigate(`/admin/sesion/${sesionActiva.id}`); }}
                className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-white py-1.5 rounded-lg text-xs font-semibold transition-colors">
                Ir a la sesión activa
              </button>
            </div>
          )}

          {usuario?.rol === 'SUPER_ADMIN' ? (
            <div>
              <label className={`block text-sm mb-1.5 ${isDay ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>Laboratorio</label>
              <SelectDark
                value={labId}
                onChange={setLabId}
                options={labs.map(l => ({ value: l.id, label: l.nombre }))}
              />
            </div>
          ) : (
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: isDay ? '#F8FAFC' : 'rgba(30,41,59,0.5)', border: `1px solid ${isDay ? '#E2E8F0' : 'var(--glass-border)'}`, borderRadius: '0.75rem' }}>
              <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <div>
                <p className={`text-xs ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Laboratorio</p>
                <p className={`text-sm font-medium ${isDay ? 'text-slate-950' : 'text-white'}`}>{labNombre}</p>
              </div>
            </div>
          )}

          <div>
            <label className={`block text-sm mb-1.5 ${isDay ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
              Motivo <span className={isDay ? 'text-slate-500' : 'text-slate-600'}>(opcional)</span>
            </label>
            <input type="text" value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Ej: Tareas, exámenes, acceso abierto..."
              className="input-dark" />
          </div>

          <div>
            <label className={`block text-sm mb-2 ${isDay ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>Duración estimada</label>
            <div className="grid grid-cols-4 gap-2">
              {[30, 45, 60, 90].map(m => (
                <button key={m} type="button" onClick={() => setDuracion(m)}
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all
                    ${duracion === m
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-glow-em'
                      : isDay
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'}`}>
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <div className={`p-3 text-xs space-y-1 ${isDay ? 'text-slate-700' : 'text-slate-400'}`} style={{ background: isDay ? '#F8FAFC' : 'rgba(30,41,59,0.5)', border: `1px solid ${isDay ? '#E2E8F0' : 'var(--glass-border)'}`, borderRadius: '0.75rem' }}>
            <p>- Los alumnos quedan registrados al asignarles una PC en el mapa</p>
            <p>- Al cerrar la sesión se libera el registro de todos los equipos</p>
            <p>- La sesión aparece en el historial del laboratorio</p>
          </div>

          {error && (
            <div className={`rounded-xl px-3 py-2.5 text-sm border ${
              isDay ? 'bg-red-50 border-red-300 text-red-800' : 'bg-red-950/50 border-red-800/50 text-red-300'
            }`}>
              <p className="font-semibold leading-snug">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleAbrir} disabled={saving || !labId || !!sesionActiva}
              className="btn-emerald flex-1">
              {saving ? 'Abriendo...' : 'Abrir sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Navegación
// divider: true - encabezado de sección (no es un NavLink)
// inGroup: true - ítem dentro de una sección (indentación extra en sidebar abierto)
const NAV_ITEMS = [
  // Inicio por rol (sin grupo, siempre visible arriba)
  {
    label: 'Inicio docente', path: '/docente', exact: true, roles: ['DOCENTE'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  },
  {
    label: 'Inicio administrativo', path: '/administrativo', exact: true, roles: ['ADMINISTRATIVO'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  },
  {
    label: 'Inicio tutoría', path: '/admin/tutoria', exact: true, roles: ['TUTORIA_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  },
  {
    label: 'Inicio escolares', path: '/servicios-escolares', exact: true, roles: ['SERVICIOS_ESCOLARES'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422A12.083 12.083 0 0118.5 14c0 3.314-2.91 6-6.5 6s-6.5-2.686-6.5-6c0-1.193.257-2.353.34-3.422L12 14z"/></svg>,
  },

  // Grupo: Laboratorios
  {
    label: 'Inicio plataforma', path: '/admin', exact: true, roles: ['SUPER_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7M8 11h3m-3 4h3m3-4h2m-2 4h2"/></svg>,
  },
  { divider: true, label: 'Laboratorios', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB'] },
  {
    label: 'Dashboard laboratorio', path: '/lab', exact: true, roles: ['SUPER_ADMIN','LAB_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  },
  {
    label: 'Laboratorios', path: '/admin/laboratorios', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
  },
  {
    label: 'Horarios', path: '/admin/horarios', roles: ['SUPER_ADMIN','LAB_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  },
  {
    label: 'Reservaciones', path: '/admin/reservaciones', roles: ['SUPER_ADMIN','LAB_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  },
  {
    label: 'Reportes', path: '/admin/reportes', roles: ['SUPER_ADMIN','LAB_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
  },

  // Grupo: Inventario institucional
  { divider: true, label: 'Inventario institucional', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB','ADMINISTRATIVO'], permiso: 'inventario:read' },
  {
    label: 'Activos', path: '/admin/inventario', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB','ADMINISTRATIVO'], permiso: 'inventario:read', inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
  },
  {
    label: 'Préstamos de activos', path: '/admin/prestamos', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>,
  },
  {
    label: 'Mantenimiento de activos', path: '/admin/mantenimiento', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB','ADMINISTRATIVO'], permiso: 'inventario:read', inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  },

  // Grupo: Docencia
  { divider: true, label: 'Laboratorios', roles: ['DOCENTE'] },
  {
    label: 'Solicitar laboratorio', path: '/docente/horario', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  },
  {
    label: 'Historial de sesiones', path: '/docente/historial', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/></svg>,
  },

  // Grupo: Tutoría (docente)
  { divider: true, label: 'Tutoría', roles: ['DOCENTE'] },
  {
    label: 'Mis Tutorados', path: '/docente/mis-tutorados', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
  },

  // Grupo: Personas
  { divider: true, label: 'Personas', roles: ['SUPER_ADMIN','ADMINISTRATIVO'] },
  {
    label: 'Usuarios', path: '/admin/usuarios', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  },
  {
    label: 'Departamentos', path: '/admin/departamentos', roles: ['SUPER_ADMIN','ADMINISTRATIVO'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V7a2 2 0 00-2-2h-3V3H10v2H7a2 2 0 00-2 2v14m14 0h2M5 21H3m4-8h2m-2 4h2m6-4h2m-2 4h2M9 9h6"/></svg>,
  },
  {
    label: 'Catálogos', path: '/admin/catalogo', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>,
  },
  {
    label: 'Adeudos y préstamos', path: '/admin/consulta-persona', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z"/></svg>,
  },
  {
    label: 'Historial de laboratorio', path: '/admin/historial-alumno', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  },
  {
    label: 'Adeudos', path: '/admin/adeudos', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>,
  },

  // Grupo: Espacios
  { divider: true, label: 'Servicios Escolares', roles: ['SUPER_ADMIN','SERVICIOS_ESCOLARES'] },
  {
    label: 'Panel escolares', path: '/servicios-escolares', exact: true, roles: ['SUPER_ADMIN','SERVICIOS_ESCOLARES'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7M8 11h8M8 15h5"/></svg>,
  },
  {
    label: 'Alumnos', path: '/servicios-escolares/alumnos', roles: ['SUPER_ADMIN','SERVICIOS_ESCOLARES'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 11-8 0 4 4 0 018 0z"/></svg>,
  },
  {
    label: 'Estudios socioeconómicos', path: '/servicios-escolares/estudios-socioeconomicos', roles: ['SUPER_ADMIN','SERVICIOS_ESCOLARES'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/></svg>,
  },

  { divider: true, label: 'Salas y espacios', roles: ['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO','DOCENTE'] },
  {
    label: 'Solicitar sala o espacio', path: '/espacios/apartar', roles: ['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO','DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  },
  {
    label: 'Mis solicitudes de espacios', path: '/espacios/mis-solicitudes', roles: ['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO','DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>,
  },
  {
    label: 'Bandeja aprobación', path: '/espacios/bandeja', roles: ['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO'], inGroup: true, requiereResponsableEspacios: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  },
  {
    label: 'Gestión de espacios', path: '/admin/espacios', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>,
  },

  // Grupo: Comunicados
  { divider: true, label: 'Comunicados', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB','ADMINISTRATIVO','TUTORIA_ADMIN','DOCENTE'] },
  {
    label: 'Mis comunicados', path: '/comunicados', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB','ADMINISTRATIVO','TUTORIA_ADMIN','DOCENTE'], inGroup: true, badge: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>,
  },
  {
    label: 'Gestión comunicados', path: '/admin/comunicados', roles: ['SUPER_ADMIN','LAB_ADMIN','TUTORIA_ADMIN'], permiso: 'comunicados:write', inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>,
  },

  // Grupo: Tutoría (responsable)
  { divider: true, label: 'Tutoría', roles: ['SUPER_ADMIN','TUTORIA_ADMIN'] },
  {
    label: 'Panel de Tutoría', path: '/admin/tutoria', exact: true, roles: ['SUPER_ADMIN','TUTORIA_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
  },

  // Grupo: Consultorio Médico
  { divider: true, label: 'Consultorio Médico', roles: ['MEDICO','SUPER_ADMIN'] },
  {
    label: 'Consultorio', path: '/medico/consultorio', roles: ['MEDICO','SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>,
  },

  // Grupo: Auditoría
  { divider: true, label: 'Auditoría', roles: ['SUPER_ADMIN'] },
  {
    label: 'Bitácora', path: '/admin/auditoria', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>,
  },
  {
    label: 'Respaldos', path: '/admin/respaldos', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6c0 1.657 3.582 3 8 3s8-1.343 8-3-3.582-3-8-3-8 1.343-8 3zm0 0v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6m-16 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6"/></svg>,
  },
];

// Tema oscuro: fondos semitransparentes con texto claro
const ROL_BADGE = {
  SUPER_ADMIN:         'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  LAB_ADMIN:           'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  RESPONSABLE_LAB:     'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  ADMINISTRATIVO:      'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  TUTORIA_ADMIN:       'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
  SERVICIOS_ESCOLARES: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
  MEDICO:              'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  DOCENTE:             'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

// Tema claro: fondos pastel con texto oscuro (alto contraste WCAG)
const ROL_BADGE_DAY = {
  SUPER_ADMIN:         { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' },
  LAB_ADMIN:           { background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' },
  RESPONSABLE_LAB:     { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
  ADMINISTRATIVO:      { background: '#fef3c7', color: '#78350f', border: '1px solid #fcd34d' },
  TUTORIA_ADMIN:       { background: '#cffafe', color: '#155e75', border: '1px solid #67e8f9' },
  SERVICIOS_ESCOLARES: { background: '#e0e7ff', color: '#3730a3', border: '1px solid #a5b4fc' },
  MEDICO:              { background: '#ffe4e6', color: '#9f1239', border: '1px solid #fda4af' },
  DOCENTE:             { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
};

// Helper para obtener el estilo del badge según tema
function getRolBadgeStyle(rol, isDay) {
  if (isDay) return ROL_BADGE_DAY[rol] || { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
  return null; // usa clases CSS en oscuro
}
function getRolBadgeClass(rol, isDay) {
  if (isDay) return '';
  return ROL_BADGE[rol] || 'bg-slate-700 text-slate-300';
}


// Breadcrumb
const BREADCRUMB_MAP = {
  '/admin':                   [{ label: 'Inicio Plataforma' }],
  '/lab':                     [{ label: 'Dashboard Laboratorio' }],
  '/administrativo':          [{ label: 'Inicio Administrativo' }],
  '/servicios-escolares':     [{ label: 'Servicios Escolares' }],
  '/servicios-escolares/alumnos': [{ label: 'Servicios Escolares', to: '/servicios-escolares' }, { label: 'Alumnos' }],
  '/servicios-escolares/estudios-socioeconomicos': [{ label: 'Servicios Escolares', to: '/servicios-escolares' }, { label: 'Estudios socioeconómicos' }],
  '/docente':                 [{ label: 'Inicio Docente' }],
  '/docente/horario':         [{ label: 'Mi Horario' }],
  '/docente/historial':       [{ label: 'Historial de Sesiones' }],
  '/admin/laboratorios':      [{ label: 'Laboratorios' }],
  '/admin/usuarios':          [{ label: 'Usuarios' }],
  '/admin/departamentos':     [{ label: 'Departamentos' }],
  '/admin/horarios':          [{ label: 'Horarios' }],
  '/admin/reservaciones':     [{ label: 'Reservaciones' }],
  '/admin/espacios':          [{ label: 'Gestión de Espacios' }],
  '/espacios/apartar':        [{ label: 'Solicitar Sala o Espacio' }],
  '/espacios/bandeja':        [{ label: 'Bandeja de Aprobación' }],
  '/espacios/mis-solicitudes':[{ label: 'Mis Solicitudes de Espacios' }],
  '/admin/inventario':        [{ label: 'Inventario institucional' }],
  '/admin/inventario/bajas':  [{ label: 'Inventario institucional' }],
  '/admin/inventario/levantamientos': [{ label: 'Inventario institucional' }],
  '/admin/prestamos':         [{ label: 'Inventario institucional' }, { label: 'Préstamos de activos' }],
  '/admin/mantenimiento':     [{ label: 'Inventario institucional' }, { label: 'Mantenimiento de activos' }],
  '/admin/auditoria':          [{ label: 'Bitácora de Auditoría' }],
  '/admin/respaldos':          [{ label: 'Respaldo y Continuidad' }],
  '/admin/adeudos':           [{ label: 'Adeudos' }],
  '/admin/consulta-persona':  [{ label: 'Adeudos y préstamos' }],
  '/admin/historial-alumno':  [{ label: 'Historial de laboratorio' }],
  '/admin/catalogo':          [{ label: 'Catálogos' }],
  '/docente/horario':         [{ label: 'Mi Horario' }],
  '/comunicados':             [{ label: 'Mis Comunicados' }],
  '/admin/comunicados':       [{ label: 'Gestión de Comunicados' }],
  '/admin/reportes':          [{ label: 'Reportes' }],
  '/admin/tutoria':           [{ label: 'Panel de Tutoría' }],
  '/docente/mis-tutorados':   [{ label: 'Mis Tutorados' }],
  '/medico/consultorio':      [{ label: 'Consultorio Médico' }],
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
         style={{ borderBottom: '1px solid var(--breadcrumb-border)', background: 'var(--breadcrumb-bg)' }}>
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

// Sidebar content (definido fuera de AdminLayout para evitar re-montaje)
function SidebarContent({ mobile, sidebarOpen, setSidebarOpen, setMenuMovil, usuario, itemsVisibles, handleLogout, pendientesComunicados, pathname }) {
  const homePath = usuario?.rol === 'ADMINISTRATIVO'
    ? '/administrativo'
    : usuario?.rol === 'SERVICIOS_ESCOLARES' ? '/servicios-escolares'
    : usuario?.rol === 'TUTORIA_ADMIN' ? '/admin/tutoria'
    : usuario?.rol === 'MEDICO' ? '/medico/consultorio'
    : usuario?.rol === 'DOCENTE' ? '/docente'
    : usuario?.rol === 'RESPONSABLE_LAB' ? '/admin/inventario'
    : usuario?.rol === 'LAB_ADMIN' ? '/lab' : '/admin';
  const storageKey = `labcontrol-sidebar-groups-v2-${usuario?.rol || 'anon'}`;
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  });
  const navRef = useRef(null);
  const scrollKey = `labcontrol-sidebar-scroll-v1-${usuario?.rol || 'anon'}-${mobile ? 'mobile' : sidebarOpen ? 'open' : 'compact'}`;
  const saveSidebarScroll = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    sessionStorage.setItem(scrollKey, String(nav.scrollTop));
  }, [scrollKey]);

  useEffect(() => {
    const saved = Number(sessionStorage.getItem(scrollKey) || 0);
    const frame = window.requestAnimationFrame(() => {
      if (navRef.current) navRef.current.scrollTop = saved;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollKey, pathname, itemsVisibles.length]);

  const groups = [];
  let current = { key: 'principal', label: 'Principal', items: [], root: true };
  itemsVisibles.forEach(item => {
    if (item.divider) {
      if (current.items.length) groups.push(current);
      current = { key: item.label, label: item.label, items: [], root: false };
    } else {
      current.items.push(item);
    }
  });
  if (current.items.length) groups.push(current);

  const isItemActive = item =>
    item.exact ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`);

  const isGroupActive = group => group.items.some(isItemActive);

  const isGroupOpen = group => {
    if (group.root) return true;
    if (Object.prototype.hasOwnProperty.call(openGroups, group.key)) {
      return openGroups[group.key] === true;
    }
    if (mobile) return isGroupActive(group);
    return true;
  };

  const toggleGroup = (key, currentlyOpen = false) => {
    setOpenGroups(prev => {
      const next = { ...prev, [key]: !currentlyOpen };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const renderNavItem = (item, grouped = false) => {
    const compact = !sidebarOpen && !mobile;
    return (
    <div key={item.path} className={`relative group ${compact ? 'mb-1' : ''}`}>
      <NavLink
        to={item.path}
        end={!!item.exact}
        onClick={() => {
          saveSidebarScroll();
          if (mobile) setMenuMovil(false);
        }}
        className={({ isActive }) =>
          `nav-item flex items-center text-sm font-medium
           ${compact ? 'w-11 h-11 mx-auto justify-center px-0 py-0 gap-0' : `gap-3 py-2.5 ${grouped ? 'px-3' : 'px-2.5'}`}
           ${isActive ? 'nav-active' : 'text-slate-400'}`
        }
      >
        {grouped && !compact && (
          <span style={{ width: 2, height: 14, borderRadius: 99,
            background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
        )}
        <span className="shrink-0 relative">
          {item.icon}
          {!sidebarOpen && !mobile && item.badge && pendientesComunicados > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-slate-900" />
          )}
        </span>
        {(sidebarOpen || mobile) && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && pendientesComunicados > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full leading-5 min-w-[18px] text-center shrink-0">
                {pendientesComunicados > 99 ? '99+' : pendientesComunicados}
              </span>
            )}
          </>
        )}
      </NavLink>

      {!sidebarOpen && !mobile && (
        <div className="pointer-events-none absolute left-full top-1/2 ml-3 z-50
                       opacity-0 group-hover:opacity-100 transition-opacity duration-150"
             style={{ transform: 'translateY(-50%)' }}>
          <div style={{
            position: 'absolute', left: '-4px', top: '50%',
            transform: 'translateY(-50%)',
            width: 0, height: 0,
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderRight: '4px solid var(--tooltip-arrow)',
          }} />
          <span style={{
            display: 'block',
            background: 'var(--tooltip-bg)',
            border: '1px solid var(--tooltip-border)',
            borderRadius: '8px', padding: '5px 11px',
            fontSize: '12px', fontWeight: 500,
            color: 'var(--tooltip-text)', whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          }}>
            {item.label}
          </span>
        </div>
      )}
    </div>
    );
  };
  return (
    <>
      {/* Logo */}
      <div className={`px-3 py-3 flex ${(!sidebarOpen && !mobile) ? 'justify-center' : 'items-center gap-3'}`}
           style={{borderBottom:'1px solid var(--sidebar-border)'}}>
        <NavLink to={homePath} onClick={() => mobile && setMenuMovil(false)}
                 className={`flex items-center group ${(!sidebarOpen && !mobile) ? 'justify-center w-10 h-10 flex-none' : 'gap-3 flex-1 min-w-0'}`}>
          <BrandMark />
          {(sidebarOpen || mobile) && (
          <div className="min-w-0 overflow-hidden">
            <p className="text-white font-bold text-sm leading-none">SIGA</p>
            <p className="text-[10px] mt-0.5" style={{color:'var(--sidebar-subtitle)'}}>UTECAN</p>
          </div>
          )}
        </NavLink>
        {mobile && (
          <button onClick={() => setMenuMovil(false)}
            className="ml-auto p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Usuario en móvil */}
      {mobile && (
        <div className="px-4 py-3" style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
          <p className="text-white text-sm font-semibold">{usuario?.nombre}</p>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold mt-1 inline-block
            ${ROL_BADGE[usuario?.rol] || 'bg-slate-700 text-slate-300'}`}>
            {usuario?.rol}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav
        ref={navRef}
        onScroll={saveSidebarScroll}
        className="flex-1 py-2 px-2 overflow-y-auto overflow-x-visible [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {!sidebarOpen && !mobile ? (
          itemsVisibles.filter(item => !item.divider).map(item => renderNavItem(item, false))
        ) : (
          groups.map(group => {
            const active = isGroupActive(group);
            const open = isGroupOpen(group);
            return (
              <div key={group.key} className={group.root ? '' : 'mt-2'}>
                {!group.root && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key, open)}
                    aria-expanded={open}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold tracking-wide transition-colors ${
                      active ? 'text-emerald-300 bg-emerald-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                    <span className="flex-1 text-left truncate">{group.label}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                )}
                {open && (
                  <div className={group.root ? 'space-y-1' : 'mt-1 space-y-1'}>
                    {group.items.map(item => renderNavItem(item, !group.root))}
                  </div>
                )}
              </div>
            );
          })
        )}
        {false && itemsVisibles.map((item, idx) => {
          // Encabezado de sección
          if (item.divider) {
            return (
              <div key={`sec-${idx}`} className="mt-3 mb-0.5">
                {(sidebarOpen || mobile) ? (
                  <p style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: 'var(--sidebar-section-label, #334155)',
                    padding: '0 10px 4px',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    paddingTop: 10, margin: 0,
                  }}>
                    {item.label}
                  </p>
                ) : (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '4px 4px 6px' }} />
                )}
              </div>
            );
          }
          // Ítem de navegación
          const grouped = item.inGroup && (sidebarOpen || mobile);
          return (
            <div key={item.path} className="relative group">
              <NavLink
                to={item.path}
                end={!!item.exact}
                className={({ isActive }) =>
                  `nav-item flex items-center gap-3 py-2.5 text-sm font-medium
                   ${grouped ? 'px-3' : 'px-2.5'}
                   ${isActive ? 'nav-active' : 'text-slate-400'}`
                }
              >
                {grouped && (
                  <span style={{ width: 2, height: 14, borderRadius: 99,
                    background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
                )}
                {/* Icono con punto rojo cuando sidebar está colapsado y hay pendientes */}
                <span className="shrink-0 relative">
                  {item.icon}
                  {!sidebarOpen && !mobile && item.badge && pendientesComunicados > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-slate-900" />
                  )}
                </span>
                {(sidebarOpen || mobile) && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && pendientesComunicados > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full leading-5 min-w-[18px] text-center shrink-0">
                        {pendientesComunicados > 99 ? '99+' : pendientesComunicados}
                      </span>
                    )}
                  </>
                )}
              </NavLink>

              {/* Tooltip solo en desktop colapsado */}
              {!sidebarOpen && !mobile && (
                <div className="pointer-events-none absolute left-full top-1/2 ml-3 z-50
                               opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                     style={{ transform: 'translateY(-50%)' }}>
                  <div style={{
                    position: 'absolute', left: '-4px', top: '50%',
                    transform: 'translateY(-50%)',
                    width: 0, height: 0,
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent',
                    borderRight: '4px solid var(--tooltip-arrow)',
                  }} />
                  <span style={{
                    display: 'block',
                    background: 'var(--tooltip-bg)',
                    border: '1px solid var(--tooltip-border)',
                    borderRadius: '8px', padding: '5px 11px',
                    fontSize: '12px', fontWeight: 500,
                    color: 'var(--tooltip-text)', whiteSpace: 'nowrap',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  }}>
                    {item.label}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Toggle desktop / Logout móvil */}
      {mobile ? (
        <button onClick={handleLogout}
          className="mx-3 mb-5 flex items-center gap-2 text-sm text-slate-400 hover:text-white
                     transition-colors px-3 py-2.5 rounded-xl hover:bg-white/5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Cerrar sesión
        </button>
      ) : (
        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`${sidebarOpen ? 'mx-2' : 'mx-auto w-11 h-11'} mb-4 p-2 rounded-xl transition-colors flex items-center justify-center`}
          style={{background:'var(--nav-toggle-bg)', color:'var(--nav-toggle-color)'}}
          title={sidebarOpen ? 'Contraer menú' : 'Expandir menú'}
          aria-label={sidebarOpen ? 'Contraer menú' : 'Expandir menú'}>
          <svg className="w-4 h-4"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            )}
          </svg>
        </button>
      )}
    </>
  );
}

// Layout principal
export default function AdminLayout({ children }) {
  const { usuario, logout, sessionInfo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const homePath = usuario?.rol === 'ADMINISTRATIVO'
    ? '/administrativo'
    : usuario?.rol === 'SERVICIOS_ESCOLARES' ? '/servicios-escolares'
    : usuario?.rol === 'TUTORIA_ADMIN' ? '/admin/tutoria'
    : usuario?.rol === 'MEDICO' ? '/medico/consultorio'
    : usuario?.rol === 'DOCENTE' ? '/docente'
    : usuario?.rol === 'RESPONSABLE_LAB' ? '/admin/inventario'
    : usuario?.rol === 'LAB_ADMIN' ? '/lab' : '/admin';
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [menuMovil,    setMenuMovil]    = useState(false);
  const [modalPwd,     setModalPwd]     = useState(false);
  const [modalLibre,   setModalLibre]   = useState(false);
  const [pendientesComunicados, setPendientesComunicados] = useState(0);
  const [espaciosResponsable, setEspaciosResponsable] = useState([]);

  // Cerrar menú móvil al navegar
  useEffect(() => { setMenuMovil(false); }, [location.pathname]);

  const fetchPendientesComunicados = useCallback(() => {
    if (!sessionStorage.getItem('token')) {
      setPendientesComunicados(0);
      return;
    }
    api.get('/comunicados/pendientes-count')
      .then(res => setPendientesComunicados(res.data?.pendientes ?? 0))
      .catch(() => {});
  }, []);

  // Polling: badge de comunicados pendientes cada 60 s
  useEffect(() => {
    fetchPendientesComunicados();
    const timer = setInterval(fetchPendientesComunicados, 60_000);
    window.addEventListener('focus', fetchPendientesComunicados);
    window.addEventListener('labcontrol:comunicados-pendientes-updated', fetchPendientesComunicados);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', fetchPendientesComunicados);
      window.removeEventListener('labcontrol:comunicados-pendientes-updated', fetchPendientesComunicados);
    };
  }, [fetchPendientesComunicados]);

  useEffect(() => {
    if (!usuario || !['SUPER_ADMIN', 'LAB_ADMIN', 'ADMINISTRATIVO'].includes(usuario.rol)) {
      setEspaciosResponsable([]);
      return;
    }
    api.get('/espacios/mis-espacios')
      .then(res => setEspaciosResponsable(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEspaciosResponsable([]));
  }, [usuario?.id, usuario?.rol]);

  useEffect(() => {
    const abrirUsoLibre = () => {
      if (['SUPER_ADMIN', 'LAB_ADMIN'].includes(usuario?.rol)) setModalLibre(true);
    };
    window.addEventListener('labcontrol:abrir-uso-libre', abrirUsoLibre);
    return () => window.removeEventListener('labcontrol:abrir-uso-libre', abrirUsoLibre);
  }, [usuario?.rol]);

  const handleLogout = useCallback(() => { logout(); navigate('/login'); }, [logout, navigate]);
  const puedeGestionarEspacios = usuario?.rol === 'SUPER_ADMIN'
    || usuario?.rol === 'LAB_ADMIN'
    || espaciosResponsable.length > 0;
  const itemsVisibles = NAV_ITEMS.filter(item => {
    // Permiso base por rol
    const porRol = item.roles.includes(usuario?.rol);
    const porPermiso = item.permiso && usuario?.permisos?.includes(item.permiso);
    // Permiso extra: acceso_consultorio permite ver el módulo sin importar el rol
    const porConsultorio = usuario?.acceso_consultorio && (
      item.path === '/medico/consultorio' ||
      (item.divider && item.label === 'Consultorio Médico')
    );
    const visible = porRol || porPermiso || porConsultorio;
    return visible && (!item.requiereResponsableEspacios || puedeGestionarEspacios);
  });

  return (
    <div className="h-screen overflow-hidden flex" style={{background:'var(--layout-bg)'}}>

      {/* Sidebar desktop (md+) */}
      <aside
        className={`hidden md:flex ${sidebarOpen ? 'w-56' : 'w-[68px]'} shrink-0 flex-col transition-all duration-200`}
        style={{
          background: 'linear-gradient(180deg,var(--sidebar-from) 0%,var(--sidebar-to) 100%)',
          borderRight: '1px solid var(--sidebar-border)',
          overflow: 'visible',
        }}
      >
        <SidebarContent mobile={false} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
                        setMenuMovil={setMenuMovil} usuario={usuario} itemsVisibles={itemsVisibles}
                        handleLogout={handleLogout} pendientesComunicados={pendientesComunicados}
                        pathname={location.pathname} />
      </aside>

      {/* Drawer móvil (< md) */}
      {menuMovil && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={() => setMenuMovil(false)} />
          {/* Panel */}
          <aside className="relative z-10 w-72 flex flex-col h-full"
                 style={{
                   background: 'linear-gradient(180deg,var(--sidebar-from) 0%,var(--sidebar-to) 100%)',
                   borderRight: '1px solid var(--sidebar-border)',
                   animation: 'slideInRight .22s ease',
                 }}>
            <SidebarContent mobile={true} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
                            setMenuMovil={setMenuMovil} usuario={usuario} itemsVisibles={itemsVisibles}
                            handleLogout={handleLogout} pendientesComunicados={pendientesComunicados}
                            pathname={location.pathname} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar */}
        <header
          className="px-3 md:px-6 py-3 flex items-center justify-between shrink-0"
          style={{
            position: 'relative',
            zIndex: 50,
            background: 'var(--topbar-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--topbar-border)',
          }}
        >
          {/* Izquierda: hamburguesa móvil */}
          <button
            className="md:hidden p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
            onClick={() => setMenuMovil(v => !v)}
            aria-label={menuMovil ? 'Cerrar menu' : 'Abrir menu'}
            aria-expanded={menuMovil}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>

          {/* Logo centrado en móvil */}
          <NavLink to={homePath} className="md:hidden flex items-center gap-2">
            <BrandMark size="w-6 h-6" imageSize="w-[76%] h-[76%]" />
            <span className="font-bold text-sm" style={{ color: isDay ? '#0f172a' : '#ffffff' }}>SIGA</span>
          </NavLink>

          {/* Espacio vacío desktop izquierda */}
          <div className="hidden md:block" />

          {/* Derecha: acciones */}
          <div className="flex items-center gap-2">

            {/* Campana */}
            <NotificacionesBell comunicadosPendientes={pendientesComunicados} />
            <ThemeSwitcher />

            {/* Nombre y rol, solo desktop */}
            <div className="hidden md:flex items-center gap-2 pl-1 ml-1" style={{borderLeft:'1px solid var(--user-sep)'}}>
              <span className="text-sm font-medium" style={{color:'var(--user-name-color)'}}>{usuario?.nombre}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${getRolBadgeClass(usuario?.rol, isDay)}`}
                style={getRolBadgeStyle(usuario?.rol, isDay) || {}}>
                {usuario?.rol}
              </span>
            </div>

            {/* Cambiar contraseña, solo desktop */}
            <button
              onClick={() => setModalPwd(true)}
              className="hidden md:block p-1.5 text-slate-400 hover:text-[var(--main-text)] rounded-xl hover:bg-white/5 transition-colors"
              title="Cambiar contraseña"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
              </svg>
            </button>

            {/* Salir, solo desktop */}
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-1.5 text-sm text-slate-400 hover:text-[var(--main-text)] transition-colors p-1.5 rounded-xl hover:bg-white/5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
              Salir
            </button>
          </div>
        </header>

        {/* Breadcrumb */}
        <Breadcrumb pathname={location.pathname} />

        {/* Contenido */}
        <main className="flex-1 overflow-auto p-3 md:p-6" style={{color:'var(--main-text)'}}>
          {sessionInfo?.active_count > 1 && (
            <div
              className="mb-4 rounded-xl px-4 py-3 text-sm flex items-start gap-3"
              style={{
                background: isDay ? '#FFFBEB' : 'rgba(146,64,14,0.18)',
                border: `1px solid ${isDay ? '#FCD34D' : 'rgba(245,158,11,0.28)'}`,
                color: isDay ? '#78350F' : '#FDE68A',
              }}
            >
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM10.29 3.86L1.82 18a1.75 1.75 0 001.5 2.65h17.36a1.75 1.75 0 001.5-2.65L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="font-semibold">Tu cuenta está activa en {sessionInfo.active_count} navegadores o pestañas.</p>
                <p className="text-xs mt-0.5 opacity-80">
                  Puedes consultar sin problema. Para editar, aprobar, cerrar sesiones o registrar consultas, evita hacerlo en dos ventanas a la vez.
                </p>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Modales */}
      {modalPwd   && <ModalCambiarPassword onClose={() => setModalPwd(false)} />}
      {modalLibre && <ModalSesionLibre usuario={usuario} onClose={() => setModalLibre(false)} />}
    </div>
  );
}
