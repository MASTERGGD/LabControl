import axios from 'axios';

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

  addCandidate(candidates, process.env.REACT_APP_API_URL);

  if (window.location.hostname.endsWith('.up.railway.app')) {
    addCandidate(candidates, window.location.origin);
    RAILWAY_BACKEND_FALLBACKS.forEach(url => addCandidate(candidates, url));
  }

  addCandidate(candidates, `${window.location.protocol}//${window.location.hostname}:8000`);

  return candidates;
}

export function getPublicApiBase() {
  return getPublicApiCandidates()[0];
}

export async function getPublicJson(path) {
  const errors = [];

  for (const base of getPublicApiCandidates()) {
    try {
      const res = await axios.get(`${base}${path}`);
      return res.data;
    } catch (err) {
      if (err.response) throw err;
      errors.push(err);
    }
  }

  throw errors[0] || new Error('No se pudo conectar con el servidor.');
}
