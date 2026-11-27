import { useState } from 'react';

export function reunirPendientesCierre(cargas, capturas) {
  const clave = (cargaId, fecha) => `${cargaId}/${fecha}`;
  const disponibles = new Map(capturas.map(item => [clave(item.carga_id, item.fecha), item]));
  const filas = new Map();
  for (const carga of cargas) {
    const base = {
      cargaId: carga.carga_id, materia: carga.materia, grupo: carga.grupo, programa: carga.programa_educativo,
      hora_inicio: carga.hora_inicio, hora_fin: carga.hora_fin,
    };
    const sesiones = new Map((carga.resumen.sesiones || []).map(sesion => [sesion.fecha, sesion]));
    const bloqueada = ['CONFIRMADA_DOCENTE', 'CERRADA_ADMINISTRATIVA'].includes(carga.estado);
    const vencidas = new Set(carga.resumen.fechas_captura_vencida || []);
    const fechas = new Set(carga.resumen.fechas_sin_registro || []);
    for (const captura of capturas) {
      if (captura.carga_id === carga.carga_id && !bloqueada) fechas.add(captura.fecha);
    }
    for (const fecha of fechas) {
      const id = clave(carga.carga_id, fecha);
      const captura = bloqueada ? null : disponibles.get(id);
      filas.set(id, {
        ...base, id, fecha, captura, sesion: sesiones.get(fecha), vencida: vencidas.has(fecha),
        estado: captura ? 'Sin registro' : bloqueada ? 'Carga resuelta · sin registro'
          : sesiones.has(fecha) ? 'Registro sin asistencia' : vencidas.has(fecha) ? 'Plazo de captura vencido' : 'Captura no disponible',
      });
    }
    for (const sesion of carga.resumen.sesiones || []) {
      if (!['ABIERTA', 'CORRECCION'].includes(sesion.estado)) continue;
      const id = clave(carga.carga_id, sesion.fecha);
      filas.set(id, {
        ...base, ...sesion, id, sesion,
        estado: sesion.estado === 'CORRECCION' ? 'En corrección' : 'Clase abierta',
      });
    }
    for (const revision of carga.revisiones_sesion || []) {
      const id = clave(carga.carga_id, revision.fecha);
      const fila = filas.get(id);
      filas.set(id, {
        ...base, ...fila, id, fecha: revision.fecha, revision,
        estado: ESTADOS_REVISION[revision.estado] || fila?.estado,
      });
    }
  }
  return [...filas.values()].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
}

const ESTADOS_REVISION = {
  EN_REVISION: 'En revisión por División',
  ESPERA_DOCENTE: 'División solicitó información',
  AUTORIZADA: 'Captura autorizada',
  AUTORIZACION_VENCIDA: 'Autorización vencida',
  CAPTURA_INICIADA: 'Captura iniciada',
  REGULARIZADA: 'Regularizada',
  NO_CORRESPONDIA: 'La sesión no correspondía',
  SIN_EVIDENCIA: 'Revisión concluida sin registro',
};
const resuelta = item => ['REGULARIZADA', 'NO_CORRESPONDIA', 'SIN_EVIDENCIA'].includes(item.revision?.estado);
const puedeResponder = item => ['ESPERA_DOCENTE', 'AUTORIZACION_VENCIDA'].includes(item.revision?.estado);

const puedeAtender = item => Boolean(item.captura || puedeResponder(item) || ['ABIERTA', 'CORRECCION'].includes(item.sesion?.estado));
const PAGINA = 15;
const venceEn = item => Date.parse(item.captura?.vence_en) || Number.MAX_SAFE_INTEGER;

function RegularizarSesion({ item, solicitarRevision }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async evento => {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await solicitarRevision(item, motivo.trim());
      setMotivo('');
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  };
  const [copia, setCopia] = useState('');
  const texto = [
    'Consulta para regularizar una sesión',
    [item.materia, item.grupo, item.programa].filter(Boolean).join(' · '),
    [item.fecha, item.hora_inicio && `${item.hora_inicio}–${item.hora_fin}`].filter(Boolean).join(' · '),
    item.estado,
  ].join('\n');
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopia('copiado');
    } catch {
      setCopia('manual');
    }
  };
  return <details className="w-full rounded-lg border border-amber-500/30 sm:w-auto sm:max-w-md">
    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{solicitarRevision
      ? item.revision?.estado === 'ESPERA_DOCENTE' ? 'Responder solicitud' : 'Solicitar revisión a División'
      : 'Ver cómo regularizar'}</summary>
    <div className="space-y-2 px-3 pb-3 text-xs">
      {solicitarRevision ? <form onSubmit={enviar} className="space-y-2">
        <label className="block">Explica qué ocurrió o responde a División
          <textarea required minLength={5} maxLength={2000} value={motivo} onChange={e => setMotivo(e.target.value)}
            className="input-dark mt-1 w-full" rows={3} />
        </label>
        {error && <p role="alert" className="text-red-600">{typeof error === 'string' ? error : 'Revisa la información de la solicitud.'}</p>}
        <button type="submit" disabled={enviando || motivo.trim().length < 5} className="rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">Enviar a División</button>
      </form> : <p>El plazo de captura terminó. Comparte los datos de esta sesión con División de Carrera para que revise cómo procede.</p>}
      <button type="button" onClick={copiar} className="rounded border px-2 py-1 font-semibold">Copiar datos de la sesión</button>
      {copia === 'copiado' && <p role="status">Datos copiados.</p>}
      {copia === 'manual' && <textarea aria-label="Datos de la sesión para copiar" className="input-dark w-full" rows={4}
        readOnly value={texto} onFocus={e => e.target.select()} />}
    </div>
  </details>;
}

export default function PendientesCierre({ filas, seleccionarPendiente, abrirClase, completa = false, verTodos, volver, solicitarRevision }) {
  const [filtro, setFiltro] = useState('');
  const [materia, setMateria] = useState('');
  const [pagina, setPagina] = useState(0);
  const pendientes = filas.filter(item => !resuelta(item));
  const atendibles = pendientes.filter(puedeAtender).sort((a, b) =>
    venceEn(a) - venceEn(b) || a.fecha.localeCompare(b.fecha));
  const ordenadas = [...atendibles, ...filas.filter(item => !puedeAtender(item))];
  const estado = filtro || (atendibles.length ? 'accionables' : pendientes.length ? 'todas' : 'resueltas');
  const coincidencias = ordenadas.filter(item => {
    if (estado === 'accionables' && !puedeAtender(item)) return false;
    if (estado === 'vencidas' && (!item.vencida || item.captura || resuelta(item))) return false;
    if (estado === 'en-revision' && !['EN_REVISION', 'ESPERA_DOCENTE', 'AUTORIZADA', 'AUTORIZACION_VENCIDA'].includes(item.revision?.estado)) return false;
    if (estado === 'resueltas' && !resuelta(item)) return false;
    if (estado === 'todas' && resuelta(item)) return false;
    return `${item.materia} ${item.grupo || ''} ${item.programa || ''}`.toLocaleLowerCase('es-MX').includes(materia.trim().toLocaleLowerCase('es-MX'));
  });
  const paginaActual = Math.min(pagina, Math.max(0, Math.ceil(coincidencias.length / PAGINA) - 1));
  const desde = paginaActual * PAGINA;
  const visibles = completa ? coincidencias.slice(desde, desde + PAGINA) : pendientes.length <= 3 ? ordenadas.slice(0, 3) : atendibles.slice(0, 3);
  const titulo = completa ? <h1 className="text-xl font-bold">Mis pendientes</h1> : <h2 className="font-semibold">Mis pendientes</h2>;

  return <section className="mt-4 rounded-xl border border-amber-500/20">
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        {titulo}
        <p className="text-sm text-slate-500">{pendientes.length} {pendientes.length === 1 ? 'sesión' : 'sesiones'} por atender · {atendibles.length} para resolver ahora</p>
      </div>
      {completa
        ? <button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={volver}>Volver a Mi horario</button>
        : (pendientes.length > 3 || filas.some(item => item.revision)) && <button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={verTodos}>Ver todos los pendientes</button>}
    </div>
    {completa && <div className="grid gap-3 px-4 pb-3 sm:grid-cols-2">
      <label className="text-sm">Buscar materia, grupo o programa
        <input type="search" className="input-dark mt-1 w-full" value={materia} onChange={e => { setMateria(e.target.value); setPagina(0); }} />
      </label>
      <label className="text-sm">Estado del pendiente
        <select className="input-dark mt-1 w-full" value={estado} onChange={e => { setFiltro(e.target.value); setPagina(0); }}>
          <option value="accionables">Puedo resolver ahora</option>
          <option value="vencidas">Plazo vencido</option>
          <option value="en-revision">Solicitudes en seguimiento</option>
          <option value="todas">Todos los pendientes</option>
          <option value="resueltas">Revisiones resueltas</option>
        </select>
      </label>
    </div>}
    {completa && !visibles.length && <p className="px-4 pb-3 text-sm text-slate-500">No hay sesiones con estos filtros.</p>}
    <ul className="divide-y divide-amber-500/15">
      {visibles.map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
        <div className="text-sm">
          <p className="font-semibold">{item.materia}{item.grupo && ` · ${item.grupo}`}</p>
          {item.programa && <p className="text-xs font-normal text-slate-500">{item.programa}</p>}
          <p className="text-xs text-slate-500">{new Date(`${item.fecha}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'long' })}
            {item.hora_inicio && ` · ${item.hora_inicio}–${item.hora_fin}`}</p>
          <p className="text-xs text-amber-600">{item.estado}</p>
          {item.revision?.historial?.length > 0 && <p className="max-w-xl text-xs text-slate-500">{item.revision.historial.at(-1).motivo}</p>}
          {item.captura?.autorizada && <p className="text-xs">Disponible hasta {new Date(item.captura.vence_en).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>}
        </div>
        {item.captura
          ? <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => seleccionarPendiente(item.captura)}>{item.captura.autorizada ? 'Regularizar sesión' : 'Resolver sesión'}</button>
          : item.sesion ? <button type="button" className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold" onClick={() => abrirClase(item.sesion.id)}>
            {item.sesion.estado === 'ABIERTA' ? 'Continuar clase' : item.sesion.estado === 'CORRECCION' ? 'Ir a corregir' : 'Ver registro'}
          </button> : (puedeResponder(item) || (item.vencida && !item.revision)) && <RegularizarSesion item={item}
              solicitarRevision={solicitarRevision} />}
      </li>)}
    </ul>
    {completa && coincidencias.length > PAGINA && <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-sm">
      <span>{desde + 1}–{Math.min(desde + PAGINA, coincidencias.length)} de {coincidencias.length}</span>
      <button type="button" disabled={!paginaActual} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setPagina(paginaActual - 1)}>Anterior</button>
      <button type="button" disabled={desde + PAGINA >= coincidencias.length} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setPagina(paginaActual + 1)}>Siguiente</button>
    </div>}
  </section>;
}
