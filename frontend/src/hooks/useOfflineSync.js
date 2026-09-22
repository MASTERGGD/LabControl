import { useCallback, useEffect, useRef, useState } from 'react';
import api from './useApi';
import { flushOfflineQueue, listOfflineOperations, OFFLINE_EVENT } from '../utils/offlineStore';

export default function useOfflineSync(enabled = true) {
  const ownerId = (() => { try { return JSON.parse(sessionStorage.getItem('usuario') || '{}').id; } catch { return null; } })();
  const [online, setOnline] = useState(navigator.onLine);
  const [operations, setOperations] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refresh = useCallback(() => listOfflineOperations(ownerId).then(setOperations).catch(() => setOperations([])), [ownerId]);
  const sync = useCallback(async () => {
    if (!enabled || !navigator.onLine || !sessionStorage.getItem('token') || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try { await flushOfflineQueue(api, ownerId); } finally { syncingRef.current = false; setSyncing(false); refresh(); }
  }, [enabled, ownerId, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onOnline = () => { setOnline(true); window.setTimeout(sync, 250); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(OFFLINE_EVENT, refresh);
    refresh();
    if (navigator.onLine) sync();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(OFFLINE_EVENT, refresh);
    };
  }, [enabled, refresh, sync]);

  return {
    online, syncing, sync,
    pending: operations.filter(item => item.status === 'PENDING').length,
    conflicts: operations.filter(item => item.status === 'CONFLICT').length,
  };
}
