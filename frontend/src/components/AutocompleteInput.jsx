import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../hooks/useApi';

/** Convierte cualquier error de axios/FastAPI a string legible */
export function formatApiError(err, fallback = 'Error al procesar') {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => e.msg || String(e)).join(' · ');
  return fallback;
}

/**
 * AutocompleteInput — campo de búsqueda con dropdown de sugerencias.
 * El dropdown se renderiza vía portal en document.body para evitar
 * problemas de z-index / overflow con contenedores padre.
 *
 * Props:
 *   endpoint    {string}   URL del endpoint buscar, ej. "/catalogo/materias/buscar"
 *   placeholder {string}
 *   value       {string}   Texto visible en el input (controlado desde fuera)
 *   onChange    {fn(text)} Llamado cuando el usuario escribe (permite edición libre)
 *   onSelect    {fn(item)} Llamado cuando el usuario selecciona una sugerencia
 *   renderItem  {fn(item)} JSX de cada fila en el dropdown
 *   minChars    {number}   Mínimo de caracteres para disparar búsqueda (default 2)
 *   className   {string}   Clases extra para el input
 *   disabled    {bool}
 */
export default function AutocompleteInput({
  endpoint,
  placeholder = 'Buscar…',
  value = '',
  onChange,
  onSelect,
  renderItem,
  minChars = 2,
  className = '',
  disabled = false,
}) {
  const [sugerencias, setSugerencias] = useState([]);
  const [abierto, setAbierto]         = useState(false);
  const [cargando, setCargando]       = useState(false);
  const [activo, setActivo]           = useState(-1);
  const [dropPos, setDropPos]         = useState({ top: 0, left: 0, width: 0 });

  const wrapperRef    = useRef(null);
  const inputRef      = useRef(null);
  const timerRef      = useRef(null);
  const justSelected  = useRef(false);

  // Calcular posición del dropdown relativa al input (fixed, escapa cualquier contenedor)
  const calcPos = useCallback(() => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const dropH = Math.min(sugerencias.length * 48 + 8, 224); // max-h-56 = 224px

    if (spaceBelow < dropH && r.top > dropH) {
      // Abrir hacia arriba
      setDropPos({ bottom: window.innerHeight - r.top + 4, top: 'auto', left: r.left, width: r.width });
    } else {
      setDropPos({ top: r.bottom + 4, bottom: 'auto', left: r.left, width: r.width });
    }
  }, [sugerencias.length]);

  // Recalcular posición al abrir y en scroll/resize
  useEffect(() => {
    if (!abierto) return;
    calcPos();
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [abierto, calcPos]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e) => {
      if (
        wrapperRef.current && !wrapperRef.current.contains(e.target) &&
        !e.target.closest('[data-autocomplete-dropdown]')
      ) {
        setAbierto(false);
        setActivo(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Búsqueda con debounce
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (justSelected.current) { justSelected.current = false; return; }
    if (!value || value.length < minChars) {
      setSugerencias([]);
      setAbierto(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setCargando(true);
      try {
        const res = await api.get(`${endpoint}?q=${encodeURIComponent(value)}`);
        setSugerencias(res.data || []);
        setAbierto(true);
        setActivo(-1);
      } catch {
        setSugerencias([]);
      } finally {
        setCargando(false);
      }
    }, 280);
    return () => clearTimeout(timerRef.current);
  }, [value, endpoint, minChars]);

  const handleSelect = (item) => {
    justSelected.current = true;
    setSugerencias([]);
    setAbierto(false);
    setActivo(-1);
    onSelect(item);
  };

  const handleKeyDown = (e) => {
    if (!abierto || sugerencias.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo(v => Math.min(v + 1, sugerencias.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo(v => Math.max(v - 1, 0));
    } else if (e.key === 'Enter' && activo >= 0) {
      e.preventDefault();
      handleSelect(sugerencias[activo]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setActivo(-1);
    }
  };

  // Dropdown renderizado como portal
  const dropdown = abierto && (sugerencias.length > 0 || (!cargando && value.length >= minChars)) && createPortal(
    <div
      data-autocomplete-dropdown
      style={{
        position: 'fixed',
        top:    dropPos.top    !== 'auto' ? dropPos.top    : undefined,
        bottom: dropPos.bottom !== 'auto' ? dropPos.bottom : undefined,
        left:   dropPos.left,
        width:  dropPos.width,
        zIndex: 9999,
      }}
    >
      {sugerencias.length > 0 ? (
        <ul
          className="rounded-xl overflow-hidden shadow-2xl max-h-56 overflow-y-auto"
          style={{ background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {sugerencias.map((item, idx) => (
            <li
              key={item.id ?? idx}
              onMouseDown={() => handleSelect(item)}
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              className={`px-3 py-2.5 cursor-pointer text-sm transition-colors
                ${idx === activo
                  ? 'bg-blue-500/20 text-blue-200'
                  : 'text-slate-200 hover:bg-white/5'}`}
            >
              {renderItem ? renderItem(item) : String(item)}
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="rounded-xl px-3 py-3 text-sm text-slate-500 text-center"
          style={{ background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Sin resultados para «{value}»
        </div>
      )}
    </div>,
    document.body
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => { onChange(e.target.value); }}
          onFocus={() => { if (sugerencias.length > 0) { calcPos(); setAbierto(true); } }}
          onKeyDown={handleKeyDown}
          className={`input-dark pr-8 ${className}`}
          autoComplete="off"
        />
        {cargando && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs animate-pulse">⏳</span>
        )}
        {!cargando && value && (
          <button
            type="button"
            onClick={() => { onChange(''); setSugerencias([]); setAbierto(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-base leading-none"
          >×</button>
        )}
      </div>
      {dropdown}
    </div>
  );
}
