import React, { useEffect, useState } from 'react';

// CRA fingerprints the main bundle on every application change. Compare the
// running script with the deployment manifest, without relying on SW changes.
export default function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState(null);
  const [showAll, setShowAll] = useState(false);
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
  const highlights = Array.isArray(releaseNotes?.destacados)
    ? releaseNotes.destacados.filter(Boolean).slice(0, 3)
    : [];
  const sections = Array.isArray(releaseNotes?.secciones) ? releaseNotes.secciones : [];
  const fecha = releaseNotes?.fecha
    ? new Date(`${releaseNotes.fecha}T00:00:00`).toLocaleDateString('es-MX', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    : null;

  return (
    <aside aria-labelledby="titulo-actualizacion" className="fixed bottom-4 right-4 z-[100] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-emerald-200 bg-white text-slate-900 shadow-2xl shadow-slate-950/20">
      <div className="border-l-4 border-emerald-600 p-4 sm:p-5">
        <div className="flex items-start gap-3 pr-7">
          <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-700">✦</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="titulo-actualizacion" role="status" className="font-bold leading-tight">Nueva versión disponible</h2>
              {releaseNotes?.version && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">v{releaseNotes.version}</span>}
            </div>
            {fecha && <p className="mt-1 text-xs text-slate-500">Publicada el {fecha}</p>}
          </div>
        </div>

        <p className="mt-3 text-sm leading-5 text-slate-600">
          {releaseNotes?.resumen || 'Hay mejoras listas para instalar. Guarda tus cambios antes de actualizar.'}
        </p>

        {highlights.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
            {highlights.map((item, index) => (
              <li key={`${index}-${item}`} className="flex gap-2">
                <span aria-hidden="true" className="mt-0.5 text-emerald-600">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {showAll && sections.length > 0 && (
          <div className="mt-3 max-h-48 space-y-3 overflow-y-auto border-t border-slate-100 pt-3">
            {sections.map(section => (
              <section key={section.area}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{section.area}</h3>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {(section.cambios || []).map((change, index) => <li key={`${index}-${change}`}>• {change}</li>)}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">Actualiza cuando termines de guardar lo que estás capturando.</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => { if (navigator.onLine) window.location.reload(); }} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800">
            Actualizar aplicación
          </button>
          {sections.length > 0 && (
            <button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)} className="rounded-lg px-2 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
              {showAll ? 'Ocultar detalles' : 'Ver todas las novedades'}
            </button>
          )}
        </div>
      </div>
      <button type="button" aria-label="Descartar aviso de actualización" onClick={() => setDismissed(true)} className="absolute right-3 top-3 rounded-md p-1 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
    </aside>
  );
}
