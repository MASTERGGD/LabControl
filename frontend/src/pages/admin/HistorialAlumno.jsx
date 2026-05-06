import React, { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import AutocompleteInput from '../../components/AutocompleteInput';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function StatCard({ icon, label, value, color = 'blue' }) {
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
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function HistorialAlumno() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [matricula,         setMatricula]         = useState(searchParams.get('matricula') || '');
  const [inputVal,          setInputVal]          = useState(searchParams.get('matricula') || '');
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
  const [data,              setData]              = useState(null);
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState('');
  const [exporting,         setExporting]         = useState(false);
  const [busqueda,          setBusqueda]          = useState('');

  // ── Buscar historial ────────────────────────────────────────────────────────
  const buscar = useCallback(async (mat) => {
    const m = (mat || matricula).trim();
    if (!m) return;
    setLoading(true); setError(''); setData(null); setBusqueda('');
    setSearchParams({ matricula: m });
    try {
      const { data: d } = await api.get(`/reportes/historial-alumno?matricula=${encodeURIComponent(m)}`);
      setData(d);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al consultar el historial');
    } finally {
      setLoading(false);
    }
  }, [matricula, setSearchParams]);

  // Selección desde autocomplete → auto-busca
  const seleccionarAlumno = (a) => {
    const nombre = [a.apellido_paterno, a.apellido_materno, a.nombres].filter(Boolean).join(' ');
    setAlumnoSeleccionado(a);
    setInputVal(nombre);
    setMatricula(a.matricula || '');
    if (a.matricula) buscar(a.matricula);   // búsqueda inmediata al seleccionar
  };

  // Limpiar selección al modificar texto
  const handleInputChange = (txt) => {
    setInputVal(txt);
    setAlumnoSeleccionado(null);
    // Si parece matrícula (sin espacios) úsala directamente
    if (!txt.includes(' ')) setMatricula(txt);
    else setMatricula('');
  };

  // ── Auto-buscar si viene matrícula en URL (solo al montar) ───────────────────
  const buscarRef = React.useRef(buscar);
  buscarRef.current = buscar;
  React.useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('matricula');
    if (m) { setInputVal(m); setMatricula(m); buscarRef.current(m); }
  }, []);

  // ── Exportar ────────────────────────────────────────────────────────────────
  const exportar = async () => {
    if (!matricula) return;
    setExporting(true);
    try {
      const res = await api.get(
        `/reportes/historial-alumno/excel?matricula=${encodeURIComponent(matricula)}`,
        { responseType: 'blob' }
      );
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const a    = document.createElement('a');
      a.href     = url;
      const cd   = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `Historial_${matricula}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  // ── Filtrar historial ───────────────────────────────────────────────────────
  const historial = (data?.historial ?? []).filter(h => {
    const q = busqueda.toLowerCase();
    return (
      (h.materia      || '').toLowerCase().includes(q) ||
      (h.grupo        || '').toLowerCase().includes(q) ||
      (h.laboratorio  || '').toLowerCase().includes(q) ||
      (h.docente      || '').toLowerCase().includes(q) ||
      (h.fecha        || '').includes(q)
    );
  });

  // ── Labs únicos (para mostrar distribución) ─────────────────────────────────
  const labsCount = (data?.historial ?? []).reduce((acc, h) => {
    acc[h.laboratorio] = (acc[h.laboratorio] || 0) + 1;
    return acc;
  }, {});
  const topLab = Object.entries(labsCount).sort((a, b) => b[1] - a[1])[0]?.[0];

  const materiasCount = (data?.historial ?? []).reduce((acc, h) => {
    acc[h.materia] = (acc[h.materia] || 0) + 1;
    return acc;
  }, {});
  const topMateria = Object.entries(materiasCount).sort((a, b) => b[1] - a[1])[0]?.[0];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Historial por Alumno</h1>
            <p className="text-slate-400 text-sm">Consulta qué laboratorios usó, cuántas horas y en qué materias</p>
          </div>
        </div>

        {/* ── Buscador ────────────────────────────────────────────────────── */}
        <div className="glass rounded-2xl p-6">
          <label className="block text-sm text-slate-400 mb-1 font-medium">
            🔍 Buscar alumno por nombre o matrícula
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Escribe el nombre del alumno o su número de matrícula
          </p>
          <form onSubmit={e => { e.preventDefault(); buscar(); }}
                className="flex gap-3 items-end flex-wrap">
            <div className="flex-1" style={{ minWidth: '220px', maxWidth: '380px', position: 'relative', zIndex: 10 }}>
              <AutocompleteInput
                endpoint="/catalogo/alumnos/buscar"
                placeholder="Ej: MENDOZA VERONICA o UTC250134"
                value={inputVal}
                onChange={handleInputChange}
                onSelect={seleccionarAlumno}
                renderItem={a => (
                  <div>
                    <span className="font-medium text-white">
                      {[a.apellido_paterno, a.apellido_materno, a.nombres].filter(Boolean).join(' ')}
                    </span>
                    <span className="ml-2 text-xs text-slate-400 font-mono">{a.matricula}</span>
                    {a.grupo && <span className="ml-1 text-xs text-blue-400">· {a.grupo}</span>}
                  </div>
                )}
              />
            </div>

            {/* Chip de matrícula cuando hay alumno seleccionado */}
            {alumnoSeleccionado && (
              <div className="flex items-center gap-2 bg-blue-900/30 border border-blue-700/40 rounded-xl px-3 py-2 text-sm shrink-0">
                <span className="text-blue-300 font-mono text-xs">{alumnoSeleccionado.matricula}</span>
                <button type="button" onClick={() => { setAlumnoSeleccionado(null); setInputVal(''); setMatricula(''); }}
                  className="text-slate-500 hover:text-white leading-none">✕</button>
              </div>
            )}

            <button type="submit" disabled={loading || !matricula.trim()}
              className="btn-blue flex items-center gap-2 shrink-0">
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
                </svg>
              )}
              Consultar
            </button>
          </form>
          {error && (
            <p className="mt-3 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-2">
              {error}
            </p>
          )}
        </div>

        {/* ── Resultados ──────────────────────────────────────────────────── */}
        {data && (
          <>
            {/* Ficha del alumno */}
            <div className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600
                                    flex items-center justify-center text-xl font-bold text-white shrink-0">
                      {(data.alumno.nombre || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xl font-bold text-white">{data.alumno.nombre}</p>
                      <p className="font-mono text-slate-400 text-sm">{data.alumno.matricula}</p>
                    </div>
                  </div>
                  <div className="pl-15 flex flex-wrap gap-2 mt-2">
                    {data.alumno.carrera && (
                      <Badge color="blue">{data.alumno.carrera}</Badge>
                    )}
                    {data.alumno.cuatrimestre && (
                      <Badge color="violet">Cuatrimestre {data.alumno.cuatrimestre}</Badge>
                    )}
                    {data.alumno.grupo && (
                      <Badge color="amber">Grupo {data.alumno.grupo}</Badge>
                    )}
                    {data.alumno.periodo && (
                      <Badge color="slate">{data.alumno.periodo}</Badge>
                    )}
                  </div>
                </div>
                {data.total_sesiones > 0 && (
                  <button onClick={exportar} disabled={exporting}
                    className="btn-emerald flex items-center gap-2 shrink-0 self-start">
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
                )}
              </div>
            </div>

            {/* Stat cards */}
            {data.total_sesiones > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard icon="📅" label="Sesiones asistidas"  value={data.total_sesiones} color="blue" />
                  <StatCard icon="⏱️" label="Horas en laboratorio" value={`${data.total_horas} h`} color="green" />
                  <StatCard icon="🏛️" label="Lab más frecuente"    value={topLab || '—'}        color="violet" />
                  <StatCard icon="📚" label="Materia más cursada"  value={topMateria || '—'}     color="amber" />
                </div>

                {/* Tabla */}
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-4">
                    <h2 className="font-semibold text-white text-sm">
                      Historial ({historial.length}{busqueda ? ` de ${data.total_sesiones}` : ''})
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
                        placeholder="Filtrar por materia, lab…"
                        className="input-dark pl-9 text-sm h-9 w-full"
                      />
                    </div>
                  </div>

                  {historial.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">Sin resultados</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/3">
                            {['#','Fecha','Materia','Grupo','Docente','Laboratorio','PC','Horas','Estado'].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {historial.map((h, idx) => (
                            <tr key={`${h.sesion_id}-${idx}`}
                                className="border-b border-white/3 hover:bg-white/3 transition-colors">
                              <td className="px-4 py-3 text-slate-500 text-xs">{idx + 1}</td>
                              <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap font-mono">
                                {h.fecha || '—'}
                              </td>
                              <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                                {h.materia}
                              </td>
                              <td className="px-4 py-3 text-slate-400 text-center">
                                {h.grupo || '—'}
                              </td>
                              <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                                {h.docente || '—'}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-slate-300 whitespace-nowrap">{h.laboratorio}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-mono text-xs bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-lg text-slate-300">
                                  {h.pc_codigo || '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {h.horas != null
                                  ? <span