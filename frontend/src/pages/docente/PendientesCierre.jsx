import DatosSolicitud from '../../components/DatosSolicitud';
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
          : sesiones.has(fecha) ? 'Registro sin asistencia' : vencidas.has(fecha) ? 'Pasaron los 7 días para capturar esta sesión' : 'Captura no habilitada · revisa la carga y el calendario',
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
  AUTORIZACION_PROGRAMADA: 'Captura programada',
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
const ESTILO_ACCION = 'min-h-11 rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-success-ui)]';

function RegularizarSesion({ item, solicitarRevision }) {
  const [motivo, setMotivo] = useState('');
  const [peticion, setPeticion] = useState('');
  const [categoria, setCategoria] = useState('');
  const esRespuesta = item.revision?.estado === 'ESPERA_DOCENTE';
  const motivoPrevio = item.revision?.motivo_previo;
  const reutilizaMotivo = item.revision?.estado === 'AUTORIZACION_VENCIDA' && Boolean(motivoPrevio);
  const puedeEnviar = esRespuesta ? motivo.trim().length >= 5
    : Boolean(peticion && (reutilizaMotivo || categoria) && (categoria !== 'OTRO' || motivo.trim()));
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async evento => {
    evento.preventDefault();
    if (!puedeEnviar || enviando) return;
    setEnviando(true);
    setError('');
    try {
      await solicitarRevision(item, esRespuesta ? motivo.trim() : {
        categoria: reutilizaMotivo ? null : categoria, tramite: peticion, observaciones: motivo.trim(),
      });
      setMotivo('');
      setPeticion('');
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
      ? esRespuesta ? 'Responder solicitud' : 'Solicitar revisión a División'
      : 'Ver cómo regularizar'}</summary>
    <div className="space-y-2 px-3 pb-3 text-xs">
      {solicitarRevision ? <form onSubmit={enviar} className="space-y-2">
        {!esRespuesta && <p className="text-slate-500">SIGA incluye la materia, el grupo, la fecha y el horario de esta sesión.</p>}
        {motivoPrevio && <div className="rounded-lg border p-2">
          <p className="font-semibold">Motivo ya registrado</p>
          <p className="whitespace-pre-line">{motivoPrevio}</p>
        </div>}
        {!esRespuesta && !reutilizaMotivo && <label className="block">Motivo reportado
          <select required className="input-dark mt-1 w-full" value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="">Selecciona un motivo</option>
            <option value="IMPARTIDA">Clase impartida sin registro</option>
            <option value="CAMBIO_HORARIO">Cambio de horario</option>
            <option value="NO_IMPARTIDA">Clase no impartida</option>
            <option value="SIN_EVIDENCIA">Sin evidencia suficiente</option>
            <option value="OTRO">Otro motivo</option>
          </select>
        </label>}
        {!esRespuesta && <label className="block">Solicitud
          <select required className="input-dark mt-1 w-full" value={peticion} onChange={e => setPeticion(e.target.value)}>
            <option value="">Selecciona una solicitud</option>
            <option value="AUTORIZAR_CAPTURA">Autorización de captura</option>
            <option value="REVISAR_SESION">Revisión de la sesión</option>
          </select>
        </label>}
        <label className="block">{esRespuesta ? 'Respuesta para División' : categoria === 'OTRO' ? 'Observaciones' : 'Observaciones (opcionales)'}
          <textarea required={esRespuesta || categoria === 'OTRO'} minLength={esRespuesta ? 5 : undefined}
            maxLength={esRespuesta ? 1800 : 900} value={motivo} onChange={e => setMotivo(e.target.value)}
            className="input-dark mt-1 w-full" rows={3}
            placeholder={esRespuesta ? undefined : 'Puedes indicar qué evidencia tienes u otros detalles.'} />
        </label>
        {error && <p role="alert" className="text-red-600">{typeof error === 'string' ? error : 'Revisa la información de la solicitud.'}</p>}
        <button type="submit" disabled={enviando || !puedeEnviar} className="rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">Enviar a División</button>
      </form> : <p>Pasaron los 7 días para capturar esta sesión. Comparte los datos de esta sesión con División de Carrera para que revise cómo procede.</p>}
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
  const enRevision = pendientes.filter(item => item.revision?.estado === 'EN_REVISION').length;
  const ordenadas = [...atendibles, ...filas.filter(item => resuelta(item) || !puedeAtender(item))];
  const totalResueltas = filas.length - pendientes.length;
  const estado = filtro || (atendibles.length ? 'accionables' : 'todas');
  const alDia = pendientes.length === 0 && estado !== 'resueltas';
  const historial = estado === 'resueltas';
  const coincidencias = ordenadas.filter(item => {
    if (estado === 'accionables' && !puedeAtender(item)) return false;
    if (estado === 'vencidas' && ((!item.vencida && item.revision?.estado !== 'AUTORIZACION_VENCIDA') || item.captura || resuelta(item))) return false;
    if (estado === 'en-revision' && !['EN_REVISION', 'ESPERA_DOCENTE', 'AUTORIZADA', 'AUTORIZACION_PROGRAMADA', 'AUTORIZACION_VENCIDA'].includes(item.revision?.estado)) return false;
    if (estado === 'resueltas' && !resuelta(item)) return false;
    if (estado === 'todas' && resuelta(item)) return false;
    return `${item.materia} ${item.grupo || ''} ${item.programa || ''}`.toLocaleLowerCase('es-MX').includes(materia.trim().toLocaleLowerCase('es-MX'));
  });
  const paginaActual = Math.min(pagina, Math.max(0, Math.ceil(coincidencias.length / PAGINA) - 1));
  const desde = paginaActual * PAGINA;
  const visibles = coincidencias.slice(desde, desde + PAGINA);
  const titulo = completa ? <h1 className="text-xl font-bold">{historial ? 'Revisiones resueltas' : 'Mis pendientes'}</h1> : <h2 className="font-semibold">Mis pendientes</h2>;
  const cambiarVista = vista => {
    setFiltro(vista);
    setMateria('');
    setPagina(0);
  };

  return <section className={`mt-4 rounded-2xl ${completa ? '' : 'border border-amber-500/20'}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        {titulo}
        {!alDia && !historial && <p className="text-sm text-slate-500">{pendientes.length} {pendientes.length === 1 ? 'sesión' : 'sesiones'} por atender · {atendibles.length} para resolver ahora{enRevision > 0 && ` · ${enRevision} en revisión por División`}</p>}
      </div>
      {completa
        ? <button type="button" className={`${ESTILO_ACCION} border hover:bg-[var(--surface-panel-soft)]`} onClick={historial ? () => cambiarVista('') : volver}>{historial ? 'Volver a Mis pendientes' : 'Volver a Mi horario'}</button>
        : <button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={verTodos}>Ver pendientes</button>}
    </div>
    {completa && !alDia && <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
      <label className="text-sm">Buscar materia, grupo o programa
        <input type="search" className="input-dark mt-1 h-11 w-full focus:ring-2 focus:ring-emerald-500/30" value={materia} onChange={e => { setMateria(e.target.value); setPagina(0); }} />
      </label>
      {!historial && <label className="text-sm">Estado del pendiente
        <select className="input-dark mt-1 h-11 w-full focus:ring-2 focus:ring-emerald-500/30" value={estado} onChange={e => { setFiltro(e.target.value); setPagina(0); }}>
          <option value="accionables">Puedo resolver ahora</option>
          <option value="vencidas">Plazo vencido</option>
          <option value="en-revision">Solicitudes en seguimiento</option>
          <option value="todas">Todos los pendientes</option>
          <option value="resueltas">Revisiones resueltas</option>
        </select>
      </label>}
    </div>}
    {completa && alDia && <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-5 gap-y-4 rounded-2xl bg-emerald-500/10 p-5 sm:p-7">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-xl font-semibold">✓</span>
      <div className="min-w-0 flex-1 basis-52">
        <h2 className="text-lg font-semibold">Estás al día</h2>
        <p className="mt-1 text-sm">No tienes sesiones por atender en este cuatrimestre.</p>
      </div>
      {totalResueltas > 0 && <button type="button" className={`${ESTILO_ACCION} bg-emerald-500/20 text-[color:var(--text-primary)] hover:bg-emerald-500/30`}
        onClick={() => cambiarVista('resueltas')}>Ver revisiones resueltas ({totalResueltas})</button>}
    </div>}
    {completa && !alDia && !visibles.length && <p className="px-4 pb-3 text-sm text-slate-500">No hay sesiones con estos filtros.</p>}
    {completa && !alDia && <ul className="space-y-3 px-4 pb-4">
      {visibles.map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
        <div className="text-sm">
          <p className="font-semibold">{item.materia}{item.grupo && ` · ${item.grupo}`}</p>
          {item.programa && <p className="text-xs font-normal text-slate-500">{item.programa}</p>}
          <p className="text-xs text-slate-500">{new Date(`${item.fecha}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'long' })}
            {item.hora_inicio && ` · ${item.hora_inicio}–${item.hora_fin}`}</p>
          <p className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${resuelta(item) ? 'bg-emerald-500/15' : item.revision?.estado === 'EN_REVISION' ? 'bg-blue-500/10 text-blue-600' : 'bg-amber-500/10 text-amber-600'}`}>{item.estado}</p>
          {item.revision?.estado === 'AUTORIZACION_PROGRAMADA' && <p className="text-xs">Disponible desde {new Date(item.revision.autorizada_desde).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>}
          {item.captura?.autorizada && <p className="text-xs">Disponible hasta {new Date(item.captura.vence_en).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>}
        </div>
        {item.captura
          ? <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => seleccionarPendiente(item.captura)}>{item.captura.autorizada ? 'Regularizar sesión' : 'Resolver sesión'}</button>
          : item.sesion ? <button type="button" className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold" onClick={() => abrirClase(item.sesion.id)}>
            {item.sesion.estado === 'ABIERTA' ? 'Continuar clase' : item.sesion.estado === 'CORRECCION' ? 'Ir a corregir' : 'Ver registro'}
          </button> : (puedeResponder(item) || (item.vencida && !item.revision)) && <RegularizarSesion item={item}
              solicitarRevision={solicitarRevision} />}
        {item.revision && <details className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto sm:max-w-lg">
          <summary className="cursor-pointer font-semibold">Ver solicitud #{item.revision.id}</summary>
          <ol className="mt-2 space-y-2 border-l pl-3">
            {(item.revision.historial || []).map((evento, indice) => <li key={indice}>
              <p className="text-xs"><strong>{evento.autor}</strong> · {new Date(evento.fecha).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
              <DatosSolicitud evento={evento} />
            </li>)}
          </ol>
        </details>}
      </li>)}
    </ul>}
    {completa && coincidencias.length > PAGINA && <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-sm">
      <span>{desde + 1}–{Math.min(desde + PAGINA, coincidencias.length)} de {coincidencias.length}</span>
      <button type="button" disabled={!paginaActual} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setPagina(paginaActual - 1)}>Anterior</button>
      <button type="button" disabled={desde + PAGINA >= coincidencias.length} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setPagina(paginaActual + 1)}>Siguiente</button>
    </div>}
  </section>;
}
