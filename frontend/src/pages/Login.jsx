import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';
import { getOfflineAccessInfo } from '../utils/offlineAccess';
import PWAInstallAccess from '../components/PWAInstallAccess';
import './Login.css';

const ROLES_REDIRECT = {
  SUPER_ADMIN: '/admin',
  LAB_ADMIN: '/lab',
  TUTORIA_ADMIN: '/admin/tutoria',
  SERVICIOS_ESCOLARES: '/servicios-escolares',
  DOCENTE: '/docente',
  ALUMNO: '/alumno/estudio-socioeconomico',
};

const PERM_SERVICIOS_ESCOLARES_MANAGE = 'servicios_escolares:manage';

function getRedirectPath(usuario) {
  if (
    usuario?.rol !== 'SUPER_ADMIN'
    && usuario?.permisos?.includes(PERM_SERVICIOS_ESCOLARES_MANAGE)
  ) {
    return '/servicios-escolares';
  }
  return ROLES_REDIRECT[usuario?.rol] || '/';
}

export default function Login() {
  const navigate = useNavigate();
  const { login, loginOffline, usuario } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [pin, setPin] = useState('');
  const [offlineError, setOfflineError] = useState('');
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [offlineSelected, setOfflineSelected] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const offlineInfo = getOfflineAccessInfo();
  const offlineMode = !online || offlineSelected;

  useEffect(() => {
    const updateConnection = () => {
      setOnline(navigator.onLine);
      setOfflineSelected(false);
      setPin('');
      setShowPin(false);
      setOfflineError('');
      setError('');
    };
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  if (usuario) {
    if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />;
    return <Navigate to={getRedirectPath(usuario)} replace />;
  }

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('username', form.email);
      params.append('password', form.password);
      const { data } = await api.post('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      login(data.usuario, data.access_token);
      if (data.usuario.debe_cambiar_password) {
        navigate('/cambiar-password', { replace: true });
      } else {
        navigate(getRedirectPath(data.usuario));
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineSubmit = async (event) => {
    event.preventDefault();
    setOfflineLoading(true);
    setOfflineError('');
    try {
      await loginOffline(pin);
      navigate('/docente', { replace: true });
    } catch (err) {
      setOfflineError(err.message || 'No se pudo abrir la copia offline.');
    } finally {
      setOfflineLoading(false);
      setPin('');
    }
  };

  return (
    <div className="siga-login">
      <div className="siga-login__dot-grid" aria-hidden="true" />
      <div className="siga-login__page">
        <header className="siga-login__header">
          <div className="siga-login__brand">
            <span className="siga-login__brand-icon">
              <img src="/icons/icon-192.png" alt="" draggable="false" />
            </span>
            <span>
              <span className="siga-login__brand-name">SIGA</span>
              <span className="siga-login__brand-subtitle">Gestión académica · UTECAN</span>
            </span>
          </div>
        </header>

        <main className="siga-login__layout">
          <section className="siga-login__welcome" aria-labelledby="siga-login-title">
            <div className="siga-login__eyebrow">Una sola plataforma</div>
            <h1 id="siga-login-title">Todo listo para empezar.</h1>
            <p className="siga-login__welcome-copy">
              Organiza tu jornada y consulta las herramientas que acompañan tu trabajo académico.
            </p>
            <div className="siga-login__product-preview" role="img" aria-label="Clases, espacios y tutorías disponibles en SIGA">
              <div className="siga-login__preview-heading">
                <span className="siga-login__preview-mark" aria-hidden="true"><span /><span /><span /></span>
                <span>Mi espacio académico</span>
                <span className="siga-login__preview-status">UTE</span>
              </div>
              <div className="siga-login__preview-list">
                <div className="siga-login__preview-row">
                  <span className="siga-login__preview-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>
                  </span>
                  <span><b>Clases y horarios</b><small>Tu jornada académica</small></span>
                  <span className="siga-login__preview-arrow" aria-hidden="true">›</span>
                </div>
                <div className="siga-login__preview-row">
                  <span className="siga-login__preview-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M4 20V8l8-4 8 4v12M2.5 20h19M8 10h.01M12 10h.01M16 10h.01M9 20v-5h6v5"/></svg>
                  </span>
                  <span><b>Espacios y laboratorios</b><small>Consulta y gestión</small></span>
                  <span className="siga-login__preview-arrow" aria-hidden="true">›</span>
                </div>
                <div className="siga-login__preview-row">
                  <span className="siga-login__preview-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.8M17 14h.5a3 3 0 0 1 3 3v3"/></svg>
                  </span>
                  <span><b>Tutorías y seguimiento</b><small>Acompañamiento académico</small></span>
                  <span className="siga-login__preview-arrow" aria-hidden="true">›</span>
                </div>
              </div>
            </div>
          </section>

          <section className="siga-login__access" aria-labelledby="siga-access-title">
            <div className="siga-login__form-panel">
              <div className="siga-login__form-eyebrow">Bienvenido a SIGA</div>
              <h2 id="siga-access-title" className="siga-login__form-title">
                {offlineMode ? 'Acceder sin conexión' : 'Inicia sesión'}
              </h2>

              {offlineMode && offlineInfo && (
                <form onSubmit={handleOfflineSubmit} className="siga-login__form">
                  <p id="offline-pin-help" className="siga-login__info">
                    Introduce tu PIN de 6 dígitos para abrir las clases guardadas en este dispositivo.
                  </p>
                  <div>
                    <label htmlFor="offline-pin" className="siga-login__label">PIN de acceso</label>
                    <div className="siga-login__input-wrap">
                      <input
                        id="offline-pin"
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        autoComplete="off"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={pin}
                        aria-describedby="offline-pin-help"
                        aria-invalid={Boolean(offlineError)}
                        onChange={event => {
                          setPin(event.target.value.replace(/\D/g, ''));
                          setOfflineError('');
                        }}
                        placeholder="••••••"
                        className="siga-login__input siga-login__input--pin"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(value => !value)}
                        aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                        aria-pressed={showPin}
                        className="siga-login__visibility"
                      >
                        {showPin ? 'Ocultar' : 'Mostrar'}
                      </button>
                    </div>
                  </div>
                  {offlineError && <p role="alert" className="siga-login__error">{offlineError}</p>}
                  <button type="submit" disabled={offlineLoading} className="siga-login__submit">
                    {offlineLoading ? 'Abriendo…' : 'Abrir clases guardadas'}
                  </button>
                  <p className="siga-login__fine-print">
                    Disponible hasta el {new Date(offlineInfo.expiresAt).toLocaleString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}.
                  </p>
                </form>
              )}

              {offlineMode && !offlineInfo && (
                <p role="status" className="siga-login__info">
                  No hay acceso sin conexión configurado en este dispositivo. Conéctate a internet para iniciar sesión.
                </p>
              )}

              {!offlineMode && (
                <form onSubmit={handleSubmit} className="siga-login__form">
                  <p className="siga-login__form-copy">Usa tu cuenta institucional para continuar.</p>
                  <div>
                    <label className="siga-login__label" htmlFor="email">Correo institucional</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="usuario@utecan.edu.mx"
                      className="siga-login__input"
                      autoComplete="username"
                    />
                  </div>

                  <div>
                    <label className="siga-login__label" htmlFor="password">Contraseña</label>
                    <div className="siga-login__input-wrap">
                      <input
                        id="password"
                        name="password"
                        type={showPass ? 'text' : 'password'}
                        required
                        value={form.password}
                        onChange={handleChange}
                        placeholder="••••••••"
                        className="siga-login__input siga-login__input--password"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(value => !value)}
                        className="siga-login__visibility"
                        aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        aria-pressed={showPass}
                      >
                        {showPass ? (
                          <svg className="siga-login__eye-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                          </svg>
                        ) : (
                          <svg className="siga-login__eye-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="siga-login__forgot">
                      <Link to="/recuperar-password">¿Necesitas restablecer tu contraseña?</Link>
                    </div>
                  </div>

                  {error && (
                    <div role="alert" className="siga-login__error">
                      <svg className="siga-login__error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p>{error}</p>
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="siga-login__submit">
                    {loading ? (
                      <span className="siga-login__loading">
                        <span className="siga-login__spinner" aria-hidden="true" />
                        Verificando…
                      </span>
                    ) : 'Entrar a SIGA'}
                  </button>
                </form>
              )}

              {online && offlineInfo && (
                <button
                  type="button"
                  onClick={() => {
                    setOfflineSelected(value => !value);
                    setPin('');
                    setShowPin(false);
                    setOfflineError('');
                  }}
                  className="siga-login__offline-toggle"
                >
                  {offlineMode ? 'Volver a iniciar sesión' : 'Acceder sin conexión'}
                </button>
              )}

              <div className="siga-login__install">
                <PWAInstallAccess />
              </div>

              <div className="siga-login__restricted">
                <span>Acceso restringido al personal autorizado</span>
              </div>
            </div>
            <p className="siga-login__version">SIGA v1.0 · UTECAN {new Date().getFullYear()}</p>
          </section>
        </main>

        <footer className="siga-login__footer">
          <span>© {new Date().getFullYear()} Universidad Tecnológica de Candelaria</span>
          <span>Plataforma institucional · SIGA</span>
        </footer>
      </div>
    </div>
  );
}
