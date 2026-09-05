import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import SelectDark from '../../components/SelectDark';
import api from '../../hooks/useApi';
import { usePeriodo } from '../../context/PeriodoContext';
import { formatAsistencia, formatNombre } from '../../utils/presentacion';

const fechaLocal = (fecha) => [
  fecha.getFullYear(),
  String(fecha.getMonth() + 1).padStart(2, '0'),
  String(fecha.getDate()).padStart(2, '0'),
].join('-');
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fechaCorta = (fecha) => new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${fecha}T12:00:00Z`));

export default function SeguimientoGrupos() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { periodo: periodoSeleccionado, periodoActual, esCerrado, seleccionarPeriodo } = usePeriodo();
  const [cargas, setCargas] = useState([]);
  const [cargandoCargas, setCargandoCargas] = useState(true);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [justificacion, setJustificacion] = useState(null);
  const seleccion = params.get('carga') || '';
  const periodoId = periodoSeleccionado?.id ? String(periodoSeleccionado.id) : '';
  const esPeriodoActual = periodoSeleccionado?.estado_periodo === 'ACTUAL';

  useEffect(() => {
    if (!periodoId) return;
    setCargandoCargas(true);
    setDatos(null);
    api.get('/docencia/horario', { params: { periodo_id: periodoId } }).then(({ data }) => {
      const clases = data.filter((c) => c.tipo_actividad === 'CLASE' && c.grupo_academico_id);
      const unicas = Array.from(clases.reduce((mapa, carga) => {
        const materia = carga.materia_id ? `materia:${carga.materia_id}` : `nombre:${carga.actividad_nombre.trim().toLocaleUpperCase('es-MX')}`;
        const clave = `${carga.periodo_id}|${carga.grupo_academico_id}|${materia}`;
        const existente = mapa.get(clave);
        const horario = { dia: carga.dia_semana, inicio: carga.hora_inicio, fin: carga.hora_fin };
        if (existente) existente.horarios.push(horario);
        else mapa.set(clave, { ...carga, horarios: [horario] });
        return mapa;
      }, new Map()).values());
      setCargas(unicas);
      setError('');
      const existe = unicas.some((c) => String(c.id) === seleccion);
      setParams(existe ? { carga: seleccion } : unicas.length ? { carga: String(unicas[0].id) } : {}, { replace: true });
    }).catch(() => {
      setCargas([]);
      setError('No se pudieron cargar tus grupos.');
    }).finally(() => setCargandoCargas(false));
  }, [periodoId]);

  useEffect(() => {
    if (!seleccion) return;
    setDatos(null);
    api.get(`/docencia/seguimiento/${seleccion}`)
      .then(({ data }) => { setDatos(data); setError(''); })
      .catch((err) => setError(err.response?.data?.detail || 'No se pudo cargar el seguimiento.'));
  }, [seleccion]);

  const cargaActual = useMemo(() => cargas.find((c) => String(c.id) === seleccion), [cargas, seleccion]);
  const asistenciaGrupo = formatAsistencia(datos?.promedio_asistencia, datos?.total_clases);

  const exportarConcentrado = async () => {
    try {
      const { data, headers } = await api.get(`/docencia/seguimiento/${seleccion}/exportar.xlsx`, { responseType: 'blob' });
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(data);
      const indicado = headers['content-disposition']?.match(/filename="?([^";]+)"?/i)?.[1];
      enlace.download = indicado || 'concentrado_asistencia.xlsx';
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo generar el concentrado de asistencia.');
    }
  };

  const abrirJustificacion = (alumno) => {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    setJustificacion({
      alumno,
      fecha_inicio: fechaLocal(inicioMes),
      fecha_fin: fechaLocal(hoy),
      motivo: '',
      folio: '',
      documento_validado: false,
      faltas: [],
      seleccionadas: [],
      consultado: false,
      cargando: false,
      guardando: false,
      error: '',
    });
  };

  const buscarFaltas = async () => {
    if (!justificacion.fecha_inicio || !justificacion.fecha_fin) return;
    setJustificacion((actual) => ({ ...actual, cargando: true, error: '' }));
    try {
      const { data } = await api.get(
        `/docencia/seguimiento/${seleccion}/alumnos/${justificacion.alumno.alumno_id}/faltas`,
        { params: {
          fecha_inicio: justificacion.fecha_inicio,
          fecha_fin: justificacion.fecha_fin,
        } },
      );
      setJustificacion((actual) => ({
        ...actual,
        faltas: data.faltas,
        seleccionadas: data.faltas.map((falta) => falta.asistencia_id),
        consultado: true,
        cargando: false,
      }));
    } catch (err) {
      setJustificacion((actual) => ({
        ...actual,
        faltas: [],
        seleccionadas: [],
        consultado: true,
        cargando: false,
        error: err.response?.data?.detail || 'No se pudieron consultar las faltas.',
      }));
    }
  };

  const alternarFalta = (asistenciaId) => {
    setJustificacion((actual) => ({
      ...actual,
      seleccionadas: actual.seleccionadas.includes(asistenciaId)
        ? actual.seleccionadas.filter((id) => id !== asistenciaId)
        : [...actual.seleccionadas, asistenciaId],
    }));
  };

  const guardarJustificacion = async () => {
    if (justificacion.motivo.trim().length < 5 || !justificacion.seleccionadas.length || !justificacion.documento_validado) return;
    setJustificacion((actual) => ({ ...actual, guardando: true, error: '' }));
    try {
      await api.post(
        `/docencia/seguimiento/${seleccion}/alumnos/${justificacion.alumno.alumno_id}/justificar-faltas`,
        {
          fecha_inicio: justificacion.fecha_inicio,
          fecha_fin: justificacion.fecha_fin,
          asistencia_ids: justificacion.seleccionadas,
          motivo: justificacion.motivo.trim(),
          folio: justificacion.folio.trim() || null,
        },
      );
      const { data } = await api.get(`/docencia/seguimiento/${seleccion}`);
      setDatos(data);
      setJustificacion(null);
      setError('');
    } catch (err) {
      setJustificacion((actual) => ({
        ...actual,
        guardando: false,
        error: err.response?.data?.detail || 'No se pudieron justificar las faltas.',
      }));
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-white">Seguimiento de grupos</h1>
          <p className="text-sm text-slate-400">Consulta asistencias por materia, detecta faltas recurrentes y revisa sesiones anteriores.</p></div>
          {seleccion && <button onClick={exportarConcentrado} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300">Exportar concentrado Excel</button>}
        </div>
        {esCerrado && periodoSeleccionado && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
            <p><b>Solo consulta.</b> {periodoSeleccionado.clave} está cerrado y no admite correcciones.</p>
            {periodoActual && periodoActual.id !== periodoSeleccionado.id && <button type="button" onClick={() => seleccionarPeriodo(periodoActual.id)} className="font-semibold text-emerald-700">Ir a {periodoActual.clave} →</button>}
          </div>
        )}
        <div className="glass rounded-2xl p-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Selecciona la materia y el grupo</label>
          <SelectDark
            value={seleccion}
            disabled={!cargas.length}
            onChange={(value) => setParams({ carga: String(value) })}
            placeholder="Sin materias o grupos asignados"
            className="w-full"
            wrapSelected
            options={cargas.map((c) => ({
              value: c.id,
              label: `${c.actividad_nombre} · ${c.grupo}`,
              wrap: true,
            }))}
          />
          {cargaActual?.horarios?.length > 0 && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
              <p className="text-xs font-semibold text-slate-400">Horario semanal</p>
              <p className="mt-1 text-sm text-slate-300">
                {[...cargaActual.horarios]
                  .sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio))
                  .map((horario) => `${DIAS[horario.dia] || 'Día'} ${horario.inicio}–${horario.fin}`)
                  .join(' · ')}
              </p>
            </div>
          )}
        </div>
        {!cargandoCargas && periodoSeleccionado && !cargas.length && !error && (
          <div className="glass rounded-2xl p-10 text-center">
            <p className="font-semibold text-white">No tienes materias o grupos asignados en este periodo</p>
            <p className="mt-1 text-sm text-slate-500">Cuando se publique tu carga docente, aparecerá aquí automáticamente.</p>
          </div>
        )}
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {datos && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[['Sesiones registradas', datos.total_clases], ['Alumnos', datos.total_alumnos], ['Promedio del grupo', asistenciaGrupo.texto], ['Alumnos en alerta', datos.alumnos_en_alerta]].map(([label, value]) => (
                <div key={label} className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{value}</p><p className="text-xs text-slate-400">{label}</p></div>
              ))}
            </div>
            {datos.clases_sin_cerrar?.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="font-semibold text-amber-300">{datos.clases_sin_cerrar.length === 1 ? 'Tienes una asistencia sin cerrar' : `Tienes ${datos.clases_sin_cerrar.length} asistencias sin cerrar`}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {datos.clases_sin_cerrar.map((clase) => (
                    <button key={clase.id} onClick={() => navigate(`/docente/clase/${clase.id}`)} className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200">
                      {fechaCorta(clase.fecha)} · Continuar cierre
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3 md:hidden">
              <div className="glass rounded-2xl px-4 py-3"><h2 className="font-semibold text-white">{cargaActual?.actividad_nombre}</h2><p className="text-xs text-slate-400">{cargaActual?.grupo} · {cargaActual?.carrera}</p></div>
              {datos.alumnos.map((a) => (
                <article key={a.alumno_id} className="glass rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-semibold text-white">{formatNombre(a.nombre)}</p><p className="text-xs text-slate-500">{a.matricula}</p></div>
                    <span className={`shrink-0 rounded-full bg-slate-500/10 px-3 py-1 text-sm font-bold ${formatAsistencia(a.porcentaje_asistencia, datos.total_clases).clase}`}>{formatAsistencia(a.porcentaje_asistencia, datos.total_clases).texto}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                    {[['Presentes', a.presente, 'text-emerald-400'], ['Faltas', a.falta, 'text-red-400'], ['Retardos', a.retardo, 'text-amber-400'], ['Justif.', a.justificada, 'text-blue-400']].map(([label, value, tone]) => <div key={label} className="rounded-xl bg-white/5 p-2"><b className={`block text-base ${value ? tone : 'text-slate-500'}`}>{value}</b><span className="text-[10px] text-slate-500">{label}</span></div>)}
                  </div>
                  <div className="mt-3 rounded-xl bg-white/[0.025] p-3">
                    {a.alertas?.length ? a.alertas.map((alerta) => <div key={alerta.tipo} className="mb-2 last:mb-0"><p className="text-xs font-semibold text-red-300">{alerta.mensaje}</p><p className="text-xs text-slate-400">{alerta.accion}</p></div>) : <p className="text-xs text-slate-500">—</p>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {esPeriodoActual && a.falta > 0 ? <button onClick={() => abrirJustificacion(a)} className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 text-xs font-semibold text-blue-300">Justificar faltas</button> : <span />}
                    <button onClick={() => navigate(`/docente/seguimiento/${seleccion}/alumno/${a.alumno_id}`)} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-slate-300">Ver ficha →</button>
                  </div>
                </article>
              ))}
            </div>
            <div className="glass hidden overflow-x-auto rounded-2xl md:block">
              <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">{cargaActual?.actividad_nombre}</h2><p className="text-xs text-slate-400">{cargaActual?.grupo} · {cargaActual?.carrera}</p></div>
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">Alumno</th><th>Presente</th><th>Faltas</th><th>Retardos</th><th>Justificadas</th><th>Asistencia</th><th>Alertas y acción sugerida</th><th></th></tr></thead>
                <tbody className="divide-y divide-white/5">
                  {datos.alumnos.map((a) => <tr key={a.alumno_id}>
                    <td className="px-5 py-3"><p className="font-medium text-white">{formatNombre(a.nombre)}</p><p className="text-xs text-slate-500">{a.matricula}</p></td>
                    <td className={a.presente ? 'text-emerald-400' : 'text-slate-500'}>{a.presente}</td><td className={a.falta ? 'text-red-400' : 'text-slate-500'}>{a.falta}</td><td className={a.retardo ? 'text-amber-400' : 'text-slate-500'}>{a.retardo}</td><td className={a.justificada ? 'text-blue-400' : 'text-slate-500'}>{a.justificada}</td>
                    <td className={`font-semibold ${formatAsistencia(a.porcentaje_asistencia, datos.total_clases).clase}`}>{formatAsistencia(a.porcentaje_asistencia, datos.total_clases).corto}</td>
                    <td className="max-w-sm py-3 pr-4">
                      {a.alertas?.length ? (
                        <div className="space-y-2">
                          {a.alertas.map((alerta) => <div key={alerta.tipo}><p className="text-xs font-semibold text-red-300">{alerta.mensaje}</p><p className="text-xs text-slate-400">{alerta.accion}</p></div>)}
                        </div>
                      ) : <span className="text-xs text-slate-500">—</span>}
                    </td>
                    <td className="pr-5">
                      <div className="flex items-center justify-end gap-2">
                        {esPeriodoActual && a.falta > 0 && (
                          <button onClick={() => abrirJustificacion(a)} className="whitespace-nowrap rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20">
                            Justificar faltas
                          </button>
                        )}
                        <button onClick={() => navigate(`/docente/seguimiento/${seleccion}/alumno/${a.alumno_id}`)} className="whitespace-nowrap rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">Ver ficha →</button>
                      </div>
                    </td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams({
                    buscar: `${cargaActual?.actividad_nombre || ''} ${cargaActual?.grupo || ''}`.trim(),
                    vista: 'MATERIA',
                  });
                  navigate(`/docente/historial-clases?${params.toString()}`);
                }}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5"
              >
                Ver historial de esta materia →
              </button>
            </div>
          </>
        )}
        {justificacion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Justificar faltas</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {justificacion.alumno.nombre} · {cargaActual?.actividad_nombre}
                  </p>
                  <p className="mt-2 text-xs text-blue-300">Aplica únicamente las fechas cubiertas por el justificante que División de Carrera ya validó.</p>
                </div>
                <button onClick={() => setJustificacion(null)} className="text-2xl text-slate-400 hover:text-white">×</button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-300">
                  Vigencia del justificante: desde
                  <input type="date" value={justificacion.fecha_inicio} onChange={(e) => setJustificacion({ ...justificacion, fecha_inicio: e.target.value, consultado: false })} className="input-dark mt-1" />
                </label>
                <label className="text-sm font-medium text-slate-300">
                  Hasta
                  <input type="date" value={justificacion.fecha_fin} onChange={(e) => setJustificacion({ ...justificacion, fecha_fin: e.target.value, consultado: false })} className="input-dark mt-1" />
                </label>
              </div>
              <button disabled={justificacion.cargando || !justificacion.fecha_inicio || !justificacion.fecha_fin} onClick={buscarFaltas} className="mt-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 disabled:opacity-50">
                {justificacion.cargando ? 'Buscando...' : 'Buscar faltas en el periodo'}
              </button>

              {justificacion.error && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{justificacion.error}</div>}
              {justificacion.consultado && (
                <div className="mt-4 max-h-52 overflow-y-auto rounded-xl border border-white/10">
                  {justificacion.faltas.map((falta) => (
                    <label key={falta.asistencia_id} className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/5">
                      <input type="checkbox" checked={justificacion.seleccionadas.includes(falta.asistencia_id)} onChange={() => alternarFalta(falta.asistencia_id)} className="h-4 w-4 accent-blue-600" />
                      <span className="flex-1 text-sm text-white">{falta.fecha}</span>
                      <span className="text-xs text-slate-400">{falta.horario}</span>
                      <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-300">Falta</span>
                    </label>
                  ))}
                  {!justificacion.faltas.length && <p className="p-5 text-center text-sm text-slate-400">No hay faltas de este alumno en el periodo indicado.</p>}
                </div>
              )}

              {justificacion.faltas.length > 0 && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-300 sm:col-span-2">
                    Motivo indicado en el justificante *
                    <textarea rows={3} value={justificacion.motivo} onChange={(e) => setJustificacion({ ...justificacion, motivo: e.target.value })} className="input-dark mt-1" placeholder="Ej. Incapacidad médica indicada en el justificante." />
                  </label>
                  <label className="text-sm font-medium text-slate-300">
                    Folio o referencia del justificante (si aparece)
                    <input value={justificacion.folio} onChange={(e) => setJustificacion({ ...justificacion, folio: e.target.value })} className="input-dark mt-1" placeholder="Ej. DC-2026-0142" />
                  </label>
                  <div className="flex items-end text-sm text-blue-300">
                    Se justificarán {justificacion.seleccionadas.length} falta(s).
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border border-blue-500/25 bg-blue-500/[0.07] p-3 text-sm text-slate-200 sm:col-span-2">
                    <input type="checkbox" checked={justificacion.documento_validado} onChange={(e) => setJustificacion({ ...justificacion, documento_validado: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" />
                    <span><b className="block text-blue-300">Confirmo que revisé el justificante validado por División de Carrera</b><span className="mt-1 block text-xs text-slate-400">Las fechas seleccionadas están incluidas en el documento presentado por el alumno.</span></span>
                  </label>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setJustificacion(null)} className="rounded-xl bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-300">Cancelar</button>
                <button
                  disabled={justificacion.guardando || !justificacion.seleccionadas.length || justificacion.motivo.trim().length < 5 || !justificacion.documento_validado}
                  onClick={guardarJustificacion}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {justificacion.guardando ? 'Guardando...' : `Aplicar justificante a ${justificacion.seleccionadas.length} falta(s)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
