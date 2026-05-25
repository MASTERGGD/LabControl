/**
 * PWAInstallBanner — banner sutil en la parte inferior de la pantalla
 * que invita al usuario a instalar SIGA como app.
 *
 * Solo aparece en Chrome/Edge móvil y desktop cuando el navegador
 * dispara el evento beforeinstallprompt.
 */
import React from 'react';
import usePWAInstall from '../hooks/usePWAInstall';

export default function PWAInstallBanner() {
  const { canInstall, install, dismiss } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(420px, calc(100vw - 32px))',
        background: 'rgba(15,23,42,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(16,185,129,0.30)',
        borderRadius: '14px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.10)',
        animation: 'slideInUp 0.35s ease both',
      }}
    >
      {/* Ícono */}
      <img
        src="/icons/icon-192.png"
        alt="SIGA"
        style={{ width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0 }}
      />

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 }}>
          Instalar SIGA
        </p>
        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
          Acceso rápido desde tu pantalla de inicio
        </p>
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={dismiss}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            padding: '5px 10px',
            fontSize: '11px',
            color: '#64748b',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Ahora no
        </button>
        <button
          onClick={install}
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            border: 'none',
            borderRadius: '8px',
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 0 14px rgba(16,185,129,0.35)',
          }}
        >
          Instalar
        </button>
      </div>
    </div>
  );
}
