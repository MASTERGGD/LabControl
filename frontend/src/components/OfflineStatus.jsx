import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useOfflineSync from '../hooks/useOfflineSync';
import { discardOfflineOperation, retryOfflineOperation } from '../utils/offlineStore';

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

export default function OfflineStatus({ enabled }) {
  const { online, pending, conflicts, syncing, sync, operations } = useOfflineSync(enabled);
  const [abierto, setAbierto] = useState(false);
  const canSync = online && Boolean(sessionStorage.getItem('token'));
  const urgentes = useMemo(() => operations.filter(item => getOfflineOperationTiming(item).edadDias >= 5).length, [operations]);
  if (!enabled || (online && !pending && !conflicts)) return null;
  const cantidad = pending + conflicts;
  const label = !online ? `${cantidad} local${cantidad === 1 ? '' : 'es'}` : syncing ? 'Sincronizando…' : conflicts ? `${conflicts} requiere${conflicts === 1 ? '' : 'n'} revisión` : `${pending} pendiente${pending === 1 ? '' : 's'}`;
  const color = conflicts || urgentes ? 'border-red-400/50 bg-red-500/10 text-red-500' : !online ? 'border-amber-400/50 bg-amber-950/35 text-amber-100' : 'border-blue-400/40 bg-blue-500/10 text-blue-500';

  const descartar = async item => {
    if (!window.confirm('Esta acción elimina la captura pendiente de este dispositivo. Descárgala o verifica que ya exista en SIGA antes de continuar. ¿Descartar?')) return;
    await discardOfflineOperation(item.id);
  };
  const respaldar = item => {
    const blob = new Blob([JSON.stringify(item.data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `respaldo-clase-${item.data?.fecha || item.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <>
    <button type="button" onClick={() => setAbierto(true)} className={`flex max-w-[9.5rem] items-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs font-semibold sm:max-w-none sm:px-2.5 ${color}`} title="Revisar capturas guardadas en este dispositivo">
      <span className={`h-2 w-2 shrink-0 rounded-full ${conflicts || urgentes ? 'bg-red-500' : !online ? 'bg-amber-500' : 'animate-pulse bg-blue-500'}`} />
      <span className="truncate sm:hidden">{cantidad}</span><span className="hidden sm:inline">{label}</span>
    </button>
    {abierto && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4" onMouseDown={() => setAbierto(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="titulo-sincronizacion" onMouseDown={event => event.stopPropagation()} className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-900 text-slate-100 shadow-2xl sm:max-w-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700 p-4 sm:p-5"><div><h2 id="titulo-sincronizacion" className="text-lg font-bold">Capturas de este dispositivo</h2><p className="text-sm text-slate-400">Las capturas se pueden sincronizar automáticamente durante 7 días.</p></div><button onClick={() => setAbierto(false)} aria-label="Cerrar" className="shrink-0 rounded-lg px-2 text-2xl text-slate-400">×</button></div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {!operations.length ? <p className="rounded-xl bg-slate-800 p-4">No hay capturas pendientes.</p> : <div className="space-y-3 break-words">{operations.map(item => {
          const restantes = getOfflineOperationTiming(item).venceEn;
          const vencida = restantes <= 0;
          const alerta = restantes <= 2;
          return <article key={item.id} className={`rounded-xl border p-4 ${item.status === 'CONFLICT' || vencida ? 'border-red-500/50 bg-red-950/20' : alerta ? 'border-amber-400/50 bg-amber-950/20' : 'border-slate-700 bg-slate-800/60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><strong>{item.label || 'Captura local'}</strong><p className="text-sm text-slate-400">{item.data?.fecha || 'Sin fecha'} · guardada {fechaHora(item.data?.capturada_en || item.createdAt)}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'CONFLICT' || vencida ? 'bg-red-500/15 text-red-300' : alerta ? 'bg-amber-500/15 text-amber-200' : 'bg-blue-500/15 text-blue-200'}`}>{item.status === 'CONFLICT' ? 'Requiere revisión' : vencida ? 'Plazo vencido' : `Vence en ${restantes} día${restantes === 1 ? '' : 's'}`}</span></div>
            {item.error && <p className="mt-3 rounded-lg bg-red-950/50 p-3 text-sm text-red-200"><b>Respuesta del servidor:</b> {item.error}</p>}
            {vencida && !item.error && <p className="mt-3 text-sm text-red-200">La captura se conserva, pero ya no debe prometerse envío automático. Inicia sesión para validarla o tramitar su revisión.</p>}
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => respaldar(item)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">Descargar respaldo</button>{item.status === 'CONFLICT' && <button onClick={() => retryOfflineOperation(item.id)} className="rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-950/40">Reintentar</button>}<button onClick={() => descartar(item)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/40">Descartar copia local</button></div>
          </article>;
        })}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-700 p-4"><button onClick={() => setAbierto(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300">Cerrar</button>{canSync && pending > 0 && <button disabled={syncing} onClick={sync} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</button>}</div>
      </section>
    </div>, document.body)}
  </>;
}
