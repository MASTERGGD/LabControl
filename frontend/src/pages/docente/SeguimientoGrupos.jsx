import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

export default function SeguimientoGrupos() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [cargas, setCargas] = useState([]);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
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
            <div className="glass overflow-x-auto rounded-2xl">
              <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold text-white">{cargaActual?.actividad_nombre}</h2><p className="text-xs text-slate-400">{cargaActual?.grupo} · {cargaActual?.carrera}</p></div>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-400"><tr><th className="px-5 py-3">Alumno</th><th>Presente</th><th>Faltas</th><th>Retardos</th><th>Justificadas</th><th>Asistencia</th><th>Estado</th></tr></thead>
                <tbody className="divide-y divide-white/5">
                  {datos.alumnos.map((a) => <tr key={a.alumno_id}>
                    <td className="px-5 py-3"><p className="font-medium text-white">{a.nombre}</p><p className="text-xs text-slate-500">{a.matricula}</p></td>
                    <td className="text-emerald-400">{a.presente}</td><td className="text-red-400">{a.falta}</td><td className="text-amber-400">{a.retardo}</td><td className="text-blue-400">{a.justificada}</td>
                    <td className="font-semibold text-white">{a.porcentaje_asistencia}%</td>
                    <td>{a.alerta ? <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300">Requiere atención</span> : <span className="text-xs text-emerald-400">Regular</span>}</td>
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
      </div>
    </AdminLayout>
  );
}
