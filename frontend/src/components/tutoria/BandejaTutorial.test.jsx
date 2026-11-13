import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BandejaTutorial from './BandejaTutorial';

test('abre todos los reportes del alumno y conserva la acción sobre el reporte elegido', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const onVerReporte = jest.fn();
  const reportes = ['2026-09-01T12:00:00', '2026-09-02T03:00:00', '2026-09-02T07:00:00'].map((creado_en, index) => ({
    id: index + 1, alumno_id: 8, alumno_nombre: 'Alumno de prueba', matricula: 'UTC008', estado: 'RECIBIDO',
    categoria: 'ACADEMICO', titulo: `Reporte ${index + 1}`, creado_en, tutor_destinatario: 'Tutor',
    reportado_por_id: index === 1 ? 21 : 20, reportado_por: index === 1 ? 'Marta López' : 'José Pérez',
  }));
  try {
    act(() => root.render(<BandejaTutorial reportes={reportes} estados={{ RECIBIDO: { label: 'Visto por el tutor' } }} isDay onVerReporte={onVerReporte} />));
    expect(container.querySelectorAll('article')).toHaveLength(1);
    const abrir = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Abrir expediente'));
    act(() => abrir.click());
    expect(abrir.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Reporte 1');
    const acciones = [...container.querySelectorAll('button')].filter(b => b.textContent.includes('Ver detalle y acciones'));
    expect(acciones).toHaveLength(3);
    const buscarDocente = container.querySelector('[aria-label="Buscar docente por nombre"]');
    const selector = container.querySelector('select:has(option[value="20"])');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(buscarDocente, 'jose');
      buscarDocente.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect([...selector.options].map(option => option.textContent)).toEqual(['Todos los docentes', 'José Pérez']);
    act(() => {
      selector.value = '20';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect([...container.querySelectorAll('button')].filter(b => b.textContent.includes('Ver detalle y acciones'))).toHaveLength(2);
    const calendario = container.querySelector('input[type="date"]');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(calendario, '2026-09-02');
      calendario.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const filtradas = [...container.querySelectorAll('button')].filter(b => b.textContent.includes('Ver detalle y acciones'));
    expect(filtradas).toHaveLength(1);
    act(() => filtradas[0].click());
    expect(onVerReporte).toHaveBeenCalledWith(reportes[2]);
    act(() => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Resueltos')).click());
    expect(container.querySelectorAll('article')).toHaveLength(0);
    expect(container.textContent).toContain('No hay casos para esta consulta');
  } finally {
    act(() => root.unmount());
  }
});
