import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useOfflineSync from '../hooks/useOfflineSync';
import { discardOfflineOperation, getOfflineSnapshot, retryOfflineOperation } from '../utils/offlineStore';

const DIA = 86_400_000;
const inicioCaptura = item => new Date(item.data?.capturada_en || item.createdAt);
export const getOfflineOperationTiming = (item, now = Date.now()) => {
  const inicio = inicioCaptura(item).getTime();
  return {
    edadDias: Math.max(0, Math.floor((now - inicio) / DIA)),
    venceEn: Math.ceil((inicio + 7 * DIA - now) / DIA),
  };
};
const fechaHora = value => new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
export const conflictoPorClaseCerrada = item => /(?:asistencia|clase).{0,80}cerrad/i.test(item?.error || '');
const detalleClase = (item, contextoResuelto) => item.context || contextoResuelto || {};

export default function OfflineStatus({ enabled }) {
  const { online, pending, conflicts, syncing, sync, operations } = useOfflineSync(enabled);
  const [abierto, setAbierto] = useState(false);
  const [contextosResueltos, setContextosResueltos] = useState({});
  const canSync = online && Boolean(sessionStorage.getItem('token'));
  const urgentes = useMemo(() => operations.filter(item => getOfflineOperationTiming(item).edadDias >= 5).length, [operations]);
  const cantidad = pending + conflicts;
  const label = !online ? `${cantidad} local${cantidad === 1 ? '' : 'es'}` : syncing ? 'Sincronizando…' : conflicts ? `${conflicts} requiere${conflicts === 1 ? '' : 'n'} revisión` : `${pending} pendiente${pending === 1 ? '' : 's'}`;
  useEffect(() => {
    let activo = true;
    const resolverContextosAnteriores = async () => {
      const faltantes = operations.filter(item => !item.context?.fecha && !contextosResueltos[item.id]);
      const resueltos = await Promise.all(faltantes.map(async item => {
        const claseId = item.url?.match(/\/docencia\/clases\/([^/]+)/)?.[1];
        if (!claseId || item.ownerId == null) return null;
        const snapshot = await getOfflineSnapshot(`clase:${item.ownerId}:${claseId}`).catch(() => null);
        const clase = snapshot?.data?.clase;
        if (!clase) return null;
        return [item.id, {
          fecha: clase.fecha,
          materia: clase.carga?.actividad_nombre,
          grupo: clase.carga?.grupo,
          hora_inicio: clase.carga?.hora_inicio,
        }];
      }));
      const encontrados = Object.fromEntries(resueltos.filter(Boolean));
      if (activo && Object.keys(encontrados).length) setContextosResueltos(actual => ({ ...actual, ...encontrados }));
    };
    resolverContextosAnteriores();
    return () => { activo = false; };
  }, [operations, contextosResueltos]);
  if (!enabled || (online && !pending && !conflicts)) return null;

  const descartar = async item => {
    if (!window.confirm('Esta acción elimina la captura pendiente de este dispositivo. Descárgala o verifica que ya exista en SIGA antes de continuar. ¿Descartar?')) return;
    await discardOfflineOperation(item.id);
  };
  const respaldar = item => {
    const blob = new Blob([JSON.stringify({ contexto: detalleClase(item, contextosResueltos[item.id]), captura: item.data }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `respaldo-clase-${detalleClase(item, contextosResueltos[item.id]).fecha || item.data?.fecha || item.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <>
    <button type="button" onClick={() => setAbierto(true)} className="flex max-w-[9.5rem] items-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs font-semibold sm:max-w-none sm:px-2.5" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-panel-soft)', color: 'var(--text-secondary)' }} title="Revisar capturas guardadas en este dispositivo">
      <span className={`h-2 w-2 shrink-0 rounded-full ${conflicts || urgentes ? 'bg-emerald-700' : !online ? 'bg-emerald-600' : 'animate-pulse bg-emerald-500'}`} />
      <span className="truncate sm:hidden">{cantidad}</span><span className="hidden sm:inline">{label}</span>
    </button>
    {abierto && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4" onMouseDown={() => setAbierto(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="titulo-sincronizacion" onMouseDown={event => event.stopPropagation()} className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border shadow-2xl sm:max-w-2xl" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-panel)', color: 'var(--text-primary)' }}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b p-4 sm:p-5" style={{ borderColor: 'var(--surface-border)' }}><div><h2 id="titulo-sincronizacion" className="text-lg font-bold">Capturas de este dispositivo</h2><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Las capturas se pueden sincronizar automáticamente durante 7 días.</p></div><button onClick={() => setAbierto(false)} aria-label="Cerrar" className="shrink-0 rounded-lg px-2 text-2xl" style={{ color: 'var(--text-muted)' }}>×</button></div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {!operations.length ? <p className="rounded-xl p-4" style={{ background: 'var(--surface-panel-soft)', color: 'var(--text-secondary)' }}>No hay capturas pendientes.</p> : <div className="space-y-3 break-words">{operations.map(item => {
          const restantes = getOfflineOperationTiming(item).venceEn;
          const vencida = restantes <= 0;
          const alerta = restantes <= 2;
          const contexto = detalleClase(item, contextosResueltos[item.id]);
          const errorClaseCerrada = item.status === 'CONFLICT' && conflictoPorClaseCerrada(item);
          const fechaClase = contexto.fecha || item.data?.fecha;
          const detalleFecha = [fechaClase, contexto.hora_inicio, contexto.grupo].filter(Boolean).join(' · ') || 'Fecha no disponible';
          const tituloCaptura = item.label || 'Captura local';
          const titulo = contexto.materia && !tituloCaptura.toLocaleLowerCase().includes(contexto.materia.toLocaleLowerCase()) ? `${tituloCaptura} · ${contexto.materia}` : tituloCaptura;
          return <article key={item.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-panel-soft)', color: 'var(--text-primary)' }}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><strong>{titulo}</strong><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{detalleFecha} · guardada {fechaHora(item.data?.capturada_en || item.createdAt)}</p></div><span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ background: 'var(--surface-panel)', color: 'var(--text-secondary)' }}>{errorClaseCerrada ? 'Clase cerrada en SIGA' : item.status === 'CONFLICT' ? 'Requiere revisión' : vencida ? 'Plazo vencido' : `Vence en ${restantes} día${restantes === 1 ? '' : 's'}`}</span></div>
            {errorClaseCerrada ? <div className="mt-3 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--surface-border)', background: 'var(--surface-panel)', color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Este cambio no se aplicó:</b> la asistencia de esta clase ya está cerrada en SIGA. Revisa el registro en Historial de clases. Si el cambio no aparece, descarga el respaldo y solicita una corrección.</div> : item.error && <p className="mt-3 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Respuesta del servidor:</b> {item.error}</p>}
            {vencida && !item.error && <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>La captura se conserva, pero el envío automático ya venció. Inicia sesión para validarla o tramitar su revisión.</p>}
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => respaldar(item)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:opacity-80" style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}>Descargar respaldo</button>{errorClaseCerrada && <a href="/docente/historial-clases" onClick={() => setAbierto(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--accent-success-ui)', color: '#fff' }}>Abrir Historial de clases</a>}{item.status === 'CONFLICT' && !errorClaseCerrada && <button onClick={() => retryOfflineOperation(item.id)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:opacity-80" style={{ borderColor: 'var(--accent-warning-ui)', color: 'var(--accent-warning-ui)' }}>Reintentar</button>}<button onClick={() => descartar(item)} className="rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Eliminar copia local</button></div>
          </article>;
        })}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t p-4" style={{ borderColor: 'var(--surface-border)' }}><button onClick={() => setAbierto(false)} className="rounded-lg px-4 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Cerrar</button>{canSync && pending > 0 && <button disabled={syncing} onClick={sync} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent-success-ui)' }}>{syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</button>}</div>
      </section>
    </div>, document.body)}
  </>;
}
