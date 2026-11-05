import { abrirClaseDocente } from './abrirClaseDocente';

const item = { id: 1, laboratorio_id: 2, uso_laboratorio: 'EQUIPOS', estado_reserva_laboratorio: 'RESERVADO', reservacion_laboratorio_id: 3, hora_inicio: '13:00', hora_fin: '14:00' };
let api, navigate;
beforeEach(() => { api = { get: jest.fn(), post: jest.fn() }; navigate = jest.fn(); });

test('inicia laboratorio vinculado antes de mostrar el pase de lista', async () => {
  api.post.mockResolvedValueOnce({ data: { id: 7, estado: 'ABIERTA' } }).mockResolvedValueOnce({ data: { id: 9 } });
  await abrirClaseDocente(api, navigate, item);
  expect(api.post).toHaveBeenNthCalledWith(2, '/sesiones', expect.objectContaining({ clase_docente_id: 7, reservacion_id: 3 }));
  expect(navigate).toHaveBeenCalledWith('/docente/sesion/9', expect.anything());
});

test('consulta el estado real y no abre laboratorio con una clase cerrada', async () => {
  api.get.mockResolvedValue({ data: { id: 7, estado: 'CERRADA' } });
  await abrirClaseDocente(api, navigate, { ...item, clase_id: 7, clase_estado: 'ABIERTA' });
  expect(api.post).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith('/docente/clase/7');
});

test('no omite recepción cuando falta una reservación para equipos', async () => {
  api.post.mockResolvedValue({ data: { id: 7, estado: 'ABIERTA' } });
  await expect(abrirClaseDocente(api, navigate, { ...item, reservacion_laboratorio_id: null })).rejects.toThrow('Confirma su reservación');
  expect(navigate).not.toHaveBeenCalled();
});

test('solo aula conserva asistencia sin operación de equipos', async () => {
  api.post.mockResolvedValue({ data: { id: 7, estado: 'ABIERTA' } });
  await abrirClaseDocente(api, navigate, { ...item, uso_laboratorio: 'SOLO_AULA' });
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('/docente/clase/7');
});
