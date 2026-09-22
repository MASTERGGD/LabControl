import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../hooks/useApi';
import { getOfflineAccessInfo, unlockOfflineAccess } from '../utils/offlineAccess';

const AuthContext = createContext(null);

// sessionStorage en lugar de localStorage:
// - Se borra automaticamente al cerrar la pestana o el navegador.
// - Previene que otro usuario del mismo equipo retome la sesion.
const store = sessionStorage;
const SESSION_ID_KEY = 'labcontrol_session_id';
const BROWSER_ID_KEY = 'labcontrol_browser_id';
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
  // localStorage se comparte entre pestañas del mismo navegador. Así, abrir
  // SIGA en otra pestaña no se reporta erróneamente como otro dispositivo.
  let id = localStorage.getItem(BROWSER_ID_KEY) || store.getItem(SESSION_ID_KEY);
  if (!id) {
    id = (crypto?.randomUUID?.() || `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }
  localStorage.setItem(BROWSER_ID_KEY, id);
  store.setItem(SESSION_ID_KEY, id);
  return id;
}

function clearStoredSession() {
  store.removeItem('token');
  store.removeItem('usuario');
  store.removeItem(SESSION_ID_KEY);
  store.removeItem(LAST_ACTIVITY_KEY);
  store.removeItem('siga_periodo_id');
  store.removeItem('siga_periodo_clave');
  store.removeItem('siga_periodo_historico');
  store.removeItem('siga_offline_periodo');
}

function getLastActivity() {
  const value = Number(store.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 ? value : Date.now();
}

export function AuthProvider({ children }) {
  const tieneToken = Boolean(store.getItem('token'));
  const usuarioGuardado = (() => { try { return JSON.parse(store.getItem('usuario') || 'null'); } catch { return null; } })();
  const [usuario, setUsuario] = useState(tieneToken ? usuarioGuardado : null);
  const [offlineAccess, setOfflineAccess] = useState(false);
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
    setOfflineAccess(false);
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
      .catch((error) => {
        // Una interrupción de red no invalida la sesión local: permite abrir
        // las clases que ya fueron descargadas y sincronizarlas más tarde.
        if (error.response || !usuarioGuardado) finishLocalSession();
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

  useEffect(() => {
    if (!offlineAccess) return undefined;
    const expiresAt = getOfflineAccessInfo()?.expiresAt || 0;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      finishLocalSession();
      window.location.replace('/login');
      return undefined;
    }
    const timer = window.setTimeout(() => {
      finishLocalSession();
      window.location.replace('/login');
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [finishLocalSession, offlineAccess]);

  const login = (userData, token) => {
    store.removeItem('siga_offline_periodo');
    store.setItem('token', token);
    store.setItem('usuario', JSON.stringify(userData));
    store.removeItem(LOGOUT_REASON_KEY);
    store.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    getBrowserSessionId();
    setIdleWarning(false);
    setUsuario(userData);
    setOfflineAccess(false);
  };

  const loginOffline = async pin => {
    const { usuario: offlineUser, periodo } = await unlockOfflineAccess(pin);
    clearStoredSession();
    store.setItem('usuario', JSON.stringify(offlineUser));
    store.setItem('siga_periodo_id', String(periodo.id));
    store.setItem('siga_periodo_clave', periodo.clave);
    store.setItem('siga_periodo_historico', periodo.es_actual ? '0' : '1');
    store.setItem('siga_offline_periodo', JSON.stringify(periodo));
    setOfflineAccess(true);
    setUsuario(offlineUser);
  };

  const logout = () => {
    notifyBackendLogout();
    store.removeItem(LOGOUT_REASON_KEY);
    finishLocalSession();
  };

  const cambiarFuncion = async (rol) => {
    const { data } = await api.post('/auth/cambiar-funcion', { rol });
    store.setItem('token', data.access_token);
    store.setItem('usuario', JSON.stringify(data.usuario));
    setUsuario(data.usuario);
    markActivity(true);
    return data.usuario;
  };

  const cerrarOtrasSesiones = async () => {
    const { data } = await api.post('/auth/sessions/logout-others', {
      session_id: getBrowserSessionId(),
    });
    setSessionInfo(data);
    return data;
  };

  if (!authListo) return null;

  return (
    <AuthContext.Provider value={{ usuario, login, loginOffline, offlineAccess, logout, cambiarFuncion, cerrarOtrasSesiones, sessionInfo }}>
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
