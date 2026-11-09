import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../hooks/useApi';
import { getApiErrorMessage } from '../utils/apiError';

const estados = {
  DISPONIBLE: 'Disponible',
  OCUPADO: 'Ocupado',
  SEMANAL: 'Reserva semanal',
  BLOQUEADO: 'Bloqueado',
  NO_LECTIVO: 'Día no lectivo',
};
const formato = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fechaTexto = fecha => formato.format(new Date(`${fecha}T12:00:00Z`));
const fechaFila = fecha => fechaTexto(fecha).replace(/^./u, letra => letra.toLocaleUpperCase('es-MX'));
const rango = slot => `${slot.hora_inicio} a ${slot.hora_fin}`;
const minutosDelDia = hora => {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
};
function duracion(inicio, fin) {
  const total = minutosDelDia(fin) - minutosDelDia(inicio);
  const horas = Math.floor(total / 60);
  const minutos = total % 60;
  return [
    horas ? `${horas} ${horas === 1 ? 'hora' : 'horas'}` : '',
    minutos ? `${minutos} min` : '',
  ].filter(Boolean).join(' ');
}

function useOcupacion(id, espera = 0, fin = '') {
  const consulta = id ? `${id}${fin ? `?hora_fin=${encodeURIComponent(fin)}` : ''}` : null;
  const [resultado, setResultado] = useState(null);
  useEffect(() => {
    if (!consulta) return;
    let vigente = true;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/practicas-laboratorio/programacion/ocupacion/${consulta}`);
        if (vigente) setResultado({ consulta, data });
      } catch (e) {
        if (vigente) setResultado({ consulta, error: getApiErrorMessage(e, 'No se pudo consultar la ocupación.') });
      }
    }, espera);
    return () => { vigente = false; clearTimeout(timer); };
  }, [consulta, espera]);
  return consulta && resultado?.consulta === consulta ? resultado : null;
}

function Resumen({ resultado, breve = false }) {
  if (!resultado) return <p>Consultando fechas…</p>;
  if (resultado.error) return <p>{resultado.error}</p>;
  const { fechas, reserva_semanal, clase_semanal, fin_periodo } = resultado.data;
  const proxima = fechas.find(f => f.estado === 'DISPONIBLE');
  const mensaje = proxima ? `Próxima fecha libre: ${fechaTexto(proxima.fecha)}` : 'Sin fechas libres para este bloque en el cuatrimestre.';
  const semanal = reserva_semanal && `${clase_semanal ? 'Ocupado por una clase semanal' : 'Reservado semanalmente'} hasta el ${fechaTexto(fin_periodo)}.`;
  if (breve) return <p className="font-semibold">{proxima ? mensaje : semanal || mensaje}</p>;
  return <>
    {semanal && <p>{semanal}</p>}
    <p className="font-semibold">{mensaje}</p>
  </>;
}

export function OcupacionHorarioBoton({ slot, onClick, vistaPrevia = false, children, onMouseEnter, onMouseLeave, ...props }) {
  const id = useId();
  const [ancla, setAncla] = useState(null);
  const resultado = useOcupacion(ancla ? slot.horario_id : null, 300);
  const mostrar = e => {
    if (vistaPrevia) setAncla(e.currentTarget.getBoundingClientRect());
  };
  return <>
    <button {...props} type="button"
      aria-label={`Ver disponibilidad de ${slot.dia_nombre || 'este día'}, ${rango(slot)}`}
      aria-describedby={ancla ? id : undefined}
      onMouseEnter={e => { onMouseEnter?.(e); mostrar(e); }}
      onMouseLeave={e => { onMouseLeave?.(e); setAncla(null); }}
      onFocus={mostrar} onBlur={() => setAncla(null)}
      onKeyDown={e => { if (e.key === 'Escape') setAncla(null); }}
      onClick={e => { setAncla(null); onClick(e); }}>{children}</button>
    {ancla && createPortal(<div id={id} role="tooltip"
      className="pointer-events-none fixed z-[60] w-64 rounded-lg border border-slate-600 bg-slate-900 p-3 text-xs text-white shadow-lg"
      style={{
        left: Math.max(8, Math.min(ancla.left, window.innerWidth - 264)),
        top: ancla.top < 160 ? ancla.bottom : ancla.top,
        transform: ancla.top < 160 ? undefined : 'translateY(-100%)',
      }}>
      <Resumen resultado={resultado} breve/>
    </div>, document.body)}
  </>;
}

export function OcupacionHorarioModal({ slot, slots, onClose, onSolicitar, accionReserva, onGestionar }) {
  const tituloId = useId();
  const [seleccion, setSeleccion] = useState(slot);
  const [finElegido, setFinElegido] = useState('');
  const [intento, setIntento] = useState(0);
  const alternativas = slots.filter(s => s.dia_semana === slot.dia_semana);
  const fines = [seleccion.hora_fin];
  for (let siguiente = alternativas.find(s => s.hora_inicio === fines.at(-1) && s.hora_fin > s.hora_inicio);
    siguiente; siguiente = alternativas.find(s => s.hora_inicio === fines.at(-1) && s.hora_fin > s.hora_inicio)) {
    fines.push(siguiente.hora_fin);
  }
  const fin = fines.includes(finElegido) ? finElegido : seleccion.hora_fin;
  const tramo = { ...seleccion, hora_fin: fin };
  const elegirInicio = id => {
    setSeleccion(alternativas.find(s => String(s.horario_id) === id));
    setFinElegido('');
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby={tituloId} className="glass flex max-h-[90dvh] w-full max-w-xl flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
        <h2 id={tituloId} className="text-lg font-bold">Disponibilidad del laboratorio</h2>
        <button type="button" autoFocus className="rounded border px-3 py-1" onClick={onClose}>Cerrar</button>
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto px-5 pb-4">
        {accionReserva && seleccion.horario_id === slot.horario_id && <button type="button"
          className="rounded border px-3 py-1 text-sm" onClick={onGestionar}>{accionReserva}</button>}
        <div className="grid grid-cols-2 gap-3">
          <label>Hora de inicio
            <select className="input-dark w-full" value={seleccion.horario_id} disabled={alternativas.length <= 1}
              onChange={e => elegirInicio(e.target.value)}>
              {(alternativas.length ? alternativas : [seleccion]).map(s => <option key={s.horario_id} value={s.horario_id}>{s.hora_inicio}</option>)}
            </select>
          </label>
          <label>Hora de fin
            <select className="input-dark w-full" value={fin} disabled={fines.length === 1} onChange={e => setFinElegido(e.target.value)}>
              {fines.map(hora => <option key={hora} value={hora}>{hora}</option>)}
            </select>
          </label>
        </div>
        <p aria-live="polite" className="rounded-xl border border-slate-500/30 p-3 text-sm font-semibold">
          {slot.dia_nombre} · {rango(tramo)} · {duracion(tramo.hora_inicio, fin)} · 1 sesión
        </p>
        <Fechas key={`${seleccion.horario_id}-${fin}-${intento}`} slot={tramo} finExtendido={fin !== seleccion.hora_fin ? fin : ''}
          onReintentar={() => setIntento(i => i + 1)} onSolicitar={onSolicitar}/>
        <p className="text-xs">Al verificar la solicitud, SIGA revisa también el horario del docente y, cuando corresponda, el del grupo.</p>
      </div>
      <footer className="shrink-0 border-t border-slate-500/30 px-5 py-3 text-sm">
        <a href="/docente/horario" className="font-semibold underline">Configurar una clase semanal</a>
      </footer>
    </section>
  </div>;
}

function Fechas({ slot, finExtendido, onReintentar, onSolicitar }) {
  const resultado = useOcupacion(slot.horario_id, 0, finExtendido);
  return <>
    <div role="status"><Resumen resultado={resultado}/></div>
    {resultado?.error && <button type="button" className="rounded border px-3 py-1" onClick={onReintentar}>Reintentar consulta</button>}
    {!!resultado?.data?.fechas.length && <ul className="divide-y divide-slate-500/30">
      {resultado.data.fechas.map(f => <li key={f.fecha} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span>{fechaFila(f.fecha)}</span>
        <span>{estados[f.estado]}</span>
        {f.estado === 'DISPONIBLE' && <button type="button" className="btn-blue px-3 py-1"
          aria-label={`Solicitar para esta fecha: ${fechaTexto(f.fecha)}`}
          onClick={() => onSolicitar({ ...slot, fecha: f.fecha })}>Solicitar para esta fecha</button>}
      </li>)}
    </ul>}
  </>;
}
