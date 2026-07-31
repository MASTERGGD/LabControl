import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const ESTADOS = {
  CERRADA: { texto: 'Impartida', clase: 'bg-emerald-500/15 text-emerald-400' },
  ABIERTA: { texto: 'En captura', clase: 'bg-blue-500/15 text-blue-400' },
  CORRECCION: { texto: 'En corrección', clase: 'bg-amber-500/15 text-amber-400' },
};

const fechaLarga = (fecha) => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
});

function Kpi({ valor, etiqueta, detalle, tono = 'text-white' }) {
  return (
    <article className="glass rounded-2xl p-4">
      <p className={`text-2xl font-bold ${tono}`}>{valor}</p>
      <p className="mt-1 text-sm font-semibold text-slate-300">{etiqueta}</p>
      <p className="mt-1 text-xs text-slate-500">{detalle}</p>
    </article>
  );
}

export default function HistorialClasesDocente() {
  const navigate = useNavigate();
  const [clases, setClases] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [periodo, setPeriodo] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');

  useEffect(() => {
    api.get('/docencia/historial')
      .then(({ data }) => setClases(data))
      .catch((err) => setError(err.response?.data?.detail || 'No se pudo cargar el historial de clases.'))
      .finally(() => setCargando(false));
  }, []);

  const periodos = useMemo(() => [...new Set(clases.map((c) => c.carga.periodo).filter(Boolean))], [clases]);
  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es');
    return clases.filter((clase) => {
      const coincideTexto = !texto || `${clase.carga.actividad_nombre} ${clase.carga.grupo || ''} ${clase.carga.carrera || ''}`.toLocaleLowerCase('es').includes(texto);
      return coincideTexto
        && (periodo === 'TODOS' || clase.carga.periodo === periodo)
        && (estado === 'TODOS' || clase.estado === estado);
    });
  }, [clases, busqueda, periodo, estado]);

  const resumen = useMemo(() => {
    const impartidas = filtradas.filter((c) => c.estado === 'CERRADA').length;
    const pendientes = filtradas.filter((c) => c.estado !== 'CERRADA').length;
    const alumnos = filtradas.reduce((total, c) => total + (c.resumen?.total || 0), 0);
    const presentes = filtradas.reduce((total, c) => total + (c.resumen?.presente || 0) + (c.resumen?.retardo || 0) + (c.resumen?.justificada || 0), 0);
    return { impartidas, pendientes, asistencia: alumnos ? Math.round((presentes / alumnos) * 100) : null };
  }, [filtradas]);

  return (
    <AdminLayout>
      <main className="mx-auto w-full max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Actividad académica</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Historial de clases</h1>
            <p className="mt-1 text-sm text-slate-400">Consulta lo ocurrido en cada clase: asistencia, tema, avance e incidencias.</p>
          </div>
          <button onClick={() => navigate('/docente/horario')} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">
            Ver mi horario
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <Kpi valor={filtradas.length} etiqueta="Sesiones registradas" detalle="Clases con registro de asistencia" />
          <Kpi valor={resumen.impartidas} etiqueta="Clases cerradas" detalle={resumen.pendientes ? `${resumen.pendientes} requieren concluir captura` : 'Todas las capturas están concluidas'} tono="text-emerald-400" />
          <Kpi valor={resumen.asistencia == null ? '—' : `${resumen.asistencia}%`} etiqueta="Asistencia acumulada" detalle="Presentes, retardos y justificadas" tono={resumen.asistencia != null && resumen.asistencia < 80 ? 'text-amber-400' : 'text-cyan-400'} />
        </section>

        <section className="glass rounded-2xl p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
            <label className="text-xs font-semibold text-slate-400">Buscar materia o grupo
              <input className="input-dark mt-1 w-full" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. Cálculo Integral o 3° A" />
            </label>
            <label className="text-xs font-semibold text-slate-400">Cuatrimestre
              <select className="input-dark mt-1 w-full" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                <option value="TODOS">Todos los periodos</option>
                {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-400">Estado
              <select className="input-dark mt-1 w-full" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="TODOS">Todos los estados</option>
                <option value="CERRADA">Impartidas</option>
                <option value="ABIERTA">En captura</option>
                <option value="CORRECCION">En corrección</option>
              </select>
            </label>
          </div>
        </section>

        {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">{error}</p>}
        {cargando ? (
          <div className="glass rounded-2xl p-12 text-center text-sm text-slate-400">Cargando historial…</div>
        ) : filtradas.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <p className="font-semibold text-white">No hay clases con estos filtros</p>
            <p className="mt-1 text-sm text-slate-500">Las sesiones aparecerán cuando se genere su registro de asistencia.</p>
          </div>
        ) : (
          <section className="space-y-3">
            {filtradas.map((clase) => {
              const est = ESTADOS[clase.estado] || { texto: clase.estado, clase: 'bg-slate-500/15 text-slate-400' };
              const r = clase.resumen || {};
              return (
                <article key={clase.id} className="glass rounded-2xl p-4 transition hover:border-emerald-500/30 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${est.clase}`}>{est.texto}</span>
                        {clase.es_extemporanea && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-400">Extemporánea</span>}
                        <span className="text-xs text-slate-500">{clase.carga.periodo}</span>
                      </div>
                      <h2 className="mt-2 truncate text-base font-bold text-white">{clase.carga.actividad_nombre}</h2>
                      <p className="mt-1 text-sm text-slate-400">{fechaLarga(clase.fecha)} · {clase.carga.hora_inicio}–{clase.carga.hora_fin} · {clase.carga.grupo || 'Sin grupo'} · {clase.carga.espacio_nombre || 'Sin espacio'}</p>
                      <p className="mt-2 text-sm text-slate-300"><span className="text-slate-500">Tema:</span> {clase.bitacora?.tema_impartido || 'Sin tema registrado'}</p>
                      {(clase.bitacora?.incidencias || clase.observacion_general) && <p className="mt-1 line-clamp-2 text-xs text-amber-300"><span className="font-semibold">Observaciones:</span> {clase.bitacora?.incidencias || clase.observacion_general}</p>}
                    </div>
                    <div className="grid shrink-0 grid-cols-4 gap-2 text-center lg:w-[360px]">
                      {[
                        ['Presentes', r.presente || 0, 'text-emerald-400'],
                        ['Faltas', r.falta || 0, 'text-red-400'],
                        ['Retardos', r.retardo || 0, 'text-amber-400'],
                        ['Justif.', r.justificada || 0, 'text-cyan-400'],
                      ].map(([label, value, tone]) => <div key={label} className="rounded-xl bg-white/[0.04] px-2 py-3"><b className={`block text-lg ${tone}`}>{value}</b><span className="text-[10px] text-slate-500">{label}</span></div>)}
                    </div>
                    <button onClick={() => navigate(`/docente/clase/${clase.id}`)} className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
                      Ver detalle
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </AdminLayout>
  );
}
