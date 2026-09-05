import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import ContextoAlumnoDocente from '../../components/ContextoAlumnoDocente';
import api from '../../hooks/useApi';
import { useTheme } from '../../context/ThemeContext';
import { formatCarrera, formatNombre } from '../../utils/presentacion';

const ESTADOS = [
  ['PRESENTE', 'Presente', 'bg-emerald-600'],
  ['FALTA', 'Falta', 'bg-red-600'],
  ['RETARDO', 'Retardo', 'bg-amber-600'],
];

export default function ClaseAsistencia() {
  const { claseId } = useParams();
  const navigate = useNavigate();
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [clase, setClase] = useState(null);
  const [contextos, setContextos] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [cierreConfirmado, setCierreConfirmado] = useState(null);
  const [redireccionAutomatica, setRedireccionAutomatica] = useState(false);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [modal, setModal] = useState(null);
  const [texto, setTexto] = useState('');
  const [asistenciaRevisada, setAsistenciaRevisada] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [detalleExtemporaneoAbierto, setDetalleExtemporaneoAbierto] = useState(false);
  const [modalIncidenciaGrupo, setModalIncidenciaGrupo] = useState(false);
  const [incidenciaGrupo, setIncidenciaGrupo] = useState({ tipo: '', descripcion: '', requiere_seguimiento: false, solicita_justificacion: false });
  const [bitacora, setBitacora] = useState({
    tema_impartido: '', avance_planeacion: 100, actividades_realizadas: '',
    tema_pendiente: '',
  });

  const cargar = useCallback(async () => {
    try {
      const [claseRes, contextoRes] = await Promise.all([
        api.get(`/docencia/clases/${claseId}`),
        api.get(`/docencia/clases/${claseId}/contexto-alumnos`),
      ]);
      setClase(claseRes.data);
      setContextos(contextoRes.data);
    } catch {
      setError('No se pudo cargar la clase.');
    }
  }, [claseId]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!redireccionAutomatica || !cierreConfirmado) return undefined;
    const temporizador = window.setTimeout(() => navigate('/docente/horario'), 5000);
    return () => window.clearTimeout(temporizador);
  }, [cierreConfirmado, navigate, redireccionAutomatica]);

  const cambiar = async (asistenciaId, estado, observacion = null) => {
    if (!['ABIERTA', 'CORRECCION'].includes(clase.estado)) return;
    setClase((actual) => ({
      ...actual,
      alumnos: actual.alumnos.map((a) => a.asistencia_id === asistenciaId ? { ...a, estado, observacion } : a),
    }));
    try {
      await api.patch(`/docencia/clases/${claseId}/asistencia/${asistenciaId}`, { estado, observacion });
      cargar();
      return true;
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar la asistencia.');
      cargar();
      return false;
    }
  };

  const cerrar = async () => {
    setCerrando(true);
    const eraCorreccion = clase.estado === 'CORRECCION';
    try {
      const { data } = await api.post(`/docencia/clases/${claseId}/cerrar`, {
        ...bitacora,
        // Campo anterior: se vacía para que el seguimiento quede en un solo lugar.
        tarea_asignada: '',
        avance_planeacion: Number(bitacora.avance_planeacion),
      });
      setClase(data);
      setModal(null);
      setTexto('');
      setMensaje('');
      setCierreConfirmado({
        titulo: eraCorreccion ? 'Corrección guardada correctamente' : 'Asistencia registrada y clase cerrada correctamente',
        detalle: data.canalizacion_tutoria?.mensaje || '',
      });
      setRedireccionAutomatica(true);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cerrar la clase.');
    } finally {
      setCerrando(false);
    }
  };
  const abrirCierre = () => {
    setAsistenciaRevisada(clase.estado === 'CORRECCION');
    setTexto('');
    const pendientesAnteriores = [
      clase.bitacora?.tema_pendiente?.trim(),
      clase.bitacora?.tarea_asignada?.trim(),
    ].filter(Boolean);
    setBitacora({
      tema_impartido: clase.bitacora?.tema_impartido || '',
      avance_planeacion: clase.bitacora?.avance_planeacion ?? 100,
      actividades_realizadas: clase.bitacora?.actividades_realizadas || '',
      tema_pendiente: [...new Set(pendientesAnteriores)].join('\n'),
    });
    setModal('cerrar');
  };

  const corregir = async () => {
    if (texto.trim().length < 5) {
      setError('Escribe el motivo de la corrección (mínimo 5 caracteres).');
      return;
    }
    setCerrando(true);
    try {
      const { data } = await api.post(`/docencia/clases/${claseId}/habilitar-correccion`, {
        motivo: texto.trim(),
      });
      setClase(data);
      setModal(null);
      setTexto('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo habilitar la corrección.');
    } finally {
      setCerrando(false);
    }
  };

  const abrirIncidenciaGrupo = () => {
    setIncidenciaGrupo({
      tipo: clase.bitacora?.incidencia_tipo || '',
      descripcion: clase.bitacora?.incidencias || '',
      requiere_seguimiento: Boolean(clase.bitacora?.incidencia_requiere_seguimiento),
      solicita_justificacion: Boolean(clase.bitacora?.incidencia_solicita_justificacion),
    });
    setModalIncidenciaGrupo(true);
  };

  const guardarIncidenciaGrupo = async (e) => {
    e.preventDefault();
    if (!incidenciaGrupo.tipo || incidenciaGrupo.descripcion.trim().length < 5) return;
    setCerrando(true);
    try {
      const { data } = await api.patch(`/docencia/clases/${claseId}/incidencia`, {
        tipo: incidenciaGrupo.tipo,
        descripcion: incidenciaGrupo.descripcion.trim(),
        requiere_seguimiento: incidenciaGrupo.requiere_seguimiento,
        solicita_justificacion: incidenciaGrupo.solicita_justificacion,
      });
      setClase(data);
      setModalIncidenciaGrupo(false);
      setMensaje(incidenciaGrupo.tipo === 'SEGURIDAD'
        ? 'Nota urgente registrada. Tutoría fue notificada de inmediato.'
        : incidenciaGrupo.solicita_justificacion
          ? 'Nota registrada. La solicitud de justificación colectiva quedó enviada para revisión.'
          : incidenciaGrupo.requiere_seguimiento
            ? 'Nota registrada. Se notificará al tutor al cerrar la clase.'
            : 'Nota de la clase registrada.');
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar la nota de la clase.');
    } finally {
      setCerrando(false);
    }
  };

  if (!clase) return <AdminLayout><div className="p-8 text-center text-slate-400">{error || 'Cargando lista de alumnos...'}</div></AdminLayout>;
  const r = clase.resumen;
  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button onClick={() => navigate('/docente/horario')} className="mb-2 text-sm text-slate-400 hover:text-white">← Mi horario</button>
            <h1 className="text-2xl font-bold text-white">{clase.carga.actividad_nombre}</h1>
            <p className="text-sm text-slate-400">{clase.carga.grupo} · <span title={clase.carga.carrera}>{formatCarrera(clase.carga.carrera)}</span> · {clase.carga.espacio_nombre || 'Sin salón'} · {clase.carga.hora_inicio}–{clase.carga.hora_fin}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${clase.estado === 'ABIERTA' ? 'bg-emerald-500/20 text-emerald-300' : clase.estado === 'CORRECCION' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-300'}`}>
              {clase.estado === 'ABIERTA' ? 'Clase en curso' : clase.estado === 'CORRECCION' ? 'Corrigiendo asistencia' : clase.estado === 'NO_IMPARTIDA' ? 'Clase no impartida' : 'Asistencia cerrada'}
            </span>
            {clase.es_extemporanea && (
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={detalleExtemporaneoAbierto}
                  aria-controls="detalle-captura-extemporanea"
                  onClick={() => setDetalleExtemporaneoAbierto((abierto) => !abierto)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${isDay ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-blue-400/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15'}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9h.01M11 12h1v4h1m8-4a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  Registro fuera de horario
                  <svg className={`h-3 w-3 transition-transform ${detalleExtemporaneoAbierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" /></svg>
                </button>
                {detalleExtemporaneoAbierto && (
                  <div id="detalle-captura-extemporanea" className={`absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border p-4 text-left shadow-2xl ${isDay ? 'border-blue-200 bg-white text-slate-700' : 'border-blue-400/20 bg-slate-900 text-slate-300'}`} role="status">
                    <p className={`text-sm font-semibold ${isDay ? 'text-blue-800' : 'text-blue-200'}`}>Asistencia registrada fuera de horario</p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div><dt className="inline text-slate-500">Clase: </dt><dd className="inline">{new Date(`${clase.fecha}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' })} · {clase.carga.hora_inicio}–{clase.carga.hora_fin}</dd></div>
                      <div><dt className="inline text-slate-500">Capturada: </dt><dd className="inline">{clase.capturada_extemporanea_en ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(`${clase.capturada_extemporanea_en}Z`)) : 'Sin hora registrada'}</dd></div>
                      <div><dt className="inline text-slate-500">Motivo: </dt><dd className="inline">{clase.motivo_extemporaneo || 'Sin motivo registrado'}</dd></div>
                    </dl>
                  </div>
                )}
              </div>
            )}
            {['ABIERTA', 'CORRECCION'].includes(clase.estado) && <button disabled={cerrando} onClick={abrirCierre} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">{clase.estado === 'CORRECCION' ? 'Guardar corrección' : 'Cerrar asistencia'}</button>}
            {clase.estado === 'CERRADA' && <button onClick={() => { setTexto(''); setModal('corregir'); }} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${isDay ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-white/15 text-slate-300 hover:border-white/25 hover:bg-white/5'}`}>Corregir asistencia</button>}
            {clase.estado === 'CERRADA' && <button onClick={() => navigate(`/docente/seguimiento?carga=${clase.carga.id}`)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-300">Ver seguimiento del grupo</button>}
          </div>
        </div>

        {clase.estado === 'NO_IMPARTIDA' && (
          <div className={`rounded-2xl border px-5 py-4 ${isDay ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-500/25 bg-slate-500/[0.07] text-slate-300'}`}>
            <p className="font-semibold">Esta sesión quedó registrada como no impartida.</p>
            <p className="mt-1 text-sm text-slate-500">{clase.motivo_no_impartida || 'No requiere captura de asistencia.'}</p>
          </div>
        )}

        {clase.estado !== 'NO_IMPARTIDA' && <div className={`grid grid-cols-2 gap-3 ${clase.estado === 'ABIERTA' ? 'md:grid-cols-4' : 'md:grid-cols-5'}`}>
          {[['Total', r.total], ['Presentes', r.presente], ['Faltas', r.falta], ['Retardos', r.retardo], ...(clase.estado === 'ABIERTA' ? [] : [['Justificadas', r.justificada]])].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{valor}</p><p className="text-xs text-slate-400">{etiqueta}</p></div>
          ))}
        </div>}

        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {cierreConfirmado && (
          <div className={`rounded-2xl border p-4 ${isDay ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'}`} role="status" aria-live="polite">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isDay ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'}`} aria-hidden="true">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 4 4L19 6" /></svg>
                </span>
                <div>
                  <p className="font-semibold">{cierreConfirmado.titulo}</p>
                  <p className={`mt-1 text-sm ${isDay ? 'text-emerald-800' : 'text-emerald-200/80'}`}>
                    {r.presente} {r.presente === 1 ? 'presente' : 'presentes'} · {r.falta} {r.falta === 1 ? 'falta' : 'faltas'} · {r.retardo} {r.retardo === 1 ? 'retardo' : 'retardos'}{r.justificada ? ` · ${r.justificada} ${r.justificada === 1 ? 'justificada' : 'justificadas'}` : ''}
                  </p>
                  {cierreConfirmado.detalle && <p className={`mt-1 text-xs ${isDay ? 'text-emerald-700' : 'text-emerald-200/70'}`}>{cierreConfirmado.detalle}</p>}
                  {redireccionAutomatica && <p className={`mt-1 text-xs ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Volverás a tu horario en unos segundos.</p>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => navigate('/docente/horario')} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${isDay ? 'border-emerald-300 bg-white text-emerald-900' : 'border-white/15 text-slate-300'}`}>Volver al horario</button>
                <button type="button" onClick={() => navigate(`/docente/seguimiento?carga=${clase.carga.id}`)} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Ver seguimiento del grupo</button>
              </div>
            </div>
          </div>
        )}
        {mensaje && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{mensaje}</div>}
        {!!clase.correcciones_asistencia?.length && (
          <section className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.05]">
            <button
              type="button"
              aria-expanded={historialAbierto}
              aria-controls="historial-correcciones"
              onClick={() => setHistorialAbierto((abierto) => !abierto)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <div>
                <p className="font-semibold text-blue-300">Historial de correcciones</p>
                <p className="mt-0.5 text-xs text-slate-400">{clase.correcciones_asistencia.length} movimiento{clase.correcciones_asistencia.length === 1 ? '' : 's'} de auditoría · consulta de cambios, responsables y motivos.</p>
              </div>
              <span className="flex shrink-0 items-center gap-2 rounded-full bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-300">
                {historialAbierto ? 'Ocultar bitácora' : 'Ver bitácora'}
                <svg className={`h-3.5 w-3.5 transition-transform ${historialAbierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>
            {historialAbierto && <div id="historial-correcciones" className="divide-y divide-white/10 border-t border-blue-500/15">
              {clase.correcciones_asistencia.map((correccion) => (
                <div key={correccion.id} className="grid gap-1 px-5 py-3 text-xs sm:grid-cols-[145px_minmax(160px,1fr)_150px_minmax(180px,1.2fr)] sm:gap-3">
                  <span className="text-slate-500">{correccion.creado_en ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(`${correccion.creado_en}Z`)) : 'Registro anterior'}</span>
                  <span className="font-medium text-slate-300">{correccion.alumno || (correccion.tipo === 'APERTURA' ? 'Apertura de corrección' : 'Cambio general')}</span>
                  <span className="text-slate-400">{correccion.estado_anterior && correccion.estado_nuevo ? `${correccion.estado_anterior} → ${correccion.estado_nuevo}` : correccion.tipo}</span>
                  <span className="text-slate-400"><span className="text-slate-500">Motivo:</span> {correccion.motivo}{correccion.docente ? ` · ${correccion.docente}` : ''}</span>
                </div>
              ))}
            </div>}
          </section>
        )}
        {clase.estado !== 'NO_IMPARTIDA' && <div className="glass mx-auto w-full max-w-[1150px] overflow-hidden rounded-2xl">
          <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 className="font-semibold text-white">Lista del grupo</h2>
            <p className="text-xs text-slate-400">Todos comienzan como presentes; marca únicamente faltas y retardos. Las faltas se justifican después, desde Seguimiento de grupos, con el documento validado por División de Carrera.</p></div>
            {['ABIERTA', 'CORRECCION'].includes(clase.estado) && <button type="button" onClick={abrirIncidenciaGrupo} className="shrink-0 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">{clase.bitacora?.incidencias ? 'Editar nota de clase' : '+ Nota de clase'}</button>}
          </div>
          {clase.bitacora?.incidencias && <div className="border-b border-blue-500/15 bg-blue-500/[0.05] px-5 py-3 text-xs text-slate-300"><b className="text-blue-300">Nota de la clase:</b> {clase.bitacora.incidencias}{clase.bitacora.incidencia_requiere_seguimiento ? ' · Se notificará al tutor' : ''}{clase.bitacora.incidencia_solicita_justificacion ? ' · Justificación colectiva solicitada' : ''}</div>}
          <div>
            {clase.alumnos.map((alumno, indice) => (
              <div
                key={alumno.asistencia_id}
                className={`attendance-row group grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-b border-l-4 border-b-white/5 border-l-transparent px-4 py-3.5 transition-all duration-150 last:border-b-0 hover:border-l-emerald-500 hover:bg-emerald-500/[0.08] focus-within:border-l-emerald-500 focus-within:bg-emerald-500/[0.08] sm:px-5 lg:grid-cols-[48px_minmax(280px,1fr)_410px] lg:gap-x-3 ${
                  indice % 2 === 1 ? 'bg-white/[0.025]' : 'bg-transparent'
                }`}
              >
                <span className="attendance-row-index flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-sm text-slate-400 transition-colors group-hover:bg-emerald-500/20 group-hover:font-semibold group-hover:text-emerald-300 group-focus-within:bg-emerald-500/20 group-focus-within:font-semibold group-focus-within:text-emerald-300">
                  {indice + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{formatNombre(alumno.nombre)}</p>
                  <p className="text-xs text-slate-500">{alumno.matricula}</p>
                  {alumno.estado === 'JUSTIFICADA' && <span className="mt-1 inline-flex rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-300">Falta justificada por documento</span>}
                  <ContextoAlumnoDocente
                    compacto
                    cargaId={clase.carga.id}
                    alumnoId={alumno.alumno_id}
                    nombre={formatNombre(alumno.nombre)}
                    contexto={contextos[String(alumno.alumno_id)]}
                    onEnviada={(data) => { setMensaje(data.mensaje); cargar(); }}
                  />
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-2 pl-[52px] sm:pl-0 lg:col-span-1">
                  {ESTADOS.map(([valor, etiqueta, color]) => (
                    <button
                      key={valor}
                      disabled={!['ABIERTA', 'CORRECCION'].includes(clase.estado)}
                      onClick={() => cambiar(alumno.asistencia_id, valor)}
                      className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${alumno.estado === valor ? `${color} text-white shadow-sm` : 'bg-white/5 text-slate-400 hover:bg-white/10'} disabled:cursor-not-allowed`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {clase.alumnos.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Este grupo todavía no tiene alumnos inscritos.</p>}
          </div>
        </div>}
        {modal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.72)' }}
          >
            <div className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl ${modal === 'cerrar' ? 'max-w-4xl' : 'max-w-lg'}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{modal === 'corregir' ? 'Habilitar corrección' : clase.estado === 'CORRECCION' ? 'Guardar corrección' : 'Finalizar clase'}</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {modal === 'corregir'
                      ? 'Indica por qué necesitas modificarla. El motivo quedará registrado.'
                      : clase.estado === 'CORRECCION'
                        ? 'Actualiza la información necesaria. La modificación quedará registrada en la bitácora.'
                        : 'Registra lo trabajado durante la sesión. Después podrás realizar correcciones dejando un motivo.'}
                  </p>
                </div>
                <button onClick={() => setModal(null)} className="text-2xl text-slate-400 hover:text-white">×</button>
              </div>
              {modal === 'corregir' ? (
                <>
                  <label className="mt-5 block text-sm font-medium text-slate-300">Motivo de la corrección *</label>
                  <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white outline-none focus:border-emerald-500" placeholder="Ej. El alumno presentó su justificante después del cierre." />
                </>
              ) : (
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-300 sm:col-span-2">Tema impartido *
                    <input required value={bitacora.tema_impartido} onChange={(e) => setBitacora({ ...bitacora, tema_impartido: e.target.value })} className="input-dark mt-1" placeholder="Ej. Evaluación primaria del paciente" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm font-medium text-slate-300 sm:col-span-2">Avance respecto a la planeación <span className="font-normal text-slate-500">(Opcional)</span>
                    <div className="mt-3 flex items-center gap-4">
                      <input type="range" min="0" max="100" step="5" value={bitacora.avance_planeacion} onChange={(e) => setBitacora({ ...bitacora, avance_planeacion: e.target.value })} className="flex-1" />
                      <span className="w-14 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-center font-semibold text-emerald-400">{bitacora.avance_planeacion}%</span>
                    </div>
                  </label>
                  <label className="text-sm font-medium text-slate-300">Actividades realizadas <span className="font-normal text-slate-500">(Opcional)</span>
                    <textarea value={bitacora.actividades_realizadas} onChange={(e) => setBitacora({ ...bitacora, actividades_realizadas: e.target.value })} rows={3} className="input-dark mt-1 min-h-[96px] resize-y" placeholder="Práctica, ejercicio o dinámica" />
                  </label>
                  <label className="text-sm font-medium text-slate-300">Pendiente para la siguiente clase <span className="font-normal text-slate-500">(Opcional)</span>
                    <textarea value={bitacora.tema_pendiente} onChange={(e) => setBitacora({ ...bitacora, tema_pendiente: e.target.value })} rows={3} className="input-dark mt-1 min-h-[96px] resize-y" placeholder="Ej. Retomar normalización y revisar el ejercicio pendiente" />
                    <span className="mt-1 block text-xs font-normal text-slate-500">Anota el tema que debe retomarse o el trabajo que conviene revisar al comenzar la próxima sesión.</span>
                  </label>
                  {clase.estado !== 'CORRECCION' && (
                    <label className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4 text-sm text-slate-200 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={asistenciaRevisada}
                        onChange={(e) => setAsistenciaRevisada(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500"
                      />
                      <span>
                        <b className="block text-emerald-300">Confirmo que revisé la asistencia del grupo</b>
                        Verifiqué los {r.total} registros: {r.presente} presentes, {r.falta} faltas, {r.retardo} retardos y {r.justificada} justificadas.
                      </span>
                    </label>
                  )}
                  <p className="text-xs text-slate-500 sm:col-span-2">* Campo obligatorio. Los demás campos pueden dejarse vacíos.</p>
                </div>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setModal(null)} className="rounded-xl bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-300">Cancelar</button>
                <button disabled={cerrando || (modal !== 'corregir' && (!bitacora.tema_impartido.trim() || (clase.estado !== 'CORRECCION' && !asistenciaRevisada)))} onClick={modal === 'corregir' ? corregir : cerrar} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${modal === 'corregir' || clase.estado === 'CORRECCION' ? 'bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                  {cerrando ? 'Guardando...' : modal === 'corregir' ? 'Habilitar corrección' : clase.estado === 'CORRECCION' ? 'Guardar corrección' : 'Finalizar y guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
        {modalIncidenciaGrupo && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => !cerrando && setModalIncidenciaGrupo(false)}>
            <form onSubmit={guardarIncidenciaGrupo} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
              <header className="flex items-start justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold text-white">Nota de la clase</h2><p className="mt-1 text-xs text-slate-400">Deja constancia de algo que pasó en esta sesión.</p></div><button type="button" disabled={cerrando} onClick={() => setModalIncidenciaGrupo(false)} className="text-2xl text-slate-400">×</button></header>
              <div className="space-y-4 p-5">
                <label className="block text-sm text-slate-300">Tipo de nota *<select required value={incidenciaGrupo.tipo} onChange={(e) => setIncidenciaGrupo({ ...incidenciaGrupo, tipo: e.target.value, solicita_justificacion: e.target.value === 'SUSPENSION_INSTITUCIONAL' ? incidenciaGrupo.solicita_justificacion : false })} className="input-dark mt-1"><option value="" disabled>Selecciona el tipo</option><optgroup label="Del contexto"><option value="SUSPENSION_INSTITUCIONAL">Actividad o suspensión institucional</option><option value="INFRAESTRUCTURA">Infraestructura, equipo o internet</option><option value="CONTINGENCIA">Clima o contingencia</option></optgroup><optgroup label="Del grupo"><option value="ACADEMICA">Académica</option><option value="DISCIPLINA">Conducta general del grupo</option></optgroup><optgroup label="Urgente"><option value="SEGURIDAD">Seguridad</option></optgroup><optgroup label="Otros"><option value="OTRA">Otra situación</option></optgroup></select></label>
                {incidenciaGrupo.tipo === 'SEGURIDAD' && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200"><b>Notificación inmediata:</b> al guardar, Tutoría y Administración recibirán este aviso sin esperar al cierre de la clase.</div>}
                <label className="block text-sm text-slate-300">Descripción *<textarea required minLength={5} maxLength={2000} rows={4} value={incidenciaGrupo.descripcion} onChange={(e) => setIncidenciaGrupo({ ...incidenciaGrupo, descripcion: e.target.value })} className="input-dark mt-1" placeholder={incidenciaGrupo.tipo === 'DISCIPLINA' ? 'Describe el hecho observable y las acciones realizadas; evita calificativos sobre las personas.' : 'Describe qué ocurrió y qué acción inmediata se tomó.'} /></label>
                <label className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3 text-sm text-slate-200"><input type="checkbox" className="mt-1 accent-emerald-500" checked={incidenciaGrupo.requiere_seguimiento} onChange={(e) => setIncidenciaGrupo({ ...incidenciaGrupo, requiere_seguimiento: e.target.checked })} /><span><b>Notificar al tutor</b><span className="mt-1 block text-xs font-normal text-slate-400">Al cerrar la clase se enviará esta nota al tutor del grupo para seguimiento.</span></span></label>
                {incidenciaGrupo.tipo === 'SUSPENSION_INSTITUCIONAL' && <label className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-sm text-slate-200"><input type="checkbox" className="mt-1 accent-emerald-500" checked={incidenciaGrupo.solicita_justificacion} onChange={(e) => setIncidenciaGrupo({ ...incidenciaGrupo, solicita_justificacion: e.target.checked })} /><span><b>Solicitar justificación colectiva</b><span className="mt-1 block text-xs font-normal text-slate-400">División revisará la solicitud antes de modificar las faltas de esta sesión.</span></span></label>}
              </div>
              <footer className="flex gap-3 border-t border-white/10 px-5 py-4"><button type="button" disabled={cerrando} onClick={() => setModalIncidenciaGrupo(false)} className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-300">Cancelar</button><button disabled={cerrando || !incidenciaGrupo.tipo || incidenciaGrupo.descripcion.trim().length < 5} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500">{cerrando ? 'Guardando…' : 'Guardar nota'}</button></footer>
            </form>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
