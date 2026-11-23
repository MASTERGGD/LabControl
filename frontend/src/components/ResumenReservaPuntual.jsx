import React from 'react';

const fechaCorta = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
});

export function ordenarReservasPuntuales(reservas) {
  return [...reservas].sort((a, b) => a.fecha_actividad.localeCompare(b.fecha_actividad));
}

export function datosReservaPuntual(reserva) {
  const nombre = reserva.materia?.trim();
  const grupo = reserva.grupo?.trim();
  const individual = grupo?.toUpperCase() === 'INDIVIDUAL';
  return {
    materia: nombre || (individual ? 'Uso individual' : 'Sesión reservada'),
    detalle: individual ? (nombre ? 'Uso individual' : '') : grupo ? `Grupo ${grupo}` : '',
  };
}

export default function ResumenReservaPuntual({ reservas, isDay, compacto = false }) {
  if (!reservas?.length) return null;
  const [proxima, ...otras] = ordenarReservasPuntuales(reservas);
  const { materia, detalle } = datosReservaPuntual(proxima);
  const fecha = fechaCorta.format(new Date(`${proxima.fecha_actividad}T12:00:00Z`));

  return (
    <span className="mt-1 block min-w-0 leading-tight" style={{
      color: isDay ? '#78350f' : '#fde68a',
      fontSize: compacto ? 10 : 12,
    }}>
      <span className="block font-semibold">Apartado el {fecha}</span>
      <span className={compacto ? 'flex min-w-0 items-baseline gap-1' : 'block break-words'}>
        <span className={compacto ? 'min-w-0 truncate' : undefined} title={materia}>{materia}</span>
        {detalle && <span className="shrink-0"> · {detalle}</span>}
      </span>
      {otras.length > 0 && (
        <span className="block font-semibold">+{otras.length} {otras.length === 1 ? 'apartado más' : 'apartados más'}</span>
      )}
    </span>
  );
}
