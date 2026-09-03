// Flujo compartido por el horario y el inicio docente.
export async function abrirClaseDocente(api, navigate, item) {
  if (item.es_reposicion && item.clase_estado === 'PROGRAMADA') {
    const { data } = await api.post(`/docencia/reposiciones/${item.clase_id}/iniciar`);
    navigate(`/docente/clase/${data.id}`);
    return;
  }
  const clase = item.clase_id
    ? { id: item.clase_id }
    : (await api.post(`/docencia/horario/${item.id}/iniciar`)).data;
  if (item.clase_estado !== 'CERRADA' && item.laboratorio_id && item.uso_laboratorio !== 'SOLO_AULA' && item.estado_reserva_laboratorio === 'RESERVADO' && item.reservacion_laboratorio_id) {
    const [hi, mi] = item.hora_inicio.split(':').map(Number);
    const [hf, mf] = item.hora_fin.split(':').map(Number);
    const { data: sesion } = await api.post('/sesiones', {
      laboratorio_id: item.laboratorio_id,
      reservacion_id: item.reservacion_laboratorio_id,
      fin_estimado_min: Math.max(15, Math.min(300, hf * 60 + mf - hi * 60 - mi)),
    });
    navigate(`/docente/sesion/${sesion.id}`, { state: { claseDocenteId: clase.id } });
    return;
  }
  navigate(`/docente/clase/${clase.id}`);
}
