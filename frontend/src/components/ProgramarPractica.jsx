import React, { useEffect, useState } from 'react';
import api from '../hooks/useApi';
import { getApiErrorMessage } from '../utils/apiError';
import { todayISOInMexico } from '../utils/timezone';
import { proponerSesiones } from '../utils/programarPractica';
import MaterialesPracticaSelector from './MaterialesPracticaSelector';
const dias = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const campo = 'input-dark w-full';
export default function ProgramarPractica({ origen, onGuardado, onClose }) {
  const [cargas,setCargas]=useState([]), [labs,setLabs]=useState([]);
  const [cargaId,setCargaId]=useState(''), [labId,setLabId]=useState(String(origen?.laboratorio_id || ''));
  const [titulo,setTitulo]=useState(origen?.titulo || ''), [objetivo,setObjetivo]=useState(origen?.objetivo || '');
  const [cantidad,setCantidad]=useState(3), [inicio,setInicio]=useState(todayISOInMexico());
  const [diasElegidos,setDiasElegidos]=useState([]), [sesiones,setSesiones]=useState([]);
  const [materiales,setMateriales]=useState([]), [error,setError]=useState(''), [conflictos,setConflictos]=useState([]);
  const [ocupado,setOcupado]=useState(false), [validado,setValidado]=useState(false), [cargando,setCargando]=useState(true);
  useEffect(()=>{let vigente=true;Promise.all([api.get('/docencia/horario'),api.get('/laboratorios?solo_activos=true')]).then(([c,l])=>{
    if(!vigente)return;const clases=(c.data||[]).filter(x=>x.tipo_actividad==='CLASE'&&x.grupo_academico_id&&x.estado==='ACTIVO');
    setCargas(clases);setLabs((l.data||[]).filter(x=>['QUIMICA','AGROINDUSTRIA'].includes(x.categoria)));
    if(origen){const carga=clases.find(x=>x.id===origen.carga_docente_id);if(carga){setCargaId(String(carga.id));setDiasElegidos([carga.dia_semana]);}}
  }).catch(e=>{if(vigente)setError(getApiErrorMessage(e,'No se pudo cargar tu horario.'));}).finally(()=>{if(vigente)setCargando(false);});return()=>{vigente=false;};},[origen]);
  const carga=cargas.find(c=>String(c.id)===cargaId);
  const mismaMateria=cargas.filter(c=>c.grupo_academico_id===carga?.grupo_academico_id&&c.materia_id===carga?.materia_id&&c.actividad_nombre===carga?.actividad_nombre);
  const cambiar=fn=>{fn();setValidado(false);setConflictos([]);setError('');};
  const editar=(i,cambios)=>cambiar(()=>setSesiones(actual=>actual.map((s,j)=>i===j?{...s,...cambios}:s)));
  const payload=()=>({laboratorio_id:Number(labId),titulo,objetivo,practica_origen_id:origen?.practica_origen_id || origen?.id || null,sesiones,
    materiales:materiales.filter(m=>m.descripcion?.trim()).map(m=>({descripcion:m.descripcion,insumo_id:m.insumo_id?Number(m.insumo_id):null,cantidad_solicitada:Number(m.cantidad_solicitada),unidad:m.unidad||'PIEZA',nota:m.nota||null}))});
  const enviar=async confirmar=>{
    if(!sesiones.length||!cargaId||!labId||titulo.trim().length<2)return setError('Selecciona materia y laboratorio, escribe el título y genera las fechas.');
    setOcupado(true);setError('');setConflictos([]);
    try{const {data}=await api.post(`/practicas-laboratorio/programacion${confirmar?'':'/validar'}`,payload());
      if(confirmar){window.dispatchEvent(new Event('labcontrol:practicas-updated'));onGuardado?.(data);onClose();}
      else{setValidado(data.disponible);setConflictos(data.conflictos||[]);}
    }catch(e){setValidado(false);setError(getApiErrorMessage(e));setConflictos(e.response?.data?.detail?.conflictos||[]);}finally{setOcupado(false);}
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="programar-practica-titulo" className="glass max-h-[92vh] w-full max-w-3xl overflow-auto p-6 text-slate-300">
    <h2 id="programar-practica-titulo" className="text-xl font-bold text-white">{origen?'Agregar sesiones a la práctica':'Programar práctica por sesiones'}</h2>
    <p className="mt-1 text-sm">Una práctica, varias fechas. Cada sesión conserva su asistencia y materiales; las reservaciones se confirman juntas.</p>
    {cargando?<p role="status">Cargando tu horario…</p>:<fieldset disabled={ocupado} className="mt-4 space-y-4">
      {!cargas.length&&<p role="status">Primero registra una materia con grupo en tu horario docente.</p>}
      <label className="block">Materia y grupo<select aria-label="Materia y grupo" className={campo} value={cargaId} onChange={e=>cambiar(()=>{setCargaId(e.target.value);setSesiones([]);const c=cargas.find(x=>String(x.id)===e.target.value);setDiasElegidos(c?[...new Set(cargas.filter(x=>x.grupo_academico_id===c.grupo_academico_id&&x.materia_id===c.materia_id&&x.actividad_nombre===c.actividad_nombre).map(x=>x.dia_semana))]:[]);})}><option value="">Seleccionar materia</option>{cargas.filter((c,i,a)=>a.findIndex(x=>x.grupo_academico_id===c.grupo_academico_id&&x.materia_id===c.materia_id&&x.actividad_nombre===c.actividad_nombre)===i || (origen&&c.id===origen.carga_docente_id)).map(c=><option key={c.id} value={c.id}>{c.actividad_nombre} · {c.grupo} · {c.carrera}</option>)}</select></label>
      <label className="block">Laboratorio<select aria-label="Laboratorio de la práctica" className={campo} disabled={Boolean(origen)} value={labId} onChange={e=>cambiar(()=>{setLabId(e.target.value);setMateriales([]);})}><option value="">Seleccionar laboratorio</option>{labs.map(l=><option key={l.id} value={l.id}>{l.nombre}</option>)}</select></label>
      <label className="block">Nombre de la práctica<input aria-label="Título de la práctica" className={campo} disabled={Boolean(origen)} maxLength={180} value={titulo} onChange={e=>cambiar(()=>setTitulo(e.target.value))}/></label>
      {!origen&&<label className="block">Objetivo<textarea className={campo} value={objetivo} onChange={e=>cambiar(()=>setObjetivo(e.target.value))}/></label>}
      <div className="flex flex-wrap gap-4"><label>Desde<input aria-label="Fecha inicial" className={campo} type="date" min={todayISOInMexico()} value={inicio} onChange={e=>cambiar(()=>setInicio(e.target.value))}/></label><label>Número de sesiones<input aria-label="Número de sesiones" className={campo} type="number" min={1} max={30} value={cantidad} onChange={e=>cambiar(()=>setCantidad(e.target.value))}/></label></div>
      <div><p>Días de la materia que quieres utilizar</p><div className="flex flex-wrap gap-3">{[...new Set(mismaMateria.map(c=>c.dia_semana))].sort().map(d=><label key={d}><input type="checkbox" checked={diasElegidos.includes(d)} onChange={()=>cambiar(()=>setDiasElegidos(a=>a.includes(d)?a.filter(x=>x!==d):[...a,d]))}/> {dias[d]}</label>)}</div></div>
      <button type="button" className="btn-blue px-4 py-2" disabled={!carga||!inicio||!diasElegidos.length||cantidad<1||cantidad>30} onClick={()=>cambiar(()=>setSesiones(proponerSesiones(mismaMateria.filter(c=>diasElegidos.includes(c.dia_semana)),inicio,Number(cantidad))))}>Proponer fechas de mi horario</button>
      {!!sesiones.length&&<div className="space-y-3"><h3 className="font-semibold text-white">Revisa cada fecha antes de reservar</h3>{sesiones.map((s,i)=><div key={i} className="rounded-xl border border-white/15 p-3"><p className="text-sm font-semibold">Sesión {i+1}</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><input aria-label={`Fecha sesión ${i+1}`} className={campo} type="date" min={todayISOInMexico()} value={s.fecha} onChange={e=>editar(i,{fecha:e.target.value})}/><input aria-label={`Inicio sesión ${i+1}`} className={campo} type="time" disabled={!s.fuera_horario} value={s.hora_inicio} onChange={e=>editar(i,{hora_inicio:e.target.value})}/><input aria-label={`Fin sesión ${i+1}`} className={campo} type="time" disabled={!s.fuera_horario} value={s.hora_fin} onChange={e=>editar(i,{hora_fin:e.target.value})}/></div><label className="mt-2 block text-sm"><input type="checkbox" checked={s.fuera_horario} onChange={e=>editar(i,{fuera_horario:e.target.checked})}/> Programar esta sesión fuera de mi horario habitual</label><p className="text-xs text-slate-400">Se comprobarán laboratorio, docente, grupo y calendario. Para cambiar a otro bloque habitual, modifica los días y vuelve a proponer fechas.</p></div>)}</div>}
      {!origen&&<div><p className="font-semibold">Materiales por sesión</p><p className="text-xs">Se solicitarán estas cantidades en cada fecha; el responsable confirmará la entrega de cada sesión.</p><MaterialesPracticaSelector laboratorioId={labId} materiales={materiales} onChange={m=>cambiar(()=>setMateriales(m))}/></div>}
      {!!conflictos.length&&<div role="alert" className="rounded-xl border border-amber-500 p-3">No se confirmó ninguna sesión.{conflictos.map((c,i)=><p key={i}>Sesión {c.sesion} · {c.fecha}: {c.mensaje}</p>)}</div>}
      {validado&&<p role="status" className="text-emerald-400">Las {sesiones.length} sesiones están disponibles. Al confirmar se volverá a revisar la disponibilidad.</p>}
      <div className="flex flex-wrap gap-3"><button className="btn-blue px-4 py-2" type="button" disabled={!sesiones.length||ocupado} onClick={()=>enviar(validado)}>{ocupado?'Comprobando…':validado?`Confirmar ${sesiones.length} sesiones`:'Verificar disponibilidad'}</button><button type="button" className="btn-ghost px-4 py-2" onClick={onClose}>Cancelar</button></div>
    </fieldset>}
    {error&&<p className="mt-3 text-red-400" role="alert">{error}</p>}
  </section></div>;
}
