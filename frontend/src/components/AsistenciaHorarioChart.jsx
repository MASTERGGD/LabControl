import { useState } from 'react';

export default function AsistenciaHorarioChart({ serie }) {
  const puntos = serie?.puntos || [];
  const [seleccion, setSeleccion] = useState(null);
  const elegido = puntos.find(p => p.hora === seleccion) || puntos[puntos.length - 1];
  const conocidos = puntos.filter(p => p.asistentes !== null);
  const maximo = Math.max(1, ...conocidos.map(p => p.asistentes));
  const base = 10 ** Math.floor(Math.log10(maximo / 4));
  const techo = Math.max(1, Math.ceil(maximo / 4 / base) * base) * 4;
  const minuto = hora => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
  const primero = puntos.length ? minuto(puntos[0].hora) : 0;
  const rango = puntos.length ? Math.max(30, minuto(puntos[puntos.length - 1].hora) - primero) : 30;
  const x = p => 60 + (minuto(p.hora) - primero) / rango * 800;
  const y = p => 230 - p.asistentes / techo * 180;
  let trazo = '';
  let conectado = false;
  puntos.forEach(p => {
    if (p.asistentes === null) { conectado = false; return; }
    trazo += `${conectado ? 'L' : 'M'}${x(p)},${y(p)} `;
    conectado = true;
  });
  const descripcion = p => `${p.hora}: ${p.asistentes === null ? 'Sin dato' : `${p.asistentes} alumnos`}, ${p.grupos_pendientes} grupos con lista pendiente`;

  return <section className="attendance-chart rounded-xl border border-white/10 p-4" aria-labelledby="asistencia-horario-titulo">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 id="asistencia-horario-titulo" className="font-semibold text-white">Asistencia por horario</h2>
        <p className="mt-1 text-sm text-slate-400">Cada 30 minutos · Hora de México · Según listas disponibles al corte</p></div>
      {conocidos.length > 0 && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-600">Mayor asistencia en un mismo horario: {Math.max(...conocidos.map(p => p.asistentes))} alumnos</p>}
    </div>

    {!puntos.length ? <p className="py-8 text-center text-sm text-slate-400">Aún no hay horarios iniciados para mostrar en este corte.</p> : <>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox="0 0 900 285" className="w-full min-w-[600px] text-slate-400" aria-label="Gráfica de alumnos con asistencia por horario">
          <text x="60" y="22" fill="currentColor" fontSize="12">Alumnos</text>
          {[0, 1, 2, 3, 4].map(i => <g key={i}>
            <line x1="60" x2="860" y1={230 - i * 45} y2={230 - i * 45} stroke="currentColor" strokeOpacity="0.18" />
            <text x="48" y={234 - i * 45} textAnchor="end" fill="currentColor" fontSize="12">{techo * i / 4}</text>
          </g>)}
          <path d={trazo} fill="none" stroke="#059669" strokeWidth="3" strokeLinejoin="round" />
          {puntos.map((p, index) => <g key={p.hora}>
            {(index % Math.max(1, Math.ceil(puntos.length / 10)) === 0) && <text x={x(p)} y="258" textAnchor="middle" fill="currentColor" fontSize="12">{p.hora}</text>}
            <g role="button" tabIndex="0" aria-label={descripcion(p)} aria-pressed={elegido?.hora === p.hora}
              onClick={() => setSeleccion(p.hora)} onFocus={() => setSeleccion(p.hora)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSeleccion(p.hora); } }} style={{ cursor: 'pointer' }}>
              <title>{descripcion(p)}</title>
              <circle cx={x(p)} cy={p.asistentes === null ? 230 : y(p)} r="14" fill="transparent" />
              <circle cx={x(p)} cy={p.asistentes === null ? 230 : y(p)} r={elegido?.hora === p.hora ? 7 : 5}
                fill={p.asistentes === null ? '#94a3b8' : p.listas_pendientes ? '#d97706' : '#059669'} stroke="white" strokeWidth="2" />
            </g>
          </g>)}
          <text x="860" y="280" textAnchor="end" fill="currentColor" fontSize="11">Horario de clase</text>
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><span><span style={{ color: '#059669' }}>●</span> Verde: sin listas pendientes</span><span><span style={{ color: '#d97706' }}>●</span> Ámbar: datos parciales</span><span><span style={{ color: '#94a3b8' }}>●</span> Gris: sin dato</span></div>
      <div className="mt-3 rounded-xl border border-white/10 p-3 text-sm text-slate-200" aria-live="polite">
        <b>{elegido.hora} · {elegido.asistentes === null ? 'Sin dato de asistencia' : `${elegido.asistentes} alumnos con asistencia registrada`}</b>
        <p className="mt-1 text-slate-400">{elegido.listas_confirmadas} listas confirmadas · {elegido.listas_pendientes} listas pendientes en {elegido.grupos_pendientes} grupos.</p>
        {elegido.listas_confirmadas === 0 && elegido.listas_pendientes === 0 && <p className="mt-1 text-slate-400">Sin clases previstas en este horario.</p>}
        {elegido.listas_pendientes > 0 && <p className="mt-1 text-amber-600">La falta de captura puede reducir el total mostrado; no significa que los alumnos faltaron.</p>}
      </div>
      <p className="mt-2 text-xs text-slate-400">Toca un punto para consultar su detalle. Las franjas sin dato interrumpen la línea.</p>
    </>}
    <details className="attendance-disclosure mt-3 text-xs text-slate-400"><summary className="cursor-pointer font-semibold">Cómo leer la gráfica</summary>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">El total del día cuenta a cada alumno una sola vez, aunque asista en distintos horarios. Cada punto cuenta solo a los alumnos con asistencia confirmada en clases de ese horario; por eso el máximo puede ser menor que el total diario. La diferencia no representa alumnos faltantes.</p>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{serie?.criterio || 'Alumnos únicos en clases de cada horario. No representa entradas, salidas ni permanencia física en el plantel.'}</p>
    </details>
  </section>;
}
