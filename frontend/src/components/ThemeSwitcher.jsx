import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * ThemeSwitcher - boton icono para alternar Noche / Institucional
 */
export default function ThemeSwitcher() {
  const { themeKey, toggle } = useTheme();
  const [hovered, setHovered] = useState(false);

  const isInstitutional = themeKey === 'day';

  const title  = isInstitutional ? 'Cambiar a tema noche' : 'Cambiar a tema institucional';
  const border = isInstitutional ? 'rgba(0,122,83,0.22)' : 'rgba(255,255,255,0.10)';
  const bg     = hovered
    ? isInstitutional ? 'rgba(0,122,83,0.08)' : 'rgba(255,255,255,0.07)'
    : 'transparent';
  const iconColor = isInstitutional ? '#007A53' : '#94a3b8';

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      aria-label={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 10,
        border: `1px solid ${border}`,
        background: bg,
        cursor: 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {isInstitutional ? (
        /* Luna: clic para ir a modo noche */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={iconColor} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        </svg>
      ) : (
        /* Sol: clic para ir a modo día */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={iconColor} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1"  x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
        </svg>
      )}
    </button>
  );
}


