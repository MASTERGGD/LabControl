import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AsistenciaHorarioChart from './AsistenciaHorarioChart';

test('interrumpe la línea sin datos y permite consultar puntos con teclado y clic', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  const serie = { puntos: [
    { hora: '08:00', asistentes: 30, listas_confirmadas: 2, listas_pendientes: 0, grupos_pendientes: 0 },
    { hora: '08:30', asistentes: null, listas_confirmadas: 0, listas_pendientes: 1, grupos_pendientes: 1 },
    { hora: '09:00', asistentes: 12, listas_confirmadas: 1, listas_pendientes: 1, grupos_pendientes: 1 },
  ] };
  try {
    act(() => root.render(<AsistenciaHorarioChart serie={serie} />));
    expect(host.querySelector('path').getAttribute('d').match(/M/g)).toHaveLength(2);
    expect(host.textContent).toContain('Máximo registrado: 30 alumnos');
    const botones = host.querySelectorAll('[role="button"]');
    act(() => botones[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(host.querySelector('[aria-live]').textContent).toContain('08:30 · Sin dato');
    expect(host.querySelector('[aria-live]').textContent).toContain('1 listas pendientes en 1 grupos');
    act(() => botones[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(host.querySelector('[aria-live]').textContent).toContain('08:00 · 30 alumnos');
    act(() => root.render(<AsistenciaHorarioChart serie={{ puntos: [] }} />));
    expect(host.textContent).toContain('Aún no hay horarios iniciados');
    expect(host.querySelector('svg')).toBeNull();
  } finally { act(() => root.unmount()); }
});
