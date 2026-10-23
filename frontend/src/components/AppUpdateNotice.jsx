import React, { useEffect, useState } from 'react';

// CRA fingerprints the main bundle on every application change. Compare the
// running script with the deployment manifest, without relying on SW changes.
export default function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState(null);
  const [dismissed, setDismissed] = useState(false);
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
          const updateAvailable = latest.pathname !== running.pathname || Boolean(cssChanged);
          setAvailable(updateAvailable);
          if (updateAvailable) {
            fetch('/release-notes.json', { cache: 'no-store', signal: controller.signal })
              .then(response => response.ok ? response.json() : null)
              .then(notes => {
                if (!disposed && notes && typeof notes === 'object') setReleaseNotes(notes);
              })
              .catch(() => { /* La actualización sigue disponible aunque falten las novedades. */ });
          }
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

  if (!available || dismissed) return null;
  const summary = releaseNotes?.resumen || 'Hay una mejora lista. Recarga SIGA cuando termines lo que estás haciendo.';

  return (
    <aside aria-labelledby="titulo-actualizacion" className="fixed bottom-4 right-4 z-[100] w-[calc(100vw-2rem)] max-w-md rounded-xl border border-emerald-200 bg-white text-slate-900 shadow-xl shadow-slate-950/15">
      <div className="p-4 pr-11">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-base text-emerald-700">↻</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="titulo-actualizacion" role="status" className="font-bold leading-tight">Actualización disponible</h2>
              {releaseNotes?.version && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">v{releaseNotes.version}</span>}
            </div>
          </div>
        </div>

        <p className="ml-11 mt-1 text-sm leading-5 text-slate-600">{summary}</p>
        <div className="ml-11 mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { if (navigator.onLine) window.location.reload(); }} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800">
            Recargar SIGA
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Después
          </button>
        </div>
      </div>
    </aside>
  );
}
