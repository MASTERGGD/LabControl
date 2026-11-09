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
const rango = slot => `${slot.hora_inicio} a ${slot.hora_fin}`;

function useOcupacion(id, espera = 0) {
  const [resultado, setResultado] = useState(null);
  useEffect(() => {
    if (!id) return;
    let vigente = true;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/practicas-laboratorio/programacion/ocupacion/${id}`);
        if (vigente) setResultado({ id, data });
      } catch (e) {
        if (vigente) setResultado({ id, error: getApiErrorMessage(e, 'No se pudo consultar la ocupación.') });
      }
    }, espera);
    return () => { vigente = false; clearTimeout(timer); };
  }, [id, espera]);
  return id && resultado?.id === id ? resultado : null;
}

function Resumen({ resultado }) {
  if (!resultado) return <p>Consultando fechas…</p>;
  if (resultado.error) return <p>{resultado.error}</p>;
  const { fechas, reserva_semanal, clase_semanal, fin_periodo } = resultado.data;
  const proxima = fechas.find(f => f.estado === 'DISPONIBLE');
  return <>
    {reserva_semanal && <p>{clase_semanal ? 'Ocupado por una clase semanal' : 'Reservado semanalmente'} hasta el {fechaTexto(fin_periodo)}.</p>}
    <p className="font-semibold">{proxima ? `Próxima fecha libre del laboratorio: ${fechaTexto(proxima.fecha)}` : 'Sin fechas libres para este bloque en el cuatrimestre.'}</p>
  </>;
}

export function OcupacionHorarioBoton({ slot, onClick, vistaPrevia = false }) {
  const id = useId();
  const [ancla, setAncla] = useState(null);
  const resultado = useOcupacion(ancla ? slot.horario_id : null, 300);
  const mostrar = e => {
    if (vistaPrevia) setAncla(e.currentTarget.getBoundingClientRect());
  };
  return <>
    <button type="button" className="rounded px-2 py-1 text-xs font-semibold underline focus-visible:ring-2"
      aria-label={`Ver fechas de ${slot.dia_nombre || 'este día'}, ${rango(slot)}`}
      aria-describedby={ancla ? id : undefined}
      onMouseEnter={mostrar} onMouseLeave={() => setAncla(null)}
      onFocus={mostrar} onBlur={() => setAncla(null)}
      onKeyDown={e => { if (e.key === 'Escape') setAncla(null); }}
      onClick={() => { setAncla(null); onClick(slot); }}>Ver fechas</button>
    {ancla && createPortal(<div id={id} role="tooltip"
      className="pointer-events-none fixed z-[60] w-64 rounded-lg border border-slate-600 bg-slate-900 p-3 text-xs text-white shadow-lg"
      style={{
        left: Math.max(8, Math.min(ancla.left, window.innerWidth - 264)),
        top: ancla.top < 160 ? ancla.bottom : ancla.top,
        transform: ancla.top < 160 ? undefined : 'translateY(-100%)',
      }}>
      <Resumen resultado={resultado}/>
      {resultado?.data?.fechas.slice(0, 3).map(f => <p key={f.fecha}>{fechaTexto(f.fecha)} · {estados[f.estado]}</p>)}
    </div>, document.body)}
  </>;
}

export function OcupacionHorarioModal({ slot, slots, onClose, onSolicitar }) {
  const tituloId = useId();
  const [seleccion, setSeleccion] = useState(slot);
  const [intento, setIntento] = useState(0);
  const alternativas = slots.filter(s => s.dia_semana === slot.dia_semana);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby={tituloId} className="glass max-h-[90vh] w-full max-w-xl space-y-4 overflow-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 id={tituloId} className="text-lg font-bold">Ocupación de este horario</h2>
        <button type="button" autoFocus className="rounded border px-3 py-1" onClick={onClose}>Cerrar</button>
      </div>
      <p>{slot.dia_nombre} · {rango(seleccion)}</p>
      {alternativas.length > 1 && <label className="block">Ver otros horarios del mismo día
        <select className="input-dark w-full" value={seleccion.horario_id}
          onChange={e => setSeleccion(alternativas.find(s => String(s.horario_id) === e.target.value))}>
          {alternativas.map(s => <option key={s.horario_id} value={s.horario_id}>{rango(s)}</option>)}
        </select>
      </label>}
      <Fechas key={`${seleccion.horario_id}-${intento}`} slot={seleccion} onReintentar={() => setIntento(i => i + 1)} onSolicitar={onSolicitar}/>
      <p className="text-xs">Al verificar la solicitud, SIGA revisa también el horario del docente y, cuando corresponda, el del grupo.</p>
    </section>
  </div>;
}

function Fechas({ slot, onReintentar, onSolicitar }) {
  const resultado = useOcupacion(slot.horario_id);
  return <>
    <div role="status"><Resumen resultado={resultado}/></div>
    {resultado?.error && <button type="button" className="rounded border px-3 py-1" onClick={onReintentar}>Reintentar consulta</button>}
    {!!resultado?.data?.fechas.length && <ul className="divide-y divide-slate-500/30">
      {resultado.data.fechas.map(f => <li key={f.fecha} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span className="capitalize">{fechaTexto(f.fecha)}</span>
        <span>{estados[f.estado]}</span>
        {f.estado === 'DISPONIBLE' && <button type="button" className="btn-blue px-3 py-1"
          aria-label={`Solicitar este horario el ${fechaTexto(f.fecha)}`}
          onClick={() => onSolicitar({ ...slot, fecha: f.fecha })}>Solicitar este horario</button>}
      </li>)}
    </ul>}
  </>;
}
