import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AvisoInicioAdmin from './AvisoInicioAdmin';
import api from '../../hooks/useApi';

jest.mock('../../components/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../../hooks/useApi', () => ({ get: jest.fn(), put: jest.fn() }));

const activo = {
  revision: 'actual', titulo: 'Cierre del cuatrimestre', mensaje: 'Revisa tus avances.',
  audiencia: 'DOCENTES', vigente_hasta: '2026-11-24', destino: 'seguimiento',
};
const anterior = {
  ...activo, revision: 'anterior', titulo: 'Recuerda tus registros', vigente_hasta: '2026-11-20',
  version: 1, estado: 'VENCIDO', publicado_por: 'Superadministrador de prueba',
};

let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers().setSystemTime(new Date('2026-11-24T10:00:00-06:00'));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/historial')
    ? { avisos: [{ id: 'anterior', versiones: [anterior] }], hay_mas: false } : activo }));
  api.put.mockResolvedValue({ data: { ...activo, revision: 'editado' } });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
  jest.resetAllMocks();
});

const boton = texto => [...host.querySelectorAll('button')].find(b => b.textContent === texto);

test('muestra la tarjeta publicada y vuelve a ella al guardar una edición', async () => {
  await act(async () => root.render(<AvisoInicioAdmin />));
  expect(host.querySelector('form')).toBeNull();
  expect(host.textContent).toContain('Aviso activo');
  await act(async () => boton('Editar aviso').click());
  expect(host.querySelector('input[name="titulo"]').value).toBe(activo.titulo);
  await act(async () => boton('Guardar cambios').click());
  expect(api.put).toHaveBeenCalledWith('/aviso-inicio/admin', expect.objectContaining({
    revision_actual: 'actual', revision_edicion: 'actual',
  }));
  expect(host.querySelector('form')).toBeNull();
  expect(host.textContent).toContain('Aviso activo');
});

test('copia el texto histórico como borrador y exige elegir una nueva vigencia', async () => {
  await act(async () => root.render(<AvisoInicioAdmin />));
  expect(host.querySelector('details').textContent).toContain('Vencido');
  host.querySelector('details').open = true;
  await act(async () => boton('Usar como borrador').click());
  expect(host.querySelector('input[name="titulo"]').value).toBe(anterior.titulo);
  expect(host.querySelector('input[name="vigente_hasta"]').value).toBe('');
  expect(api.put).not.toHaveBeenCalled();
});
