import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const fechaLocal = (fecha) => [
  fecha.getFullYear(),
  String(fecha.getMonth() + 1).padStart(2, '0'),
  String(fecha.getDate()).padStart(2, '0'),
].join('-');

export default function SeguimientoGrupos() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [cargas, setCargas] = useState([]);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [justificacion, setJustificacion] = useState(null);
  const seleccion = params.get('carga') || '';

  useEffect(() => {
    api.get('/docencia/horario').then(({ data }) => {
      const clases = data.filter((c) => c.tipo_actividad === 'CLASE' && c.grupo_academico_id);
      setCargas(clases);
      if (!seleccion && clases.length) setParams({ carga: String(clases[0].id) }, { replace: true });
    }).catch(() => setError('No se pudieron cargar tus grupos.'));
  }, []);

  useEffect(() => {
    if (!seleccion) return;
    setDatos(null);
    api.get(`/docencia/seguimiento/${seleccion}`)
      .then(({ data }) => { setDatos(data); setError(''); })
      .catch((err) => setError(err.response?.data?.detail || 'No se pudo cargar el seguimiento.'));
  }, [seleccion]);

  const cargaActual = useMemo(() => cargas.find((c) => String(c.id) === seleccion), [cargas, seleccion]);

  const abrirJustificacion = (alumno) => {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    setJustificacion({
      alumno,
      fecha_inicio: fechaLocal(inicioMes),
      fecha_fin: fechaLocal(hoy),
      motivo: '',
      folio: '',
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
    if (justificacion.motivo.trim().length < 5 || !justificacion.seleccionadas.length) return;
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
        <div>
          <h1 className="text-2xl font-bold text-white">Seguimiento de grupos</h1>
          <p className="text-sm text-slate-400">Consulta asistencias por materia, detecta faltas recurrentes y revisa sesiones anteriores.</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Materia y grupo</label>
          <select value={seleccion} onChange={(e) => setParams({ carga: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white">
            {!cargas.length && <option value="">Sin clases configuradas</option>}
            {cargas.map((c) => <option key={c.id} value={c.id}>{c.actividad_nombre} · {c.grupo} · {c.periodo}</option>)}
          </select>
        </div>
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {datos && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[['Clases registradas', datos.total_clases], ['Alumnos', datos.total_alumnos], ['Promedio del grupo', `${datos.promedio_asistencia}%`], ['Alumnos en alerta', datos.alumnos_en_alerta]].map(([label, value]) => (
                <div key={label} className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{value}</p><p className="text-xs text-slate-400">{label}</p></div>
              ))}
            </div>
            {datos.clases_sin_cerrar?.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="font-semibold text-amber-300">Tienes {datos.clases_sin_cerrar.length} asistencia(s) sin cerrar</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {datos.clases_sin_cerrar.map((clase) => (
                    <button key={clase.id} onClick={() => navigate(`/docente/clase/${clase.id}`)} className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200">
                      {clase.fecha} · Continuar cierre
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="glass overflow-x-auto rounded-2xl">
              <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">{cargaActual?.actividad_nombre}</h2><p className="text-xs text-slate-400">{cargaActual?.grupo} · {cargaActual?.carrera}</p></div>
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">Alumno</th><th>Presente</th><th>Faltas</th><th>Retardos</th><th>Justificadas</th><th>Asistencia</th><th>Alertas y acción sugerida</th><th></th></tr></thead>
                <tbody className="divide-y divide-white/5">
                  {datos.alumnos.map((a) => <tr key={a.alumno_id}>
                    <td className="px-5 py-3"><p className="font-medium text-white">{a.nombre}</p><p className="text-xs text-slate-500">{a.matricula}</p></td>
                    <td className="text-emerald-400">{a.presente}</td><td className="text-red-400">{a.falta}</td><td className="text-amber-400">{a.retardo}</td><td className="text-blue-400">{a.justificada}</td>
                    <td className="font-semibold text-white">{a.porcentaje_asistencia}%</td>
                    <td className="max-w-sm py-3 pr-4">
                      {a.alertas?.length ? (
                        <div className="space-y-2">
                          {a.alertas.map((alerta) => <div key={alerta.tipo}><p className="text-xs font-semibold text-red-300">{alerta.mensaje}</p><p className="text-xs text-slate-400">{alerta.accion}</p></div>)}
                        </div>
                      ) : <span className="text-xs text-emerald-400">Sin alertas activas</span>}
                    </td>
                    <td className="pr-5">
                      <div className="flex items-center justify-end gap-2">
                        {a.falta > 0 && (
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
            <div className="glass rounded-2xl p-5">
              <h2 className="mb-3 font-semibold text-white">Sesiones recientes</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {datos.clases.map((c) => <button key={c.id} onClick={() => navigate(`/docente/clase/${c.id}`)} className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-left hover:bg-white/10"><span><b className="text-white">{c.fecha}</b><small className="block text-slate-400">{c.resumen.presente} presentes · {c.resumen.falta} faltas</small></span><span className="text-slate-400">Ver →</span></button>)}
                {!datos.clases.length && <p className="text-sm text-slate-400">Aún no hay clases registradas.</p>}
              </div>
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
                </div>
                <button onClick={() => setJustificacion(null)} className="text-2xl text-slate-400 hover:text-white">×</button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-300">
                  Desde
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
                    Folio del justificante (opcional)
                    <input value={justificacion.folio} onChange={(e) => setJustificacion({ ...justificacion, folio: e.target.value })} className="input-dark mt-1" placeholder="Ej. DC-2026-0142" />
                  </label>
                  <div className="flex items-end text-sm text-blue-300">
                    Se justificarán {justificacion.seleccionadas.length} falta(s).
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setJustificacion(null)} className="rounded-xl bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-300">Cancelar</button>
                <button
                  disabled={justificacion.guardando || !justificacion.seleccionadas.length || justificacion.motivo.trim().length < 5}
                  onClick={guardarJustificacion}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {justificacion.guardando ? 'Guardando...' : `Justificar ${justificacion.seleccionadas.length} falta(s)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
