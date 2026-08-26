import React from 'react';
import { Link } from 'react-router-dom';

export default function SolicitarRecuperacion() {
  return <AuthShell>
    <div className="text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-slate-950">Restablecimiento asistido</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Durante la etapa piloto, el restablecimiento de contraseña es atendido por el administrador de SIGA.
      </p>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm leading-6 text-amber-900">
        <p className="font-semibold">¿Qué debes hacer?</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Contacta al administrador de SIGA o al responsable de tu área.</li>
          <li>Indica tu nombre y correo institucional.</li>
          <li>El administrador generará una contraseña temporal para tu cuenta.</li>
        </ol>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">Por seguridad, nunca envíes tu contraseña actual por correo o mensajería.</p>
      <Link to="/login" className="mt-6 inline-flex rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800">Volver a iniciar sesión</Link>
    </div>
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
