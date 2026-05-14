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
  const palette = {
    blue:   { accent: '#3b82f6', bg: 'rgba(59,130,246,0.07)',  border: 'rgba(59,130,246,0.2)',  text: '#93c5fd' },
    green:  { accent: '#10b981', bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.2)',  text: '#6ee7b7' },
    yellow: { accent: '#f59e0b', bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.2)',  text: '#fcd34d' },
    red:    { accent: '#ef4444', bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.2)',   text: '#fca5a5' },
    purple: { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.07)',  border: 'rgba(139,92,246,0.2)',  text: '#c4b5fd' },
    gray:   { accent: '#475569', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', text: '#94a3b8' },
  };
  const p = palette[color] || palette.gray;
  return (
    <div style={{
      background: p.bg, border: `1px solid ${p.border}`,
      borderRadius: '0.875rem', padding: '1rem', textAlign: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${p.accent}, ${p.accent}44)` }}/>
      <p style={{ fontSize: 16, margin: '0 0 4px', opacity: 0.7 }}>{emoji}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: p.text, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{sub}</p>}
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
  const [hovered, setHovered] = React.useState(null);
  if (!tendencia) return null;

  const { actual, anterior } = tendencia;
  const maxVal = Math.max(...actual.map(d => d.count), ...anterior.map(d => d.count), 1);

  // Dimensiones mini — barras cortas, ancho fijo con scroll si hay muchos meses
  const BWIDTH = 20, PAIR_GAP = 34, PAD = 8;
  const H = 65;
  const W = Math.max(PAD * 2 + actual.length * PAIR_GAP, 320);
  const barH = (v) => Math.max((v / maxVal) * (H - 10), v > 0 ? 2 : 0);

  return (
    <div className="glass p-5" style={{ maxHeight: 300 }}>
      {/* ── Header + leyenda ── */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            Sesiones mes a mes
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>Comparativa entre cuatrimestres</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(59,130,246,0.8)' }}/>
            <span className="text-slate-300">{cuatActual}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(100,116,139,0.5)' }}/>
            <span className="text-slate-500">{cuatAnterior}</span>
          </div>
        </div>
      </div>

      {/* ── SVG de barras — ancho fijo + scroll si hay muchos meses ── */}
      <div style={{ overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H + 22}`} width={W} height={H + 22} style={{ display: 'block', minWidth: 200 }}>
            {/* Grid lines horizontales casi invisibles */}
            {[0.25, 0.5, 0.75, 1].map(t => (
              <line key={t}
                x1={PAD} y1={H - t * (H - 14)} x2={W - PAD} y2={H - t * (H - 14)}
                stroke="#ffffff" strokeOpacity={0.04} strokeWidth={1}/>
            ))}

            {actual.map((d, i) => {
              const ant  = anterior[i] || { count: 0 };
              const x    = PAD + i * PAIR_GAP;
              const hAct = barH(d.count);
              const hAnt = barH(ant.count);
              const isHov = hovered === i;
              return (
                <g key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'default' }}>

                  {/* Highlight de fondo al hover */}
                  {isHov && (
                    <rect x={x - 3} y={0} width={BWIDTH * 2 + 9} height={H + 2}
                      rx={4} fill="rgba(255,255,255,0.04)"/>
                  )}

                  {/* Barra anterior */}
                  <rect x={x} y={H - hAnt} width={BWIDTH} height={hAnt}
                    rx={3} fill="rgba(100,116,139,0.45)"
                    style={{ transition: 'opacity 0.2s' }}
                    opacity={hovered !== null && !isHov ? 0.4 : 1}/>

                  {/* Barra actual — glow azul */}
                  <rect x={x + BWIDTH + 2} y={H - hAct} width={BWIDTH} height={hAct}
                    rx={3} fill="rgba(59,130,246,0.82)"
                    style={{ filter: isHov ? 'drop-shadow(0 0 5px rgba(59,130,246,0.7))' : 'none', transition: 'all 0.2s' }}
                    opacity={hovered !== null && !isHov ? 0.35 : 1}/>

                  {/* Label mes */}
                  <text x={x + BWIDTH} y={H + 14} textAnchor="middle"
                    fontSize={9} fill={isHov ? '#94a3b8' : '#475569'}
                    fontWeight={isHov ? 600 : 400}>
                    {d.nombre.slice(0, 3)}
                  </text>

                  {/* Tooltip flotante al hover */}
                  {isHov && (
                    <g>
                      <rect x={x - 8} y={H - Math.max(hAct, hAnt) - 38}
                        width={70} height={32} rx={6}
                        fill="rgba(15,23,42,0.92)" stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>
                      <text x={x + 27} y={H - Math.max(hAct, hAnt) - 24}
                        textAnchor="middle" fontSize={9} fill="#93c5fd" fontWeight={700}>
                        Actual: {d.count}
                      </text>
                      <text x={x + 27} y={H - Math.max(hAct, hAnt) - 12}
                        textAnchor="middle" fontSize={9} fill="#64748b">
                        Ant: {ant.count}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Línea base */}
            <line x1={PAD} y1={H} x2={W - PAD} y2={H} stroke="#1e293b" strokeWidth={1}/>
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
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Top docentes</h3>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>{cuatrimestre} · por sesiones impartidas</p>
        </div>
        <span style={{ fontSize: 18 }}>👩‍🏫</span>
      </div>

      {/* Header fila */}
      <div style={{
        display: 'grid', gridTemplateColumns: '26px 1fr 48px',
        gap: '0 10px', padding: '0 4px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 2,
      }}>
        <span/>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.13em' }}>Docente</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.13em', textAlign: 'right' }}>Ses.</span>
      </div>

      {docentes.slice(0, 7).map((d, i) => (
        <div key={d.docente_id}
          style={{
            display: 'grid', gridTemplateColumns: '26px 1fr 48px',
            gap: '0 10px', alignItems: 'center',
            padding: '8px 4px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            borderRadius: 6, transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {/* Medalla de posición */}
          <span style={{
            width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: i === 0 ? '#ca8a04' : i === 1 ? '#64748b' : i === 2 ? '#92400e' : 'rgba(255,255,255,0.06)',
            color: i < 3 ? '#fff' : '#475569',
          }}>
            {i + 1}
          </span>

          {/* Nombre + horas + barra */}
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.nombre}
            </p>
            <p style={{ margin: '2px 0 5px', fontSize: 11, color: '#475569' }}>
              {d.horas}h de uso
            </p>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${(d.sesiones / max) * 100}%`, height: '100%', borderRadius: 2,
                background: i === 0
                  ? 'linear-gradient(90deg, #ca8a04, #fbbf24)'
                  : 'linear-gradient(90deg, #2563eb, #60a5fa)',
                transition: 'width 0.7s cubic-bezier(.4,0,.2,1)',
              }}/>
            </div>
          </div>

          {/* Badge sesiones */}
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#93c5fd', textAlign: 'right',
            background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.18)',
            padding: '2px 8px', borderRadius: 6, justifySelf: 'end',
          }}>
            {d.sesiones}
          </span>
        </div>
      ))}
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
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>PCs con más incidentes</h3>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>Últimos 12 meses · candidatas a mantenimiento</p>
        </div>
        <span style={{ fontSize: 18 }}>💻</span>
      </div>

      {/* Header fila */}
      <div style={{
        display: 'grid', gridTemplateColumns: '26px 1fr 54px',
        gap: '0 10px', padding: '0 4px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 2,
      }}>
        <span/>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.13em' }}>Equipo</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.13em', textAlign: 'right' }}>Inc.</span>
      </div>

      {pcs.slice(0, 7).map((pc, i) => (
        <div key={pc.computadora_id}
          style={{
            display: 'grid', gridTemplateColumns: '26px 1fr 54px',
            gap: '0 10px', alignItems: 'center',
            padding: '8px 4px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            borderRadius: 6, transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{
            width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            background: i < 3 ? 'rgba(185,28,28,0.7)' : 'rgba(255,255,255,0.06)',
            color: i < 3 ? '#fca5a5' : '#475569',
          }}>
            {i + 1}
          </span>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pc.codigo || `PC-${pc.numero}`}
              </p>
              {pc.pendientes > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#fca5a5', flexShrink: 0,
                  background: 'rgba(185,28,28,0.25)', border: '1px solid rgba(239,68,68,0.25)',
                  padding: '1px 6px', borderRadius: 4,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}/>
                  {pc.pendientes} pend.
                </span>
              )}
            </div>
            <div style={{ marginTop: 5, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${(pc.total / max) * 100}%`, height: '100%', borderRadius: 2,
                background: i < 3
                  ? 'linear-gradient(90deg, #b91c1c, #f87171)'
                  : 'linear-gradient(90deg, #7f1d1d, #ef4444)',
                transition: 'width 0.7s cubic-bezier(.4,0,.2,1)',
              }}/>
            </div>
          </div>

          <span style={{
            fontSize: 13, fontWeight: 700, color: '#fca5a5', textAlign: 'right',
            background: 'rgba(185,28,28,0.15)', border: '1px solid rgba(239,68,68,0.2)',
            padding: '2px 8px', borderRadius: 6, justifySelf: 'end',
          }}>
            {pc.total}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Tarjeta de resumen visual (hero KPI) ────────────────────────────────────
function SummaryCard({ label, value, color = '#3b82f6', sub }) {
  return (
    <div style={{
      background: 'rgba(8,14,30,0.72)',
      border: `1px solid ${color}28`,
      borderRadius: '1rem',
      padding: '1.1rem 1.25rem',
      position: 'relative',
      overflow: 'hidden',
      backdropFilter: 'blur(12px)',
    }}>
      {/* barra de acento superior */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${color}, ${color}44)`,
      }}/>
      {/* blob de brillo de fondo */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%', width: '60%', height: '140%',
        background: `radial-gradient(ellipse, ${color}0d 0%, transparent 70%)`,
        filter: 'blur(20px)', pointerEvents: 'none',
      }}/>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 10px', position: 'relative' }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 800, color, margin: 0, lineHeight: 1, fontVariantNumeric: 'tabular-nums', position: 'relative' }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: '#64748b', marginTop: 8, position: 'relative' }}>{sub}</p>}
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

          {/* ── Resumen visual ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              label="Total de sesiones"
              value={datos.sesiones.total}
              color="#3b82f6"
              sub={`${datos.sesiones.horas_total}h de uso registradas`}
            />
            <SummaryCard
              label="Promedio por sesión"
              value={datos.sesiones.total > 0
                ? `${Math.round(datos.sesiones.horas_total * 60 / datos.sesiones.total)} min`
                : '—'}
              color="#10b981"
              sub={`Docentes activos: ${datos.docentes.total}`}
            />
            <SummaryCard
              label="Alumnos atendidos"
              value={datos.alumnos.total_unicos}
              color="#8b5cf6"
              sub={`${MESES[datos.periodo.mes]} ${datos.periodo.anio}`}
            />
          </div>

          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>Actividad del mes</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard emoji="🗓️" label="Sesiones realizadas"  value={datos.sesiones.total}      color="blue"/>
              <StatCard emoji="👩‍🏫" label="Docentes activos"    value={datos.docentes.total}       color="purple"/>
              <StatCard emoji="🎓" label="Alumnos atendidos"   value={datos.alumnos.total_unicos} color="green"/>
              <StatCard emoji="⏱️" label="Horas de uso"        value={`${datos.sesiones.horas_total}h`} color="blue"/>
            </div>
          </div>

          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>Estado del equipo</p>
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
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>Préstamos e incidentes</p>
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
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       