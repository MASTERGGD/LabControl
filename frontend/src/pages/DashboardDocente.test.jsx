import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import DashboardDocente from './DashboardDocente';
import api from '../hooks/useApi';
import { abrirClaseDocente } from '../utils/abrirClaseDocente';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../components/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ usuario: { nombre: 'Docente' } }) }));
jest.mock('../context/PeriodoContext', () => ({ usePeriodo: () => ({ periodo: { clave: 'SEP-DIC 2026' } }) }));
jest.mock('../hooks/useApi', () => ({ get: jest.fn() }));
jest.mock('../utils/abrirClaseDocente', () => ({ abrirClaseDocente: jest.fn().mockResolvedValue(undefined) }));

let host, root;
const bloque = { id: 12, hora_inicio: '10:15', hora_fin: '12:00', calendario: { requiere_asistencia: true, permite_iniciar_clase: true } };
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-03T09:59:59-06:00'));
  jest.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/docencia/dashboard' ? {
    fecha: '2026-09-03', resumen: { grupos_activos: 1 }, grupos: [], alumnos_prioritarios: [],
    jornada: [{ carga_id: 12, materia: 'Inteligencia artificial', grupo: '7 A', espacio: 'Salón 14', hora_inicio: '10:15', hora_fin: '12:00', estado: 'PROGRAMADA' }],
    proxima_clase: null,
  } : url === '/docencia/hoy' ? [bloque] : [] }));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});
test('el reloj habilita ambos accesos sin recargar y abre el bloque directamente', async () => {
  await act(async () => root.render(<DashboardDocente />));
  expect(host.textContent).not.toContain('Iniciar clase');
  await act(async () => jest.advanceTimersByTime(1000));
  const botones = [...host.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Iniciar clase');
  expect(botones).toHaveLength(2);
  await act(async () => {
    botones[0].click();
    botones[0].click();
  });
  expect(abrirClaseDocente).toHaveBeenCalledTimes(1);
  expect(abrirClaseDocente).toHaveBeenCalledWith(api, mockNavigate, bloque);
  expect(mockNavigate).not.toHaveBeenCalledWith('/docente/horario');
});
test('al entrar durante la clase aparece el acceso aunque no haya próxima clase futura', async () => {
  jest.setSystemTime(new Date('2026-09-03T10:30:00-06:00'));
  await act(async () => root.render(<DashboardDocente />));
  expect(host.textContent).toContain('Tu clase actual');
  const botones = [...host.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Iniciar clase');
  await act(async () => botones[1].click());
  expect(abrirClaseDocente).toHaveBeenCalledWith(api, mockNavigate, bloque);
});

test('el indicador de asistencia abre directamente la clase pendiente', async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/docencia/dashboard' ? {
    fecha: '2026-09-03',
    resumen: { grupos_activos: 1, asistencias_pendientes: 1, acuerdos_pendientes: 0 },
    asistencias_pendientes: [{ clase_id: 91, carga_id: 12, fecha: '2026-09-02', materia: 'Inteligencia artificial', accion: 'Continuar asistencia' }],
    jornada: [], grupos: [], alumnos_prioritarios: [], proxima_clase: null,
  } : [] }));
  await act(async () => root.render(<DashboardDocente />));
  const boton = [...host.querySelectorAll('button')].find(item => item.textContent.includes('Asistencias'));
  await act(async () => boton.click());
  expect(mockNavigate).toHaveBeenCalledWith('/docente/clase/91');
});
