import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';
import NotificacionesBell from './NotificacionesBell';
import SelectDark from './SelectDark';
import ThemeSwitcher from './ThemeSwitcher';
import { useTheme } from '../context/ThemeContext';
import { usePeriodo } from '../context/PeriodoContext';

const PERM_SERVICIOS_ESCOLARES_MANAGE = 'servicios_escolares:manage';

function tieneServiciosEscolares(usuario) {
  return usuario?.rol === 'SERVICIOS_ESCOLARES'
    || (usuario?.rol !== 'SUPER_ADMIN' && usuario?.permisos?.includes(PERM_SERVICIOS_ESCOLARES_MANAGE));
}

function getHomePath(usuario) {
  if (tieneServiciosEscolares(usuario)) return '/servicios-escolares';
  if (usuario?.rol === 'ADMINISTRATIVO') return '/administrativo';
  if (usuario?.rol === 'TUTORIA_ADMIN') return '/admin/tutoria';
  if (usuario?.rol === 'MEDICO') return '/medico/consultorio';
  if (usuario?.rol === 'DOCENTE') return '/docente';
  if (usuario?.rol === 'ALUMNO') return '/alumno/estudio-socioeconomico';
  return usuario?.rol === 'SUPER_ADMIN' ? '/admin' : '/lab';
}

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
    if (form.password_nuevo.length < 10 || !/[A-Z]/.test(form.password_nuevo) || !/[a-z]/.test(form.password_nuevo) || !/\d/.test(form.password_nuevo) || !/[^A-Za-z0-9]/.test(form.password_nuevo)) { setError('Usa mínimo 10 caracteres, mayúscula, minúscula, número y símbolo'); return; }
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
                  placeholder={['Tu contraseña actual','Mínimo 10 caracteres','Repite la nueva'][i]}
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
    label: 'Inicio escolares', path: '/servicios-escolares', exact: true, roles: ['SERVICIOS_ESCOLARES'], permiso: PERM_SERVICIOS_ESCOLARES_MANAGE,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422A12.083 12.083 0 0118.5 14c0 3.314-2.91 6-6.5 6s-6.5-2.686-6.5-6c0-1.193.257-2.353.34-3.422L12 14z"/></svg>,
  },

  // Grupo: Laboratorios
  {
    label: 'Inicio plataforma', path: '/admin', exact: true, roles: ['SUPER_ADMIN'],
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7M8 11h3m-3 4h3m3-4h2m-2 4h2"/></svg>,
  },
  {
    label: 'Departamentos', path: '/admin/departamentos', roles: ['SUPER_ADMIN','ADMINISTRATIVO','SERVICIOS_ESCOLARES'], permiso: PERM_SERVICIOS_ESCOLARES_MANAGE,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V7a2 2 0 00-2-2h-3V3H10v2H7a2 2 0 00-2 2v14m14 0h2M5 21H3m4-8h2m-2 4h2m6-4h2m-2 4h2M9 9h6"/></svg>,
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

  // Grupo: Actividades docentes
  { divider: true, label: 'Actividades docentes', roles: ['DOCENTE'] },
  {
    label: 'Mi horario docente', path: '/docente/horario', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  },
  {
    label: 'Consultar horarios', path: '/docente/buscar-docente', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-9-1a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm-2.5 5.5a4.5 4.5 0 0 1 7 0"/></svg>,
  },
  {
    label: 'Historial de clases', path: '/docente/historial-clases', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 15l2 2 4-4"/></svg>,
  },
  {
    label: 'Seguimiento de grupos', path: '/docente/seguimiento', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m4 6V7m4 10v-3M4 20h16M6 4h12a2 2 0 012 2v14H4V6a2 2 0 012-2z"/></svg>,
  },
  // Grupo: Laboratorios (docente)
  { divider: true, label: 'Laboratorios', roles: ['DOCENTE'] },
  {
    label: 'Solicitar laboratorio', path: '/docente/laboratorio', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  },
  {
    label: 'Historial de laboratorio', path: '/docente/historial', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/></svg>,
  },

  // Grupo: Tutoría (docente)
  { divider: true, label: 'Tutoría', roles: ['DOCENTE'] },
  {
    label: 'Mis Tutorados', path: '/docente/mis-tutorados', roles: ['DOCENTE'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
  },

  // Grupo: Dirección de División de Carrera
  { divider: true, label: 'Seguimiento académico', roles: ['SUPER_ADMIN','TUTORIA_ADMIN','SERVICIOS_ESCOLARES'], permiso: 'expediente_academico:read' },
  {
    label: 'Expediente académico', path: '/expediente-academico',
    roles: ['SUPER_ADMIN','TUTORIA_ADMIN','SERVICIOS_ESCOLARES'],
    permiso: 'expediente_academico:read', inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0118 13.5C18 16.538 15.314 19 12 19s-6-2.462-6-5.5c0-1.025.304-1.985.84-2.922L12 14z"/></svg>,
  },

  // Grupo: Dirección de División de Carrera
  { divider: true, label: 'Dirección de División de Carrera', roles: [], permiso: 'materias:manage', ocultarSuperAdmin: true },
  {
    label: 'Materias', path: '/division-carrera/materias', roles: [], permiso: 'materias:manage', inGroup: true, ocultarSuperAdmin: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253"/></svg>,
  },
  {
    label: 'Reportes académicos', path: '/division-carrera/reportes-academicos', roles: [], permiso: 'materias:manage', inGroup: true, ocultarSuperAdmin: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>,
  },
  { divider: true, label: 'Calendario académico', roles: ['SUPER_ADMIN','DOCENTE'], permiso: 'materias:manage' },
  {
    label: 'Calendario oficial', path: '/calendario-academico', roles: ['SUPER_ADMIN','DOCENTE'], permiso: 'materias:manage', inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  },

  // Grupo: Personas
  { divider: true, label: 'Personas', roles: ['SUPER_ADMIN','ADMINISTRATIVO'] },
  {
    label: 'Usuarios', path: '/admin/usuarios', roles: ['SUPER_ADMIN'], inGroup: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
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
  { divider: true, label: 'Servicios Escolares', roles: ['SERVICIOS_ESCOLARES'], permiso: PERM_SERVICIOS_ESCOLARES_MANAGE, ocultarSuperAdmin: true },
  {
    label: 'Panel escolares', path: '/servicios-escolares', exact: true, roles: ['SERVICIOS_ESCOLARES'], permiso: PERM_SERVICIOS_ESCOLARES_MANAGE, inGroup: true, ocultarSuperAdmin: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7M8 11h8M8 15h5"/></svg>,
  },
  {
    label: 'Alumnos', path: '/servicios-escolares/alumnos', roles: ['SERVICIOS_ESCOLARES'], permiso: PERM_SERVICIOS_ESCOLARES_MANAGE, inGroup: true, ocultarSuperAdmin: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 11-8 0 4 4 0 018 0z"/></svg>,
  },
  {
    label: 'Grupos e inscripciones', path: '/servicios-escolares/grupos', roles: ['SERVICIOS_ESCOLARES'], permiso: PERM_SERVICIOS_ESCOLARES_MANAGE, inGroup: true, ocultarSuperAdmin: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4M9 20H3v-2a4 4 0 014-4h2m7-4a4 4 0 11-8 0 4 4 0 018 0z"/></svg>,
  },
  {
    label: 'Promoción académica', path: '/servicios-escolares/promociones', roles: ['SERVICIOS_ESCOLARES'], permiso: PERM_SERVICIOS_ESCOLARES_MANAGE, inGroup: true, ocultarSuperAdmin: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17 17 7m0 0H9m8 0v8M5 5v14h14"/></svg>,
  },
  {
    label: 'Estudios socioeconómicos', path: '/servicios-escolares/estudios-socioeconomicos', roles: ['SERVICIOS_ESCOLARES'], permiso: PERM_SERVICIOS_ESCOLARES_MANAGE, inGroup: true, ocultarSuperAdmin: true,
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
    label: 'Comunicados', path: '/comunicados', roles: ['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB','ADMINISTRATIVO','TUTORIA_ADMIN','DOCENTE'], inGroup: true, badge: true,
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>,
  },
  {
    label: 'Emitir y gestionar', path: '/admin/comunicados', roles: ['SUPER_ADMIN','LAB_ADMIN','TUTORIA_ADMIN'], permiso: 'comunicados:write', inGroup: true,
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
  '/servicios-escolares/grupos': [{ label: 'Servicios Escolares', to: '/servicios-escolares' }, { label: 'Grupos e inscripciones' }],
  '/servicios-escolares/promociones': [{ label: 'Servicios Escolares', to: '/servicios-escolares' }, { label: 'Promoción académica' }],
  '/servicios-escolares/estudios-socioeconomicos': [{ label: 'Servicios Escolares', to: '/servicios-escolares' }, { label: 'Estudios socioeconómicos' }],
  '/docente':                 [{ label: 'Inicio Docente' }],
  '/docente/horario':         [{ label: 'Mi Horario' }],
  '/docente/buscar-docente':  [{ label: 'Consultar horarios' }],
  '/docente/seguimiento':     [{ label: 'Seguimiento de grupos' }],
  '/docente/laboratorio':     [{ label: 'Solicitar laboratorio' }],
  '/docente/historial':       [{ label: 'Historial de Sesiones' }],
  '/docente/historial-clases': [{ label: 'Historial de clases' }],
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
  '/division-carrera/materias': [{ label: 'Académico' }, { label: 'Materias' }],
  '/division-carrera/reportes-academicos': [{ label: 'Académico' }, { label: 'Reportes académicos' }],
  '/calendario-academico': [{ label: 'Académico' }, { label: 'Calendario oficial' }],
  '/expediente-academico':   [{ label: 'Académico' }, { label: 'Expediente académico' }],
  '/docente/horario':         [{ label: 'Mi Horario' }],
  '/comunicados':             [{ label: 'Comunicados' }],
  '/admin/comunicados':       [{ label: 'Emitir y gestionar comunicados' }],
  '/admin/reportes':          [{ label: 'Reportes' }],
  '/admin/tutoria':           [{ label: 'Panel de Tutoría' }],
  '/docente/mis-tutorados':   [{ label: 'Mis Tutorados' }],
  '/medico/consultorio':      [{ label: 'Consultorio Médico' }],
};

const SIDEBAR_DOMAINS = [
  {
    key: 'academico', label: 'Académico',
    matches: path => ['/division-carrera', '/calendario-academico', '/expediente-academico', '/servicios-escolares', '/docente', '/admin/tutoria', '/medico']
      .some(prefix => path === prefix || path.startsWith(`${prefix}/`)),
  },
  {
    key: 'espacios-equipo', label: 'Espacios y equipo',
    matches: path => ['/lab', '/espacios', '/admin/laboratorios', '/admin/horarios', '/admin/reservaciones', '/admin/reportes', '/admin/espacios', '/admin/inventario', '/admin/prestamos', '/admin/mantenimiento']
      .some(prefix => path === prefix || path.startsWith(`${prefix}/`)),
  },
  {
    key: 'comunicacion', label: 'Comunicación',
    matches: path => path === '/comunicados' || path.startsWith('/comunicados/')
      || path === '/admin/comunicados' || path.startsWith('/admin/comunicados/'),
  },
  { key: 'administracion', label: 'Administración', matches: () => true },
];

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
  const homePath = getHomePath(usuario);
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

  // Los permisos deciden qué destinos existen; los dominios mantienen el mismo
  // mapa mental para todos los perfiles y las secciones vacías se omiten.
  const visibleDestinations = itemsVisibles.filter(item => !item.divider);
  const rootItems = visibleDestinations.filter(item => item.exact && item.path === homePath);
  const domainItems = visibleDestinations.filter(item => !rootItems.includes(item));
  const groups = [
    { key: 'principal', label: 'Principal', items: rootItems, root: true },
    ...SIDEBAR_DOMAINS.map(domain => ({
      key: domain.key,
      label: domain.label,
      items: domainItems.filter(item => SIDEBAR_DOMAINS.find(candidate => candidate.matches(item.path))?.key === domain.key),
      root: false,
    })),
  ].filter(group => group.items.length > 0);

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
            {usuario?.departamento_nombre && (
              <p
                className="text-[10px] mt-1 truncate"
                style={{color:'var(--sidebar-subtitle)'}}
                title={`${usuario.departamento_nombre}${usuario.departamento_clave ? ` · ${usuario.departamento_clave}` : ''}`}
              >
                {usuario.departamento_nombre}{usuario.departamento_clave ? ` · ${usuario.departamento_clave}` : ''}
              </p>
            )}
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
          groups.map(group => (
              <div key={group.key} className={group.root ? '' : 'mt-3'}>
                {!group.root && (
                  <p
                    className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.14em]"
                    style={{color:'var(--sidebar-section-label, #64748b)'}}
                  >
                    {group.label}
                  </p>
                )}
                <div className="space-y-1">
                  {group.items.map(item => renderNavItem(item, false))}
                </div>
              </div>
          ))
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
  const { usuario, logout, cambiarFuncion, cerrarOtrasSesiones, sessionInfo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const homePath = getHomePath(usuario);
  const { themeKey } = useTheme();
  const { periodos, periodo, periodoActual, esHistorico, esPreparacion, esCerrado, cargando: cargandoPeriodos, seleccionarPeriodo } = usePeriodo();
  const isDay = themeKey === 'day';
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [menuMovil,    setMenuMovil]    = useState(false);
  const [modalPwd,     setModalPwd]     = useState(false);
  const [modalLibre,   setModalLibre]   = useState(false);
  const [pendientesComunicados, setPendientesComunicados] = useState(0);
  const [espaciosResponsable, setEspaciosResponsable] = useState([]);
  const [cambiandoFuncion, setCambiandoFuncion] = useState(false);
  const [mostrarSesiones, setMostrarSesiones] = useState(false);
  const [avisoSesiones, setAvisoSesiones] = useState(false);
  const [cerrandoSesiones, setCerrandoSesiones] = useState(false);
  const sesionesRef = useRef(null);

  // Cerrar menú móvil al navegar
  useEffect(() => { setMenuMovil(false); }, [location.pathname]);

  useEffect(() => {
    const conteo = sessionInfo?.active_count || 1;
    const claveAviso = `labcontrol_session_notice_v1_${usuario?.id || 'anon'}`;
    if (conteo <= 1) {
      sessionStorage.removeItem(claveAviso);
      setAvisoSesiones(false);
      return undefined;
    }
    const otrasSesiones = (sessionInfo?.active_sessions || [])
      .filter(sesion => !sesion.current)
      .map(sesion => sesion.session_id)
      .sort();
    const huella = otrasSesiones.length ? otrasSesiones.join('|') : `count:${conteo}`;
    if (sessionStorage.getItem(claveAviso) === huella) return undefined;

    // Se recuerda al mostrarlo, no solo al cerrarlo, para que navegar o volver
    // a enfocar la ventana no repita el mismo aviso. Una sesión nueva cambia
    // la huella y vuelve a notificar.
    sessionStorage.setItem(claveAviso, huella);
    setAvisoSesiones(true);
    const timer = window.setTimeout(() => setAvisoSesiones(false), 9000);
    return () => window.clearTimeout(timer);
  }, [sessionInfo?.active_count, sessionInfo?.active_sessions, usuario?.id]);

  useEffect(() => {
    if (!mostrarSesiones) return undefined;
    const cerrar = event => {
      if (!sesionesRef.current?.contains(event.target)) setMostrarSesiones(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [mostrarSesiones]);

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
  const handleCambiarFuncion = async (rol) => {
    if (!rol || rol === usuario?.rol) return;
    setCambiandoFuncion(true);
    try {
      const actualizado = await cambiarFuncion(rol);
      navigate(getHomePath(actualizado), { replace: true });
    } catch (err) {
      window.alert(err.response?.data?.detail || 'No se pudo cambiar la función activa.');
    } finally {
      setCambiandoFuncion(false);
    }
  };
  const handleCerrarOtrasSesiones = async () => {
    setCerrandoSesiones(true);
    try {
      await cerrarOtrasSesiones();
      setAvisoSesiones(false);
      setMostrarSesiones(false);
    } catch (err) {
      window.alert(err.response?.data?.detail || 'No se pudieron cerrar las otras sesiones.');
    } finally {
      setCerrandoSesiones(false);
    }
  };
  const puedeGestionarEspacios = usuario?.rol === 'SUPER_ADMIN'
    || usuario?.rol === 'LAB_ADMIN'
    || espaciosResponsable.length > 0;
  const itemsVisibles = NAV_ITEMS.filter(item => {
    if (usuario?.rol === 'SUPER_ADMIN' && item.ocultarSuperAdmin) return false;
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

            {/* Contexto académico global: inicia en el periodo actual y permite consultar históricos. */}
            {periodo && (
              <label
                className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
                style={{
                  background: 'var(--topbar-bg)',
                  borderColor: 'var(--topbar-border)',
                }}
                title={esPreparacion ? 'Periodo en preparación' : esCerrado ? 'Cuatrimestre cerrado: solo consulta' : esHistorico ? 'Periodo histórico en modo consulta' : 'Periodo académico activo'}
              >
                <svg className={`w-4 h-4 shrink-0 ${esHistorico ? 'text-slate-500' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                <span className="hidden lg:block text-[10px] font-bold uppercase tracking-wider text-slate-500">Periodo</span>
                <select
                  value={periodo.id}
                  disabled={cargandoPeriodos}
                  onChange={event => seleccionarPeriodo(event.target.value)}
                  className="max-w-[180px] sm:max-w-[260px] bg-transparent text-xs font-semibold outline-none cursor-pointer"
                  style={{color:'var(--main-text)'}}
                  aria-label="Periodo académico de trabajo"
                >
                  {periodos.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.clave}{item.estado_periodo === 'CERRADO' ? ' · Cerrado' : item.estado_periodo === 'PREPARACION' ? ' · En preparación' : item.es_actual ? ' · Actual' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Campana */}
            <NotificacionesBell comunicadosPendientes={pendientesComunicados} />
            <ThemeSwitcher />

            {sessionInfo?.active_count > 1 && (
              <div className="relative" ref={sesionesRef}>
                <button
                  type="button"
                  onClick={() => setMostrarSesiones(actual => !actual)}
                  className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
                  style={{borderColor:'var(--topbar-border)', color:'var(--main-text)', background:'var(--topbar-bg)'}}
                  title="Ver sesiones de esta cuenta"
                  aria-expanded={mostrarSesiones}
                >
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"/><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"/></span>
                  {sessionInfo.active_count} sesiones
                </button>
                {mostrarSesiones && (
                  <div className="absolute right-0 top-full z-[80] mt-2 w-80 rounded-2xl border p-3 shadow-2xl" style={{background:'var(--topbar-bg)', borderColor:'var(--topbar-border)', color:'var(--main-text)'}}>
                    <p className="text-sm font-semibold">Sesiones de tu cuenta</p>
                    <p className="mt-0.5 text-xs text-slate-500">Las pestañas de este navegador se agrupan como una sola sesión.</p>
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                      {sessionInfo.active_sessions.map(sesion => (
                        <div key={sesion.session_id} className="rounded-xl border px-3 py-2 text-xs" style={{borderColor:'var(--topbar-border)'}}>
                          <div className="flex items-center justify-between gap-2"><span className="font-semibold">{sesion.current ? 'Este navegador' : 'Otro navegador o dispositivo'}</span>{sesion.current && <span className="text-emerald-600">Actual</span>}</div>
                          <p className="mt-1 truncate text-slate-500">{sesion.path || 'SIGA'} · actividad reciente</p>
                        </div>
                      ))}
                    </div>
                    <button type="button" disabled={cerrandoSesiones} onClick={handleCerrarOtrasSesiones} className="mt-3 w-full rounded-xl border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                      {cerrandoSesiones ? 'Cerrando…' : 'Cerrar las otras sesiones'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {usuario?.roles_disponibles?.length > 1 && (
              <label className="flex items-center gap-1.5 rounded-xl border px-2 py-1" style={{borderColor:'var(--topbar-border)', background:'var(--topbar-bg)'}} title="Cambiar la función activa sin cerrar sesión">
                <span className="hidden text-[10px] font-bold uppercase tracking-wide text-slate-500 xl:block">Modo</span>
                <select value={usuario.rol} disabled={cambiandoFuncion} onChange={e => handleCambiarFuncion(e.target.value)} className="bg-transparent text-xs font-semibold outline-none" style={{color:'var(--main-text)'}} aria-label="Función activa">
                  {usuario.roles_disponibles.map(rol => <option key={rol} value={rol}>{rol === 'DOCENTE' ? 'Docente' : rol === 'LAB_ADMIN' ? 'Responsable de laboratorio' : rol.replaceAll('_', ' ')}</option>)}
                </select>
              </label>
            )}

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
          {esHistorico && periodo && usuario?.rol !== 'DOCENTE' && (
            <div
              className="mb-4 rounded-xl px-4 py-3 text-sm flex items-start gap-3"
              style={{
                background: isDay ? '#F1F5F9' : 'rgba(148,163,184,0.08)',
                border: `1px solid ${isDay ? '#E2E8F0' : 'rgba(148,163,184,0.18)'}`,
                color: isDay ? '#475569' : '#CBD5E1',
              }}
              role="status"
            >
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <div className="flex-1">
                <p className="font-semibold">{esPreparacion ? 'En preparación' : esCerrado ? 'Cuatrimestre cerrado' : 'Consultando'} · {periodo.clave}</p>
                <p className="text-xs mt-0.5 opacity-80">
                  {esPreparacion
                    ? 'Preparación según tus permisos. El registro de clases aún no está habilitado.'
                    : esCerrado
                      ? 'Solo consulta. No se pueden crear ni activar materias.'
                      : 'Estás consultando información de un periodo histórico.'}
                </p>
              </div>
              {periodoActual && (
                <button
                  type="button"
                  onClick={() => seleccionarPeriodo(periodoActual.id)}
                  className="shrink-0 rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
                >
                  Volver al actual
                </button>
              )}
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Modales */}
      {modalPwd   && <ModalCambiarPassword onClose={() => setModalPwd(false)} />}
      {modalLibre && <ModalSesionLibre usuario={usuario} onClose={() => setModalLibre(false)} />}
      {avisoSesiones && sessionInfo?.active_count > 1 && (
        <div className="fixed bottom-5 right-5 z-[100] w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-2xl" role="status">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m0 3.75h.008M10.3 3.9 1.8 18a1.75 1.75 0 0 0 1.5 2.6h17.4a1.75 1.75 0 0 0 1.5-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Tu cuenta está abierta en otro lugar</p><p className="mt-1 text-xs opacity-80">Puedes revisar las sesiones activas desde el indicador “{sessionInfo.active_count} sesiones” de la barra superior.</p></div>
            <button type="button" onClick={() => setAvisoSesiones(false)} className="rounded-lg p-1 hover:bg-amber-100" aria-label="Cerrar aviso">×</button>
          </div>
        </div>
      )}
    </div>
  );
}
