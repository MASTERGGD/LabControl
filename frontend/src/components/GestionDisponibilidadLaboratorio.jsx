import React, { useEffect, useState } from 'react';
import api from '../hooks/useApi';
import { getApiErrorMessage } from '../utils/apiError';
import { todayISOInMexico } from '../utils/timezone';

export default function GestionDisponibilidadLaboratorio({ laboratorioId, onActualizado }) {
  const hoy=todayISOInMexico();
  const [agenda,setAgenda]=useState({practicas:[],bloqueos:[]});
  const [form,setForm]=useState({desde:hoy,hasta:hoy,hora_inicio:'08:00',hora_fin:'09:00',motivo:''});
  const [seleccion,setSeleccion]=useState('');
  const [alcance,setAlcance]=useState('SESION');
  const [motivo,setMotivo]=useState('');
  const [error,setError]=useState('');
  const [mensaje,setMensaje]=useState('');
  const [conflictos,setConflictos]=useState([]);
  const [ocupado,setOcupado]=useState(false);
  const [revision,setRevision]=useState(0);
  const [disponible,setDisponible]=useState(false);
  useEffect(()=>{
    let activo=true;setDisponible(false);setError('');setConflictos([]);setSeleccion('');setAgenda({practicas:[],bloqueos:[]});
    api.get(`/horarios/gestion/agenda?laboratorio_id=${laboratorioId}`,{params:{sin_contexto_periodo:true}})
      .then(({data})=>{if(activo){setAgenda(data);setDisponible(true);}}).catch(e=>{if(activo)setError(getApiErrorMessage(e,'No se pudo consultar la disponibilidad.'));});
    return()=>{activo=false;};
  },[laboratorioId,revision]);
  const actuar=async(fn,exito)=>{
    setOcupado(true);setError('');setMensaje('');setConflictos([]);
    try {await fn();setMensaje(exito);setRevision(x=>x+1);onActualizado?.();}
    catch(e){const detalle=e.response?.data?.detail;if(detalle?.conflictos)setConflictos(detalle.conflictos);setError(getApiErrorMessage(e,detalle?.message||'No se pudo completar la operación.'));}
    finally{setOcupado(false);}
  };
  const elegida=agenda.practicas.find(p=>String(p.id)===seleccion);
  const objetivos=elegida?agenda.practicas.filter(p=>p.id===elegida.id||(alcance==='SIGUIENTES'&&p.raiz===elegida.raiz&&p.fecha>=elegida.fecha)):[];
  const editar=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  return <details className="rounded-xl border p-4 mb-5" style={{background:'var(--surface-panel)',borderColor:'var(--surface-border)'}}>
    <summary className="font-semibold cursor-pointer">Administrar disponibilidad y reservaciones</summary>
    <div className="space-y-5 mt-4">
      <p className="text-sm">Bloquea fechas concretas sin cambiar el horario semanal. Las reservaciones existentes se revisan antes de crear el bloqueo.</p>
      {error&&<p role="alert">{error}</p>}{mensaje&&<p role="status">{mensaje}</p>}{!disponible&&!error&&<p role="status">Consultando disponibilidad…</p>}
      <form aria-label="Bloquear disponibilidad" className="space-y-3" onSubmit={e=>{e.preventDefault();actuar(()=>api.post('/horarios/gestion/bloqueos',{...form,laboratorio_id:Number(laboratorioId)}),'Disponibilidad bloqueada.');}}>
        <h3 className="font-bold">Bloquear disponibilidad</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[['desde','Desde','date'],['hasta','Hasta','date'],['hora_inicio','Hora de inicio','time'],['hora_fin','Hora final','time']].map(([name,label,type])=><label key={name} className="text-sm">{label}<input required className="input-dark w-full" type={type} name={name} value={form[name]} min={type==='date'?hoy:undefined} onChange={editar}/></label>)}</div>
        <label className="block text-sm">Motivo del bloqueo<textarea required minLength={5} maxLength={300} name="motivo" className="input-dark w-full" value={form.motivo} onChange={editar}/></label>
        <p className="text-xs">Las horas se aplican a cada día del rango, en horario de Ciudad de México. Si afecta una reserva, el bloqueo no se guardará.</p>
        <button disabled={ocupado||!disponible} className="rounded-lg bg-emerald-700 text-white px-4 py-2 disabled:opacity-50">{ocupado?'Procesando…':'Revisar y bloquear'}</button>
      </form>
      {conflictos.length>0&&<section aria-label="Actividades afectadas" className="border border-amber-400 rounded-lg p-3 space-y-2 max-h-64 overflow-auto"><h3 className="font-bold">Actividades afectadas: resuélvelas y vuelve a intentar el bloqueo</h3>{conflictos.map((c,i)=><div key={i} className="text-sm border-b pb-2"><p>{c.fecha} {c.hora} · {c.docente} · {c.materia} {c.mensaje}</p>{c.practica_id?<button type="button" className="underline" onClick={()=>setSeleccion(String(c.practica_id))}>Seleccionar esta sesión para revisar su cancelación</button>:c.reservacion_id&&<p>Reservación {c.reservacion_id}{c.recurrente?' semanal: cancelarla completa afecta todas sus fechas. ':'. '}Gestiona su cancelación explícita en Reservaciones.</p>}</div>)}</section>}
      <form aria-label="Cancelar sesiones de laboratorio" className="space-y-3 border-t pt-4" onSubmit={e=>{e.preventDefault();actuar(()=>api.post(`/horarios/gestion/practicas/${seleccion}/cancelar`,{motivo,alcance}),'Sesiones canceladas. El docente recibirá la notificación en SIGA.');}}>
        <h3 className="font-bold">Cancelar una reservación con práctica o actividad</h3>
        <label className="block text-sm">Sesión<select required className="input-dark w-full" value={seleccion} onChange={e=>setSeleccion(e.target.value)}><option value="">Selecciona la sesión</option>{agenda.practicas.map(p=><option key={p.id} value={p.id}>{p.fecha} · {p.hora} · {p.titulo} · {p.docente} · {p.estado}</option>)}</select></label>
        <label className="block text-sm">Fechas a cancelar<select className="input-dark w-full" value={alcance} onChange={e=>setAlcance(e.target.value)}><option value="SESION">Solo esta sesión</option><option value="SIGUIENTES">Esta y las siguientes de la misma actividad</option></select></label>
        {elegida&&<div className="text-sm"><p>Al confirmar se cancelarán estas fechas:</p>{objetivos.map(p=><p key={p.id}>{p.fecha} · {p.hora}–{p.fin} · {p.estado}</p>)}</div>}
        <label className="block text-sm">Motivo de cancelación<textarea required minLength={5} maxLength={300} className="input-dark w-full" value={motivo} onChange={e=>setMotivo(e.target.value)}/></label>
        <p className="text-xs">No se cancelan sesiones iniciadas ni con materiales entregados. Primero registra su devolución y cierre. Una reservación semanal vinculada se conserva para sus otras fechas.</p>
        <button disabled={ocupado||!elegida||motivo.trim().length<5} className="rounded-lg bg-red-700 text-white px-4 py-2 disabled:opacity-50">Confirmar cancelación de las fechas indicadas</button>
      </form>
      <section aria-label="Bloqueos vigentes" className="space-y-2"><h3 className="font-bold">Bloqueos vigentes</h3>{disponible&&!agenda.bloqueos.length&&<p className="text-sm">No hay bloqueos por fecha registrados.</p>}{agenda.bloqueos.map(b=><form key={b.id} className="border rounded-lg p-3 space-y-2" onSubmit={e=>{e.preventDefault();const nota=new FormData(e.currentTarget).get('motivo');actuar(()=>api.post(`/horarios/gestion/bloqueos/${b.id}/habilitar`,{motivo:nota}),'Disponibilidad habilitada. Las cancelaciones no se restauran automáticamente.');}}><p>{b.desde} al {b.hasta} · {b.hora_inicio}–{b.hora_fin} · {b.motivo}</p><label className="block text-sm">Motivo para habilitar<input required minLength={5} maxLength={300} name="motivo" className="input-dark w-full"/></label><button disabled={ocupado} className="underline">Habilitar disponibilidad</button></form>)}</section>
    </div>
  </details>;
}
