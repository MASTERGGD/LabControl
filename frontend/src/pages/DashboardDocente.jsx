import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toTitleCase = s => !s ? '' : s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());

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
  const dias = Math.floor(totalMin / 1_440);
  const h = Math.floor((totalMin % 1_440) / 60);
  const m = totalMin % 60;

  if (dias > 0) {
    const textoDias = dias === 1 ? '1 dia' : `${dias} dias`;
    return h > 0 ? `${textoDias} ${h}h` : textoDias;
  }

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
      className={`dashboard-surface ${urgent ? 'dashboard-urgent' : ''} group w-full text-left rounded-2xl border p-4 transition-all duration-200
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
      {sub && <div className="text-[11px] mt-1 leading-tight" style={{ color: '#9ca3af' }}>{sub}</div>}
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
          <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: '#10b981' }}>
            {esHoy ? '⚡ Próxima clase hoy' : '📅 Próxima clase'}
          </p>
          <p className="text-white font-bold text-base leading-tight">{reservacion.materia}</p>
          <p className="text-slate-400 text-sm mt-0.5">
            {reservacion.grupo} · {toTitleCase(reservacion.laboratorio_nombre)}
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
            className="mt-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors
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
  { label: 'Mi horario docente',    path: '/docente/horario',       icon: '📅' },
  { label: 'Historial de clases',   path: '/docente/historial-clases', icon: '📖' },
  { label: 'Solicitar laboratorio', path: '/docente/laboratorio',   icon: '🖥️' },
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
  const [operacion,     setOperacion]      = useState(null);
  const [countdown,     setCountdown]      = useState('');
  const [loading,       setLoading]        = useState(true);

  // Cargar datos al montar
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [resComunicados, resSesion, resReservaciones, resSolicitudes, resOperacion] = await Promise.allSettled([
        api.get('/comunicados/pendientes-count'),
        api.get('/sesiones/activas'),
        api.get('/horarios/reservaciones'),
        api.get('/espacios/mis-solicitudes'),
        api.get('/docencia/dashboard'),
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
      if (resOperacion.status === 'fulfilled') {
        setOperacion(resOperacion.value.data);
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
  if (operacion?.resumen.asistencias_pendientes > 0) atencionItems.unshift({
    label: `${operacion.resumen.asistencias_pendientes} asistencia(s) requieren registro o cierre`,
    path: '/docente/horario',
    color: 'text-red-400',
    dot: 'bg-red-400',
  });
  if (operacion?.resumen.acuerdos_pendientes > 0) atencionItems.push({
    label: `${operacion.resumen.acuerdos_pendientes} acuerdo(s) académico(s) pendientes`,
    path: '/docente/seguimiento',
    color: 'text-amber-400',
    dot: 'bg-amber-400',
  });

  return (
    <AdminLayout>
      <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-5">

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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            icon="🗓"
            label="Clases hoy"
            value={operacion?.resumen.clases_hoy ?? '…'}
            sub={`${operacion?.resumen.clases_cerradas ?? 0} cerrada(s)`}
            onClick={() => navigate('/docente/horario')}
          />
          <StatCard
            icon="⚠️"
            label="Asistencias pendientes"
            value={operacion?.resumen.asistencias_pendientes ?? '…'}
            sub="Por registrar o cerrar"
            urgent={operacion?.resumen.asistencias_pendientes > 0}
            onClick={() => navigate('/docente/horario')}
          />
          <StatCard
            icon="👥"
            label="Grupos activos"
            value={operacion?.resumen.grupos_activos ?? '…'}
            sub={`${clasesSemana ?? 0} clase(s) esta semana`}
            onClick={() => navigate('/docente/seguimiento')}
          />
          <StatCard
            icon="🚨"
            label="Alumnos en atención"
            value={operacion?.resumen.alumnos_atencion ?? '…'}
            sub="Con indicadores académicos"
            urgent={operacion?.resumen.alumnos_atencion > 0}
            onClick={() => navigate('/docente/seguimiento')}
          />
          <StatCard
            icon="📌"
            label="Acuerdos pendientes"
            value={operacion?.resumen.acuerdos_pendientes ?? '…'}
            sub="Seguimiento académico"
            onClick={() => navigate('/docente/seguimiento')}
          />
          <StatCard
            icon="📢"
            label="Comunicados"
            value={pendientesComunicados ?? '…'}
            sub={pendientesComunicados === 0 ? 'Estás al día ✓' : `${pendientesComunicados} sin leer`}
            urgent={pendientesComunicados > 0}
            onClick={() => navigate('/comunicados')}
          />
        </div>

        {/* ── Atención requerida ─────────────────────────────────────── */}
        {atencionItems.length > 0 && (
          <div className="dashboard-surface rounded-2xl border border-white/8 p-4">
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

        {/* ── Jornada de hoy ─────────────────────────────────────────── */}
        <div className="dashboard-surface rounded-2xl border border-white/8 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
            <div>
              <h2 className="font-bold text-white">Mi jornada de hoy</h2>
              <p className="text-xs text-slate-500">Clases, espacios y estado de la asistencia.</p>
            </div>
            <button onClick={() => navigate('/docente/horario')} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Ver horario completo →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-white/3 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Hora</th><th>Materia</th><th>Grupo</th><th>Espacio</th><th>Estado</th><th className="pr-5 text-right"></th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {operacion?.jornada.map(item => {
                  const estado = {
                    PROGRAMADA: ['Programada', 'bg-blue-500/15 text-blue-300'],
                    EN_CURSO: ['En curso', 'bg-emerald-500/15 text-emerald-300'],
                    CERRADA: ['Cerrada', 'bg-slate-500/15 text-slate-400'],
                    CORRECCION: ['En corrección', 'bg-amber-500/15 text-amber-300'],
                    SIN_REGISTRO: ['Sin registro', 'bg-red-500/15 text-red-300'],
                  }[item.estado] || [item.estado, 'bg-slate-500/15 text-slate-400'];
                  return (
                    <tr key={item.carga_id} className="hover:bg-white/3">
                      <td className="px-5 py-3 font-bold text-white">{item.hora_inicio}–{item.hora_fin}</td>
                      <td><p className="font-semibold text-white">{item.materia}</p><p className="text-xs text-slate-500">{item.carrera}</p></td>
                      <td className="text-slate-400">{item.grupo}</td>
                      <td className="text-slate-400">{item.espacio}</td>
                      <td><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${estado[1]}`}>{estado[0]}</span></td>
                      <td className="pr-5 text-right"><button onClick={() => navigate(item.clase_id ? `/docente/clase/${item.clase_id}` : '/docente/horario')} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">{item.clase_id ? 'Abrir clase' : 'Ir al horario'} →</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && !operacion?.jornada.length && <p className="p-8 text-center text-sm text-slate-500">No tienes clases programadas para hoy.</p>}
          </div>
        </div>

        {/* ── Panorama de grupos y alumnos prioritarios ─────────────── */}
        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="dashboard-surface rounded-2xl border border-white/8 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div><h2 className="font-bold text-white">Panorama de mis grupos</h2><p className="text-xs text-slate-500">Asistencia y alertas de las materias que impartes.</p></div>
              <button onClick={() => navigate('/docente/seguimiento')} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Ver seguimiento →</button>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {operacion?.grupos.map(grupo => (
                <button key={grupo.carga_id} onClick={() => navigate(`/docente/seguimiento?carga=${grupo.carga_id}`)} className="dashboard-subtle rounded-xl border border-white/8 p-4 text-left hover:border-emerald-500/30 hover:bg-emerald-500/5">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{grupo.materia}</p><p className="text-xs text-slate-500">{grupo.grupo} · {grupo.carrera}</p></div>{grupo.alumnos_alerta > 0 && <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-300">{grupo.alumnos_alerta} alerta(s)</span>}</div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div><b className="block text-base text-white">{grupo.total_alumnos}</b><span className="text-slate-500">Alumnos</span></div>
                    <div><b className={`block text-base ${grupo.asistencia_promedio < 80 ? 'text-red-400' : 'text-emerald-400'}`}>{grupo.asistencia_promedio}%</b><span className="text-slate-500">Asistencia</span></div>
                    <div><b className="block text-base text-amber-400">{grupo.acuerdos_pendientes}</b><span className="text-slate-500">Acuerdos</span></div>
                  </div>
                  <p className="mt-3 text-[10px] text-slate-500">{grupo.total_clases} clase(s) registrada(s){grupo.ultima_clase ? ` · Última: ${new Date(`${grupo.ultima_clase}T12:00:00`).toLocaleDateString('es-MX')}` : ''}</p>
                </button>
              ))}
              {!loading && !operacion?.grupos.length && <p className="col-span-full p-6 text-center text-sm text-slate-500">Todavía no hay grupos activos configurados.</p>}
            </div>
          </div>

          <div className="dashboard-surface rounded-2xl border border-white/8 overflow-hidden">
            <div className="border-b border-white/8 px-5 py-4"><h2 className="font-bold text-white">Alumnos que requieren atención</h2><p className="text-xs text-slate-500">Prioridad calculada con asistencias y seguimiento.</p></div>
            <div className="divide-y divide-white/5">
              {operacion?.alumnos_prioritarios.slice(0, 5).map(alumno => (
                <button key={`${alumno.carga_id}-${alumno.alumno_id}`} onClick={() => navigate(`/docente/seguimiento/${alumno.carga_id}/alumno/${alumno.alumno_id}`)} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-white/3">
                  <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${alumno.prioridad === 'ALTA' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{alumno.nombre}</p><p className="text-xs text-slate-500">{alumno.grupo} · {alumno.materia}</p><p className={`mt-1 text-xs ${alumno.prioridad === 'ALTA' ? 'text-red-300' : 'text-amber-300'}`}>{alumno.motivos[0]}</p></div>
                  <span className="text-xs font-bold text-slate-400">{alumno.asistencia}%</span>
                </button>
              ))}
              {!loading && !operacion?.alumnos_prioritarios.length && <p className="p-8 text-center text-sm text-slate-500">No hay alertas académicas activas.</p>}
            </div>
          </div>
        </div>

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
                className="dashboard-subtle flex items-center gap-2 px-4 py-2 rounded-xl border border-white/8
                  hover:bg-white/6 text-slate-400 hover:text-white text-sm
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
