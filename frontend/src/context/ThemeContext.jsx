import React, { createContext, useContext, useState, useEffect } from 'react';

const THEMES = {
  default: {
    key: 'default',
    label: 'Noche',
    dot: '#3b82f6',
    dotSecondary: '#10b981',
    isLight: false,
  },
  day: {
    key: 'day',
    label: 'Dia',
    dot: '#2563eb',
    dotSecondary: '#0ea5e9',
    isLight: true,
  },
};

const STORAGE_KEY = 'labcontrol_theme';

const ThemeContext = createContext({
  theme: THEMES.default,
  toggle: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'gobmx') return 'day';
    return THEMES[saved] ? saved : 'default';
  });

  useEffect(() => {
    const body = document.body;
    // Quitar todas las clases de tema
    Object.keys(THEMES).forEach(k => body.classList.remove(`theme-${k}`));
    // Aplicar el tema activo (default no necesita clase)
    if (themeKey !== 'default') {
      body.classList.add(`theme-${themeKey}`);
    }
    localStorage.setItem(STORAGE_KEY, themeKey);
  }, [themeKey]);

  const toggle = () => {
    setThemeKey(prev => prev === 'default' ? 'day' : 'default');
  };

  const setTheme = (key) => {
    if (THEMES[key]) setThemeKey(key);
  };

  return (
    <ThemeContext.Provider value={{ theme: THEMES[themeKey], themeKey, toggle, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
