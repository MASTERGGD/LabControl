import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PWAInstallProvider } from '../hooks/usePWAInstall';
import PWAInstallAccess from './PWAInstallAccess';

let container;
let root;
let standalone;
const render = () => act(() => root.render(<PWAInstallProvider><PWAInstallAccess /></PWAInstallProvider>));
const button = () => [...container.querySelectorAll('button')].find(el => el.textContent === 'Instalar SIGA');
const offer = () => {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'dismissed' });
  act(() => window.dispatchEvent(event));
  return event;
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  standalone = false;
  window.matchMedia = jest.fn(() => ({ matches: standalone, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test('ofrece instrucciones sin evento de instalación', () => {
  render();
  act(() => button().click());
  expect(container.textContent).toContain('Safari');
  expect(container.textContent).toContain('configura tu PIN');
});

test('permite instalar con banner descartado y consume el evento una sola vez', async () => {
  sessionStorage.setItem('pwa-dismissed', '1');
  render();
  const event = offer();
  await act(async () => button().click());
  await act(async () => button().click());
  expect(event.prompt).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Safari');
  const next = offer();
  next.userChoice = Promise.resolve({ outcome: 'accepted' });
  await act(async () => button().click());
  expect(next.prompt).toHaveBeenCalledTimes(1);
  expect(button()).toBeUndefined();
});

test('oculta la opción al instalar desde el navegador', () => {
  render();
  act(() => window.dispatchEvent(new Event('appinstalled')));
  expect(button()).toBeUndefined();
});

test('oculta la opción al abrir como aplicación', () => {
  standalone = true;
  render();
  expect(button()).toBeUndefined();
});

test('un fallo del diálogo muestra instrucciones', async () => {
  render();
  const event = offer();
  event.prompt.mockRejectedValue(new Error('unavailable'));
  await act(async () => button().click());
  expect(container.textContent).toContain('Safari');
});
