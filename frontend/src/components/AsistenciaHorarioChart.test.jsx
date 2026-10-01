import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AsistenciaHorarioChart from './AsistenciaHorarioChart';

test('mantiene altura y etiquetas al cambiar entre monitor amplio y móvil', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const original = global.ResizeObserver;
  let resize;
  const disconnect = jest.fn();
  global.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnect(); }
  };
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() => root.render(<AsistenciaHorarioChart serie={{ puntos: [
      { hora: '08:00', asistentes: 10, listas_confirmadas: 1, listas_pendientes: 0, grupos_pendientes: 0 },
      { hora: '09:00', asistentes: 20, listas_confirmadas: 1, listas_pendientes: 0, grupos_pendientes: 0 },
    ] }} />));
    [3200, 1800, 900, 360].forEach(width => {
      act(() => resize([{ contentRect: { width } }]));
      const ancho = Math.max(600, width);
      const svg = host.querySelector('svg');
      expect(svg.getAttribute('viewBox')).toBe(`0 0 ${ancho} 285`);
      expect(svg.getAttribute('height')).toBe('285');
      expect(svg.getAttribute('width')).toBe(String(ancho));
      expect(svg.querySelector('text').getAttribute('font-size')).toBe('12');
      expect(svg.querySelector('line').getAttribute('x2')).toBe(String(ancho - 40));
      expect([...svg.querySelectorAll('[role="button"] circle')].pop().getAttribute('cx')).toBe(String(ancho - 40));
    });
  } finally {
    act(() => root.unmount());
    global.ResizeObserver = original;
  }
  expect(disconnect).toHaveBeenCalledTimes(1);
});

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
    expect(host.textContent).toContain('Mayor asistencia en un mismo horario: 30 alumnos');
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
