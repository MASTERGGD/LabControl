import axios from 'axios';

// Si REACT_APP_API_URL está definido, usarlo.
// Si no, usar el mismo host del navegador en puerto 8000.
// Esto permite acceder desde cualquier dispositivo en la red local
// sin hardcodear IPs.
const API_BASE =
  process.env.REACT_APP_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

const api = axios.create({
  baseURL: API_BASE,
});

// ── Adjuntar token en cada petición ──────────────────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Manejar respuestas con error ──────────────────────────────────────────────
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Token expirado o inválido → limpiar sesión y redirigir al login
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      // Redirigir solo si no estamos ya en el login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
