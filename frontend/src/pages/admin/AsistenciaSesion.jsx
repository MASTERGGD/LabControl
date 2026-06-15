import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRaw(iso) {
  if (!iso) return '—';
  return iso.substring(0, 16).replace('T', '  ');
}

function fmt(iso) {
  if (!iso) return '—';
  const raw = String(iso);
  const date = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}  ${get('hour')}:${get('minute')}`;
}

function fmtHora(iso) {
  const value = fmt(iso);
  return value.includes('  ') ? value.split('  ')[1] : value;
}

function Badge({ children, color = 'slate' }) {
  const map = {
    green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    amber:  'bg-amber-500/15  text-amber-400  border-amber-500/30',
    blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
    slate:  'bg-slate-500/15  text-slate-400  border-slate-500/30',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[color] || map.slate}`}>
      {children}
    </span>
  );
}

function StatCard({ icon, label, value, sub, color = 'blue' }) {
  const grad = {
    blue:   'from-blue-600 to-blue-700',
    green:  'from-emerald-600 to-emerald-700',
    violet: 'from-violet-600 to-violet-700',
    amber:  'from-amber-500  to-amber-600',
  };
  return (
    <div className="glass rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${grad[color] || grad.blue} flex items-center justify-center text-xl shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white leading-none">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AsistenciaSesion() {
  const { sesionId } = useParams();
  const navigate = useNavigate();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [exporting, setExporting] = useState(false);
  const [busqueda,  setBusqueda]  = useState('');

  // ── Cargar datos ────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: d } = await api.get(`/sesiones/${sesionId}/asistencia`);
      setData(d);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cargar la asistencia');
    } finally {
      setLoading(false);
    }
  }, [sesionId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Exportar Excel ──────────────────────────────────────────────────────────
  const exportar = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/sesiones/${sesionId}/asistencia/excel`, {
        responseType: 'blob',
      });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const a    = document.createElement('a');
      a.href     = url;
      const cd   = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `Asistencia_${sesionId}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Error al exportar el archivo');
    } finally {
      setExporting(false);
    }
  };

  // ── Filtrar alumnos ─────────────────────────────────────────────────────────
  const alumnos = (data?.alumnos ?? []).filter(al => {
    const q = busqueda.toLowerCase();
    return (
      al.alumno_nombre.toLowerCase().includes(q) ||
      al.alumno_matricula.toLowerCase().includes(q) ||
      (al.carrera || '').toLowerCase().includes(q) ||
      (al.pc_codigo || '').toLowerCase().includes(q)
    );
  });

  // ── Estadísticas rápidas ────────────────────────────────────────────────────
  const totalAlumnos = data?.total_alumnos ?? 0;
  const enSesion     = (data?.alumnos ?? []).filter(a => a.activa).length;
  const finalizados  = totalAlumnos - enSesion;
  const durPromedio  = totalAlumnos > 0
    ? Math.round(
        (data?.alumnos ?? [])
          .filter(a => a.duracion_min)
          .reduce((s, a) => s + a.duracion_min, 0) /
        Math.max(1, (data?.alumnos ?? []).filter(a => a.duracion_min).length)
      )
    : 0;

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="max-w-lg mx-auto mt-20 glass rounded-2xl p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-slate-300 font-medium mb-2">{error || 'Sesión no encontrada'}</p>
          <button onClick={() => navigate(-1)} className="btn-ghost mt-4">← Volver</button>
        </div>
      </AdminLayout>
    );
  }

  const { sesion, laboratorio, docente } = data;
  const estadoColor = sesion.estado === 'ABIERTA' ? 'green' : sesion.estado === 'CERRADA' ? 'blue' : 'slate';

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button onClick={() => navigate(-1)}
                className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-white">Lista de Asistencia</h1>
              <Badge color={estadoColor}>{sesion.estado}</Badge>
            </div>
            <p className="text-slate-400 text-sm pl-8">
              {sesion.materia} · Grupo {sesion.grupo} · <span className="font-mono text-slate-500">{sesion.codigo_sesion}</span>
            </p>
          </div>
          <button onClick={exportar} disabled={exporting}
            className="btn-emerald flex items-center gap-2 shrink-0">
            {exporting ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            )}
            Exportar Excel
          </button>
        </div>

        {/* ── Info de sesión ───────────────────────────────────────────────── */}
        <div className="glass rounded-2xl p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { icon: '🏛️', lbl: 'Laboratorio', val: laboratorio.nombre },
              { icon: '👩‍🏫', lbl: 'Docente',     val: docente.nombre },
              { icon: '🕐', lbl: 'Inicio',      val: fmt(sesion.inicio) },
              { icon: '🕔', lbl: 'Fin / Duración',
                val: sesion.fin_real
                  ? `${fmt(sesion.fin_real)} (${sesion.duracion_min} min)`
                  : sesion.duracion_min
                    ? `~${sesion.duracion_min} min`
                    : '—' },
            ].map(({ icon, lbl, val }) => (
              <div key={lbl}>
                <p className="text-slate-500 text-xs mb-0.5">{icon} {lbl}</p>
                <p className="text-slate-200 font-medium">{val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon="🎓" label="Alumnos registrados" value={totalAlumnos} color="blue" />
          <StatCard icon="🟢" label="En sesión activa"    value={enSesion}     color="green" />
          <StatCard icon="✅" label="Finalizados"         value={finalizados}  color="violet" />
          <StatCard icon="⏱️" label="Duración promedio"   value={durPromedio ? `${durPromedio} min` : '—'} color="amber" />
        </div>

        {/* ── Tabla ───────────────────────────────────────────────────────── */}
        <div className="glass rounded-2xl overflow-hidden">
          {/* Barra de búsqueda */}
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-4">
            <h2 className="font-semibold text-white text-sm">
              Alumnos ({alumnos.length}{busqueda ? ` de ${totalAlumnos}` : ''})
            </h2>
            <div className="relative w-64">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                   fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
              </svg>
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar alumno, matrícula, PC…"
                className="input-dark pl-9 text-sm h-9 w-full"
                style={{ paddingLeft: 36 }}
              />
            </div>
          </div>

          {alumnos.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <div className="text-4xl mb-3">🎓</div>
              <p>{busqueda ? 'Sin resultados para la búsqueda' : 'No hay alumnos registrados en esta sesión'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/3">
                    {['#','Matrícula','Nombre','Carrera','Cuatrimestre','Grupo','PC','Entrada','Salida','Duración','Estado'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alumnos.map((al, idx) => (
                    <tr key={al.asignacion_id}
                        className="border-b border-white/3 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3 text-slate-500 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono text-slate-300 text-xs whitespace-nowrap">
                        {al.alumno_matricula}
                      </td>
                      <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                        {al.alumno_nombre}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {al.carrera || <span className="text-slate-600 italic">N/D</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">
                        {al.cuatrimestre ?? <span className="text-slate-600 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">
                        {al.grupo_catalogo ?? <span className="text-slate-600 italic">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-lg text-slate-300">
                          {al.pc_codigo || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap font-mono">
                        {al.hora_entrada ? fmtHora(al.hora_entrada) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap font-mono">
                        {al.hora_salida ? fmtHora(al.hora_salida) : (al.activa ? '—' : '—')}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400 text-xs">
                        {al.duracion_min != null ? `${al.duracion_min} min` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {al.activa
                          ? <Badge color="green">En sesión</Badge>
                          : <Badge color="blue">Finalizado</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pie: total */}
          {alumnos.length > 0 && (
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
              <span>{totalAlumnos} alumno{totalAlumnos !== 1 ? 's' : ''} en total</span>
              <span>
                {enSesion > 0 && (
                  <span className="text-emerald-400">{enSesion} en sesión &nbsp;·&nbsp;</span>
                )}
                {finalizados} finalizado{finalizados !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
