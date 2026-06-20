export const MEXICO_TIME_ZONE = 'America/Mexico_City';

export function todayISOInMexico(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEXICO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function dateToLocalISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseApiDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}Z`);
}

export function formatDateInMexico(value, options = {}) {
  if (!value) return '—';
  const date = parseApiDate(value);
  return date.toLocaleDateString('es-MX', {
    timeZone: MEXICO_TIME_ZONE,
    ...options,
  });
}

export function formatDateTimeInMexico(value, options = {}) {
  if (!value) return '—';
  const date = parseApiDate(value);
  return date.toLocaleString('es-MX', {
    timeZone: MEXICO_TIME_ZONE,
    ...options,
  });
}
