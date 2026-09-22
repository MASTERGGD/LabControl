import { getOfflineOperationTiming } from './OfflineStatus';

test('advierte desde el quinto día y conserva un plazo vencido', () => {
  const inicio = new Date('2026-09-01T10:00:00-06:00');
  const item = { createdAt: inicio.toISOString(), data: {} };
  const quintoDia = new Date('2026-09-06T10:01:00-06:00').getTime();
  const octavoDia = new Date('2026-09-09T10:00:00-06:00').getTime();

  expect(getOfflineOperationTiming(item, quintoDia)).toEqual({ edadDias: 5, venceEn: 2 });
  expect(getOfflineOperationTiming(item, octavoDia).venceEn).toBeLessThanOrEqual(0);
});

test('usa la hora real de captura aunque la cola se haya creado después', () => {
  const item = {
    createdAt: '2026-09-05T10:00:00-06:00',
    data: { capturada_en: '2026-09-01T10:00:00-06:00' },
  };
  const ahora = new Date('2026-09-06T10:00:00-06:00').getTime();
  expect(getOfflineOperationTiming(item, ahora).edadDias).toBe(5);
});
