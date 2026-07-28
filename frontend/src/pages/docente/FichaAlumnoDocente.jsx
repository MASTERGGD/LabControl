import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const FORM_INICIAL = { tipo: 'OBSERVACION', titulo: '', detalle: '', calificacion: '', estado: 'REGISTRADO' };

export default function FichaAlumnoDocente() {
  const { cargaId, alumnoId } = useParams();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

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
        estado: form.tipo === 'ACUERDO' || form.tipo === 'TUTORIA' ? 'PENDIENTE' : 'REGISTRADO',
      });
      setForm(FORM_INICIAL);
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar el seguimiento.');
    } finally {
      setGuardando(false);
    }
  };
  const cerrarSeguimiento = async (registroId) => {
    try {
      await api.patch(`/docencia/seguimiento/registros/${registroId}`, { estado: 'ATENDIDO' });
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo actualizar el seguimiento.');
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <button onClick={() => navigate(`/docente/seguimiento?carga=${cargaId}`)} className="mb-2 text-sm text-slate-400 hover:text-white">← Volver al grupo</button>
          <h1 className="text-2xl font-bold text-white">{datos?.alumno.nombre || 'Ficha individual'}</h1>
          {datos && <p className="text-sm text-slate-400">{datos.alumno.matricula} · {datos.carga.actividad_nombre} · {datos.carga.grupo}</p>}
        </div>
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {datos && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ['Asistencia', `${datos.resumen.porcentaje_asistencia}%`],
                ['Faltas', datos.resumen.falta],
                ['Retardos', datos.resumen.retardo],
                ['Justificadas', datos.resumen.justificada],
                ['Clases', datos.resumen.total],
              ].map(([label, value]) => <div key={label} className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{value}</p><p className="text-xs text-slate-400">{label}</p></div>)}
            </div>
            {datos.alertas?.length > 0 && (
              <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                <h2 className="font-semibold text-red-300">Acciones sugeridas</h2>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {datos.alertas.map((alerta) => <div key={alerta.tipo}><p className="text-sm font-semibold text-white">{alerta.mensaje}</p><p className="text-xs text-slate-300">{alerta.accion}</p></div>)}
                </div>
              </section>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <section className="glass rounded-2xl p-5">
                <h2 className="font-semibold text-white">Historial académico y de seguimiento</h2>
                <div className="mt-4 space-y-3">
                  {datos.registros.map((r) => (
                    <article key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div><span className="text-xs font-bold text-emerald-400">{r.tipo}</span><h3 className="font-semibold text-white">{r.titulo}</h3></div>
                        <div className="text-right">{r.calificacion != null && <p className="text-xl font-bold text-white">{r.calificacion}</p>}<p className="text-xs text-slate-500">{new Date(r.creado_en).toLocaleDateString('es-MX')}</p></div>
                      </div>
                      {r.detalle && <p className="mt-2 text-sm text-slate-400">{r.detalle}</p>}
                      {(r.tipo === 'ACUERDO' || r.tipo === 'TUTORIA') && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="inline-block rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-300">{r.estado}</span>
                          {r.estado === 'PENDIENTE' && <button onClick={() => cerrarSeguimiento(r.id)} className="text-xs font-semibold text-emerald-400">Marcar atendido</button>}
                        </div>
                      )}
                    </article>
                  ))}
                  {!datos.registros.length && <p className="py-8 text-center text-sm text-slate-400">Aún no hay observaciones, acuerdos o calificaciones.</p>}
                </div>
                <h3 className="mt-6 font-semibold text-white">Asistencias recientes</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {datos.asistencias.slice(0, 12).map((a) => <div key={a.fecha} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"><span className="text-slate-300">{a.fecha}</span><span className="text-xs font-semibold text-slate-400">{a.estado}</span></div>)}
                </div>
              </section>

              <form onSubmit={guardar} className="glass h-fit rounded-2xl p-5">
                <h2 className="font-semibold text-white">Registrar seguimiento</h2>
                <p className="mt-1 text-xs text-slate-400">Registra hechos académicos y acuerdos concretos; evita información sensible innecesaria.</p>
                <label className="mt-4 block text-sm text-slate-300">Tipo
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, calificacion: '' })} className="input-dark mt-1">
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
                <label className="mt-3 block text-sm text-slate-300">Detalle
                  <textarea value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} rows={4} className="input-dark mt-1" placeholder="Evidencia, acción acordada o fecha de revisión" />
                </label>
                <button disabled={guardando} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar seguimiento'}</button>
              </form>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
