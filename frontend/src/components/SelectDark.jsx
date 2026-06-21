import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * SelectDark — dropdown 100 % personalizado que respeta el Dark Theme.
 *
 * Props:
 *   value       {string|number}          Valor seleccionado (controlado)
 *   onChange    {fn(value)}              Callback con el nuevo valor (string/number)
 *   options     {Array<{value, label}>}  Lista de opciones
 *   placeholder {string}                 Texto cuando no hay nada seleccionado
 *   name        {string}                 Nombre del campo (opcional, para forms)
 *   disabled    {bool}
 *   className   {string}                 Clases extra para el trigger
 *   menuClass   {string}                 Clases extra para el panel flotante
 *   menuMinWidth {number}                Ancho minimo del panel flotante en px
 *   size        {'sm'|'md'}              Tamaño del trigger (md por defecto)
 */
export default function SelectDark({
  value,
  onChange,
  options = [],
  placeholder = 'Seleccionar…',
  name,
  disabled = false,
  className = '',
  menuClass = '',
  menuMinWidth = 0,
  size = 'md',
}) {
  const [open, setOpen]     = useState(false);
  const [active, setActive] = useState(-1);    // fila resaltada con teclado
  const [menuStyle, setMenuStyle] = useState({});
  const wrapRef  = useRef(null);
  const listRef  = useRef(null);
  const triggerRef = useRef(null);

  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const gap = 6;
    const preferredMax = 320;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const opensUp = spaceBelow < 120 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferredMax, opensUp ? spaceAbove : spaceBelow));
    const width = Math.min(
      Math.max(rect.width, Number(menuMinWidth) || 0),
      window.innerWidth - 16,
    );
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);

    setMenuStyle({
      position: 'fixed',
      left: `${left}px`,
      top: `${opensUp ? rect.top - maxHeight - gap : rect.bottom + gap}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
      zIndex: 10000,
    });
  }, [menuMinWidth]);

  // ── etiqueta que se muestra en el trigger ────────────────────────────────
  const selectedOpt = options.find(o => String(o.value) === String(value));
  const triggerLabel = selectedOpt ? selectedOpt.label : placeholder;

  // ── cerrar al hacer clic fuera ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const insideTrigger = wrapRef.current?.contains(e.target);
      const insideMenu = listRef.current?.contains(e.target);
      if (!insideTrigger && !insideMenu) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const onReposition = () => updateMenuPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updateMenuPosition]);

  // ── scroll automático al ítem activo ────────────────────────────────────
  useEffect(() => {
    if (!open || active < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-opt]');
    items[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const handleToggle = () => {
    if (disabled) return;
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      const idx = options.findIndex(o => String(o.value) === String(value));
      setActive(idx >= 0 ? idx : 0);
      requestAnimationFrame(updateMenuPosition);
    } else {
      setActive(-1);
    }
  };

  const handleSelect = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setActive(-1);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        const idx = options.findIndex(o => String(o.value) === String(value));
        setActive(idx >= 0 ? idx : 0);
        requestAnimationFrame(updateMenuPosition);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive(v => Math.min(v + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(v => Math.max(v - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (active >= 0) handleSelect(options[active]);
        break;
      case 'Escape':
        setOpen(false);
        setActive(-1);
        triggerRef.current?.focus();
        break;
      default:
        break;
    }
  };

  // ── tamaños ──────────────────────────────────────────────────────────────
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-[0.625rem] text-sm',
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`} style={{ minWidth: 0 }}>

      {/* ── Trigger ──────────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`
          w-full flex items-center justify-between gap-2
          ${sizeStyles[size]}
          rounded-xl font-normal
          transition-all duration-150
          focus:outline-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        style={{
          background: open ? 'var(--input-bg-open)' : 'var(--input-bg)',
          border: open
            ? '1px solid var(--dropdown-accent)'
            : '1px solid var(--input-border-color)',
          color: selectedOpt ? 'var(--input-color)' : 'var(--input-placeholder-color)',
          boxShadow: open ? '0 0 0 3px var(--accent-primary-glow)' : 'none',
          fontFamily: 'inherit',
        }}
      >
        <span className="truncate min-w-0">{triggerLabel}</span>
        {/* Chevron */}
        <svg
          className="w-4 h-4 shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--dropdown-chevron)' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Menú flotante ─────────────────────────────────────────────────── */}
      {open && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          className={`
            w-full
            rounded-xl overflow-hidden overflow-y-auto
            shadow-2xl animate-fadeUp
            ${menuClass}
          `}
          style={{
            background: 'var(--dropdown-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--dropdown-border)',
            ...menuStyle,
          }}
        >
          {options.length === 0 ? (
            <li className="px-4 py-3 text-sm text-center" style={{color:'var(--dropdown-text-empty)'}}>Sin opciones</li>
          ) : (
            options.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              const isActive   = idx === active;
              return (
                <li
                  key={opt.value}
                  data-opt
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(idx)}
                  onMouseDown={() => handleSelect(opt)}
                  style={{
                    borderLeft: (isActive || isSelected)
                      ? '2px solid var(--dropdown-accent)'
                      : '2px solid transparent',
                    background: isActive
                      ? 'var(--dropdown-active-bg)'
                      : isSelected
                        ? 'var(--dropdown-selected-bg)'
                        : 'transparent',
                    borderBottom: '1px solid var(--dropdown-row-border)',
                    color: isActive
                      ? 'var(--dropdown-text-active)'
                      : isSelected
                        ? 'var(--dropdown-text-selected)'
                        : 'var(--dropdown-text)',
                  }}
                  className="px-4 py-2.5 cursor-pointer select-none transition-colors duration-100 flex items-center justify-between gap-2 text-sm"
                >
                  <span
                    className={`${opt.wrap ? 'whitespace-normal break-words leading-snug' : 'truncate'} min-w-0`}
                    title={typeof opt.label === 'string' ? opt.label : undefined}
                  >
                    {opt.label}
                    {opt.sublabel && (
                      <span className="ml-2 text-[11px] opacity-50">{opt.sublabel}</span>
                    )}
                  </span>
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 shrink-0" style={{color:'var(--dropdown-accent)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </li>
              );
            })
          )}
        </ul>,
        document.body
      )}

      {/* Campo oculto para accesibilidad / form submit */}
      {name && <input type="hidden" name={name} value={value ?? ''} />}
    </div>
  );
}
