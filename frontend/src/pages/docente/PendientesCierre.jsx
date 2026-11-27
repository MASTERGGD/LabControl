export function reunirPendientesCierre(cargas, capturas) {
  const clave = (cargaId, fecha) => `${cargaId}/${fecha}`;
  const disponibles = new Map(capturas.map(item => [clave(item.carga_id, item.fecha), item]));
  const filas = new Map();
  for (const carga of cargas) {
    const base = {
      materia: carga.materia, grupo: carga.grupo,
      hora_inicio: carga.hora_inicio, hora_fin: carga.hora_fin,
    };
    const sesiones = new Map((carga.resumen.sesiones || []).map(sesion => [sesion.fecha, sesion]));
    const bloqueada = ['CONFIRMADA_DOCENTE', 'CERRADA_ADMINISTRATIVA'].includes(carga.estado);
    const vencidas = new Set(carga.resumen.fechas_captura_vencida || []);
    const fechas = new Set(carga.resumen.fechas_sin_registro || []);
    for (const captura of capturas) {
      if (captura.carga_id === carga.carga_id && !bloqueada) fechas.add(captura.fecha);
    }
    for (const fecha of fechas) {
      const id = clave(carga.carga_id, fecha);
      const captura = bloqueada ? null : disponibles.get(id);
      filas.set(id, {
        ...base, id, fecha, captura, sesion: sesiones.get(fecha),
        estado: captura ? 'Sin registro' : bloqueada ? 'Carga resuelta · sin registro'
          : sesiones.has(fecha) ? 'Registro sin asistencia' : vencidas.has(fecha) ? 'Plazo de captura vencido' : 'Captura no disponible',
      });
    }
    for (const sesion of carga.resumen.sesiones || []) {
      if (!['ABIERTA', 'CORRECCION'].includes(sesion.estado)) continue;
      const id = clave(carga.carga_id, sesion.fecha);
      filas.set(id, {
        ...base, ...sesion, id, sesion,
        estado: sesion.estado === 'CORRECCION' ? 'En corrección' : 'Clase abierta',
      });
    }
  }
  return [...filas.values()].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
}

export default function PendientesCierre({ filas, seleccionarPendiente, abrirClase }) {
  if (!filas.length) return <p className="mt-2 text-sm text-slate-400">Sin sesiones pendientes de revisión.</p>;
  return <section className="mt-4 overflow-hidden rounded-xl border border-amber-500/20">
    <h3 className="px-3 py-2 font-semibold">Mis pendientes <span className="text-sm text-slate-400">({filas.length})</span></h3>
    <ul className="max-h-96 divide-y divide-amber-500/15 overflow-y-auto">
      {filas.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="text-sm">
          <p className="font-semibold">{item.materia}{item.grupo && ` · ${item.grupo}`}</p>
          <p className="text-xs text-slate-400">{new Date(`${item.fecha}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'long' })}
            {item.hora_inicio && ` · ${item.hora_inicio}–${item.hora_fin}`}</p>
          <p className="text-xs text-amber-600">{item.estado}</p>
        </div>
        {item.captura
          ? <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => seleccionarPendiente(item.captura)}>Resolver sesión</button>
          : item.sesion && <button type="button" className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold" onClick={() => abrirClase(item.sesion.id)}>
            {item.sesion.estado === 'ABIERTA' ? 'Continuar clase' : item.sesion.estado === 'CORRECCION' ? 'Revisar corrección' : 'Ver registro'}
          </button>}
      </li>)}
    </ul>
  </section>;
}
