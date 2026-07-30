import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useTheme } from '../../context/ThemeContext';

const TABS = [
  ['resumen', 'Resumen'],
  ['materias', 'Materias'],
  ['asistencia', 'Asistencia'],
  ['evaluaciones', 'Evaluaciones'],
  ['acuerdos', 'Acuerdos'],
  ['tutoria', 'Tutoría'],
  ['timeline', 'Línea de tiempo'],
];

const SEMAFORO = {
  ROJO: { label: 'Riesgo alto', dot: 'bg-red-500', box: 'border-red-500/30 bg-red-500/10', text: 'text-red-400' },
  AMARILLO: { label: 'Requiere atención', dot: 'bg-amber-500', box: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-400' },
  VERDE: { label: 'Seguimiento regular', dot: 'bg-emerald-500', box: 'border-emerald-500/30 bg-emerald-500/10', text: 'text-emerald-400' },
  GRIS: { label: 'Información insuficiente', dot: 'bg-slate-400', box: 'border-slate-500/30 bg-slate-500/10', text: 'text-slate-400' },
};

const ESTADO_MATERIA = {
  RIESGO_ALTO: 'bg-red-500/15 text-red-400 border-red-500/30',
  RIESGO_MEDIO: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  REGULAR: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SIN_DATOS: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const fmt = value => value ? new Date(value).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '—';
const fmtFechaHora = value => value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const labelEstado = value => String(value || '—').replaceAll('_', ' ');

function Panel({ children, className = '' }) {
  const { themeKey } = useTheme();
  return <section className={`rounded-2xl border ${themeKey === 'day' ? 'border-slate-200 bg-white' : 'border-white/10 bg-slate-900/55'} ${className}`}>{children}</section>;
}

function Badge({ children, className = '' }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{children}</span>;
}

function Kpi({ label, value, hint, tone = 'text-blue-400' }) {
  const { themeKey } = useTheme();
  return (
    <div className={`rounded-xl border p-4 ${themeKey === 'day' ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/[0.035]'}`}>
      <p className={`text-2xl font-bold ${tone}`}>{value ?? '—'}</p>
      <p className={`text-xs font-semibold ${themeKey === 'day' ? 'text-slate-800' : 'text-slate-300'}`}>{label}</p>
      {hint && <p className="mt-1 text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

function MateriasTable({ materias, compact = false }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className={`text-xs uppercase ${isDay ? 'bg-slate-50 text-slate-600' : 'bg-white/[0.035] text-slate-400'}`}>
          <tr>
            <th className="px-4 py-3">Materia</th>
            <th className="px-4 py-3">Docente</th>
            <th className="px-4 py-3 text-center">Evidencias</th>
            <th className="px-4 py-3 text-center">Promedio</th>
            <th className="px-4 py-3 text-center">Asistencia</th>
            <th className="px-4 py-3 text-center">Faltas</th>
            <th className="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody className={isDay ? 'divide-y divide-slate-100' : 'divide-y divide-white/5'}>
          {materias.slice(0, compact ? 5 : undefined).map(m => (
            <tr key={m.clave} className={isDay ? 'hover:bg-slate-50' : 'hover:bg-white/[0.025]'}>
              <td className={`px-4 py-3 font-semibold ${isDay ? 'text-slate-950' : 'text-white'}`}>{m.materia}</td>
              <td className="px-4 py-3 text-slate-500">{m.docente || '—'}</td>
              <td className="px-4 py-3 text-center">{m.evaluaciones_registradas}</td>
              <td className="px-4 py-3 text-center font-semibold">{m.promedio_evidencias ?? '—'}</td>
              <td className="px-4 py-3 text-center">{m.porcentaje_asistencia != null ? `${m.porcentaje_asistencia}%` : '—'}</td>
              <td className="px-4 py-3 text-center text-red-400">{m.falta}</td>
              <td className="px-4 py-3"><Badge className={ESTADO_MATERIA[m.estado]}>{labelEstado(m.estado)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!materias.length && <p className="p-8 text-center text-sm text-slate-500">No hay materias activas relacionadas con la inscripción del alumno.</p>}
    </div>
  );
}

function Resumen({ data, setTab }) {
  const r = data.resumen;
  const sem = SEMAFORO[r.semaforo] || SEMAFORO.GRIS;
  const alertas = data.materias.filter(m => ['RIESGO_ALTO', 'RIESGO_MEDIO'].includes(m.estado));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Materias" value={r.materias_inscritas} tone="text-blue-400" />
        <Kpi label="Asistencia global" value={r.asistencia_global != null ? `${r.asistencia_global}%` : '—'} tone={r.asistencia_global != null && r.asistencia_global < 80 ? 'text-red-400' : 'text-emerald-400'} />
        <Kpi label="Prom. evidencias" value={r.promedio_evidencias} hint="No oficial" tone="text-violet-400" />
        <Kpi label="Materias en riesgo" value={r.materias_riesgo} tone={r.materias_riesgo ? 'text-red-400' : 'text-emerald-400'} />
        <Kpi label="Acuerdos pendientes" value={r.acuerdos_pendientes} tone="text-amber-400" />
        <Kpi label="Reportes abiertos" value={r.reportes_abiertos} tone="text-orange-400" />
        <Kpi label="Canalizaciones" value={r.canalizaciones_activas} tone="text-cyan-400" />
      </div>

      <Panel className={`p-5 ${sem.box}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${sem.dot}`} />
              <h2 className={`text-lg font-bold ${sem.text}`}>{sem.label}</h2>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-slate-400">
              {r.razones_semaforo.map((razon, i) => <li key={i}>• {razon}</li>)}
            </ul>
          </div>
          <button onClick={() => setTab('timeline')} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white">Ver línea de tiempo</button>
        </div>
      </Panel>

      {alertas.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {alertas.map(m => (
            <Panel key={m.clave} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{m.materia}</p>
                  <p className="text-xs text-slate-500">{m.docente}</p>
                </div>
                <Badge className={ESTADO_MATERIA[m.estado]}>{labelEstado(m.estado)}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div><b className="block text-base">{m.promedio_evidencias ?? '—'}</b><span className="text-slate-500">Evidencias</span></div>
                <div><b className="block text-base">{m.porcentaje_asistencia != null ? `${m.porcentaje_asistencia}%` : '—'}</b><span className="text-slate-500">Asistencia</span></div>
                <div><b className="block text-base text-red-400">{m.falta}</b><span className="text-slate-500">Faltas</span></div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div><h2 className="font-semibold">Panorama por materia</h2><p className="text-xs text-slate-500">Indicadores disponibles del periodo actual.</p></div>
          <button onClick={() => setTab('materias')} className="text-xs font-semibold text-blue-400">Ver todas →</button>
        </div>
        <MateriasTable materias={data.materias} compact />
      </Panel>
    </div>
  );
}

function Asistencia({ materias }) {
  const max = Math.max(100, ...materias.map(m => m.porcentaje_asistencia || 0));
  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <h2 className="font-semibold">Comparación entre materias</h2>
        <p className="mt-1 text-xs text-slate-500">Permite detectar si las ausencias se concentran en asignaturas específicas.</p>
        <div className="mt-5 space-y-4">
          {materias.map(m => {
            const porcentaje = m.porcentaje_asistencia || 0;
            const color = porcentaje < 80 ? 'bg-red-500' : porcentaje < 90 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <div key={m.clave}>
                <div className="mb-1 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{m.materia}</p><p className="text-[10px] text-slate-500">{m.docente}</p></div>
                  <span className="shrink-0 font-bold">{m.porcentaje_asistencia != null ? `${m.porcentaje_asistencia}%` : 'Sin datos'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-500/15"><div className={`h-full rounded-full ${color}`} style={{ width: `${porcentaje * 100 / max}%` }} /></div>
                <div className="mt-1 flex gap-3 text-[10px] text-slate-500"><span>{m.presente} presentes</span><span>{m.falta} faltas</span><span>{m.retardo} retardos</span><span>{m.justificada} justificadas</span></div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Evaluaciones({ data }) {
  const evaluaciones = data.materias.flatMap(m => m.evaluaciones.map(e => ({ ...e, materia: m.materia })));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-200">{data.nota_calificaciones}</div>
      <Panel className="overflow-hidden">
        <div className="px-5 py-4"><h2 className="font-semibold">Evidencias registradas por docentes</h2><p className="text-xs text-slate-500">Evaluaciones internas disponibles hasta este momento.</p></div>
        <div className="divide-y divide-white/5">
          {evaluaciones.map(e => (
            <div key={`${e.materia}-${e.id}`} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_160px_90px] sm:items-center">
              <div><p className="font-medium">{e.titulo}</p><p className="text-xs text-slate-500">{e.materia}{e.detalle ? ` · ${e.detalle}` : ''}</p></div>
              <p className="text-xs text-slate-500">{fmt(e.fecha)}</p>
              <p className={`text-xl font-bold ${e.calificacion < 7 ? 'text-red-400' : 'text-emerald-400'}`}>{e.calificacion}</p>
            </div>
          ))}
          {!evaluaciones.length && <p className="p-8 text-center text-sm text-slate-500">Todavía no hay evidencias de calificación registradas.</p>}
        </div>
      </Panel>
    </div>
  );
}

function Acuerdos({ acuerdos }) {
  return (
    <div className="space-y-3">
      {acuerdos.map(a => (
        <Panel key={a.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-semibold">{a.titulo}</p><p className="text-xs text-slate-500">{a.materia || 'Sin materia relacionada'} · Registrado {fmt(a.creado_en)}</p></div>
            <Badge className={a.estado === 'PENDIENTE' ? 'border-amber-500/30 bg-amber-500/15 text-amber-400' : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'}>{a.estado}</Badge>
          </div>
          {a.detalle && <p className="mt-3 text-sm text-slate-400">{a.detalle}</p>}
          <p className="mt-2 text-xs text-blue-400">Fecha de revisión: {fmt(a.fecha_revision)}</p>
          {a.resultado && <p className="mt-2 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-300"><b>Resultado:</b> {a.resultado}</p>}
        </Panel>
      ))}
      {!acuerdos.length && <Panel className="p-8 text-center text-sm text-slate-500">No hay acuerdos académicos registrados.</Panel>}
    </div>
  );
}

function Tutoria({ tutoria }) {
  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <p className="text-xs uppercase tracking-wide text-slate-500">Tutor asignado</p>
        <p className="mt-1 text-lg font-semibold">{tutoria.tutor_nombre || 'Sin tutor asignado'}</p>
        {tutoria.estado_seguimiento && <Badge className="mt-2 border-blue-500/30 bg-blue-500/15 text-blue-400">{labelEstado(tutoria.estado_seguimiento)}</Badge>}
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="font-semibold">Reportes docentes</h2>
          <div className="mt-3 space-y-3">
            {tutoria.reportes.map(r => <div key={r.id} className="rounded-xl border border-white/10 p-3"><div className="flex justify-between gap-3"><p className="font-medium">{r.titulo}</p><Badge className="border-amber-500/30 text-amber-400">{labelEstado(r.estado)}</Badge></div><p className="mt-1 text-xs text-slate-500">{r.categoria} · Prioridad {r.prioridad} · {fmt(r.creado_en)}</p>{r.resultado && <p className="mt-2 text-xs text-emerald-400">{r.resultado}</p>}</div>)}
            {!tutoria.reportes.length && <p className="text-sm text-slate-500">Sin reportes.</p>}
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="font-semibold">Sesiones tutoriales</h2>
          <div className="mt-3 space-y-3">
            {tutoria.sesiones.map(s => <div key={s.id} className="rounded-xl border border-white/10 p-3"><div className="flex justify-between gap-3"><p className="font-medium">{s.tipo}</p><span className="text-xs text-slate-500">{fmt(s.fecha)}</span></div><p className="mt-1 text-xs text-slate-400">{s.tema || s.comentarios || 'Sin tema registrado'}</p></div>)}
            {!tutoria.sesiones.length && <p className="text-sm text-slate-500">Sin sesiones individuales relacionadas.</p>}
          </div>
        </Panel>
      </div>
      <Panel className="p-5">
        <h2 className="font-semibold">Canalizaciones</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {tutoria.canalizaciones.map(c => <div key={c.id} className="rounded-xl border border-white/10 p-3"><div className="flex justify-between gap-3"><p className="font-medium">Canalización #{c.id}</p><Badge className="border-purple-500/30 text-purple-400">{labelEstado(c.estado)}</Badge></div><p className="mt-2 text-xs text-slate-400">{c.motivo}</p><p className="mt-1 text-[10px] text-slate-500">{fmt(c.fecha_solicitud)}{c.area_atencion ? ` · ${c.area_atencion}` : ''}</p></div>)}
          {!tutoria.canalizaciones.length && <p className="text-sm text-slate-500">Sin canalizaciones registradas.</p>}
        </div>
      </Panel>
    </div>
  );
}

function Timeline({ items }) {
  return (
    <Panel className="p-5">
      <h2 className="font-semibold">Línea de tiempo académica</h2>
      <p className="mt-1 text-xs text-slate-500">Asistencia excepcional, evaluaciones, acuerdos y seguimiento tutorial.</p>
      <div className="mt-5 space-y-0">
        {items.map((e, i) => (
          <div key={`${e.tipo}-${e.fecha}-${i}`} className="grid grid-cols-[16px_1fr] gap-3">
            <div className="flex flex-col items-center"><span className={`mt-1 h-3 w-3 rounded-full ${e.tipo === 'ASISTENCIA' ? 'bg-red-400' : e.tipo === 'EVALUACION' ? 'bg-violet-400' : e.tipo === 'TUTORIA' ? 'bg-cyan-400' : e.tipo === 'REPORTE' ? 'bg-orange-400' : 'bg-blue-400'}`} />{i < items.length - 1 && <span className="w-px flex-1 bg-slate-500/20" />}</div>
            <div className="pb-5"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{e.titulo}</p><Badge className="border-slate-500/30 text-slate-400">{e.tipo}</Badge>{e.estado && <Badge className="border-amber-500/30 text-amber-400">{labelEstado(e.estado)}</Badge>}</div>{e.descripcion && <p className="mt-1 text-sm text-slate-400">{e.descripcion}</p>}<p className="mt-1 text-[10px] text-slate-500">{fmtFechaHora(e.fecha)}</p></div>
          </div>
        ))}
        {!items.length && <p className="py-8 text-center text-sm text-slate-500">Todavía no hay movimientos académicos.</p>}
      </div>
    </Panel>
  );
}

const ESTADO_ALUMNO = {
  RIESGO: 'border-red-500/30 bg-red-500/10 text-red-500',
  ATENCION: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  REGULAR: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  SIN_DATOS: 'border-slate-500/30 bg-slate-500/10 text-slate-500',
};

function PanoramaGrupo({ grupoId, seleccionarAlumno }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [panorama, setPanorama] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('TODOS');
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!grupoId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/expediente-academico/panorama/grupos/${grupoId}/alumnos`, {
        params: { q: busqueda, estado, pagina, limite: 25 },
      });
      setPanorama(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar el panorama del grupo.');
    } finally {
      setLoading(false);
    }
  }, [grupoId, busqueda, estado, pagina]);

  useEffect(() => {
    const timer = setTimeout(cargar, 250);
    return () => clearTimeout(timer);
  }, [cargar]);

  useEffect(() => { setPagina(1); }, [grupoId, busqueda, estado]);

  if (!grupoId) return null;
  if (!panorama && loading) return <Panel className="p-10 text-center text-sm text-slate-500">Calculando indicadores del grupo…</Panel>;
  if (!panorama) return <Panel className="p-8 text-center text-sm text-red-400">{error || 'Sin información del grupo.'}</Panel>;

  const r = panorama.resumen;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Alumnos" value={r.total_alumnos} />
        <Kpi label="Asistencia global" value={r.asistencia_global != null ? `${r.asistencia_global}%` : '—'} tone={r.asistencia_global != null && r.asistencia_global < 80 ? 'text-red-400' : 'text-emerald-400'} />
        <Kpi label="Prom. evidencias" value={r.promedio_evidencias} hint="No oficial" tone="text-violet-400" />
        <Kpi label="En riesgo" value={r.alumnos_riesgo} tone={r.alumnos_riesgo ? 'text-red-400' : 'text-emerald-400'} />
        <Kpi label="Requieren atención" value={r.alumnos_atencion} tone="text-amber-400" />
        <Kpi label="Sin información" value={r.sin_datos} tone="text-slate-400" />
        <Kpi label="Acuerdos pendientes" value={r.acuerdos_pendientes} tone="text-orange-400" />
        <Kpi label="Cobertura" value={`${r.cobertura_asistencia}%`} hint="Asistencias capturadas" tone="text-cyan-400" />
      </div>

      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{panorama.grupo.cuatrimestre}° {panorama.grupo.grupo} · {panorama.grupo.carrera}</h2>
            <p className="text-xs text-slate-500">{panorama.grupo.periodo} · {r.materias} materias · {r.clases_registradas} clases registradas · {r.faltas_totales} faltas</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-dark w-64" placeholder="Buscar en este grupo…" />
            <select value={estado} onChange={e => setEstado(e.target.value)} className="input-dark w-48">
              <option value="TODOS">Todos los estados</option>
              <option value="RIESGO">En riesgo</option>
              <option value="ATENCION">Requieren atención</option>
              <option value="REGULAR">Regulares</option>
              <option value="SIN_DATOS">Sin información</option>
            </select>
          </div>
        </div>
      </Panel>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className={`text-xs uppercase ${isDay ? 'bg-slate-50 text-slate-600' : 'bg-white/[0.035] text-slate-400'}`}>
              <tr>
                <th className="px-5 py-3">Alumno</th>
                <th className="px-3 py-3 text-center">Asistencia</th>
                <th className="px-3 py-3 text-center">Promedio</th>
                <th className="px-3 py-3 text-center">Faltas</th>
                <th className="px-3 py-3 text-center">Consecutivas</th>
                <th className="px-3 py-3 text-center">Pendientes</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className={isDay ? 'divide-y divide-slate-100' : 'divide-y divide-white/5'}>
              {panorama.alumnos.map(alumno => (
                <tr key={alumno.id} className={isDay ? 'hover:bg-slate-50' : 'hover:bg-white/[0.025]'}>
                  <td className="px-5 py-3"><p className="font-semibold">{alumno.nombre}</p><p className="text-xs text-slate-500">{alumno.matricula}</p></td>
                  <td className={`px-3 py-3 text-center font-bold ${alumno.asistencia != null && alumno.asistencia < 80 ? 'text-red-400' : 'text-emerald-400'}`}>{alumno.asistencia != null ? `${alumno.asistencia}%` : '—'}</td>
                  <td className={`px-3 py-3 text-center font-bold ${alumno.promedio_evidencias != null && alumno.promedio_evidencias < 7 ? 'text-red-400' : ''}`}>{alumno.promedio_evidencias ?? '—'}</td>
                  <td className="px-3 py-3 text-center text-red-400">{alumno.faltas}</td>
                  <td className="px-3 py-3 text-center">{alumno.faltas_consecutivas || '—'}</td>
                  <td className="px-3 py-3 text-center">{alumno.acuerdos_pendientes + alumno.reportes_abiertos}</td>
                  <td className="px-3 py-3"><Badge className={ESTADO_ALUMNO[alumno.estado]}>{labelEstado(alumno.estado)}</Badge></td>
                  <td className="px-5 py-3 text-right"><button onClick={() => seleccionarAlumno(alumno.id)} className="rounded-lg border border-blue-500/30 px-3 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-500/10">Ver expediente →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!panorama.alumnos.length && <p className="p-8 text-center text-sm text-slate-500">No hay alumnos que coincidan con los filtros.</p>}
        </div>
        <div className={`flex items-center justify-between border-t px-5 py-3 ${isDay ? 'border-slate-200' : 'border-white/10'}`}>
          <p className="text-xs text-slate-500">{panorama.paginacion.total} alumno(s) · Página {panorama.paginacion.pagina} de {panorama.paginacion.paginas}</p>
          <div className="flex gap-2">
            <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-30">Anterior</button>
            <button disabled={pagina >= panorama.paginacion.paginas} onClick={() => setPagina(p => p + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-30">Siguiente</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default function ExpedienteAcademico() {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [searchParams, setSearchParams] = useSearchParams();
  const [busqueda, setBusqueda] = useState('');
  const [alumnos, setAlumnos] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [grupoId, setGrupoId] = useState(Number(searchParams.get('grupo')) || null);
  const [alumnoId, setAlumnoId] = useState(Number(searchParams.get('alumno')) || null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('resumen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buscar = useCallback(async (texto = '') => {
    if (texto.trim().length < 2) {
      setAlumnos([]);
      return;
    }
    try {
      const { data: rows } = await api.get(`/expediente-academico/alumnos?q=${encodeURIComponent(texto)}&limite=20`);
      setAlumnos(rows);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo consultar el padrón de alumnos.');
    }
  }, []);

  useEffect(() => {
    api.get('/expediente-academico/panorama/grupos')
      .then(({ data: rows }) => {
        setGrupos(rows);
        if (!grupoId && rows.length) setGrupoId(rows[0].id);
      })
      .catch(err => setError(err.response?.data?.detail || 'No se pudieron consultar los grupos.'));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => buscar(busqueda), 300);
    return () => clearTimeout(timer);
  }, [busqueda, buscar]);

  useEffect(() => {
    if (!alumnoId) { setData(null); return; }
    setLoading(true); setError('');
    api.get(`/expediente-academico/alumnos/${alumnoId}`)
      .then(({ data: expediente }) => setData(expediente))
      .catch(err => setError(err.response?.data?.detail || 'No se pudo cargar el expediente.'))
      .finally(() => setLoading(false));
  }, [alumnoId]);

  const seleccionar = id => {
    setAlumnoId(id); setTab('resumen'); setSearchParams({ alumno: String(id) });
    setBusqueda('');
    setAlumnos([]);
  };
  const volverPanorama = () => {
    setAlumnoId(null);
    setData(null);
    setSearchParams(grupoId ? { grupo: String(grupoId) } : {});
  };
  const seleccionarGrupo = id => {
    setGrupoId(id);
    setSearchParams({ grupo: String(id) });
  };

  return (
    <AdminLayout>
      <div className={`mx-auto max-w-[1800px] space-y-5 ${isDay ? 'text-slate-950' : 'text-white'}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">Seguimiento institucional</p>
            <h1 className="mt-1 text-2xl font-bold">Expediente Académico Integral</h1>
            <p className="mt-1 text-sm text-slate-500">Panorama por grupo y expediente consolidado de cada alumno.</p>
          </div>
          <div className="relative w-full max-w-md">
            <label className="text-xs font-semibold text-slate-500">Búsqueda directa de alumno</label>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-dark mt-1" placeholder="Escribe nombre o matrícula…" />
            {busqueda.trim().length >= 2 && (
              <Panel className="absolute right-0 top-full z-30 mt-2 max-h-80 w-full overflow-y-auto shadow-2xl">
                {alumnos.map(alumno => (
                  <button key={alumno.id} onClick={() => seleccionar(alumno.id)} className={`w-full border-b px-4 py-3 text-left ${isDay ? 'border-slate-100 hover:bg-slate-50' : 'border-white/5 hover:bg-white/5'}`}>
                    <p className="text-sm font-semibold">{alumno.nombre}</p>
                    <p className="text-xs text-slate-500">{alumno.matricula} · {alumno.cuatrimestre}° {alumno.grupo} · {alumno.carrera}</p>
                  </button>
                ))}
                {!alumnos.length && <p className="p-5 text-center text-sm text-slate-500">No se encontraron alumnos.</p>}
              </Panel>
            )}
          </div>
        </div>

        {!alumnoId && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {grupos.map(grupo => (
                <button key={grupo.id} onClick={() => seleccionarGrupo(grupo.id)} className={`rounded-2xl border p-4 text-left transition ${grupo.id === grupoId ? 'border-blue-500 bg-blue-500/10 shadow-sm' : isDay ? 'border-slate-200 bg-white hover:border-blue-300' : 'border-white/10 bg-slate-900/55 hover:border-blue-500/40'}`}>
                  <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{grupo.cuatrimestre}° {grupo.grupo} · {grupo.carrera}</p><p className="mt-1 text-xs text-slate-500">{grupo.periodo}{grupo.turno ? ` · ${grupo.turno}` : ''}</p></div><span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-400">{grupo.total_alumnos}</span></div>
                  <p className="mt-3 text-xs text-slate-500">{grupo.materias} materia(s) configurada(s)</p>
                </button>
              ))}
            </div>
            {!grupos.length && <Panel className="p-10 text-center text-sm text-slate-500">No hay grupos académicos accesibles.</Panel>}
            <PanoramaGrupo grupoId={grupoId} seleccionarAlumno={seleccionar} />
          </div>
        )}

        {alumnoId && (
          <div className="min-w-0">
            <button onClick={volverPanorama} className="mb-3 text-sm font-semibold text-blue-400 hover:text-blue-300">← Volver al panorama del grupo</button>
            {loading && <Panel className="p-12 text-center text-sm text-slate-500">Cargando expediente del alumno…</Panel>}
            {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
            {data && !loading && (
              <div className="space-y-5">
                <Panel className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><h2 className="text-2xl font-bold">{data.alumno.nombre}</h2><p className="mt-1 text-sm text-slate-500">{data.alumno.matricula} · {data.alumno.carrera} · {data.alumno.cuatrimestre}° {data.alumno.grupo} · {data.alumno.periodo}</p><p className="mt-1 text-xs text-slate-500">Tutor: {data.tutoria.tutor_nombre || 'Sin tutor asignado'}</p></div>
                    <div className={`rounded-xl border px-4 py-3 ${SEMAFORO[data.resumen.semaforo]?.box}`}><div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${SEMAFORO[data.resumen.semaforo]?.dot}`} /><span className={`text-sm font-bold ${SEMAFORO[data.resumen.semaforo]?.text}`}>{SEMAFORO[data.resumen.semaforo]?.label}</span></div></div>
                  </div>
                </Panel>

                <div className={`flex gap-1 overflow-x-auto rounded-xl border p-1 ${isDay ? 'border-slate-200 bg-white' : 'border-white/10 bg-slate-900/55'}`}>
                  {TABS.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-white/5'}`}>{label}</button>)}
                </div>

                {tab === 'resumen' && <Resumen data={data} setTab={setTab} />}
                {tab === 'materias' && <Panel className="overflow-hidden"><div className="px-5 py-4"><h2 className="font-semibold">Materias del cuatrimestre</h2><p className="text-xs text-slate-500">Resultados calculados a partir de registros disponibles en SIGA.</p></div><MateriasTable materias={data.materias} /></Panel>}
                {tab === 'asistencia' && <Asistencia materias={data.materias} />}
                {tab === 'evaluaciones' && <Evaluaciones data={data} />}
                {tab === 'acuerdos' && <Acuerdos acuerdos={data.acuerdos} />}
                {tab === 'tutoria' && <Tutoria tutoria={data.tutoria} />}
                {tab === 'timeline' && <Timeline items={data.timeline} />}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
