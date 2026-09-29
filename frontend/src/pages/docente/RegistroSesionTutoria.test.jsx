import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import RegistroSesionTutoria from './RegistroSesionTutoria';
import api from '../../hooks/useApi';
jest.mock('../../hooks/useApi', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn() }));
jest.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const grupo = { id: 1, carrera: 'TI', cuatrimestre: 1, grupo: 'A' };
const alumnos = [{ id: 3, nombre: 'Alumno Prueba', matricula: '123' }];

beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); global.IS_REACT_ACT_ENVIRONMENT = true; });

test('abre el horario con fecha y hora precargadas', async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url.startsWith('/tutoria/programaciones') ? [] : [{ id: 7, fecha_programada: '2026-09-28', hora_inicio: '11:00', duracion_minutos: 60, lugar: 'Aula 1' }] }));
  const container = document.createElement('div'); const root = createRoot(container);
  try {
    await act(async () => root.render(<RegistroSesionTutoria grupo={grupo} alumnos={alumnos} origen={{ carga_docente_id: 7, fecha: '2026-09-28' }} onClose={() => {}} onGuardado={() => {}} />));
    expect(container.querySelector('input[type=date]').value).toBe('2026-09-28');
    expect(container.querySelector('input[type=time]').value).toBe('11:00');
    expect(container.textContent).toContain('Vinculada al horario del 28/9/2026');
  } finally { act(() => root.unmount()); }
});

test('consulta una sesión y permite editar el mismo registro con motivo', async () => {
  api.get.mockResolvedValue({ data: [] }); api.put.mockResolvedValue({ data: { id: 9 } });
  const sesion = { id: 9, revision: 1, fecha: '2026-09-28', hora_inicio: '11:00', duracion_minutos: 60, tipo_sesion: 'GRUPAL', categoria: 'ACADEMICO', tema: 'Tema original', carga_docente_id: 7, fecha_programada: '2026-09-28', registros: [{ alumno_id: 3, nombre: 'Alumno Prueba', matricula: '123', asistio: true, comentarios: '' }], historial: [] };
  const container = document.createElement('div'); const root = createRoot(container); const onGuardado = jest.fn();
  try {
    await act(async () => root.render(<RegistroSesionTutoria grupo={grupo} alumnos={alumnos} sesion={sesion} onClose={() => {}} onGuardado={onGuardado} />));
    expect(container.querySelector('fieldset').disabled).toBe(true);
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Editar tutoría').click());
    expect(container.querySelector('fieldset').disabled).toBe(false);
    const motivo = [...container.querySelectorAll('label')].find(l => l.textContent.includes('Motivo de la corrección')).querySelector('textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(motivo, 'Corregir descripción');
      motivo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Guardar cambios').click());
    expect(api.put).toHaveBeenCalledWith('/tutoria/sesiones/9', expect.objectContaining({ revision: 1, motivo_cambio: 'Corregir descripción', carga_docente_id: 7 }));
    expect(api.post).not.toHaveBeenCalled();
    expect(onGuardado).toHaveBeenCalled();
  } finally { act(() => root.unmount()); }
});
