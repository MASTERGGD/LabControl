import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../hooks/useApi';

const AuthContext = createContext(null);

// sessionStorage en lugar de localStorage:
//   - Se borra automáticamente al cerrar la pestaña o el navegador
//   - Previene que otro usuario del mismo equipo retome la sesión
const store = sessionStorage;

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(
    JSON.parse(store.getItem('usuario') || 'null')
  );

  useEffect(() => {
    if (!store.getItem('token')) return;
    api.get('/auth/me')
      .then(({ data }) => {
        store.setItem('usuario', JSON.stringify(data));
        setUsuario(data);
      })
      .catch(() => {});
  }, []);

  const login = (userData, token) => {
    store.setItem('token', token);
    store.setItem('usuario', JSON.stringify(userData));
    setUsuario(userData);
  };

  const logout = () => {
    store.removeItem('token');
    store.removeItem('usuario');
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
