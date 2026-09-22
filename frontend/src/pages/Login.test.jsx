import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { useAuth } from '../context/AuthContext';
import { getOfflineAccessInfo } from '../utils/offlineAccess';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../utils/offlineAccess', () => ({ getOfflineAccessInfo: jest.fn() }));
jest.mock('../hooks/useApi', () => ({ post: jest.fn() }));

let container;
let root;
const setOnline = value => Object.defineProperty(navigator, 'onLine', { configurable: true, value });
const renderLogin = () => act(() => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Login /></MemoryRouter>));
const button = text => [...container.querySelectorAll('button')].find(element => element.textContent === text);

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  setOnline(true);
  useAuth.mockReturnValue({ usuario: null, login: jest.fn(), loginOffline: jest.fn() });
  getOfflineAccessInfo.mockReturnValue({ expiresAt: Date.now() + 86400000 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setOnline(true);
  jest.clearAllMocks();
});

test('prioriza credenciales con conexión y permite abrir y ocultar el PIN', () => {
  renderLogin();
  expect(container.querySelector('#email')).not.toBeNull();
  expect(container.querySelector('#offline-pin')).toBeNull();
  act(() => button('Acceder sin conexión').click());
  expect(container.querySelector('#email')).toBeNull();
  expect(container.querySelector('#offline-pin').type).toBe('password');
  act(() => button('Mostrar').click());
  expect(container.querySelector('#offline-pin').type).toBe('text');
  act(() => button('Volver a iniciar sesión').click());
  expect(container.querySelector('#email')).not.toBeNull();
});

test('cambia el acceso principal al perder y recuperar la conexión', () => {
  renderLogin();
  act(() => { setOnline(false); window.dispatchEvent(new Event('offline')); });
  expect(container.querySelector('#offline-pin')).not.toBeNull();
  expect(container.querySelector('#email')).toBeNull();
  act(() => { setOnline(true); window.dispatchEvent(new Event('online')); });
  expect(container.querySelector('#email')).not.toBeNull();
  expect(container.querySelector('#offline-pin')).toBeNull();
});

test('sin configuración offline explica cómo recuperar el acceso', () => {
  getOfflineAccessInfo.mockReturnValue(null);
  setOnline(false);
  renderLogin();
  expect(container.querySelector('[role="status"]').textContent).toContain('Conéctate a internet');
  expect(container.querySelector('form')).toBeNull();
  act(() => { setOnline(true); window.dispatchEvent(new Event('online')); });
  expect(container.querySelector('#email')).not.toBeNull();
  expect(button('Acceder sin conexión')).toBeUndefined();
});
