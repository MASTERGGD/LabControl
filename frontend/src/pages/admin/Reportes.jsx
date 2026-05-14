import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_CORTO = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const HORAS_LAB  = Array.from({ length: 15 }, (_, i) => i + 7); // 07–21

// ─── Utilidades ──────────────────────────────────────────────────────────────
function pct(actual, anterior) {
  if (!anterior) return null;
  return ((actual - anterior) / anterior * 100).toFixed(0);
}

// ─── Componentes compartidos ──────────────────────────────────────────────────
function StatCard({ emoji, label, value, sub, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-900/40 border-blue-700 text-blue-300",
    green:  "bg-green-900/40 border-green-700 text-green-300",
    yellow: "bg-yellow-900/40 border-yellow-700 text-yellow-300",
    red:    "bg-red-900/40 border-red-700 text-red-300",
    purple: "bg-purple-900/40 border-purple-700 text-purple-300",
    gray:   "bg-white/4 border-gray-600 text-gray-300",
  };
  return (
    <div className={`border rounded-xl p-4 text-center ${colors[color]}`}>
      <p className="text-2xl mb-1">{emoji}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

function Delta({ actual, anterior, labelAnt, invertido = false }) {
  if (anterior == null || anterior === 0) return null;
  const diff = actual - anterior;
  const p    = Math.abs(pct(actual, anterior));
  const sube = diff >= 0;
  const bueno = invertido ? !sube : sube;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full
      ${bueno ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
      {sube ? '▲' : '▼'} {p}% vs {labelAnt}
    </span>
  );
}

// ─── Gráfica comparativa (SVG) ────────────────────────────────────────────────
function GraficaComparativa({ tendencia, cuatActual, cuatAnterior }) {
  if (!tendencia) return null;
  const { actual, anterior } = tendencia;
  const maxVal = Math.max(...actual.map(d => d.count), ...anterior.map(d => d.count), 1);
  const W = 480, H = 160, PAD = 8, BWIDTH = 28, GAP = 6;
  const barH = (v) => Math.max((v / maxVal) * (H - 24), v > 0 ? 4 : 0);

  return (
    <div className="glass p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-white text-sm">Sesiones mes a mes</h3>
          <p className="text-xs text-slate-400 mt-0.5">Comparativa entre cuatrimestres</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500"/>
            <span className="text-slate-300">{cuatActual}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-slate-600"/>
            <span className="text-slate-400">{cuatAnterior}</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%" style={{ minWidth: 320 }}>
          {actual.map((d, i) => {
            const ant  = anterior[i] || { count: 0 };
            const x    = PAD + i * ((BWIDTH * 2 + GAP + 8) );
            const hAct = barH(d.count);
            const hAnt = barH(ant.count);
            return (
              <g key={i}>
                {/* Barra anterior (gris) */}
                <rect x={x} y={H - hAnt} width={BWIDTH} height={hAnt}
                  rx={3} fill="#475569" opacity={0.7}/>
                {ant.count > 0 && (
                  <text x={x + BWIDTH/2} y={H - hAnt - 3} textAnchor="middle"
                    fontSize={9} fill="#94a3b8">{ant.count}</text>
                )}
                {/* Barra actual (azul) */}
                <rect x={x + BWIDTH + 3} y={H - hAct} width={BWIDTH} height={hAct}
                  rx={3} fill="#3b82f6"/>
                {d.count > 0 && (
                  <text x={x + BWIDTH + 3 + BWIDTH/2} y={H - hAct - 3} textAnchor="middle"
                    fontSize={9} fill="#93c5fd">{d.count}</text>
                )}
                {/* Label mes */}
                <text x={x + BWIDTH} y={H + 14} textAnchor="middle"
                  fontSize={10} fill="#64748b">{d.nombre.slice(0,3)}</text>
              </g>
            );
          })}
          {/* Línea base */}
          <line x1={PAD} y1={H} x2={W - PAD} y2={H} stroke="#334155" strokeWidth={1}/>
        </svg>
      </div>
    </div>
  );
}

// ─── Heatmap de horas pico ────────────────────────────────────────────────────
function HeatmapHorasPico({ datos, cuatrimestre }) {
  if (!datos?.length) return null;

  // Agrupar por (dia, hora)
  const grid = {};
  let maxVal = 1;
  datos.forEach(d => {
    grid[`${d.dia}-${d.hora}`] = d.count;
    if (d.count > maxVal) maxVal = d.count;
  });

  const intensidad = (v) => {
    if (v === 0) return 'rgba(255,255,255,0.02)';
    const t = v / maxVal;
    if (t < 0.25)  return `rgba(59,130,246,${0.15 + t * 0.4})`;
    if (t < 0.5)   return `rgba(59,130,246,${0.35 + t * 0.4})`;
    if (t < 0.75)  return `rgba(99,102,241,${0.5 + t * 0.3})`;
    return `rgba(139,92,246,${0.7 + t * 0.3})`;
  };

  const textColor = (v) => {
    const t = v / maxVal;
    if (t === 0) return '#1e293b';
    return t > 0.4 ? '#e2e8f0' : '#94a3b8';
  };

  return (
    <div className="glass p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-white text-sm">Horas pico de uso</h3>
        <p className="text-xs text-slate-400 mt-0.5">{cuatrimestre} · mayor intensidad = más sesiones iniciadas en ese bloque</p>
      </div>
      <div className="overflow-x-auto">
        <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${HORAS_LAB.length}, 1fr)`, gap: 2, minWidth: 520 }}>
          {/* Header horas */}
          <div/>
          {HORAS_LAB.map(h => (
            <div key={h} className="text-center text-slate-500 font-mono pb-1"
                 style={{ fontSize: 10 }}>{String(h).padStart(2,'0')}</div>
          ))}
          {/* Filas días */}
          {DIAS_CORTO.map((dia, di) => (
            <React.Fragment key={di}>
              <div className="flex items-center justify-end pr-2 text-slate-400"
                   style={{ fontSize: 11, fontWeight: 500 }}>{dia}</div>
              {HORAS_LAB.map(h => {
                const v = grid[`${di}-${h}`] || 0;
                return (
                  <div key={h} title={`${dia} ${String(h).padStart(2,'0')}:00 — ${v} sesiones`}
                    style={{
                      height: 22, borderRadius: 4,
                      background: intensidad(v),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    {v > 0 && (
                      <span style={{ fontSize: 9, color: textColor(v), fontWeight: 600 }}>{v}</span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      {/* Leyenda */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
        <span className="text-xs text-slate-500">Intensidad:</span>
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <div key={t} className="flex items-center gap-1">
            <div style={{
              width: 14, height: 14, borderRadius: 3,
              background: t === 0
                ? 'rgba(255,255,255,0.04)'
                : t < 0.25 ? 'rgba(59,130,246,0.25)'
                : t < 0.5  ? 'rgba(59,130,246,0.55)'
                : t < 0.75 ? 'rgba(99,102,241,0.7)'
                : 'rgba(139,92,246,0.95)',
            }}/>
            <span className="text-xs text-slate-600">{['0','baja','media','alta','máx'][Math.round(t*4)]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ranking docentes ─────────────────────────────────────────────────────────
function RankingDocentes({ docentes, cuatrimestre }) {
  if (!docentes?.length) return (
    <div className="glass p-5 flex items-center justify-center">
      <p className="text-slate-500 text-sm">Sin sesiones en {cuatrimestre}</p>
    </div>
  );
  const max = docentes[0]?.sesiones || 1;
  return (
    <div className="glass p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-white text-sm">👩‍🏫 Top docentes</h3>
        <p className="text-xs text-slate-400 mt-0.5">{cuatrimestre} · por sesiones impartidas</p>
      </div>
      <div className="space-y-2">
        {docentes.slice(0, 7).map((d, i) => (
          <div key={d.docente_id} className="flex items-center gap-3">
            <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0
              ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-slate-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-white/8 text-slate-400'}`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs text-slate-200 truncate font-medium">{d.nombre}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">{d.horas}h</span>
                  <span className="text-xs font-bold text-blue-300">{d.sesiones} ses.</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-white/6 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all"
                     style={{ width: `${(d.sesiones / max) * 100}%` }}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Computadoras críticas ────────────────────────────────────────────────────
function ComputadorasCriticas({ pcs }) {
  if (!pcs?.length) return (
    <div className="glass p-5 flex items-center justify-center">
      <p className="text-slate-500 text-sm">Sin incidentes en los últimos 12 meses</p>
    </div>
  );
  const max = pcs[0]?.total || 1;
  return (
    <div className="glass p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-white text-sm">💻 PCs con más incidentes</h3>
        <p className="text-xs text-slate-400 mt-0.5">Últimos 12 meses · candidatas a mantenimiento</p>
      </div>
      <div className="space-y-2">
        {pcs.slice(0, 7).map((pc, i) => (
          <div key={pc.computadora_id} className="flex items-center gap-3">
            <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0
              ${i < 3 ? 'bg-red-800 text-red-200' : 'bg-white/8 text-slate-400'}`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs text-slate-200 truncate font-medium">
                  {pc.codigo || `PC-${pc.numero}`}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {pc.pendientes > 0 && (
                    <span className="text-xs bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded-full">
                      {pc.pendientes} pend.
                    </span>
                  )}
                  <span className="text-xs font-bold text-red-400">{pc.total} inc.</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-white/6 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-red-800 to-red-500 transition-all"
                     style={{ width: `${(pc.total / max) * 100}%` }}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tarjeta KPI comparativa ─────────────────────────────────────────────────
function KpiComparativo({ emoji, label, actual, anterior, labelAnt, unidad = '', invertido = false }) {
  const delta = anterior > 0 ? pct(actual, anterior) : null;
  const sube  = actual >= anterior;
  const bueno = invertido ? !sube : sube;
  return (
    <div className="glass p-4 rounded-xl">
      <div className="flex items-start justify-between">
        <span className="text-xl">{emoji}</span>
        {delta !== null && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
            ${bueno ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
            {sube ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white mt-2">{actual}{unidad}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      <p className="text-xs text-slate-600 mt-1">{anterior}{unidad} en {labelAnt}</p>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ─── Tab: Reporte Mensual ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function TabMensual() {
  const hoy   = new Date();
  const [labs, setLabs]         = useState([]);
  const [labId, setLabId]       = useState('');
  const [mes, setMes]           = useState(hoy.getMonth() + 1);
  const [anio, setAnio]         = useState(hoy.getFullYear());
  const [datos, setDatos]       = useState(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get('/laboratorios?solo_activos=true')
      .then(r => { setLabs(r.data); if (r.data.length > 0) setLabId(r.data[0].id); })
      .catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    if (!labId) return;
    setCargando(true); setError('');
    try {
      const { data } = await api.get(`/reportes/mensual?laboratorio_id=${labId}&mes=${mes}&anio=${anio}`);
      setDatos(data);
    } catch { setError('No se pudo cargar el reporte.'); }
    finally { setCargando(false); }
  }, [labId, mes, anio]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargar = async () => {
    if (!labId) return;
    setDescargando(true);
    try {
      const resp = await api.get(
        `/reportes/mensual/excel?laboratorio_id=${labId}&mes=${mes}&anio=${anio}`,
        { responseType: 'blob' }
      );
      const url  = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      const lab  = labs.find(l => l.id === Number(labId));
      link.href  = url;
      link.setAttribute('download', `Reporte_${(lab?.nombre || 'Lab').replace(/ /g,'_')}_${MESES[mes]}_${anio}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch { setError('Error al generar el Excel.'); }
    finally { setDescargando(false); }
  };

  const anios = [];
  for (let y = hoy.getFullYear(); y >= 2024; y--) anios.push(y);

  return (
    <div className="space-y-5">
      {/* Filtros + descarga */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Laboratorio</label>
            <SelectDark value={labId} onChange={v => setLabId(Number(v))} className="min-w-[200px]"
              options={labs.map(l => ({ value: l.id, label: l.nombre }))}/>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Mes</label>
            <SelectDark value={mes} onChange={v => setMes(Number(v))} className="w-36"
              options={MESES.slice(1).map((m, i) => ({ value: i + 1, label: m }))}/>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Año</label>
            <SelectDark value={anio} onChange={v => setAnio(Number(v))} className="w-28"
              options={anios.map(y => ({ value: y, label: String(y) }))}/>
          </div>
          <button onClick={cargar} disabled={cargando}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {cargando
              ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
            Actualizar
          </button>
        </div>
        <button onClick={descargar} disabled={descargando || !datos}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors">
          {descargando ? 'Generando…' : '⬇️  Descargar Excel'}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3">{error}</p>}
      {cargando && !datos && (
        <div className="flex justify-center py-20">
          <svg className="animate-spin w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      )}

      {datos && (
        <div className="space-y-5">
          <div className="glass px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{datos.laboratorio.nombre}</h2>
              <p className="text-slate-400 text-sm">{MESES[datos.periodo.mes]} {datos.periodo.anio} · Capacidad: {datos.laboratorio.capacidad} equipos</p>
            </div>
            <Delta actual={datos.sesiones.total} anterior={datos.comparativa.sesiones_mes_ant}
                   labelAnt={datos.comparativa.mes_ant_nombre}/>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Actividad del mes</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard emoji="🗓️" label="Sesiones realizadas"  value={datos.sesiones.total}      color="blue"/>
              <StatCard emoji="👩‍🏫" label="Docentes activos"    value={datos.docentes.total}       color="purple"/>
              <StatCard emoji="🎓" label="Alumnos atendidos"   value={datos.alumnos.total_unicos} color="green"/>
              <StatCard emoji="⏱️" label="Horas de uso"        value={`${datos.sesiones.horas_total}h`} color="blue"/>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Estado del equipo</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard emoji="💻" label={`PCs operativas / ${datos.pcs.total}`}   value={datos.pcs.operativas}   color="green"/>
              <StatCard emoji="🔧" label="PCs en mantenimiento"                   value={datos.pcs.mantenimiento} color={datos.pcs.mantenimiento > 0 ? "yellow" : "gray"}/>
              <StatCard emoji="📦" label={`Activos op. / ${datos.activos.total}`} value={datos.activos.operativos} color="green"/>
              <StatCard emoji="⚠️" label="Activos dañados/mant."
                value={datos.activos.mantenimiento + datos.activos.danados}
                color={datos.activos.mantenimiento + datos.activos.danados > 0 ? "yellow" : "gray"}/>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Préstamos e incidentes</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard emoji="📤" label="Préstamos del mes"     value={datos.prestamos.total}    color="blue"/>
              <StatCard emoji="✅" label="Devueltos"              value={datos.prestamos.devueltos} color="green"/>
              <StatCard emoji="🔴" label="Préstamos vencidos"    value={datos.prestamos.vencidos} color={datos.prestamos.vencidos > 0 ? "red" : "gray"}/>
              <StatCard emoji="🛠️" label="Incidentes reportados" value={datos.incidentes.total}   color={datos.incidentes.total > 0 ? "yellow" : "gray"}/>
            </div>
          </div>

          {datos.incidentes.total > 0 && (
            <div className="glass p-4">
              <p className="text-sm font-semibold text-gray-300 mb-3">Seguimiento de incidentes</p>
              <div className="flex gap-3 flex-wrap">
                {[["Pendientes", datos.incidentes.pendientes, "bg-yellow-900/40 text-yellow-300 border-yellow-700"],
                  ["Reparados",  datos.incidentes.reparados,  "bg-green-900/40 text-green-300 border-green-700"],
                  ["Baja",       datos.incidentes.baja,       "bg-gray-700 text-gray-300 border-gray-600"],
                ].map(([lbl, val, cls]) => (
                  <div key={lbl} className={`border rounded-lg px-4 py-2 text-center ${cls}`}>
                    <p className="text-xl font-bold">{val}</p>
                    <p className="text-xs">{lbl}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-900/20 border border-blue-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-sm font-semibold text-blue-200">El reporte Excel incluye 7 hojas detalladas:</p>
              <p className="text-xs text-blue-300 mt-1">
                Resumen ejecutivo · Sesiones por docente · Alumnos atendidos · Horas pico (mapa de calor) · Estado del inventario · Préstamos del periodo · Incidentes y mantenimiento
              </p>
              <button onClick={descargar} disabled={descargando}
                className="mt-3 flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors">
                {descargando ? 'Generando...' : '⬇️  Descargar Excel ahora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ─── Tab: Análisis Comparativo ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function TabComparativo() {
  const [labs, setLabs]         = useState([]);
  const [labId, setLabId]       = useState('');
  const [datos, setDatos]       = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get('/laboratorios?solo_activos=true')
      .then(r => { setLabs(r.data); if (r.data.length > 0) setLabId(r.data[0].id); })
      .catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const params = labId ? `?laboratorio_id=${labId}` : '';
      const { data } = await api.get(`/reportes/comparativo${params}`);
      setDatos(data);
    } catch { setError('No se pudo cargar el análisis comparativo.'); }
    finally { setCargando(false); }
  }, [labId]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          {labs.length > 1 && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Laboratorio</label>
              <SelectDark value={labId} onChange={v => setLabId(Number(v) || '')} className="min-w-[200px]"
                options={[{ value: '', label: 'Todos los labs' }, ...labs.map(l => ({ value: l.id, label: l.nombre }))]}/>
            </div>
          )}
          <button onClick={cargar} disabled={cargando}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {cargando
              ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
            Actualizar
          </button>
        </div>

        {datos && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="px-2.5 py-1 rounded-full border border-blue-700 bg-blue-900/30 text-blue-300 font-semibold">
              {datos.cuatrimestre_actual.nombre}
            </span>
            <span>vs</span>
            <span className="px-2.5 py-1 rounded-full border border-slate-600 bg-white/4 text-slate-400 font-semibold">
              {datos.cuatrimestre_anterior.nombre}
            </span>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3">{error}</p>}
      {cargando && !datos && (
        <div className="flex justify-center py-20">
          <svg className="animate-spin w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      )}

      {datos && (
        <div className="space-y-5">

          {/* KPIs comparativos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiComparativo emoji="🗓️" label="Sesiones en el cuatrimestre"
              actual={datos.resumen.sesiones_actual}
              anterior={datos.resumen.sesiones_anterior}
              labelAnt={datos.cuatrimestre_anterior.nombre}/>
            <KpiComparativo emoji="🎓" label="Alumnos únicos atendidos"
              actual={datos.resumen.alumnos_actual}
              anterior={datos.resumen.alumnos_anterior}
              labelAnt={datos.cuatrimestre_anterior.nombre}/>
            <KpiComparativo emoji="⏱️" label="Horas totales de uso" unidad="h"
              actual={datos.resumen.horas_actual}
              anterior={datos.resumen.horas_anterior}
              labelAnt={datos.cuatrimestre_anterior.nombre}/>
          </div>

          {/* Gráfica comparativa */}
          <GraficaComparativa
            tendencia={datos.tendencia}
            cuatActual={datos.cuatrimestre_actual.nombre}
            cuatAnterior={datos.cuatrimestre_anterior.nombre}/>

          {/* Heatmap */}
          <HeatmapHorasPico
            datos={datos.horas_pico}
            cuatrimestre={datos.cuatrimestre_actual.nombre}/>

          {/* Docentes + PCs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <RankingDocentes
              docentes={datos.top_docentes}
              cuatrimestre={datos.cuatrimestre_actual.nombre}/>
            <ComputadorasCriticas pcs={datos.computadoras_criticas}/>
          </div>

          {/* Nota interpretativa */}
          <div className="glass p-4 border border-white/5 rounded-xl">
            <p className="text-xs font-semibold text-slate-400 mb-2">📌 Cómo leer este reporte</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
              <p>• <span className="text-slate-400">Gráfica:</span> barras grises = cuatrimestre anterior, azules = actual.</p>
              <p>• <span className="text-slate-400">Heatmap:</span> cuadros más oscuros indican horarios de mayor demanda.</p>
              <p>• <span className="text-slate-400">Top docentes:</span> ordenados por sesiones en el cuatrimestre actual.</p>
              <p>• <span className="text-slate-400">PCs críticas:</span> candidatas prioritarias a mantenimiento preventivo.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ─── Página principal ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function Reportes() {
  const [tab, setTab] = useState('mensual');

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {tab === 'mensual' ? 'Informe mensual de actividad por laboratorio' : 'Tendencias y análisis comparativo cuatrimestral'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/4 rounded-xl w-fit mb-6 border border-white/6">
        {[
          { key: 'mensual',     label: '📋 Reporte Mensual' },
          { key: 'comparativo', label: '📈 Análisis Comparativo' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/6'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mensual'     && <TabMensual/>}
      {tab === 'comparativo' && <TabComparativo/>}
    </AdminLayout>
  );
}
