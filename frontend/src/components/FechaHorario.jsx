import React, { useEffect, useId, useRef } from 'react';
import { DIAS_HORARIO, primeraFechaHorario, validarFechaHorario } from '../utils/fechaHorario';

export default function FechaHorario({ value, onChange, diaSemana, etiqueta = 'Fecha de la sesión', ayuda }) {
  const id = useId();
  const input = useRef(null);
  const error = validarFechaHorario(value, diaSemana);
  useEffect(() => { input.current?.setCustomValidity(error); }, [error]);
  const fechaLegible = value && !error ? new Date(`${value}T12:00:00Z`).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }) : '';
  return <div className="space-y-1 text-sm">
    <label htmlFor={id} className="block">{etiqueta} *</label>
    <input ref={input} id={id} aria-label={etiqueta} required type="date" step="7" min={primeraFechaHorario(diaSemana)} value={value}
      onChange={e => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
      className="input-dark w-full" />
    <p id={`${id}-ayuda`} className="text-xs opacity-80">Selecciona un {DIAS_HORARIO[diaSemana].toLowerCase()}. {ayuda}</p>
    {error ? <p id={`${id}-error`} role="alert" className="text-sm font-semibold" style={{ color: 'var(--color-danger, #dc2626)' }}>{error}</p>
      : fechaLegible && <p className="text-sm capitalize" role="status">{fechaLegible}</p>}
  </div>;
}
