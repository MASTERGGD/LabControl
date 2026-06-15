import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/AdminLayout';
import api from '../hooks/useApi';
import SelectDark from '../components/SelectDark';
import { useTheme } from '../context/ThemeContext';
import { MEXICO_TIME_ZONE, todayISOInMexico } from '../utils/timezone';

const toTitleCase = s => !s ? '' : s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());

// ─── Constantes ────────────────────────────────────────────────────────────────
const MODULOS = [
  { titulo:'Laboratorios', icono:'🖥️', ruta:'/admin/laboratorios', color:'#2563eb' },
  { titulo:'Usuarios',     icono:'👥', ruta:'/admin/usuarios',    color:'#7c3aed', soloSuperAdmin:true },
  { titulo:'Horarios',     icono:'📅', ruta:'/admin/horarios',    color:'#059669' },
  { titulo:'Reservaciones',icono:'📌', ruta:'/admin/reservaciones',color:'#d97706' },
  { titulo:'Inventario',   icono:'📦', ruta:'/admin/inventario',  color:'#0891b2' },
  { titulo:'Préstamos',    icono:'🔖', ruta:'/admin/prestamos',   color:'#db2777' },
  { titulo:'Mantenimiento',icono:'🔧', ruta:'/admin/mantenimiento',color:'#dc2626' },
  { titulo:'Catálogos',    icono:'🗂️', ruta:'/admin/catalogo',    color:'#65a30d' },
  { titulo:'Reportes',     icono:'📊', ruta:'/admin/reportes',    color:'#ca8a04' },
];

const MESES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// ─── Hook: tiempo restante ────────────────────────────────────────────────────
function useTiempoRestante(finEstimado) {
  const [seg, setSeg] = useState(null);
  useEffect(() => {
    if (!finEstimado) return;
    const fin = new Date(finEstimado + 'Z');
    const tick = () => setSeg(Math.floor((fin - Date.now()) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [finEstimado]);
  return seg;
}

// ─── SVG Ring Progress ────────────────────────────────────────────────────────
function RingProgress({ value, max, size = 100, stroke = 8, color = '#3b82f6' }) {
  const r     = (size - stroke * 2) / 2;
  const circ  = 2 * Math.PI * r;
  const pct   = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circ * (1 - pct);
  const pctInt = Math.round(pct * 100);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)' }}/>
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: size * 0.21, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>{pctInt}</span>
        <span style={{ fontSize: 10, color: '#475569', marginTop: 2, letterSpacing: '0.04em' }}>%</span>
      </div>
    </div>
  );
}

// ─── Pulse Dot (punto esmeralda con ping) ─────────────────────────────────────
function PulseDot({ color = '#10b981', size = 10 }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <span className="animate-ping" style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: color, opacity: 0.55,
      }}/>
      <span style={{
        position: 'relative', display: 'block',
        width: size, height: size, borderRadius: '50%', background: color,
      }}/>
    </span>
  );
}

// ─── KPI mini (número grande + etiqueta muted) ────────────────────────────────
function KpiMini({ valor, label, sub, color = '#3b82f6', alert, onClick, icon }) {
  const ref = useRef(null);
  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={!onClick}
      className={`relative overflow-hidden text-left transition-all
        ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'}`}
      style={{
        background: 'rgba(10,16,34,0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${alert ? 'rgba(239,68,68,0.30)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '1rem',
        padding: '1rem 1.1rem',
        transition: 'all 0.3s ease',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8,
      }}
      onMouseEnter={e => { if(onClick) e.currentTarget.style.boxShadow = `0 0 22px ${color}28`; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}>
      {alert && <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 animate-pulse"/>}
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <p style={{ margin: 0, fontSize: 32, fontWeight: 800, color: alert ? '#f87171' : '#f1f5f9', lineHeight: 1 }}>
          {valor}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#475569' }}>{label}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: alert ? '#f87171' : color }}>{sub}</p>}
      </div>
    </button>
  );
}

// ─── Tarjeta de sesión activa ─────────────────────────────────────────────────
function KpiPrincipal({ valor, label, sub, color, icon, alert, onClick }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative text-left transition-all ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'}`}
      style={{
        background: isDay ? '#FFFFFF' : 'rgba(30,41,59,0.58)',
        border: `1px solid ${alert ? (isDay ? '#EF4444' : 'rgba(239,68,68,0.55)') : isDay ? '#CBD5E1' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '0.875rem',
        padding: '1.15rem 1.15rem',
        minHeight: 132,
        overflow: 'hidden',
        boxShadow: isDay ? '0 1px 2px rgba(15,23,42,0.04)' : undefined,
      }}
      onMouseEnter={e => {
        if (!onClick) return;
        e.currentTarget.style.borderColor = `${color}99`;
        e.currentTarget.style.boxShadow = `0 0 22px ${color}24`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = alert ? 'rgba(239,68,68,0.55)' : 'rgba(255,255,255,0.08)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {alert && (
        <span className="absolute top-5 right-5 w-2 h-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      )}
      <div style={{ fontSize: 20, marginBottom: 18 }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 30, lineHeight: 1, fontWeight: 850,
        color: alert ? '#DC2626' : (valor === 0 || valor === '0') ? '#9CA3AF' : isDay ? '#0F172A' : '#f8fafc',
        fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </p>
      <p style={{ margin: '7px 0 0', fontSize: 13, color: isDay ? '#475569' : '#94a3b8', fontWeight: 600 }}>{label}</p>
      {sub && <p style={{ margin: '6px 0 0', fontSize: 13, color: alert ? '#DC2626' : '#10b981', fontWeight: 600 }}>{sub}</p>}
    </button>
  );
}

function KpiRow({ stats, sesiones, navigate }) {
  if (!stats) return null;
  const pcs = stats.pcs || {};
  const incidentes = stats.incidentes_abiertos ?? stats.alertas?.incidentes_total ?? 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
      <KpiPrincipal valor={sesiones?.length ?? 0} label="Sesiones activas"
        sub={(sesiones?.length ?? 0) > 0 ? 'En curso' : 'Sin actividad'}
        color="#38bdf8" icon="🟢" onClick={() => navigate('/admin/sesiones')} />
      <KpiPrincipal valor={stats.sesiones_hoy ?? 0} label="Sesiones hoy"
        sub={stats.sesiones_semana ? `${stats.sesiones_semana} esta semana` : '0 esta semana'}
        color="#60a5fa" icon="🧮" />
      <KpiPrincipal valor={stats.alumnos_hoy ?? 0} label="Alumnos hoy"
        sub="Únicos en sesiones" color="#60a5fa" icon="🎓" />
      <KpiPrincipal valor={`${pcs.operativas ?? 0}/${pcs.total ?? 0}`} label="PCs operativas"
        sub={`${pcs.mantenimiento ?? 0} en mant.`} color="#38bdf8" icon="💻"
        onClick={() => navigate('/admin/laboratorios')} />
      <KpiPrincipal valor={stats.prestamos?.activos ?? 0} label="Préstamos activos"
        sub={stats.prestamos?.vencidos > 0 ? `${stats.prestamos.vencidos} vencidos` : 'Al corriente'}
        color={stats.prestamos?.vencidos > 0 ? '#f59e0b' : '#60a5fa'} icon="📥"
        alert={stats.prestamos?.vencidos > 0} onClick={() => navigate('/admin/prestamos')} />
      <KpiPrincipal valor={incidentes} label="Incidentes abiertos"
        sub={incidentes > 0 ? 'Requieren atención' : 'Sin incidentes'} color="#ef4444" icon="🛠️"
        alert={incidentes > 0} onClick={incidentes > 0 ? () => navigate('/admin/mantenimiento') : null} />
    </div>
  );
}

function TarjetaSesion({ sesion, onIr }) {
  const seg = useTiempoRestante(sesion.fin_estimado);
  const abs = seg !== null ? Math.abs(seg) : 0;
  const h = Math.floor(abs/3600), m = Math.floor((abs%3600)/60), s = abs%60;
  const fmt = h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const overtime = seg !== null && seg < 0;
  const aviso    = seg !== null && seg >= 0 && seg <= 600;

  return (
    <div onClick={() => onIr(sesion)}
      style={{
        borderRadius: '0.875rem',
        border: `1px solid ${overtime ? 'rgba(239,68,68,0.45)' : aviso ? 'rgba(245,158,11,0.40)' : 'rgba(255,255,255,0.08)'}`,
        background: overtime ? 'rgba(127,29,29,0.18)' : aviso ? 'rgba(120,53,15,0.12)' : 'rgba(255,255,255,0.02)',
        padding: '0.75rem',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            {overtime
              ? <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" style={{ width:8, height:8 }}/>
              : <PulseDot color="#10b981" size={8}/>
            }
            <p className="text-sm font-semibold text-white truncate" style={{ margin:0 }}>
              {sesion.tipo_sesion === 'LIBRE' ? '🖥️ Sesión Libre' : sesion.materia}
            </p>
          </div>
          <p className="text-xs text-slate-400" style={{ margin:0 }}>
            {sesion.tipo_sesion === 'LIBRE' ? sesion.laboratorio_nombre : `${sesion.grupo} · ${sesion.laboratorio_nombre}`}
          </p>
          {sesion.docente_nombre && sesion.docente_nombre !== 'Sistema' && (
            <p className="text-xs text-slate-500 truncate" style={{ margin:'2px 0 0' }}>{sesion.docente_nombre}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {seg === null
            ? <span className="text-xs text-slate-500">Sin límite</span>
            : overtime
              ? <div><p className="text-xs text-red-400 font-semibold" style={{margin:0}}>Excedido</p><p className="font-mono text-red-400 font-bold text-sm" style={{margin:0}}>+{fmt}</p></div>
              : <div><p className="text-xs text-slate-400" style={{margin:0}}>{aviso ? '⚠️ Termina' : 'Resta'}</p><p className={`font-mono font-bold text-sm ${aviso ? 'text-yellow-400' : 'text-gray-300'}`} style={{margin:0}}>{fmt}</p></div>
          }
        </div>
      </div>
      <div style={{ marginTop: 8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span className="text-xs text-slate-500">{sesion.pcs_ocupadas} PCs en uso</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${overtime ? 'bg-red-900/60 text-red-300' : 'bg-green-900/60 text-green-300'}`}>
          {overtime ? '⚠️ Tiempo extra' : '🟢 Activa'}
        </span>
      </div>
    </div>
  );
}

// ─── HERO CARD: Estado + sesiones activas ─────────────────────────────────────
function HeroCard({ stats, sesiones, cargando, onIr, onRefresh }) {
  const pcsOp    = stats?.pcs?.operativas ?? 0;
  const pcsTotal = stats?.pcs?.total ?? 0;
  const activas  = sesiones.length;
  const overtime = sesiones.filter(s => s.en_overtime).length;

  const ringColor = pcsTotal > 0
    ? (pcsOp / pcsTotal >= 0.8 ? '#10b981' : pcsOp / pcsTotal >= 0.5 ? '#f59e0b' : '#ef4444')
    : '#3b82f6';

  return (
    // Gradient border wrapper → simula reflejo de luz en canto de vidrio
    <div style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.03) 60%, rgba(59,130,246,0.06) 100%)',
      borderRadius: '1.375rem',
      padding: '1px',
      position: 'relative',
    }}>
      {/* Glow blob azul detrás de la tarjeta */}
      <div style={{
        position: 'absolute', top: '15%', left: '8%',
        width: '55%', height: '65%',
        background: 'radial-gradient(ellipse, rgba(59,130,246,0.10) 0%, transparent 70%)',
        filter: 'blur(48px)', pointerEvents: 'none',
      }}/>

      <div style={{
        position: 'relative',
        background: 'rgba(8,14,30,0.82)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '1.25rem',
        overflow: 'hidden',
      }}>
        {/* ── Banner compacto ── */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          flexWrap: 'wrap',
        }}>
          {/* Título izquierda */}
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
            Estado en tiempo real
          </p>

          {/* KPI pills + refresh — derecha */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

            {/* Sesiones activas con ping dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
              background: activas > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${activas > 0 ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 20, padding: '3px 10px 3px 7px',
            }}>
              {/* Ping dot animado */}
              <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8, flexShrink: 0 }}>
                <span className="animate-ping" style={{ position:'absolute', inset:0, borderRadius:'50%',
                  background: activas > 0 ? '#10b981' : '#1e293b', opacity: activas > 0 ? 0.6 : 0 }}/>
                <span style={{ position:'relative', width: 8, height: 8, borderRadius:'50%',
                  background: activas > 0 ? '#10b981' : '#334155', display:'block' }}/>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: activas > 0 ? '#6ee7b7' : '#334155' }}>
                {activas}
              </span>
              <span style={{ fontSize: 11, color: activas > 0 ? '#34d399' : '#334155' }}>
                {activas === 1 ? 'sesión activa' : 'sesiones activas'}
              </span>
            </div>

            {/* PCs operativas */}
            {pcsTotal > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 20, padding: '3px 10px',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: ringColor, flexShrink: 0,
                  boxShadow: `0 0 6px ${ringColor}88` }}/>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>{pcsOp}</span>
                <span style={{ fontSize: 11, color: '#475569' }}>/ {pcsTotal} PCs</span>
              </div>
            )}

            {/* Sesiones hoy */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20, padding: '3px 10px',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>{stats?.sesiones?.hoy ?? 0}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>hoy</span>
            </div>

            {/* Alumnos hoy */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20, padding: '3px 10px',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>{stats?.alumnos_hoy ?? 0}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>alumnos</span>
            </div>

            {/* Badge tiempo extra */}
            {overtime > 0 && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(239,68,68,0.14)', color: '#f87171',
                fontWeight: 600, border: '1px solid rgba(239,68,68,0.22)',
              }}>
                ⚠ {overtime} con tiempo extra
              </span>
            )}

            {/* Refresh */}
            <button onClick={onRefresh}
              style={{ background:'transparent', border:'none', cursor:'pointer', color:'#334155', padding:4, borderRadius:8, lineHeight:1 }}
              className="hover:text-slate-400 transition-colors">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Lista de sesiones activas */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '0.875rem 1rem', maxHeight: 230, overflowY: 'auto' }}>
          {cargando && !sesiones.length
            ? <p style={{ textAlign:'center', color:'#334155', fontSize:13, padding:'1.25rem 0', margin:0 }}>Cargando...</p>
            : sesiones.length === 0
              ? (
                <div style={{ textAlign:'center', padding:'1.5rem 0' }}>
                  <p style={{ fontSize:28, margin:'0 0 6px' }}>💤</p>
                  <p style={{ fontSize:13, color:'#334155', margin:0 }}>Sin sesiones abiertas ahora mismo</p>
                </div>
              )
              : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {sesiones.map(s => <TarjetaSesion key={s.id} sesion={s} onIr={onIr}/>)}
                </div>
          }
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR: acciones rápidas + KPIs mini ────────────────────────────────────
function SidebarAcciones({ navigate, stats, soloAcciones = false }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const acciones = [
    { icon:'PC', label:'Abrir uso libre',     sub:'Sesion sin reservacion', onClick: () => window.dispatchEvent(new Event('labcontrol:abrir-uso-libre')), color:'#059669' },
    { icon:'📌', label:'Nueva reservación',  sub:'Asignar horario',  ruta:'/admin/reservaciones', color:'#d97706' },
    { icon:'📤', label:'Registrar préstamo',  sub:'Equipos y activos', ruta:'/admin/prestamos',    color:'#db2777' },
    { icon:'🔧', label:'Reportar incidente',  sub:'PC o equipo',       ruta:'/admin/mantenimiento', color:'#dc2626' },
    { icon:'📊', label:'Ver reportes',        sub:'Análisis mensual',  ruta:'/admin/reportes',     color:'#ca8a04' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, height:'100%' }}>

      {/* Acciones rápidas */}
      <div style={{
        background: isDay ? '#FFFFFF' : 'rgba(30,41,59,0.55)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${isDay ? '#CBD5E1' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '1.25rem',
        overflow: 'hidden',
        flex: 1,
        boxShadow: isDay ? '0 1px 3px rgba(15,23,42,0.06)' : undefined,
      }}>
        <div style={{ padding:'0.9rem 1.25rem 0.75rem', borderBottom:`1px solid ${isDay ? '#E2E8F0' : 'rgba(255,255,255,0.04)'}` }}>
          <p style={{ margin:0, fontSize:10, fontWeight:800, color: isDay ? '#334155' : '#64748B', textTransform:'uppercase', letterSpacing:'0.14em' }}>
            Acciones rápidas
          </p>
        </div>
        <div style={{ padding:'0.625rem' }}>
          {acciones.map(a => (
            <button key={a.label} onClick={() => a.onClick ? a.onClick() : navigate(a.ruta)}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:12,
                background:'transparent', border:'none', cursor:'pointer',
                padding:'0.6rem 0.75rem', borderRadius:'0.75rem',
                textAlign:'left', marginBottom:2,
                transition:'background 0.2s, box-shadow 0.3s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = isDay ? '#F8FAFC' : 'rgba(255,255,255,0.05)';
                e.currentTarget.style.boxShadow  = `0 0 14px ${a.color}18`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow  = 'none';
              }}>
              <div style={{
                width:38, height:38, borderRadius:11, flexShrink:0,
                background: isDay ? '#F8FAFC' : `linear-gradient(135deg, rgba(255,255,255,0.10) 0%, ${a.color}22 100%)`,
                border:`1px solid ${isDay ? '#E2E8F0' : `${a.color}30`}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:17,
                boxShadow:`inset 0 1px 0 rgba(255,255,255,0.08)`,
              }}>
                {a.icon}
              </div>
              <div>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color: isDay ? '#0F172A' : '#e2e8f0' }}>{a.label}</p>
                <p style={{ margin:0, fontSize:11, color: isDay ? '#475569' : '#64748B', fontWeight: 500 }}>{a.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Mini KPIs (2 columnas) — se ocultan cuando la tarjeta está en fila de 3 col */}
      {stats && !soloAcciones && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <KpiMini
            valor={stats.prestamos?.activos ?? 0}
            label="Préstamos activos"
            sub={stats.prestamos?.vencidos > 0 ? `⚠️ ${stats.prestamos.vencidos} vencidos` : 'Al corriente'}
            color="#3b82f6" icon="📤"
            alert={stats.prestamos?.vencidos > 0}
            onClick={() => navigate('/admin/prestamos')}/>
          <KpiMini
            valor={stats.incidentes_abiertos ?? 0}
            label="Incidentes"
            sub={stats.incidentes_abiertos > 0 ? 'Requieren atención' : 'Sin incidentes'}
            color="#ef4444" icon="🛠️"
            alert={stats.incidentes_abiertos > 0}
            onClick={stats.incidentes_abiertos > 0 ? () => navigate('/admin/mantenimiento') : null}/>
        </div>
      )}
    </div>
  );
}

// ─── Gráfica de barras 7 días ─────────────────────────────────────────────────
function GraficaSesiones({ datos }) {
  if (!datos?.length) return null;
  const max = Math.max(...datos.map(d => d.count), 1);
  return (
    <div style={{
      background:'rgba(30,41,59,0.55)',
      backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
      border:'1px solid rgba(255,255,255,0.07)',
      borderRadius:'1.25rem', padding:'1.25rem 1.5rem',
    }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white text-sm" style={{margin:0}}>Sesiones — últimos 7 días</h3>
          <p className="text-xs text-slate-400 mt-0.5" style={{margin:'3px 0 0'}}>Actividad diaria del laboratorio</p>
        </div>
        <span className="text-xl">📈</span>
      </div>
      <div className="flex items-end gap-2" style={{ height:96 }}>
        {datos.map((d, i) => {
          const pct = d.count === 0 ? 3 : Math.max((d.count / max) * 100, 10);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              {d.count > 0 && <span className="text-xs font-bold text-blue-300">{d.count}</span>}
              <div className="w-full rounded-t-md" style={{
                height:`${pct}%`,
                background: d.es_hoy ? 'linear-gradient(180deg,#93c5fd,#2563eb)' : d.count === 0 ? '#0f172a' : '#1e293b',
                border: d.es_hoy ? '1px solid rgba(96,165,250,0.6)' : '1px solid rgba(255,255,255,0.05)',
                boxShadow: d.es_hoy ? '0 0 12px rgba(59,130,246,0.35)' : 'none',
                minHeight:4, transition:'height .5s',
              }}/>
              <span className={`text-xs ${d.es_hoy ? 'text-blue-300 font-bold' : 'text-slate-600'}`}>{d.dia}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:12, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.04)' }}>
        {[['#3b82f6','Hoy'],['#1e293b','Días anteriores'],['#0f172a','Sin sesiones']].map(([c,l]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:12, height:12, borderRadius:3, background:c, border:'1px solid rgba(255,255,255,0.1)' }}/>
            <span className="text-xs text-slate-500">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Estado de PCs ────────────────────────────────────────────────────────────
function WidgetEquipos({ pcs, navigate }) {
  if (!pcs) return null;
  const pctOp = pcs.total > 0 ? Math.round((pcs.operativas / pcs.total) * 100) : 0;
  const color  = pctOp >= 80 ? '#10b981' : pctOp >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{
      background:'rgba(30,41,59,0.55)',
      backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
      border:'1px solid rgba(255,255,255,0.07)',
      borderRadius:'1.25rem', padding:'1.25rem',
      height: '100%', boxSizing: 'border-box',
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">💻</span>
          <p className="text-sm font-semibold text-white" style={{margin:0}}>Estado de PCs</p>
        </div>
        <span className="text-lg font-bold" style={{color}}>{pctOp}%</span>
      </div>
      {/* Barra de progreso con glow */}
      <div style={{ width:'100%', height:5, borderRadius:99, background:'rgba(255,255,255,0.05)', overflow:'hidden', marginBottom:12 }}>
        <div style={{
          height:'100%', borderRadius:99, width:`${pctOp}%`,
          background: color,
          boxShadow: `0 0 8px ${color}70`,
          transition:'width 0.8s cubic-bezier(.4,0,.2,1)',
        }}/>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Operativas',pcs.operativas,'#4ade80'],['Mant.',pcs.mantenimiento,'#fbbf24'],['Fallas',pcs.danadas,'#f87171']].map(([l,v,c]) => (
          <div key={l} style={{ background:'rgba(255,255,255,0.04)', borderRadius:'0.625rem', padding:'0.5rem 0.25rem' }}>
            <p className="text-lg font-bold" style={{color:c, margin:0}}>{v}</p>
            <p className="text-xs text-slate-500" style={{margin:0}}>{l}</p>
          </div>
        ))}
      </div>
      {(pcs.mantenimiento > 0 || pcs.danadas > 0) && (
        <button onClick={() => navigate('/admin/mantenimiento')}
          className="mt-3 w-full text-xs text-center text-yellow-400 hover:text-yellow-300 transition-colors"
          style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'0.625rem', padding:'0.45rem', cursor:'pointer' }}>
          Ver equipos con incidencias →
        </button>
      )}
    </div>
  );
}

// ─── Próximas reservaciones ───────────────────────────────────────────────────
function WidgetProximas({ reservaciones, navigate }) {
  if (!reservaciones?.length) return null;
  const hoy = todayISOInMexico();
  return (
    <div style={{
      background:'rgba(30,41,59,0.55)',
      backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
      border:'1px solid rgba(255,255,255,0.07)',
      borderRadius:'1.25rem', overflow:'hidden',
    }}>
      <div style={{ padding:'0.875rem 1.25rem', borderBottom:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>📅</span>
          <p className="text-sm font-semibold text-white" style={{margin:0}}>Próximas reservaciones</p>
        </div>
        <button onClick={() => navigate('/admin/reservaciones')} className="text-xs transition-colors" style={{background:'none',border:'none',cursor:'pointer',color:'#10b981',fontWeight:600}}>Ver todas →</button>
      </div>
      <div>
        {reservaciones.map(r => {
          const esHoy = r.fecha === hoy;
          const fecha = new Date(r.fecha + 'T12:00:00');
          const fmtF  = esHoy ? 'HOY' : `${fecha.getDate()} ${MESES[fecha.getMonth()+1]}`;
          return (
            <div key={r.id} style={{
              padding:'0.75rem 1.25rem', display:'flex', alignItems:'center', gap:12,
              background: esHoy ? 'rgba(59,130,246,0.06)' : 'transparent',
              borderBottom:'1px solid rgba(255,255,255,0.03)',
            }}>
              <div style={{
                width:40, height:40, borderRadius:10, flexShrink:0,
                background: esHoy ? '#1d4ed8' : 'rgba(255,255,255,0.06)',
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#fff' }}>{fmtF.split(' ')[0]}</span>
                {!esHoy && <span style={{ fontSize:10, color:'#64748b' }}>{fmtF.split(' ')[1]}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate" style={{margin:0}}>{r.materia}</p>
                <p className="text-xs truncate" style={{margin:0, color:'#94a3b8'}}>{toTitleCase(r.docente)} · {r.hora_ini}–{r.hora_fin}</p>
              </div>
              {r.grupo && <span style={{ fontSize:11, background:'rgba(255,255,255,0.06)', color:'#94a3b8', padding:'2px 8px', borderRadius:20, flexShrink:0 }}>{r.grupo}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panel de alertas accionables ────────────────────────────────────────────
// ─── Panel de alertas accionables ────────────────────────────────────────────
function FilaAlerta({ icono, texto, sub, urgente, onClick, boton }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const accent = urgente
    ? {
        dot:'#ef4444',
        text: isDay ? '#991B1B' : '#fecaca',
        sub: isDay ? '#7F1D1D' : '#64748b',
        bg: isDay ? '#FEF2F2' : 'rgba(239,68,68,0.055)',
        btnBg: isDay ? '#2563EB' : 'rgba(59,130,246,0.14)',
        btnText: isDay ? '#FFFFFF' : '#bfdbfe',
        btnBorder: isDay ? '#2563EB' : 'rgba(59,130,246,0.28)'
      }
    : {
        dot:'#f97316',
        text: isDay ? '#9A3412' : '#e2e8f0',
        sub: isDay ? '#7C2D12' : '#64748b',
        bg: isDay ? '#FFF7ED' : 'transparent',
        btnBg: isDay ? '#2563EB' : 'rgba(255,255,255,0.055)',
        btnText: isDay ? '#FFFFFF' : '#cbd5e1',
        btnBorder: isDay ? '#2563EB' : 'rgba(255,255,255,0.08)'
      };
  return (
    <div className="flex items-center gap-3 px-4 py-3 last:border-0 transition-colors"
      style={{ background: accent.bg, borderBottom: `1px solid ${isDay ? '#FED7AA' : 'rgba(255,255,255,0.05)'}` }}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: accent.dot, boxShadow: `0 0 10px ${accent.dot}66` }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs shrink-0 opacity-80">{icono}</span>
          <p className="text-sm font-medium truncate" style={{margin:0, color: accent.text}}>{texto}</p>
        </div>
        {sub && <p className="text-xs truncate" style={{margin:'2px 0 0', paddingLeft: 22, color: accent.sub, fontWeight: 500}}>{sub}</p>}
      </div>
      {boton && (
        <button onClick={onClick}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors hover:brightness-110"
          style={{ background: accent.btnBg, color: accent.btnText, border: `1px solid ${accent.btnBorder}` }}>
          {boton}
        </button>
      )}
    </div>
  );
}

function SeccionAlerta({ titulo, count, color, icono, children, onVerTodos }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  if (count === 0) return null;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ borderTop: `2px solid ${color.accent}`, borderBottom: `1px solid ${isDay ? '#E2E8F0' : 'rgba(255,255,255,0.06)'}` }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{icono}</span>
          <span className="text-xs font-semibold" style={{ color: isDay ? color.dayText : color.text }}>{titulo}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
            style={{ background: color.badgeBg, color: color.badgeText }}>{count}</span>
        </div>
        <button onClick={onVerTodos} className="text-xs hover:underline" style={{background:'none',border:'none',cursor:'pointer', color: color.link}}>Ver todos →</button>
      </div>
      {children}
    </div>
  );
}

function PanelAlertas({ alertas, navigate }) {
  if (!alertas || alertas.total === 0) return null;
  const { incidentes_pendientes, incidentes_total, prestamos_vencidos, prestamos_total, adeudos_criticos, adeudos_total } = alertas;
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background:'rgba(15,23,42,0.78)', border:'1px solid rgba(255,255,255,0.08)', boxShadow:'0 18px 45px rgba(0,0,0,0.18)' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/6"
        style={{ background:'linear-gradient(90deg, rgba(239,68,68,0.09), rgba(245,158,11,0.045), rgba(15,23,42,0))' }}>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background:'rgba(239,68,68,0.13)', color:'#fca5a5', border:'1px solid rgba(239,68,68,0.24)' }}>🚨</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-100" style={{margin:0}}>Atención operativa</p>
          <p className="text-xs text-slate-500" style={{margin:0}}>{alertas.total} elemento{alertas.total !== 1 ? 's' : ''} pendiente{alertas.total !== 1 ? 's' : ''}</p>
        </div>
        <span className="text-xs text-slate-500">Actualiza cada 30s</span>
      </div>
      <div className="divide-y divide-white/5 md:divide-y-0 md:divide-x md:flex">
        <SeccionAlerta titulo="Incidentes sin atender" count={incidentes_total} icono="🛠️"
          color={{ accent:'#f97316', text:'#fdba74', badgeBg:'rgba(249,115,22,0.16)', badgeText:'#fed7aa', link:'#fb923c' }}
          onVerTodos={() => navigate('/admin/mantenimiento')}>
          {incidentes_pendientes.map(inc => (
            <FilaAlerta key={inc.id}
              icono={inc.prioridad === 'ALTA' ? '🔴' : inc.prioridad === 'BAJA' ? '🟡' : '🟠'}
              texto={inc.descripcion} sub={`Hace ${inc.dias} día${inc.dias!==1?'s':''} · ${inc.tipo}`}
              urgente={inc.dias >= 3} boton="Atender" onClick={() => navigate('/admin/mantenimiento')}/>
          ))}
          {incidentes_total > 5 && <p className="text-xs text-slate-500 px-4 py-2" style={{margin:0}}>+{incidentes_total - 5} más</p>}
        </SeccionAlerta>
        <SeccionAlerta titulo="Préstamos vencidos" count={prestamos_total} icono="📤"
          color={{ accent:'#eab308', text:'#fde68a', badgeBg:'rgba(234,179,8,0.16)', badgeText:'#fef3c7', link:'#facc15' }}
          onVerTodos={() => navigate('/admin/prestamos')}>
          {prestamos_vencidos.map(p => (
            <FilaAlerta key={p.id} icono="⏰" texto={p.persona}
              sub={`${p.activo} · ${p.dias_vencido} día${p.dias_vencido!==1?'s':''} vencido`}
              urgente={p.dias_vencido >= 3} boton="Gestionar" onClick={() => navigate('/admin/prestamos')}/>
          ))}
          {prestamos_total > 5 && <p className="text-xs text-slate-500 px-4 py-2" style={{margin:0}}>+{prestamos_total - 5} más</p>}
        </SeccionAlerta>
        <SeccionAlerta titulo="Adeudos +7 días" count={adeudos_total} icono="⚠️"
          color={{ accent:'#ef4444', text:'#fca5a5', badgeBg:'rgba(239,68,68,0.16)', badgeText:'#fecaca', link:'#f87171' }}
          onVerTodos={() => navigate('/admin/adeudos')}>
          {adeudos_criticos.map(a => (
            <FilaAlerta key={a.id} icono="💸" texto={a.persona}
              sub={`${a.tipo.toLowerCase().replace('_',' ')} · ${a.dias} días sin resolver`}
              urgente={a.dias >= 14} boton="Resolver" onClick={() => navigate('/admin/adeudos')}/>
          ))}
          {adeudos_total > 5 && <p className="text-xs text-slate-500 px-4 py-2" style={{margin:0}}>+{adeudos_total - 5} más</p>}
        </SeccionAlerta>
      </div>
    </div>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
export default function DashboardAdmin() {
  const { usuario } = useAuth();
  const navigate    = useNavigate();
  const [stats, setStats]       = useState(null);
  const [sesiones, setSesiones] = useState([]);
  const [labId, setLabId]       = useState('');
  const [cargando, setCargando] = useState(true);
  const timerRef = useRef(null);

  const cargarStats = useCallback(async (lid) => {
    try {
      const params = lid ? `?laboratorio_id=${lid}` : '';
      const { data } = await api.get(`/reportes/dashboard${params}`);
      setStats(data);
    } catch {/* silencioso */}
  }, []);

  const cargarSesiones = useCallback(async () => {
    try {
      const { data } = await api.get('/sesiones?estado=ABIERTA');
      setSesiones(data);
    } catch { setSesiones([]); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => {
    cargarStats(labId);
    cargarSesiones();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { cargarStats(labId); cargarSesiones(); }, 30000);
    return () => clearInterval(timerRef.current);
  }, [labId, cargarStats, cargarSesiones]);

  const irASesion = (s) => {
    if (usuario?.rol === 'DOCENTE') navigate(`/docente/sesion/${s.id}`);
    else navigate(`/admin/sesion/${s.id}`);
  };

  const modulosVisibles = MODULOS.filter(m => !m.soloSuperAdmin || usuario?.rol === 'SUPER_ADMIN');
  const ahora    = new Date();
  const saludo   = ahora.getHours() < 12 ? '☀️' : ahora.getHours() < 19 ? '🌤️' : '🌙';
  const fechaStr = ahora.toLocaleDateString('es-MX', {
    timeZone: MEXICO_TIME_ZONE,
    weekday:'long',
    day:'numeric',
    month:'long',
    year:'numeric',
  });

  return (
    <AdminLayout>
      <div className="space-y-5">

        {/* Encabezado */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{margin:0}}>{saludo} Bienvenido, {usuario?.nombre?.split(' ')[0]}</h1>
            <p className="text-sm text-slate-400" style={{margin:'4px 0 0'}}>{fechaStr}</p>
          </div>
          {stats?.labs?.length > 1 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Laboratorio</label>
              <SelectDark value={labId} onChange={v => setLabId(Number(v))} className="min-w-[180px]"
                options={[{ value:'', label:'Todos' }, ...stats.labs.map(l => ({ value:l.id, label:l.nombre }))]}/>
            </div>
          )}
        </div>

        {/* KPIs principales — fila de 6 tarjetas compactas */}
        <KpiRow stats={stats} sesiones={sesiones} navigate={navigate} />

        {/* Alertas operativas (solo cuando hay pendientes) */}
        {stats?.alertas && <PanelAlertas alertas={stats.alertas} navigate={navigate}/>}

        {/* BENTO ROW 1 - En este momento (izq) + Sesiones últimos 7 días (der) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-4">
            <HeroCard stats={stats} sesiones={sesiones} cargando={cargando}
              onIr={irASesion} onRefresh={() => { cargarSesiones(); cargarStats(labId); }}/>
          </div>
          <div className="xl:col-span-8">
            {stats?.sesiones_7d && <GraficaSesiones datos={stats.sesiones_7d}/>}
          </div>
        </div>

        {/* BENTO ROW 2 - Estado + acciones + reservaciones */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div>
            <WidgetEquipos pcs={stats?.pcs} navigate={navigate}/>
          </div>
          <div>
            <SidebarAcciones navigate={navigate} stats={stats} soloAcciones/>
          </div>
          <div>
            {stats?.proximas_reservaciones?.length > 0 && (
              <WidgetProximas reservaciones={stats.proximas_reservaciones} navigate={navigate}/>
            )}
          </div>
        </div>

        {/* Módulos */}
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider" style={{margin:'0 0 12px'}}>Módulos del sistema</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {modulosVisibles.map(m => (
              <button key={m.titulo} onClick={() => navigate(m.ruta)}
                style={{ background:'rgba(15,23,42,0.60)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'0.875rem', padding:'0.75rem 0.5rem', textAlign:'center', cursor:'pointer', transition:'all 0.3s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(30,41,59,0.85)'; e.currentTarget.style.boxShadow=`0 0 18px ${m.color}22`; e.currentTarget.style.borderColor=`${m.color}38`; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(15,23,42,0.60)'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='rgba(255,255,255,0.06)'; e.currentTarget.style.transform='none'; }}>
                <div style={{ fontSize:24, marginBottom:5 }}>{m.icono}</div>
                <p style={{ fontSize:11, fontWeight:500, color:'#64748b', margin:'0 0 7px', lineHeight:1.3 }}>{m.titulo}</p>
                <div style={{ width:'100%', height:2, borderRadius:99, background:m.color, opacity:0.35 }}/>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-700" style={{margin:0}}>SIGA UTECAN v1.0 — Universidad Tecnológica de Candelaria</p>
          <p className="text-xs text-slate-700" style={{margin:0}}>🔄 Auto-actualiza cada 30s</p>
        </div>

      </div>
    </AdminLayout>
  );
}
