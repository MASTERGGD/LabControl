import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/AdminLayout';
import api from '../hooks/useApi';
import SelectDark from '../components/SelectDark';

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

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, alert = false, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`glass rounded-xl p-4 text-left w-full transition-all
        ${onClick ? 'hover:brightness-110 cursor-pointer hover:-translate-y-0.5 active:translate-y-0' : 'cursor-default'}
        ${alert ? 'border border-red-700/60' : ''}`}>
      <div className="flex items-start justify-between">
        <span className="text-xl">{icon}</span>
        {alert && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1"/>}
      </div>
      <p className={`text-2xl font-bold mt-2 ${alert ? 'text-red-400' : 'text-white'}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      {sub && <p className={`text-xs mt-1 ${alert ? 'text-red-400' : 'text-blue-400'}`}>{sub}</p>}
    </button>
  );
}

// ─── Gráfica de barras ────────────────────────────────────────────────────────
function GraficaSesiones({ datos }) {
  if (!datos?.length) return null;
  const max = Math.max(...datos.map(d => d.count), 1);
  return (
    <div className="glass p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white text-sm">Sesiones — últimos 7 días</h3>
          <p className="text-xs text-slate-400 mt-0.5">Actividad diaria del laboratorio</p>
        </div>
        <span className="text-xl">📈</span>
      </div>
      <div className="flex items-end gap-2" style={{height:'96px'}}>
        {datos.map((d, i) => {
          const pct = d.count === 0 ? 3 : Math.max((d.count / max) * 100, 10);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              {d.count > 0 && <span className="text-xs font-bold text-blue-300">{d.count}</span>}
              <div className="w-full rounded-t-md"
                style={{
                  height: `${pct}%`,
                  background: d.es_hoy ? 'linear-gradient(180deg,#93c5fd,#2563eb)' : d.count === 0 ? '#1e293b' : '#334155',
                  border: d.es_hoy ? '1px solid #60a5fa' : '1px solid #334155',
                  minHeight:'4px', transition:'height .5s',
                }}/>
              <span className={`text-xs ${d.es_hoy ? 'text-blue-300 font-bold' : 'text-slate-500'}`}>{d.dia}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
        {[['#3b82f6','Hoy'],['#475569','Días anteriores'],['#1e293b','Sin sesiones']].map(([c,l]) => (
          <div key={l} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{background:c, border:'1px solid #334155'}}/>
            <span className="text-xs text-slate-400">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sesión activa card ───────────────────────────────────────────────────────
function TarjetaSesion({ sesion, onIr }) {
  const seg = useTiempoRestante(sesion.fin_estimado);
  const abs = seg !== null ? Math.abs(seg) : 0;
  const h = Math.floor(abs/3600), m = Math.floor((abs%3600)/60), s = abs%60;
  const fmt = h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const overtime = seg !== null && seg < 0;
  const aviso = seg !== null && seg >= 0 && seg <= 600;
  return (
    <div onClick={() => onIr(sesion)}
      className={`rounded-xl border p-3 cursor-pointer transition-all hover:border-gray-500
        ${overtime ? 'border-red-700 bg-red-900/20' : aviso ? 'border-yellow-700 bg-yellow-900/10' : 'border-white/10 bg-white/3'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${overtime ? 'bg-red-500 animate-pulse' : 'bg-green-400 animate-pulse'}`}/>
            <p className="text-sm font-semibold text-white truncate">
              {sesion.tipo_sesion === 'LIBRE' ? '🖥️ Sesión Libre' : sesion.materia}
            </p>
          </div>
          <p className="text-xs text-slate-400">
            {sesion.tipo_sesion === 'LIBRE' ? sesion.laboratorio_nombre : `${sesion.grupo} · ${sesion.laboratorio_nombre}`}
          </p>
          {sesion.docente_nombre && sesion.docente_nombre !== 'Sistema' && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{sesion.docente_nombre}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {seg === null ? <span className="text-xs text-slate-500">Sin límite</span>
          : overtime ? <div><p className="text-xs text-red-400 font-semibold">Excedido</p><p className="font-mono text-red-400 font-bold text-sm">+{fmt}</p></div>
          : <div><p className="text-xs text-slate-400">{aviso ? '⚠️ Termina' : 'Resta'}</p><p className={`font-mono font-bold text-sm ${aviso ? 'text-yellow-400' : 'text-gray-300'}`}>{fmt}</p></div>}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">{sesion.pcs_ocupadas} PCs en uso</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${overtime ? 'bg-red-900/60 text-red-300' : 'bg-green-900/60 text-green-300'}`}>
          {overtime ? '⚠️ Overtime' : '🟢 Activa'}
        </span>
      </div>
    </div>
  );
}

function WidgetSesionesActivas({ sesiones, cargando, onIr, onRefresh }) {
  const overtime = sesiones.filter(s => s.en_overtime).length;
  return (
    <div className="glass overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${overtime > 0 ? 'bg-red-900/50' : sesiones.length > 0 ? 'bg-green-900/50' : 'bg-gray-700'}`}>
            {overtime > 0 ? '⚠️' : '🖥️'}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">En este momento</p>
            {overtime > 0 && <p className="text-xs text-red-400">{overtime} en overtime</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${sesiones.length > 0 ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-slate-400'}`}>
            {sesiones.length} activa{sesiones.length !== 1 ? 's' : ''}
          </span>
          <button onClick={onRefresh} className="text-slate-500 hover:text-gray-300 p-1 rounded-lg hover:bg-white/8">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="p-3 space-y-2 overflow-y-auto" style={{maxHeight:'240px'}}>
        {cargando && !sesiones.length ? (
          <div className="text-center py-8 text-slate-500 text-sm">Cargando...</div>
        ) : sesiones.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p className="text-3xl mb-2">💤</p>
            <p className="text-sm">Sin sesiones abiertas</p>
          </div>
        ) : sesiones.map(s => <TarjetaSesion key={s.id} sesion={s} onIr={onIr}/>)}
      </div>
    </div>
  );
}

// ─── Próximas reservaciones ───────────────────────────────────────────────────
function WidgetProximas({ reservaciones, navigate }) {
  if (!reservaciones?.length) return null;
  const hoy = new Date().toISOString().split('T')[0];
  return (
    <div className="glass overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <p className="text-sm font-semibold text-white">Próximas reservaciones</p>
        </div>
        <button onClick={() => navigate('/admin/reservaciones')} className="text-xs text-blue-400 hover:text-blue-300">Ver todas →</button>
      </div>
      <div className="divide-y divide-gray-700">
        {reservaciones.map(r => {
          const esHoy = r.fecha === hoy;
          const fecha = new Date(r.fecha + 'T12:00:00');
          const fmtF = esHoy ? 'HOY' : `${fecha.getDate()} ${MESES[fecha.getMonth()+1]}`;
          return (
            <div key={r.id} className={`px-4 py-3 flex items-center gap-3 ${esHoy ? 'bg-blue-900/20' : ''}`}>
              <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 ${esHoy ? 'bg-blue-700' : 'bg-gray-700'}`}>
                <span className="text-xs font-bold text-white">{fmtF.split(' ')[0]}</span>
                {!esHoy && <span className="text-xs text-slate-400">{fmtF.split(' ')[1]}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{r.materia}</p>
                <p className="text-xs text-slate-400 truncate">{r.docente} · {r.hora_ini}–{r.hora_fin}</p>
              </div>
              {r.grupo && <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full shrink-0">{r.grupo}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Estado de PCs ────────────────────────────────────────────────────────────
function WidgetEquipos({ pcs, navigate }) {
  if (!pcs) return null;
  const pctOp = pcs.total > 0 ? Math.round((pcs.operativas / pcs.total) * 100) : 0;
  const color = pctOp >= 80 ? '#22c55e' : pctOp >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">💻</span>
          <p className="text-sm font-semibold text-white">Estado de PCs</p>
        </div>
        <span className="text-lg font-bold" style={{color}}>{pctOp}%</span>
      </div>
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full transition-all duration-700" style={{width:`${pctOp}%`,background:color}}/>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Operativas',pcs.operativas,'#4ade80'],['Mant.',pcs.mantenimiento,'#fbbf24'],['Fallas',pcs.danadas,'#f87171']].map(([l,v,c]) => (
          <div key={l} className="bg-white/5 rounded-lg p-2">
            <p className="text-lg font-bold" style={{color:c}}>{v}</p>
            <p className="text-xs text-slate-400">{l}</p>
          </div>
        ))}
      </div>
      {(pcs.mantenimiento > 0 || pcs.danadas > 0) && (
        <button onClick={() => navigate('/admin/mantenimiento')}
          className="mt-3 w-full text-xs text-center text-yellow-400 hover:text-yellow-300 bg-yellow-900/20 border border-yellow-800/50 rounded-lg py-1.5 transition-colors">
          Ver equipos con incidencias →
        </button>
      )}
    </div>
  );
}

// ─── Panel de alertas accionables ────────────────────────────────────────────
function FilaAlerta({ icono, texto, sub, urgente, onClick, boton }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0
      ${urgente ? 'bg-red-950/30' : 'hover:bg-white/3'} transition-colors`}>
      <span className="text-base shrink-0">{icono}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${urgente ? 'text-red-300' : 'text-slate-200'}`}>{texto}</p>
        {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
      </div>
      {boton && (
        <button onClick={onClick}
          className={`shrink-0 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors
            ${urgente
              ? 'bg-red-800/60 hover:bg-red-700/60 text-red-200'
              : 'bg-white/8 hover:bg-white/12 text-slate-300'}`}>
          {boton}
        </button>
      )}
    </div>
  );
}

function SeccionAlerta({ titulo, count, color, icono, children, onVerTodos }) {
  if (count === 0) return null;
  return (
    <div className="flex-1 min-w-0">
      <div className={`flex items-center justify-between px-4 py-2 border-b ${color.border}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{icono}</span>
          <span className={`text-xs font-semibold ${color.text}`}>{titulo}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${color.badge}`}>{count}</span>
        </div>
        <button onClick={onVerTodos} className={`text-xs ${color.link} hover:underline`}>Ver todos →</button>
      </div>
      {children}
    </div>
  );
}

function PanelAlertas({ alertas, navigate }) {
  if (!alertas || alertas.total === 0) return null;

  const { incidentes_pendientes, incidentes_total,
          prestamos_vencidos,    prestamos_total,
          adeudos_criticos,      adeudos_total } = alertas;

  return (
    <div className="rounded-xl border border-red-800/50 bg-red-950/20 overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-red-800/40 bg-red-900/20">
        <span className="w-7 h-7 rounded-lg bg-red-700/60 flex items-center justify-center text-sm shrink-0">🚨</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-red-300">Requiere tu atención ahora</p>
          <p className="text-xs text-red-400/70">{alertas.total} elemento{alertas.total !== 1 ? 's' : ''} pendiente{alertas.total !== 1 ? 's' : ''}</p>
        </div>
        <span className="text-xs text-red-400/60">Actualiza cada 30s</span>
      </div>

      {/* Columnas de alerta */}
      <div className="divide-y divide-white/5 md:divide-y-0 md:divide-x md:flex">

        {/* Incidentes */}
        <SeccionAlerta
          titulo="Incidentes sin atender"
          count={incidentes_total}
          icono="🛠️"
          color={{ border:'border-orange-900/40', text:'text-orange-300', badge:'bg-orange-900/60 text-orange-200', link:'text-orange-400' }}
          onVerTodos={() => navigate('/admin/mantenimiento')}>
          {incidentes_pendientes.map(inc => (
            <FilaAlerta key={inc.id}
              icono={inc.prioridad === 'ALTA' ? '🔴' : inc.prioridad === 'BAJA' ? '🟡' : '🟠'}
              texto={inc.descripcion}
              sub={`Hace ${inc.dias} día${inc.dias !== 1 ? 's' : ''} · ${inc.tipo}`}
              urgente={inc.dias >= 3}
              boton="Atender"
              onClick={() => navigate('/admin/mantenimiento')}/>
          ))}
          {incidentes_total > 5 && (
            <p className="text-xs text-slate-500 px-4 py-2">+{incidentes_total - 5} más</p>
          )}
        </SeccionAlerta>

        {/* Préstamos vencidos */}
        <SeccionAlerta
          titulo="Préstamos vencidos"
          count={prestamos_total}
          icono="📤"
          color={{ border:'border-yellow-900/40', text:'text-yellow-300', badge:'bg-yellow-900/60 text-yellow-200', link:'text-yellow-400' }}
          onVerTodos={() => navigate('/admin/prestamos')}>
          {prestamos_vencidos.map(p => (
            <FilaAlerta key={p.id}
              icono="⏰"
              texto={p.persona}
              sub={`${p.activo} · ${p.dias_vencido} día${p.dias_vencido !== 1 ? 's' : ''} vencido`}
              urgente={p.dias_vencido >= 3}
              boton="Gestionar"
              onClick={() => navigate('/admin/prestamos')}/>
          ))}
          {prestamos_total > 5 && (
            <p className="text-xs text-slate-500 px-4 py-2">+{prestamos_total - 5} más</p>
          )}
        </SeccionAlerta>

        {/* Adeudos críticos */}
        <SeccionAlerta
          titulo={`Adeudos +7 días`}
          count={adeudos_total}
          icono="⚠️"
          color={{ border:'border-red-900/40', text:'text-red-300', badge:'bg-red-900/60 text-red-200', link:'text-red-400' }}
          onVerTodos={() => navigate('/admin/adeudos')}>
          {adeudos_criticos.map(a => (
            <FilaAlerta key={a.id}
              icono="💸"
              texto={a.persona}
              sub={`${a.tipo.toLowerCase().replace('_',' ')} · ${a.dias} días sin resolver`}
              urgente={a.dias >= 14}
              boton="Resolver"
              onClick={() => navigate('/admin/adeudos')}/>
          ))}
          {adeudos_total > 5 && (
            <p className="text-xs text-slate-500 px-4 py-2">+{adeudos_total - 5} más</p>
          )}
        </SeccionAlerta>

      </div>
    </div>
  );
}

// ─── Acciones rápidas ─────────────────────────────────────────────────────────
function AccionesRapidas({ navigate }) {
  return (
    <div className="glass p-4">
      <p className="text-sm font-semibold text-white mb-3">⚡ Acciones rápidas</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          ['➕','Nueva reservación','/admin/reservaciones'],
          ['📤','Registrar préstamo','/admin/prestamos'],
          ['🔧','Reportar incidente','/admin/mantenimiento'],
          ['📊','Reporte mensual',  '/admin/reportes'],
        ].map(([icon,lbl,ruta]) => (
          <button key={lbl} onClick={() => navigate(ruta)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/8 border border-gray-600 hover:border-gray-500 rounded-lg px-3 py-2.5 text-left transition-all text-xs font-medium text-gray-200">
            <span className="text-base">{icon}</span>{lbl}
          </button>
        ))}
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
    timerRef.current = setInterval(() => {
      cargarStats(labId);
      cargarSesiones();
    }, 30000);
    return () => clearInterval(timerRef.current);
  }, [labId, cargarStats, cargarSesiones]);

  const irASesion = (s) => {
    if (usuario?.rol === 'DOCENTE') navigate(`/docente/sesion/${s.id}`);
    else navigate(`/admin/sesion/${s.id}`);
  };

  const modulosVisibles = MODULOS.filter(m => !m.soloSuperAdmin || usuario?.rol === 'SUPER_ADMIN');

  const ahora    = new Date();
  const saludo   = ahora.getHours() < 12 ? '☀️' : ahora.getHours() < 19 ? '🌤️' : '🌙';
  const fechaStr = ahora.toLocaleDateString('es-MX', {weekday:'long',day:'numeric',month:'long',year:'numeric'});

  return (
    <AdminLayout>
      <div className="space-y-5">

        {/* Encabezado */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{saludo} Bienvenido, {usuario?.nombre?.split(' ')[0]}</h1>
            <p className="text-sm text-slate-400 mt-0.5 capitalize">{fechaStr}</p>
          </div>
          {stats?.labs?.length > 1 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Laboratorio</label>
              <SelectDark
                value={labId}
                onChange={v => setLabId(Number(v))}
                className="min-w-[180px]"
                options={[{ value: '', label: 'Todos' }, ...stats.labs.map(l => ({ value: l.id, label: l.nombre }))]}
              />
            </div>
          )}
        </div>

        {/* Panel de alertas accionables */}
        {stats?.alertas?.total > 0 && (
          <PanelAlertas alertas={stats.alertas} navigate={navigate}/>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon="🟢" label="Sesiones activas"  value={stats.sesiones.activas}
              sub={stats.sesiones.activas > 0 ? 'En curso ahora' : 'Sin actividad'} onClick={stats.sesiones.activas > 0 ? () => navigate('/admin/laboratorios') : null}/>
            <StatCard icon="📅" label="Sesiones hoy"      value={stats.sesiones.hoy}
              sub={`${stats.sesiones.semana} esta semana`}/>
            <StatCard icon="🎓" label="Alumnos hoy"       value={stats.alumnos_hoy}
              sub="Únicos en sesiones"/>
            <StatCard icon="💻" label="PCs operativas"    value={`${stats.pcs.operativas}/${stats.pcs.total}`}
              sub={stats.pcs.mantenimiento > 0 ? `${stats.pcs.mantenimiento} en mant.` : 'Todo en orden'}
              alert={stats.pcs.danadas > 0} onClick={() => navigate('/admin/mantenimiento')}/>
            <StatCard icon="📤" label="Préstamos activos" value={stats.prestamos.activos}
              sub={stats.prestamos.vencidos > 0 ? `⚠️ ${stats.prestamos.vencidos} vencidos` : 'Al corriente'}
              alert={stats.prestamos.vencidos > 0} onClick={() => navigate('/admin/prestamos')}/>
            <StatCard icon="🛠️" label="Incidentes abiertos" value={stats.incidentes_abiertos}
              sub={stats.incidentes_abiertos > 0 ? 'Requieren atención' : 'Sin incidentes'}
              alert={stats.incidentes_abiertos > 0} onClick={stats.incidentes_abiertos > 0 ? () => navigate('/admin/mantenimiento') : null}/>
          </div>
        )}

        {/* Fila media: sesiones activas + gráfica */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <WidgetSesionesActivas sesiones={sesiones} cargando={cargando}
            onIr={irASesion} onRefresh={() => { cargarSesiones(); cargarStats(labId); }}/>
          <div className="lg:col-span-2">
            {stats?.sesiones_7d && <GraficaSesiones datos={stats.sesiones_7d}/>}
          </div>
        </div>

        {/* Fila inferior: equipos, acciones, próximas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <WidgetEquipos pcs={stats?.pcs} navigate={navigate}/>
          <AccionesRapidas navigate={navigate}/>
          {stats?.proximas_reservaciones?.length > 0
            ? <WidgetProximas reservaciones={stats.proximas_reservaciones} navigate={navigate}/>
            : <div className="glass p-4 flex items-center justify-center text-center">
                <div>
                  <p className="text-3xl mb-2">📅</p>
                  <p className="text-sm text-slate-400">Sin reservaciones próximas</p>
                  <button onClick={() => navigate('/admin/reservaciones')} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
                    Gestionar reservaciones →
                  </button>
                </div>
              </div>
          }
        </div>

        {/* Módulos */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Módulos del sistema</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {modulosVisibles.map(m => (
              <button key={m.titulo} onClick={() => navigate(m.ruta)}
                className="group bg-gray-800 hover:bg-white/8 border border-gray-700 hover:border-gray-500 rounded-xl p-3 text-center transition-all hover:-translate-y-0.5">
                <div className="text-2xl mb-1">{m.icono}</div>
                <p className="text-xs font-medium text-slate-400 group-hover:text-white leading-tight">{m.titulo}</p>
                <div className="w-full h-0.5 rounded-full mt-2 opacity-50 group-hover:opacity-100 transition-opacity" style={{background:m.color}}/>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-600">LabControl UTECAN v1.0 — Universidad Tecnológica de Candelaria</p>
          <p className="text-xs text-slate-600">🔄 Auto-actualiza cada 30s</p>
        </div>

      </div>
    </AdminLayout>
  );
}
