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
];

// ── Adjuntar token en cada petición ──────────────────────────────────────────
api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
