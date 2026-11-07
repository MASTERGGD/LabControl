import { todayISOInMexico } from './timezone';
export function proponerSesiones(cargas, inicio = todayISOInMexico(), cantidad = 3) {
  const propuestas = [];
  const dia = new Date(`${inicio}T12:00:00`);
  for (let i = 0; i < 125 && propuestas.length < cantidad; i++) {
    const fecha = `${dia.getFullYear()}-${String(dia.getMonth()+1).padStart(2,'0')}-${String(dia.getDate()).padStart(2,'0')}`;
    const semana = (dia.getDay()+6)%7;
    for (const carga of [...cargas].sort((a,b)=>a.hora_inicio.localeCompare(b.hora_inicio))) {
      if (carga.dia_semana === semana && propuestas.length < cantidad) propuestas.push({ fecha, carga_id: carga.id, hora_inicio: carga.hora_inicio, hora_fin: carga.hora_fin, fuera_horario: false });
    }
    dia.setDate(dia.getDate()+1);
  }
  return propuestas;
}

export function puedeIniciarPractica(p, ahora = new Date()) {
  if (p.proposito === 'SIN_VINCULACION') return false;
  if (p.estado !== 'PREPARADA' || p.fecha !== todayISOInMexico(ahora)) return false;
  if (p.reservacion_estado && !['PROGRAMADA','EN_CURSO'].includes(p.reservacion_estado)) return false;
  const inicio = new Date(`${p.fecha}T${p.hora_inicio}:00-06:00`).getTime();
  const fin = new Date(`${p.fecha}T${p.hora_fin}:00-06:00`).getTime();
  return ahora.getTime() >= inicio - 15*60000 && ahora.getTime() <= fin + 15*60000;
}
export function proponerFechasIndividuales(inicio, cantidad, intervalo, hora_inicio, hora_fin) {
  const fecha = new Date(`${inicio}T12:00:00`);
  return Array.from({length:cantidad}, (_, i) => {
    const dia = new Date(fecha); dia.setDate(dia.getDate()+i*intervalo);
    return {fecha:`${dia.getFullYear()}-${String(dia.getMonth()+1).padStart(2,'0')}-${String(dia.getDate()).padStart(2,'0')}`,carga_id:null,fuera_horario:true,hora_inicio,hora_fin};
  });
}
