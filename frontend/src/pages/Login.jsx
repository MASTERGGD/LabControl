import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

const ROLES_REDIRECT = {
  SUPER_ADMIN: '/admin',
  LAB_ADMIN:   '/lab',
  TUTORIA_ADMIN: '/admin/tutoria',
  SERVICIOS_ESCOLARES: '/servicios-escolares',
  DOCENTE:     '/docente',
  ALUMNO:      '/alumno/estudio-socioeconomico',
};

export default function Login() {
  const navigate = useNavigate();
  const { login, usuario } = useAuth();

  // Si ya hay sesión activa → ir directo al dashboard
  const [form, setForm]       = useState({ email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  if (usuario) return <Navigate to={ROLES_REDIRECT[usuario.rol] || '/'} replace />;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      params.append('username', form.email);
      params.append('password', form.password);
      const { data } = await api.post('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      login(data.usuario, data.access_token);
      navigate(ROLES_REDIRECT[data.usuario.rol] || '/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al conectar con el servidor');
    } finally { setLoading(false); }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'radial-gradient(ellipse at 20% 30%, rgba(59,130,246,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(16,185,129,0.10) 0%, transparent 50%), #0f172a',
      }}
    >
      {/* Rejilla de fondo sutil */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="w-full max-w-md relative z-10 animate-fadeUp">

        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-glow"
            style={{background:'linear-gradient(135deg,#3b82f6 0%,#6366f1 100%)'}}
          >
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <p className="text-xs font-semibold text-blue-300 tracking-[0.2em] uppercase mb-1">
            Sistema Integral de Gestión Académica
          </p>
          <h1 className="text-5xl font-black text-white tracking-[0.25em]">SIGA</h1>
          <p className="text-slate-400 text-sm mt-2 tracking-wide">Universidad Tecnológica de Candelaria</p>
        </div>

        {/* Tarjeta glass */}
        <div className="glass shadow-glass p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5" htmlFor="email">
                Correo institucional
              </label>
              <input
                id="email" name="email" type="email" required
                value={form.email} onChange={handleChange}
                placeholder="usuario@utecan.edu.mx"
                className="input-dark"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password" name="password" type="password" required
                value={form.password} onChange={handleChange}
                placeholder="••••••••"
                className="input-dark"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-blue w-full py-3 text-base mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  Verificando…
                </span>
              ) : 'Acceder al sistema'}
            </button>
          </form>

          {/* Divisor */}
          <div className="mt-6 pt-5" style={{borderTop:'1px solid rgba(255,255,255,0.07)'}}>
            <div className="flex items-center justify-center gap-4 text-xs text-slate-600">
              <span>🔒 Acceso restringido al personal autorizado</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          SIGA v2.0 · UTECAN {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
