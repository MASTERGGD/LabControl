import React, { useState, useId } from 'react';
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

export default function Login() {
  const navigate = useNavigate();
  const { login, usuario } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  if (usuario) {
    if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />;
    return <Navigate to={getRedirectPath(usuario)} replace />;
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('username', form.email);
      params.append('password', form.password);
      const { data } = await api.post('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      login(data.usuario, data.access_token);
      if (data.usuario.debe_cambiar_password) {
        navigate('/cambiar-password', { replace: true });
      } else {
        navigate(getRedirectPath(data.usuario));
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, #F5F7FA 0%, #EEF6F2 52%, #E6F3EC 100%)',
      }}
    >
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,122,83,0.055) 1px,transparent 1px),linear-gradient(90deg,rgba(0,122,83,0.055) 1px,transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        className="fixed inset-x-0 top-0 h-2 pointer-events-none"
        style={{ background: 'linear-gradient(90deg,#007A53,#00A36C)' }}
      />

      <div className="w-full max-w-md relative z-10 animate-fadeUp">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl mb-5 shadow-lg bg-white border border-emerald-100">
            <img src="/icons/icon-192.png" alt="UTECAN" className="w-20 h-20 object-contain" draggable="false" />
          </div>
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-1" style={{ color: '#059669' }}>
            Sistema Integral de Gestión Académica
          </p>
          <h1 className="text-5xl font-black tracking-[0.25em]" style={{ color: '#0F172A' }}>SIGA</h1>
          <p className="text-sm mt-2 tracking-wide" style={{ color: '#374151' }}>Universidad Tecnológica de Candelaria</p>
        </div>

        <div className="bg-white/95 border border-slate-200 shadow-xl p-8 rounded-2xl">
          <h2 className="text-lg font-semibold text-slate-950 mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5" htmlFor="email">
                Correo institucional
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="usuario@utecan.edu.mx"
                className="w-full border bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400"
                style={{ borderRadius: 8, borderColor: '#E5E7EB', boxShadow: 'none' }}
                onFocus={e => { e.target.style.borderColor = '#059669'; e.target.style.boxShadow = '0 0 0 3px rgba(5,150,105,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPass ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full border bg-white px-4 py-3 pr-11 text-slate-950 outline-none transition placeholder:text-slate-400"
                  style={{ borderRadius: 8, borderColor: '#E5E7EB', boxShadow: 'none' }}
                  onFocus={e => { e.target.style.borderColor = '#059669'; e.target.style.boxShadow = '0 0 0 3px rgba(5,150,105,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-red-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-700 px-4 text-base font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 mt-2"
              style={{ paddingTop: 14, paddingBottom: 14 }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verificando...
                </span>
              ) : 'Acceder al sistema'}
            </button>
          </form>

          <div className="mt-6 pt-5" style={{ borderTop: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
              <span>Acceso restringido al personal autorizado</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          SIGA v1.0 - UTECAN {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
