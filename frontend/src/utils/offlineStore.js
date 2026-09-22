const DB_NAME = 'siga-docente-offline';
const DB_VERSION = 1;
const SNAPSHOTS = 'snapshots';
const QUEUE = 'queue';
export const OFFLINE_EVENT = 'siga:offline-change';

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'key' });
    if (!db.objectStoreNames.contains(QUEUE)) {
      const store = db.createObjectStore(QUEUE, { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transact = async (storeName, mode, action) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try { result = action(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
};

const notify = () => window.dispatchEvent(new CustomEvent(OFFLINE_EVENT));
const uuid = () => crypto?.randomUUID?.() || `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function saveOfflineSnapshot(key, data) {
  await transact(SNAPSHOTS, 'readwrite', store => store.put({ key, data, savedAt: new Date().toISOString() }));
  notify();
}

export async function getOfflineSnapshot(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

export async function listOfflineSnapshots(prefix) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).getAll();
    request.onsuccess = () => resolve((request.result || []).filter(item => item.key.startsWith(prefix)));
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

export async function enqueueOfflineOperation(operation) {
  const item = { id: uuid(), createdAt: new Date().toISOString(), order: performance.timeOrigin + performance.now(), status: 'PENDING', attempts: 0, ...operation };
  await transact(QUEUE, 'readwrite', store => store.put(item));
  notify();
  return item;
}

export async function listOfflineOperations(ownerId = null) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE).objectStore(QUEUE).getAll();
    request.onsuccess = () => resolve((request.result || [])
      .filter(item => ownerId == null || String(item.ownerId) === String(ownerId))
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function updateOperation(item) {
  await transact(QUEUE, 'readwrite', store => store.put(item));
}

async function removeOperation(id) {
  await transact(QUEUE, 'readwrite', store => store.delete(id));
}

export async function flushOfflineQueue(api, ownerId) {
  if (!navigator.onLine || !sessionStorage.getItem('token') || ownerId == null) return { synced: 0, conflicts: 0, pending: (await listOfflineOperations(ownerId)).length };
  const operations = await listOfflineOperations(ownerId);
  let synced = 0;
  let conflicts = 0;
  for (const item of operations) {
    if (item.status === 'CONFLICT') { conflicts += 1; continue; }
    try {
      if (item.kind === 'OFFLINE_CLASS') {
        const { data: clase } = await api.post(`/docencia/horario/${item.data.carga_id}/iniciar-offline`, { fecha: item.data.fecha, capturada_en: item.data.capturada_en }, { headers: { 'X-SIGA-Offline-Operation': item.id } });
        if (clase.estado === 'CERRADA') {
          await removeOperation(item.id);
          synced += 1;
          continue;
        }
        const asistenciaPorAlumno = new Map((clase.alumnos || []).map(alumno => [String(alumno.alumno_id), alumno]));
        for (const alumno of item.data.alumnos || []) {
          const servidor = asistenciaPorAlumno.get(String(alumno.alumno_id));
          if (servidor && (servidor.estado !== alumno.estado || (servidor.observacion || null) !== (alumno.observacion || null))) {
            await api.patch(`/docencia/clases/${clase.id}/asistencia/${servidor.asistencia_id}`, { estado: alumno.estado, observacion: alumno.observacion || null }, { headers: { 'X-SIGA-Offline-Operation': item.id } });
          }
        }
        if (item.data.incidencia?.tipo && item.data.incidencia?.descripcion) {
          await api.patch(`/docencia/clases/${clase.id}/incidencia`, item.data.incidencia, { headers: { 'X-SIGA-Offline-Operation': item.id } });
        }
        await api.post(`/docencia/clases/${clase.id}/cerrar`, item.data.bitacora, { headers: { 'X-SIGA-Offline-Operation': item.id } });
      } else {
        await api.request({ method: item.method, url: item.url, data: item.data, headers: { 'X-SIGA-Offline-Operation': item.id } });
      }
      await removeOperation(item.id);
      synced += 1;
    } catch (error) {
      if (!error.response) break;
      const detail = String(error.response?.data?.detail || 'El servidor rechazó el registro.');
      const cierreYaAplicado = item.kind === 'CLOSE_CLASS' && error.response.status === 409 && detail.toLowerCase().includes('cerrad');
      if (cierreYaAplicado) {
        await removeOperation(item.id);
        synced += 1;
      } else if (error.response.status >= 400 && error.response.status < 500 && error.response.status !== 408 && error.response.status !== 429) {
        await updateOperation({ ...item, status: 'CONFLICT', attempts: item.attempts + 1, error: detail });
        conflicts += 1;
      } else break;
    }
  }
  const remaining = await listOfflineOperations(ownerId);
  notify();
  if (synced) window.dispatchEvent(new CustomEvent('siga:offline-synced', { detail: { synced } }));
  return { synced, conflicts, pending: remaining.filter(item => item.status === 'PENDING').length };
}
