import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateInMexico, formatDateTimeInMexico } from '../../utils/timezone';
import { formatCarrera, formatNombre } from '../../utils/presentacion';

const TABS = [
  ['resumen', 'Resumen'],
  ['trayectoria', 'Trayectoria'],
  ['materias', 'Materias'],
  ['asistencia', 'Asistencia'],
  ['evaluaciones', 'Evaluaciones'],
  ['acuerdos', 'Acuerdos'],
  ['tutoria', 'Tutoría'],
  ['timeline', 'Historial'],
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
  BASE_INSUFICIENT: 'bg-slate-500/5 text-slate-500 border-slate-400/40 border-dashed',
  SIN_DATOS: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};
const ICONO_ESTADO_MATERIA = { RIESGO_ALTO: '▲', RIESGO_MEDIO: '●', REGULAR: '✓', BASE_INSUFICIENT: '◌', SIN_DATOS: '○' };

const fmt = value => value
  ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
    .toLocaleDateString('es-MX', { dateStyle: 'medium' })
  : '—';
const fmtFechaHora = value => {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateInMexico(value, { dateStyle: 'medium' });
  }
  return formatDateTimeInMexico(value, { dateStyle: 'medium', timeStyle: 'short' });
};
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

function Trayectoria({ trayectoria = [] }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [mostrarCambios, setMostrarCambios] = useState(false);
  const cambios = trayectoria.flatMap(t => (t.cambios_inscripcion || []).map(cambio => ({ ...cambio, curso: t })));
  const etiquetaInscripcion = estado => estado === 'ACTIVO' ? 'Inscripción vigente' : estado === 'CONCLUIDA' ? 'Periodo concluido' : 'Inscripción anterior';

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div><h2 className="font-semibold">Trayectoria por cuatrimestre</h2><p className="text-xs text-slate-500">Una fila representa cada cuatrimestre cursado. Los ajustes administrativos equivalentes se conservan por separado.</p></div>
        {!!cambios.length && <button type="button" onClick={() => setMostrarCambios(valor => !valor)} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs font-semibold text-blue-500 hover:bg-blue-500/5">{mostrarCambios ? 'Ocultar cambios de inscripción' : `Ver cambios de inscripción (${cambios.length})`}</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className={`border-y text-xs uppercase ${isDay ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-white/10 bg-white/[0.025] text-slate-500'}`}><tr><th className="px-5 py-3">Periodo</th><th>Cuatrimestre</th><th>Grupo</th><th>Situación académica</th><th>Resolución</th></tr></thead>
          <tbody className={isDay ? 'divide-y divide-slate-100' : 'divide-y divide-white/5'}>{trayectoria.map(t => <tr key={t.inscripcion_id}><td className="px-5 py-3 font-semibold">{t.periodo}</td><td>{t.cuatrimestre}°</td><td>{t.grupo}</td><td><Badge className={t.estado_inscripcion === 'ACTIVO' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-slate-500/30 bg-slate-500/10 text-slate-500'}>{etiquetaInscripcion(t.estado_inscripcion)}</Badge></td><td><span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-500">{t.resolucion?.replaceAll('_',' ') || (t.estado_inscripcion === 'ACTIVO' ? 'EN CURSO' : 'SIN RESOLUCIÓN')}</span>{t.periodo_destino && <span className="ml-2 text-xs text-slate-500">→ {t.periodo_destino}</span>}</td></tr>)}</tbody>
        </table>
        {!trayectoria.length && <p className="p-8 text-center text-sm text-slate-500">Sin trayectoria registrada.</p>}
      </div>
      {mostrarCambios && <div className={`border-t px-5 py-4 ${isDay ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]'}`}><h3 className="text-sm font-semibold">Historial de movimientos administrativos</h3><p className="mt-1 text-xs text-slate-500">Estos movimientos no representan cuatrimestres adicionales cursados.</p><div className="mt-3 space-y-2">{cambios.map(cambio => <div key={cambio.inscripcion_id} className={`rounded-lg border p-3 text-xs ${isDay ? 'border-slate-200 bg-white' : 'border-white/10 bg-slate-900/60'}`}><span className="font-semibold">{cambio.curso.periodo} · {cambio.curso.cuatrimestre}° {cambio.curso.grupo}</span><span className="mx-2 text-slate-400">—</span><span>Inscripción anterior</span><span className="ml-2 text-slate-500">Registrada: {fmtFechaHora(cambio.inscrito_en)}</span>{cambio.carrera && cambio.carrera !== cambio.curso.carrera && <p className="mt-1 text-slate-500">Catálogo anterior: {cambio.carrera}</p>}</div>)}</div></div>}
    </Panel>
  );
}

function MateriasTable({ materias, compact = false }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className={`text-xs uppercase ${isDay ? 'bg-slate-50 text-slate-600' : 'bg-white/[0.035] text-slate-400'}`}>
          <tr>
            <th className="px-4 py-3">Materia</th>
            <th className="px-4 py-3">Docente</th>
            <th className="px-4 py-3 text-center">Evidencias</th>
            <th className="px-4 py-3 text-center">Clases</th>
            <th className="px-4 py-3 text-center">Promedio</th>
            <th className="px-4 py-3 text-center">Asistencia</th>
            <th className="px-4 py-3 text-center">Faltas</th>
            <th className="px-4 py-3 text-center">Consecutivas</th>
            <th className="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody className={isDay ? 'divide-y divide-slate-100' : 'divide-y divide-white/5'}>
          {materias.slice(0, compact ? 5 : undefined).map(m => (
            <tr key={m.clave} className={isDay ? 'hover:bg-slate-50' : 'hover:bg-white/[0.025]'}>
              <td className={`px-4 py-3 font-semibold ${isDay ? 'text-slate-950' : 'text-white'}`}>{m.materia}</td>
              <td className="px-4 py-3 text-slate-500">{m.docente || '—'}</td>
              <td className="px-4 py-3 text-center">{m.evaluaciones_registradas}</td>
              <td className="px-4 py-3 text-center">{m.clases_registradas}</td>
              <td className="px-4 py-3 text-center font-semibold">{m.promedio_evidencias ?? '—'}</td>
              <td className="px-4 py-3 text-center">{m.porcentaje_asistencia != null ? `${m.porcentaje_asistencia}%` : '—'}</td>
              <td className={`px-4 py-3 text-center ${m.falta ? 'text-red-400' : 'text-slate-500'}`}>{m.falta}</td>
              <td className="px-4 py-3 text-center">{m.faltas_consecutivas ?? '—'}</td>
              <td className="px-4 py-3"><Badge className={`${ESTADO_MATERIA[m.estado]} whitespace-nowrap`}>{ICONO_ESTADO_MATERIA[m.estado]} {m.estado === 'BASE_INSUFICIENT' ? 'SIN BASE' : labelEstado(m.estado)}</Badge></td>
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
  const tendencias = r.tendencias_asistencia;
  const calidad = r.calidad_datos;
  const tonoVariacion = valor => valor == null ? 'text-slate-500' : valor < 0 ? 'text-red-400' : valor > 0 ? 'text-emerald-400' : 'text-slate-400';
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Asistencia global" value={r.asistencia_global != null ? `${r.asistencia_global}%` : '—'} hint={`${r.clases_con_asistencia} de ${r.minimo_clases_semaforo} clases mínimas para emitir semáforo`} tone={!r.base_suficiente ? 'text-slate-500' : r.asistencia_global != null && r.asistencia_global < 80 ? 'text-red-400' : 'text-emerald-400'} />
        <Kpi label="Prom. evidencias" value={r.promedio_evidencias} hint="No oficial" tone="text-violet-400" />
        <Kpi label="Materias en riesgo" value={r.materias_riesgo} hint={!r.base_suficiente ? 'Clasificación académica preliminar' : 'Según asistencia y evidencias disponibles'} tone={r.materias_riesgo ? 'text-red-400' : 'text-slate-500'} />
      </div>
      <Panel className="px-4 py-3 text-sm text-slate-500"><span className="font-semibold">{r.materias_inscritas} {r.materias_inscritas === 1 ? 'materia este cuatrimestre' : 'materias este cuatrimestre'}</span> · <span className={r.acuerdos_pendientes ? 'text-amber-500' : ''}>{r.acuerdos_pendientes} acuerdos pendientes</span> · <span className={r.reportes_abiertos ? 'text-orange-500' : ''}>{r.reportes_abiertos} reportes abiertos</span> · {r.canalizaciones_activas} canalizaciones activas</Panel>

      {(tendencias || calidad) && (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
          {tendencias && <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">Tendencia reciente de asistencia</h2><p className="mt-1 text-xs text-slate-500">Ventanas calculadas hasta la última clase registrada: {fmt(tendencias.fecha_referencia)}.</p></div>
              <button onClick={() => setTab('asistencia')} className="text-xs font-semibold text-blue-400">Ver análisis completo →</button>
            </div>
            {!tendencias.calculable ? <div className="mt-4 rounded-xl border border-slate-500/20 bg-slate-500/[0.05] p-4"><p className="font-semibold text-slate-500">Aún no hay suficientes clases para calcular una tendencia</p><p className="mt-1 text-xs text-slate-500">Hay {tendencias.registros_total} {tendencias.registros_total === 1 ? 'registro' : 'registros'}; se requieren al menos {tendencias.minimo_registros}. La asistencia actual se conserva como dato preliminar.</p></div> : <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['Últimos 7 días', tendencias.ultimos_7_dias, tendencias.variacion_7_dias_vs_global],
                ['Últimos 30 días', tendencias.ultimos_30_dias, tendencias.variacion_30_dias_vs_global],
              ].map(([label, periodo, variacion]) => <div key={label} className="rounded-xl border border-slate-500/15 p-4">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <div className="mt-1 flex items-end justify-between gap-3"><p className="text-2xl font-bold">{periodo?.porcentaje != null ? `${periodo.porcentaje}%` : 'Sin datos'}</p><p className={`text-xs font-semibold ${tonoVariacion(variacion)}`}>{variacion == null ? 'Sin comparación' : `${variacion > 0 ? '+' : ''}${variacion} pp vs. global`}</p></div>
                <p className="mt-2 text-[10px] text-slate-500">{periodo?.registros || 0} {periodo?.registros === 1 ? 'registro' : 'registros'} · {periodo?.falta || 0} faltas · {periodo?.retardo || 0} retardos</p>
              </div>)}
            </div>}
          </Panel>}
          {calidad && <Panel className="p-5">
            <h2 className="font-semibold">Vigencia y calidad de datos</h2>
            <p className="mt-1 text-xs text-slate-500">Última clase: {fmt(calidad.ultima_clase)}{calidad.ultima_actualizacion_asistencia ? ` · Asistencia actualizada: ${fmtFechaHora(calidad.ultima_actualizacion_asistencia)}` : ''}</p>
            <div className="mt-4 space-y-2">
              {calidad.advertencias.map((advertencia, index) => <div key={index} className={`rounded-lg border px-3 py-2 text-xs ${advertencia.startsWith('Sin advertencias') ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-400'}`}>{advertencia}</div>)}
            </div>
            {!!calidad.materias_sin_asistencia.length && <p className="mt-3 text-[10px] text-slate-500"><b>Sin asistencias:</b> {calidad.materias_sin_asistencia.join(', ')}</p>}
            {!!calidad.materias_sin_evidencias.length && <p className="mt-2 text-[10px] text-slate-500"><b>Sin evidencias:</b> {calidad.materias_sin_evidencias.join(', ')}</p>}
          </Panel>}
        </div>
      )}

      <Panel className={`p-5 ${sem.box}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-base ${sem.text}`}>{r.semaforo === 'ROJO' ? '▲' : r.semaforo === 'AMARILLO' ? '●' : r.semaforo === 'VERDE' ? '✓' : '◌'}</span>
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

function Asistencia({ data }) {
  const materias = data.materias;
  const [excluirJustificadas, setExcluirJustificadas] = useState(true);
  const [mostrarAnalisis, setMostrarAnalisis] = useState(false);
  const patron = data.patrones_asistencia?.[
    excluirJustificadas ? 'excluyendo_justificadas' : 'incluyendo_justificadas'
  ];
  const max = Math.max(100, ...materias.map(m => m.porcentaje_asistencia || 0));
  const confianzaBaja = patron?.resumen?.confianza === 'BAJA';
  const hayDesglose = Boolean(patron && [
    patron.resumen.faltas,
    patron.resumen.faltas_tempranas,
    patron.resumen.dias_ausencia_parcial,
    patron.resumen.dias_ausencia_completa,
    patron.resumen.primera_hora_ausente_luego_asistio,
  ].some(Number));
  const tonoConfianza = {
    ALTA: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    MEDIA: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    BAJA: 'border-slate-500/30 bg-slate-500/10 text-slate-400',
  };
  const colorCelda = bloque => {
    if (!bloque.total) return 'bg-slate-500/5 text-slate-500';
    if (bloque.porcentaje_asistencia < 70) return 'bg-red-500/20 text-red-400';
    if (bloque.porcentaje_asistencia < 90) return 'bg-amber-500/20 text-amber-400';
    return 'bg-emerald-500/20 text-emerald-400';
  };
  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <h2 className="font-semibold">Comparación entre materias</h2>
        <p className="mt-1 text-xs text-slate-500">Permite detectar si las ausencias se concentran en asignaturas específicas.</p>
        <div className="mt-5 space-y-4">
          {materias.map(m => {
            const porcentaje = m.porcentaje_asistencia || 0;
            const muestraInsuficiente = Number(m.clases_registradas || 0) < 3;
            const color = muestraInsuficiente ? 'bg-slate-400' : porcentaje < 80 ? 'bg-red-500' : porcentaje < 90 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <div key={m.clave}>
                <div className="mb-1 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{m.materia}</p><p className="text-[10px] text-slate-500">{m.docente}</p></div>
                  <span className={`shrink-0 font-bold ${muestraInsuficiente ? 'text-slate-400' : ''}`}>{m.porcentaje_asistencia != null ? `${m.porcentaje_asistencia}%` : 'Sin datos'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-500/15"><div className={`h-full rounded-full ${color}`} style={{ width: `${porcentaje * 100 / max}%` }} /></div>
                <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500"><span>{m.clases_registradas || 0} clases registradas</span>{muestraInsuficiente && m.porcentaje_asistencia != null && <span className="font-semibold text-slate-400">Muestra insuficiente</span>}<span>{m.presente} presentes</span><span>{m.falta} faltas</span><span>{m.retardo} retardos</span><span>{m.justificada} justificadas</span></div>
              </div>
            );
          })}
        </div>
      </Panel>

      {patron && (
        <>
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Patrones de asistencia</h2>
                <p className="mt-1 text-xs text-slate-500">Analiza cuándo ocurren las ausencias y si el alumno entra a clases posteriores.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={excluirJustificadas} onChange={e => setExcluirJustificadas(e.target.checked)} className="h-4 w-4 accent-blue-600" />
                Excluir justificadas del análisis
              </label>
            </div>
            <div className="mt-4 rounded-xl border border-blue-500/25 bg-blue-500/[0.08] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-blue-400">Hallazgo principal</p>
                <Badge className={tonoConfianza[patron.resumen.confianza]}>Confianza {patron.resumen.confianza.toLowerCase()}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-400">{patron.resumen.hallazgo}</p>
            </div>
            {hayDesglose ? <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Registros analizados" value={patron.resumen.registros_analizados} />
              <Kpi label="Faltas analizadas" value={patron.resumen.faltas} tone="text-red-400" />
              <Kpi label="Faltas tempranas" value={patron.resumen.faltas_tempranas} hint={`${patron.resumen.porcentaje_faltas_tempranas}% del total`} tone="text-orange-400" />
              <Kpi label="Ausencias parciales" value={patron.resumen.dias_ausencia_parcial} tone="text-amber-400" />
              <Kpi label="Ausencias completas" value={patron.resumen.dias_ausencia_completa} tone="text-red-400" />
              <Kpi label="Faltó y entró después" value={patron.resumen.primera_hora_ausente_luego_asistio} tone="text-violet-400" />
            </div> : <p className="mt-4 rounded-lg bg-slate-500/[0.06] px-4 py-3 text-sm text-slate-500">{patron.resumen.registros_analizados} registros analizados · sin ausencias que desglosar.</p>}
            {confianzaBaja && <button type="button" onClick={() => setMostrarAnalisis(value => !value)} className="mt-4 text-sm font-semibold text-emerald-500 hover:text-emerald-400">{mostrarAnalisis ? 'Ocultar análisis detallado' : 'Ver análisis detallado'}</button>}
          </Panel>

          {(!confianzaBaja || mostrarAnalisis) && <>
            <Panel className="overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="font-semibold">Mapa semanal</h2>
                <p className="text-xs text-slate-500">Porcentaje de asistencia acumulado por día y horario.</p>
              </div>
              <div className="overflow-x-auto p-4 pt-0">
                <table className="w-full min-w-[760px] border-separate border-spacing-1 text-xs">
                  <thead><tr><th className="p-2 text-left text-slate-500">Día</th>{patron.bloques.map(b => <th key={`${b.hora_inicio}-${b.hora_fin}`} className="min-w-[110px] whitespace-nowrap p-2 text-center text-slate-500">{b.hora_inicio}–{b.hora_fin}</th>)}</tr></thead>
                  <tbody>
                    {patron.mapa_semanal.map(dia => (
                      <tr key={dia.dia_num}>
                        <th className="p-2 text-left font-semibold">{dia.dia}</th>
                        {dia.bloques.map(bloque => (
                          <td key={`${dia.dia_num}-${bloque.hora_inicio}`} title={`${bloque.total} registro(s), ${bloque.falta} falta(s), ${bloque.retardo} retardo(s)`} className={`rounded-lg p-3 text-center font-bold ${colorCelda(bloque)}`}>
                            {bloque.total ? `${bloque.porcentaje_asistencia}%` : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500"><span>🟢 90–100%</span><span>🟡 70–89%</span><span>🔴 Menor a 70%</span><span>Gris: sin clase registrada</span></div>
              </div>
            </Panel>

          <Panel className="overflow-hidden">
            <div className="px-5 py-4">
              <h2 className="font-semibold">Días con ausencia parcial</h2>
              <p className="text-xs text-slate-500">Días en los que faltó a una clase, pero sí tuvo asistencia registrada en otra.</p>
            </div>
            <div className="divide-y divide-white/5">
              {patron.ausencias_parciales.map(dia => (
                <div key={dia.fecha} className="grid gap-3 px-5 py-4 md:grid-cols-[160px_1fr]">
                  <div><p className="font-semibold">{fmt(dia.fecha)}</p>{dia.primera_hora_ausente && <Badge className="mt-1 border-red-500/30 bg-red-500/10 text-red-400">Faltó a primera hora</Badge>}</div>
                  <div className="flex flex-wrap gap-2">
                    {dia.registros.map((registro, index) => (
                      <div key={`${registro.hora_inicio}-${index}`} className={`rounded-lg border px-3 py-2 text-xs ${registro.estado === 'FALTA' ? 'border-red-500/30 bg-red-500/10 text-red-400' : registro.estado === 'RETARDO' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'}`}>
                        <b>{registro.hora_inicio}</b> · {registro.materia}<span className="ml-1 opacity-75">({labelEstado(registro.estado)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!patron.ausencias_parciales.length && <p className="p-8 text-center text-sm text-slate-500">No se detectaron días con ausencia parcial.</p>}
            </div>
          </Panel>
          </>}
        </>
      )}
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

function Acuerdos({ acuerdos, onDeleted, puedeDepurar = false }) {
  const [materia, setMateria] = useState('TODAS');
  const [estado, setEstado] = useState('TODOS');
  const [tipo, setTipo] = useState('TODOS');
  const [responsable, setResponsable] = useState('TODOS');
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [motivoEliminacion, setMotivoEliminacion] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminacion, setErrorEliminacion] = useState('');
  const materias = useMemo(() => [...new Set(acuerdos.map(a => a.materia).filter(Boolean))].sort(), [acuerdos]);
  const responsables = useMemo(() => [...new Set(acuerdos.map(a => a.docente).filter(Boolean))].sort(), [acuerdos]);
  const visibles = acuerdos.filter(a => (
    (materia === 'TODAS' || a.materia === materia)
    && (estado === 'TODOS' || a.estado === estado)
    && (tipo === 'TODOS' || a.tipo_contexto === tipo)
    && (responsable === 'TODOS' || a.docente === responsable)
  ));
  const eliminarPrueba = async acuerdo => {
    if (motivoEliminacion.trim().length < 8) {
      setErrorEliminacion('El motivo debe tener al menos 8 caracteres.');
      return;
    }
    setEliminando(true);
    setErrorEliminacion('');
    try {
      await api.delete(`/expediente-academico/acuerdos/${acuerdo.id}`, { data: { motivo: motivoEliminacion.trim() } });
      onDeleted?.(acuerdo.id);
      setConfirmandoId(null);
      setMotivoEliminacion('');
    } catch (error) {
      setErrorEliminacion(error.response?.data?.detail || 'No se pudo eliminar el acuerdo.');
    } finally {
      setEliminando(false);
    }
  };
  return (
    <div className="space-y-3">
      {!!acuerdos.length && <Panel className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-slate-500">Materia<select className="input-dark mt-1 w-full" value={materia} onChange={e => setMateria(e.target.value)}><option value="TODAS">Todas las materias</option>{materias.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-500">Estado<select className="input-dark mt-1 w-full" value={estado} onChange={e => setEstado(e.target.value)}><option value="TODOS">Todos los estados</option>{[...new Set(acuerdos.map(a => a.estado))].map(item => <option key={item} value={item}>{labelEstado(item)}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-500">Tipo<select className="input-dark mt-1 w-full" value={tipo} onChange={e => setTipo(e.target.value)}><option value="TODOS">Todos los tipos</option><option value="MATERIA">Acuerdo de materia</option><option value="GENERAL">Acuerdo general</option></select></label>
          <label className="text-xs font-semibold text-slate-500">Registrado por<select className="input-dark mt-1 w-full" value={responsable} onChange={e => setResponsable(e.target.value)}><option value="TODOS">Todos los responsables</option>{responsables.map(item => <option key={item}>{item}</option>)}</select></label>
        </div>
      </Panel>}
      {visibles.map(a => (
        <Panel key={a.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{a.titulo}</p><Badge className="border-blue-500/30 bg-blue-500/10 text-blue-400">{a.tipo_contexto === 'MATERIA' ? 'ACUERDO DE MATERIA' : 'ACUERDO GENERAL'}</Badge></div>
              <p className="mt-1 text-xs text-slate-500">{a.materia || 'Sin materia relacionada'}{a.grupo ? ` · ${a.grupo}` : ''}{a.periodo ? ` · ${a.periodo}` : ''}</p>
              <p className="mt-1 text-xs text-slate-500">Registrado por: <span className="font-semibold text-slate-400">{a.docente || 'Responsable no disponible'}</span> · {fmtFechaHora(a.creado_en)}</p>
            </div>
            <Badge className={a.estado === 'PENDIENTE' ? 'border-amber-500/30 bg-amber-500/15 text-amber-400' : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'}>{a.estado}</Badge>
          </div>
          {a.detalle && <p className="mt-3 text-sm text-slate-400">{a.detalle}</p>}
          <p className="mt-2 text-xs text-blue-400">Fecha de revisión: {fmt(a.fecha_revision)}</p>
          {a.resultado && <p className="mt-2 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-300"><b>Resultado:</b> {a.resultado}</p>}
          {puedeDepurar && <div className="mt-3 border-t border-red-500/10 pt-3">
            {confirmandoId !== a.id ? <button type="button" onClick={() => { setConfirmandoId(a.id); setMotivoEliminacion(''); setErrorEliminacion(''); }} className="text-xs font-semibold text-red-400 hover:text-red-300">Eliminar registro de prueba</button> : <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3">
              <p className="text-sm font-semibold text-red-400">Confirmar eliminación definitiva</p>
              <p className="mt-1 text-xs text-slate-500">El acuerdo desaparecerá del expediente, pero se conservará una copia de sus datos y el motivo en auditoría.</p>
              <textarea autoFocus rows={2} value={motivoEliminacion} onChange={e => setMotivoEliminacion(e.target.value)} className="input-dark mt-3 w-full" placeholder="Escribe el motivo obligatorio…" />
              {errorEliminacion && <p className="mt-2 text-xs text-red-400">{errorEliminacion}</p>}
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={eliminando} onClick={() => eliminarPrueba(a)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{eliminando ? 'Eliminando…' : 'Sí, eliminar definitivamente'}</button><button type="button" disabled={eliminando} onClick={() => { setConfirmandoId(null); setMotivoEliminacion(''); setErrorEliminacion(''); }} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs font-semibold text-slate-400">Cancelar</button></div>
            </div>}
          </div>}
        </Panel>
      ))}
      {!!acuerdos.length && !visibles.length && <Panel className="p-8 text-center text-sm text-slate-500">No hay acuerdos que coincidan con los filtros.</Panel>}
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

function Timeline({ alumnoId, materias }) {
  const [items, setItems] = useState([]);
  const [tipo, setTipo] = useState('TODOS');
  const [materiaClave, setMateriaClave] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError('');
    api.get(`/expediente-academico/alumnos/${alumnoId}/timeline`, {
      params: {
        tipo, pagina, limite: 20,
        ...(materiaClave ? { materia_clave: materiaClave } : {}),
        ...(fechaInicio ? { fecha_inicio: fechaInicio } : {}),
        ...(fechaFin ? { fecha_fin: fechaFin } : {}),
      },
    }).then(({ data }) => {
      if (cancelado) return;
      setItems(data.items);
      setHayMas(data.paginacion.hay_mas);
    }).catch(err => {
      if (!cancelado) setError(err.response?.data?.detail || 'No se pudo consultar la línea de tiempo.');
    }).finally(() => {
      if (!cancelado) setLoading(false);
    });
    return () => { cancelado = true; };
  }, [alumnoId, tipo, materiaClave, fechaInicio, fechaFin, pagina]);

  const cambiarFiltro = setter => event => { setter(event.target.value); setPagina(1); };
  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-slate-500">Tipo de evento<select value={tipo} onChange={cambiarFiltro(setTipo)} className="input-dark mt-1 w-full"><option value="TODOS">Todos</option><option value="ASISTENCIA">Asistencia excepcional</option><option value="EVALUACION">Evaluaciones</option><option value="ACUERDO">Acuerdos</option><option value="REPORTE">Reportes</option><option value="TUTORIA">Tutoría</option></select></label>
          <label className="text-xs font-semibold text-slate-500">Materia<select value={materiaClave} onChange={cambiarFiltro(setMateriaClave)} className="input-dark mt-1 w-full"><option value="">Todas las materias</option>{materias.map(materia => <option key={materia.clave} value={materia.clave}>{materia.materia}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-500">Desde<input type="date" value={fechaInicio} max={fechaFin || undefined} onChange={cambiarFiltro(setFechaInicio)} className="input-dark mt-1 w-full" /></label>
          <label className="text-xs font-semibold text-slate-500">Hasta<input type="date" value={fechaFin} min={fechaInicio || undefined} onChange={cambiarFiltro(setFechaFin)} className="input-dark mt-1 w-full" /></label>
        </div>
        {(tipo !== 'TODOS' || materiaClave || fechaInicio || fechaFin) && <button type="button" onClick={() => { setTipo('TODOS'); setMateriaClave(''); setFechaInicio(''); setFechaFin(''); setPagina(1); }} className="mt-3 text-xs font-semibold text-blue-400">Limpiar filtros</button>}
      </Panel>
      <Panel className="p-5">
        <h2 className="font-semibold">Línea de tiempo académica</h2>
        <p className="mt-1 text-xs text-slate-500">Asistencia excepcional, evaluaciones, acuerdos y seguimiento tutorial.</p>
        {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        {loading && <p className="py-8 text-center text-sm text-slate-500">Consultando movimientos…</p>}
        {!loading && <div className="mt-5 space-y-0">
        {items.map((e, i) => (
          <div key={e.id || `${e.tipo}-${e.fecha}-${i}`} className="grid grid-cols-[16px_1fr] gap-3">
            <div className="flex flex-col items-center"><span className={`mt-1 h-3 w-3 rounded-full ${e.tipo === 'ASISTENCIA' ? 'bg-red-400' : e.tipo === 'EVALUACION' ? 'bg-violet-400' : e.tipo === 'TUTORIA' ? 'bg-cyan-400' : e.tipo === 'REPORTE' ? 'bg-orange-400' : 'bg-blue-400'}`} />{i < items.length - 1 && <span className="w-px flex-1 bg-slate-500/20" />}</div>
            <div className="pb-5"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{e.titulo}</p><Badge className="border-slate-500/30 text-slate-400">{e.tipo}</Badge>{e.estado && <Badge className="border-amber-500/30 text-amber-400">{labelEstado(e.estado)}</Badge>}</div>{e.descripcion && <p className="mt-1 text-sm text-slate-400">{e.descripcion}</p>}<p className="mt-1 text-[10px] text-slate-500">{fmtFechaHora(e.fecha)}{e.materia ? ` · ${e.materia}` : ''}</p></div>
          </div>
        ))}
        {!items.length && !error && <p className="py-8 text-center text-sm text-slate-500">No hay movimientos que coincidan con los filtros.</p>}
        </div>}
        <div className="mt-3 flex items-center justify-between border-t border-slate-500/15 pt-3"><p className="text-xs text-slate-500">Página {pagina}</p><div className="flex gap-2"><button disabled={pagina <= 1 || loading} onClick={() => setPagina(valor => valor - 1)} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs disabled:opacity-30">Anterior</button><button disabled={!hayMas || loading} onClick={() => setPagina(valor => valor + 1)} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs disabled:opacity-30">Siguiente</button></div></div>
      </Panel>
    </div>
  );
}

const ESTADO_ALUMNO = {
  RIESGO: 'border-red-500/30 bg-red-500/10 text-red-500',
  ATENCION: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  REGULAR: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  BASE_INSUFICIENT: 'border-slate-400/40 border-dashed bg-slate-500/5 text-slate-500',
  SIN_DATOS: 'border-slate-500/30 bg-slate-500/10 text-slate-500',
};

const ICONO_ESTADO_ALUMNO = { RIESGO: '▲', ATENCION: '●', REGULAR: '✓', BASE_INSUFICIENT: '◌', SIN_DATOS: '○' };

function PanoramaGrupo({ grupoId, seleccionarAlumno, materiaInicial = '', estadoInicial = 'TODOS', paginaInicial = 1, onFiltros, onCambiarGrupo }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [panorama, setPanorama] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState(estadoInicial);
  const [materiaClave, setMateriaClave] = useState(materiaInicial);
  const [pagina, setPagina] = useState(paginaInicial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const primeraActualizacionFiltros = useRef(true);

  const cargar = useCallback(async () => {
    if (!grupoId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/expediente-academico/panorama/grupos/${grupoId}/alumnos`, {
        params: { q: busqueda, estado, pagina, limite: 25, materia_clave: materiaClave || undefined },
      });
      setPanorama(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar el panorama del grupo.');
    } finally {
      setLoading(false);
    }
  }, [grupoId, busqueda, estado, materiaClave, pagina]);

  useEffect(() => {
    const timer = setTimeout(cargar, 250);
    return () => clearTimeout(timer);
  }, [cargar]);

  useEffect(() => {
    if (primeraActualizacionFiltros.current) { primeraActualizacionFiltros.current = false; return; }
    setPagina(1);
  }, [busqueda, estado, materiaClave]);
  useEffect(() => { onFiltros?.({ materia: materiaClave, estado, pagina }); }, [materiaClave, estado, pagina, onFiltros]);

  if (!grupoId) return null;
  if (!panorama && loading) return <Panel className="p-10 text-center text-sm text-slate-500">Calculando indicadores del grupo…</Panel>;
  if (!panorama) return <Panel className="p-8 text-center text-sm text-red-400">{error || 'Sin información del grupo.'}</Panel>;

  const r = panorama.resumen;
  const cumplimiento = r.cumplimiento_sesiones;
  const materiaSeleccionada = panorama.materia_seleccionada;
  const baseSuficiente = r.clases_registradas >= r.minimo_clases_semaforo;
  if (loading) return <div className="space-y-4" aria-live="polite"><Panel className="p-5"><div className="h-5 w-2/3 animate-pulse rounded bg-slate-500/20"/><div className="mt-3 h-10 animate-pulse rounded bg-slate-500/10"/></Panel><div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-500/10"/>)}</div><Panel className="h-64 animate-pulse"/></div>;
  return (
    <div className="space-y-4">
      <Panel className="sticky top-0 z-20 p-4 shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Grupo seleccionado</p><h2 className="font-bold">{panorama.grupo.cuatrimestre}° {panorama.grupo.grupo} · {panorama.grupo.carrera}</h2><p className="text-xs text-slate-500">{panorama.grupo.periodo} · {r.total_alumnos} alumnos{materiaSeleccionada?.docentes?.length ? ` · Docente: ${materiaSeleccionada.docentes.join(', ')}` : ''}</p></div>
          <div className="flex flex-wrap items-end gap-2"><label className="text-xs font-bold text-blue-400">Alcance del panorama<select value={materiaClave} onChange={e => setMateriaClave(e.target.value)} className="input-dark mt-1 min-w-64 border-blue-500/40"><option value="">Todas las materias</option>{panorama.materias.map(materia => <option key={materia.clave} value={materia.clave}>{materia.nombre}</option>)}</select></label><button type="button" onClick={() => { setMateriaClave(''); setEstado('TODOS'); setBusqueda(''); setPagina(1); }} className="rounded-xl border border-slate-500/20 px-3 py-2.5 text-xs font-semibold text-slate-500">Limpiar</button><button type="button" onClick={onCambiarGrupo} className="rounded-xl border border-blue-500/30 px-3 py-2.5 text-xs font-semibold text-blue-400">Cambiar grupo</button></div>
        </div>
      </Panel>
      <div className={`rounded-xl border px-4 py-3 text-xs ${baseSuficiente ? 'border-blue-500/20 bg-blue-500/[0.06] text-blue-400' : 'border-slate-500/30 bg-slate-500/[0.06] text-slate-500'}`}>{materiaSeleccionada ? `Indicadores de ${materiaSeleccionada.nombre}.` : 'Indicadores consolidados de todas las materias.'} {baseSuficiente ? `${r.clases_registradas} clases registradas.` : `Base preliminar: ${r.clases_registradas} de ${r.minimo_clases_semaforo} clases mínimas; los porcentajes aún no generan semáforo.`}</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label={materiaSeleccionada ? 'Asistencia de la materia' : 'Asistencia global'} value={r.asistencia_global != null ? `${r.asistencia_global}%` : '—'} hint={`${r.clases_registradas} clase(s) registrada(s) · Presente, retardo o justificada sobre pases capturados`} tone={!baseSuficiente ? 'text-slate-500' : r.asistencia_global != null && r.asistencia_global < 80 ? 'text-red-400' : 'text-emerald-400'} />
        <Kpi label="Alumnos en riesgo" value={r.alumnos_riesgo} hint={baseSuficiente ? 'Según asistencia, evidencias y rachas disponibles' : 'El semáforo académico espera evidencia suficiente'} tone={r.alumnos_riesgo ? 'text-red-400' : 'text-slate-500'} />
        <Kpi
          label="Listas completas"
          value={r.cobertura_asistencia_detalle ? `${r.cobertura_asistencia_detalle.registros_capturados} de ${r.cobertura_asistencia_detalle.registros_esperados}` : '—'}
          hint={r.cobertura_asistencia_detalle
            ? `Pases capturados en ${r.cobertura_asistencia_detalle.clases_registradas} clase(s) registrada(s); no mide clases programadas`
            : 'Asistencias capturadas'}
          tone="text-blue-400"
        />
      </div>
      <Panel className="px-4 py-3 text-sm text-slate-500"><span className="font-semibold">{r.total_alumnos} alumnos</span> · <span className={r.alumnos_atencion ? 'text-amber-500' : ''}>{r.alumnos_atencion} requieren atención</span> · {r.base_insuficiente} con base insuficiente · {r.sin_datos} sin información · <span className={r.acuerdos_pendientes ? 'text-orange-500' : ''}>{r.acuerdos_pendientes} acuerdos pendientes</span> · Promedio de evidencias: {r.promedio_evidencias ?? 'sin captura'} <span className="text-xs">(no oficial)</span></Panel>

      {cumplimiento && <Panel className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Cumplimiento de sesiones programadas</h2>
              <Badge className={cumplimiento.disponible ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-500'}>{cumplimiento.disponible ? 'CALENDARIO OFICIAL' : 'NO CALCULABLE'}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">{cumplimiento.mensaje}</p>
            {cumplimiento.disponible && <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-500/15"><div className={`h-full rounded-full ${cumplimiento.porcentaje >= 85 ? 'bg-emerald-500' : cumplimiento.porcentaje >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, cumplimiento.porcentaje || 0)}%` }} /></div>
              <p className="mt-2 text-[10px] text-slate-500">Del {fmt(cumplimiento.fecha_inicio)} al {fmt(cumplimiento.fecha_corte)} · Se excluyen suspensiones y recesos publicados.</p>
            </div>}
          </div>
          {cumplimiento.disponible && <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 text-center sm:grid-cols-4">
            <div><p className="text-2xl font-bold text-blue-400">{cumplimiento.porcentaje ?? '—'}%</p><p className="text-[10px] text-slate-500">Cumplimiento</p></div>
            <div><p className="text-xl font-bold">{cumplimiento.sesiones_registradas}/{cumplimiento.sesiones_esperadas}</p><p className="text-[10px] text-slate-500">Registradas</p></div>
            <div><p className="text-xl font-bold text-red-400">{cumplimiento.sesiones_sin_registro}</p><p className="text-[10px] text-slate-500">Sin registro</p></div>
            <div><p className="text-xl font-bold text-violet-400">{cumplimiento.sesiones_adicionales}</p><p className="text-[10px] text-slate-500">Adicionales</p></div>
          </div>}
        </div>
      </Panel>}

      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{panorama.grupo.cuatrimestre}° {panorama.grupo.grupo} · {panorama.grupo.carrera}</h2>
            <p className="text-xs text-slate-500">{panorama.grupo.periodo} · {materiaSeleccionada ? materiaSeleccionada.nombre : `${r.materias} materias`} · {r.clases_registradas} clases registradas · {r.faltas_totales} faltas</p>
            {materiaSeleccionada?.docentes?.length > 0 && <p className="mt-1 text-xs font-medium text-blue-400">Docente{materiaSeleccionada.docentes.length === 1 ? '' : 's'}: {materiaSeleccionada.docentes.join(', ')}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-dark w-64" placeholder="Buscar en este grupo…" />
            <select value={estado} onChange={e => setEstado(e.target.value)} className="input-dark w-48">
              <option value="TODOS">Todos los estados</option>
              <option value="RIESGO">En riesgo</option>
              <option value="ATENCION">Requieren atención</option>
              <option value="REGULAR">Regulares</option>
              <option value="BASE_INSUFICIENT">Base insuficiente</option>
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
                  <td className="px-5 py-3">
                    <p className="font-semibold">{alumno.nombre}</p>
                    <p className="text-xs text-slate-500">{alumno.matricula}</p>
                    {!!alumno.razones_estado?.length && <p className="mt-1 max-w-md text-[10px] leading-4 text-slate-500">{alumno.razones_estado.slice(0, 2).join(' · ')}</p>}
                  </td>
                  <td className={`px-3 py-3 text-center font-bold ${alumno.estado === 'BASE_INSUFICIENT' ? 'text-slate-500' : alumno.asistencia != null && alumno.asistencia < 80 ? 'text-red-400' : 'text-emerald-400'}`}>{alumno.asistencia != null ? `${alumno.asistencia}%` : '—'}</td>
                  <td className={`px-3 py-3 text-center font-bold ${alumno.promedio_evidencias != null && alumno.promedio_evidencias < 7 ? 'text-red-400' : ''}`}>{alumno.promedio_evidencias ?? '—'}</td>
                  <td className="px-3 py-3 text-center text-red-400">{alumno.faltas}</td>
                  <td className="px-3 py-3 text-center">{alumno.faltas_consecutivas || '—'}</td>
                  <td className="px-3 py-3 text-center">{alumno.acuerdos_pendientes + alumno.reportes_abiertos}</td>
                  <td className="px-3 py-3"><Badge className={ESTADO_ALUMNO[alumno.estado]}>{ICONO_ESTADO_ALUMNO[alumno.estado]} {labelEstado(alumno.estado)}</Badge></td>
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
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [searchParams, setSearchParams] = useSearchParams();
  const [busqueda, setBusqueda] = useState('');
  const [alumnos, setAlumnos] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [grupoId, setGrupoId] = useState(Number(searchParams.get('grupo')) || null);
  const [mostrarSelectorGrupos, setMostrarSelectorGrupos] = useState(!searchParams.get('grupo'));
  const [busquedaGrupo, setBusquedaGrupo] = useState('');
  const [filtroCuatrimestre, setFiltroCuatrimestre] = useState('TODOS');
  const [filtroConfiguracion, setFiltroConfiguracion] = useState('TODOS');
  const [ordenGrupos, setOrdenGrupos] = useState({ campo: 'grupo', direccion: 'asc' });
  const [vistaGrupos, setVistaGrupos] = useState('LISTA');
  const [alumnoId, setAlumnoId] = useState(Number(searchParams.get('alumno')) || null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('resumen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalPdf, setModalPdf] = useState(false);
  const [opcionesPdf, setOpcionesPdf] = useState({ acuerdos: false, tutoria: false, asistencia: false, trayectoria: false, observaciones: false, omitirVacias: true });
  const [generandoPdf, setGenerandoPdf] = useState(false);

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
    if (alumnoId) return;
    api.get('/expediente-academico/panorama/grupos')
      .then(({ data: rows }) => {
        setGrupos(rows);
        if (!grupoId && rows.length) setGrupoId(rows[0].id);
      })
      .catch(err => setError(err.response?.data?.detail || 'No se pudieron consultar los grupos.'));
  }, [usuario?.rol, alumnoId]);
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
    setAlumnoId(id); setTab('resumen');
    const params = new URLSearchParams(searchParams);
    params.set('alumno', String(id));
    setSearchParams(params);
    setBusqueda('');
    setAlumnos([]);
  };
  const volverPanorama = () => {
    if (usuario?.rol === 'DOCENTE') {
      navigate('/docente/mis-tutorados?tab=alumnos');
      return;
    }
    setAlumnoId(null);
    setData(null);
    const params = new URLSearchParams(searchParams);
    params.delete('alumno');
    setSearchParams(params);
  };
  const seleccionarGrupo = id => {
    setGrupoId(id);
    setMostrarSelectorGrupos(false);
    const params = new URLSearchParams(searchParams);
    params.set('grupo', String(id));
    params.delete('materia'); params.delete('estado'); params.delete('pagina');
    setSearchParams(params);
  };
  const guardarFiltrosPanorama = useCallback(({ materia, estado, pagina }) => {
    const params = new URLSearchParams(window.location.search);
    if (grupoId) params.set('grupo', String(grupoId));
    materia ? params.set('materia', materia) : params.delete('materia');
    estado !== 'TODOS' ? params.set('estado', estado) : params.delete('estado');
    pagina > 1 ? params.set('pagina', String(pagina)) : params.delete('pagina');
    params.delete('alumno');
    setSearchParams(params, { replace: true });
  }, [grupoId, setSearchParams]);
  const descargarPdf = async () => {
    if (!alumnoId || generandoPdf) return;
    setGenerandoPdf(true); setError('');
    try {
      const { data: archivo, headers } = await api.get(`/expediente-academico/alumnos/${alumnoId}/exportar.pdf`, {
        params: {
          incluir_acuerdos: opcionesPdf.acuerdos,
          incluir_tutoria: opcionesPdf.tutoria,
          incluir_asistencia: opcionesPdf.asistencia,
          incluir_trayectoria: opcionesPdf.trayectoria,
          incluir_observaciones: opcionesPdf.observaciones,
          omitir_secciones_vacias: opcionesPdf.omitirVacias,
        },
        responseType: 'blob',
      });
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(archivo);
      enlace.download = headers['content-disposition']?.match(/filename="?([^";]+)"?/i)?.[1] || `Expediente_${data?.alumno?.matricula || alumnoId}.pdf`;
      enlace.click(); URL.revokeObjectURL(enlace.href); setModalPdf(false);
    } catch (err) { setError(err.response?.data?.detail || 'No se pudo generar el expediente PDF.'); }
    finally { setGenerandoPdf(false); }
  };

  const cuatrimestres = useMemo(() => [...new Set(grupos.map(grupo => grupo.cuatrimestre))].sort((a, b) => a - b), [grupos]);
  const resumenGrupos = useMemo(() => ({
    alumnos: grupos.reduce((total, grupo) => total + Number(grupo.total_alumnos || 0), 0),
    configurados: grupos.filter(grupo => Number(grupo.materias || 0) > 0).length,
    sinMaterias: grupos.filter(grupo => Number(grupo.materias || 0) === 0).length,
    carreras: new Set(grupos.map(grupo => grupo.carrera).filter(Boolean)).size,
  }), [grupos]);
  const gruposFiltrados = useMemo(() => {
    const termino = busquedaGrupo.trim().toLocaleLowerCase('es-MX');
    return grupos
      .filter(grupo => !termino || `${grupo.cuatrimestre} ${grupo.grupo} ${grupo.carrera} ${grupo.periodo}`.toLocaleLowerCase('es-MX').includes(termino))
      .filter(grupo => filtroCuatrimestre === 'TODOS' || String(grupo.cuatrimestre) === filtroCuatrimestre)
      .filter(grupo => filtroConfiguracion === 'TODOS'
        || (filtroConfiguracion === 'CONFIGURADOS' ? Number(grupo.materias || 0) > 0 : Number(grupo.materias || 0) === 0))
      .sort((a, b) => {
        const numericos = new Set(['grupo', 'total_alumnos', 'materias']);
        let comparacion;
        if (ordenGrupos.campo === 'grupo') comparacion = Number(a.cuatrimestre) - Number(b.cuatrimestre) || String(a.grupo).localeCompare(String(b.grupo), 'es-MX');
        else if (numericos.has(ordenGrupos.campo)) comparacion = Number(a[ordenGrupos.campo] || 0) - Number(b[ordenGrupos.campo] || 0);
        else comparacion = String(a[ordenGrupos.campo] || '').localeCompare(String(b[ordenGrupos.campo] || ''), 'es-MX', { sensitivity: 'base' });
        return ordenGrupos.direccion === 'asc' ? comparacion : -comparacion;
      });
  }, [grupos, busquedaGrupo, filtroCuatrimestre, filtroConfiguracion, ordenGrupos]);
  const ordenarGrupoPor = campo => setOrdenGrupos(actual => ({ campo, direccion: actual.campo === campo && actual.direccion === 'asc' ? 'desc' : 'asc' }));
  const indicadorOrden = campo => ordenGrupos.campo === campo ? (ordenGrupos.direccion === 'asc' ? '↑' : '↓') : '↕';

  return (
    <AdminLayout>
      <div className={`mx-auto max-w-[1800px] space-y-5 ${isDay ? 'text-slate-950' : 'text-white'}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">Seguimiento institucional</p>
            <h1 className="mt-1 text-2xl font-bold">{alumnoId ? 'Expediente del alumno' : 'Panorama académico'}</h1>
            <p className="mt-1 text-sm text-slate-500">{alumnoId ? (formatNombre(data?.alumno?.nombre) || 'Consulta académica individual') : 'Seguimiento por grupo y acceso al expediente individual de cada alumno.'}</p>
          </div>
          <div className="relative w-full max-w-md">
            <label className="text-xs font-semibold text-slate-500">{alumnoId ? (usuario?.rol === 'DOCENTE' ? 'Buscar otro de mis tutorados' : 'Buscar otro alumno en la institución') : 'Búsqueda directa de alumno'}</label>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-dark mt-1" placeholder="Escribe nombre o matrícula…" />
            {busqueda.trim().length >= 2 && (
              <Panel className="absolute right-0 top-full z-30 mt-2 max-h-80 w-full overflow-y-auto shadow-2xl">
                {alumnos.map(alumno => (
                  <button key={alumno.id} onClick={() => seleccionar(alumno.id)} className={`w-full border-b px-4 py-3 text-left ${isDay ? 'border-slate-100 hover:bg-slate-50' : 'border-white/5 hover:bg-white/5'}`}>
                    <p className="text-sm font-semibold">{formatNombre(alumno.nombre)}</p>
                    <p className="text-xs text-slate-500">{alumno.matricula} · {alumno.cuatrimestre}° {alumno.grupo} · <span title={alumno.carrera}>{formatCarrera(alumno.carrera)}</span></p>
                  </button>
                ))}
                {!alumnos.length && <p className="p-5 text-center text-sm text-slate-500">No se encontraron alumnos.</p>}
              </Panel>
            )}
          </div>
        </div>

        {!alumnoId && (
          <div className="space-y-4">
            {mostrarSelectorGrupos && <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Grupos activos" value={grupos.length} hint={`${resumenGrupos.carreras} carrera(s)`} tone="text-blue-400" />
              <Kpi label="Alumnos inscritos" value={resumenGrupos.alumnos} hint="En los grupos accesibles" tone="text-emerald-500" />
              <Kpi label="Grupos configurados" value={resumenGrupos.configurados} hint="Con al menos una materia" tone="text-violet-400" />
              <Kpi label="Sin materias" value={resumenGrupos.sinMaterias} hint="Requieren configuración" tone={resumenGrupos.sinMaterias ? 'text-amber-500' : 'text-emerald-500'} />
            </div>

            <Panel className="p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_210px_180px]">
                  <label className="text-xs font-semibold text-slate-500">Buscar grupo o carrera<input value={busquedaGrupo} onChange={e => setBusquedaGrupo(e.target.value)} className="input-dark mt-1" placeholder="Ej. Contaduría, 9° A…" /></label>
                  <label className="text-xs font-semibold text-slate-500">Cuatrimestre<select value={filtroCuatrimestre} onChange={e => setFiltroCuatrimestre(e.target.value)} className="input-dark mt-1"><option value="TODOS">Todos</option>{cuatrimestres.map(valor => <option key={valor} value={valor}>{valor}° cuatrimestre</option>)}</select></label>
                  <label className="text-xs font-semibold text-slate-500">Configuración<select value={filtroConfiguracion} onChange={e => setFiltroConfiguracion(e.target.value)} className="input-dark mt-1"><option value="TODOS">Todos los grupos</option><option value="CONFIGURADOS">Con materias</option><option value="SIN_MATERIAS">Sin materias</option></select></label>
                  <label className="text-xs font-semibold text-slate-500">Ordenar por<select value={ordenGrupos.campo} onChange={e => setOrdenGrupos({ campo: e.target.value, direccion: e.target.value === 'total_alumnos' ? 'desc' : 'asc' })} className="input-dark mt-1"><option value="grupo">Grado y grupo</option><option value="carrera">Carrera</option><option value="periodo">Periodo</option><option value="total_alumnos">Alumnos</option><option value="materias">Materias</option></select></label>
                </div>
                <div className={`flex shrink-0 rounded-xl border p-1 ${isDay ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.035]'}`} aria-label="Tipo de vista">
                  <button type="button" onClick={() => setVistaGrupos('LISTA')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${vistaGrupos === 'LISTA' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>☷ Lista</button>
                  <button type="button" onClick={() => setVistaGrupos('TARJETAS')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${vistaGrupos === 'TARJETAS' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>▦ Tarjetas</button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{gruposFiltrados.length} de {grupos.length} grupos visibles</span>{(busquedaGrupo || filtroCuatrimestre !== 'TODOS' || filtroConfiguracion !== 'TODOS') && <button type="button" onClick={() => { setBusquedaGrupo(''); setFiltroCuatrimestre('TODOS'); setFiltroConfiguracion('TODOS'); }} className="font-semibold text-blue-400 hover:text-blue-300">Limpiar filtros</button>}</div>
            </Panel>

            {vistaGrupos === 'LISTA' ? (
              <Panel className="overflow-hidden">
                <div className="max-h-[337px] overflow-auto" aria-label="Selector de grupos; muestra cuatro filas antes de desplazarse">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className={`sticky top-0 z-10 text-xs uppercase ${isDay ? 'bg-slate-50 text-slate-600' : 'bg-slate-900 text-slate-400'}`}><tr>{[['grupo','Grupo','px-5'],['carrera','Carrera','px-4'],['periodo','Periodo','px-4'],['total_alumnos','Alumnos','px-4 text-center'],['materias','Materias','px-4 text-center']].map(([campo, etiqueta, clase]) => <th key={campo} className={`${clase} py-3`}><button type="button" onClick={() => ordenarGrupoPor(campo)} aria-label={`Ordenar por ${etiqueta}`} className={`inline-flex items-center gap-1 hover:text-blue-500 ${clase.includes('text-center') ? 'justify-center' : ''}`}>{etiqueta} <span aria-hidden="true">{indicadorOrden(campo)}</span></button></th>)}<th className="px-4 py-3 text-right">Estado</th><th className="px-5 py-3 text-right">Acción</th></tr></thead>
                    <tbody className={isDay ? 'divide-y divide-slate-100' : 'divide-y divide-white/5'}>
                      {gruposFiltrados.map(grupo => (
                        <tr key={grupo.id} className={`h-[72px] transition ${grupo.id === grupoId ? isDay ? 'bg-blue-50' : 'bg-blue-500/10' : ''}`}>
                          <td className={`border-l-4 px-5 py-3 font-bold ${grupo.id === grupoId ? 'border-blue-500 text-blue-500' : 'border-transparent'}`}>{grupo.cuatrimestre}° {grupo.grupo}</td><td className="px-4 py-3 font-medium"><span className="line-clamp-2">{grupo.carrera}</span></td><td className="px-4 py-3 text-xs text-slate-500">{grupo.periodo}{grupo.turno ? ` · ${grupo.turno}` : ''}</td><td className="px-4 py-3 text-center font-bold">{grupo.total_alumnos}</td><td className="px-4 py-3 text-center">{grupo.materias}</td><td className="px-4 py-3 text-right"><Badge className={Number(grupo.materias || 0) > 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-amber-500/30 bg-amber-500/10 text-amber-500'}>{Number(grupo.materias || 0) > 0 ? 'CONFIGURADO' : 'SIN MATERIAS'}</Badge></td><td className="px-5 py-3 text-right"><button type="button" onClick={() => seleccionarGrupo(grupo.id)} className="rounded-lg border border-blue-500/30 px-3 py-2 text-xs font-semibold text-blue-500 transition hover:bg-blue-500/10">Seleccionar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {gruposFiltrados.map(grupo => (
                  <button key={grupo.id} onClick={() => seleccionarGrupo(grupo.id)} className={`rounded-2xl border p-4 text-left transition ${grupo.id === grupoId ? 'border-blue-500 bg-blue-500/10 shadow-sm' : isDay ? 'border-slate-200 bg-white hover:border-blue-300' : 'border-white/10 bg-slate-900/55 hover:border-blue-500/40'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{grupo.cuatrimestre}° {grupo.grupo} · {grupo.carrera}</p><p className="mt-1 text-xs text-slate-500">{grupo.periodo}{grupo.turno ? ` · ${grupo.turno}` : ''}</p></div><span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-400">{grupo.total_alumnos}</span></div><div className="mt-3 flex items-center justify-between gap-2"><p className="text-xs text-slate-500">{grupo.materias} materia(s)</p><Badge className={Number(grupo.materias || 0) > 0 ? 'border-emerald-500/30 text-emerald-500' : 'border-amber-500/30 text-amber-500'}>{Number(grupo.materias || 0) > 0 ? 'CONFIGURADO' : 'PENDIENTE'}</Badge></div></button>
                ))}
              </div>
            )}
            {!gruposFiltrados.length && grupos.length > 0 && <Panel className="p-10 text-center text-sm text-slate-500">No hay grupos que coincidan con los filtros seleccionados.</Panel>}
            {!grupos.length && <Panel className="p-10 text-center text-sm text-slate-500">No hay grupos académicos accesibles.</Panel>}</>}
            <PanoramaGrupo
              key={grupoId}
              grupoId={grupoId}
              seleccionarAlumno={seleccionar}
              materiaInicial={searchParams.get('materia') || ''}
              estadoInicial={searchParams.get('estado') || 'TODOS'}
              paginaInicial={Math.max(1, Number(searchParams.get('pagina')) || 1)}
              onFiltros={guardarFiltrosPanorama}
              onCambiarGrupo={() => setMostrarSelectorGrupos(true)}
            />
          </div>
        )}

        {alumnoId && (
          <div className="min-w-0">
            <button onClick={volverPanorama} className="mb-3 text-sm font-semibold text-blue-400 hover:text-blue-300">← {usuario?.rol === 'DOCENTE' ? 'Volver a Mis Tutorados' : 'Volver al panorama del grupo'}</button>
            {loading && <Panel className="p-12 text-center text-sm text-slate-500">Cargando expediente del alumno…</Panel>}
            {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
            {data && !loading && (
              <div className="space-y-5">
                <Panel className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><h2 className="text-2xl font-bold normal-case">{formatNombre(data.alumno.nombre)}</h2><p className="mt-1 text-sm text-slate-500">{data.alumno.matricula} · <span title={data.alumno.carrera}>{formatCarrera(data.alumno.carrera)}</span> · {data.alumno.cuatrimestre}° {data.alumno.grupo} · {data.alumno.periodo} · {data.resumen.materias_inscritas} {data.resumen.materias_inscritas === 1 ? 'materia este cuatrimestre' : 'materias este cuatrimestre'}</p><p className="mt-1 text-xs text-slate-500">Tutor: {formatNombre(data.tutoria.tutor_nombre) || 'Sin tutor asignado'}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setTab('tutoria')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Registrar o revisar tutoría</button><button onClick={() => setTab('acuerdos')} className="rounded-lg border border-blue-500/30 px-3 py-2 text-xs font-semibold text-blue-400">Revisar acuerdos</button><button onClick={() => setModalPdf(true)} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs font-semibold text-slate-500">Generar PDF</button></div></div>
                    <div className="flex flex-wrap gap-3">
                      <div className={`rounded-xl border px-4 py-3 ${SEMAFORO[data.resumen.semaforo]?.box}`}>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Señales en el periodo</p>
                        <div className="flex items-center gap-2"><span className={SEMAFORO[data.resumen.semaforo]?.text}>{data.resumen.semaforo === 'ROJO' ? '▲' : data.resumen.semaforo === 'AMARILLO' ? '●' : data.resumen.semaforo === 'VERDE' ? '✓' : '◌'}</span><span className={`text-sm font-bold ${SEMAFORO[data.resumen.semaforo]?.text}`}>{data.resumen.semaforo === 'VERDE' ? 'Sin señales en el periodo' : SEMAFORO[data.resumen.semaforo]?.label}</span></div>
                      </div>
                      {data.resumen.alerta_inmediata && (
                        <div className={`rounded-xl border px-4 py-3 ${SEMAFORO[data.resumen.alerta_inmediata.nivel]?.box}`}>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Cambios recientes</p>
                          <div className="flex items-center gap-2"><span className={SEMAFORO[data.resumen.alerta_inmediata.nivel]?.text}>{data.resumen.alerta_inmediata.nivel === 'ROJO' ? '▲' : data.resumen.alerta_inmediata.nivel === 'AMARILLO' ? '●' : data.resumen.alerta_inmediata.nivel === 'VERDE' ? '✓' : '◌'}</span><span className={`text-sm font-bold ${SEMAFORO[data.resumen.alerta_inmediata.nivel]?.text}`}>{data.resumen.alerta_inmediata.nivel === 'VERDE' ? 'Sin cambios recientes' : SEMAFORO[data.resumen.alerta_inmediata.nivel]?.label}</span></div>
                          <p className="mt-1 max-w-xs text-[10px] text-slate-500">{data.resumen.alerta_inmediata.razones?.[0]}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>

                <div className={`flex gap-1 overflow-x-auto rounded-xl border p-1 ${isDay ? 'border-slate-200 bg-white' : 'border-white/10 bg-slate-900/55'}`}>
                  {TABS.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-white/5'}`}>{label}</button>)}
                </div>

                {tab === 'resumen' && <Resumen data={data} setTab={setTab} />}
                {tab === 'trayectoria' && <Trayectoria trayectoria={data.trayectoria_academica} />}
                {tab === 'materias' && <Panel className="overflow-hidden"><div className="px-5 py-4"><h2 className="font-semibold">Materias del cuatrimestre</h2><p className="text-xs text-slate-500">Resultados calculados a partir de registros disponibles en SIGA.</p></div><MateriasTable materias={data.materias} /></Panel>}
                {tab === 'asistencia' && <Asistencia data={data} />}
                {tab === 'evaluaciones' && <Evaluaciones data={data} />}
                {tab === 'acuerdos' && <Acuerdos acuerdos={data.acuerdos} puedeDepurar={['SUPER_ADMIN', 'ADMINISTRATIVO', 'TUTORIA_ADMIN', 'SERVICIOS_ESCOLARES'].includes(usuario?.rol)} onDeleted={id => setData(actual => ({ ...actual, acuerdos: actual.acuerdos.filter(a => a.id !== id), resumen: { ...actual.resumen, acuerdos_pendientes: Math.max(0, actual.resumen.acuerdos_pendientes - (actual.acuerdos.find(a => a.id === id)?.estado === 'PENDIENTE' ? 1 : 0)) } }))} />}
                {tab === 'tutoria' && <Tutoria tutoria={data.tutoria} />}
                {tab === 'timeline' && <Timeline alumnoId={data.alumno.id} materias={data.materias} />}
              </div>
            )}
          </div>
        )}
        {modalPdf && data && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <Panel className="w-full max-w-lg p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Generar expediente PDF</h2><p className="mt-1 text-sm text-slate-500">El resumen, la calidad de datos y el panorama por materia siempre se incluyen.</p></div><button onClick={() => setModalPdf(false)} className="text-2xl text-slate-500">×</button></div>
              <div className="mt-5 space-y-3">
                <label className="flex items-start gap-3 rounded-xl border border-slate-500/20 p-3"><input type="checkbox" checked readOnly disabled className="mt-0.5 h-4 w-4"/><span><b className="block text-sm">Resumen y panorama por materia</b><span className="text-xs text-slate-500">Obligatorio para conservar el contexto del documento.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-500/20 p-3"><input type="checkbox" checked={opcionesPdf.acuerdos} onChange={e => setOpcionesPdf(actual => ({ ...actual, acuerdos: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-blue-600"/><span><b className="block text-sm">Acuerdos de seguimiento</b><span className="text-xs text-slate-500">Incluye compromisos, estado y fecha de revisión.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-500/20 p-3"><input type="checkbox" checked={opcionesPdf.tutoria} onChange={e => setOpcionesPdf(actual => ({ ...actual, tutoria: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-blue-600"/><span><b className="block text-sm">Seguimiento tutorial</b><span className="text-xs text-slate-500">Incluye conteos y sesiones tutoriales disponibles.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-500/20 p-3"><input type="checkbox" checked={opcionesPdf.asistencia} onChange={e => setOpcionesPdf(actual => ({ ...actual, asistencia: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-blue-600"/><span><b className="block text-sm">Asistencia detallada</b><span className="text-xs text-slate-500">Desglosa presentes, faltas, retardos y justificadas por materia.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-500/20 p-3"><input type="checkbox" checked={opcionesPdf.trayectoria} onChange={e => setOpcionesPdf(actual => ({ ...actual, trayectoria: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-blue-600"/><span><b className="block text-sm">Trayectoria académica</b><span className="text-xs text-slate-500">Incluye periodos, inscripciones y resoluciones disponibles.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-500/20 p-3"><input type="checkbox" checked={opcionesPdf.observaciones} onChange={e => setOpcionesPdf(actual => ({ ...actual, observaciones: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-blue-600"/><span><b className="block text-sm">Espacio para revisión y firmas</b><span className="text-xs text-slate-500">Agrega observaciones, revisó, enterado por tutor y fecha.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-500/20 p-3 opacity-60"><input type="checkbox" disabled className="mt-0.5 h-4 w-4"/><span><b className="block text-sm">Línea de tiempo</b><span className="text-xs text-slate-500">Disponible para consulta interactiva; la exportación completa se incorporará posteriormente.</span></span></label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-500/20 p-3"><input type="checkbox" checked={opcionesPdf.omitirVacias} onChange={e => setOpcionesPdf(actual => ({ ...actual, omitirVacias: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-blue-600"/><span><b className="block text-sm">Omitir secciones vacías</b><span className="text-xs text-slate-500">Evita páginas que solamente indiquen que no existen registros.</span></span></label>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-600"><b>La leyenda de no oficialidad es obligatoria.</b> El documento contiene información académica personal y debe compartirse únicamente por medios institucionales.</div>
              </div>
              <div className="mt-6 flex justify-end gap-2"><button onClick={() => setModalPdf(false)} className="rounded-xl border border-slate-500/20 px-4 py-2.5 text-sm font-semibold text-slate-500">Cancelar</button><button disabled={generandoPdf} onClick={descargarPdf} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{generandoPdf ? 'Generando…' : 'Generar expediente (PDF)'}</button></div>
            </Panel>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
