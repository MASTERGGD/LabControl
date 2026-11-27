export default function DatosSolicitud({ evento }) {
  if (!evento) return null;
  if (!evento.solicitud) return <p className="whitespace-pre-line">{evento.motivo}</p>;
  const { motivo, peticion, observaciones } = evento.solicitud;
  return <dl className="mt-1 grid gap-1 text-sm">
    <div><dt className="font-semibold">Motivo reportado</dt><dd>{motivo}</dd></div>
    <div><dt className="font-semibold">Solicitud</dt><dd>{peticion}</dd></div>
    {observaciones && <div><dt className="font-semibold">Observaciones</dt><dd className="whitespace-pre-line">{observaciones}</dd></div>}
  </dl>;
}
