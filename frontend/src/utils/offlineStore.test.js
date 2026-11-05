import { indexedDB } from 'fake-indexeddb';
import { configureOfflineAccess, unlockOfflineAccess } from './offlineAccess';
import { lockOfflineData } from './offlineCrypto';
import { saveOfflineSnapshot, getOfflineSnapshot, enqueueOfflineOperation, listOfflineOperations } from './offlineStore';

const { webcrypto } = require('crypto');
const v8 = require('v8');
const user = { id: 42, nombre: 'Docente ficticio', rol: 'DOCENTE' };
const period = { id: 7, clave: 'PRUEBA' };
async function rawRows(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('siga-docente-offline', 1);
    req.onsuccess = () => {
      const db = req.result;
      const query = db.transaction(name).objectStore(name).getAll();
      query.onsuccess = () => { db.close(); resolve(query.result); };
      query.onerror = () => reject(query.error);
    };
  });
}
beforeAll(() => {
  Object.defineProperty(global, 'crypto', { configurable:true, value:webcrypto });
  Object.defineProperty(global, 'indexedDB', { configurable:true, value:indexedDB });
  global.structuredClone = value => v8.deserialize(v8.serialize(value));
});
beforeEach(async () => {
  localStorage.clear();
  lockOfflineData();
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('siga-docente-offline');
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  await configureOfflineAccess('123456', user, period);
});
afterEach(() => lockOfflineData());

test('snapshots and pending operations are encrypted and lock on logout', async () => {
  await saveOfflineSnapshot('clase:42:1', { alumno:'Alumno ficticio', matricula:'FAKE-001' });
  await enqueueOfflineOperation({ ownerId:42, kind:'ATTENDANCE', data:{ observacion:'Nota privada' } });
  expect(JSON.stringify(await rawRows('snapshots'))).not.toContain('Alumno ficticio');
  expect(JSON.stringify(await rawRows('queue'))).not.toContain('Nota privada');
  expect((await getOfflineSnapshot('clase:42:1')).data.matricula).toBe('FAKE-001');
  lockOfflineData();
  expect(await getOfflineSnapshot('clase:42:1')).toBeNull();
  expect(await listOfflineOperations(42)).toEqual([]);
  await unlockOfflineAccess('123456');
  expect((await listOfflineOperations(42))[0].data.observacion).toBe('Nota privada');
});

test('renewing the PIN retains queued captures and rejects the old PIN', async () => {
  await enqueueOfflineOperation({ ownerId:42, data:{ observacion:'Conservar' } });
  lockOfflineData();
  await configureOfflineAccess('654321', user, period, '123456');
  expect((await listOfflineOperations(42))[0].data.observacion).toBe('Conservar');
  lockOfflineData();
  await expect(unlockOfflineAccess('123456')).rejects.toThrow();
  await unlockOfflineAccess('654321');
  expect((await listOfflineOperations(42))[0].data.observacion).toBe('Conservar');
});

test('another account cannot decrypt a saved academic record', async () => {
  await saveOfflineSnapshot('clase:42:1', { alumno:'Privado' });
  // A separate browser wrapper/key represents another teacher.
  localStorage.clear();
  lockOfflineData();
  await configureOfflineAccess('654321', {...user,id:99}, period);
  expect(await getOfflineSnapshot('clase:42:1')).toBeNull();
});
