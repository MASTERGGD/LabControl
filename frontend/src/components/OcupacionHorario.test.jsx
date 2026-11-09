import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import api from '../hooks/useApi';
import { OcupacionHorarioModal } from './OcupacionHorario';

jest.mock('../hooks/useApi', () => ({ get: jest.fn() }));

test('distingue la clase semanal y permite solicitar una fecha libre en otro horario del día', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  const slot = { horario_id: 1, dia_semana: 2, dia_nombre: 'Miércoles', hora_inicio: '13:00', hora_fin: '14:00' };
  const alternativa = { ...slot, horario_id: 2, hora_inicio: '14:00', hora_fin: '15:00' };
  const despuesDeReceso = { ...slot, horario_id: 3, hora_inicio: '15:30', hora_fin: '16:00' };
  const solicitar = jest.fn();
  api.get
    .mockResolvedValueOnce({ data: {
      reserva_semanal: true, clase_semanal: true, fin_periodo: '2026-12-31',
      fechas: [{ fecha: '2026-11-11', estado: 'SEMANAL' }],
    } })
    .mockResolvedValueOnce({ data: {
      reserva_semanal: false, fin_periodo: '2026-12-31',
      fechas: [{ fecha: '2026-11-11', estado: 'OCUPADO' }, { fecha: '2026-11-18', estado: 'DISPONIBLE' }],
    } })
    .mockResolvedValueOnce({ data: {
      reserva_semanal: false, fin_periodo: '2026-12-31',
      fechas: [{ fecha: '2026-11-25', estado: 'DISPONIBLE' }],
    } });
  try {
    await act(async () => root.render(<OcupacionHorarioModal slot={slot} slots={[slot, alternativa, despuesDeReceso]} onSolicitar={solicitar} onClose={() => {}}/>));
    await act(async () => jest.runOnlyPendingTimers());
    expect(host.textContent).toContain('Ocupado por una clase semanal');
    expect(host.textContent).not.toContain('Solicitar para esta fecha');
    expect(host.querySelector('a').getAttribute('href')).toBe('/docente/horario');
    expect(host.querySelector('footer a').textContent).toBe('Configurar una clase semanal');
    expect([...host.querySelector('select').options].map(o => o.textContent)).toEqual(['13:00', '14:00', '15:30']);
    expect(host.textContent).toContain('Miércoles · 13:00 a 14:00 · 1 hora · 1 sesión');
    expect([...host.querySelectorAll('select')[1].options].map(o => o.value)).toEqual(['14:00', '15:00']);
    await act(async () => {
      const select = host.querySelectorAll('select')[1];
      select.value = '15:00';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => jest.runOnlyPendingTimers());
    expect(host.textContent).toContain('Miércoles · 13:00 a 15:00 · 2 horas · 1 sesión');
    expect(api.get).toHaveBeenLastCalledWith('/practicas-laboratorio/programacion/ocupacion/1?hora_fin=15%3A00');
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Solicitar para esta fecha').click());
    expect(solicitar).toHaveBeenCalledWith({ ...slot, hora_fin:'15:00', fecha:'2026-11-18' });
    await act(async () => {
      const select = host.querySelector('select');
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => jest.runOnlyPendingTimers());
    expect(host.textContent).toContain('Próxima fecha libre');
    expect(api.get).toHaveBeenLastCalledWith('/practicas-laboratorio/programacion/ocupacion/2');
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Solicitar para esta fecha').click());
    expect(solicitar).toHaveBeenCalledWith({ ...alternativa, fecha: '2026-11-25' });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    jest.useRealTimers();
  }
});
