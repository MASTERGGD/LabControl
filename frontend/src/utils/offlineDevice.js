const DEVICE_KEY = 'siga_docente_offline_device_id';

export function getOfflineDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `siga-device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getOfflineDeviceName() {
  const ua = navigator.userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const device = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'este dispositivo';
  return `${browser} · ${device}`;
}
