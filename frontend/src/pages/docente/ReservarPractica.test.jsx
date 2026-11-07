import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ModalReservar } from './SesionClase';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({ get: jest.fn(), post: jest.fn(), delete: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ usuario: { id: 4 } }) }));
jest.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ themeKey: 'day' }) }));
jest.mock('../../components/AdminLayout', () => () => null);
jest.mock('../../components/TimeGrid', () => () => null);
jest.mock('../../components/AutocompleteInput', () => ({ __esModule: true, default: ({ onSelect }) => <button type="button" onClick={() => onSelect({ nombre: 'Química', carrera: 'Agro', cuatrimestre_oficial: 1 })}>Elegir materia</button>, formatApiError: () => 'Error al reservar' }));
let root, container, cerrar, guardar;
const slot = { horario_id: 8, dia_semana: 0, hora_inicio: '09:00', hora_fin: '10:00', estado: 'LIBRE' };
const click = async text => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text)).click());
const input = async (element, value) => act(async () => {
  const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const render = async (categoria, horario = slot) => {
  await act(async () => root.render(<ModalReservar slot={horario} slots={[horario]} cuatrimestre="2026-3" laboratorio_id={2} laboratorio={{ categoria }} onClose={cerrar} onGuardado={guardar} />));
};
const submit = async () => act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  cerrar = jest.fn(); guardar = jest.fn();
  api.get.mockImplementation(url => Promise.resolve({ data: url.includes('catalogo-materiales') ? [{ clave: 'activo:5', activo_id: 5, nombre: 'Balanza', codigo: 'EQ-5', tipo: 'EQUIPO', unidad: 'PIEZA', existencia: 1, disponible: 1, estado: 'Disponible' }] : url.includes('diagnostico') ? { compatibles: [{ id: 1, grupo: 'A', total_alumnos: 10 }] } : [] }));
  api.post.mockResolvedValue({ data: { id: 9 } });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test('guardar y editar práctica conserva la reservación y solo envía al reservar', async () => {
  await render('QUIMICA');
  await click('Elegir materia');
  const fecha = new Date(); fecha.setDate(fecha.getDate() + ((8 - fecha.getDay()) % 7 || 7));
  const iso = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`;
  await act(async () => [...container.querySelectorAll('input[type="checkbox"]')].find(el => el.parentElement.textContent.includes('incluye una práctica')).click());
  expect(container.querySelector('h2').textContent).toBe('Datos de la práctica');
  await input(container.querySelector('[aria-label="Nombre de la práctica"]'), 'Medición de pH');
  await input(container.querySelector('input[type="date"]'), iso);
  await input(container.querySelector('[aria-label="Insumo del catálogo"]'), 'activo:5');
  await input(container.querySelector('[aria-label="Cantidad"]'), '1');
  await submit();
  expect(api.post).not.toHaveBeenCalled();
  expect(container.querySelector('h2').textContent).toBe('Reservar horario');
  expect(container.textContent).toContain('Práctica: Medición de pH');
  await click('Editar práctica');
  await input(container.querySelector('[aria-label="Nombre de la práctica"]'), 'Cambio descartado');
  await click('Cancelar');
  expect(container.textContent).toContain('Práctica: Medición de pH');
  expect(cerrar).not.toHaveBeenCalled();
  await submit();
  expect(api.post).toHaveBeenCalledWith('/horarios/reservaciones', expect.objectContaining({ materia: 'Química', grupo: 'A', horario_id: 8 }));
  expect(api.post).toHaveBeenCalledWith('/practicas-laboratorio', expect.objectContaining({ titulo: 'Medición de pH', fecha_sesion: iso, reservacion_id: 9 }));
  expect(api.post.mock.calls.find(([url]) => url === '/practicas-laboratorio')[1].materiales).toEqual([expect.objectContaining({ insumo_id: null, descripcion: 'Balanza · EQ-5', cantidad_solicitada: 1, nota: expect.stringContaining('Equipo de inventario: EQ-5') })]);
  expect(guardar).toHaveBeenCalledTimes(1);
});

test.each(['QUIMICA', 'AGROINDUSTRIA'])('cancelar la captura inicial en %s regresa sin activar práctica', async categoria => {
  await render(categoria);
  await act(async () => [...container.querySelectorAll('input[type="checkbox"]')].find(el => el.parentElement.textContent.includes('incluye una práctica')).click());
  await click('Cancelar');
  expect(container.querySelector('h2').textContent).toBe('Reservar horario');
  expect(container.textContent).not.toContain('Editar práctica');
  expect(api.post).not.toHaveBeenCalled();
  expect(cerrar).not.toHaveBeenCalled();
});

test('cómputo conserva requerimientos sin formulario de práctica', async () => {
  await render('COMPUTO');
  expect(container.textContent).toContain('Requerimientos para la clase');
  expect(container.textContent).not.toContain('Esta clase incluye una práctica');
});

test('la captura exige nombre, fecha y cantidades válidas antes de continuar', async () => {
  await render('QUIMICA');
  await act(async () => [...container.querySelectorAll('input[type="checkbox"]')].find(el => el.parentElement.textContent.includes('incluye una práctica')).click());
  await submit();
  expect(container.textContent).toContain('Escribe el nombre de la práctica.');
  await input(container.querySelector('[aria-label="Nombre de la práctica"]'), 'Ensayo');
  await submit();
  expect(container.textContent).toContain('Selecciona la fecha en que se realizará la práctica.');
  const fecha = new Date(); fecha.setDate(fecha.getDate() + ((8 - fecha.getDay()) % 7 || 7));
  await input(container.querySelector('input[type="date"]'), `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`);
  await input(container.querySelector('[aria-label="Descripción"]'), 'Matraz');
  await submit();
  expect(container.textContent).toContain('Completa descripción, cantidad y unidad');
  expect(container.querySelector('h2').textContent).toBe('Datos de la práctica');
  expect(api.post).not.toHaveBeenCalled();
});

const checkboxPractica = () => [...container.querySelectorAll('input[type="checkbox"]')].find(el => el.parentElement.textContent.includes('incluye una práctica'));
const reservarSoloFecha = async () => act(async () => [...container.querySelectorAll('input[type="checkbox"]')].find(el => el.parentElement.textContent.includes('Reservar solo en una fecha')).click());

test('sábado en horario de miércoles avisa inmediatamente y bloquea práctica y reserva; corregir conserva materia y grupo', async () => {
  await render('QUIMICA', { ...slot, dia_semana: 2 });
  await click('Elegir materia');
  await reservarSoloFecha();
  expect(checkboxPractica().disabled).toBe(true);
  const fecha = container.querySelector('[aria-label="Fecha de la sesión"]');
  expect(fecha.step).toBe('7');
  expect(new Date(`${fecha.min}T12:00:00Z`).getUTCDay()).toBe(3);
  await input(fecha, '2099-11-07');
  expect(fecha.getAttribute('aria-invalid')).toBe('true');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Este horario corresponde al miércoles');
  expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
  expect(checkboxPractica().disabled).toBe(true);
  await submit();
  expect(api.post).not.toHaveBeenCalled();
  await input(fecha, '2099-11-04');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(fecha.validationMessage).toBe('');
  expect(container.textContent).toContain('miércoles, 4 de noviembre de 2099');
  expect(checkboxPractica().disabled).toBe(false);
  expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
  await submit();
  expect(api.post).toHaveBeenCalledWith('/horarios/reservaciones', expect.objectContaining({ materia: 'Química', grupo: 'A', fecha_actividad: '2099-11-04' }));
});

test('corregir fecha de práctica muestra aviso inmediato sin perder lo escrito', async () => {
  await render('AGROINDUSTRIA', { ...slot, dia_semana: 2 });
  await act(async () => checkboxPractica().click());
  await input(container.querySelector('[aria-label="Nombre de la práctica"]'), 'Ensayo conservado');
  const fecha = container.querySelector('[aria-label="Fecha de esta práctica"]');
  await input(fecha, '2099-11-07');
  expect(container.querySelector('[role="alert"]').textContent).toContain('miércoles');
  expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
  await input(fecha, '2099-11-04');
  expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
  expect(container.querySelector('[aria-label="Nombre de la práctica"]').value).toBe('Ensayo conservado');
  await submit();
  expect(container.textContent).toContain('Práctica: Ensayo conservado');
  expect(api.post).not.toHaveBeenCalled();
});

test('la fecha equivocada también bloquea reservar en cómputo y actividad institucional', async () => {
  await render('COMPUTO', { ...slot, dia_semana: 2 });
  await reservarSoloFecha();
  await input(container.querySelector('[aria-label="Fecha de la sesión"]'), '2099-11-07');
  expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
  await input(container.querySelector('select'), 'CAPACITACION');
  await input(container.querySelector('[aria-label="Fecha específica"]'), '2099-11-07');
  expect(container.querySelector('[role="alert"]').textContent).toContain('miércoles');
  expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
  await submit();
  expect(api.post).not.toHaveBeenCalled();
});
