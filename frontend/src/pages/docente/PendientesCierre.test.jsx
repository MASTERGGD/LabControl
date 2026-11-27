import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PendientesCierre, { reunirPendientesCierre } from './PendientesCierre';

test('ordena sesiones, evita duplicar clases abiertas y abre el flujo correspondiente', async () => {
  const captura = { carga_id: 1, fecha: '2026-11-24', hora_inicio: '09:00' };
  const filas = reunirPendientesCierre([{
    carga_id: 1, materia: 'Minería de Texto', grupo: '4° A', hora_inicio: '09:00', hora_fin: '10:00',
    resumen: {
      fechas_sin_registro: ['2026-11-24', '2026-11-10', '2026-11-17'],
      fechas_captura_vencida: ['2026-11-10'],
      sesiones: [{ id: 42, fecha: '2026-11-17', estado: 'ABIERTA' }],
    },
  }], [captura]);
  expect(filas.map(fila => fila.fecha)).toEqual(['2026-11-10', '2026-11-17', '2026-11-24']);
  const seleccionarPendiente = jest.fn();
  const abrirClase = jest.fn();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<PendientesCierre filas={filas}
      seleccionarPendiente={seleccionarPendiente} abrirClase={abrirClase} />));
    const vencida = [...host.querySelectorAll('li')].find(fila => fila.textContent.includes('Plazo de captura vencido'));
    expect(vencida.querySelector('summary').textContent).toBe('Ver cómo regularizar');
    expect(vencida.textContent).not.toContain('Resolver sesión');
    const continuar = [...host.querySelectorAll('button')].find(boton => boton.textContent === 'Continuar clase');
    const resolver = [...host.querySelectorAll('button')].find(boton => boton.textContent === 'Resolver sesión');
    expect(continuar.textContent).toBe('Continuar clase');
    expect(resolver.textContent).toBe('Resolver sesión');
    await act(async () => continuar.click());
    await act(async () => resolver.click());
    expect(abrirClase).toHaveBeenCalledWith(42);
    expect(seleccionarPendiente).toHaveBeenCalledWith(captura);
  } finally {
    act(() => root.unmount());
  }
});

test('limita la vista compacta y separa las fechas vencidas en la vista completa', async () => {
  const filas = Array.from({ length: 18 }, (_, indice) => ({
    id: indice, materia: 'Minería de Texto', fecha: `2026-11-${String(indice + 1).padStart(2, '0')}`,
    captura: indice < 4 ? { vence_en: `2026-11-${28 - indice}T09:00:00-06:00` } : undefined,
    vencida: indice >= 4,
  }));
  const verTodos = jest.fn();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<PendientesCierre filas={filas} verTodos={verTodos} />));
    expect(host.querySelectorAll('li')).toHaveLength(3);
    const boton = [...host.querySelectorAll('button')].find(item => item.textContent === 'Ver todos los pendientes');
    await act(async () => boton.click());
    expect(verTodos).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<PendientesCierre completa filas={filas} />));
    const select = host.querySelector('select');
    expect(select.value).toBe('accionables');
    expect(host.querySelectorAll('li')).toHaveLength(4);
    await act(async () => {
      select.value = 'vencidas';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelectorAll('li')).toHaveLength(14);
    const copiar = [...host.querySelectorAll('button')].find(item => item.textContent === 'Copiar datos de la sesión');
    await act(async () => copiar.click());
    expect(host.querySelector('textarea').value).toContain('2026-11-05');
  } finally {
    act(() => root.unmount());
  }
});
