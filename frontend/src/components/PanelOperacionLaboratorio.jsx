import React, { useEffect, useState } from 'react';
import api from '../hooks/useApi';
import usePermission from '../hooks/usePermission';
import { useTheme } from '../context/ThemeContext';

export default function PanelOperacionLaboratorio({ categoria, stats, navigate, laboratorioId, errorStats, cargandoStats, onRetry, agenda }) {
  const { themeKey } = useTheme();
  const { can } = usePermission();
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [revision, setRevision] = useState(0);
  const practicas = ['QUIMICA', 'AGROINDUSTRIA'].includes(categoria);
  const dia = themeKey === 'day';
  const panel = { background: dia ? '#fff' : '#182233', borderColor: dia ? '#dce5eb' : '#334155', color: dia ? '#0f172a' : '#f8fafc' };
  const contexto = laboratorioId ? `laboratorio_id=${encodeURIComponent(laboratorioId)}` : '';
  const ruta = (base, query = '', hash = '') => `${base}${contexto || query ? '?' : ''}${[contexto, query].filter(Boolean).join('&')}${hash}`;
  useEffect(() => {
    let vigente = true, solicitud = 0;
    setResumen(null); setError(false);
    if (!practicas || !laboratorioId) { setCargando(false); return undefined; }
    const cargar = async () => {
      const actual = ++solicitud;
      setCargando(true);
      try {
        const { data } = await api.get('/practicas-laboratorio/resumen', { params: { laboratorio_id: laboratorioId, sin_contexto_periodo: true } });
        if (vigente && actual === solicitud) { setResumen(data); setError(false); }
      } catch { if (vigente && actual === solicitud) setError(true); }
      finally { if (vigente && actual === solicitud) setCargando(false); }
    };
    cargar();
    const timer = setInterval(cargar, 30000);
    window.addEventListener('focus', cargar);
    return () => { vigente = false; clearInterval(timer); window.removeEventListener('focus', cargar); };
  }, [practicas, laboratorioId, revision]);
  const valorStats = value => errorStats || cargandoStats || !stats ? '—' : value ?? '—';
  const valorAlerta = value => error || !resumen ? '—' : value ?? '—';
  const irPracticas = () => navigate(ruta('/admin/practicas-laboratorio', 'estado=SOLICITADA'));
  const sinActivos = !errorStats && !cargandoStats && stats?.activos_inventario === 0;
  const tarjetas = [
    ['Activos registrados', valorStats(stats?.activos_inventario), !stats?.activos_inventario ? 'Sin activos registrados' : 'Equipo y materiales en inventario', sinActivos && can('inventario:write') ? 'Agregar primer activo' : 'Consultar activos', () => navigate(ruta('/admin/inventario', sinActivos && can('inventario:write') ? 'nuevo=1' : ''))],
    ['Préstamos activos', valorStats(stats?.prestamos?.activos), stats?.prestamos?.activos ? `${stats.prestamos.vencidos || 0} vencidos` : 'Sin préstamos activos', 'Consultar entregas y devoluciones', () => navigate(ruta('/admin/prestamos', stats?.prestamos?.vencidos ? 'estado=VENCIDO' : 'estado=ACTIVO'))],
    ['Incidentes abiertos', valorStats(stats?.incidentes_abiertos), stats?.incidentes_abiertos ? 'Requieren atención' : 'Sin incidentes pendientes', 'Revisar mantenimiento', () => navigate(ruta('/admin/mantenimiento'))],
    ['Próximas reservaciones', valorStats(stats?.proximas_reservaciones?.length), stats?.proximas_reservaciones?.length ? 'Siguientes sesiones programadas' : 'Sin próximas reservaciones', 'Ver calendario completo', () => navigate(ruta('/admin/horarios'))],
  ];
  const alertas = [
    ['Prácticas pendientes de preparar', 'practicas_solicitadas', null, 'Revisar solicitudes', irPracticas],
    ['Insumos bajo mínimo', 'stock_bajo', 'stock_bajo', 'Revisar existencias'],
    ['Reactivos por vencer', 'reactivos_por_vencer', 'por_vencer', 'Revisar caducidades'],
    ['Insumos caducados', 'insumos_caducados', 'caducados', 'Revisar caducados'],
  ];
  return <div className="space-y-5">
    <section className="rounded-2xl border border-emerald-300 p-5" style={panel}><p className="text-xs font-bold uppercase text-emerald-600">Panel operativo · {categoria}</p><h2 className="mt-2 text-lg font-semibold">Gestión del laboratorio asignado</h2><p className="mt-1 text-sm opacity-80">Prepara las próximas prácticas y atiende materiales, equipos e incidencias.</p></section>
    {practicas && <section className="space-y-3" aria-label="Prioridades del laboratorio"><h2 className="text-lg font-bold">Por atender en el laboratorio</h2>
      <p className="text-sm opacity-80">Caducidades: hoy y los próximos 30 días. Existencias del laboratorio, independientes del periodo escolar.</p>
      {error && <p role="alert">No se pudieron cargar las alertas. <button className="underline" onClick={() => setRevision(r => r + 1)}>Reintentar alertas</button></p>}
      {cargando && !resumen && <p role="status">Consultando prácticas e insumos…</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{alertas.map(([label, campo, filtro, accion, onClick]) => <article key={campo} className="rounded-xl border p-4" style={{ ...panel, borderColor: !error && resumen?.[campo] > 0 ? '#f59e0b' : panel.borderColor }}>
        <p className="text-sm font-semibold">{label}</p><p className="mt-2 text-2xl font-bold">{valorAlerta(resumen?.[campo])}</p>
        {!error && resumen && <p className="mt-1 text-xs opacity-80">{campo === 'practicas_solicitadas' ? (resumen[campo] ? 'Solicitudes que requieren preparación' : 'Sin prácticas pendientes de preparar') : !resumen.insumos_total ? 'Sin insumos registrados' : resumen[campo] ? 'Requieren revisión' : 'Sin alertas en este grupo'}</p>}
        {!!resumen && !error && filtro && <ul className="mt-2 space-y-1 text-xs">{(resumen.alertas_insumos?.[filtro] || []).map(item => <li key={item.id}><button className="text-left underline" onClick={() => navigate(ruta('/admin/practicas-laboratorio', `alerta=${filtro}`, `#insumo-${item.id}`))}>{item.nombre}{filtro === 'stock_bajo' ? ` · ${item.existencia} ${item.unidad}` : ` · ${item.caduca_en}`}</button></li>)}</ul>}
        <button className="mt-3 text-sm font-semibold text-emerald-600 underline" onClick={onClick || (() => navigate(ruta('/admin/practicas-laboratorio', `alerta=${filtro}`, '#insumos')))}>{accion}</button>
      </article>)}</div>
      {resumen && !error && !resumen.insumos_total && <button className="rounded-lg border px-4 py-2 text-sm font-semibold" onClick={() => navigate(ruta('/admin/practicas-laboratorio', 'accion=registrar-insumo', '#insumos'))}>Registrar primer insumo</button>}
    </section>}
    {errorStats && <p role="alert">No se pudo cargar el resumen operativo. <button className="underline" onClick={onRetry}>Reintentar resumen</button></p>}
    {cargandoStats && <p role="status">Cargando resumen operativo…</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tarjetas.map(([label, valor, detalle, accion, onClick]) => <article key={label} className="rounded-2xl border p-4" style={panel}><p className="text-2xl font-bold">{valor}</p><h3 className="mt-2 text-sm font-semibold">{label}</h3><p className="mt-1 text-xs opacity-80">{errorStats ? 'No se pudo cargar' : cargandoStats || !stats ? 'Consultando datos' : detalle}</p><button className="mt-3 text-sm font-semibold text-emerald-600 underline" onClick={onClick}>{accion}</button></article>)}</div>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border p-5" style={panel}>{!errorStats && !cargandoStats && agenda ? agenda : <><h3 className="font-semibold">Próximas reservaciones</h3><p className="mt-2 text-sm opacity-80">{errorStats ? 'No se pudo consultar la agenda.' : cargandoStats || !stats ? 'Consultando agenda…' : 'No hay reservaciones próximas para mostrar.'}</p></>}<button className="mt-3 rounded-lg border px-4 py-2 text-sm font-semibold" onClick={() => navigate(ruta('/admin/horarios'))}>Ver calendario completo</button></section>
      <section className="rounded-2xl border p-5" style={panel}><h3 className="font-semibold">Acciones frecuentes</h3><p className="mt-1 text-sm opacity-80">Atajos para las tareas del responsable.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">
        {practicas && <><button className="rounded-xl border p-3 text-left text-sm" onClick={irPracticas}>Revisar prácticas solicitadas</button><button className="rounded-xl border p-3 text-left text-sm" onClick={() => navigate(ruta('/admin/practicas-laboratorio', '', '#insumos'))}>Registrar entrada de reactivos</button></>}
        <button className="rounded-xl border p-3 text-left text-sm" onClick={() => navigate(ruta('/admin/prestamos', 'estado=ACTIVO'))}>Consultar préstamos activos</button><button className="rounded-xl border p-3 text-left text-sm" onClick={() => navigate(ruta('/admin/mantenimiento'))}>Atender incidentes y mantenimiento</button>
      </div></section>
    </div>
  </div>;
}
