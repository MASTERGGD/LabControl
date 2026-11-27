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
    await act(async () => root.render(<PendientesCierre completa filas={filas}
      seleccionarPendiente={seleccionarPendiente} abrirClase={abrirClase} />));
    const filtro = host.querySelector('select');
    await act(async () => {
      filtro.value = 'todas';
      filtro.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const vencida = [...host.querySelectorAll('li')].find(fila => fila.textContent.includes('Pasaron los 7 días para capturar esta sesión'));
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

test('deja solo el acceso en la vista compacta y separa las fechas vencidas en la vista completa', async () => {
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
    expect(host.querySelectorAll('li')).toHaveLength(0);
    const boton = [...host.querySelectorAll('button')].find(item => item.textContent === 'Ver pendientes');
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

test('abre Mis pendientes para una sola sesión y envía una solicitud con hechos y petición', async () => {
  const fila = {
    id: '7/2026-09-14', cargaId: 7, materia: 'Sistemas de Optimización', grupo: '4° A',
    fecha: '2026-09-14', vencida: true,
  };
  const verTodos = jest.fn();
  const solicitarRevision = jest.fn().mockResolvedValue(undefined);
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<PendientesCierre filas={[fila]} verTodos={verTodos} solicitarRevision={solicitarRevision} />));
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('button').textContent).toBe('Ver pendientes');
    await act(async () => host.querySelector('button').click());
    expect(verTodos).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<PendientesCierre completa filas={[fila]} solicitarRevision={solicitarRevision} />));
    const [categoria, peticion] = host.querySelectorAll('form select');
    await act(async () => {
      categoria.value = 'IMPARTIDA';
      categoria.dispatchEvent(new Event('change', { bubbles: true }));
      peticion.value = 'AUTORIZAR_CAPTURA';
      peticion.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('button[type="submit"]').disabled).toBe(false);
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(solicitarRevision).toHaveBeenCalledWith(fila, {
      categoria: 'IMPARTIDA', tramite: 'AUTORIZAR_CAPTURA', observaciones: '',
    });
  } finally {
    act(() => root.unmount());
  }
});

test('reutiliza el motivo de una autorización vencida y solo exige la petición', async () => {
  const fila = {
    id: '7/2026-09-14', cargaId: 7, materia: 'Sistemas de Optimización', fecha: '2026-09-14',
    revision: { estado: 'AUTORIZACION_VENCIDA', motivo_previo: 'La clase se impartió y conservo la lista.' },
  };
  const solicitarRevision = jest.fn().mockResolvedValue(undefined);
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<PendientesCierre completa filas={[fila]} solicitarRevision={solicitarRevision} />));
    expect(host.textContent).toContain(fila.revision.motivo_previo);
    const aclaracion = host.querySelector('form textarea');
    const peticion = host.querySelector('form select');
    expect(aclaracion.required).toBe(false);
    expect(peticion.required).toBe(true);
    await act(async () => {
      peticion.value = 'AUTORIZAR_CAPTURA';
      peticion.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('button[type="submit"]').disabled).toBe(false);
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(solicitarRevision).toHaveBeenCalledWith(fila, { categoria: null, tramite: 'AUTORIZAR_CAPTURA', observaciones: '' });
  } finally {
    act(() => root.unmount());
  }
});

test('muestra Estás al día y conserva 40 revisiones solo en el historial explícito', async () => {
  const filas = Array.from({ length: 40 }, (_, indice) => ({
    id: indice, materia: 'Sistemas de Optimización', fecha: '2026-09-14', estado: 'Regularizada',
    revision: { id: indice + 1, estado: 'REGULARIZADA', historial: [] },
  }));
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<PendientesCierre completa filas={filas} />));
    expect(host.textContent).toContain('Estás al día');
    expect(host.querySelectorAll('li')).toHaveLength(0);
    const historial = [...host.querySelectorAll('button')].find(boton => boton.textContent.includes('Ver revisiones resueltas'));
    expect(historial.textContent).toContain('(40)');
    await act(async () => historial.click());
    expect(host.querySelector('select').value).toBe('resueltas');
    expect(host.querySelectorAll('li')).toHaveLength(15);
    expect(host.textContent).toContain('de 40');
  } finally {
    act(() => root.unmount());
  }
});
