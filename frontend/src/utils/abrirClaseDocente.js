// Flujo compartido por el horario y el inicio docente.
export async function abrirClaseDocente(api, navigate, item) {
  if (item.es_reposicion && item.clase_estado === 'PROGRAMADA') {
    const { data } = await api.post(`/docencia/reposiciones/${item.clase_id}/iniciar`);
    navigate(`/docente/clase/${data.id}`);
    return;
  }
  const requiereEquipos = item.laboratorio_id && item.uso_laboratorio !== 'SOLO_AULA';
  const sinReserva = item.estado_reserva_laboratorio !== 'RESERVADO' || !item.reservacion_laboratorio_id;
  const avisoReserva = 'Esta clase requiere equipos. Confirma su reservación de laboratorio antes de iniciar; no se abrirá solo el pase de lista.';
  if (!item.clase_id && requiereEquipos && sinReserva) throw new Error(avisoReserva);
  const clase = item.clase_id
    ? (await api.get(`/docencia/clases/${item.clase_id}`)).data
    : (await api.post(`/docencia/horario/${item.id}/iniciar`)).data;
  if (clase.estado !== 'ABIERTA') {
    navigate(`/docente/clase/${clase.id}`);
    return;
  }
  if (requiereEquipos) {
    if (sinReserva) throw new Error(avisoReserva);
    const [hi, mi] = item.hora_inicio.split(':').map(Number);
    const [hf, mf] = item.hora_fin.split(':').map(Number);
    const { data: sesion } = await api.post('/sesiones', {
      laboratorio_id: item.laboratorio_id,
      clase_docente_id: clase.id,
      reservacion_id: item.reservacion_laboratorio_id,
      fin_estimado_min: Math.max(15, Math.min(300, hf * 60 + mf - hi * 60 - mi)),
    });
    navigate(`/docente/sesion/${sesion.id}`, { state: { claseDocenteId: clase.id } });
    return;
  }
  navigate(`/docente/clase/${clase.id}`);
}
