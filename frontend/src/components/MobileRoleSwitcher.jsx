import React from 'react';

export default function MobileRoleSwitcher({ usuario, busy, onChange }) {
  const roles = usuario?.roles_disponibles || [];
  if (roles.length < 2) return null;
  return (
    <div className="siga-mobile-modes xl:hidden shrink-0 px-3 py-2" style={{ background: 'var(--topbar-bg)', borderBottom: '1px solid var(--topbar-border)' }}>
      <div role="group" aria-label="Cambiar modo de trabajo" aria-busy={busy} className="grid grid-cols-2 gap-2">
        {roles.map(rol => (
          <button key={rol} type="button" aria-pressed={rol === usuario.rol} disabled={busy}
            onClick={() => { if (rol !== usuario.rol) onChange(rol); }}
            className="min-h-[48px] min-w-0 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
            style={rol === usuario.rol ? { background: '#047857', color: '#fff', borderColor: '#047857' } : { color: 'var(--main-text)', borderColor: 'var(--topbar-border)' }}>
            {rol === 'LAB_ADMIN' ? 'Laboratorio' : rol === 'DOCENTE' ? 'Docente' : rol.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      {busy && <p role="status" className="mt-1 text-xs" style={{ color: 'var(--main-text)' }}>Cambiando modo…</p>}
    </div>
  );
}
