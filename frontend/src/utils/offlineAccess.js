import { activateOfflineData, offlineDataSecret, newOfflineDataSecret } from './offlineCrypto';
const KEY = 'siga_docente_offline_access_v1';
const VALID_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };

async function keyFromPin(pin, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export function getOfflineAccessInfo(ownerId = null) {
  const record = read();
  if (!record) return null;
  if (ownerId != null && String(record.ownerId) !== String(ownerId)) return null;
  return { expiresAt: record.expiresAt, lockedUntil: record.lockedUntil || 0 };
}

export async function configureOfflineAccess(pin, usuario, periodo, previousPin = pin) {
  if (!/^\d{6}$/.test(pin)) throw new Error('El PIN debe tener exactamente 6 dígitos.');
  if (!usuario?.id || usuario?.rol !== 'DOCENTE' || !periodo?.id) throw new Error('Se requiere una sesión docente y un periodo vigentes.');
  if (!crypto?.subtle) throw new Error('Este navegador no admite acceso offline protegido.');
  if (read() && String(read().ownerId) !== String(usuario.id)) throw new Error('Este perfil tiene capturas de otra cuenta. Usa un perfil personal para conservarlas.');
  if (read() && !offlineDataSecret(usuario.id)) {
    // Authenticate the existing PIN before rotating the wrapper; preserve pending captures.
    await unlockOfflineAccess(previousPin, true);
  }
  const dataSecret = offlineDataSecret(usuario.id) || newOfflineDataSecret();
  const expiresAt = Date.now() + VALID_MS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPin(pin, salt);
  const payload = { dataSecret, expiresAt, usuario: { id: usuario.id, nombre: usuario.nombre, rol: 'DOCENTE' }, periodo: { id: periodo.id, clave: periodo.clave, es_actual: periodo.es_actual, estado_periodo: periodo.estado_periodo } };
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
  localStorage.setItem(KEY, JSON.stringify({ ownerId: usuario.id, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), expiresAt, attempts: 0, lockedUntil: 0 }));
  await activateOfflineData(dataSecret, usuario.id, expiresAt);
  const { migrateOfflineStorage } = await import('./offlineStore');
  await migrateOfflineStorage();
  return getOfflineAccessInfo(usuario.id);
}

export async function unlockOfflineAccess(pin, renewing = false) {
  const record = read();
  if (!record) throw new Error('No se configuró el acceso offline en este dispositivo.');
  if (!renewing && Date.now() >= record.expiresAt) throw new Error('El acceso offline venció. Conéctate e inicia sesión para renovarlo.');
  if (Date.now() < (record.lockedUntil || 0)) throw new Error('Demasiados intentos. Espera 15 minutos o inicia sesión con internet.');
  try {
    const key = await keyFromPin(pin, fromBase64(record.salt));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(record.iv) }, key, fromBase64(record.ciphertext));
    localStorage.setItem(KEY, JSON.stringify({ ...record, attempts: 0, lockedUntil: 0 }));
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    if (!renewing && payload.expiresAt && Date.now() >= payload.expiresAt) throw new Error('Acceso vencido');
    // Legacy wrappers are upgraded without deleting academic data or queued writes.
    if (!payload.dataSecret) {
      payload.dataSecret = newOfflineDataSecret();
      payload.expiresAt = record.expiresAt;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
      localStorage.setItem(KEY, JSON.stringify({ ...record, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), attempts: 0, lockedUntil: 0 }));
    }
    await activateOfflineData(payload.dataSecret, payload.usuario.id, payload.expiresAt);
    const { migrateOfflineStorage } = await import('./offlineStore');
    await migrateOfflineStorage();
    return { usuario: payload.usuario, periodo: payload.periodo };
  } catch {
    const attempts = (record.attempts || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify({ ...record, attempts, lockedUntil: attempts >= 5 ? Date.now() + LOCK_MS : 0, attempts: attempts >= 5 ? 0 : attempts }));
    throw new Error(attempts >= 5 ? 'Acceso bloqueado por 15 minutos.' : 'PIN incorrecto.');
  }
}
