import React, { createContext, useContext, useState, useEffect } from 'react';

const THEMES = {
  default: {
    key: 'default',
    label: 'LabControl',
    dot: '#3b82f6',
    dotSecondary: '#10b981',
  },
  gobmx: {
    key: 'gobmx',
    label: 'GobMX',
    dot: '#621132',
    dotSecondary: '#D4C19C',
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
    return localStorage.getItem(STORAGE_KEY) || 'default';
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
    setThemeKey(prev => prev === 'default' ? 'gobmx' : 'default');
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
