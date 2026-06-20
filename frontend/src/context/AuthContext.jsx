import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../hooks/useApi';

const AuthContext = createContext(null);

// sessionStorage en lugar de localStorage:
// - Se borra automaticamente al cerrar la pestana o el navegador.
// - Previene que otro usuario del mismo equipo retome la sesion.
const store = sessionStorage;
const SESSION_ID_KEY = 'labcontrol_session_id';
const LAST_ACTIVITY_KEY = 'labcontrol_last_activity';
const LOGOUT_REASON_KEY = 'labcontrol_logout_reason';
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

function readMinutesEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const IDLE_TIMEOUT_MS = readMinutesEnv('REACT_APP_IDLE_TIMEOUT_MINUTES', 45) * 60 * 1000;
const rawWarningMs = readMinutesEnv('REACT_APP_IDLE_WARNING_MINUTES', 40) * 60 * 1000;
const IDLE_WARNING_MS = Math.min(rawWarningMs, Math.max(60 * 1000, IDLE_TIMEOUT_MS - 60 * 1000));

function getBrowserSessionId() {
  let id = store.getItem(SESSION_ID_KEY);
  if (!id) {
    id = (crypto?.randomUUID?.() || `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    store.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

function clearStoredSession() {
  store.removeItem('token');
  store.removeItem('usuario');
  store.removeItem(SESSION_ID_KEY);
  store.removeItem(LAST_ACTIVITY_KEY);
}

function getLastActivity() {
  const value = Number(store.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 ? value : Date.now();
}

export function AuthProvider({ children }) {
  const tieneToken = Boolean(store.getItem('token'));
  const [usuario, setUsuario] = useState(tieneToken ? null : null);
  const [authListo, setAuthListo] = useState(!tieneToken);
  const [sessionInfo, setSessionInfo] = useState({ active_count: 1, active_sessions: [] });
  const [idleWarning, setIdleWarning] = useState(false);
  const [idleRemainingMs, setIdleRemainingMs] = useState(IDLE_TIMEOUT_MS);
  const lastActivityWriteRef = useRef(0);

  const notifyBackendLogout = useCallback(() => {
    const sessionId = store.getItem(SESSION_ID_KEY);
    if (sessionId && store.getItem('token')) {
      api.post('/auth/sessions/logout', { session_id: sessionId }).catch(() => {});
    }
  }, []);

  const finishLocalSession = useCallback(() => {
    clearStoredSession();
    setSessionInfo({ active_count: 1, active_sessions: [] });
    setIdleWarning(false);
    setUsuario(null);
  }, []);

  const expireIdleSession = useCallback((redirect = true) => {
    notifyBackendLogout();
    store.setItem(LOGOUT_REASON_KEY, 'idle');
    finishLocalSession();
    if (redirect && !window.location.pathname.includes('/login')) {
      window.location.replace('/login?reason=idle');
    }
  }, [finishLocalSession, notifyBackendLogout]);

  const markActivity = useCallback((force = false) => {
    if (!store.getItem('token')) return;

    const now = Date.now();
    if (!force && now - lastActivityWriteRef.current < 15000) return;

    lastActivityWriteRef.current = now;
    store.setItem(LAST_ACTIVITY_KEY, String(now));
    setIdleWarning(false);
    setIdleRemainingMs(IDLE_TIMEOUT_MS);
  }, []);

  const checkIdleSession = useCallback(() => {
    if (!store.getItem('token')) return false;

    const elapsed = Date.now() - getLastActivity();
    const remaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed);
    setIdleRemainingMs(remaining);

    if (elapsed >= IDLE_TIMEOUT_MS) {
      expireIdleSession();
      return true;
    }

    setIdleWarning(elapsed >= IDLE_WARNING_MS);
    return false;
  }, [expireIdleSession]);

  useEffect(() => {
    if (!store.getItem('token')) {
      setAuthListo(true);
      return;
    }

    if (Date.now() - getLastActivity() >= IDLE_TIMEOUT_MS) {
      expireIdleSession();
      setAuthListo(true);
      return;
    }

    api.get('/auth/me')
      .then(({ data }) => {
        store.setItem('usuario', JSON.stringify(data));
        setUsuario(data);
        markActivity(true);
      })
      .catch(() => {
        finishLocalSession();
      })
      .finally(() => setAuthListo(true));
  }, [expireIdleSession, finishLocalSession, markActivity]);

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

  useEffect(() => {
    if (!usuario || !store.getItem('token')) return undefined;

    const handleActivity = () => {
      if (!checkIdleSession()) markActivity();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleActivity();
    };

    const timer = setInterval(checkIdleSession, 15000);
    ACTIVITY_EVENTS.forEach(eventName => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener('focus', handleActivity);
    document.addEventListener('visibilitychange', handleVisibility);

    checkIdleSession();

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach(eventName => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener('focus', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkIdleSession, markActivity, usuario]);

  const login = (userData, token) => {
    store.setItem('token', token);
    store.setItem('usuario', JSON.stringify(userData));
    store.removeItem(LOGOUT_REASON_KEY);
    store.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    getBrowserSessionId();
    setIdleWarning(false);
    setUsuario(userData);
  };

  const logout = () => {
    notifyBackendLogout();
    store.removeItem(LOGOUT_REASON_KEY);
    finishLocalSession();
  };

  if (!authListo) return null;

  return (
    <AuthContext.Provider value={{ usuario, login, logout, sessionInfo }}>
      {children}
      {idleWarning && usuario && (
        <div className="fixed inset-x-0 bottom-5 z-[9999] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-2xl text-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Tu sesion esta por expirar</p>
                <p className="text-sm text-slate-700">
                  Por seguridad se cerrara automaticamente en {Math.ceil(idleRemainingMs / 60000)} min si no hay actividad.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => markActivity(true)}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                >
                  Continuar
                </button>
                <button
                  type="button"
                  onClick={() => expireIdleSession()}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 border border-slate-300"
                >
                  Cerrar sesion
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
