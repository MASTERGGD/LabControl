import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const PWAInstallContext = createContext({ canInstall: false, installed: false });

export function PWAInstallProvider({ children }) {
  const promptRef = useRef(null);
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('pwa-dismissed') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const media = window.matchMedia?.('(display-mode: standalone)');
    const isStandalone = () => Boolean(media?.matches || navigator.standalone);
    setInstalled(isStandalone());
    const onPrompt = event => {
      event.preventDefault();
      if (isStandalone()) return;
      promptRef.current = event;
      setAvailable(true);
    };
    const onInstalled = () => {
      promptRef.current = null;
      setAvailable(false);
      setInstalled(true);
    };
    const onDisplayChange = () => { if (isStandalone()) onInstalled(); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    media?.addEventListener?.('change', onDisplayChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media?.removeEventListener?.('change', onDisplayChange);
    };
  }, []);

  const install = async () => {
    const event = promptRef.current;
    if (!event) return 'unavailable';
    // Each browser prompt can only be used once, even if it is dismissed.
    promptRef.current = null;
    setAvailable(false);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      return outcome;
    } catch { return 'unavailable'; }
  };

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('pwa-dismissed', '1'); } catch { /* Storage is optional. */ }
  };

  return <PWAInstallContext.Provider value={{ canInstall: available && !installed, showBanner: available && !installed && !dismissed, installed, install, dismiss }}>{children}</PWAInstallContext.Provider>;
}

export default function usePWAInstall() {
  return useContext(PWAInstallContext);
}
