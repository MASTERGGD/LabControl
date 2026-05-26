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

export default function Login() {
  const navigate = useNavigate();
  const { login, usuario } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (usuario) return <Navigate to={ROLES_REDIRECT[usuario.rol] || '/'} replace />;

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
      navigate(ROLES_REDIRECT[data.usuario.rol] || '/');
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg bg-white border border-emerald-100">
            <img src="/icons/icon-192.png" alt="UTECAN" className="w-16 h-16 object-contain" draggable="false" />
          </div>
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-1" style={{ color: '#007A53' }}>
            Sistema Integral de Gestion Academica
          </p>
          <h1 className="text-5xl font-black tracking-[0.25em]" style={{ color: '#0F172A' }}>SIGA</h1>
          <p className="text-slate-600 text-sm mt-2 tracking-wide">Universidad Tecnologica de Candelaria</p>
        </div>

        <div className="bg-white/95 border border-slate-200 shadow-xl p-8 rounded-2xl">
          <h2 className="text-lg font-semibold text-slate-950 mb-6">Iniciar sesion</h2>

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
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 placeholder:text-slate-400"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5" htmlFor="password">
                Contrasena
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={form.password}
                onChange={handleChange}
                placeholder="********"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 placeholder:text-slate-400"
                autoComplete="current-password"
              />
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
              className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-base font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 mt-2"
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
          SIGA v2.0 - UTECAN {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
