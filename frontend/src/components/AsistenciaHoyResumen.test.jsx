import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AsistenciaHoyResumen from './AsistenciaHoyResumen';

test('pestañas, ordenación y filtros conservan pendientes y distinguen falta de captura', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  const grupo = { carrera: 'IA', asistentes: 12, a_tiempo: 10, retardos: 2, faltaron: 1, justificados: 1, alumnos_con_registro: 14, listas_confirmadas: 1, listas_pendientes: 0, listas_en_captura: 0 };
  const datos = { corte: '2026-09-30', resumen: { ...grupo, grupos_sin_lista: 1, listas_pendientes: 2 }, criterio: 'Solo listas cerradas', carreras: [
    { ...grupo, carrera: 'IA' }, { ...grupo, carrera: 'Software', asistentes: 20 },
  ], grupos: [
    { ...grupo, id: 1, nombre: 'Grupo A', estado: 'CON_LISTA', listas_pendientes: 1 },
    { ...grupo, id: 2, nombre: 'Grupo B', estado: 'SIN_LISTA', listas_confirmadas: 0, listas_pendientes: 1, listas_en_captura: 1 },
    { ...grupo, id: 3, nombre: 'Grupo C', estado: 'SIN_ACTIVIDAD', listas_confirmadas: 0 },
  ] };
  const click = text => act(() => [...host.querySelectorAll('button')].find(b => b.textContent === text).click());
  try {
    act(() => root.render(<AsistenciaHoyResumen datos={datos} />));
    expect(host.querySelectorAll('.attendance-kpi')).toHaveLength(4);
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('details').open).toBe(false);
    expect(host.querySelectorAll('details')).toHaveLength(1);
    expect(host.querySelector('summary').textContent).toBe('Ver desglose y cobertura del día');
    expect(host.querySelector('[role="status"]').textContent).toContain('2 listas pendientes en 2 grupos.');
    const guia = host.querySelector('dialog');
    guia.showModal = jest.fn();
    click('Guía de asistencia');
    expect(guia.showModal).toHaveBeenCalledTimes(1);
    expect(guia.querySelector('form').getAttribute('method')).toBe('dialog');
    expect(guia.textContent).toContain('Una lista pendiente no significa que los alumnos hayan faltado.');
    click('Ver pendientes');
    expect(host.querySelector('[aria-selected="true"]').textContent).toBe('Por grupo');
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(host.textContent).toContain('Con pendientes');
    expect(host.textContent).toContain('En captura / corrección: 1');
    expect(host.querySelectorAll('tbody tr')[1].children[1].textContent).toBe('—');
    const filtros = host.querySelectorAll('input');
    act(() => filtros[1].click());
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
    act(() => filtros[0].click());
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3);
    click('Por carrera');
    expect(host.querySelector('tbody tr').textContent).toContain('Software');
    click('Alumnos del día ↓');
    expect(host.querySelector('tbody tr').textContent).toContain('IA');
    const selected = host.querySelector('[aria-selected="true"]');
    act(() => selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(host.querySelector('[aria-selected="true"]').textContent).toBe('Vista general');
    expect(document.activeElement.textContent).toBe('Vista general');
  } finally { act(() => root.unmount()); host.remove(); }
});
