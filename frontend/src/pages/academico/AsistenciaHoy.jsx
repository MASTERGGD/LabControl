import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
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
    ['Asistencia del día', data.fecha], ['Periodo', data.periodo.clave],
    ['Corte (hora de México)', horaCorte(data.corte)], ['Carrera', data.carrera || 'Todas las carreras'],
    ['Alumnos únicos con asistencia', r.asistentes],
    ['Grupos con lista confirmada', r.grupos_con_lista], ['Grupos sin lista confirmada', r.grupos_sin_lista],
    ['Listas pendientes al corte', r.listas_pendientes], ['Criterio', data.criterio], [],
    ['Carrera', 'Grupo', 'Turno', 'Alumnos únicos con asistencia', 'Alumnos con registro', 'Listas confirmadas', 'Listas pendientes', 'Estado'],
    ...data.grupos.map(g => [g.carrera, g.nombre, g.turno || '', g.asistentes, g.alumnos_con_registro,
      g.listas_confirmadas, g.listas_pendientes, ESTADOS[g.estado]]),
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

  const exportar = () => {
    const url = URL.createObjectURL(new Blob([csvAsistencia(datos)], { type: 'text/csv;charset=utf-8;' }));
    const enlace = document.createElement('a');
    enlace.href = url; enlace.download = `asistencia-${datos.fecha}.csv`; enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const r = datos?.resumen;
  return <AdminLayout><div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-white">Asistencia de hoy</h1><p className="mt-1 text-sm text-slate-400">Alumnos únicos con asistencia confirmada durante el día · {periodo?.clave || 'Selecciona un periodo'}</p></div>
      <Link to="/division-carrera/reportes-academicos" className="text-sm font-semibold text-blue-300 underline">Reportes académicos</Link>
    </header>
    <section className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
      <label className="min-w-0 flex-1 text-sm text-slate-300">Carrera<select value={carrera} disabled={cargando || !periodoId} onChange={e => setCarrera(e.target.value)} className="input-dark mt-1">
        <option value="">Todas las carreras</option>
        {(datos?.carreras_disponibles || (carrera ? [carrera] : [])).map(nombre => <option key={nombre}>{nombre}</option>)}
      </select></label>
      <button onClick={() => setRevision(v => v + 1)} disabled={cargando || !periodoId} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{cargando ? 'Actualizando…' : 'Actualizar corte'}</button>
      <button onClick={exportar} disabled={!datos || cargando} className="rounded-xl border border-white/20 px-4 py-2.5 text-sm text-slate-200 disabled:opacity-50">Exportar CSV (Excel)</button>
    </section>
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-red-300">{error}</p>}
    {cargando && <p role="status" className="text-sm text-slate-400">Consultando las listas confirmadas en el servidor…</p>}
    {datos && <>
      <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm text-blue-100">
        <p><b>Corte: {horaCorte(datos.corte)} (hora de México).</b> Se registró asistencia de <b>{r.asistentes} alumnos únicos</b>; {r.grupos_sin_lista} grupos con actividad iniciada aún no tienen lista confirmada.</p>
        <p className="mt-2 text-xs">El corte cambia al pulsar Actualizar. Las capturas guardadas sin conexión aparecen después de sincronizarse y cerrar su lista.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ['Alumnos únicos con asistencia', r.asistentes], ['Grupos con lista confirmada', r.grupos_con_lista],
        ['Grupos sin lista confirmada', r.grupos_sin_lista], ['Grupos con clases por iniciar', r.grupos_por_iniciar],
      ].map(([etiqueta, cantidad]) => <div key={etiqueta} className="glass rounded-xl p-4"><p className="text-3xl font-bold text-white">{cantidad}</p><p className="mt-1 text-sm text-slate-300">{etiqueta}</p></div>)}</div>
      <p className="text-sm text-slate-300">{r.listas_confirmadas} listas confirmadas · {r.listas_pendientes} listas pendientes al corte. Un grupo con lista puede tener otras materias pendientes. Sin lista no significa que sus alumnos faltaron.</p>
      {datos.nota_calendario && <p className="rounded-xl border border-amber-500/30 p-3 text-sm text-amber-200">Calendario: {datos.nota_calendario}</p>}
      <section className="glass rounded-2xl p-4"><h2 className="mb-3 font-semibold text-white">Por carrera</h2><div className="grid gap-3 md:grid-cols-2">{datos.carreras.map(c => <div key={c.carrera} className="rounded-xl border border-white/10 p-3"><h3 className="text-sm text-slate-300">{c.carrera}</h3><p className="mt-1 font-bold text-white">{c.asistentes} alumnos únicos</p><p className="text-xs text-slate-400">{c.grupos_con_lista} grupos con lista · {c.grupos_sin_lista} sin lista confirmada</p></div>)}</div></section>
      <section className="glass overflow-hidden rounded-2xl"><h2 className="p-4 font-semibold text-white">Detalle por grupo</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-white/5 text-slate-400"><tr>{['Grupo / carrera', 'Asistieron', 'Con registro', 'Listas confirmadas', 'Listas pendientes', 'Estado'].map(t => <th key={t} className="px-4 py-3">{t}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/10 text-slate-200">{datos.grupos.map(g => <tr key={g.id}>
            <td className="px-4 py-3"><b>{g.nombre}{g.turno ? ` · ${g.turno}` : ''}</b><span className="block max-w-xs text-xs text-slate-400">{g.carrera}</span></td>
            <td className="px-4 py-3 font-bold">{g.asistentes}</td><td className="px-4 py-3">{g.alumnos_con_registro}</td><td className="px-4 py-3">{g.listas_confirmadas}</td><td className="px-4 py-3">{g.listas_pendientes}</td>
            <td className={`px-4 py-3 ${g.estado === 'SIN_LISTA' ? 'text-amber-300' : 'text-slate-300'}`}>{ESTADOS[g.estado]}{g.listas_en_captura > 0 && <small className="block">{g.listas_en_captura} en captura o corrección</small>}</td>
          </tr>)}</tbody>
        </table></div>{!datos.grupos.length && <p className="p-5 text-slate-400">No hay grupos activos en este periodo.</p>}
      </section>
      <p className="rounded-xl bg-white/5 p-4 text-xs leading-relaxed text-slate-400">{datos.criterio} “Con registro” incluye cualquier estado de asistencia. Los totales se deduplican en cada nivel; no deben obtenerse sumando filas si un alumno aparece en varios grupos.</p>
    </>}
  </div></AdminLayout>;
}
