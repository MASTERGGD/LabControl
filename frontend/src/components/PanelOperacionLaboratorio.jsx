import { normalizarCategoriaLaboratorio } from '../hooks/useCategoriaLaboratorio';
import './PanelOperacionLaboratorio.css';
import React, { useEffect, useState } from 'react';
import api from '../hooks/useApi';
import usePermission from '../hooks/usePermission';
import { useTheme } from '../context/ThemeContext';

function Indicador({ valor, cargando, error, etiqueta }) {
  if (cargando) return <span role="status" aria-label={`Cargando ${etiqueta}`} className="op-skeleton"><span className="sr-only">Cargando…</span></span>;
  if (error || valor === '—' || valor == null) return <span className="op-unavailable">No disponible</span>;
  return <span className="op-number">{valor}</span>;
}

export default function PanelOperacionLaboratorio({ categoria, estadoCategoria = 'listo', stats, navigate, laboratorioId, errorStats, cargandoStats, onRetry, agenda }) {
  const { themeKey } = useTheme();
  const { can } = usePermission();
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(false);
  const [folioError, setFolioError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [revision, setRevision] = useState(0);
  const categoriaNormalizada = normalizarCategoriaLaboratorio(categoria);
  const practicas = ['QUIMICA', 'AGROINDUSTRIA'].includes(categoriaNormalizada);
  const identificando = !categoriaNormalizada && estadoCategoria === 'cargando';
  const sinIdentificar = !categoriaNormalizada && estadoCategoria === 'error';
  const mostrarPrioridades = practicas || identificando || sinIdentificar;
  const dia = themeKey === 'day';
  const contexto = laboratorioId ? `laboratorio_id=${encodeURIComponent(laboratorioId)}` : '';
  const ruta = (base, query = '', hash = '') => `${base}${contexto || query ? '?' : ''}${[contexto, query].filter(Boolean).join('&')}${hash}`;
  useEffect(() => {
    let vigente = true, solicitud = 0;
    setResumen(null); setError(false); setFolioError('');
    if (!practicas || !laboratorioId) { setCargando(false); return undefined; }
    const cargar = async () => {
      const actual = ++solicitud;
      setCargando(true);
      try {
        const { data } = await api.get('/practicas-laboratorio/resumen', { params: { laboratorio_id: laboratorioId, sin_contexto_periodo: true } });
        if (vigente && actual === solicitud) { setResumen(data); setError(false); }
      } catch (err) {
        if (vigente && actual === solicitud) {
          setError(true);
          const folio = err.response?.data?.folio;
          setFolioError(typeof folio === 'string' && /^[A-Za-z0-9._-]{6,64}$/.test(folio) ? folio : '');
        }
      }
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
  ];
  const prioridad = {
    practicas_solicitadas: 'Preparar materiales', stock_bajo: 'Planificar reposición',
    reactivos_por_vencer: 'Revisar vencimiento', insumos_caducados: 'Revisar antes de usar',
  };
  const alertas = [
    ['Prácticas pendientes de preparar', 'practicas_solicitadas', null, 'Revisar solicitudes', irPracticas],
    ['Insumos bajo mínimo', 'stock_bajo', 'stock_bajo', 'Revisar existencias'],
    ['Reactivos por vencer', 'reactivos_por_vencer', 'por_vencer', 'Revisar caducidades'],
    ['Insumos caducados', 'insumos_caducados', 'caducados', 'Revisar caducados'],
  ];
  return <div className="op-lab" style={{
    '--op-bg': dia ? '#ffffff' : '#182233', '--op-soft': dia ? '#f4f7f9' : '#15202e',
    '--op-border': dia ? '#dce4ea' : '#334155', '--op-text': dia ? '#172b3a' : '#f1f5f9',
    '--op-muted': dia ? '#526575' : '#b3c1d0', '--op-accent': dia ? '#17634f' : '#9cddca',
    '--op-warning': dia ? '#925b0a' : '#f4c97d', '--op-danger': dia ? '#a92d35' : '#fca5a5',
  }}>
    <header className="op-heading"><div><p className="op-eyebrow">Panel operativo · {categoriaNormalizada || (sinIdentificar ? 'Categoría no disponible' : 'Identificando laboratorio')}</p><h2>Gestión del laboratorio asignado</h2></div><p className="op-caption">Preparación, agenda y recursos del laboratorio.</p></header>
    {mostrarPrioridades && <section className="op-priorities" aria-label="Prioridades del laboratorio" aria-busy={identificando || (practicas && cargando && !resumen)}>
      <div className="op-section-heading"><h3>Por atender en el laboratorio</h3><span className="op-caption">Caducidades: hoy y los próximos 30 días</span></div>
      {sinIdentificar && <p className="op-category-status">Confirma la categoría con «Reintentar identificación» para consultar las alertas de este laboratorio.</p>}
      {error && <div role="alert" className="op-notice"><span aria-hidden="true">⚠</span><div><strong>No se pudieron cargar las alertas.</strong><small className="op-error-folio">{folioError && `Folio: ${folioError}`}</small></div><button className="op-button" onClick={() => setRevision(r => r + 1)}>Reintentar alertas</button></div>}
      <div className="op-priority-grid">{alertas.map(([label, campo, filtro, accion, onClick]) => {
        const pendiente = !error && resumen?.[campo] > 0;
        return <article key={campo} className={`op-priority${pendiente ? campo === 'insumos_caducados' ? ' op-priority-danger' : ' op-priority-warning' : ''}`}>
          <h4>{label}</h4>
          <div className="op-value"><Indicador valor={valorAlerta(resumen?.[campo])} cargando={identificando || (practicas && cargando && !resumen && !error)} error={error || sinIdentificar} etiqueta={label} /></div>{pendiente && <span className="op-badge">{prioridad[campo]}</span>}
          {!error && resumen && <p className="op-caption">{campo === 'practicas_solicitadas' ? (resumen[campo] ? 'Solicitudes por preparar' : 'Sin prácticas pendientes de preparar') : !resumen.insumos_total ? 'Sin insumos registrados' : resumen[campo] ? 'Requieren revisión' : 'Sin alertas en este grupo'}</p>}
          {!!resumen && !error && filtro && resumen.alertas_insumos?.[filtro]?.length > 0 && <details className="op-affected"><summary>Ver insumos afectados</summary><ul>{resumen.alertas_insumos[filtro].map(item => <li key={item.id}><button className="op-item-button" onClick={() => navigate(ruta('/admin/practicas-laboratorio', `alerta=${filtro}`, `#insumo-${item.id}`))}>{item.nombre}{filtro === 'stock_bajo' ? ` · ${item.existencia} ${item.unidad}` : ` · ${item.caduca_en}`}</button></li>)}</ul></details>}
          <button disabled={!practicas || cargando || error || !Number.isFinite(resumen?.[campo])} className={`op-button op-priority-action${campo === 'practicas_solicitadas' && pendiente ? ' op-button-primary' : ''}`} onClick={onClick || (() => navigate(ruta('/admin/practicas-laboratorio', `alerta=${filtro}`, '#insumos')))}>{accion}</button>
        </article>;
      })}</div>
      {resumen && !error && !resumen.insumos_total && <div className="op-priority-footer"><span className="op-caption">Registra los insumos para consultar existencias y caducidades.</span><button className="op-button" onClick={() => navigate(ruta('/admin/practicas-laboratorio', 'accion=registrar-insumo', '#insumos'))}>Registrar primer insumo</button></div>}
    </section>}
    <section className="op-agenda" aria-label="Agenda del laboratorio">
      {!errorStats && !cargandoStats && agenda ? agenda : <div className="op-agenda-body"><h3 className="op-agenda-title">Próximas reservaciones{' '}{!errorStats && !cargandoStats && Array.isArray(stats?.proximas_reservaciones) && <span className="op-agenda-count" aria-label={`${stats.proximas_reservaciones.length} próximas reservaciones`}>{stats.proximas_reservaciones.length}</span>}</h3>{cargandoStats || (!stats && !errorStats) ? <div className="op-agenda-loading" role="status" aria-label="Cargando agenda"><span className="op-skeleton"/><span className="op-caption">Consultando agenda…</span></div> : errorStats ? <div role="alert" className="op-notice"><span aria-hidden="true">⚠</span><p>No se pudo consultar la agenda.</p><button className="op-button" onClick={onRetry}>Reintentar resumen</button></div> : <p className="op-caption">No hay reservaciones próximas para mostrar.</p>}</div>}
      <div className="op-agenda-footer"><button className="op-button" onClick={() => navigate(ruta('/admin/horarios'))}>Ver calendario completo</button></div>
    </section>
    <section className="op-summary" aria-label="Resumen operativo" aria-busy={Boolean(cargandoStats)}>
      <div className="op-section-heading"><h3>Resumen operativo</h3><span className="op-caption">Recursos y actividad</span></div>
      {errorStats && <p className="op-caption">El resumen operativo no está disponible hasta completar la consulta.</p>}
      <div className="op-summary-grid">{tarjetas.map(([label, valor, detalle, accion, onClick]) => <article key={label} className="op-summary-item"><div className="op-value"><Indicador valor={valor} cargando={cargandoStats || (!stats && !errorStats)} error={errorStats} etiqueta={label} /></div><h4>{label}</h4>{!errorStats && !cargandoStats && stats && <p className="op-caption">{detalle}</p>}<button className="op-button" onClick={onClick}>{accion}</button></article>)}</div>
    </section>
    <section className="op-actions" aria-label="Acciones frecuentes"><h3>Acciones frecuentes</h3><div className={`op-actions-row${mostrarPrioridades ? '' : ' op-actions-short'}`}>
      {mostrarPrioridades && <><button disabled={!practicas} className="op-button" onClick={irPracticas}>Revisar prácticas solicitadas</button><button disabled={!practicas} className="op-button" onClick={() => navigate(ruta('/admin/practicas-laboratorio', '', '#insumos'))}>Registrar entrada de reactivos</button></>}
      <button className="op-button" onClick={() => navigate(ruta('/admin/prestamos', 'estado=ACTIVO'))}>Consultar préstamos activos</button><button className="op-button" onClick={() => navigate(ruta('/admin/mantenimiento'))}>Atender incidentes y mantenimiento</button>
    </div></section>
  </div>;
}
