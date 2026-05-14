import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeSwitcher() {
  const { theme, themeKey, toggle, themes } = useTheme();
  const [hovered, setHovered] = useState(false);

  const isGobMX = themeKey === 'gobmx';

  // Pantone 468C — Dorado oficial Gobierno de México
  const DORADO = '#DDC9A3';

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isGobMX ? 'Cambiar a tema LabControl' : 'Cambiar a tema GobMX'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px 4px 6px',
        borderRadius: 20,
        border: `1px solid ${isGobMX ? 'rgba(221,201,163,0.28)' : 'rgba(255,255,255,0.08)'}`,
        background: hovered
          ? isGobMX ? 'rgba(221,201,163,0.07)' : 'rgba(255,255,255,0.06)'
          : 'rgba(255,255,255,0.03)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      {/* Icono paleta SVG */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={isGobMX ? DORADO : '#64748b'} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ transition: 'stroke 0.2s' }}>
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
        <circle cx="8.5"  cy="7.5"  r=".5" fill="currentColor"/>
        <circle cx="6.5"  cy="12.5" r=".5" fill="currentColor"/>
        <path d="M12 2C6.5 2 2 6.5 2 12a10 10 0 0010 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
      </svg>

      {/* Dots indicadores de tema */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {/* Dot azul — LabControl */}
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: themes.default.dot,
          opacity: themeKey === 'default' ? 1 : 0.3,
          transition: 'opacity 0.2s',
          boxShadow: themeKey === 'default' ? `0 0 5px ${themes.default.dot}` : 'none',
        }}/>
        {/* Dot guinda — GobMX (Pantone 7420C) */}
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: themes.gobmx.dot,
          opacity: themeKey === 'gobmx' ? 1 : 0.3,
          transition: 'opacity 0.2s',
          boxShadow: themeKey === 'gobmx' ? `0 0 5px ${themes.gobmx.dotSecondary}` : 'none',
        }}/>
      </div>

      {/* Label tema activo */}
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: isGobMX ? DORADO : '#64748b',
        letterSpacing: '0.03em',
        transition: 'color 0.2s',
      }}>
        {theme.label}
      </span>
    </button>
  );
}
