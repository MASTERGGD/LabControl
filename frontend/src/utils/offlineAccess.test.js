import { configureOfflineAccess, getOfflineAccessInfo, unlockOfflineAccess } from './offlineAccess';

const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');
const docente = { id: 42, nombre: 'Docente de prueba', rol: 'DOCENTE' };
const periodo = { id: 7, clave: 'SEP-DIC 2026', es_actual: true };

beforeAll(() => {
  Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto });
  Object.defineProperty(global, 'TextEncoder', { configurable: true, value: TextEncoder });
  Object.defineProperty(global, 'TextDecoder', { configurable: true, value: TextDecoder });
});

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-21T12:00:00Z'));
});

afterEach(() => jest.useRealTimers());

test('guarda identidad cifrada y permite reabrirla con el PIN correcto', async () => {
  await configureOfflineAccess('123456', docente, periodo);
  const stored = localStorage.getItem('siga_docente_offline_access_v1');
  expect(stored).not.toContain('Docente de prueba');
  expect(stored).not.toContain('123456');
  await expect(unlockOfflineAccess('123456')).resolves.toEqual({
    usuario: docente,
    periodo: { ...periodo },
  });
});

test('bloquea temporalmente después de cinco PIN incorrectos', async () => {
  await configureOfflineAccess('123456', docente, periodo);
  for (let i = 0; i < 4; i += 1) await expect(unlockOfflineAccess('999999')).rejects.toThrow('PIN incorrecto');
  await expect(unlockOfflineAccess('999999')).rejects.toThrow('bloqueado');
  await expect(unlockOfflineAccess('123456')).rejects.toThrow('15 minutos');
  jest.advanceTimersByTime(15 * 60 * 1000);
  await expect(unlockOfflineAccess('123456')).resolves.toHaveProperty('usuario.id', 42);
});

test('vence a las 24 horas y exige renovar con internet', async () => {
  await configureOfflineAccess('123456', docente, periodo);
  expect(getOfflineAccessInfo().expiresAt).toBe(Date.now() + 24 * 60 * 60 * 1000);
  jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
  await expect(unlockOfflineAccess('123456')).rejects.toThrow('venció');
});

test('rechaza PIN débil en longitud y cuentas no docentes', async () => {
  await expect(configureOfflineAccess('1234', docente, periodo)).rejects.toThrow('6 dígitos');
  await expect(configureOfflineAccess('123456', { ...docente, rol: 'ALUMNO' }, periodo)).rejects.toThrow('sesión docente');
});
