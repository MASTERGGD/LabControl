import DatosSolicitud from '../../components/DatosSolicitud';
import { useEffect, useRef, useState } from 'react';
import api from '../../hooks/useApi';

const ESTADOS = {
  EN_REVISION: 'En revisión por División',
  ESPERA_DOCENTE: 'Esperando al docente',
  AUTORIZADA: 'Captura autorizada',
  AUTORIZACION_PROGRAMADA: 'Captura programada',
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

const LIMITE = 12;
const normalizar = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');

function Detalle({ caso, cerrar, cierre, recargar }) {
  const dialogo = useRef(null);
  useEffect(() => {
    dialogo.current.showModal();
  }, []);
  const { carga, revision } = caso;
  return <dialog ref={dialogo} onClose={cerrar} aria-labelledby="titulo-solicitud"
    className="m-0 ml-auto h-dvh max-h-none w-full max-w-lg overflow-y-auto border p-5 backdrop:bg-slate-950/60"
    style={{ background: 'var(--main-bg)', color: 'var(--main-text)' }}>
    <header className="flex items-start justify-between gap-3">
      <h2 id="titulo-solicitud" className="text-lg font-bold">Solicitud #{revision.id}</h2>
      <button type="button" className="rounded border px-3 py-1" onClick={() => dialogo.current.close()}>Cerrar</button>
    </header>
    <p className="mt-2 font-semibold">{carga.docente}</p>
    <p>{[carga.materia, carga.grupo, carga.programa_educativo, revision.fecha].filter(Boolean).join(' · ')}</p>
    <p className="my-3 rounded bg-blue-500/10 p-2 text-sm">{ESTADOS[revision.estado]}</p>
    <ol className="space-y-3">
      {revision.historial.map((evento, indice) => <li key={indice} className="rounded border p-2 text-sm">
        <p className="mb-1 text-xs"><strong>{evento.autor}</strong> · {new Date(evento.fecha).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} · {ESTADOS[evento.estado]}</p>
        <DatosSolicitud evento={evento} />
      </li>)}
    </ol>
    {revision.autorizada_desde && <p className="mt-2 text-xs">Inicio de captura desde {new Date(revision.autorizada_desde).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>}
    {revision.autorizada_hasta && <p className="mt-2 text-xs">Inicio de captura hasta {new Date(revision.autorizada_hasta).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>}
    {cierre.estado !== 'CERRADO' && ['EN_REVISION', 'ESPERA_DOCENTE', 'AUTORIZADA', 'AUTORIZACION_VENCIDA'].includes(revision.estado)
      && <Decision cargaId={carga.carga_id} revisionId={revision.id} recargar={recargar} />}
  </dialog>;
}

export default function RevisionesSesion({ cierre, recargar }) {
  const [consulta, setConsulta] = useState('');
  const [estado, setEstado] = useState('EN_REVISION');
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState(null);
  const casos = (cierre?.cargas || []).flatMap(carga => (carga.revisiones_sesion || []).map(revision => ({ carga, revision })));
  const buscado = normalizar(consulta.trim());
  const filtrados = casos.filter(({ carga, revision }) => (!estado || revision.estado === estado)
    && normalizar([carga.docente, carga.materia, carga.grupo, carga.programa_educativo, revision.id].join(' ')).includes(buscado))
    .sort((a, b) => (a.revision.historial[0]?.fecha || a.revision.fecha).localeCompare(b.revision.historial[0]?.fecha || b.revision.fecha));
  const actual = Math.min(pagina, Math.max(0, Math.ceil(filtrados.length / LIMITE) - 1));
  const desde = actual * LIMITE;
  const detalle = casos.find(({ revision }) => revision.id === seleccion);

  return <section className="glass space-y-4 rounded-xl p-4">
    <h2 className="font-semibold">Solicitudes de regularización</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Buscar docente, materia, grupo o referencia
        <input type="search" className="input-dark mt-1 h-11 w-full" value={consulta} onChange={e => { setConsulta(e.target.value); setPagina(0); }} />
      </label>
      <label className="text-sm">Estado de la solicitud
        <select className="input-dark mt-1 h-11 w-full" value={estado} onChange={e => { setEstado(e.target.value); setPagina(0); }}>
          <option value="">Todas</option>
          {Object.entries(ESTADOS).map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
        </select>
      </label>
    </div>
    <p className="text-sm text-slate-500">{filtrados.length} solicitudes con estos filtros</p>
    <ul className="space-y-2">
      {filtrados.slice(desde, desde + LIMITE).map(({ carga, revision }) => <li key={revision.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3">
        <div>
          <p className="font-semibold">#{revision.id} · {carga.docente}</p>
          <p className="text-sm">{[carga.materia, carga.grupo, carga.programa_educativo, revision.fecha].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-blue-600">{ESTADOS[revision.estado]}</p>
        </div>
        <button type="button" className="rounded border px-3 py-2 text-sm font-semibold" onClick={() => setSeleccion(revision.id)}>Ver solicitud</button>
      </li>)}
    </ul>
    {filtrados.length > LIMITE && <div className="flex items-center gap-3 text-sm">
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={!actual} onClick={() => setPagina(actual - 1)}>Anterior</button>
      <span>{desde + 1}–{Math.min(desde + LIMITE, filtrados.length)} de {filtrados.length}</span>
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={desde + LIMITE >= filtrados.length} onClick={() => setPagina(actual + 1)}>Siguiente</button>
    </div>}
    {detalle && <Detalle key={seleccion} caso={detalle} cerrar={() => setSeleccion(null)} cierre={cierre} recargar={recargar} />}
  </section>;
}
