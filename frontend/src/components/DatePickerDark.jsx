import { useState, useRef, useEffect } from 'react';

const DIAS   = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
const MESES  = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

/**
 * DatePickerDark — selector de fecha 100% personalizado.
 *
 * Props:
 *   value       {string}   Fecha seleccionada en formato YYYY-MM-DD (controlado)
 *   onChange    {fn(str)}  Callback con el nuevo valor YYYY-MM-DD
 *   placeholder {string}
 *   min / max   {string}   Límites opcionales YYYY-MM-DD
 *   className   {string}
 */
export default function DatePickerDark({
  value      = '',
  onChange,
  placeholder = 'dd / mm / aaaa',
  min,
  max,
  className  = '',
}) {
  const today  = new Date();
  const parsed = value ? new Date(value + 'T00:00:00') : null;

  // Mes/año del calendario visible
  const [viewYear,  setViewYear]  = useState(parsed ? parsed.getFullYear()  : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed ? parsed.getMonth()     : today.getMonth());
  const [open, setOpen] = useState(false);

  const wrapRef    = useRef(null);
  const triggerRef = useRef(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Construir celdas del calendario
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0);  setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (d) => {
    if (!d) return;
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const iso = `${viewYear}-${mm}-${dd}`;
    if (min && iso < min) return;
    if (max && iso > max) return;
    onChange(iso);
    setOpen(false);
  };

  const clearDate = (e) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
  };

  // Etiqueta visible
  const displayLabel = parsed
    ? `${String(parsed.getDate()).padStart(2,'0')} / ${String(parsed.getMonth()+1).padStart(2,'0')} / ${parsed.getFullYear()}`
    : '';

  // Verificar si un día está deshabilitado
  const isDisabled = (d) => {
    if (!d) return true;
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const iso = `${viewYear}-${mm}-${dd}`;
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const isSelected = (d) => {
    if (!d || !parsed) return false;
    return parsed.getFullYear() === viewYear &&
           parsed.getMonth()    === viewMonth &&
           parsed.getDate()     === d;
  };

  const isToday = (d) => {
    if (!d) return false;
    return today.getFullYear() === viewYear &&
           today.getMonth()    === viewMonth &&
           today.getDate()     === d;
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`} style={{ minWidth: 0 }}>

      {/* ── Trigger ────────────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-[0.625rem] rounded-xl text-sm
                   transition-all duration-150 focus:outline-none cursor-pointer"
        style={{
          background: open ? 'rgba(15,23,42,0.85)' : 'rgba(15,23,42,0.7)',
          border:     open ? '1px solid #3b82f6'    : '1px solid #334155',
          color:      displayLabel ? '#f1f5f9'       : '#475569',
          boxShadow:  open ? '0 0 0 3px rgba(59,130,246,.15)' : 'none',
          fontFamily: 'inherit',
        }}
      >
        <span className="truncate text-xs">{displayLabel || placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              onMouseDown={clearDate}
              className="text-slate-500 hover:text-slate-300 transition-colors px-0.5 text-xs leading-none"
              title="Limpiar"
            >
              &#x2715;
            </span>
          )}
          {/* Icono calendario */}
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
      </button>

      {/* ── Calendario flotante ─────────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute z-[9999] mt-1.5 rounded-2xl shadow-2xl p-4 animate-fadeUp"
          style={{
            background:           'rgba(15,23,42,0.97)',
            backdropFilter:       'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border:               '1px solid rgba(255,255,255,0.10)',
            minWidth:             '260px',
            left: 0,
          }}
        >
          {/* Navegación mes/año */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <span className="text-sm font-semibold text-slate-200">
              {MESES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>

          {/* Cabecera días */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-slate-500 py-1">{d}</div>
            ))}
          </div>

          {/* Celdas */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((d, i) => {
              const sel  = isSelected(d);
              const tod  = isToday(d);
              const dis  = isDisabled(d);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(d)}
                  disabled={dis || !d}
                  className={`
                    h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-xs
                    transition-colors duration-100
                    ${!d ? 'invisible' : ''}
                    ${sel
                      ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-900/40'
                      : tod
                        ? 'border border-blue-500/50 text-blue-400 hover:bg-blue-500/20'
                        : dis
                          ? 'text-slate-700 cursor-not-allowed'
                          : 'text-slate-300 hover:bg-slate-700/60 cursor-pointer'
                    }
                  `}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Botón Hoy */}
          <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                setViewYear(today.getFullYear());
                setViewMonth(today.getMonth());
                selectDay(today.getDate());
              }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              Hoy
            </button>
            {value && (
              <button
                type="button"
                onClick={clearDate}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
