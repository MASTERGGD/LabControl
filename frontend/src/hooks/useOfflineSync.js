import { useCallback, useEffect, useRef, useState } from 'react';
import api from './useApi';
import { flushOfflineQueue, listOfflineOperations, OFFLINE_EVENT } from '../utils/offlineStore';

export default function useOfflineSync(enabled = true) {
  const ownerId = (() => { try { return JSON.parse(sessionStorage.getItem('usuario') || '{}').id; } catch { return null; } })();
  const authenticated = Boolean(sessionStorage.getItem('token'));
  const [online, setOnline] = useState(navigator.onLine);
  const [operations, setOperations] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const retryTimerRef = useRef(null);
  const retryDelayRef = useRef(10000);

  const refresh = useCallback(() => listOfflineOperations(ownerId).then(setOperations).catch(() => setOperations([])), [ownerId]);
  const sync = useCallback(async () => {
    if (!enabled || !navigator.onLine || !authenticated || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await flushOfflineQueue(api, ownerId);
      window.clearTimeout(retryTimerRef.current);
      if (result.pending > 0 && navigator.onLine && authenticated) {
        retryTimerRef.current = window.setTimeout(sync, retryDelayRef.current);
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 5 * 60 * 1000);
      } else retryDelayRef.current = 10000;
    } finally { syncingRef.current = false; setSyncing(false); refresh(); }
  }, [authenticated, enabled, ownerId, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    let reconnectTimer = null;
    const onOnline = () => {
      setOnline(true);
      retryDelayRef.current = 10000;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(retryTimerRef.current);
      reconnectTimer = window.setTimeout(() => {
        if (navigator.onLine) sync();
      }, 2500);
    };
    const onOffline = () => {
      setOnline(false);
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(retryTimerRef.current);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(OFFLINE_EVENT, refresh);
    refresh();
    if (navigator.onLine) sync();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(OFFLINE_EVENT, refresh);
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(retryTimerRef.current);
    };
  }, [authenticated, enabled, refresh, sync]);

  return {
    online, syncing, sync, operations,
    pending: operations.filter(item => item.status === 'PENDING').length,
    conflicts: operations.filter(item => item.status === 'CONFLICT').length,
  };
}
