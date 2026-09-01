import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { usePeriodo } from '../../context/PeriodoContext';

const TIPOS = [
  ['RECESO_CLASES', 'Receso de clases', '#e11d48', false, 'Pausa', '⏸'],
  ['SUSPENSION_DOCENTE', 'Suspensión docente', '#be123c', false, 'Suspensión', '!'],
  ['SUSPENSION_GENERAL', 'Suspensión general', '#b91c1c', false, 'Suspensión', '!'],
  ['REPOSICION', 'Reposición autorizada', '#059669', true, 'Hito académico', '↻'],
  ['EVALUACION', 'Evaluaciones', '#d97706', true, 'Evaluación', '✎'],
  ['ACTIVIDAD_INSTITUCIONAL', 'Actividad institucional', '#2563eb', true, 'Institucional', '◆'],
  ['INSCRIPCIONES', 'Inscripciones o reinscripciones', '#7c3aed', true, 'Administrativo', '▣'],
  ['INICIO_CUATRIMESTRE', 'Inicio de cuatrimestre', '#059669', true, 'Hito académico', '▶'],
  ['FIN_CUATRIMESTRE', 'Fin de cuatrimestre', '#047857', true, 'Hito académico', '■'],
  ['FIN_ACTIVIDADES_ACADEMICAS', 'Fin de actividades académicas', '#0f766e', true, 'Hito académico', '✓'],
  ['OTRO', 'Otra actividad', '#64748b', true, 'Otro', '•'],
];
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t[0], t]));
const VACIO = {
  titulo: '', tipo: 'RECESO_CLASES', fecha_inicio: '', fecha_fin: '', descripcion: '',
  color: '#e11d48', requiere_asistencia: false, permite_iniciar_clase: false,
  genera_alertas: false, motivo_cambio: '',
};
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function isoLocal(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function CalendarGrid({ cursor, eventos, onDay, onEvent }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstMondayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstMondayIndex).fill(null).concat(Array.from({ length: days }, (_, i) => i + 1));
  while (cells.length % 7) cells.push(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl shadow-black/10">
      <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.04] text-center text-xs font-semibold uppercase text-slate-400">
        {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => <div key={d} className="py-3">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`blank-${idx}`} className="min-h-32 border-b border-r border-white/5 bg-black/20" />;
          const iso = isoLocal(year, month, day);
          const delDia = eventos.filter(e => e.fecha_inicio <= iso && e.fecha_fin >= iso);
          const today = new Date();
          const esHoy = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          return (
            <button type="button" key={iso} onClick={() => onDay(iso)} className={`min-h-32 border-b border-r border-white/5 p-2 text-left transition hover:bg-white/[0.05] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${idx % 7 > 4 ? 'bg-white/[0.015]' : ''}`} aria-label={`${day} de ${MESES[month]}`}>
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${esHoy ? 'bg-blue-600 font-bold text-white' : 'text-slate-400'}`}>{day}</span>
              <div className="mt-1 space-y-1">
                {delDia.slice(0, 3).map(e => {
                  const spec = TIPO_MAP[e.tipo] || TIPO_MAP.OTRO;
                  const inicia = e.fecha_inicio === iso;
                  const termina = e.fecha_fin === iso;
                  return (
                  <span key={e.id} onClick={ev => { ev.stopPropagation(); onEvent(e); }} className={`flex min-h-6 items-center gap-1 truncate border-l-2 bg-white/[0.07] px-1.5 py-1 text-[10px] font-semibold text-slate-100 hover:bg-white/[0.12] ${inicia ? 'rounded-l-md' : '-ml-2'} ${termina ? 'rounded-r-md' : '-mr-2'}`} style={{ borderLeftColor: e.color || spec[2] }} title={e.titulo}><i className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] not-italic text-white" style={{ backgroundColor: e.color || spec[2] }}>{spec[5]}</i><span className="truncate">{e.titulo}</span></span>
                  );
                })}
                {delDia.length > 3 && <span className="text-[10px] text-slate-500">+{delDia.length - 3} más</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ eventos, onEvent }) {
  if (!eventos.length) return <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">No hay actividades para mostrar con estos filtros.</div>;
  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
    {eventos.map(e => {
      const spec = TIPO_MAP[e.tipo] || TIPO_MAP.OTRO;
      const inicio = new Date(`${e.fecha_inicio}T12:00:00`);
      return <button key={e.id} type="button" onClick={() => onEvent(e)} className="flex w-full items-center gap-4 border-b border-white/5 p-4 text-left transition last:border-0 hover:bg-white/[0.04]">
        <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-white/[0.05] py-2"><b className="text-lg text-white">{inicio.getDate()}</b><span className="text-[10px] font-bold uppercase text-slate-500">{MESES[inicio.getMonth()].slice(0, 3)}</span></span>
        <i className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: e.color || spec[2] }} />
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white">{e.titulo}</span><span className="mt-1 block text-xs text-slate-400">{spec[4]}{e.fecha_fin !== e.fecha_inicio ? ` · Hasta el ${new Date(`${e.fecha_fin}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : ''}</span></span>
        <span className="text-slate-500">›</span>
      </button>;
    })}
  </div>;
}

export default function CalendarioAcademico() {
  const { periodo, actualizarPeriodo } = usePeriodo();
  const periodoId = periodo?.id ? String(periodo.id) : '';
  const [calendario, setCalendario] = useState(null);
  const [cierre, setCierre] = useState(null);
  const [cursor, setCursor] = useState(new Date());
  const [modal, setModal] = useState(null);
  const [accion, setAccion] = useState(null);
  const [motivoAccion, setMotivoAccion] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [modalCierre, setModalCierre] = useState(null);
  const [formCierre, setFormCierre] = useState({ inicio: '', fin: '', motivo: '', horas: 24 });
  const [form, setForm] = useState(VACIO);
  const [historial, setHistorial] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState('mes');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [tiposVisibles, setTiposVisibles] = useState(() => new Set(TIPOS.map(t => t[0])));
  const [eventoDetalle, setEventoDetalle] = useState(null);

  const cargar = useCallback(async id => {
    if (!id) return;
    try {
      const [calRes, cierreRes] = await Promise.all([
        api.get('/calendario-academico', { params: { periodo_id: id } }),
        api.get('/cierre-academico', { params: { periodo_id: id } }),
      ]);
      setCalendario(calRes.data); setCierre(cierreRes.data);
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo cargar el calendario.'); }
  }, []);

  useEffect(() => {
    if (!periodoId) return;
    setError('');
    cargar(periodoId);
  }, [cargar, periodoId]);

  const eventos = useMemo(() => calendario?.eventos || [], [calendario]);
  const eventosVisibles = useMemo(() => eventos.filter(e => tiposVisibles.has(e.tipo)).sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)), [eventos, tiposVisibles]);
  const cuatrimestreCerrado = cierre?.estado === 'CERRADO';
  const puedeAdministrar = Boolean(periodo?.puede_administrar);
  const finActividades = useMemo(() => {
    const porTipo = tipo => eventos.filter(e => e.tipo === tipo).sort((a, b) => b.fecha_fin.localeCompare(a.fecha_fin))[0];
    return porTipo('FIN_ACTIVIDADES_ACADEMICAS') || porTipo('FIN_CUATRIMESTRE') || null;
  }, [eventos]);
  const hoyLocal = isoLocal(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const cierreDisponible = Boolean(finActividades && hoyLocal > finActividades.fecha_fin);
  const estadoCierre = cierre?.estado || 'ACTIVO';

  const crearCalendario = async () => {
    setGuardando(true); setError('');
    try {
      const { data } = await api.post('/calendario-academico', { periodo_id: Number(periodoId) });
      setCalendario(data); setMensaje('Calendario creado en borrador. Agrega las actividades oficiales antes de publicarlo.');
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo crear el calendario.'); }
    finally { setGuardando(false); }
  };

  const abrirNuevo = fecha => {
    if (!calendario?.puede_editar) return;
    setForm({ ...VACIO, fecha_inicio: fecha, fecha_fin: fecha }); setModal({ tipo: 'nuevo' });
  };
  const abrirEditar = evento => {
    if (!calendario?.puede_editar) return;
    setForm({ ...VACIO, ...evento, motivo_cambio: '' }); setModal({ tipo: 'editar', evento });
  };
  const alternarTipo = tipo => setTiposVisibles(actual => {
    const siguiente = new Set(actual);
    if (siguiente.has(tipo)) siguiente.delete(tipo); else siguiente.add(tipo);
    return siguiente;
  });
  const cambiarTipo = tipo => {
    const spec = TIPO_MAP[tipo];
    const requiere = spec?.[3] ?? true;
    setForm(f => ({ ...f, tipo, color: spec?.[2] || f.color, requiere_asistencia: requiere, permite_iniciar_clase: requiere, genera_alertas: requiere }));
  };
  const guardarEvento = async e => {
    e.preventDefault(); setGuardando(true); setError('');
    try {
      const payload = { ...form };
      if (modal.tipo === 'nuevo') await api.post(`/calendario-academico/${calendario.id}/eventos`, payload);
      else await api.put(`/calendario-academico/${calendario.id}/eventos/${modal.evento.id}`, payload);
      await cargar(periodoId); setModal(null); setMensaje(modal.tipo === 'nuevo' ? 'Actividad agregada al calendario.' : 'Actividad actualizada y registrada en el historial.');
    } catch (err) { setError(err.response?.data?.detail || 'No se pudo guardar la actividad.'); }
    finally { setGuardando(false); }
  };
  const abrirAccion = tipo => { setAccion(tipo); setMotivoAccion(''); setErrorAccion(''); };
  const cancelarEvento = () => abrirAccion('cancelar');
  const cambiarEstado = async estado => {
    if (estado === 'BORRADOR') { abrirAccion('borrador'); return; }
    setGuardando(true); setError(''); setMensaje('');
    try {
      const { data } = await api.put(`/calendario-academico/${calendario.id}/estado`, { estado });
      setCalendario(data); setMensaje('Calendario publicado. Sus reglas ya alimentan el sistema docente.');
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo cambiar el estado.'); }
    finally { setGuardando(false); }
  };
  const confirmarAccion = async e => {
    e.preventDefault(); setErrorAccion(''); setGuardando(true); setMensaje(''); setError('');
    try {
      if (accion === 'cerrar') {
        const { data } = await api.put('/cierre-academico', {
          periodo_id: Number(periodoId), estado: 'CERRADO', observaciones: motivoAccion.trim() || cierre?.observaciones || null,
        });
        setCierre(data);
        actualizarPeriodo({ id: Number(periodoId), estado_periodo: 'CERRADO', es_actual: false, estado_calendario: calendario ? 'CERRADO' : null });
        setMensaje(`${periodo.clave}: cierre completado. La operación académica y su calendario quedan en solo consulta.`);
      } else if (accion === 'precierre') {
        const { data } = await api.put('/cierre-academico', {
          periodo_id: Number(periodoId), estado: 'PRECIERRE', observaciones: cierre?.observaciones || null,
        });
        setCierre(data);
        setMensaje('Pre-cierre iniciado. Ahora puedes preparar la confirmación de las cargas docentes.');
      } else if (accion === 'borrador') {
        await api.put(`/calendario-academico/${calendario.id}/estado`, { estado: 'BORRADOR', motivo: motivoAccion.trim() });
        setMensaje('Calendario en borrador. El cuatrimestre sigue abierto.');
      } else {
        await api.delete(`/calendario-academico/${calendario.id}/eventos/${modal.evento.id}`, { params: { motivo: motivoAccion.trim() } });
        setModal(null); setMensaje('Actividad cancelada; el historial se conserva.');
      }
      await cargar(periodoId); setAccion(null);
    } catch (e) { setErrorAccion(e.response?.data?.detail || 'No se pudo completar la operación.'); }
    finally { setGuardando(false); }
  };
  const abrirHistorial = async () => {
    try { const { data } = await api.get(`/calendario-academico/${calendario.id}/historial`); setHistorial(data); setVerHistorial(true); }
    catch (e) { setError(e.response?.data?.detail || 'No se pudo consultar el historial.'); }
  };
  const configurarCierre = async (estado, fechas = {}) => {
    setGuardando(true); setError(''); setMensaje('');
    try {
      const { data } = await api.put('/cierre-academico', { periodo_id: Number(periodoId), estado, confirmacion_inicio: fechas.inicio || cierre?.confirmacion_inicio || null, confirmacion_fin: fechas.fin || cierre?.confirmacion_fin || null, observaciones: cierre?.observaciones || null });
      setCierre(data); setMensaje(`Cierre académico actualizado a ${estado.toLowerCase()}.`);
      setModalCierre(null);
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo actualizar el cierre académico.'); }
    finally { setGuardando(false); }
  };
  const abrirConfirmacion = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    setFormCierre({ inicio: cierre?.confirmacion_inicio || hoy, fin: cierre?.confirmacion_fin || hoy, motivo: '', horas: 24 });
    setModalCierre({ tipo: 'confirmacion' });
  };
  const abrirReapertura = carga => {
    setFormCierre({ inicio: '', fin: '', motivo: '', horas: 24 });
    setModalCierre({ tipo: 'reapertura', carga });
  };
  const guardarModalCierre = async e => {
    e.preventDefault(); setError('');
    if (modalCierre.tipo === 'confirmacion') {
      await configurarCierre('CONFIRMACION', formCierre); return;
    }
    try { await api.post(`/cierre-academico/cargas/${modalCierre.carga.carga_id}/reabrir`, { motivo: formCierre.motivo, horas: Number(formCierre.horas) }); await cargar(periodoId); setModalCierre(null); setMensaje(`Carga reabierta por ${formCierre.horas} horas.`); }
    catch (e) { setError(e.response?.data?.detail || 'No se pudo reabrir la carga.'); }
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-white">Calendario académico</h1><p className="mt-1 text-sm text-slate-400">Fuente oficial para asistencias, alertas y operación docente.</p></div>
        </div>
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}
        {mensaje && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{mensaje}</div>}
        {puedeAdministrar && (
          <section className="glass rounded-2xl p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Cierre académico del cuatrimestre</p><h2 className="mt-1 font-semibold text-white">{cuatrimestreCerrado ? '✓ Cierre completado' : estadoCierre === 'CONFIRMACION' ? 'Confirmación docente en curso' : estadoCierre === 'PRECIERRE' ? 'Pre-cierre en curso' : 'El periodo está en curso'}</h2><p className="mt-1 text-xs text-slate-400">{cuatrimestreCerrado ? `Cuatrimestre y calendario en solo consulta${cierre.cerrado_en ? ` · Cerrado el ${new Date(`${cierre.cerrado_en}Z`).toLocaleString('es-MX')}` : ''}.` : estadoCierre === 'ACTIVO' ? finActividades ? `El cierre estará disponible después del ${new Date(`${finActividades.fecha_fin}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}, al terminar las actividades académicas.` : 'Agrega al calendario oficial la fecha de fin de actividades académicas para habilitar el cierre cuando corresponda.' : `${cierre.confirmadas}/${cierre.total_cargas} cargas confirmadas · ${cierre.con_pendientes} con clases abiertas`}</p>{cierre?.laboratorios && estadoCierre !== 'ACTIVO' && <p className={`mt-1 text-xs ${cierre.laboratorios.sesiones_abiertas ? 'text-amber-300' : 'text-emerald-300'}`}>Laboratorios: {cierre.laboratorios.reservaciones} reservas · {cierre.laboratorios.sesiones_abiertas} sesiones abiertas{cierre.estado === 'CERRADO' ? ' · agenda archivada' : ''}</p>}</div><div className="flex flex-wrap gap-2">{estadoCierre === 'ACTIVO' && cierreDisponible && <button disabled={guardando} onClick={() => abrirAccion('precierre')} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-40">Comenzar cierre del cuatrimestre</button>}{estadoCierre === 'PRECIERRE' && <button disabled={guardando} onClick={abrirConfirmacion} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Solicitar confirmación a docentes</button>}{estadoCierre === 'CONFIRMACION' && <><button disabled={guardando} onClick={abrirConfirmacion} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-40">Ajustar fechas</button><button disabled={guardando || cierre.laboratorios?.sesiones_abiertas > 0 || cierre.confirmadas < cierre.total_cargas} title="Cierra definitivamente el cuatrimestre y archiva su calendario" onClick={() => abrirAccion('cerrar')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Cerrar definitivamente</button></>}</div></div>{cierre?.cargas?.length > 0 && estadoCierre !== 'ACTIVO' && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2">Docente / materia</th><th>Grupo</th><th>Clases</th><th>Estado</th><th></th></tr></thead><tbody className="divide-y divide-white/10">{cierre.cargas.map(c => <tr key={c.carga_id}><td className="py-2.5"><b className="text-white">{c.materia}</b><br/><span className="text-slate-500">{c.docente}</span></td><td>{c.grupo}</td><td>{c.resumen.clases_cerradas}/{c.resumen.clases_registradas}</td><td>{c.estado.replaceAll('_',' ')}</td><td className="text-right">{c.estado === 'CONFIRMADA_DOCENTE' && <button onClick={() => abrirReapertura(c)} className="rounded border border-blue-500/30 px-2 py-1 text-blue-300">Reabrir</button>}</td></tr>)}</tbody></table></div>}</section>
        )}
        {!calendario ? (
          <div className="glass rounded-2xl p-8 text-center"><h2 className="text-lg font-semibold text-white">{periodo?.clave} todavía no tiene calendario publicado</h2><p className="mt-2 text-sm text-slate-400">{cuatrimestreCerrado ? 'Cuatrimestre cerrado. No se pueden crear calendarios ni registrar clases.' : 'El calendario oficial se mostrará cuando División de Carrera lo publique.'}</p>{puedeAdministrar && !cuatrimestreCerrado && <button onClick={crearCalendario} disabled={guardando} className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Crear calendario en borrador</button>}</div>
        ) : <>
          <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${calendario.estado === 'PUBLICADO' ? 'bg-emerald-500/15 text-emerald-300' : calendario.estado === 'CERRADO' ? 'bg-slate-500/20 text-slate-300' : 'bg-amber-500/15 text-amber-300'}`}>{calendario.estado}</span><span className="text-xs text-slate-500">Versión {calendario.version}</span></div><p className="mt-2 text-xs text-slate-400">{calendario.estado === 'PUBLICADO' ? 'Las reglas están activas en el sistema docente.' : calendario.estado === 'BORRADOR' ? 'Los cambios aún no afectan al sistema docente.' : 'Calendario archivado. Sus fechas e historial se conservan para consulta.'}</p></div>
            <div className="flex flex-wrap gap-2">{calendario.puede_editar && calendario.estado === 'BORRADOR' && <button disabled={guardando} onClick={() => cambiarEstado('PUBLICADO')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Publicar calendario</button>}{calendario.puede_editar && calendario.estado === 'PUBLICADO' && <><button disabled={guardando} onClick={() => cambiarEstado('BORRADOR')} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Volver a borrador</button></>} {puedeAdministrar && <button onClick={abrirHistorial} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300">Ver historial</button>}</div>
          </div>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><button aria-label="Mes anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-slate-300 hover:bg-white/10">←</button><button onClick={() => setCursor(new Date())} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">Hoy</button><button aria-label="Mes siguiente" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-slate-300 hover:bg-white/10">→</button></div>
              <h2 className="order-first w-full text-xl font-bold capitalize text-white sm:order-none sm:w-auto">{MESES[cursor.getMonth()]} {cursor.getFullYear()}</h2>
              <div className="flex items-center gap-2">
                <div className="flex rounded-xl border border-white/10 bg-black/10 p-1"><button onClick={() => setVista('mes')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${vista === 'mes' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Mes</button><button onClick={() => setVista('agenda')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${vista === 'agenda' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Agenda</button></div>
                <button onClick={() => setFiltrosAbiertos(!filtrosAbiertos)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">Filtros <span className="text-emerald-400">{tiposVisibles.size}/{TIPOS.length}</span></button>
              </div>
            </div>
            {filtrosAbiertos && <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Simbología del calendario</h3><p className="text-xs text-slate-500">Selecciona qué actividades deseas visualizar.</p></div><button onClick={() => setTiposVisibles(new Set(TIPOS.map(t => t[0])))} className="text-xs font-semibold text-emerald-400">Mostrar todas</button></div><div className="flex flex-wrap gap-2">{TIPOS.map(t => <button key={t[0]} onClick={() => alternarTipo(t[0])} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${tiposVisibles.has(t[0]) ? 'border-white/15 bg-white/[0.06] text-slate-200' : 'border-white/5 text-slate-600 opacity-60'}`}><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t[2] }} />{t[1]} {tiposVisibles.has(t[0]) ? '✓' : ''}</button>)}</div></div>}
            <div className={vista === 'mes' ? 'hidden md:block' : 'hidden'}><CalendarGrid cursor={cursor} eventos={eventosVisibles} onDay={abrirNuevo} onEvent={setEventoDetalle} /></div>
            <div className={vista === 'agenda' ? 'block' : 'md:hidden'}><Agenda eventos={eventosVisibles} onEvent={setEventoDetalle} /></div>
            <p className="text-xs text-slate-500">Selecciona una actividad para consultar sus detalles{calendario.puede_editar ? '; selecciona un día vacío para agregar una nueva' : ''}.</p>
          </section>
        </>}
      </div>
      {eventoDetalle && (() => { const spec = TIPO_MAP[eventoDetalle.tipo] || TIPO_MAP.OTRO; return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/65 backdrop-blur-sm" onClick={() => setEventoDetalle(null)}><aside className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200"><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: eventoDetalle.color || spec[2] }} />{spec[4]}</span><button onClick={() => setEventoDetalle(null)} className="text-2xl leading-none text-slate-400 hover:text-white" aria-label="Cerrar detalle">×</button></div><div className="mt-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ backgroundColor: eventoDetalle.color || spec[2] }}>{spec[5]}</div><h2 className="mt-4 text-2xl font-bold text-white">{eventoDetalle.titulo}</h2><p className="mt-2 text-sm font-medium text-slate-300">{new Date(`${eventoDetalle.fecha_inicio}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{eventoDetalle.fecha_fin !== eventoDetalle.fecha_inicio ? ` — ${new Date(`${eventoDetalle.fecha_fin}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</p>{eventoDetalle.descripcion ? <p className="mt-6 whitespace-pre-line text-sm leading-6 text-slate-400">{eventoDetalle.descripcion}</p> : <p className="mt-6 text-sm italic text-slate-600">Esta actividad no tiene una descripción adicional.</p>}<div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Operación docente</p><div className="mt-3 space-y-2 text-sm text-slate-300"><p>{eventoDetalle.requiere_asistencia ? '✓' : '—'} Registro de asistencia</p><p>{eventoDetalle.permite_iniciar_clase ? '✓' : '—'} Inicio de clases</p><p>{eventoDetalle.genera_alertas ? '✓' : '—'} Alertas automáticas</p></div></div></div>{calendario?.puede_editar && <button onClick={() => { const actual = eventoDetalle; setEventoDetalle(null); abrirEditar(actual); }} className="mt-8 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500">Editar actividad</button>}</aside></div>; })()}
      {accion && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onKeyDown={e => { if (e.key === 'Escape' && !guardando) setAccion(null); }}>
        <form role="dialog" aria-modal="true" aria-labelledby="titulo-accion-calendario" onSubmit={confirmarAccion} className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl" style={{ background: 'var(--main-bg)', color: 'var(--main-text)', borderColor: 'var(--topbar-border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">{periodo?.clave}</p>
          <h2 id="titulo-accion-calendario" className="mt-2 text-xl font-bold">{accion === 'cerrar' ? 'Cerrar definitivamente el cuatrimestre' : accion === 'precierre' ? 'Comenzar cierre del cuatrimestre' : accion === 'borrador' ? 'Volver el calendario a borrador' : 'Cancelar actividad del calendario'}</h2>
          <p className="mt-3 text-sm leading-6 opacity-80">{accion === 'cerrar' ? 'Esta es la etapa final: se cerrará la operación académica, se archivará el calendario y la agenda de laboratorio. No se podrán crear ni activar materias.' : accion === 'precierre' ? 'El periodo dejará su operación normal e iniciará el proceso de cierre. Después podrás solicitar a los docentes que revisen y confirmen sus materias.' : accion === 'borrador' ? 'Las reglas del calendario dejarán de aplicarse hasta que vuelvas a publicarlo. Esta acción no cierra el cuatrimestre.' : 'La actividad dejará de aplicarse. El registro se conservará en el historial.'}</p>
          {accion !== 'precierre' && <label className="mt-5 block text-sm">{accion === 'cerrar' ? 'Observaciones del cierre (opcional)' : 'Motivo del cambio *'}<textarea autoFocus required={accion !== 'cerrar'} minLength={accion === 'cerrar' ? undefined : 5} maxLength={500} value={motivoAccion} onChange={e => setMotivoAccion(e.target.value)} className="input-dark mt-2 min-h-24" /></label>}
          {errorAccion && <p role="alert" className="mt-3 text-sm text-red-500">{typeof errorAccion === 'string' ? errorAccion : JSON.stringify(errorAccion)}</p>}
          <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={guardando} onClick={() => setAccion(null)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Cancelar</button><button disabled={guardando} type="submit" className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${accion === 'cerrar' ? 'bg-red-600' : 'bg-emerald-600'}`}>{guardando ? 'Procesando…' : accion === 'cerrar' ? 'Confirmar cierre definitivo' : accion === 'precierre' ? 'Sí, comenzar el cierre' : 'Confirmar cambio'}</button></div>
        </form>
      </div>}
      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={guardarEvento} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-lg font-bold text-white">{modal.tipo === 'nuevo' ? 'Nueva actividad' : 'Editar actividad'}</h2><p className="text-xs text-slate-400">Define cómo esta fecha afecta la operación docente.</p></div><button type="button" onClick={() => setModal(null)} className="text-2xl text-slate-400">×</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300 sm:col-span-2">Nombre *<input required value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="input-dark mt-1" /></label><label className="text-sm text-slate-300 sm:col-span-2">Tipo<select value={form.tipo} onChange={e => cambiarTipo(e.target.value)} className="input-dark mt-1">{TIPOS.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label><label className="text-sm text-slate-300">Fecha inicial<input required type="date" value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} className="input-dark mt-1" /></label><label className="text-sm text-slate-300">Fecha final<input required type="date" value={form.fecha_fin} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} className="input-dark mt-1" /></label><label className="text-sm text-slate-300 sm:col-span-2">Descripción<textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="input-dark mt-1 min-h-20" /></label><div className="space-y-2 rounded-xl border border-white/10 p-4 text-sm text-slate-300 sm:col-span-2">{[['requiere_asistencia','Requiere registro de asistencia'],['permite_iniciar_clase','Permite iniciar una clase'],['genera_alertas','Genera alertas por falta de registro']].map(([key,label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}</div>{calendario.estado === 'PUBLICADO' && <label className="text-sm text-slate-300 sm:col-span-2">Motivo del cambio *<textarea required minLength={5} value={form.motivo_cambio} onChange={e => setForm({ ...form, motivo_cambio: e.target.value })} className="input-dark mt-1" /></label>}</div><div className="mt-6 flex justify-between gap-3">{modal.tipo === 'editar' ? <button type="button" onClick={cancelarEvento} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-300">Cancelar actividad</button> : <span />}<div className="flex gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300">Cerrar</button><button disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{guardando ? 'Guardando…' : 'Guardar'}</button></div></div></form></div>}
      {modalCierre && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"><form onSubmit={guardarModalCierre} className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-300">Cierre académico</p><h2 className="mt-1 text-lg font-bold text-white">{modalCierre.tipo === 'confirmacion' ? 'Abrir confirmación docente' : 'Reabrir carga docente'}</h2><p className="mt-1 text-sm text-slate-400">{modalCierre.tipo === 'confirmacion' ? 'Define el periodo en el que cada docente revisará y confirmará sus materias.' : `${modalCierre.carga.materia} · ${modalCierre.carga.docente}`}</p></div><button type="button" onClick={() => setModalCierre(null)} className="text-2xl leading-none text-slate-400 hover:text-white">×</button></div>{modalCierre.tipo === 'confirmacion' ? <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Inicio de confirmación<input required type="date" value={formCierre.inicio} onChange={e => setFormCierre({ ...formCierre, inicio: e.target.value })} className="input-dark mt-1.5" /></label><label className="text-sm text-slate-300">Fin de confirmación<input required type="date" min={formCierre.inicio} value={formCierre.fin} onChange={e => setFormCierre({ ...formCierre, fin: e.target.value })} className="input-dark mt-1.5" /></label><p className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-200 sm:col-span-2">Durante estas fechas, los docentes podrán confirmar únicamente materias sin clases abiertas.</p></div> : <div className="mt-6 space-y-4"><label className="block text-sm text-slate-300">Motivo de la reapertura *<textarea required minLength={5} value={formCierre.motivo} onChange={e => setFormCierre({ ...formCierre, motivo: e.target.value })} className="input-dark mt-1.5 min-h-24" placeholder="Describe la información que debe corregirse" /></label><label className="block text-sm text-slate-300">Tiempo disponible<select value={formCierre.horas} onChange={e => setFormCierre({ ...formCierre, horas: e.target.value })} className="input-dark mt-1.5"><option value="12">12 horas</option><option value="24">24 horas</option><option value="48">48 horas</option><option value="72">72 horas</option><option value="168">7 días</option></select></label></div>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setModalCierre(null)} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300">Cancelar</button><button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{modalCierre.tipo === 'confirmacion' ? 'Abrir confirmación' : 'Autorizar reapertura'}</button></div></form></div>}
      {verHistorial && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6"><div className="flex justify-between"><h2 className="text-lg font-bold text-white">Historial del calendario</h2><button onClick={() => setVerHistorial(false)} className="text-2xl text-slate-400">×</button></div><div className="mt-4 divide-y divide-white/10">{historial.map(h => <div key={h.id} className="py-3"><div className="flex justify-between gap-3"><p className="text-sm font-semibold text-white">{h.accion.replaceAll('_',' ')}</p><span className="text-xs text-slate-500">{new Date(`${h.creado_en}Z`).toLocaleString('es-MX')}</span></div><p className="mt-1 text-xs text-slate-400">{h.usuario}{h.motivo ? ` · ${h.motivo}` : ''}</p></div>)}</div></div></div>}
    </AdminLayout>
  );
}
