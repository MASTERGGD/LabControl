import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AppUpdateNotice from './AppUpdateNotice';

let host;
let root;
let script;
const originalFetch = global.fetch;
const manifest = main => ({ ok: true, json: async () => ({ files: { 'main.js': main } }) });
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  script = document.createElement('script');
  script.src = '/static/js/main.abc123.js';
  document.head.appendChild(script);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  global.fetch = jest.fn().mockResolvedValue(manifest('/static/js/main.abc123.js'));
});
afterEach(() => {
  act(() => root.unmount());
  script.remove();
  host.remove();
  global.fetch = originalFetch;
  jest.useRealTimers();
});
const render = () => act(async () => root.render(<AppUpdateNotice />));

test('no avisa si la versión coincide; detecta una publicación al volver a la app', async () => {
  await render();
  expect(host.textContent).toBe('');
  expect(fetch).toHaveBeenCalledWith('/asset-manifest.json', expect.objectContaining({ cache: 'no-store' }));
  fetch.mockResolvedValue(manifest('/static/js/main.def456.js'));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.textContent).toContain('Nueva versión disponible');
  expect(host.querySelector('button').textContent).toBe('Actualizar aplicación');
});

test('tolera fallo de red y detecta la nueva versión al recuperar conexión', async () => {
  fetch.mockRejectedValueOnce(new TypeError('offline'));
  await render();
  expect(host.textContent).toBe('');
  fetch.mockResolvedValue(manifest('/static/js/main.def456.js'));
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(host.textContent).toContain('Nueva versión disponible');
});

test('detecta cambios de diseño aunque el JavaScript sea el mismo', async () => {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/static/css/main.aaa111.css';
  document.head.appendChild(css);
  try {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ files: {
      'main.js': '/static/js/main.abc123.js', 'main.css': '/static/css/main.bbb222.css',
    } }) });
    await render();
    expect(host.textContent).toContain('Nueva versión disponible');
  } finally { css.remove(); }
});

test('ignora respuestas inválidas y cancela comprobaciones al desmontar', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  await render();
  expect(host.textContent).toBe('');
  const signal = fetch.mock.calls[0][1].signal;
  act(() => root.unmount());
  root = createRoot(host);
  expect(signal.aborted).toBe(true);
  fetch.mockClear();
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    jest.advanceTimersByTime(5 * 60 * 1000);
  });
  expect(fetch).not.toHaveBeenCalled();
});
