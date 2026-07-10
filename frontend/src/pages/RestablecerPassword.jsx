import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../hooks/useApi';
import PasswordRequirements, { isStrongPassword } from '../components/PasswordRequirements';
import { AuthShell } from './SolicitarRecuperacion';

export default function RestablecerPassword() {
  const { token } = useParams();
  const [status, setStatus] = useState('validating');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/auth/password/reset/${encodeURIComponent(token || '')}`)
      .then(() => active && setStatus('ready'))
      .catch(() => active && setStatus('invalid'));
    return () => { active = false; };
  }, [token]);

  const submit = async e => {
    e.preventDefault(); setError('');
    if (!isStrongPassword(password)) return setError('Completa todos los requisitos de seguridad.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    try {
      await api.post('/auth/password/reset', { token, password });
      setStatus('done');
    } catch (err) { setError(err.response?.data?.detail || 'No fue posible actualizar la contraseña.'); }
    finally { setLoading(false); }
  };

  if (status === 'validating') return <AuthShell><div className="py-10 text-center text-slate-600">Validando enlace seguro…</div></AuthShell>;
  if (status === 'invalid') return <AuthShell><State icon="⏱️" title="Este enlace ya no funciona" text="Puede haber expirado, haber sido utilizado o haber sido reemplazado por una solicitud más reciente."><Link to="/recuperar-password" className="mt-6 inline-flex rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white">Solicitar un enlace nuevo</Link></State></AuthShell>;
  if (status === 'done') return <AuthShell><State icon="✓" title="Contraseña actualizada" text="Tu cuenta está protegida con la nueva contraseña. El enlace quedó invalidado y no puede volver a utilizarse."><Link to="/login" className="mt-6 inline-flex rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white">Iniciar sesión</Link></State></AuthShell>;

  return <AuthShell>
    <h1 className="text-2xl font-bold text-slate-950">Crea una contraseña nueva</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">Usa una contraseña única que no emplees en otros servicios.</p>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Nueva contraseña</label><input type={show ? 'text' : 'password'} autoFocus required autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /><PasswordRequirements value={password} /></div>
      <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Confirma la contraseña</label><input type={show ? 'text' : 'password'} required autoComplete="new-password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }} className={`w-full rounded-xl border px-4 py-3 outline-none focus:ring-4 ${confirm && confirm !== password ? 'border-red-400 focus:ring-red-100' : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-100'}`} /></div>
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} className="rounded border-slate-300 text-emerald-700" /> Mostrar contraseñas</label>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={loading} className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{loading ? 'Protegiendo tu cuenta…' : 'Guardar contraseña nueva'}</button>
    </form>
  </AuthShell>;
}

function State({ icon, title, text, children }) {
  return <div className="py-4 text-center"><div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl font-bold text-emerald-700">{icon}</div><h1 className="text-2xl font-bold text-slate-950">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>{children}</div>;
}
