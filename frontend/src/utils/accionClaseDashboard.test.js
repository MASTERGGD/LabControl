import { accionClaseDashboard } from './accionClaseDashboard';
import { abrirClaseDocente } from './abrirClaseDocente';
import { estadoActividad } from '../pages/docente/MiHorarioDocente';

const item = { carga_id: 12, estado: 'PROGRAMADA', hora_inicio: '10:15', hora_fin: '12:00' };
const fecha = '2026-09-03';
const accion = (hora, cambios = {}, dia = fecha) => accionClaseDashboard({ ...item, ...cambios }, dia, new Date(`${fecha}T${hora}-06:00`));

test.each([
  ['09:59:59', 'Ver horario'],
  ['10:00:00', 'Iniciar clase'],
  ['10:15:00', 'Iniciar clase'],
  ['12:15:00', 'Iniciar clase'],
  ['12:15:01', 'Ver horario'],
])('acción a las %s en hora de México: %s', (hora, texto) => {
  expect(accion(hora).texto).toBe(texto);
});
test('no habilita otra fecha ni un día no lectivo', () => {
  expect(accion('10:15:00', {}, '2026-09-04').iniciar).toBeUndefined();
  expect(accion('10:15:00', { calendario: { requiere_asistencia: false } }).path).toBe('/calendario-academico');
  expect(accion('10:15:00', { calendario: { permite_iniciar_clase: false } }).iniciar).toBeUndefined();
});
test('abre el registro de tutoría desde el panel sin intentar iniciar una clase', () => {
  expect(accion('15:00:00', { tipo_actividad: 'TUTORIA', grupo_tutorado_id: 4 })).toEqual({
    texto: 'Registrar tutoría', path: '/docente/mis-tutorados?grupo=4&accion=sesion',
  });
});
test('continúa una clase abierta y consulta una cerrada sin volver a iniciarla', () => {
  expect(accion('13:00:00', { clase_id: 8, estado: 'EN_CURSO' })).toEqual({ texto: 'Continuar clase', path: '/docente/clase/8' });
  expect(accion('10:15:00', { clase_id: 8, estado: 'CERRADA' }).texto).toBe('Ver clase');
  expect(accion('12:10:00', { estado: 'SIN_REGISTRO' }).iniciar).toBe(true);
});
test('una clase no impartida permanece finalizada aunque su horario haya vencido', () => {
  expect(estadoActividad({ clase_estado: 'NO_IMPARTIDA', hora_inicio: '14:00', hora_fin: '16:00' }, 21 * 60)).toBe('FINALIZADA');
});
test('inicia una clase de aula y navega directamente al registro', async () => {
  const api = { post: jest.fn().mockResolvedValue({ data: { id: 8 } }) };
  const navigate = jest.fn();
  await abrirClaseDocente(api, navigate, { ...item, id: 12 });
  expect(api.post).toHaveBeenCalledWith('/docencia/horario/12/iniciar');
  expect(navigate).toHaveBeenCalledWith('/docente/clase/8');
});
test('conserva el inicio de laboratorio y su vínculo con la clase', async () => {
  const api = { post: jest.fn().mockResolvedValueOnce({ data: { id: 8 } }).mockResolvedValueOnce({ data: { id: 9 } }) };
  const navigate = jest.fn();
  await abrirClaseDocente(api, navigate, { ...item, id: 12, laboratorio_id: 3, uso_laboratorio: 'PRACTICA', estado_reserva_laboratorio: 'RESERVADO', reservacion_laboratorio_id: 5 });
  expect(api.post).toHaveBeenLastCalledWith('/sesiones', { laboratorio_id: 3, reservacion_id: 5, fin_estimado_min: 105 });
  expect(navigate).toHaveBeenCalledWith('/docente/sesion/9', { state: { claseDocenteId: 8 } });
});
test('una clase existente de aula no genera otra clase', async () => {
  const api = { post: jest.fn() };
  const navigate = jest.fn();
  await abrirClaseDocente(api, navigate, { ...item, id: 12, clase_id: 8, clase_estado: 'ABIERTA' });
  expect(api.post).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith('/docente/clase/8');
});
test('propaga el rechazo del servidor sin navegar', async () => {
  const api = { post: jest.fn().mockRejectedValue(new Error('Fuera de horario')) };
  const navigate = jest.fn();
  await expect(abrirClaseDocente(api, navigate, { ...item, id: 12 })).rejects.toThrow('Fuera de horario');
  expect(navigate).not.toHaveBeenCalled();
});
