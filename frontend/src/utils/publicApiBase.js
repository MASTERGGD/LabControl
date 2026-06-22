import axios from 'axios';

const PUBLIC_API_TIMEOUT_MS = 5000;

const RAILWAY_BACKEND_FALLBACKS = [
  'https://labcontrol-production.up.railway.app',
  'https://labcontrol-production-8cba.up.railway.app',
];

function normalizeBase(url) {
  return url ? String(url).replace(/\/$/, '') : '';
}

function addCandidate(candidates, url) {
  const normalized = normalizeBase(url);
  if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
}

export function getPublicApiCandidates() {
  const candidates = [];
  const isRailwayHost = window.location.hostname.endsWith('.up.railway.app');

  addCandidate(candidates, process.env.REACT_APP_API_URL);

  if (isRailwayHost) {
    addCandidate(candidates, window.location.origin);
    RAILWAY_BACKEND_FALLBACKS.forEach(url => addCandidate(candidates, url));
    return candidates;
  }

  addCandidate(candidates, `${window.location.protocol}//${window.location.hostname}:8000`);

  return candidates;
}

export function getPublicApiBase() {
  return getPublicApiCandidates()[0];
}

function responseError(res, base) {
  const err = new Error(res.data?.detail || `Respuesta ${res.status} desde ${base}`);
  err.response = res;
  return err;
}

export async function getPublicJson(path) {
  const errors = [];

  for (const base of getPublicApiCandidates()) {
    try {
      const res = await axios.get(`${base}${path}`, {
        timeout: PUBLIC_API_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (!res.data || typeof res.data !== 'object') {
        errors.push(new Error(`Respuesta no JSON desde ${base}`));
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        errors.push(responseError(res, base));
        continue;
      }
      return res.data;
    } catch (err) {
      errors.push(err);
    }
  }

  const apiError = errors.find(err => err.response?.data?.detail);
  throw apiError || new Error('No se pudo conectar con el servidor de validacion.');
}
