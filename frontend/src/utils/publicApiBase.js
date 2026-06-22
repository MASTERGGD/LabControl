const RAILWAY_BACKEND_FALLBACK = 'https://labcontrol-production.up.railway.app';

export function getPublicApiBase() {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if (window.location.hostname.endsWith('.up.railway.app')) {
    return RAILWAY_BACKEND_FALLBACK;
  }
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}
