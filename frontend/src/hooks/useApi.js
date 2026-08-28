import axios from 'axios';

const API_BASE =
  process.env.REACT_APP_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

const api = axios.create({
  baseURL: API_BASE,
});

const SESSION_KEYS = [
  'token',
  'usuario',
  'labcontrol_session_id',
  'labcontrol_last_activity',
  'siga_periodo_id',
  'siga_periodo_clave',
  'siga_periodo_historico',
];

function getBrowserId() {
  let id = localStorage.getItem('labcontrol_browser_id');
  if (!id) {
    id = crypto?.randomUUID?.() || `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem('labcontrol_browser_id', id);
  }
  sessionStorage.setItem('labcontrol_session_id', id);
  return id;
}

// ── Adjuntar token en cada petición ──────────────────────────────────────────
api.interceptors.request.use(config => {
  config.headers['X-SIGA-Session-ID'] = getBrowserId();
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const periodoId = sessionStorage.getItem('siga_periodo_id');
  const periodoClave = sessionStorage.getItem('siga_periodo_clave');
  if (token && periodoId) {
    config.headers['X-SIGA-Periodo-Id'] = periodoId;
    config.headers['X-SIGA-Periodo'] = periodoClave;
    if (config.method?.toLowerCase() === 'get' && !config.params?.sin_contexto_periodo) {
      config.params = { periodo_id: periodoId, periodo: periodoClave, ...config.params };
    }
  }
  if (config.params?.sin_contexto_periodo) {
    const { sin_contexto_periodo, ...params } = config.params;
    config.params = params;
  }
  return config;
});

// ── 401 → limpiar sesión y redirigir al login ─────────────────────────────────
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      SESSION_KEYS.forEach(key => sessionStorage.removeItem(key));
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
