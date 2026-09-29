import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BandejaTutorial from './BandejaTutorial';

test('abre todos los reportes del alumno y conserva la acción sobre el reporte elegido', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const onVerReporte = jest.fn();
  const reportes = [1, 2].map(id => ({ id, alumno_id: 8, alumno_nombre: 'Alumno de prueba', matricula: 'UTC008', estado: 'RECIBIDO', categoria: 'ACADEMICO', titulo: `Reporte ${id}`, creado_en: '2026-09-01T12:00:00', tutor_destinatario: 'Tutor' }));
  try {
    act(() => root.render(<BandejaTutorial reportes={reportes} estados={{ RECIBIDO: { label: 'Visto por el tutor' } }} isDay onVerReporte={onVerReporte} />));
    expect(container.querySelectorAll('article')).toHaveLength(1);
    const abrir = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Abrir expediente'));
    act(() => abrir.click());
    expect(abrir.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Línea de tiempo');
    const acciones = [...container.querySelectorAll('button')].filter(b => b.textContent.includes('Ver detalle y acciones'));
    expect(acciones).toHaveLength(2);
    act(() => acciones[1].click());
    expect(onVerReporte).toHaveBeenCalledWith(reportes[1]);
    act(() => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Resueltos')).click());
    expect(container.querySelectorAll('article')).toHaveLength(0);
    expect(container.textContent).toContain('No hay casos para esta consulta');
  } finally {
    act(() => root.unmount());
  }
});
