import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTheme } from './ThemeContext';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

// ─── Iconos ───────────────────────────────────────────────────────────────────
const ICONS = {
  success: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
        d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    </svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
  ),
};

const STYLES = {
  success: { ring: 'border-emerald-500/40', bg: 'bg-emerald-500/15', icon: 'text-emerald-400', bar: 'bg-emerald-500' },
  error:   { ring: 'border-red-500/40',     bg: 'bg-red-500/15',     icon: 'text-red-400',     bar: 'bg-red-500'   },
  warning: { ring: 'border-amber-500/40',   bg: 'bg-amber-500/15',   icon: 'text-amber-400',   bar: 'bg-amber-500' },
  info:    { ring: 'border-blue-500/40',    bg: 'bg-blue-500/15',    icon: 'text-blue-400',    bar: 'bg-blue-500'  },
};

// ─── Componente toast individual ──────────────────────────────────────────────
function ToastItem({ toast, onRemove }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const s = STYLES[toast.type] || STYLES.info;
  return (
    <div
      className={`relative flex items-start gap-3 px-4 py-3 rounded-xl border shadow-glass
                  ${isDay ? 'bg-white shadow-xl' : 'glass'} ${s.ring} min-w-[280px] max-w-[380px] overflow-hidden
                  animate-fadeUp cursor-pointer select-none`}
      onClick={() => onRemove(toast.id)}
    >
      {/* Icono */}
      <div className={`mt-0.5 shrink-0 ${s.icon}`}>{ICONS[toast.type]}</div>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className={`${isDay ? 'text-slate-950' : 'text-white'} font-semibold text-sm leading-tight mb-0.5`}>{toast.title}</p>
        )}
        <p className={`${isDay ? 'text-slate-700' : 'text-slate-300'} text-sm leading-snug font-medium`}>{toast.msg}</p>
      </div>

      {/* Cerrar */}
      <button className={`${isDay ? 'text-slate-500 hover:text-slate-950' : 'text-slate-500 hover:text-white'} shrink-0 mt-0.5 transition-colors`}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>

      {/* Barra de progreso */}
      <div
        className={`absolute bottom-0 left-0 h-0.5 ${s.bar} rounded-full`}
        style={{ animation: `shrinkBar ${toast.duration}ms linear forwards` }}
      />
    </div>
  );
}

// ─── Contenedor de toasts ─────────────────────────────────────────────────────
function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null;
  return (
    <>
      <style>{`
        @keyframes shrinkBar { from { width: 100%; } to { width: 0%; } }
      `}</style>
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={onRemove} />
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, type = 'success', { title, duration = 3500 } = {}) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type, title, duration }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const remove = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastCtx.Provider>
  );
}
