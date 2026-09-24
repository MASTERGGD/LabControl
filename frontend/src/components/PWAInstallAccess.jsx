import React, { useState } from 'react';
import usePWAInstall from '../hooks/usePWAInstall';

export default function PWAInstallAccess() {
  const { canInstall, installed, install } = usePWAInstall();
  const [showHelp, setShowHelp] = useState(false);
  if (installed) return null;

  const handleInstall = async () => {
    if (!canInstall || await install() === 'unavailable') setShowHelp(true);
  };

  return (
    <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-slate-700">
      <button type="button" onClick={handleInstall} className="w-full rounded-lg px-3 py-2 font-semibold text-emerald-700 hover:bg-emerald-100 focus-visible:outline-emerald-600">Instalar SIGA</button>
      <p className="mt-1 text-center text-xs">Agrega SIGA a tu pantalla de inicio para abrirlo fácilmente.</p>
      {showHelp && (
        <div role="status" className="mt-3 space-y-2 text-xs leading-relaxed">
          <p>Si SIGA ya está instalado, ábrelo desde su icono.</p>
          <p>En Chrome o Edge, abre el menú del navegador y busca «Instalar aplicación» o «Agregar a la pantalla de inicio», si está disponible.</p>
          <p>En iPhone o iPad, abre SIGA en Safari y elige Compartir → Agregar a inicio.</p>
          <p>Para trabajar sin conexión, inicia sesión con internet y configura tu PIN y las clases guardadas desde tu perfil en este dispositivo.</p>
          <button type="button" onClick={() => setShowHelp(false)} className="font-semibold text-emerald-700 underline">Ocultar instrucciones</button>
        </div>
      )}
    </div>
  );
}
