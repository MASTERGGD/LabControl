import React, { useEffect, useRef } from 'react';

const DIAS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export default function AccionesTurnoLaboratorio({ turno, onEditar, onBloquear, onClose }) {
  const inicial=useRef(null);
  useEffect(()=>{
    const anterior=document.activeElement;inicial.current?.focus();
    const cerrar=e=>{if(e.key==='Escape')onClose();};
    document.addEventListener('keydown',cerrar);
    return()=>{document.removeEventListener('keydown',cerrar);anterior?.focus?.();};
  },[onClose]);
  return <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-label="Administrar turno de laboratorio" className="rounded-2xl border p-6 w-full max-w-md space-y-4" style={{background:'var(--surface-panel)',borderColor:'var(--surface-border)',color:'var(--text-primary)'}}>
      <h2 className="text-lg font-bold">Administrar turno</h2>
      <p>{DIAS[turno.dia_semana]} · {turno.hora_inicio}–{turno.hora_fin}</p>
      <button ref={inicial} type="button" className="rounded-xl border px-4 py-3 w-full text-left" onClick={onEditar}>Editar horario semanal</button>
      <button type="button" className="rounded-xl bg-emerald-700 text-white px-4 py-3 w-full text-left" onClick={onBloquear}>Bloquear disponibilidad</button>
      <p className="text-sm">El bloqueo requiere elegir fechas y motivo. Las reservas afectadas se revisan antes de guardar.</p>
      <button type="button" className="rounded-xl border px-4 py-2 w-full" onClick={onClose}>Cerrar</button>
    </section>
  </div>;
}
