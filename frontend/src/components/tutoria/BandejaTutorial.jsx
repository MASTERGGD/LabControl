import { useMemo, useState } from 'react';
import { agruparCasos, filtrarCasos, coincideFiltro, antiguedad, eventosCaso, nombreAlumno } from './casosTutoriales';

const filtros = [['TODOS', 'Todos'], ['PENDIENTES', 'Pendientes'], ['PRIORITARIOS', 'Prioritarios'], ['SIN_SEGUIMIENTO', 'Sin seguimiento'], ['REPETIDOS', 'Reportes repetidos'], ['SIN_TUTOR', 'Sin tutor'], ['EN_SEGUIMIENTO', 'En seguimiento'], ['RESUELTOS', 'Resueltos'], ['CIERRE_ADMIN', 'Cierre administrativo']];
const categorias = { ACADEMICO: 'Académico', ASISTENCIA: 'Asistencia', CONDUCTA: 'Conducta', PERSONAL: 'Situación personal', OTRO: 'Otro' };
const filtrosCategoria = [['TODAS', 'Todos'], ['ACADEMICO', 'Académico'], ['ASISTENCIA_CONDUCTA', 'Asistencia / conducta'], ['PERSONAL', 'Situación personal'], ['OTRO', 'Otros']];
const coincideCategoria = (reporte, filtro) => filtro === 'TODAS'
  || (filtro === 'ASISTENCIA_CONDUCTA' ? ['ASISTENCIA', 'CONDUCTA'].includes(reporte.categoria)
    : filtro === 'OTRO' ? !['ACADEMICO', 'ASISTENCIA', 'CONDUCTA', 'PERSONAL'].includes(reporte.categoria)
      : reporte.categoria === filtro);
const colorCategoria = (categoria, tonos) => ({
  ACADEMICO: tonos.azul,
  ASISTENCIA: tonos.rojo,
  CONDUCTA: tonos.rojo,
  PERSONAL: tonos.naranja,
  OTRO: tonos.gris,
}[categoria] || tonos.gris);

export default function BandejaTutorial({ reportes, isDay, estados, onVerReporte, cargando, error, onReintentar }) {
  const [filtro, setFiltro] = useState('PENDIENTES');
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('PRIORIDAD');
  const [abierto, setAbierto] = useState(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODAS');
  const [descripcionAbierta, setDescripcionAbierta] = useState(() => new Set());
  const casos = useMemo(() => agruparCasos(reportes), [reportes]);
  const visibles = useMemo(() => filtrarCasos(casos, filtro, busqueda, orden).filter(caso => caso.reportes.some(reporte => coincideCategoria(reporte, categoriaFiltro))), [casos, filtro, busqueda, orden, categoriaFiltro]);
  const superficie = isDay ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-700 bg-slate-900 text-slate-100';
  const secundario = isDay ? 'text-slate-600' : 'text-slate-400';
  const tonos = {
    rojo: isDay ? 'text-red-700 bg-red-50' : 'text-red-300 bg-red-500/10',
    ambar: isDay ? 'text-amber-800 bg-amber-50' : 'text-amber-300 bg-amber-500/10',
    naranja: isDay ? 'text-orange-800 bg-orange-50' : 'text-orange-300 bg-orange-500/10',
    azul: isDay ? 'text-cyan-800 bg-cyan-50' : 'text-cyan-300 bg-cyan-500/10',
    verde: isDay ? 'text-emerald-800 bg-emerald-50' : 'text-emerald-300 bg-emerald-500/10',
    gris: isDay ? 'text-slate-600 bg-slate-100' : 'text-slate-300 bg-slate-800',
  };
  const etiqueta = c => c.prioritario ? ['Alta prioridad', 'rojo', 'border-l-red-500'] : c.sinTutor ? ['Asignar tutor', 'ambar', 'border-l-amber-500'] : c.atrasado ? ['Requiere atención', 'ambar', 'border-l-amber-500'] : c.sinSeguimiento ? ['Sin seguimiento', 'ambar', 'border-l-amber-500'] : c.activos.length ? ['En seguimiento', 'azul', 'border-l-cyan-500'] : c.cerradoAdministrativo ? ['Cierre administrativo', 'gris', 'border-l-slate-400'] : ['Resuelto', 'verde', 'border-l-emerald-500'];

  return <section className="space-y-5" aria-labelledby="bandeja-titulo">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Atención tutorial</p><h2 id="bandeja-titulo" className="mt-1 text-2xl font-semibold">Reportes y seguimiento tutorial</h2><p className={`mt-1 text-sm ${secundario}`}>Identifica quién necesita atención y consulta sus reportes en un mismo expediente.</p></header>
    {error ? <div role="alert" className={`rounded-xl border p-4 ${superficie}`}><p>No se pudo actualizar la bandeja. Los datos podrían estar desactualizados.</p><button type="button" onClick={onReintentar} className="mt-2 font-semibold text-emerald-600">Reintentar</button></div> : null}
    {cargando && <p role="status" className={`text-sm ${secundario}`}>Actualizando reportes…</p>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[['PENDIENTES', 'Casos pendientes', 'ambar'], ['PRIORITARIOS', 'Prioridad alta confirmada', 'rojo'], ['SIN_SEGUIMIENTO', 'Sin seguimiento', 'naranja'], ['REPETIDOS', 'Alumnos con reportes repetidos', 'gris']].map(([key, label, tono]) => {
        const total = casos.filter(c => coincideFiltro(c, key)).length;
        const riesgo = total > 0 && !error && (key === 'PRIORITARIOS' || key === 'SIN_SEGUIMIENTO');
        const acento = riesgo ? (key === 'PRIORITARIOS' ? 'border-t-red-400' : 'border-t-orange-400') : 'border-t-transparent';
        return <button type="button" key={key} onClick={() => setFiltro(key)} aria-pressed={filtro === key}
          className={`rounded-xl border border-t-4 p-4 text-left transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${superficie} ${acento} ${filtro === key ? 'ring-2 ring-slate-400' : ''}`}>
          <span className={`inline-flex rounded-lg px-2 py-1 text-2xl font-bold ${tonos[total > 0 ? tono : 'gris']}`}>{cargando && !reportes.length ? '—' : total}</span>
          <span className={`mt-2 block text-sm ${secundario}`}>{label}</span>
          <span className={`mt-1 block text-[11px] ${secundario} ${filtro === key ? '' : 'invisible'}`}>Filtro activo</span>
        </button>;
      })}
    </div>
    <div className={`rounded-xl border p-4 ${superficie}`}>
      <p className={`mb-3 text-sm font-semibold ${secundario}`}>Filtrar por tema</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar expedientes por categoría">
        {filtrosCategoria.map(([key, label]) => {
          const total = reportes.filter(reporte => coincideCategoria(reporte, key) && !['ATENDIDO', 'CERRADO', 'CERRADO_ADMINISTRATIVO'].includes(reporte.estado)).length;
          return <button type="button" key={key} aria-pressed={categoriaFiltro === key} onClick={() => setCategoriaFiltro(key)} className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${categoriaFiltro === key ? 'border-emerald-700 bg-emerald-700 text-white' : `${superficie} hover:border-emerald-500`}`}>
            {label} <span className="ml-1 opacity-75">{total}</span>
          </button>;
        })}
      </div>
      <p className={`mt-2 text-xs ${secundario}`}>Los conteos por tema incluyen reportes activos. Cada reporte conserva su historial aunque comparta categoría con otros.</p>
    </div>
    <div className={`space-y-4 rounded-xl border p-4 ${superficie}`}>
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="flex-1"><span className="sr-only">Buscar alumno, matrícula, materia, docente o tutor</span><input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-dark w-full" placeholder="Buscar alumno, matrícula, materia, docente o tutor…" /></label>
        <label className={`flex items-center gap-2 text-xs ${secundario}`}>Ordenar por<select value={orden} onChange={e => setOrden(e.target.value)} className="input-dark"><option value="PRIORIDAD">Mayor prioridad</option><option value="ANTIGUO">Más antiguo</option><option value="RECIENTE">Más reciente</option></select></label>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Filtrar casos">{filtros.map(([key, label]) => <button type="button" key={key} aria-pressed={filtro === key} onClick={() => setFiltro(key)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filtro === key ? 'border-emerald-700 bg-emerald-700 text-white' : `${superficie} hover:border-emerald-500`}`}>{label} <span className="ml-1 opacity-75">{casos.filter(c => coincideFiltro(c, key)).length}</span></button>)}</div>
      <details className={`text-xs ${secundario}`}><summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">Cómo se priorizan los casos</summary>
        <p className="mt-2 leading-5">En «Mayor prioridad»: primero los reportes con prioridad alta confirmada, luego los casos sin tutor y los que llevan 3 días o más sin acción tutorial. Dentro de cada nivel, aparecen primero los más antiguos.</p>
        <p className="mt-2 leading-5">Los reportes repetidos se destacan y tienen su propio filtro. Una lectura o un recordatorio no cuentan como seguimiento.</p>
        <p className="mt-2 leading-5">Las tarjetas cuentan casos; «Reportes repetidos» cuenta alumnos con más de un reporte activo. Las canalizaciones siguen activas y el cierre administrativo se muestra por separado.</p></details>
    </div>
    <p aria-live="polite" className={`text-xs ${secundario}`}>{visibles.length} {visibles.length === 1 ? 'caso' : 'casos'} · {visibles.reduce((n, c) => n + c.reportes.length, 0)} reportes en estos expedientes</p>
    <div className="space-y-3">{visibles.map(caso => {
      const [label, tono, borde] = etiqueta(caso);
      const expandido = abierto === caso.key;
      const tutores = [...new Set(caso.reportes.map(r => r.tutor_destinatario || 'Sin asignar'))];
      const resumen = caso.activos.length ? caso.activos : caso.reportes;
      const reportesVisibles = caso.reportes.filter(reporte => coincideCategoria(reporte, categoriaFiltro));
      const activosPorCategoria = [
        ['ASISTENCIA_CONDUCTA', 'Asistencia / conducta', 'rojo'],
        ['ACADEMICO', 'Académico', 'azul'],
        ['PERSONAL', 'Situación personal', 'naranja'],
      ].map(([key, label, tono]) => ({ key, label, tono, total: caso.activos.filter(reporte => coincideCategoria(reporte, key)).length })).filter(item => item.total);
      return <article key={caso.key} className={`overflow-hidden rounded-xl border border-l-4 ${superficie} ${borde}`}>
        <div className="p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tonos[tono]}`}>{label}</span>{caso.repetidos && <span className="text-xs font-medium text-[#C58637]">{caso.activos.length} reportes activos del alumno</span>}{caso.grupal && <span className={`text-xs ${secundario}`}>Reporte grupal</span>}</div>
              <h3 className="text-base font-semibold">{caso.grupal ? caso.nombre : nombreAlumno(caso.nombre)}</h3><p className={`mt-0.5 text-xs ${secundario}`}>{caso.matricula || caso.reportes[0].grupo || 'Sin matrícula'} · {caso.activos.length} activos · {caso.reportes.length} en el expediente</p>
              {activosPorCategoria.length > 0 && <div className="mt-2 flex flex-wrap gap-2" aria-label="Alertas activas por categoría">{activosPorCategoria.map(item => <span key={item.key} className={`rounded-full px-2.5 py-1 text-xs font-medium ${tonos[item.tono]}`}>{item.total} {item.label}</span>)}</div>}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">{resumen.slice(0, 3).map(r => <span key={r.id} title={r.titulo} className={`inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-md px-2.5 py-1.5 text-xs ${tonos.gris}`}><span>{categorias[r.categoria] || r.categoria}</span><span aria-hidden="true">·</span><span className="whitespace-nowrap">{antiguedad(r.creado_en)}</span></span>)}{resumen.length > 3 && <span className={`self-center text-xs ${secundario}`}>+{resumen.length - 3} más</span>}</div>
              <p className={`mt-2 line-clamp-1 text-sm ${secundario}`}>{resumen[0]?.titulo}</p>
            </div>
            <div className="space-y-2 lg:w-64"><p className={`text-xs ${secundario}`}>Tutor: {tutores.join(' · ')}</p><p className={`text-xs font-medium ${secundario}`}>{caso.sinSeguimiento ? 'Hay reportes sin acción tutorial registrada' : caso.activos.length ? 'Consulta el estado de cada reporte' : 'Sin reportes activos'}</p><button type="button" aria-expanded={expandido} aria-controls={`expediente-${caso.key}`} onClick={() => setAbierto(expandido ? null : caso.key)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">{expandido ? 'Cerrar expediente' : 'Abrir expediente tutorial'} <span aria-hidden="true">{expandido ? '↑' : '→'}</span></button></div>
          </div>
        </div>
        {expandido && <div id={`expediente-${caso.key}`} className={`border-t p-4 sm:p-5 ${isDay ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950/30'}`}>
          <section><h4 className="mb-3 text-sm font-semibold">Reportes del expediente</h4><div className="max-w-5xl space-y-3">{reportesVisibles.map(r => {
            const eventosReporte = eventosCaso(caso).filter(evento => evento.reporte.id === r.id);
            const descripcionExpandida = descripcionAbierta.has(r.id);
            const estadoTono = ['ATENDIDO', 'CERRADO', 'CERRADO_ADMINISTRATIVO'].includes(r.estado) ? tonos.verde : ['EN_SEGUIMIENTO', 'CANALIZADO', 'REUNION_SOLICITADA'].includes(r.estado) ? tonos.azul : tonos.gris;
            return <div key={r.id} className={`rounded-xl border p-4 shadow-sm ${superficie}`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${colorCategoria(r.categoria, tonos)}`}>{categorias[r.categoria] || r.categoria || 'Otro'}</span><h5 className="mt-2 text-base font-semibold leading-snug">{r.titulo}</h5></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${estadoTono}`}>{estados[r.estado]?.label || r.estado}</span></div>
              <p className={`mt-2 text-xs ${secundario}`}>{r.materia || 'Sin materia'} · {r.reportado_por || 'Sin docente'} · {antiguedad(r.creado_en)}</p>
              <p className={`mt-1 text-xs ${secundario}`}>Tutor: {r.tutor_destinatario || 'Sin asignar'} · {r.prioridad_confirmada ? `Prioridad ${r.prioridad.toLowerCase()}` : 'Prioridad sin confirmar'}</p>
              {r.detalle && <><p className={`mt-3 max-w-[80ch] whitespace-pre-wrap text-sm leading-6 ${descripcionExpandida ? '' : 'line-clamp-3'} ${secundario}`}>{r.detalle}</p>{r.detalle.length > 180 && <button type="button" aria-expanded={descripcionExpandida} onClick={() => setDescripcionAbierta(actual => { const siguiente = new Set(actual); descripcionExpandida ? siguiente.delete(r.id) : siguiente.add(r.id); return siguiente; })} className="mt-1 text-xs font-semibold text-emerald-600">{descripcionExpandida ? 'Leer menos' : 'Leer más'}</button>}</>}
              {r.resultado && <p className={`mt-3 max-w-[80ch] rounded-lg p-3 text-sm leading-6 ${tonos.verde}`}><b>Resultado de atención:</b> {r.resultado}</p>}
              {eventosReporte.length > 0 && <details className={`mt-3 border-t pt-3 ${isDay ? 'border-slate-200' : 'border-slate-700'}`}><summary className={`cursor-pointer text-xs font-semibold ${secundario}`}>Ver historial de cambios ({eventosReporte.length})</summary><ol className={`mt-3 space-y-3 border-l pl-4 ${isDay ? 'border-slate-300' : 'border-slate-600'}`}>{eventosReporte.map(evento => <li key={evento.key}><time className={`text-xs ${secundario}`}>{evento.date.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' })}</time><p className="text-sm font-medium">{evento.label}</p></li>)}</ol></details>}
              <button type="button" onClick={() => onVerReporte(r)} className="mt-3 text-sm font-semibold text-emerald-600">Ver detalle y acciones →</button>
            </div>;
          })}</div>{!reportesVisibles.length && <p className={`rounded-lg border p-4 text-sm ${secundario} ${superficie}`}>No hay reportes de esta categoría en el expediente.</p>}</section>
        </div>}
      </article>;
    })}</div>
    {!visibles.length && !cargando && !error && <div className={`rounded-xl border p-10 text-center ${superficie}`}><h3 className="font-semibold">No hay casos para esta consulta</h3><p className={`mt-1 text-sm ${secundario}`}>Prueba con otro filtro o cambia la búsqueda.</p><button type="button" onClick={() => { setBusqueda(''); setFiltro('TODOS'); setCategoriaFiltro('TODAS'); }} className="mt-4 text-sm font-semibold text-emerald-600">Ver todos los casos</button></div>}
  </section>;
}
