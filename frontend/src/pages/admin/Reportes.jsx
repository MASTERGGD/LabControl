import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';

const MESES = [
  "","Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

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
      {sub && <p className="text-xs opacity-50 mt-0.5">{sub}</p>}
    </div>
  );
}

function Delta({ actual, anterior, labelAnt }) {
  if (anterior === 0) return null;
  const pct   = ((actual - anterior) / anterior * 100).toFixed(0);
  const sube  = actual >= anterior;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full
      ${sube ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
      {sube ? '▲' : '▼'} {Math.abs(pct)}% vs {labelAnt}
    </span>
  );
}

export default function Reportes() {
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
      .then(r => {
        setLabs(r.data);
        if (r.data.length > 0) setLabId(r.data[0].id);
      })
      .catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    if (!labId) return;
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get(`/reportes/mensual?laboratorio_id=${labId}&mes=${mes}&anio=${anio}`);
      setDatos(data);
    } catch (err) {
      setError('No se pudo cargar el reporte. Verifica la conexión.');
    } finally {
      setCargando(false);
    }
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
      link.setAttribute('download',
        `Reporte_${(lab?.nombre || 'Lab').replace(/ /g,'_')}_${MESES[mes]}_${anio}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError('Error al generar el Excel. Intenta de nuevo.');
    } finally {
      setDescargando(false);
    }
  };

  const anios = [];
  for (let y = hoy.getFullYear(); y >= 2024; y--) anios.push(y);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-slate-400 text-sm mt-0.5">Informe mensual de actividad por laboratorio</p>
        </div>
        <button
          onClick={descargar}
          disabled={descargando || !datos}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
          {descargando ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Generando Excel...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              </svg>
              Descargar Reporte Excel
            </>
          )}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Laboratorio</label>
          <SelectDark
            value={labId}
            onChange={v => setLabId(Number(v))}
            className="min-w-[220px]"
            options={labs.map(l => ({ value: l.id, label: l.nombre }))}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Mes</label>
          <SelectDark
            value={mes}
            onChange={v => setMes(Number(v))}
            className="w-36"
            options={MESES.slice(1).map((m, i) => ({ value: i + 1, label: m }))}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Año</label>
          <SelectDark
            value={anio}
            onChange={v => setAnio(Number(v))}
            className="w-28"
            options={anios.map(y => ({ value: y, label: String(y) }))}
          />
        </div>
        <button onClick={cargar} disabled={cargando}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          {cargando ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          )}
          Actualizar
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      {cargando && !datos && (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      )}

      {datos && (
        <div className="space-y-6">

          {/* Título del periodo */}
          <div className="glass px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">
                {datos.laboratorio.nombre}
              </h2>
              <p className="text-slate-400 text-sm">
                {MESES[datos.periodo.mes]} {datos.periodo.anio}
                &nbsp;·&nbsp; Capacidad: {datos.laboratorio.capacidad} equipos
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Comparativa sesiones</p>
              <Delta actual={datos.sesiones.total}
                     anterior={datos.comparativa.sesiones_mes_ant}
                     labelAnt={datos.comparativa.mes_ant_nombre} />
            </div>
          </div>

          {/* Métricas principales */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Actividad del mes</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard emoji="🗓️" label="Sesiones realizadas"   value={datos.sesiones.total}         color="blue"   />
              <StatCard emoji="👩‍🏫" label="Docentes activos"     value={datos.docentes.total}          color="purple" />
              <StatCard emoji="🎓" label="Alumnos atendidos"    value={datos.alumnos.total_unicos}    color="green"
                sub={<Delta actual={datos.alumnos.total_unicos} anterior={datos.comparativa.alumnos_mes_ant} labelAnt={datos.comparativa.mes_ant_nombre} />} />
              <StatCard emoji="⏱️" label="Horas de uso"         value={`${datos.sesiones.horas_total}h`} color="blue" />
            </div>
          </div>

          {/* Equipos */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Estado del equipo</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard emoji="💻" label={`PCs operativas / ${datos.pcs.total}`}
                value={datos.pcs.operativas} color="green" />
              <StatCard emoji="🔧" label="PCs en mantenimiento"
                value={datos.pcs.mantenimiento} color={datos.pcs.mantenimiento > 0 ? "yellow" : "gray"} />
              <StatCard emoji="📦" label={`Activos operativos / ${datos.activos.total}`}
                value={datos.activos.operativos} color="green" />
              <StatCard emoji="⚠️" label="Activos dañados/mant."
                value={datos.activos.mantenimiento + datos.activos.danados}
                color={datos.activos.mantenimiento + datos.activos.danados > 0 ? "yellow" : "gray"} />
            </div>
          </div>

          {/* Préstamos e incidentes */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Préstamos e incidentes</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard emoji="📤" label="Préstamos del mes"    value={datos.prestamos.total}          color="blue"   />
              <StatCard emoji="✅" label="Devueltos"             value={datos.prestamos.devueltos}      color="green"  />
              <StatCard emoji="🔴" label="Préstamos vencidos"   value={datos.prestamos.vencidos}
                color={datos.prestamos.vencidos > 0 ? "red" : "gray"} />
              <StatCard emoji="🛠️" label="Incidentes reportados" value={datos.incidentes.total}
                color={datos.incidentes.total > 0 ? "yellow" : "gray"} />
            </div>
          </div>

          {/* Desglose incidentes */}
          {datos.incidentes.total > 0 && (
            <div className="glass p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Seguimiento de incidentes</h3>
              <div className="flex gap-4 flex-wrap">
                {[
                  { lbl: "Pendientes",    val: datos.incidentes.pendientes,  bg: "bg-yellow-900/40 text-yellow-300 border-yellow-700" },
                  { lbl: "Reparados",     val: datos.incidentes.reparados,   bg: "bg-green-900/40 text-green-300 border-green-700"   },
                  { lbl: "Dados de baja", val: datos.incidentes.baja,        bg: "bg-gray-700 text-gray-300 border-gray-600"         },
                ].map(s => (
                  <div key={s.lbl} className={`border rounded-lg px-4 py-2 text-center ${s.bg}`}>
                    <p className="text-xl font-bold">{s.val}</p>
                    <p className="text-xs">{s.lbl}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nota de exportación */}
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
    </AdminLayout>
  );
}
