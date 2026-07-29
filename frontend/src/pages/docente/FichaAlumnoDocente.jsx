import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const FORM_INICIAL = {
  tipo: 'OBSERVACION', titulo: '', detalle: '', calificacion: '',
  estado: 'REGISTRADO', fecha_revision: '',
};
const PESTANAS = [
  ['RESUMEN', 'Resumen'],
  ['PENDIENTES', 'Pendientes'],
  ['OBSERVACION', 'Observaciones'],
  ['CALIFICACION', 'Calificaciones'],
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
  const [form, setForm] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [pestana, setPestana] = useState('RESUMEN');
  const [modalRegistro, setModalRegistro] = useState(false);
  const [modalAtencion, setModalAtencion] = useState(null);
  const [guardandoAtencion, setGuardandoAtencion] = useState(false);
  const [periodoFecha, setPeriodoFecha] = useState('TODOS');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get(`/docencia/seguimiento/${cargaId}/alumnos/${alumnoId}`);
      setDatos(data);
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
      await api.post(`/docencia/seguimiento/${cargaId}/alumnos/${alumnoId}/registros`, {
        ...form,
        calificacion: form.tipo === 'CALIFICACION' ? Number(form.calificacion) : null,
        fecha_revision: ['ACUERDO', 'TUTORIA'].includes(form.tipo) && form.fecha_revision
          ? form.fecha_revision : null,
        estado: ['ACUERDO', 'TUTORIA'].includes(form.tipo) ? 'PENDIENTE' : 'REGISTRADO',
      });
      setForm(FORM_INICIAL);
      setModalRegistro(false);
      setPestana(form.tipo);
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
        estado: 'ATENDIDO',
        resultado_atencion: modalAtencion.resultado.trim(),
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

  const calificaciones = datos?.registros.filter((r) => r.tipo === 'CALIFICACION' && r.calificacion != null) || [];
  const promedio = calificaciones.length
    ? (calificaciones.reduce((total, r) => total + r.calificacion, 0) / calificaciones.length).toFixed(1)
    : '—';
  const pendientes = datos?.registros.filter((r) => ['ACUERDO', 'TUTORIA'].includes(r.tipo) && r.estado === 'PENDIENTE') || [];
  const pendientesFiltrados = registrosFiltrados.filter((r) => (
    ['ACUERDO', 'TUTORIA'].includes(r.tipo) && r.estado === 'PENDIENTE'
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
  const actividadReciente = registrosFiltrados.filter((r) => r.estado !== 'PENDIENTE').slice(0, 4);

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
      {r.fecha_revision && (
        <p className="mt-2 text-xs font-medium text-blue-400">Revisar el {fechaTexto(`${r.fecha_revision}T12:00:00`, false)}</p>
      )}
      {['ACUERDO', 'TUTORIA'].includes(r.tipo) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-xs ${r.estado === 'PENDIENTE' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{r.estado}</span>
          {r.estado === 'PENDIENTE' && <button onClick={() => setModalAtencion({ registro: r, resultado: '' })} className="text-xs font-semibold text-emerald-400">Registrar atención</button>}
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
          {r.fecha_revision && <p className={`shrink-0 text-xs font-medium ${vencido ? 'text-red-300' : 'text-slate-500'}`}>{fechaTexto(`${r.fecha_revision}T12:00:00`, false)}</p>}
        </div>
        <button onClick={() => setModalAtencion({ registro: r, resultado: '' })} className="mt-3 text-xs font-semibold text-emerald-400 hover:text-emerald-300">Registrar atención →</button>
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
                {(fechaDesde || fechaHasta || periodoFecha !== 'TODOS') && <button onClick={() => { setFechaDesde(''); setFechaHasta(''); setPeriodoFecha('TODOS'); }} className="pb-2 text-xs font-semibold text-emerald-400">Limpiar filtros</button>}
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
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {datos.asistencias
                      .filter((a) => (!fechaDesde || a.fecha >= fechaDesde) && (!fechaHasta || a.fecha <= fechaHasta))
                      .map((a) => <div key={a.fecha} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="flex justify-between gap-3"><span className="text-sm text-slate-300">{fechaTexto(`${a.fecha}T12:00:00`, false)}</span><span className="text-xs font-semibold text-slate-400">{a.estado}</span></div>{a.observacion && <p className="mt-1 text-xs text-slate-500">{a.observacion}</p>}</div>)}
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
                <h2 className="font-semibold text-white">Registrar atención</h2>
                <p className="mt-1 text-xs text-slate-400">Documenta el resultado antes de cerrar el pendiente.</p>
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
              <p className="text-xs text-slate-500">Al guardar, el caso pasará a atendido y permanecerá visible en su historial.</p>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" disabled={guardandoAtencion} onClick={() => setModalAtencion(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancelar</button>
              <button disabled={guardandoAtencion || modalAtencion.resultado.trim().length < 3} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {guardandoAtencion ? 'Guardando…' : 'Guardar y marcar atendido'}
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
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, calificacion: '', fecha_revision: '' })} className="input-dark mt-1">
                  <option value="OBSERVACION">Observación docente</option>
                  <option value="CALIFICACION">Calificación parcial</option>
                  <option value="ACUERDO">Acuerdo con el alumno</option>
                  <option value="TUTORIA">Requiere tutoría</option>
                </select>
              </label>
              <label className="mt-3 block text-sm text-slate-300">Título
                <input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="input-dark mt-1" placeholder={form.tipo === 'CALIFICACION' ? 'Ej. Primer parcial' : 'Resumen breve'} />
              </label>
              {form.tipo === 'CALIFICACION' && <label className="mt-3 block text-sm text-slate-300">Calificación
                <input required type="number" min="0" max="10" step="0.1" value={form.calificacion} onChange={(e) => setForm({ ...form, calificacion: e.target.value })} className="input-dark mt-1" />
              </label>}
              {['ACUERDO', 'TUTORIA'].includes(form.tipo) && <label className="mt-3 block text-sm text-slate-300">Fecha de revisión
                <input required type="date" value={form.fecha_revision} onChange={(e) => setForm({ ...form, fecha_revision: e.target.value })} className="input-dark mt-1" />
              </label>}
              <label className="mt-3 block text-sm text-slate-300">Detalle
                <textarea value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} rows={4} className="input-dark mt-1" placeholder="Evidencia, acción acordada o contexto académico" />
              </label>
            </div>
            <footer className="flex gap-3 border-t border-white/10 px-5 py-4">
              <button type="button" onClick={() => setModalRegistro(false)} className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-300">Cancelar</button>
              <button disabled={guardando} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar'}</button>
            </footer>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}
