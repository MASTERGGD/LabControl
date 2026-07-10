import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../hooks/useApi';

export default function SolicitarRecuperacion() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await api.post('/auth/password/forgot', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'No fue posible procesar la solicitud. Intenta más tarde.');
    } finally { setLoading(false); }
  };

  return <AuthShell>
    {sent ? (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✉️</div>
        <h1 className="text-2xl font-bold text-slate-950">Revisa tu correo</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Si <strong>{email}</strong> pertenece a una cuenta activa, recibirás un enlace de recuperación. También revisa la carpeta de correo no deseado.</p>
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs leading-5 text-amber-800">El enlace funciona una sola vez y caduca en 30 minutos. Nunca te pediremos tu contraseña por correo.</div>
        <Link to="/login" className="mt-6 inline-flex font-semibold text-emerald-700 hover:text-emerald-800">Volver a iniciar sesión</Link>
      </div>
    ) : (
      <>
        <h1 className="text-2xl font-bold text-slate-950">Recupera tu cuenta</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Escribe tu correo institucional. Te enviaremos un enlace seguro para crear una contraseña nueva.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="recovery-email" className="mb-1.5 block text-sm font-medium text-slate-700">Correo institucional</label>
            <input id="recovery-email" type="email" required autoFocus autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="usuario@utecan.edu.mx" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button disabled={loading} className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{loading ? 'Enviando enlace…' : 'Enviar enlace de recuperación'}</button>
        </form>
        <Link to="/login" className="mt-5 block text-center text-sm font-semibold text-emerald-700 hover:text-emerald-800">← Volver al inicio de sesión</Link>
      </>
    )}
  </AuthShell>;
}

export function AuthShell({ children }) {
  return <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-emerald-100 px-4 py-10">
    <div className="mx-auto mb-6 flex max-w-md items-center justify-center gap-3">
      <img src="/icons/icon-192.png" alt="UTECAN" className="h-14 w-14 rounded-xl bg-white object-contain p-1 shadow" />
      <div><div className="text-2xl font-black tracking-[0.18em] text-slate-950">SIGA</div><div className="text-xs text-slate-600">Universidad Tecnológica de Candelaria</div></div>
    </div>
    <main className="mx-auto max-w-md rounded-2xl border border-white/80 bg-white/95 p-7 shadow-xl sm:p-8">{children}</main>
    <p className="mx-auto mt-6 max-w-md text-center text-xs text-slate-500">Conexión segura · Soporte institucional UTECAN</p>
  </div>;
}
