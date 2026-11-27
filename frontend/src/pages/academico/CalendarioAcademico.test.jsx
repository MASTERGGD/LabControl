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
  const resumen = { clases_abiertas: 0, clases_esperadas: 2, asistencias_registradas: 1, fechas_sin_registro: ['2026-11-24'], fechas_no_impartidas: ['2026-10-15'], detalle_no_impartidas: [{ fecha: '2026-10-15', motivo: 'Reunión de academia', estado_reposicion: 'NO_REQUERIDA' }] };
  const carga = { docente_id: 1, docente: 'Ana de prueba', grupo: '4° A', programa_educativo: 'Ingeniería Industrial', estado: 'PENDIENTE_REVISION', resumen };
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/calendario-academico'
    ? { estado: 'BORRADOR', puede_editar: true, eventos: [] }
    : { estado: 'CONFIRMACION', confirmacion_vigente: true, confirmacion_inicio: '2026-11-25', confirmacion_fin: '2026-11-30', cargas: [
      { ...carga, carga_id: 1, materia: 'Minería de Texto', dia_semana: 1, hora_inicio: '09:00', hora_fin: '10:00' },
      { ...carga, carga_id: 2, materia: 'Bases de Datos', estado: 'CONFIRMADA_DOCENTE' },
      { ...carga, carga_id: 3, materia: 'Minería de Texto', dia_semana: 3, hora_inicio: '12:00', hora_fin: '13:00',
        resumen: { ...resumen, fechas_sin_registro: ['2026-10-22'], detalle_no_impartidas: [] } },
    ] } }));
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  const boton = texto => [...host.querySelectorAll('button')].find(b => b.textContent.includes(texto));
  const textoVisible = boton => boton.lastElementChild.textContent;
  const portapapeles = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  try {
    await act(async () => root.render(<CalendarioAcademico />));
    expect(boton('Publicar calendario')).toBeDefined();
    expect(boton('Ana de prueba')).toBeUndefined();
    await act(async () => boton('Cierre académico').click());
    expect(boton('Publicar calendario')).toBeUndefined();
    expect(boton('Ana de prueba').getAttribute('aria-expanded')).toBe('false');
    await act(async () => boton('Ana de prueba').click());
    expect(host.textContent).toContain('Minería de Texto');
    const materia = [...host.querySelectorAll('summary')].filter(item => item.textContent.includes('Minería de Texto'));
    expect(materia).toHaveLength(1);
    expect(materia[0].textContent).toContain('2 horarios');
    expect(materia[0].textContent).toContain('2 sin registro');
    await act(async () => materia[0].click());
    const meses = [...materia[0].parentElement.querySelectorAll('details')];
    expect(meses.find(item => item.firstElementChild.textContent.includes('noviembre')).open).toBe(true);
    expect(meses.find(item => item.firstElementChild.textContent.includes('octubre')).open).toBe(false);
    const noImpartida = materia[0].parentElement.querySelector('time[datetime="2026-10-15"]').closest('li');
    expect(noImpartida.textContent).toContain('09:00–10:00');
    expect(noImpartida.textContent).toContain('No impartida');
    expect(noImpartida.textContent).toContain('Sin reposición');
    expect(materia[0].textContent).toContain('Ingeniería Industrial');
    const copiarMateria = host.querySelector('button[aria-label^="Copiar materia: Minería de Texto"]');
    await act(async () => copiarMateria.click());
    const texto = host.querySelector('textarea[aria-label="Resumen para copiar"]').value;
    expect(texto).toContain('Minería de Texto · 4.º A · Ingeniería Industrial');
    expect(texto).not.toContain('Bases de Datos');
    expect(textoVisible(copiarMateria)).toBe('Copiar materia');
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    jest.useFakeTimers();
    await act(async () => copiarMateria.click());
    expect(writeText).toHaveBeenCalledWith(texto);
    expect(textoVisible(copiarMateria)).toBe('✓ Copiado');
    expect(textoVisible(host.querySelector('button[aria-label^="Copiar materia: Bases de Datos"]'))).toBe('Copiar materia');
    await act(async () => jest.advanceTimersByTime(2000));
    expect(textoVisible(copiarMateria)).toBe('Copiar materia');
    const copiarDocente = host.querySelector('button[aria-label="Copiar resumen para el docente"]');
    await act(async () => copiarDocente.click());
    expect(textoVisible(copiarDocente)).toBe('✓ Copiado');
    expect(textoVisible(copiarMateria)).toBe('Copiar materia');
    await act(async () => jest.advanceTimersByTime(2000));
    expect(textoVisible(copiarDocente)).toBe('Copiar resumen para el docente');
    expect(host.textContent).toContain('Reunión de academia');
    expect(host.textContent).toContain('Por confirmar por el docente');
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
    await act(async () => boton('Regularización').click());
    expect(host.textContent).toContain('Solicitudes de regularización');
    expect(host.textContent).not.toContain('Ordenar docentes');
  } finally {
    act(() => root.unmount());
    jest.useRealTimers();
    if (portapapeles) Object.defineProperty(navigator, 'clipboard', portapapeles);
    else delete navigator.clipboard;
  }
});
