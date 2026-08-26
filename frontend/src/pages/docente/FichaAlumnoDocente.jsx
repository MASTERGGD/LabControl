import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import ContextoAlumnoDocente from '../../components/ContextoAlumnoDocente';
import api from '../../hooks/useApi';

const FORM_INICIAL = {
  tipo: 'OBSERVACION', titulo: '', detalle: '', calificacion: '',
  estado: 'REGISTRADO', fecha_limite: '', fecha_revision: '', categoria_reporte: 'ACADEMICO',
  prioridad_reporte: 'MEDIA', confidencial: false,
};
const PESTANAS = [
  ['RESUMEN', 'Resumen'],
  ['PENDIENTES', 'Pendientes'],
  ['OBSERVACION', 'Observaciones'],
  ['ACUERDO', 'Acuerdos'],
  ['TUTORIA', 'Tutoría'],
  ['ASISTENCIA', 'Asistencia'],
];

const fechaTexto = (valor, incluirHora = true) => {
  if (!valor) return '—';
  const opciones = incluirHora
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' };
  return new Intl.DateTimeFormat('es-MX', opciones).format(new Date(valor));
};

export default function FichaAlumnoDocente() {
  const { cargaId, alumnoId } = useParams();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [contexto, setContexto] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [pestana, setPestana] = useState('RESUMEN');
  const [modalRegistro, setModalRegistro] = useState(false);
  const [modalAtencion, setModalAtencion] = useState(null);
  const [guardandoAtencion, setGuardandoAtencion] = useState(false);
  const [periodoFecha, setPeriodoFecha] = useState('TODOS');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [estadoAsistencia, setEstadoAsistencia] = useState('TODOS');
  const [paginaAsistencia, setPaginaAsistencia] = useState(1);

  const cargar = useCallback(async () => {
    try {
      const [fichaRes, contextoRes] = await Promise.all([
        api.get(`/docencia/seguimiento/${cargaId}/alumnos/${alumnoId}`),
        api.get(`/docencia/seguimiento/${cargaId}/alumnos/${alumnoId}/contexto`),
      ]);
      setDatos(fichaRes.data);
      setContexto(contextoRes.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar la ficha del alumno.');
    }
  }, [cargaId, alumnoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const { data } = await api.post(`/docencia/seguimiento/${cargaId}/alumnos/${alumnoId}/registros`, {
        ...form,
        calificacion: form.tipo === 'CALIFICACION' ? Number(form.calificacion) : null,
        fecha_limite: form.tipo === 'ACUERDO' && form.fecha_limite ? form.fecha_limite : null,
        fecha_revision: ['ACUERDO', 'TUTORIA'].includes(form.tipo) && form.fecha_revision
          ? form.fecha_revision : null,
        estado: ['ACUERDO', 'TUTORIA'].includes(form.tipo) ? 'PENDIENTE' : 'REGISTRADO',
      });
      setForm(FORM_INICIAL);
      setModalRegistro(false);
      setPestana(form.tipo);
      setMensaje(data.mensaje || 'Seguimiento registrado.');
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar el seguimiento.');
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSeguimiento = async (e) => {
    e.preventDefault();
    if (!modalAtencion?.resultado.trim()) return;
    setGuardandoAtencion(true);
    try {
      await api.patch(`/docencia/seguimiento/registros/${modalAtencion.registro.id}`, {
        estado: modalAtencion.estado,
        resultado_atencion: modalAtencion.resultado.trim(),
        fecha_limite: modalAtencion.estado === 'REPROGRAMADO' ? modalAtencion.fecha_limite : null,
        fecha_revision: modalAtencion.estado === 'REPROGRAMADO' ? modalAtencion.fecha_revision : null,
      });
      setModalAtencion(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo actualizar el seguimiento.');
    } finally {
      setGuardandoAtencion(false);
    }
  };

  const registrosFiltrados = useMemo(() => {
    if (!datos) return [];
    const ahora = new Date();
    const limite30 = new Date(ahora);
    limite30.setDate(limite30.getDate() - 30);
    return datos.registros.filter((registro) => {
      const fecha = new Date(registro.creado_en);
      if (periodoFecha === '30_DIAS' && fecha < limite30) return false;
      if (fechaDesde && fecha < new Date(`${fechaDesde}T00:00:00`)) return false;
      if (fechaHasta && fecha > new Date(`${fechaHasta}T23:59:59`)) return false;
      return true;
    });
  }, [datos, periodoFecha, fechaDesde, fechaHasta]);

  const asistenciasFiltradas = useMemo(() => {
    if (!datos) return [];
    const ahora = new Date();
    const limite30 = new Date(ahora);
    limite30.setDate(limite30.getDate() - 30);
    return datos.asistencias.filter((asistencia) => {
      const fecha = new Date(`${asistencia.fecha}T12:00:00`);
      if (periodoFecha === '30_DIAS' && fecha < limite30) return false;
      if (fechaDesde && asistencia.fecha < fechaDesde) return false;
      if (fechaHasta && asistencia.fecha > fechaHasta) return false;
      if (estadoAsistencia !== 'TODOS' && asistencia.estado !== estadoAsistencia) return false;
      return true;
    });
  }, [datos, periodoFecha, fechaDesde, fechaHasta, estadoAsistencia]);

  useEffect(() => { setPaginaAsistencia(1); }, [periodoFecha, fechaDesde, fechaHasta, estadoAsistencia, alumnoId, cargaId]);

  const asistenciasPorPagina = 10;
  const totalPaginasAsistencia = Math.max(1, Math.ceil(asistenciasFiltradas.length / asistenciasPorPagina));
  const asistenciasVisibles = asistenciasFiltradas.slice(
    (paginaAsistencia - 1) * asistenciasPorPagina,
    paginaAsistencia * asistenciasPorPagina,
  );
  const resumenAsistenciaFiltrada = ['PRESENTE', 'FALTA', 'RETARDO', 'JUSTIFICADA'].reduce((resumen, estado) => ({
    ...resumen,
    [estado]: asistenciasFiltradas.filter((asistencia) => asistencia.estado === estado).length,
  }), {});

  const calificaciones = datos?.registros.filter((r) => r.tipo === 'CALIFICACION' && r.calificacion != null) || [];
  const promedio = calificaciones.length
    ? (calificaciones.reduce((total, r) => total + r.calificacion, 0) / calificaciones.length).toFixed(1)
    : '—';
  const estadosActivos = ['PENDIENTE', 'REPROGRAMADO'];
  const pendientes = datos?.registros.filter((r) => ['ACUERDO', 'TUTORIA'].includes(r.tipo) && estadosActivos.includes(r.estado)) || [];
  const pendientesFiltrados = registrosFiltrados.filter((r) => (
    ['ACUERDO', 'TUTORIA'].includes(r.tipo) && estadosActivos.includes(r.estado)
  ));
  const registrosPestana = pestana === 'RESUMEN'
    ? registrosFiltrados
    : pestana === 'PENDIENTES'
      ? pendientesFiltrados
      : registrosFiltrados.filter((r) => r.tipo === pestana);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const pendientesOrdenados = [...pendientesFiltrados].sort((a, b) => {
    if (!a.fecha_revision) return 1;
    if (!b.fecha_revision) return -1;
    return a.fecha_revision.localeCompare(b.fecha_revision);
  });
  const pendientesVencidos = pendientes.filter((r) => r.fecha_revision && r.fecha_revision < hoyISO);
  const pendientesHoy = pendientes.filter((r) => r.fecha_revision === hoyISO);
  const actividadReciente = registrosFiltrados.filter((r) => !estadosActivos.includes(r.estado)).slice(0, 4);

  const tarjetaRegistro = (r) => (
    <article key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-bold text-emerald-400">{r.tipo}</span>
          <h3 className="font-semibold text-white">{r.titulo}</h3>
        </div>
        <div className="shrink-0 text-right">
          {r.calificacion != null && <p className="text-xl font-bold text-white">{r.calificacion}</p>}
          <p className="text-xs text-slate-500">{fechaTexto(r.creado_en)}</p>
        </div>
      </div>
      {r.detalle && <p className="mt-2 text-sm text-slate-400">{r.detalle}</p>}
      {r.resultado_atencion && <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"><b>Resultado:</b> {r.resultado_atencion}</p>}
      {r.fecha_limite && <p className="mt-2 text-xs text-slate-400">Compromiso del alumno: {fechaTexto(`${r.fecha_limite}T12:00:00`, false)}</p>}
      {r.fecha_revision && (
        <p className="mt-2 text-xs font-medium text-blue-400">Revisar el {fechaTexto(`${r.fecha_revision}T12:00:00`, false)}</p>
      )}
      {['ACUERDO', 'TUTORIA'].includes(r.tipo) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-xs ${estadosActivos.includes(r.estado) ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{r.estado.replaceAll('_', ' ')}</span>
          {estadosActivos.includes(r.estado) && r.tipo === 'ACUERDO' && <button onClick={() => setModalAtencion({ registro: r, estado: 'CUMPLIDO', resultado: '', fecha_limite: '', fecha_revision: '' })} className="text-xs font-semibold text-emerald-400">Registrar resultado</button>}
          {r.estado === 'PENDIENTE' && r.tipo === 'TUTORIA' && <span className="text-xs text-blue-300">Enviado al tutor del grupo</span>}
        </div>
      )}
    </article>
  );

  const tarjetaPendiente = (r) => {
    const vencido = r.fecha_revision && r.fecha_revision < hoyISO;
    const paraHoy = r.fecha_revision === hoyISO;
    return (
      <article key={r.id} className={`rounded-xl border p-4 ${vencido ? 'border-red-500/30 bg-red-500/[0.07]' : 'border-amber-500/20 bg-amber-500/[0.06]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-amber-300">{r.tipo}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${vencido ? 'bg-red-500/15 text-red-300' : paraHoy ? 'bg-amber-500/15 text-amber-200' : 'bg-white/5 text-slate-400'}`}>
                {vencido ? 'VENCIDO' : paraHoy ? 'PARA HOY' : 'PENDIENTE'}
              </span>
            </div>
            <h3 className="mt-1 font-semibold text-white">{r.titulo}</h3>
            {r.detalle && <p className="mt-1 line-clamp-2 text-sm text-slate-400">{r.detalle}</p>}
          </div>
          <div className="shrink-0 text-right text-xs">
            {r.fecha_limite && <p className="text-slate-500">Límite: {fechaTexto(`${r.fecha_limite}T12:00:00`, false)}</p>}
            {r.fecha_revision && <p className={`font-medium ${vencido ? 'text-red-300' : 'text-slate-500'}`}>Revisión: {fechaTexto(`${r.fecha_revision}T12:00:00`, false)}</p>}
          </div>
        </div>
        {r.tipo === 'ACUERDO'
          ? <button onClick={() => setModalAtencion({ registro: r, estado: 'CUMPLIDO', resultado: '', fecha_limite: '', fecha_revision: '' })} className="mt-3 text-xs font-semibold text-emerald-400 hover:text-emerald-300">Registrar resultado →</button>
          : <p className="mt-3 text-xs font-semibold text-blue-300">Pendiente de atención por el tutor →</p>}
      </article>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <button onClick={() => navigate(`/docente/seguimiento?carga=${cargaId}`)} className="mb-2 text-sm text-slate-400 hover:text-white">← Volver al grupo</button>
            <h1 className="text-2xl font-bold text-white">{datos?.alumno.nombre || 'Ficha individual'}</h1>
            {datos && <p className="text-sm text-slate-400">{datos.alumno.matricula} · {datos.carga.actividad_nombre} · {datos.carga.grupo}</p>}
          </div>
          <button onClick={() => setModalRegistro(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">+ Registrar seguimiento</button>
        </div>

        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {mensaje && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{mensaje}</div>}
        {datos && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ['Asistencia', `${datos.resumen.porcentaje_asistencia}%`],
                ['Faltas', datos.resumen.falta],
                ['Retardos', datos.resumen.retardo],
                ['Promedio', promedio],
                ['Pendientes', pendientes.length],
              ].map(([label, value]) => <div key={label} className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{value}</p><p className="text-xs text-slate-400">{label}</p></div>)}
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-white">Vista contextual institucional</h2>
                  <p className="mt-1 text-xs text-slate-400">Solo muestra señales necesarias para colaborar; no incluye diagnósticos, notas privadas ni información de otras materias.</p>
                </div>
                <ContextoAlumnoDocente
                  cargaId={cargaId}
                  alumnoId={alumnoId}
                  nombre={datos.alumno.nombre}
                  contexto={contexto}
                  onEnviada={(data) => { setMensaje(data.mensaje); cargar(); }}
                />
              </div>
              {contexto?.tutor_asignado && <p className="mt-3 text-xs text-slate-500">Tutor asignado: {contexto.tutor_asignado}</p>}
            </section>

            {datos.alertas?.length > 0 && (
              <section className={`rounded-2xl border p-4 ${datos.alertas.some((a) => a.nivel === 'ALTO') ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                <h2 className={`font-semibold ${datos.alertas.some((a) => a.nivel === 'ALTO') ? 'text-red-300' : 'text-amber-300'}`}>Requiere atención</h2>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {datos.alertas.map((alerta) => <div key={alerta.tipo}><p className="text-sm font-semibold text-white">{alerta.mensaje}</p><p className="text-xs text-slate-300">{alerta.accion}</p></div>)}
                </div>
              </section>
            )}

            <section className="glass overflow-hidden rounded-2xl">
              <div className="overflow-x-auto border-b border-white/10 px-3 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max gap-1">
                  {PESTANAS.map(([valor, label]) => {
                    const cantidad = valor === 'ASISTENCIA'
                      ? datos.asistencias.length
                      : valor === 'RESUMEN'
                        ? null
                        : valor === 'PENDIENTES'
                          ? pendientes.length
                        : datos.registros.filter((r) => r.tipo === valor).length;
                    return (
                      <button key={valor} onClick={() => setPestana(valor)} className={`rounded-t-xl px-4 py-3 text-sm font-semibold ${pestana === valor ? 'border-b-2 border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-white/5'}`}>
                        {label}{cantidad != null && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{cantidad}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-end">
                <label className="text-xs font-semibold text-slate-400">Periodo
                  <select value={periodoFecha} onChange={(e) => setPeriodoFecha(e.target.value)} className="input-dark mt-1">
                    <option value="TODOS">Todo el periodo</option>
                    <option value="30_DIAS">Últimos 30 días</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-400">Desde
                  <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="input-dark mt-1" />
                </label>
                <label className="text-xs font-semibold text-slate-400">Hasta
                  <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="input-dark mt-1" />
                </label>
                {pestana === 'ASISTENCIA' && <label className="text-xs font-semibold text-slate-400">Estado
                  <select value={estadoAsistencia} onChange={(e) => setEstadoAsistencia(e.target.value)} className="input-dark mt-1">
                    <option value="TODOS">Todos los estados</option>
                    <option value="PRESENTE">Presentes</option>
                    <option value="FALTA">Faltas</option>
                    <option value="RETARDO">Retardos</option>
                    <option value="JUSTIFICADA">Justificadas</option>
                  </select>
                </label>}
                {(fechaDesde || fechaHasta || periodoFecha !== 'TODOS' || estadoAsistencia !== 'TODOS') && <button onClick={() => { setFechaDesde(''); setFechaHasta(''); setPeriodoFecha('TODOS'); setEstadoAsistencia('TODOS'); }} className="pb-2 text-xs font-semibold text-emerald-400">Limpiar filtros</button>}
              </div>

              <div className="p-4 sm:p-5">
                {pestana === 'RESUMEN' && (
                  <div className="space-y-6">
                    <section>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="font-semibold text-white">Requiere atención</h2>
                          <p className="mt-0.5 text-xs text-slate-500">Lo más importante para dar continuidad al estudiante.</p>
                        </div>
                        {!!pendientes.length && <button onClick={() => setPestana('PENDIENTES')} className="text-xs font-semibold text-emerald-400">Ver todos ({pendientes.length}) →</button>}
                      </div>
                      {!!pendientes.length && (
                        <div className="mb-3 flex flex-wrap gap-2 text-xs">
                          {!!pendientesVencidos.length && <span className="rounded-full bg-red-500/15 px-3 py-1.5 font-semibold text-red-300">{pendientesVencidos.length} vencido{pendientesVencidos.length === 1 ? '' : 's'}</span>}
                          {!!pendientesHoy.length && <span className="rounded-full bg-amber-500/15 px-3 py-1.5 font-semibold text-amber-300">{pendientesHoy.length} para hoy</span>}
                          <span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-400">{pendientes.length} abierto{pendientes.length === 1 ? '' : 's'}</span>
                        </div>
                      )}
                      <div className="grid gap-3 lg:grid-cols-3">
                        {pendientesOrdenados.slice(0, 3).map(tarjetaPendiente)}
                        {!pendientes.length && <p className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-400 lg:col-span-3">No hay acuerdos ni tutorías pendientes.</p>}
                      </div>
                    </section>

                    <section className="border-t border-white/10 pt-5">
                      <div className="mb-3">
                        <h2 className="font-semibold text-white">Últimos movimientos</h2>
                        <p className="mt-0.5 text-xs text-slate-500">Registros realizados; no repite los casos pendientes.</p>
                      </div>
                      <ol className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.02]">
                        {actividadReciente.map((r) => (
                          <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm text-slate-300"><span className="mr-2 text-[11px] font-bold text-emerald-400">{r.tipo}</span>{r.titulo}</p>
                              {r.detalle && <p className="mt-0.5 truncate text-xs text-slate-500">{r.detalle}</p>}
                            </div>
                            <time className="shrink-0 text-xs text-slate-500">{fechaTexto(r.creado_en)}</time>
                          </li>
                        ))}
                        {!actividadReciente.length && <li className="px-4 py-8 text-center text-sm text-slate-400">Todavía no hay movimientos concluidos en estas fechas.</li>}
                      </ol>
                    </section>
                  </div>
                )}
                {pestana === 'ASISTENCIA' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-400">{resumenAsistenciaFiltrada.PRESENTE || 0} presentes</span>
                      <span className="rounded-full bg-red-500/10 px-3 py-1.5 font-semibold text-red-400">{resumenAsistenciaFiltrada.FALTA || 0} faltas</span>
                      <span className="rounded-full bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-400">{resumenAsistenciaFiltrada.RETARDO || 0} retardos</span>
                      <span className="rounded-full bg-blue-500/10 px-3 py-1.5 font-semibold text-blue-400">{resumenAsistenciaFiltrada.JUSTIFICADA || 0} justificadas</span>
                      <span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-400">{asistenciasFiltradas.length} sesiones</span>
                    </div>

                    <div className="hidden overflow-hidden rounded-xl border border-white/10 md:block">
                      <div className="grid grid-cols-[150px_130px_140px_minmax(0,1fr)] bg-white/[0.035] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <span>Fecha</span><span>Horario</span><span>Estado</span><span>Detalle</span>
                      </div>
                      <div className="divide-y divide-white/10">
                        {asistenciasVisibles.map((asistencia) => (
                          <div key={asistencia.clase_id || `${asistencia.fecha}-${asistencia.hora_inicio}`} className="grid grid-cols-[150px_130px_140px_minmax(0,1fr)] items-center px-4 py-3 text-sm hover:bg-white/[0.025]">
                            <span className="font-medium text-slate-300">{fechaTexto(`${asistencia.fecha}T12:00:00`, false)}</span>
                            <span className="text-slate-400">{asistencia.hora_inicio && asistencia.hora_fin ? `${asistencia.hora_inicio}–${asistencia.hora_fin}` : '—'}</span>
                            <span><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${asistencia.estado === 'PRESENTE' ? 'bg-emerald-500/10 text-emerald-400' : asistencia.estado === 'FALTA' ? 'bg-red-500/10 text-red-400' : asistencia.estado === 'RETARDO' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>{asistencia.estado}</span></span>
                            <span className="truncate text-slate-500" title={asistencia.observacion || ''}>{asistencia.observacion || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 md:hidden">
                      {asistenciasVisibles.map((asistencia) => (
                        <article key={asistencia.clase_id || `${asistencia.fecha}-${asistencia.hora_inicio}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div><p className="text-sm font-medium text-slate-300">{fechaTexto(`${asistencia.fecha}T12:00:00`, false)}</p><p className="mt-0.5 text-xs text-slate-500">{asistencia.hora_inicio && asistencia.hora_fin ? `${asistencia.hora_inicio}–${asistencia.hora_fin}` : 'Horario no disponible'}</p></div>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${asistencia.estado === 'PRESENTE' ? 'bg-emerald-500/10 text-emerald-400' : asistencia.estado === 'FALTA' ? 'bg-red-500/10 text-red-400' : asistencia.estado === 'RETARDO' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>{asistencia.estado}</span>
                          </div>
                          {asistencia.observacion && <p className="mt-2 border-t border-white/10 pt-2 text-xs text-slate-400">{asistencia.observacion}</p>}
                        </article>
                      ))}
                    </div>

                    {!asistenciasFiltradas.length && <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-400">No hay sesiones con los filtros seleccionados.</div>}
                    {asistenciasFiltradas.length > asistenciasPorPagina && (
                      <div className="flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                        <span>Mostrando {(paginaAsistencia - 1) * asistenciasPorPagina + 1}–{Math.min(paginaAsistencia * asistenciasPorPagina, asistenciasFiltradas.length)} de {asistenciasFiltradas.length}</span>
                        <div className="flex items-center gap-2">
                          <button disabled={paginaAsistencia === 1} onClick={() => setPaginaAsistencia((pagina) => Math.max(1, pagina - 1))} className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-300 disabled:opacity-40">Anterior</button>
                          <span className="px-2">Página {paginaAsistencia} de {totalPaginasAsistencia}</span>
                          <button disabled={paginaAsistencia === totalPaginasAsistencia} onClick={() => setPaginaAsistencia((pagina) => Math.min(totalPaginasAsistencia, pagina + 1))} className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-300 disabled:opacity-40">Siguiente</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!['RESUMEN', 'ASISTENCIA'].includes(pestana) && (
                  <div className="space-y-3">
                    {pestana === 'PENDIENTES' ? registrosPestana.map(tarjetaPendiente) : registrosPestana.map(tarjetaRegistro)}
                    {!registrosPestana.length && <p className="py-10 text-center text-sm text-slate-400">No hay registros en esta categoría y rango de fechas.</p>}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {modalAtencion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => !guardandoAtencion && setModalAtencion(null)}>
          <form onSubmit={cerrarSeguimiento} onMouseDown={(e) => e.stopPropagation()} className="glass w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl">
            <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">Revisar acuerdo</h2>
                <p className="mt-1 text-xs text-slate-400">Registra qué ocurrió y conserva la trazabilidad.</p>
              </div>
              <button type="button" disabled={guardandoAtencion} onClick={() => setModalAtencion(null)} className="text-2xl text-slate-400">×</button>
            </header>
            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                <p className="text-xs font-bold text-amber-300">{modalAtencion.registro.tipo}</p>
                <p className="mt-1 font-semibold text-white">{modalAtencion.registro.titulo}</p>
                {modalAtencion.registro.detalle && <p className="mt-1 text-sm text-slate-400">{modalAtencion.registro.detalle}</p>}
              </div>
              <label className="block text-sm text-slate-300">
                Resultado del acuerdo *
                <select value={modalAtencion.estado} onChange={(e) => setModalAtencion({ ...modalAtencion, estado: e.target.value })} className="input-dark mt-1">
                  <option value="CUMPLIDO">Cumplido</option>
                  <option value="CUMPLIDO_PARCIAL">Cumplido parcialmente</option>
                  <option value="NO_CUMPLIDO">No cumplido</option>
                  <option value="REPROGRAMADO">Reprogramar seguimiento</option>
                  <option value="CERRADO">Cerrar por otra causa</option>
                </select>
              </label>
              {modalAtencion.estado === 'REPROGRAMADO' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-300">Nueva fecha límite *
                  <input required type="date" value={modalAtencion.fecha_limite} onChange={(e) => setModalAtencion({ ...modalAtencion, fecha_limite: e.target.value })} className="input-dark mt-1" />
                </label>
                <label className="text-sm text-slate-300">Nueva revisión *
                  <input required type="date" min={modalAtencion.fecha_limite} value={modalAtencion.fecha_revision} onChange={(e) => setModalAtencion({ ...modalAtencion, fecha_revision: e.target.value })} className="input-dark mt-1" />
                </label>
              </div>}
              <label className="block text-sm text-slate-300">
                Resultado o acuerdo alcanzado *
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={4}
                  autoFocus
                  value={modalAtencion.resultado}
                  onChange={(e) => setModalAtencion({ ...modalAtencion, resultado: e.target.value })}
                  className="input-dark mt-1"
                  placeholder="Ej. Se habló con el estudiante y se acordó revisar su avance el próximo viernes."
                />
              </label>
              <p className="text-xs text-slate-500">El resultado permanecerá en el historial. Reprogramar conserva el acuerdo pendiente con nuevas fechas.</p>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" disabled={guardandoAtencion} onClick={() => setModalAtencion(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancelar</button>
              <button disabled={guardandoAtencion || modalAtencion.resultado.trim().length < 3} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {guardandoAtencion ? 'Guardando…' : 'Guardar resultado'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {modalRegistro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setModalRegistro(false)}>
          <form onSubmit={guardar} onMouseDown={(e) => e.stopPropagation()} className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl shadow-2xl">
            <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div><h2 className="font-semibold text-white">Registrar seguimiento</h2><p className="mt-1 text-xs text-slate-400">Registra hechos y acuerdos concretos.</p></div>
              <button type="button" onClick={() => setModalRegistro(false)} className="text-2xl text-slate-400">×</button>
            </header>
            <div className="p-5">
              <label className="block text-sm text-slate-300">Tipo
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, calificacion: '', fecha_limite: '', fecha_revision: '' })} className="input-dark mt-1">
                  <option value="OBSERVACION">Observación docente</option>
                  <option value="ACUERDO">Acuerdo con el alumno</option>
                  <option value="TUTORIA">Enviar reporte al tutor del grupo</option>
                </select>
              </label>
              <label className="mt-3 block text-sm text-slate-300">Título
                <input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="input-dark mt-1" placeholder={form.tipo === 'CALIFICACION' ? 'Ej. Primer parcial' : 'Resumen breve'} />
              </label>
              {form.tipo === 'CALIFICACION' && <label className="mt-3 block text-sm text-slate-300">Calificación
                <input required type="number" min="0" max="10" step="0.1" value={form.calificacion} onChange={(e) => setForm({ ...form, calificacion: e.target.value })} className="input-dark mt-1" />
              </label>}
              {form.tipo === 'TUTORIA' && (
                <div className="mt-3 space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3">
                  <p className="text-xs text-blue-200">El reporte se enviará al tutor asignado al grupo. Si aún no existe tutor, llegará al Responsable de Tutoría.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-slate-300">Categoría
                      <select value={form.categoria_reporte} onChange={(e) => setForm({ ...form, categoria_reporte: e.target.value })} className="input-dark mt-1">
                        <option value="ACADEMICO">Académico</option>
                        <option value="ASISTENCIA">Asistencia</option>
                        <option value="CONDUCTA">Conducta</option>
                        <option value="PERSONAL">Personal</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </label>
                    <label className="text-sm text-slate-300">Prioridad
                      <select value={form.prioridad_reporte} onChange={(e) => setForm({ ...form, prioridad_reporte: e.target.value })} className="input-dark mt-1">
                        <option value="BAJA">Baja</option>
                        <option value="MEDIA">Media</option>
                        <option value="ALTA">Alta</option>
                      </select>
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={form.confidencial} onChange={(e) => setForm({ ...form, confidencial: e.target.checked })} />
                    Contiene información sensible
                  </label>
                </div>
              )}
              {form.tipo === 'ACUERDO' && <label className="mt-3 block text-sm text-slate-300">Fecha límite del compromiso
                <input required type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} className="input-dark mt-1" />
              </label>}
              {['ACUERDO', 'TUTORIA'].includes(form.tipo) && <label className="mt-3 block text-sm text-slate-300">Fecha de revisión
                <input required type="date" min={form.tipo === 'ACUERDO' ? form.fecha_limite : undefined} value={form.fecha_revision} onChange={(e) => setForm({ ...form, fecha_revision: e.target.value })} className="input-dark mt-1" />
              </label>}
              <label className="mt-3 block text-sm text-slate-300">Detalle
                <textarea value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} rows={4} className="input-dark mt-1" placeholder="Evidencia, acción acordada o contexto académico" />
              </label>
            </div>
            <footer className="flex gap-3 border-t border-white/10 px-5 py-4">
              <button type="button" onClick={() => setModalRegistro(false)} className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-300">Cancelar</button>
              <button disabled={guardando} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Guardando...' : form.tipo === 'TUTORIA' ? 'Enviar al tutor' : 'Guardar'}</button>
            </footer>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}
