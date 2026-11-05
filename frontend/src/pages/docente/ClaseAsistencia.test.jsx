import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ClaseAsistencia from './ClaseAsistencia';
import api from '../../hooks/useApi';
import { getOfflineSnapshot, saveOfflineSnapshot, enqueueOfflineOperation } from '../../utils/offlineStore';

jest.mock('react-router-dom', () => ({ useParams: () => ({ claseId: '1' }), useNavigate: () => jest.fn() }));
jest.mock('../../components/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/ContextoAlumnoDocente', () => () => null);
jest.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ themeKey: 'day' }) }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ usuario: { id: 1 }, offlineAccess: false }) }));
jest.mock('../../hooks/useApi', () => ({ get: jest.fn(), patch: jest.fn() }));
jest.mock('../../utils/offlineStore', () => ({ getOfflineSnapshot: jest.fn(), saveOfflineSnapshot: jest.fn(), enqueueOfflineOperation: jest.fn() }));

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('contexto-alumnos') ? {} : {
    id: 1, estado: 'ABIERTA', fecha: '2026-11-05',
    carga: { id: 1, actividad_nombre: 'Clase de prueba', grupo: 'A', hora_inicio: '13:00', hora_fin: '14:00' },
    alumnos: [{ alumno_id: 1, asistencia_id: 7, nombre: 'Alumno de prueba', estado: 'PRESENTE' }],
    resumen: { total: 1, presente: 1, falta: 0, retardo: 0 },
  } }));
  saveOfflineSnapshot.mockRejectedValue(new Error('Datos offline bloqueados'));
  getOfflineSnapshot.mockRejectedValue(new Error('Almacenamiento no disponible'));
  api.patch.mockResolvedValue({ data: {} });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.resetAllMocks(); });

test('carga la lista online aunque no se pueda guardar la copia cifrada', async () => {
  await act(async () => { root.render(<ClaseAsistencia />); });
  expect(container.textContent).toContain('Clase de prueba');
  expect(container.textContent).not.toContain('todavía no está disponible sin conexión');
  expect(container.textContent).not.toContain('Trabajando sin conexión');
  expect(getOfflineSnapshot).not.toHaveBeenCalled();
});

test('no encola de nuevo un cambio confirmado por el servidor si falla la caché', async () => {
  await act(async () => { root.render(<ClaseAsistencia />); });
  const falta = [...container.querySelectorAll('button')].find(b => b.textContent === 'Falta');
  await act(async () => { falta.click(); });
  expect(api.patch).toHaveBeenCalledWith('/docencia/clases/1/asistencia/7', { estado: 'FALTA', observacion: null });
  expect(enqueueOfflineOperation).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain('Trabajando sin conexión');
});
