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
    expect(host.querySelector('li').textContent).toContain('Plazo de captura vencido');
    expect(host.querySelector('li').querySelector('button')).toBeNull();
    const [continuar, resolver] = host.querySelectorAll('button');
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
