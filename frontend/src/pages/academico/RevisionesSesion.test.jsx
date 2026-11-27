import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import RevisionesSesion from './RevisionesSesion';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({ post: jest.fn() }));

test('cierra el detalle y conserva el filtro tras autorizar captura', async () => {
  const original = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
    close: { configurable: true, value() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); } },
  });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  const cierre = { estado: 'ACTIVO', cargas: [{
    carga_id: 12, docente: 'Docente de prueba', materia: 'Sistemas', grupo: '4° A',
    revisiones_sesion: [{ id: 3, estado: 'EN_REVISION', fecha: '2026-09-14', historial: [] }],
  }] };
  api.post.mockResolvedValue({});
  const recargar = jest.fn();
  try {
    await act(async () => root.render(<RevisionesSesion cierre={cierre} recargar={recargar} />));
    await act(async () => host.querySelector('li button').click());
    const decision = host.querySelector('dialog select');
    await act(async () => {
      decision.value = 'AUTORIZADA';
      decision.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.querySelector('dialog')).toBeNull();
    expect(host.querySelector('[role="status"]').textContent).toBe('Captura autorizada.');
    expect(host.querySelector('select').value).toBe('EN_REVISION');
    expect(recargar).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    for (const metodo of ['showModal', 'close']) {
      if (original[metodo]) Object.defineProperty(HTMLDialogElement.prototype, metodo, original[metodo]);
      else delete HTMLDialogElement.prototype[metodo];
    }
  }
});
