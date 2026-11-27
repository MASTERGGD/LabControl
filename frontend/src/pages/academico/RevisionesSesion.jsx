import { useState } from 'react';
import api from '../../hooks/useApi';

const ESTADOS = {
  EN_REVISION: 'En revisión por División',
  ESPERA_DOCENTE: 'Esperando al docente',
  AUTORIZADA: 'Captura autorizada',
  AUTORIZACION_VENCIDA: 'Autorización vencida',
  CAPTURA_INICIADA: 'Captura iniciada',
  REGULARIZADA: 'Regularizada',
  NO_CORRESPONDIA: 'No correspondía',
  SIN_EVIDENCIA: 'Cerrada sin registro',
};

function Decision({ cargaId, revisionId, recargar }) {
  const [decision, setDecision] = useState('ESPERA_DOCENTE');
  const [motivo, setMotivo] = useState('');
  const [horas, setHoras] = useState('48');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const guardar = async evento => {
    evento.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await api.post(`/cierre-academico/cargas/${cargaId}/revision-sesion/${revisionId}/decision`, {
        decision, motivo: motivo.trim(), horas: Number(horas),
      });
      await recargar();
      setMotivo('');
    } catch (e) {
      const detalle = e.response?.data?.detail;
      setError(typeof detalle === 'string' ? detalle : 'No se pudo registrar la decisión.');
    } finally {
      setGuardando(false);
    }
  };

  return <form onSubmit={guardar} className="mt-3 space-y-2 text-sm">
    <label className="block">Decisión
      <select className="input-dark mt-1 w-full" value={decision} onChange={e => setDecision(e.target.value)}>
        <option value="ESPERA_DOCENTE">Pedir información</option>
        <option value="AUTORIZADA">Autorizar captura de esta fecha</option>
        <option value="NO_CORRESPONDIA">Resolver como sesión que no correspondía</option>
        <option value="SIN_EVIDENCIA">Concluir revisión conservando el faltante</option>
      </select>
    </label>
    {decision === 'AUTORIZADA' && <label className="block">Horas para iniciar la captura
      <input className="input-dark mt-1 w-full" type="number" min={1} max={168} required value={horas} onChange={e => setHoras(e.target.value)} />
    </label>}
    <label className="block">Motivo o información solicitada
      <textarea className="input-dark mt-1 w-full" rows={2} required minLength={5} maxLength={2000}
        value={motivo} onChange={e => setMotivo(e.target.value)} />
    </label>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <button type="submit" disabled={guardando || motivo.trim().length < 5}
      className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Registrar decisión</button>
  </form>;
}

export default function RevisionesSesion({ cierre, recargar }) {
  const casos = (cierre?.cargas || []).flatMap(carga => (carga.revisiones_sesion || []).map(revision => ({ carga, revision })));
  if (!casos.length) return null;
  casos.sort((a, b) => Number(b.revision.estado === 'EN_REVISION') - Number(a.revision.estado === 'EN_REVISION')
    || a.revision.fecha.localeCompare(b.revision.fecha));

  return <section className="mt-4 space-y-2 rounded-xl border p-3">
    <h3 className="font-semibold">Solicitudes de regularización</h3>
    <p className="text-sm text-slate-500">{casos.filter(({ revision }) => revision.estado === 'EN_REVISION').length} por revisar</p>
    {casos.map(({ carga, revision }) => <details key={revision.id} className="rounded-lg border p-2 text-sm">
      <summary className="cursor-pointer">
        {[carga.docente, carga.materia, carga.grupo, carga.programa_educativo, revision.fecha, ESTADOS[revision.estado]].filter(Boolean).join(' · ')}
      </summary>
      <ul className="mt-2 space-y-1 text-xs">
        {revision.historial.map((evento, indice) => <li key={indice}>
          <strong>{evento.autor}</strong> · {new Date(evento.fecha).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} · {ESTADOS[evento.estado]}
          <p className="whitespace-pre-line">{evento.motivo}</p>
        </li>)}
      </ul>
      {revision.autorizada_hasta && <p className="mt-2 text-xs">Inicio de captura hasta {new Date(revision.autorizada_hasta).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>}
      {cierre.estado !== 'CERRADO' && ['EN_REVISION', 'ESPERA_DOCENTE', 'AUTORIZADA', 'AUTORIZACION_VENCIDA'].includes(revision.estado)
        && <Decision cargaId={carga.carga_id} revisionId={revision.id} recargar={recargar} />}
    </details>)}
  </section>;
}
