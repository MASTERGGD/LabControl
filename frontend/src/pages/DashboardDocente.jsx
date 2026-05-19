import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function saludar(nombre) {
  const h = new Date().getHours();
  const prefijo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const primer = nombre?.split(' ')[0] ?? 'docente';
  return { prefijo, nombre: primer };
}

// diaSemana: 0=Lun … 5=Sáb  (Python weekday, devuelto por el backend)
// horaInicio: "HH:MM"
function proximaOcurrencia(diaSemana, horaInicio) {
  const ahora       = new Date();
  const diaJsHoy    = ahora.getDay();                  // 0=Dom, 1=Lun…
  const diaPythonHoy = (diaJsHoy + 6) % 7;             // 0=Lun…
  let diasHasta     = (diaSemana - diaPythonHoy + 7) % 7;

  const [hh, mm]   = (horaInicio || '00:00').split(':').map(Number);
  const fecha       = new Date(ahora);
  fecha.setHours(hh, mm, 0, 0);
  fecha.setDate(fecha.getDate() + diasHasta);

  // Si es hoy pero ya pasó → siguiente semana
  if (diasHasta === 0 && fecha <= ahora) fecha.setDate(fecha.getDate() + 7);
  return fecha;
}

function fmtCountdown(ms) {
  if (ms <= 0) return 'En curso';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function fmtFechaClase(fecha) {
  const hoy    = new Date();
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
  const esMismoDia = (a, b) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (esMismoDia(fecha, hoy))    return 'Hoy';
  if (esMismoDia(fecha, manana)) return 'Mañana';
  return fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
}

function fmtHora(str) {
  if (!str) return '';
  const [h, m] = str.split(':');
  return `${h}:${m}`;
}

// ─── Componentes ──────────────────────────────────────────────────────────────

// Tarjeta de estadística con número grande
function StatCard({ icon, label, value, sub, badge, badgeColor = '', urgent, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left rounded-2xl border p-4 transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-lg
        ${urgent
          ? 'border-red-500/35 bg-gradient-to-br from-red-500/12 to-red-500/4 hover:from-red-500/18'
          : 'border-white/8 bg-white/3 hover:bg-white/6'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[22px] leading-none">{icon}</span>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full leading-4 ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-[28px] font-black text-white leading-none tabular-nums mb-1">
        {value ?? '—'}
      </div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1 leading-tight">{sub}</div>}
    </button>
  );
}

// Banner de sesión activa — prioridad máxima
function BannerSesionActiva({ sesion, onIr }) {
  return (
    <button
      onClick={onIr}
      className="w-full text-left rounded-2xl border border-emerald-500/40
        bg-gradient-to-r from-emerald-500/15 to-emerald-500/5
        hover:from-emerald-500/22 transition-all p-4 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30
          flex items-center justify-center flex-shrink-0">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
          </span>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 leading-none mb-1">
            Sesión activa ahora
          </p>
          <p className="text-white font-semibold text-sm">{sesion.materia}</p>
          <p className="text-slate-400 text-xs">{sesion.grupo} · {sesion.laboratorio_nombre}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold flex-shrink-0">
        Ir a la sesión
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
        </svg>
      </div>
    </button>
  );
}

// Bloque "Próxima clase"
function BloqueProximaClase({ reservacion, countdown, onIr }) {
  if (!reservacion) return null;
  const prox = reservacion._proxFecha;
  const esHoy = fmtFechaClase(prox) === 'Hoy';

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/3 p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-blue-400 mb-1">
            {esHoy ? '⚡ Próxima clase hoy' : '📅 Próxima clase'}
          </p>
          <p className="text-white font-bold text-base leading-tight">{reservacion.materia}</p>
          <p className="text-slate-400 text-sm mt-0.5">
            {reservacion.grupo} · {reservacion.laboratorio_nombre}
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {fmtFechaClase(prox)} · {fmtHora(reservacion.hora_inicio)} – {fmtHora(reservacion.hora_fin)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-2xl font-black tabular-nums leading-none mb-0.5
            ${countdown === 'En curso' ? 'text-emerald-400' : 'text-blue-300'}`}>
            {countdown}
          </div>
          <p className="text-[11px] text-slate-500">
            {countdown === 'En curso' ? '¡Clase en curso!' : 'para comenzar'}
          </p>
          <button
            onClick={onIr}
            className="mt-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors
              flex items-center gap-1 ml-auto"
          >
            Ver horario
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Acceso rápido compacto (row de chips)
const ACCESOS = [
  { label: 'Solicitar laboratorio', path: '/docente/horario',       icon: '📅' },
  { label: 'Solicitar sala o espacio', path: '/espacios/apartar',   icon: '🏛' },
  { label: 'Mis solicitudes de espacios', path: '/espacios/mis-solicitudes', icon: '📋' },
  { label: 'Comunicados',           path: '/comunicados',           icon: '📢' },
  { label: 'Mi historial',          path: '/docente/historial',     icon: '🗂' },
];

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DashboardDocente() {
  const { usuario }   = useAuth();
  const navigate      = useNavigate();

  // Estado
  const [pendientesComunicados, setPendientesComunicados] = useState(null);
  const [sesionActiva,  setSesionActiva]   = useState(null);
  const [proximaClase,  setProximaClase]   = useState(null);
  const [solicitudes,   setSolicitudes]    = useState({ total: 0, pendientes: 0 });
  const [clasesSemana,  setClasesSemana]   = useState(null);
  const [countdown,     setCountdown]      = useState('');
  const [loading,       setLoading]        = useState(true);

  // Cargar datos al montar
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [resComunicados, resSesion, resReservaciones, resSolicitudes] = await Promise.allSettled([
        api.get('/comunicados/pendientes-count'),
        api.get('/sesiones/activas'),
        api.get('/horarios/reservaciones'),
        api.get('/espacios/mis-solicitudes'),
      ]);

      // Comunicados pendientes
      if (resComunicados.status === 'fulfilled') {
        setPendientesComunicados(resComunicados.value.data?.pendientes ?? 0);
      }

      // Sesión activa
      if (resSesion.status === 'fulfilled') {
        setSesionActiva(resSesion.value.data?.[0] || null);
      }

      // Reservaciones → próxima clase + clases esta semana
      if (resReservaciones.status === 'fulfilled') {
        const reservaciones = resReservaciones.value.data || [];
        const activas = reservaciones.filter(r => r.estado !== 'CANCELADA');

        // Contar clases esta semana (días 0-6 desde hoy)
        const hoy = new Date();
        const diaPythonHoy = (hoy.getDay() + 6) % 7;
        const semana = new Set([0,1,2,3,4,5,6].map(i => (diaPythonHoy + i) % 7));
        setClasesSemana(activas.filter(r => semana.has(r.dia_semana)).length);

        // Próxima clase
        const conFecha = activas.map(r => ({
          ...r,
          _proxFecha: proximaOcurrencia(r.dia_semana, r.hora_inicio),
        }));
        conFecha.sort((a, b) => a._proxFecha - b._proxFecha);
        setProximaClase(conFecha[0] || null);
      }

      // Solicitudes de espacio
      if (resSolicitudes.status === 'fulfilled') {
        const sol = resSolicitudes.value.data || [];
        setSolicitudes({
          total: sol.length,
          pendientes: sol.filter(s => ['PENDIENTE', 'EN_REVISION'].includes(s.estado)).length,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // Countdown cada minuto
  useEffect(() => {
    if (!proximaClase) return;
    const tick = () => {
      const diff = proximaClase._proxFecha - new Date();
      setCountdown(fmtCountdown(diff));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [proximaClase]);

  const { prefijo, nombre: nombreCorto } = saludar(usuario?.nombre);

  // Items de "Atención requerida"
  const atencionItems = [];
  if (pendientesComunicados > 0) atencionItems.push({
    label: `${pendientesComunicados} comunicado${pendientesComunicados > 1 ? 's' : ''} sin leer`,
    path: '/comunicados',
    color: 'text-amber-400',
    dot: 'bg-amber-400',
  });
  if (solicitudes.pendientes > 0) atencionItems.push({
    label: `${solicitudes.pendientes} solicitud de espacio en revisión`,
    path: '/espacios/mis-solicitudes',
    color: 'text-blue-400',
    dot: 'bg-blue-400',
  });

  return (
    <AdminLayout>
      <div className="space-y-5 max-w-4xl">

        {/* ── Saludo ──────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            {prefijo},{' '}
            <span className="text-slate-300">{nombreCorto}</span>
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* ── Sesión activa (prioridad máxima) ───────────────────────── */}
        {sesionActiva && (
          <BannerSesionActiva
            sesion={sesionActiva}
            onIr={() => navigate(`/docente/sesion/${sesionActiva.id}`)}
          />
        )}

        {/* ── Próxima clase ──────────────────────────────────────────── */}
        {!loading && proximaClase && (
          <BloqueProximaClase
            reservacion={proximaClase}
            countdown={countdown}
            onIr={() => navigate('/docente/horario')}
          />
        )}

        {/* ── Stats en tiempo real ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon="📢"
            label="Comunicados"
            value={pendientesComunicados ?? '…'}
            sub={pendientesComunicados === 0 ? 'Estás al día ✓' : 'sin leer'}
            badge={pendientesComunicados > 0 ? `${pendientesComunicados} pendiente${pendientesComunicados > 1 ? 's' : ''}` : null}
            badgeColor="bg-amber-500/20 text-amber-300"
            urgent={pendientesComunicados > 0}
            onClick={() => navigate('/comunicados')}
          />
          <StatCard
            icon="🏛"
            label="Solicitudes"
            value={solicitudes.total ?? '…'}
            sub={solicitudes.pendientes > 0
              ? `${solicitudes.pendientes} en revisión`
              : solicitudes.total > 0 ? 'Sin pendientes' : 'Sin solicitudes'}
            badge={solicitudes.pendientes > 0 ? 'En revisión' : null}
            badgeColor="bg-blue-500/20 text-blue-300"
            onClick={() => navigate('/espacios/mis-solicitudes')}
          />
          <StatCard
            icon="🗓"
            label="Esta semana"
            value={clasesSemana ?? '…'}
            sub={clasesSemana === 1 ? 'clase programada' : clasesSemana > 1 ? 'clases programadas' : 'Sin clases'}
            onClick={() => navigate('/docente/horario')}
          />
        </div>

        {/* ── Atención requerida ─────────────────────────────────────── */}
        {atencionItems.length > 0 && (
          <div className="rounded-2xl border border-white/8 bg-white/2 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              Atención requerida
            </p>
            <div className="space-y-2">
              {atencionItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => navigate(item.path)}
                  className="flex items-center gap-3 w-full text-left group"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.dot}`} />
                  <span className={`text-sm font-medium ${item.color} group-hover:underline`}>
                    {item.label}
                  </span>
                  <svg className={`w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-50 ${item.color}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Accesos rápidos (chips) ────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">
            Accesos rápidos
          </p>
          <div className="flex flex-wrap gap-2">
            {ACCESOS.map(a => (
              <button
                key={a.path}
                onClick={() => navigate(a.path)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/8
                  bg-white/3 hover:bg-white/6 text-slate-400 hover:text-white text-sm
                  transition-all duration-150"
              >
                <span className="text-base leading-none">{a.icon}</span>
                <span className="font-medium">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
