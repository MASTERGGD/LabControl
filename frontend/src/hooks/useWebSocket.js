import { useEffect, useRef, useState } from 'react';

// Mismo host que el navegador, protocolo ws/wss automático
const WS_PROTO = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_URL = process.env.REACT_APP_WS_URL ||
  `${WS_PROTO}://${window.location.hostname}:8000`;

export function useWebSocket(path) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket(`${WS_URL}${path}`);
    ws.current.onopen = () => setConnected(true);
    ws.current.onclose = () => setConnected(false);
    ws.current.onmessage = (e) => setData(JSON.parse(e.data));
    return () => ws.current?.close();
  }, [path]);

  return { data, connected };
}
