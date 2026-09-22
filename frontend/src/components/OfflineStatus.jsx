import useOfflineSync from '../hooks/useOfflineSync';

export default function OfflineStatus({ enabled }) {
  const { online, pending, conflicts, syncing, sync } = useOfflineSync(enabled);
  if (!enabled || (online && !pending && !conflicts)) return null;
  const label = !online
    ? `Sin conexión${pending ? ` · ${pending} pendiente${pending === 1 ? '' : 's'}` : ''}`
    : syncing ? 'Sincronizando…'
      : conflicts ? `${conflicts} requiere${conflicts === 1 ? '' : 'n'} revisión`
        : `${pending} pendiente${pending === 1 ? '' : 's'} de sincronizar`;
  return <button type="button" onClick={online ? sync : undefined} className={`hidden items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold sm:flex ${!online ? 'border-amber-400/40 bg-amber-500/10 text-amber-600' : conflicts ? 'border-red-400/40 bg-red-500/10 text-red-500' : 'border-blue-400/40 bg-blue-500/10 text-blue-500'}`} title={online ? 'Sincronizar capturas locales ahora' : 'Las capturas se guardarán en este dispositivo'}>
    <span className={`h-2 w-2 rounded-full ${!online ? 'bg-amber-500' : conflicts ? 'bg-red-500' : 'animate-pulse bg-blue-500'}`} />{label}
  </button>;
}
