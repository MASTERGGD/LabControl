/**
 * usePWAInstall — captura el evento beforeinstallprompt del navegador
 * y expone una función install() para mostrar el diálogo nativo de instalación.
 *
 * Uso:
 *   const { canInstall, install, dismiss } = usePWAInstall();
 */
import { useState, useEffect } from 'react';

export default function usePWAInstall() {
  const [prompt, setPrompt]       = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [dismissed, setDismissed]  = useState(
    () => sessionStorage.getItem('pwa-dismissed') === '1'
  );

  useEffect(() => {
    const handler = e => {
      e.preventDefault();   // evitar el mini-infobar del navegador
      setPrompt(e);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Si ya está instalada como PWA, no mostrar nada
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.matches) setCanInstall(false);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setCanInstall(false);
    setPrompt(null);
  };

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa-dismissed', '1');
  };

  return { canInstall: canInstall && !dismissed, install, dismiss };
}
