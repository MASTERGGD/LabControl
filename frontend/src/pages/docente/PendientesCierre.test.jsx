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
    const campos = [...host.querySelectorAll('form textarea')];
    const cambiar = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => {
      cambiar.call(campos[0], 'La clase se impartió y conservo la lista.');
      campos[0].dispatchEvent(new Event('input', { bubbles: true }));
      cambiar.call(campos[1], 'Solicito autorización para capturar asistencia.');
      campos[1].dispatchEvent(new Event('input', { bubbles: true }));
    });
    const enviar = host.querySelector('button[type="submit"]');
    expect(enviar.disabled).toBe(false);
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(solicitarRevision).toHaveBeenCalledWith(fila,
      'Qué ocurrió: La clase se impartió y conservo la lista.\n\nQué solicito a División: Solicito autorización para capturar asistencia.');
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
    const [aclaracion, peticion] = host.querySelectorAll('form textarea');
    expect(aclaracion.required).toBe(false);
    expect(peticion.required).toBe(true);
    const cambiar = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => {
      cambiar.call(peticion, 'Solicito un nuevo plazo para capturar.');
      peticion.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelector('button[type="submit"]').disabled).toBe(false);
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(solicitarRevision).toHaveBeenCalledWith(fila, { peticion: 'Solicito un nuevo plazo para capturar.', aclaracion: '' });
  } finally {
    act(() => root.unmount());
  }
});
