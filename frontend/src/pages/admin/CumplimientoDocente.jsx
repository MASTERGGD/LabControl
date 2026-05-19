import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const SEMAFORO = {
  verde:    { bg: 'bg-green-500',  text: 'text-green-400',  label: 'Bueno' },
  amarillo: { bg: 'bg-yellow-400', text: 'text-yellow-400', label: 'Regular' },
  rojo:     { bg: 'bg-red-500',    text: 'text-red-400',    label: 'Crítico' },
};

function SemaforoCirculo({ valor }) {
  const s = SEMAFORO[valor] ?? SEMAFORO.rojo;
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded-full ${s.bg}`} title={s.label} />
      <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
    </span>
  );
}

function BarraProgreso({ pct }) {
  const color = pct >= 85 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-300 w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function CumplimientoDocente() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [laboratorios, setLaboratorios] = useState([]);
  const [docentes, setDocentes]         = useState([]);

  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0];

  const [filtros, setFiltros] = useState({
    laboratorio_id: '',
    cuatrimestre: '',
    docente_id: '',
    fecha_inicio: primerDia,
    fecha_fin: ultimoDia,
  });

  const [reporte, setReporte]     = useState(null);
  const [cargando, setCargando]   = useState(false);
  const [error, setError]         = useState('');
  const [expandido, setExpandido] = useState(null); // docente_id expandido

  // Cargar laboratorios y docentes
  useEffect(() => {
    fetch(`${API}/laboratorios`, { headers })
      .then(r => r.json()).then(d => setLaboratorios(d)).catch(() => {});
    fetch(`${API}/usuarios?rol=DOCENTE&limit=200`, { headers })
      .then(r => r.json()).then(d => setDocentes(Array.isArray(d) ? d : d.items ?? [])).catch(() => {});
  }, []);

  const generarReporte = useCallback(async () => {
    setCargando(true);
    setError('');
    setReporte(null);
    setExpandido(null);

    const params = new URLSearchParams();
    if (filtros.laboratorio_id) params.append('laboratorio_id', filtros.laboratorio_id);
    if (filtros.cuatrimestre)   params.append('cuatrimestre',   filtros.cuatrimestre);
    if (filtros.docente_id)     params.append('docente_id',     filtros.docente_id);
    if (filtros.fecha_inicio)   params.append('fecha_inicio',   filtros.fecha_inicio);
    if (filtros.fecha_fin)      params.append('fecha_fin',      filtros.fecha_fin);

    try {
      const r = await fetch(`${API}/reportes/cumplimiento?${params}`, { headers });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      setReporte(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [filtros, token]);

  const exportarCSV = () => {
    if (!reporte) return;
    const cols = ['Docente','Reservaciones','Esperadas','Impartidas','No Asistió','Cancelación Tardía','Sin Registro','% Cumplimiento','Semáforo'];
    const rows = reporte.docentes.map(d => [
      d.docente_nombre,
      d.reservaciones_activas,
      d.clases_esperadas,
      d.impartidas,
      d.no_asistio,
      d.cancelacion_tardia,
      d.sin_registro,
      d.porcentaje_cumplimiento,
      d.semaforo,
    ]);
    const csv = [cols, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cumplimiento_docente_${filtros.fecha_inicio}_${filtros.fecha_fin}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Cabecera */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
          Cumplimiento Docente
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          Seguimiento de asistencia y cumplimiento de clases por docente y cuatrimestre.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Laboratorio */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Laboratorio</label>
            <select
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filtros.laboratorio_id}
              onChange={e => setF('laboratorio_id', e.target.value)}
            >
              <option value="">Todos</option>
              {laboratorios.map(l => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>

          {/* Cuatrimestre */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Cuatrimestre</label>
            <input
              type="text"
              placeholder="Ej: 2025-1"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filtros.cuatrimestre}
              onChange={e => setF('cuatrimestre', e.target.value)}
            />
          </div>

          {/* Fecha inicio */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fecha inicio</label>
            <input
              type="date"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filtros.fecha_inicio}
              onChange={e => setF('fecha_inicio', e.target.value)}
            />
          </div>

          {/* Fecha fin */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fecha fin</label>
            <input
              type="date"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filtros.fecha_fin}
              onChange={e => setF('fecha_fin', e.target.value)}
            />
          </div>

          {/* Docente */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Docente (opcional)</label>
            <select
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filtros.docente_id}
              onChange={e => setF('docente_id', e.target.value)}
            >
              <option value="">Todos</option>
              {docentes.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={generarReporte}
            disabled={cargando}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {cargando ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            )}
            Generar reporte
          </button>

          {reporte && (
            <button
              onClick={exportarCSV}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 border border-red-500/50 text-red-300 rounded-lg p-4 mb-6 text-sm">
          Error al cargar el reporte: {error}
        </div>
      )}

      {/* Resultados */}
      {reporte && (
        <>
          {/* Resumen filtros */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="bg-slate-800 text-slate-400 text-xs px-3 py-1 rounded-full border border-slate-700">
              {reporte.filtros.fecha_inicio} → {reporte.filtros.fecha_fin}
            </span>
            {reporte.filtros.cuatrimestre && (
              <span className="bg-slate-800 text-slate-400 text-xs px-3 py-1 rounded-full border border-slate-700">
                Cuatrimestre: {reporte.filtros.cuatrimestre}
              </span>
            )}
            <span className="bg-blue-900/40 text-blue-300 text-xs px-3 py-1 rounded-full border border-blue-700/50">
              {reporte.docentes.length} docente{reporte.docentes.length !== 1 ? 's' : ''}
            </span>
          </div>

          {reporte.docentes.length === 0 ? (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-10 text-center text-slate-500">
              No se encontraron reservaciones con los filtros aplicados.
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Estado</th>
                      <th className="px-4 py-3 text-left">Docente</th>
                      <th className="px-4 py-3 text-center">Reserv.</th>
                      <th className="px-4 py-3 text-center">Esperadas</th>
                      <th className="px-4 py-3 text-center">Impartidas</th>
                      <th className="px-4 py-3 text-center">No asistió</th>
                      <th className="px-4 py-3 text-center">Canc. tardía</th>
                      <th className="px-4 py-3 text-center">Sin registro</th>
                      <th className="px-4 py-3 text-left min-w-[160px]">% Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.docentes.map((d, idx) => (
                      <React.Fragment key={d.docente_id}>
                        <tr
                          className={`border-t border-slate-800 cursor-pointer transition-colors ${
                            idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/60'
                          } hover:bg-slate-800/60`}
                          onClick={() => setExpandido(expandido === d.docente_id ? null : d.docente_id)}
                        >
                          <td className="px-4 py-3"><SemaforoCirculo valor={d.semaforo} /></td>
                          <td className="px-4 py-3 font-medium text-slate-100">
                            <div className="flex items-center gap-2">
                              <span>{d.docente_nombre}</span>
                              <svg
                                className={`w-3 h-3 text-slate-500 transition-transform ${expandido === d.docente_id ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                              </svg>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-300">{d.reservaciones_activas}</td>
                          <td className="px-4 py-3 text-center text-slate-300">{d.clases_esperadas}</td>
                          <td className="px-4 py-3 text-center text-green-400 font-semibold">{d.impartidas}</td>
                          <td className="px-4 py-3 text-center text-red-400">{d.no_asistio}</td>
                          <td className="px-4 py-3 text-center text-orange-400">{d.cancelacion_tardia}</td>
                          <td className="px-4 py-3 text-center text-slate-400">{d.sin_registro}</td>
                          <td className="px-4 py-3"><BarraProgreso pct={d.porcentaje_cumplimiento} /></td>
                        </tr>

                        {/* Fila expandida — detalle de reservaciones */}
                        {expandido === d.docente_id && (
                          <tr className="border-t border-slate-700">
                            <td colSpan={9} className="bg-slate-950/60 px-4 py-4">
                              <div className="ml-2">
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">
                                  Detalle por reservación
                                </p>
                                {d.detalle.length === 0 ? (
                                  <p className="text-slate-500 text-sm">Sin reservaciones en este rango.</p>
                                ) : (
                                  <div className="space-y-4">
                                    {d.detalle.map(det => (
                                      <div
                                        key={det.reservacion_id}
                                        className="bg-slate-900 border border-slate-700 rounded-lg p-4"
                                      >
                                        {/* Cabecera de reservación */}
                                        <div className="flex flex-wrap gap-3 items-start mb-3">
                                          <div>
                                            <p className="text-sm font-semibold text-slate-100">
                                              {det.materia} — Grupo {det.grupo}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                              {det.dia_nombre} {det.hora_inicio} &nbsp;·&nbsp; ID #{det.reservacion_id}
                                            </p>
                                          </div>
                                          <div className="flex gap-3 ml-auto text-xs">
                                            <span className="bg-slate-800 px-2 py-1 rounded text-slate-400">
                                              Esperadas: <b className="text-slate-200">{det.clases_esperadas}</b>
                                            </span>
                                            <span className="bg-green-900/40 px-2 py-1 rounded text-green-400">
                                              Impartidas: <b>{det.impartidas}</b>
                                            </span>
                                            <span className="bg-red-900/40 px-2 py-1 rounded text-red-400">
                                              No asistió: <b>{det.no_asistio}</b>
                                            </span>
                                            <span className="bg-orange-900/40 px-2 py-1 rounded text-orange-400">
                                              Canc. tardía: <b>{det.cancelacion_tardia}</b>
                                            </span>
                                          </div>
                                        </div>

                                        {/* Lista de eventos */}
                                        {det.eventos.length === 0 ? (
                                          <p className="text-xs text-slate-600 italic">Sin eventos registrados en este rango.</p>
                                        ) : (
                                          <div className="flex flex-wrap gap-2 mt-2">
                                            {det.eventos.map((ev, i) => {
                                              const tipoCls =
                                                ev.tipo === 'IMPARTIDA'          ? 'bg-green-900/50 border-green-700/50 text-green-300' :
                                                ev.tipo === 'NO_ASISTIO'         ? 'bg-red-900/50 border-red-700/50 text-red-300' :
                                                ev.tipo === 'CANCELADA_TARDIA'   ? 'bg-orange-900/50 border-orange-700/50 text-orange-300' :
                                                                                   'bg-slate-800 border-slate-600 text-slate-300';
                                              const tipoLabel =
                                                ev.tipo === 'IMPARTIDA'         ? 'Impartida' :
                                                ev.tipo === 'NO_ASISTIO'        ? 'No asistió' :
                                                ev.tipo === 'CANCELADA_TARDIA'  ? 'Canc. tardía' : ev.tipo;
                                              return (
                                                <span
                                                  key={i}
                                                  className={`inline-flex flex-col px-3 py-1.5 rounded border text-xs ${tipoCls}`}
                                                  title={ev.motivo || ''}
                                                >
                                                  <span className="font-semibold">{tipoLabel}</span>
                                                  <span className="opacity-70">{ev.fecha}</span>
                                                  {ev.motivo && <span className="opacity-60 truncate max-w-[140px]">{ev.motivo}</span>}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
