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
  </div></AdminLayout>;
}
