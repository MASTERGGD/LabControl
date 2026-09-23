import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OfflineStatus, { getOfflineOperationTiming } from './OfflineStatus';
import useOfflineSync from '../hooks/useOfflineSync';

jest.mock('../hooks/useOfflineSync', () => ({ __esModule: true, default: jest.fn() }));

test('abre el diálogo fuera de la barra superior y permite cerrarlo', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  useOfflineSync.mockReturnValue({ online: false, pending: 1, conflicts: 0, syncing: false, sync: jest.fn(), operations: [] });
  const header = document.createElement('header');
  header.style.backdropFilter = 'blur(12px)';
  document.body.appendChild(header);
  const root = createRoot(header);
  try {
    act(() => root.render(<OfflineStatus enabled />));
    act(() => header.querySelector('button').click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(header.contains(dialog)).toBe(false);
    expect(dialog.parentElement.parentElement).toBe(document.body);
    expect(dialog.textContent).toContain('Capturas de este dispositivo');
    act(() => dialog.querySelector('[aria-label="Cerrar"]').click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    header.remove();
  }
});

test('advierte desde el quinto día y conserva un plazo vencido', () => {
  const inicio = new Date('2026-09-01T10:00:00-06:00');
  const item = { createdAt: inicio.toISOString(), data: {} };
  const quintoDia = new Date('2026-09-06T10:01:00-06:00').getTime();
  const octavoDia = new Date('2026-09-09T10:00:00-06:00').getTime();

  expect(getOfflineOperationTiming(item, quintoDia)).toEqual({ edadDias: 5, venceEn: 2 });
  expect(getOfflineOperationTiming(item, octavoDia).venceEn).toBeLessThanOrEqual(0);
});

test('usa la hora real de captura aunque la cola se haya creado después', () => {
  const item = {
    createdAt: '2026-09-05T10:00:00-06:00',
    data: { capturada_en: '2026-09-01T10:00:00-06:00' },
  };
  const ahora = new Date('2026-09-06T10:00:00-06:00').getTime();
  expect(getOfflineOperationTiming(item, ahora).edadDias).toBe(5);
});
