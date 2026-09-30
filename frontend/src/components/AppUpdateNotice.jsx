import React, { useEffect, useState } from 'react';

// CRA fingerprints the main bundle on every application change. Compare the
// running script with the deployment manifest, without relying on SW changes.
export default function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const running = [...document.scripts].map(script => new URL(script.src, window.location.href))
      .find(url => url.origin === window.location.origin && /\/static\/js\/main\.[\w]+\.js$/.test(url.pathname));
    if (!running) return undefined;
    const runningCss = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map(link => new URL(link.href, window.location.href))
      .find(url => url.origin === running.origin && /\/static\/css\/main\.[\w]+\.css$/.test(url.pathname));
    let disposed = false;
    let pending = false;
    const controller = new AbortController();
    const check = async () => {
      if (pending || !navigator.onLine || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const response = await fetch('/asset-manifest.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const manifest = await response.json();
        const main = manifest?.files?.['main.js'];
        if (typeof main !== 'string') return;
        const latest = new URL(main, window.location.origin);
        if (!disposed && latest.origin === running.origin && /\/static\/js\/main\.[\w]+\.js$/.test(latest.pathname)) {
          const css = manifest?.files?.['main.css'];
          const latestCss = typeof css === 'string' ? new URL(css, window.location.origin) : null;
          const cssChanged = runningCss && latestCss?.origin === running.origin
            && /\/static\/css\/main\.[\w]+\.css$/.test(latestCss.pathname)
            && latestCss.pathname !== runningCss.pathname;
          setAvailable(latest.pathname !== running.pathname || Boolean(cssChanged));
        }
      } catch { /* Offline or a deployment in progress: try again on resume. */ }
      finally { pending = false; }
    };
    check();
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    const interval = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!available) return null;
  return (
    <aside role="status" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-lg rounded-xl border border-emerald-300 bg-white p-4 text-slate-900 shadow-xl">
      <p className="font-semibold">Nueva versión disponible</p>
      <p className="mt-1 text-sm">Guarda lo que estés capturando y actualiza para ver las nuevas funciones.</p>
      <button type="button" onClick={() => { if (navigator.onLine) window.location.reload(); }} className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Actualizar aplicación</button>
    </aside>
  );
}
