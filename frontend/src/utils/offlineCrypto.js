// The unwrapped data key lives only in memory and is cleared on logout.
let rawKey = null;
let dataKey = null;
let owner = null;
let expiration = 0;
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

export function lockOfflineData() {
  rawKey?.fill(0);
  rawKey = null;
  dataKey = null;
  owner = null;
  expiration = 0;
}

export function offlineDataOwner() {
  if (Date.now() >= expiration) lockOfflineData();
  return owner;
}

export async function activateOfflineData(secret, ownerId, expiresAt) {
  lockOfflineData();
  rawKey = bytes(secret);
  dataKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
  owner = String(ownerId);
  expiration = expiresAt;
}

export function offlineDataSecret(ownerId) {
  if (owner !== String(ownerId) || !rawKey) return null;
  return b64(rawKey);
}

export function newOfflineDataSecret() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sealOfflineData(value, context) {
  if (offlineDataOwner() == null) throw new Error('Desbloquea los datos offline con tu PIN antes de guardarlos.');
  const currentOwner = owner;
  const currentExpiration = expiration;
  const currentKey = dataKey;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(JSON.stringify([context, currentOwner, currentExpiration]));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, currentKey,
    new TextEncoder().encode(JSON.stringify(value)));
  return { version: 2, ownerId: currentOwner, expiresAt: currentExpiration, iv: b64(iv), ciphertext: b64(new Uint8Array(encrypted)) };
}

export async function openOfflineData(envelope, context) {
  if (offlineDataOwner() == null || envelope.ownerId !== owner) return null;
  const aad = new TextEncoder().encode(JSON.stringify([context, owner, envelope.expiresAt]));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: aad }, dataKey,
    bytes(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(decrypted));
}
