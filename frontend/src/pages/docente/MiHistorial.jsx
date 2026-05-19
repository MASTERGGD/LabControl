import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  // Ajustar a México (UTC-6)
  const mx = new Date(d.getTime() - 6 * 60 * 60 * 1000);
  return mx.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDuracion(inicio, fin) {
  if (!inicio || !fin) return '—';
  const a = new Date(inicio + (inicio.endsWith('Z') ? '' : 'Z'));
  const b = new Date(fin + (fin.endsWith('Z') ? '' : 'Z'));
  const mins = Math.round((b - a) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}min` : ''}`;
}

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// ─── Tarjeta de sesión ────────────────────────────────────────────────────────

function SesionCard({ sesion, onVerDetalle }) {
  const duracion = fmtDuracion(sesion.inicio, sesion.fin_real);
  const esLibre  = sesion.tipo_sesion === 'LIBRE';

  return (
    <div
      className="glass border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all cursor-pointer group"
      onClick={() => onVerDetalle(sesion)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {esLibre ? (
              <span className="text-sm font-bold text-emerald-300">🖥️ Sesión Libre</span>
            ) : (
              <span className="text-sm font-bold text-white truncate">{sesion.materia}</span>
            )}
            {sesion.grupo && !esLibre && (
              <span className="text-xs text-slate-400 bg-gray-700 px-1.5 py-0.5 rounded">
                {sesion.grupo}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              {fmtFecha(sesion.inicio)}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {fmtHora(sesion.inicio)} — {fmtHora(sesion.fin_real)}
            </span>
            <span className="text-slate-500">{duracion}</span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {sesion.laboratorio_nombre}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center">
            <p className="text-lg font-bold text-white">{sesion.total_alumnos ?? 0}</p>
            <p className="text-xs text-slate-500">alumnos</p>
          </div>

          {sesion.overtime_min > 0 && (
            <span className="text-xs bg-orange-900/40 border border-orange-700/50 text-orange-300 px-2 py-1 rounded-lg">
              +{sesion.overtime_min}min extra
            </span>
          )}

          <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </div>

      {/* Observación general si existe */}
      {sesion.observacion_general && (
        <p className="mt-2 text-xs text-slate-500 italic truncate">
          "{sesion.observacion_general}"
        </p>
      )}
    </div>
  );
}

// ─── Panel de detalle de una sesión ──────────────────────────────────────────

function PanelDetalle({ sesion, onClose }) {
  const [asistencia, setAsistencia] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const { token }                   = useAuth();

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/sesiones/${sesion.id}/asistencia`)
      .then(res => setAsistencia(res.data))
      .catch(() => setError('No se pudo cargar la asistencia'))
      .finally(() => setLoading(false));
  }, [sesion.id]);

  const handleDescargarExcel = () => {
    const url = `${API_BASE}/sesiones/${sesion.id}/asistencia/excel`;
    const a   = document.createElement('a');
    a.href    = url;
    a.download = `Asistencia_${sesion.codigo_sesion}.xlsx`;

    // Necesitamos el token en el header pero <a> no lo soporta → fetch manual
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const bUrl = URL.createObjectURL(blob);
        const tmp  = document.createElement('a');
        tmp.href   = bUrl;
        tmp.download = `Asistencia_${sesion.codigo_sesion}.xlsx`;
        tmp.click();
        URL.revokeObjectURL(bUrl);
      })
      .catch(() => alert('Error al descargar el Excel'));
  };

  const duracion = fmtDuracion(sesion.inicio, sesion.fin_real);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="glass w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-bold text-white text-base">
              {sesion.tipo_sesion === 'LIBRE' ? '🖥️ Sesión Libre' : sesion.materia}
              {sesion.grupo && sesion.tipo_sesion !== 'LIBRE' && (
                <span className="ml-2 text-sm font-normal text-slate-400">· {sesion.grupo}</span>
              )}
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
              <span>{sesion.laboratorio_nombre}</span>
              <span>·</span>
              <span>{fmtFecha(sesion.inicio)}</span>
              <span>·</span>
              <span>{fmtHora(sesion.inicio)} – {fmtHora(sesion.fin_real)}</span>
              <span className="text-slate-500">({duracion})</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-white/5 shrink-0">
          {[
            { label: 'Alumnos registrados', valor: sesion.total_alumnos ?? 0, color: 'text-green-400' },
            { label: 'Duración real',        valor: duracion,                  color: 'text-blue-400'  },
            { label: 'Tiempo extra',             valor: sesion.overtime_min > 0 ? `+${sesion.overtime_min} min` : '—', color: sesion.overtime_min > 0 ? 'text-orange-400' : 'text-slate-500' },
          ].map(m => (
            <div key={m.label} className="text-center glass-sm rounded-xl py-2 px-3">
              <p className={`text-lg font-bold ${m.color}`}>{m.valor}</p>
              <p className="text-xs text-slate-500">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Observación general */}
        {sesion.observacion_general && (
          <div className="mx-5 mt-3 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl shrink-0">
            <p className="text-xs text-slate-400 mb-0.5">Observación de cierre</p>
            <p className="text-sm text-slate-200 italic">"{sesion.observacion_general}"</p>
          </div>
        )}

        {/* Lista de asistencia */}
        <div className="flex-1 overflow-auto px-5 py-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Lista de asistencia</p>
            <button
              onClick={handleDescargarExcel}
              className="flex items-center gap-1.5 text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
              </svg>
              Descargar Excel
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            </div>
          ) : error ? (
            <p className="text-sm text-red-400 text-center py-8">{error}</p>
          ) : asistencia?.alumnos?.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-500 text-sm">No se registraron alumnos en esta sesión</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(asistencia?.alumnos || [])
                .sort((a, b) => a.alumno_nombre.localeCompare(b.alumno_nombre))
                .map((al, i) => (
                  <div key={al.asignacion_id}
                    className="flex items-center gap-3 bg-gray-800/40 border border-white/5 rounded-xl px-4 py-2.5">
                    <span className="text-xs text-slate-600 w-5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{al.alumno_nombre}</p>
                      <p className="text-xs text-slate-400">{al.alumno_matricula}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-slate-300">
                        {al.pc_codigo || '—'}
                      </p>
                      {al.duracion_min != null && (
                        <p className="text-xs text-slate-500">{al.duracion_min} min</p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 shrink-0">
          <p className="text-xs text-slate-600 text-center">{sesion.codigo_sesion}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MiHistorial() {
  const navigate              = useNavigate();
  const { usuario }           = useAuth();

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [sesiones, setSesiones]           = useState([]);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(false);
  const [laboratorios, setLaboratorios]   = useState([]);
  const [labId, setLabId]                 = useState('');
  const [materia, setMateria]             = useState('');
  const [fechaInicio, setFechaInicio]     = useState('');
  const [fechaFin, setFechaFin]           = useState('');
  const [offset, setOffset]               = useState(0);
  const [detalleSesion, setDetalleSesion] = useState(null);
  const LIMIT = 30;

  // Estadísticas rápidas
  const totalAlumnos  = sesiones.reduce((acc, s) => acc + (s.total_alumnos ?? 0), 0);
  const totalDuracion = sesiones.reduce((acc, s) => {
    if (!s.inicio || !s.fin_real) return acc;
    return acc + Math.round((new Date(s.fin_real + 'Z') - new Date(s.inicio + 'Z')) / 60000);
  }, 0);
  const horasTotales  = Math.floor(totalDuracion / 60);
  const minResto      = totalDuracion % 60;

  // Cargar labs
  useEffect(() => {
    api.get('/laboratorios?solo_activos=true')
      .then(res => setLaboratorios(res.data))
      .catch(() => {});
  }, []);

  // Cargar historial
  const cargar = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off });
      if (labId)        params.set('laboratorio_id', labId);
      if (materia)      params.set('materia', materia);
      if (fechaInicio)  params.set('fecha_inicio', fechaInicio);
      if (fechaFin)     params.set('fecha_fin', fechaFin);

      const { data } = await api.get(`/sesiones/historial?${params}`);
      setSesiones(data.sesiones || []);
      setTotal(data.total || 0);
      setOffset(off);
    } catch {
      setSesiones([]);
    } finally {
      setLoading(false);
    }
  }, [labId, materia, fechaInicio, fechaFin]);

  useEffect(() => { cargar(0); }, [cargar]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>

      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Mi historial de sesiones</h1>
        <p className="text-sm text-slate-400 mt-1">
          Todas tus clases registradas en el sistema
        </p>
      </div>

      {/* Tarjetas de resumen (filtrables) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Sesiones',          valor: total,          color: 'text-indigo-400', icon: '📋' },
          { label: 'Alumnos atendidos', valor: totalAlumnos,   color: 'text-green-400',  icon: '🎓' },
          { label: 'Horas en aula',     valor: `${horasTotales}h${minResto > 0 ? ` ${minResto}min` : ''}`, color: 'text-blue-400',   icon: '⏱️' },
        ].map(m => (
          <div key={m.label} className="glass rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{m.icon}</span>
              <p className="text-xs text-slate-400">{m.label}</p>
            </div>
            <p className={`text-2xl font-bold ${m.color}`}>{m.valor}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="glass rounded-xl p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Laboratorio */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Laboratorio</label>
            <select
              value={labId}
              onChange={e => setLabId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Todos</option>
              {laboratorios.map(l => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>

          {/* Materia */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Materia</label>
            <input
              value={materia}
              onChange={e => setMateria(e.target.value)}
              placeholder="Buscar materia…"
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-slate-500"
            />
          </div>

          {/* Fecha inicio */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 [color-scheme:dark]"
            />
          </div>

          {/* Fecha fin */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={e => setFechaFin(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Limpiar filtros */}
        {(labId || materia || fechaInicio || fechaFin) && (
          <button
            onClick={() => { setLabId(''); setMateria(''); setFechaInicio(''); setFechaFin(''); }}
            className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Lista de sesiones */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      ) : sesiones.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
          </svg>
          <p className="text-slate-500">
            {(labId || materia || fechaInicio || fechaFin)
              ? 'Sin sesiones con esos filtros'
              : 'Aún no tienes sesiones registradas'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {sesiones.map(s => (
              <SesionCard key={s.id} sesion={s} onVerDetalle={setDetalleSesion} />
            ))}
          </div>

          {/* Paginación */}
          {total > LIMIT && (
            <div className="flex items-center justify-between py-3">
              <p className="text-xs text-slate-500">
                Mostrando {offset + 1}–{Math.min(offset + LIMIT, total)} de {total}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => cargar(Math.max(0, offset - LIMIT))}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg"
                >
                  ← Anterior
                </button>
                <button
                  disabled={offset + LIMIT >= total}
                  onClick={() => cargar(offset + LIMIT)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Panel de detalle */}
      {detalleSesion && (
        <PanelDetalle
          sesion={detalleSesion}
          onClose={() => setDetalleSesion(null)}
        />
      )}
    </AdminLayout>
  );
}
