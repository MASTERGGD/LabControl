import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import DetalleReporteTutorial from './DetalleReporteTutorial';

let host, root, props;
const originalShow = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
const render = () => act(() => root.render(<DetalleReporteTutorial {...props} />));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  props = {
    reporte: { id: 7, alumno_nombre: 'Alumno de prueba', matricula: 'UTC007', materia: 'Física',
      estado: 'EN_SEGUIMIENTO', titulo: 'Atención académica', detalle: 'Descripción del reporte',
      tutor_destinatario: 'Tutor de prueba', reportado_por: 'Docente', creado_en: '2026-10-01T12:00:00',
      recibido_en: '2026-10-01T13:00:00', prioridad_confirmada: true },
    estado: { label: 'En seguimiento', cls: '' }, prioridad: 'Media', isDay: true,
    grupos: [{ id: 2, grupo: 'Grupo A', tutor_nombre: 'Tutor de prueba' }],
    onClose: jest.fn(), onAsignacion: jest.fn(), onAsignar: jest.fn(), onRecordar: jest.fn(), onCerrarReporte: jest.fn(),
  };
});
afterEach(() => {
  act(() => root.unmount()); host.remove();
  HTMLDialogElement.prototype.showModal = originalShow;
  HTMLDialogElement.prototype.close = originalClose;
});

test('abre fuera del contenedor de la página, enfoca el título y restaura el foco al cerrar', () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener); opener.focus();
  render();
  const dialog = document.querySelector('dialog');
  expect(dialog.parentElement).toBe(document.body);
  expect(dialog.open).toBe(true);
  expect(document.activeElement.id).toBe(dialog.getAttribute('aria-labelledby'));
  expect(document.body.style.overflow).toBe('hidden');
  expect(dialog.textContent).toContain('Descripción del reporte');
  expect(dialog.querySelector('.tutorial-context').textContent).toContain('Tutor de prueba');
  expect(dialog.querySelectorAll('time')).toHaveLength(2);
  act(() => dialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  act(() => root.render(null));
  expect(document.body.style.overflow).toBe('');
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

test('oculta la reasignación hasta elegirla y conserva los callbacks', async () => {
  render();
  expect(document.querySelector('select')).toBeNull();
  expect(document.querySelector('details').open).toBe(false);
  act(() => { document.querySelector('details').open = true; button('Reasignar tutor').click(); });
  expect(document.querySelector('select')).not.toBeNull();
  expect(document.querySelector('details').open).toBe(false);
  expect(button('Confirmar reasignación').disabled).toBe(true);
  act(() => {
    const select = document.querySelector('select'); select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(props.onAsignacion).toHaveBeenCalledWith('2');
  props.asignacion = '2'; render();
  await act(async () => button('Confirmar reasignación').click());
  expect(props.onAsignar).toHaveBeenCalledTimes(1);
  act(() => button('Cierre administrativo').click());
  expect(props.onCerrarReporte).toHaveBeenCalledTimes(1);
});

test('el recordatorio se desactiva mientras se envía y cuando ya es reciente', async () => {
  let resolver;
  props.onRecordar.mockImplementation(() => new Promise(resolve => { resolver = resolve; }));
  render();
  act(() => button('Recordar al tutor').click());
  expect(button('Procesando…').disabled).toBe(true);
  await act(async () => resolver());
  props.reporte = { ...props.reporte, ultimo_recordatorio_en: new Date().toISOString() };
  render();
  expect(button('Recordatorio enviado recientemente').disabled).toBe(true);
});

test('un reporte cerrado muestra resultado y no ofrece acciones de gestión', () => {
  props.reporte = { ...props.reporte, estado: 'CERRADO', resultado: 'Atención concluida' };
  render();
  expect(document.querySelector('dialog').textContent).toContain('Atención concluida');
  expect(document.querySelector('details')).toBeNull();
  expect(button('Recordar al tutor')).toBeUndefined();
  expect(button('Listo')).toBeDefined();
});

test('sin tutor muestra la asignación directamente', () => {
  props.reporte = { ...props.reporte, tutor_destinatario: null };
  render();
  expect(document.querySelector('select')).not.toBeNull();
  expect(button('Asignar tutor').disabled).toBe(true);
  expect(button('Recordar al tutor')).toBeUndefined();
});

test('muestra errores dentro del diálogo y permite reintentar', async () => {
  props.onRecordar.mockResolvedValue({ error: 'No se pudo enviar el recordatorio' });
  render();
  await act(async () => button('Recordar al tutor').click());
  expect(document.querySelector('dialog [role="alert"]').textContent).toContain('No se pudo enviar');
  expect(button('Recordar al tutor').disabled).toBe(false);
});
