import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CalendarioAcademico from './CalendarioAcademico';
import api from '../../hooks/useApi';

jest.mock('../../components/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../../hooks/useApi', () => ({ get: jest.fn() }));
jest.mock('../../context/PeriodoContext', () => ({
  usePeriodo: () => ({ periodo: { id: 1, clave: 'SEP-DIC 2026', puede_administrar: true } }),
}));

test('abre las fechas primero y permite filtrar y desplegar las materias de cada docente', async () => {
  const resumen = { clases_esperadas: 2, asistencias_registradas: 1, fechas_sin_registro: ['2026-11-24'], fechas_no_impartidas: [] };
  const carga = { docente_id: 1, docente: 'Ana de prueba', grupo: '4° A', estado: 'PENDIENTE_REVISION', resumen };
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/calendario-academico'
    ? { estado: 'BORRADOR', puede_editar: true, eventos: [] }
    : { estado: 'ACTIVO', cargas: [
      { ...carga, carga_id: 1, materia: 'Minería de Texto', dia_semana: 1, hora_inicio: '09:00', hora_fin: '10:00' },
      { ...carga, carga_id: 2, materia: 'Bases de Datos', estado: 'CONFIRMADA_DOCENTE' },
    ] } }));
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  const boton = texto => [...host.querySelectorAll('button')].find(b => b.textContent.includes(texto));
  try {
    await act(async () => root.render(<CalendarioAcademico />));
    expect(boton('Publicar calendario')).toBeDefined();
    expect(boton('Ana de prueba')).toBeUndefined();
    await act(async () => boton('Cierre académico').click());
    expect(boton('Publicar calendario')).toBeUndefined();
    expect(boton('Ana de prueba').getAttribute('aria-expanded')).toBe('false');
    await act(async () => boton('Ana de prueba').click());
    expect(host.textContent).toContain('Minería de Texto');
    expect(host.textContent).toContain('Martes 09:00–10:00');
    expect(host.textContent).toContain('Bases de Datos');
    await act(async () => {
      const filtro = host.querySelector('select');
      filtro.value = 'pendientes';
      filtro.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).toContain('Minería de Texto');
    expect(host.textContent).not.toContain('Bases de Datos');
    await act(async () => boton('Calendario de fechas').click());
    expect(boton('Publicar calendario')).toBeDefined();
  } finally {
    act(() => root.unmount());
  }
});
