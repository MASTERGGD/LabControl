import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

const ROLES_REDIRECT = {
  SUPER_ADMIN: '/admin',
  LAB_ADMIN: '/lab',
  TUTORIA_ADMIN: '/admin/tutoria',
  SERVICIOS_ESCOLARES: '/servicios-escolares',
  DOCENTE: '/docente',
  ALUMNO: '/alumno/estudio-socioeconomico',
};

const PERM_SERVICIOS_ESCOLARES_MANAGE = 'servicios_escolares:manage';

function getRedirectPath(usuario) {
  if (
    usuario?.rol !== 'SUPER_ADMIN'
    && usuario?.permisos?.includes(PERM_SERVICIOS_ESCOLARES_MANAGE)
  ) {
    return '/servicios-escolares';
  }
  return ROLES_REDIRECT[usuario?.rol] || '/';
}

const PASSWORD_FIELDS = [
  ['password_actual', 'Contraseña actual', 'La contraseña temporal que recibiste', 'current-password'],
  ['password_nuevo', 'Nueva contraseña', 'Mínimo 8 caracteres', 'new-password'],
  ['confirmar', 'Confirmar nueva contraseña', 'Repite la nueva contraseña', 'new-password'],
];

function EyeIcon({ hidden }) {
  if (hidden) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    );
  }

  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

/**
 * Pantalla de cambio de contraseña obligatorio.
 *
 * Se muestra cuando el usuario debe definir una contraseña propia antes de
 * acceder al resto del sistema.
 */
export default function CambiarPasswordObligatorio() {
  const navigate = useNavigate();
  const { usuario, login } = useAuth();

  const [form, setForm] = useState({ password_actual: '', password_nuevo: '', confirmar: '' });
  const [visible, setVisible] = useState({
    password_actual: false,
    password_nuevo: false,
    confirmar: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!usuario) return <Navigate to="/login" replace />;
  if (!usuario.debe_cambiar_password) {
    return <Navigate to={getRedirectPath(usuario)} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password_nuevo !== form.confirmar) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (form.password_nuevo.length < 8) {
      setError('Mínimo 8 caracteres');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.put('/usuarios/me/password', {
        password_actual: form.password_actual,
        password_nuevo: form.password_nuevo,
      });
      const token = sessionStorage.getItem('token');
      login({ ...usuario, debe_cambiar_password: false }, token);
      navigate(getRedirectPath(usuario), { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #F5F7FA 0%, #EEF6F2 52%, #E6F3EC 100%)' }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-800">Cambio de contraseña obligatorio</h1>
          <p className="text-sm text-slate-500">
            Por seguridad, debes definir una nueva contraseña antes de usar el sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {PASSWORD_FIELDS.map(([field, label, placeholder, autoComplete]) => (
            <div key={field}>
              <label className="block text-sm text-slate-600 mb-1" htmlFor={field}>
                {label}
              </label>
              <div className="relative">
                <input
                  id={field}
                  type={visible[field] ? 'text' : 'password'}
                  required
                  value={form[field]}
                  onChange={(e) => {
                    setForm({ ...form, [field]: e.target.value });
                    setError('');
                  }}
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-11 text-sm text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setVisible(prev => ({ ...prev, [field]: !prev[field] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label={visible[field] ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
                >
                  <EyeIcon hidden={!visible[field]} />
                </button>
              </div>
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(90deg,#007A53,#00A36C)' }}
          >
            {loading ? 'Guardando...' : 'Cambiar contraseña y continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
