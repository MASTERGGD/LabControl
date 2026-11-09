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
  const solicitar = jest.fn();
  api.get
    .mockResolvedValueOnce({ data: {
      reserva_semanal: true, clase_semanal: true, fin_periodo: '2026-12-31',
      fechas: [{ fecha: '2026-11-11', estado: 'SEMANAL' }],
    } })
    .mockResolvedValueOnce({ data: {
      reserva_semanal: false, fin_periodo: '2026-12-31',
      fechas: [{ fecha: '2026-11-11', estado: 'OCUPADO' }, { fecha: '2026-11-18', estado: 'DISPONIBLE' }],
    } });
  try {
    await act(async () => root.render(<OcupacionHorarioModal slot={slot} slots={[slot, alternativa]} onSolicitar={solicitar} onClose={() => {}}/>));
    await act(async () => jest.runOnlyPendingTimers());
    expect(host.textContent).toContain('Ocupado por una clase semanal');
    expect(host.textContent).not.toContain('Solicitar este horario');
    await act(async () => {
      const select = host.querySelector('select');
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => jest.runOnlyPendingTimers());
    expect(host.textContent).toContain('Próxima fecha libre del laboratorio');
    expect(api.get).toHaveBeenLastCalledWith('/practicas-laboratorio/programacion/ocupacion/2');
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Solicitar este horario').click());
    expect(solicitar).toHaveBeenCalledWith({ ...alternativa, fecha: '2026-11-18' });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    jest.useRealTimers();
  }
});
