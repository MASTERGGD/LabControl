import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import AsistenciaHoyResumen from '../../components/AsistenciaHoyResumen';
import { usePeriodo } from '../../context/PeriodoContext';
import api from '../../hooks/useApi';

const ESTADOS = {
  CON_LISTA: 'Con lista confirmada', SIN_LISTA: 'Sin lista confirmada',
  POR_INICIAR: 'Clases por iniciar', SIN_ACTIVIDAD: 'Sin actividad prevista',
};
const horaCorte = valor => new Date(valor).toLocaleString('es-MX', {
  timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short',
});
const fechaISO = fecha => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const fechaCorta = valor => {
  const [anio, mes, dia] = valor.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(anio, mes - 1, dia));
};

export function csvAsistencia(data) {
  const r = data.resumen;
  const filas = [
    ['Asistencia al corte', data.fecha], ['Periodo', data.periodo.clave],
    ['Corte (hora de México)', horaCorte(data.corte)], ['Carrera', data.carrera || 'Todas las carreras'],
    ['Alumnos únicos con asistencia', r.asistentes],
    ['A tiempo', r.a_tiempo], ['Con retardo', r.retardos], ['Faltaron al corte', r.faltaron], ['Justificados', r.justificados],
    ['Grupos con lista confirmada', r.grupos_con_lista], ['Grupos sin lista confirmada', r.grupos_sin_lista],
    ['Listas pendientes al corte', r.listas_pendientes], ['Criterio', data.criterio], [],
    ['Carrera', 'Grupo', 'Turno', 'Alumnos únicos con asistencia', 'Alumnos con registro', 'A tiempo', 'Con retardo', 'Faltaron al corte', 'Justificados', 'Listas confirmadas', 'Listas pendientes', 'Estado'],
    ...data.grupos.map(g => [g.carrera, g.nombre, g.turno || '', g.asistentes, g.alumnos_con_registro,
      ...[g.a_tiempo, g.retardos, g.faltaron, g.justificados].map(v => g.listas_confirmadas ? v : ''), g.listas_confirmadas, g.listas_pendientes, ESTADOS[g.estado]]),
  ];
  const celda = valor => {
    let texto = String(valor ?? '');
    if (/^[\s]*[=+@-]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + filas.map(fila => fila.map(celda).join(',')).join('\r\n');
}

export default function AsistenciaHoy() {
  const { periodo } = usePeriodo();
  const periodoId = periodo?.id;
  const [carrera, setCarrera] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [revision, setRevision] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [reporteDesde, setReporteDesde] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return fechaISO(d); });
  const [reporteHasta, setReporteHasta] = useState(() => fechaISO(new Date()));
  const [reporte, setReporte] = useState(null);
  const [errorReporte, setErrorReporte] = useState('');
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [exportandoReporte, setExportandoReporte] = useState(false);

  useEffect(() => { setCarrera(''); setDatos(null); }, [periodoId]);
  useEffect(() => {
    if (!periodoId) return;
    let vigente = true;
    setCargando(true); setError(''); setDatos(null);
    api.get('/reportes-academicos/asistencia-diaria', { params: {
      periodo_id: periodoId, ...(carrera ? { carrera } : {}),
    } }).then(({ data }) => { if (vigente) setDatos(data); })
      .catch(err => { if (vigente) setError(err.response?.data?.detail || 'No se pudo actualizar el corte. Revisa tu conexión y vuelve a intentarlo.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [periodoId, carrera, revision]);

  const exportar = async () => {
    setExportando(true); setError('');
    try {
      const { data } = await api.get('/reportes-academicos/asistencia-diaria/excel', {
        params: { periodo_id: periodoId, fecha: datos.fecha, ...(carrera ? { carrera } : {}) }, responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const enlace = document.createElement('a');
      enlace.href = url; enlace.download = `asistencia-${datos.fecha}.xlsx`; enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('No se pudo exportar el Excel. Vuelve a intentarlo.');
    } finally { setExportando(false); }
  };
  const consultarReporte = async (evento) => {
    evento?.preventDefault();
    setCargandoReporte(true); setErrorReporte(''); setReporte(null);
    try {
      const { data } = await api.get('/reportes-academicos/asistencia-rango', { params: {
        periodo_id: periodoId, desde: reporteDesde, hasta: reporteHasta, ...(carrera ? { carrera } : {}),
      } });
      setReporte(data);
    } catch (err) {
      setErrorReporte(err.response?.data?.detail || 'No se pudo generar el reporte. Revisa el rango y vuelve a intentarlo.');
    } finally { setCargandoReporte(false); }
  };
  const exportarReporte = async () => {
    setExportandoReporte(true); setErrorReporte('');
    try {
      const { data } = await api.get('/reportes-academicos/asistencia-rango/excel', { params: {
        periodo_id: periodoId, desde: reporteDesde, hasta: reporteHasta, ...(carrera ? { carrera } : {}),
      }, responseType: 'blob' });
      const url = URL.createObjectURL(data); const enlace = document.createElement('a');
      enlace.href = url; enlace.download = `asistencia-${reporteDesde}-a-${reporteHasta}.xlsx`; enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setErrorReporte('No se pudo exportar el Excel. Vuelve a intentarlo.'); }
    finally { setExportandoReporte(false); }
  };
  return <AdminLayout><div className="asistencia-hoy space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-white">Asistencia de hoy</h1><p className="mt-1 text-sm text-slate-400">{periodo?.clave || 'Selecciona un periodo'}</p></div>
      <Link to="/division-carrera/reportes-academicos" className="text-sm font-semibold text-blue-300 underline">Reportes académicos</Link>
    </header>
    <section className="flex flex-wrap items-end gap-3">
      <label className="min-w-[200px] flex-1 text-sm text-slate-300">Carrera<select value={carrera} disabled={cargando || !periodoId} onChange={e => setCarrera(e.target.value)} className="input-dark mt-1">
        <option value="">Todas las carreras</option>
        {(datos?.carreras_disponibles || (carrera ? [carrera] : [])).map(nombre => <option key={nombre}>{nombre}</option>)}
      </select></label>
      {datos && <span className="pb-2 text-xs text-slate-400">Corte: <time dateTime={datos.corte}>{horaCorte(datos.corte)}</time> · México</span>}
      <button onClick={() => setRevision(v => v + 1)} disabled={cargando || !periodoId} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{cargando ? 'Actualizando…' : 'Actualizar corte'}</button>
      <button onClick={exportar} disabled={!datos || cargando || exportando} className="rounded-xl border border-white/20 px-4 py-2.5 text-sm text-slate-200 disabled:opacity-50">{exportando ? 'Exportando…' : 'Exportar Excel con detalle'}</button>
    </section>
    {error && <p role="alert" className="attendance-error rounded-xl border p-4">{error}</p>}
    {cargando && <p role="status" className="text-sm text-slate-400">Consultando las listas confirmadas en el servidor…</p>}
    {datos && <AsistenciaHoyResumen key={`${periodoId}-${carrera}`} datos={datos} />}
    <section className="glass space-y-4 rounded-2xl border border-white/10 p-5">
      <header><h2 className="text-lg font-semibold text-white">Reporte de asistencia por fechas</h2><p className="mt-1 text-sm text-slate-400">Consulta alumnos únicos por día, revisa el máximo y exporta el detalle. Máximo 31 días.</p></header>
      <form onSubmit={consultarReporte} className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-300">Desde<input type="date" required value={reporteDesde} max={reporteHasta} onChange={e => setReporteDesde(e.target.value)} className="input-dark mt-1 block" /></label>
        <label className="text-sm text-slate-300">Hasta<input type="date" required value={reporteHasta} min={reporteDesde} max={fechaISO(new Date())} onChange={e => setReporteHasta(e.target.value)} className="input-dark mt-1 block" /></label>
        <button type="submit" disabled={!periodoId || cargandoReporte || !reporteDesde || !reporteHasta} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{cargandoReporte ? 'Generando…' : 'Generar reporte'}</button>
        {reporte && <button type="button" onClick={exportarReporte} disabled={exportandoReporte} className="rounded-xl border border-white/20 px-4 py-2.5 text-sm text-slate-200 disabled:opacity-50">{exportandoReporte ? 'Exportando…' : 'Exportar Excel'}</button>}
      </form>
      {errorReporte && <p role="alert" className="attendance-error rounded-xl border p-3 text-sm">{errorReporte}</p>}
      {reporte && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="attendance-kpi is-primary"><p className="text-xs text-slate-300">Máximo de alumnos únicos</p><p className="mt-1 text-2xl font-bold text-white">{reporte.resumen.maximo_asistentes ?? '—'}</p><p className="text-xs text-slate-400">{reporte.resumen.fechas_maximo.length ? reporte.resumen.fechas_maximo.map(fechaCorta).join(', ') : 'Sin listas confirmadas'}</p></div>
          <div className="attendance-kpi"><p className="text-xs text-slate-300">Promedio diario</p><p className="mt-1 text-2xl font-bold text-white">{reporte.resumen.promedio_asistentes ?? '—'}</p><p className="text-xs text-slate-400">Solo días con listas confirmadas</p></div>
          <div className="attendance-kpi"><p className="text-xs text-slate-300">Días completos</p><p className="mt-1 text-2xl font-bold text-white">{reporte.resumen.dias_completos}</p><p className="text-xs text-slate-400">Todas las clases programadas confirmadas</p></div>
          <div className="attendance-kpi"><p className="text-xs text-slate-300">Días parciales</p><p className="mt-1 text-2xl font-bold text-white">{reporte.resumen.dias_parciales}</p><p className="text-xs text-slate-400">Hay listas pendientes de confirmar</p></div>
        </div>
        <div className="attendance-table overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-slate-400"><tr>{['Fecha', 'Alumnos únicos', 'Clases programadas', 'Listas confirmadas', 'Estado'].map(t => <th key={t} className="px-3 py-3">{t}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/10 text-slate-200">{reporte.dias.map(d => <tr key={d.fecha} className={reporte.resumen.fechas_maximo.includes(d.fecha) ? 'bg-emerald-500/10' : ''}>
            <td className="px-3 py-3 font-medium">{fechaCorta(d.fecha)}{reporte.resumen.fechas_maximo.includes(d.fecha) && <span className="ml-2 text-xs font-semibold text-emerald-400">Máximo</span>}</td>
            <td className="px-3 py-3 font-semibold tabular-nums">{d.asistentes ?? '—'}</td><td className="px-3 py-3 tabular-nums">{d.clases_programadas}</td><td className="px-3 py-3 tabular-nums">{d.listas_confirmadas}</td><td className="px-3 py-3">{d.etiqueta}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="text-xs leading-relaxed text-slate-400">{reporte.criterio}</p>
      </>}
    </section>
  </div></AdminLayout>;
}
