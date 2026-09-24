import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MobileRoleSwitcher from './MobileRoleSwitcher';

let root, host;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (props) => act(() => root.render(<MobileRoleSwitcher {...props} />));

test('permite cambiar a docente y regresar a laboratorio con los roles autorizados', () => {
  const onChange = jest.fn();
  const usuario = { rol: 'LAB_ADMIN', roles_disponibles: ['LAB_ADMIN', 'DOCENTE'] };
  render({ usuario, onChange });
  const [lab, docente] = host.querySelectorAll('button');
  expect(lab.getAttribute('aria-pressed')).toBe('true');
  act(() => docente.click());
  expect(onChange).toHaveBeenLastCalledWith('DOCENTE');
  render({ usuario: { ...usuario, rol: 'DOCENTE' }, onChange });
  act(() => host.querySelector('button').click());
  expect(onChange).toHaveBeenLastCalledWith('LAB_ADMIN');
});

test('no ofrece funciones adicionales a una cuenta con un solo rol', () => {
  render({ usuario: { rol: 'DOCENTE', roles_disponibles: ['DOCENTE'] } });
  expect(host.querySelector('button')).toBeNull();
});

test('evita cambios repetidos durante la solicitud o al tocar el modo actual', () => {
  const onChange = jest.fn();
  const usuario = { rol: 'LAB_ADMIN', roles_disponibles: ['LAB_ADMIN', 'DOCENTE'] };
  render({ usuario, onChange });
  act(() => host.querySelector('button').click());
  expect(onChange).not.toHaveBeenCalled();
  render({ usuario, onChange, busy: true });
  act(() => host.querySelectorAll('button')[1].click());
  expect(onChange).not.toHaveBeenCalled();
  expect(host.querySelector('[role="status"]').textContent).toContain('Cambiando');
});
