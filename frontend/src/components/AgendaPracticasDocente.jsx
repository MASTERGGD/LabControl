import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../hooks/useApi';
import ProgramarPractica from './ProgramarPractica';
import { todayISOInMexico } from '../utils/timezone';
import { getApiErrorMessage } from '../utils/apiError';
export default function AgendaPracticasDocente({ historial=false, periodoId, soloExtra=false }) {
  const navigate=useNavigate();const [items,setItems]=useState([]),[error,setError]=useState(''),[abierto,setAbierto]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{let vigente=true;const cargar=()=>api.get(`/practicas-laboratorio/agenda-docente?historial=${historial}${periodoId?`&periodo_id=${periodoId}`:''}`).then(({data})=>{if(vigente){setItems(Array.isArray(data)?data:[]);setError('');}}).catch(e=>{if(vigente)setError(e.response ? getApiErrorMessage(e,'No se pudo consultar tu agenda de laboratorio.') : 'No se pudo conectar con la agenda de laboratorio. Reintenta la consulta; no se ha confirmado que esté vacía.');});cargar();const timer=setInterval(cargar,60000);return()=>{vigente=false;clearInterval(timer);};},[historial,periodoId,revision]);
  const visibles=items.filter(p=>!soloExtra||p.fuera_horario||p.fecha!==todayISOInMexico()||!p.carga_id);
  return <section className="my-4 rounded-2xl border border-white/10 p-4" aria-label={historial?'Prácticas de mi historial':'Agenda de prácticas'}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-white">{historial?'Actividad de laboratorio y sus sesiones':'Mi agenda de laboratorio'}</h2><button className="btn-blue px-3 py-2 text-sm" onClick={()=>setAbierto(true)}>Solicitar laboratorio</button></div>
    <p className="mt-1 text-xs text-slate-400">Materia, reservación y seguimiento de cada sesión en un mismo lugar.</p>
    {error&&<div role="alert" className="mt-2 text-sm text-amber-400"><p>{error}</p><button className="mt-2 underline" onClick={()=>setRevision(r=>r+1)}>Reintentar agenda</button></div>}
    {!error&&!visibles.length&&<p className="mt-2 text-sm text-slate-400">{historial?'Sin sesiones de práctica registradas.':'Sin otras prácticas programadas.'}</p>}
    <div className="mt-3 max-h-80 space-y-2 overflow-auto">{visibles.map(p=><article key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><div><p className="text-sm font-semibold text-white">{p.proposito==='INDIVIDUAL'?'Investigación / uso individual':p.proposito==='SIN_VINCULACION'?'Sin vinculación académica':p.materia} · {p.titulo}</p><p className="text-xs text-slate-400">{p.fecha} · {p.hora_inicio}–{p.hora_fin} · {p.laboratorio} {p.proposito==='ACADEMICA'?`· Grupo ${p.grupo}`:''}{p.fuera_horario?' · Fuera del horario habitual':''}</p><p className="text-xs text-slate-400">{p.estado==='PREPARADA'&&p.incluye_practica===false?'RESERVADA':p.estado.replaceAll('_',' ')}{p.plan_estado==='PENDIENTE_CONTINUACION'?' · Decide si agregas sesiones o finalizas':''}</p></div><button className="btn-ghost px-3 py-2 text-sm" onClick={()=>navigate(p.practica_url)}>{p.estado==='EN_CURSO'?'Continuar sesión':p.practica_puede_iniciar?'Iniciar sesión':p.estado==='SOLICITADA'?'Ver preparación pendiente':'Ver actividad'}</button></article>)}</div>
    {abierto&&<ProgramarPractica onClose={()=>setAbierto(false)} onGuardado={()=>setRevision(r=>r+1)}/>}
  </section>;
}
