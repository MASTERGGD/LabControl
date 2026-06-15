import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../hooks/useApi';

const AuthContext = createContext(null);

// sessionStorage en lugar de localStorage:
//   - Se borra automáticamente al cerrar la pestaña o el navegador
//   - Previene que otro usuario del mismo equipo retome la sesión
const store = sessionStorage;
const SESSION_ID_KEY = 'labcontrol_session_id';

function getBrowserSessionId() {
  let id = store.getItem(SESSION_ID_KEY);
  if (!id) {
    id = (crypto?.randomUUID?.() || `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    store.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

export function AuthProvider({ children }) {
  // Si hay token, arrancamos con usuario=null y esperamos /auth/me
  // para no renderizar permisos desactualizados del sessionStorage.
  // Si no hay token, cargamos null directamente y estamos listos.
  const tieneToken = Boolean(store.getItem('token'));
  const [usuario, setUsuario] = useState(tieneToken ? null : null);
  const [authListo, setAuthListo] = useState(!tieneToken);
  const [sessionInfo, setSessionInfo] = useState({ active_count: 1, active_sessions: [] });

  useEffect(() => {
    if (!store.getItem('token')) {
      setAuthListo(true);
      return;
    }
    api.get('/auth/me')
      .then(({ data }) => {
        store.setItem('usuario', JSON.stringify(data));
        setUsuario(data);
      })
      .catch(() => {
        // Token inválido o expirado — limpiar sesión
        store.removeItem('token');
        store.removeItem('usuario');
        setUsuario(null);
      })
      .finally(() => setAuthListo(true));
  }, []);

  useEffect(() => {
    if (!usuario || !store.getItem('token')) return undefined;

    const heartbeat = () => {
      api.post('/auth/sessions/heartbeat', {
        session_id: getBrowserSessionId(),
        path: window.location.pathname,
      }).then(({ data }) => setSessionInfo(data)).catch(() => {});
    };

    heartbeat();
    const timer = setInterval(heartbeat, 45000);
    window.addEventListener('focus', heartbeat);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', heartbeat);
    };
  }, [usuario?.id]);

  const login = (userData, token) => {
    store.setItem('token', token);
    store.setItem('usuario', JSON.stringify(userData));
    getBrowserSessionId();
    setUsuario(userData);
  };

  const logout = () => {
    const sessionId = store.getItem(SESSION_ID_KEY);
    if (sessionId && store.getItem('token')) {
      api.post('/auth/sessions/logout', { session_id: sessionId }).catch(() => {});
    }
    store.removeItem('token');
    store.removeItem('usuario');
    store.removeItem(SESSION_ID_KEY);
    setSessionInfo({ active_count: 1, active_sessions: [] });
    setUsuario(null);
  };

  // No renderizar nada hasta que /auth/me responda,
  // así el sidebar siempre recibe los permisos frescos.
  if (!authListo) return null;

  return (
    <AuthContext.Provider value={{ usuario, login, logout, sessionInfo }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
