import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ModalCerrarSesion } from './SesionActiva';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({ post: jest.fn() }));
jest.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ themeKey: 'day' }) }));
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  api.post.mockResolvedValue({ data: {} });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.resetAllMocks(); });
const click = async text => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text)).click());

test('la entrega de laboratorio continúa a asistencia sin cerrar antes la sesión', async () => {
  const continuar = jest.fn(), cerrar = jest.fn();
  await act(async () => root.render(<ModalCerrarSesion sesion={{ id: 9, materia: 'Clase', grupo: 'A' }} pcs={[]} onContinuarAsistencia={continuar} onCerrada={cerrar} />));
  await click('Continuar a asistencia y tema');
  expect(continuar).toHaveBeenCalledTimes(1);
  expect(api.post).not.toHaveBeenCalled();
  expect(cerrar).not.toHaveBeenCalled();
});

test('una sesión independiente conserva el cierre de laboratorio', async () => {
  const cerrar = jest.fn();
  await act(async () => root.render(<ModalCerrarSesion sesion={{ id: 9 }} pcs={[]} onCerrada={cerrar} />));
  await click('Cerrar sesión');
  expect(api.post).toHaveBeenCalledWith('/sesiones/9/cerrar', { observacion_general: null });
  expect(cerrar).toHaveBeenCalledTimes(1);
});
