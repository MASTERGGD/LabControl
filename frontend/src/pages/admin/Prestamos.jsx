import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark     from '../../components/SelectDark';
import DatePickerDark from '../../components/DatePickerDark';
import AutocompleteInput from '../../components/AutocompleteInput';
import { useTheme } from '../../context/ThemeContext';
import { todayISOInMexico } from '../../utils/timezone';
import { getApiErrorMessage } from '../../utils/apiError';

// ─── Combobox de búsqueda de activos ─────────────────────────────────────────
function ActivoCombobox({ activos, value, onChange }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [query, setQuery]         = useState('');
  const [abierto, setAbierto]     = useState(false);
  const [destacado, setDestacado] = useState(-1);
  const inputRef  = useRef(null);
  const listaRef  = useRef(null);

  const idsSeleccionados = new Set((value || []).map(String));
  const seleccionados = activos.filter(a => idsSeleccionados.has(String(a.id)));

  const filtrados = query.trim() === ''
    ? activos.filter(a => !idsSeleccionados.has(String(a.id)))
    : activos.filter(a => {
        const q = query.toLowerCase();
        return !idsSeleccionados.has(String(a.id)) && (
          (a.nombre || '').toLowerCase().includes(q) ||
          (a.codigo_inventario || '').toLowerCase().includes(q) ||
          (a.numero_serie || '').toLowerCase().includes(q) ||
          (a.laboratorio_nombre || '').toLowerCase().includes(q) ||
          (a.categoria || '').toLowerCase().includes(q)
        );
      });

  const seleccionar = (a) => {
    onChange([...(value || []), String(a.id)]);
    setQuery('');
    setDestacado(-1);
    inputRef.current?.focus();
  };

  const quitar = (activoId) => {
    onChange((value || []).filter(id => String(id) !== String(activoId)));
    inputRef.current?.focus();
  };

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (inputRef.current && !inputRef.current.closest('.activo-combobox')?.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKey = (e) => {
    if (!abierto) { if (e.key !== 'Tab') setAbierto(true); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestacado(d => Math.min(d + 1, filtrados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestacado(d => Math.max(d - 1, 0));
    } else if (e.key === 'Enter' && destacado >= 0) {
      e.preventDefault();
      seleccionar(filtrados[destacado]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  };

  return (
    <div className="activo-combobox relative">
      <div className="flex items-center rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/60"
        style={{ background: isDay ? '#FFFFFF' : 'rgba(15,23,42,0.7)', border: `1px solid ${isDay ? '#CBD5E1' : 'rgba(255,255,255,0.12)'}` }}>
        <span className="pl-3 text-slate-500 select-none">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar y agregar por nombre, No. inventario, serie o laboratorio..."
          value={query}
          onFocus={() => setAbierto(true)}
          onChange={e => { setQuery(e.target.value); setAbierto(true); setDestacado(-1); }}
          onKeyDown={handleKey}
          className={`flex-1 px-2 py-2 text-sm outline-none placeholder-slate-500 ${isDay ? 'text-slate-950' : 'text-slate-200'}`}
          style={{ background: 'transparent' }}
          autoComplete="off"
        />
        <span className="pr-3 text-slate-600 text-xs">▾</span>
      </div>

      {seleccionados.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {seleccionados.map(a => (
            <div key={a.id} className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
              style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)' }}>
              <span className="text-blue-400">✓</span>
              <span className={`font-medium truncate flex-1 ${isDay ? 'text-slate-800' : 'text-blue-200'}`}>
                {a.codigo_inventario ? `${a.codigo_inventario} - ` : ''}{a.nombre}
              </span>
              <button type="button" onClick={() => quitar(a.id)}
                className="text-slate-500 hover:text-red-400 font-semibold" aria-label={`Quitar ${a.nombre}`}>
                ×
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-500 px-1">
            {seleccionados.length} activo{seleccionados.length !== 1 ? 's' : ''} en este préstamo
          </p>
        </div>
      )}

      {/* Lista desplegable */}
      {abierto && (
        <div
          ref={listaRef}
          className="absolute z-50 mt-1 w-full rounded-xl shadow-2xl max-h-64 overflow-y-auto"
          style={{
            background: isDay ? '#FFFFFF' : 'rgba(15,23,42,0.96)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${isDay ? '#CBD5E1' : 'rgba(255,255,255,0.10)'}`,
          }}
        >
          {filtrados.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">
              Sin resultados para "{query}"
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-xs text-slate-600 sticky top-0"
                style={{ borderBottom: `1px solid ${isDay ? '#E2E8F0' : 'rgba(255,255,255,0.06)'}`, background: isDay ? '#F8FAFC' : 'rgba(15,23,42,0.98)' }}>
                {filtrados.length} activo{filtrados.length !== 1 ? 's' : ''} disponible{filtrados.length !== 1 ? 's' : ''} para agregar
                {query && ` · filtrando por "${query}"`}
              </div>
              {filtrados.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={() => seleccionar(a)}
                  className="w-full text-left px-4 py-2.5 text-sm transition"
                  style={{
                    background: destacado === i ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: destacado === i ? '#1D4ED8' : isDay ? '#0F172A' : '#cbd5e1',
                    borderBottom: `1px solid ${isDay ? '#E2E8F0' : 'rgba(255,255,255,0.04)'}`,
                  }}
                  onMouseEnter={() => setDestacado(i)}
                >
                  <div className="font-medium truncate">{a.nombre}</div>
                  <div className="text-xs text-slate-500 flex gap-2 mt-0.5 flex-wrap">
                    {a.codigo_inventario && <span className="text-blue-400 font-mono">{a.codigo_inventario}</span>}
                    <span>{a.categoria}</span>
                    {a.numero_serie && <span>· S/N: {a.numero_serie}</span>}
                    {a.laboratorio_nombre && <span>· {a.laboratorio_nombre}</span>}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTADOS_PRESTAMO = {
  ACTIVO:   { label: 'Activo',   color: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
  VENCIDO:  { label: 'Vencido',  color: 'bg-red-500/10 text-red-400 border border-red-500/20' },
  PARCIAL:  { label: 'Parcial',  color: 'bg-amber-500/10 text-amber-500 border border-amber-500/25' },
  DEVUELTO: { label: 'Devuelto', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
};

const CONDICION_OPCIONES = [
  { value: 'BUENO',       label: 'Bueno' },
  { value: 'REGULAR',     label: 'Regular' },
  { value: 'MALO',        label: 'Malo — requiere revisión' },
  { value: 'DAÑADO',      label: 'Dañado — fuera de servicio' },
];

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function diasRestantes(fechaStr) {
  const hoy = new Date();
  const vence = new Date(fechaStr);
  return Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Prestamos() {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';

  // ── Estado general ──
  const [prestamos, setPrestamos]       = useState([]);
  const [activos, setActivos]           = useState([]);
  const [laboratorios, setLaboratorios] = useState([]);
  const [stats, setStats]               = useState({});
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  // ── Filtros ──
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [filtroLab, setFiltroLab]         = useState('');
  const [filtroTexto, setFiltroTexto]     = useState('');

  // ── Modales ──
  const [modalPrestar, setModalPrestar]         = useState(false);
  const [modalDevolver, setModalDevolver]       = useState(false);
  const [prestamoSeleccionado, setPrestamoSel]  = useState(null);

  // ── Formulario préstamo ──
  const [formPrestar, setFormPrestar] = useState({
    activo_ids: [],
    receptor_nombre: '',
    receptor_matricula: '',
    receptor_tipo: 'ALUMNO',
    proposito: '',
    fecha_devolucion_esperada: '',
    notas: '',
  });

  // ── Formulario devolución ──
  const [formDevolver, setFormDevolver] = useState({
    condicion_devolucion: 'BUENO',
    notas_devolucion: '',
  });

  const [saving, setSaving] = useState(false);

  // ── Alumno seleccionado del autocomplete ──
  const [alumnoVerificado, setAlumnoVerificado] = useState(null);
  // Texto visible en el campo de búsqueda de alumno
  const [busquedaAlumno, setBusquedaAlumno] = useState('');

  // ─── Carga inicial ────────────────────────────────────────────────────────────

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.append('estado', filtroEstado);
      if (filtroLab)    params.append('laboratorio_id', filtroLab);

      const qs = params.toString();
      const [prestRes, statsRes, labsRes] = await Promise.all([
        api.get(`/inventario/prestamos${qs ? `?${qs}` : ''}`),
        api.get('/inventario/estadisticas'),
        api.get('/laboratorios'),
      ]);
      setPrestamos(prestRes.data);
      setStats(statsRes.data);
      setLaboratorios(labsRes.data);
    } catch (e) {
      setError('Error al cargar préstamos');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroLab]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  // ─── Abrir modal préstamo — cargar activos disponibles ───────────────────────

  const abrirModalPrestar = async () => {
    try {
      const params = new URLSearchParams({
        solo_disponibles: 'true',
        estado_admin: 'VALIDADO',
      });
      if (filtroLab) params.append('laboratorio_id', filtroLab);
      const res = await api.get(`/inventario/activos?${params.toString()}`);
      setActivos(res.data);
    } catch {
      setActivos([]);
    }
    setFormPrestar({
      activo_ids: [],
      receptor_nombre: '',
      receptor_matricula: '',
      receptor_tipo: 'ALUMNO',
      proposito: '',
      fecha_devolucion_esperada: '',
      notas: '',
    });
    setAlumnoVerificado(null);
    setBusquedaAlumno('');
    setModalPrestar(true);
  };

  // ─── Guardar préstamo ─────────────────────────────────────────────────────────

  const guardarPrestamo = async (e) => {
    e.preventDefault();
    if (formPrestar.activo_ids.length === 0) {
      setError('Selecciona al menos un activo para el préstamo');
      return;
    }
    setSaving(true);
    try {
      await api.post('/inventario/prestamos', formPrestar);
      setModalPrestar(false);
      cargarTodo();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al registrar préstamo'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Abrir modal devolución ───────────────────────────────────────────────────

  const abrirDevolucion = (prestamo) => {
    setPrestamoSel({ ...prestamo, esGrupo: false });
    setFormDevolver({ condicion_devolucion: 'BUENO', notas_devolucion: '' });
    setModalDevolver(true);
  };

  const abrirDevolucionGrupo = (grupo) => {
    setPrestamoSel({
      ...grupo.principal,
      folio: grupo.folio,
      esGrupo: true,
      items: grupo.pendientes,
    });
    setFormDevolver({ condicion_devolucion: 'BUENO', notas_devolucion: '' });
    setModalDevolver(true);
  };

  // ─── Guardar devolución ───────────────────────────────────────────────────────

  const guardarDevolucion = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (prestamoSeleccionado.esGrupo) {
        await api.post(
          `/inventario/prestamos/grupos/${encodeURIComponent(prestamoSeleccionado.folio)}/devolver`,
          {
            ...formDevolver,
            prestamo_ids: prestamoSeleccionado.items.map(item => item.id),
          },
        );
      } else {
        await api.post(`/inventario/prestamos/${prestamoSeleccionado.id}/devolver`, formDevolver);
      }
      setModalDevolver(false);
      setPrestamoSel(null);
      cargarTodo();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al registrar devolución'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Filtrado local por texto ─────────────────────────────────────────────────

  const prestamosFiltrados = prestamos.filter(p => {
    if (!filtroTexto) return true;
    const txt = filtroTexto.toLowerCase();
    return (
      (p.activo_nombre || '').toLowerCase().includes(txt) ||
      (p.receptor_nombre || '').toLowerCase().includes(txt) ||
      (p.receptor_matricula || '').toLowerCase().includes(txt) ||
      (p.folio || '').toLowerCase().includes(txt)
    );
  });

  const gruposPrestamo = Object.values(prestamosFiltrados.reduce((grupos, prestamo) => {
    const clave = prestamo.folio || `PRE-${prestamo.id}`;
    if (!grupos[clave]) {
      grupos[clave] = { folio: clave, items: [] };
    }
    grupos[clave].items.push(prestamo);
    return grupos;
  }, {})).map(grupo => {
    const pendientes = grupo.items.filter(p => p.estado === 'ACTIVO' || p.estado === 'VENCIDO');
    const devueltos = grupo.items.filter(p => p.estado === 'DEVUELTO');
    const estado = pendientes.some(p => p.estado === 'VENCIDO')
      ? 'VENCIDO'
      : pendientes.length > 0 && devueltos.length > 0
        ? 'PARCIAL'
        : pendientes.length > 0 ? 'ACTIVO' : 'DEVUELTO';
    return { ...grupo, pendientes, devueltos, estado, principal: grupo.items[0] };
  });

  const vencidos = prestamos.filter(p => p.estado === 'VENCIDO');

  // ─── UI ───────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">

        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Préstamos de activos</h1>
            <p className="text-sm text-slate-400 mt-1">
              Registro y control de préstamos de inventario institucional y de laboratorio
            </p>
          </div>
          <button
            onClick={abrirModalPrestar}
            className="flex items-center gap-2 btn-blue px-4 py-2.5 text-sm font-semibold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo Préstamo
          </button>
        </div>

        {/* Banner de alertas — préstamos vencidos */}
        {vencidos.length > 0 && (
          <div className="rounded-xl p-4 flex items-start gap-3"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span className="text-2xl">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-300">
                {vencidos.length} préstamo{vencidos.length > 1 ? 's' : ''} vencido{vencidos.length > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-red-400/80 mt-0.5">
                Los siguientes equipos no han sido devueltos en la fecha acordada:
              </p>
              <ul className="mt-2 space-y-1.5">
                {vencidos.map(p => (
                  <li key={p.id} className="text-sm text-slate-300 flex items-center gap-2 flex-wrap">
                    <span className="w-2 h-2 bg-red-500 rounded-full inline-block shrink-0"></span>
                    <span className="font-medium text-red-300">{p.activo_nombre}</span>
                    <span className="text-slate-600">—</span>
                    <span>{p.receptor_nombre}</span>
                    <span className="text-red-500/70 text-xs">
                      (venció {formatFecha(p.fecha_devolucion_esperada)})
                    </span>
                    <button
                      onClick={() => abrirDevolucion(p)}
                      className="ml-auto text-xs text-red-300 px-2.5 py-1 rounded-lg transition"
                      style={{ background: 'rgba(239,68,68,0.20)', border: '1px solid rgba(239,68,68,0.30)' }}
                    >
                      Registrar devolución
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Stats rápidas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Solicitudes', value: stats.solicitudes_prestamo_totales ?? stats.prestamos_totales ?? '-', dot: '#94a3b8', num: 'text-white' },
            { label: 'Activas',   value: stats.solicitudes_prestamo_activas ?? stats.prestamos_activos ?? '-', dot: '#60a5fa', num: 'text-blue-400' },
            { label: 'Vencidas',  value: stats.solicitudes_prestamo_vencidas ?? stats.prestamos_vencidos ?? '-', dot: '#f87171', num: 'text-red-400' },
            { label: 'Devueltas', value: stats.solicitudes_prestamo_devueltas ?? stats.prestamos_devueltos ?? '-', dot: '#34d399', num: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="glass p-4 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.dot, boxShadow: `0 0 8px ${s.dot}55` }} />
              <div>
                <p className={`text-2xl font-bold ${s.num}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', position: 'relative', zIndex: 2 }}>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Buscar activo, receptor, matrícula…"
              value={filtroTexto}
              onChange={e => setFiltroTexto(e.target.value)}
              className="input-dark flex-1 min-w-48 text-sm rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500/60"
            />
            <SelectDark
              value={filtroEstado}
              onChange={setFiltroEstado}
              className="w-40"
              placeholder="Todos los estados"
              options={[
                { value: '', label: 'Todos los estados' },
                ...Object.entries(ESTADOS_PRESTAMO).map(([val, { label }]) => ({ value: val, label })),
              ]}
            />
            <SelectDark
              value={filtroLab}
              onChange={setFiltroLab}
              className="w-48"
              placeholder="Todos los labs"
              options={[
                { value: '', label: 'Todos los laboratorios' },
                ...laboratorios.map(l => ({ value: l.id, label: l.nombre })),
              ]}
            />
            <button
              onClick={cargarTodo}
              title="Actualizar"
              className="text-slate-400 hover:text-slate-200 px-3 py-2 rounded-xl transition text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              🔄
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm text-red-300"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            {error}
          </div>
        )}

        {/* Tabla de préstamos */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: isDay ? '#FFFFFF' : 'rgba(30,41,59,0.50)', border: `1px solid ${isDay ? '#E2E8F0' : 'rgba(255,255,255,0.08)'}`, backdropFilter: 'blur(12px)' }}>

          {/* ── Loading ── */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500">
              <div className="text-center">
                <svg className="animate-spin w-8 h-8 text-blue-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <p className="text-sm">Cargando préstamos…</p>
              </div>
            </div>

          ) : prestamosFiltrados.length === 0 ? (
            /* ── Empty state elegante ── */
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
              <svg className="w-16 h-16 mb-4" style={{ color: '#1e293b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-slate-400 font-medium mb-1">
                {(filtroEstado || filtroTexto || filtroLab)
                  ? 'No hay préstamos con esos filtros'
                  : 'No hay préstamos registrados hoy'}
              </p>
              <p className="text-slate-600 text-sm mb-5">
                {(filtroEstado || filtroTexto || filtroLab)
                  ? 'Prueba ajustando los filtros de búsqueda'
                  : 'Registra el primer préstamo del día para comenzar'}
              </p>
              {(filtroEstado || filtroTexto || filtroLab) ? (
                <button
                  onClick={() => { setFiltroEstado(''); setFiltroTexto(''); setFiltroLab(''); }}
                  className="text-sm text-slate-400 hover:text-white px-4 py-2 rounded-xl transition"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  Limpiar filtros
                </button>
              ) : (
                <button
                  onClick={abrirModalPrestar}
                  className="btn-blue px-5 py-2.5 text-sm font-semibold flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                  </svg>
                  Registrar Préstamo
                </button>
              )}
            </div>

          ) : (
            /* ── Tabla ── */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: isDay ? '#F8FAFC' : 'rgba(255,255,255,0.05)', borderBottom: `1px solid ${isDay ? '#E2E8F0' : 'rgba(255,255,255,0.08)'}` }}>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Folio / Activos</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Receptor</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Propósito</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Préstamo</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Devolución</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {gruposPrestamo.map((grupo, idx) => {
                    const p = grupo.principal;
                    const est  = ESTADOS_PRESTAMO[grupo.estado] || ESTADOS_PRESTAMO.ACTIVO;
                    const dias = grupo.pendientes.length > 0 && p.fecha_devolucion_esperada
                      ? diasRestantes(p.fecha_devolucion_esperada)
                      : null;

                    return (
                      <tr key={grupo.folio}
                        className="transition-colors"
                        style={{
                          background: idx % 2 === 1 ? (isDay ? '#F8FAFC' : 'rgba(255,255,255,0.02)') : 'transparent',
                          borderBottom: `1px solid ${isDay ? '#E2E8F0' : 'rgba(255,255,255,0.05)'}`,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent'}
                      >
                        {/* Folio y activos del préstamo */}
                        <td className="px-5 py-3.5 min-w-[260px]">
                          <div className="text-[11px] font-mono font-semibold text-blue-500 mb-2">{grupo.folio}</div>
                          <div className="space-y-2">
                            {grupo.items.map(item => (
                              <div key={item.id} className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${
                                  item.estado === 'DEVUELTO' ? 'bg-emerald-500' :
                                  item.estado === 'VENCIDO' ? 'bg-red-500' : 'bg-blue-500'
                                }`} />
                                <div className="min-w-0 flex-1">
                                  <div className={`font-semibold text-sm truncate ${isDay ? 'text-slate-900' : 'text-slate-200'}`}>
                                    {item.activo_nombre || '-'}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate">
                                    {[item.activo_codigo, item.activo_lab].filter(Boolean).join(' · ')}
                                  </div>
                                </div>
                                {grupo.items.length > 1 && (item.estado === 'ACTIVO' || item.estado === 'VENCIDO') && (
                                  <button type="button" onClick={() => abrirDevolucion(item)}
                                    className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 whitespace-nowrap">
                                    Devolver este
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Receptor — formato título + matrícula en mono */}
                        <td className="px-5 py-3.5">
                          <div className={`font-semibold text-sm ${isDay ? 'text-slate-900' : 'text-slate-200'}`}>
                            {p.receptor_nombre
                              ? p.receptor_nombre.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase())
                              : '-'}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {[p.receptor_matricula, p.receptor_tipo].filter(Boolean).join(' · ')}
                          </div>
                        </td>

                        {/* Propósito — primera letra mayúscula */}
                        <td className="px-5 py-3.5">
                          <div className="text-slate-400 max-w-xs truncate text-sm">
                            {p.proposito
                              ? p.proposito.charAt(0).toUpperCase() + p.proposito.slice(1)
                              : <span className="text-slate-700">-</span>}
                          </div>
                        </td>

                        {/* Fecha préstamo */}
                        <td className="px-5 py-3.5 text-slate-400 text-sm whitespace-nowrap">
                          {formatFecha(p.fecha_prestamo)}
                        </td>

                        {/* Devolución — si ya se devolvió, solo fecha real + puntualidad */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {grupo.estado === 'DEVUELTO' && p.fecha_devolucion_real ? (
                            <div>
                              <div className={`text-sm font-medium ${isDay ? 'text-slate-700' : 'text-slate-300'}`}>
                                {formatFecha(p.fecha_devolucion_real)}
                              </div>
                              {p.fecha_devolucion_esperada && (
                                <div className={`text-xs mt-0.5 ${
                                  p.fecha_devolucion_real <= p.fecha_devolucion_esperada
                                    ? 'text-emerald-500'
                                    : 'text-amber-400'
                                }`}>
                                  {p.fecha_devolucion_real <= p.fecha_devolucion_esperada
                                    ? 'Entregado a tiempo'
                                    : 'Entregado tarde'}
                                </div>
                              )}
                            </div>
                          ) : p.fecha_devolucion_esperada ? (
                            <div>
                              <div className={`text-sm ${dias !== null && dias < 0 ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                                {formatFecha(p.fecha_devolucion_esperada)}
                              </div>
                              {dias !== null && (
                                <div className={`text-xs mt-0.5 ${dias < 0 ? 'text-red-500' : dias <= 2 ? 'text-amber-400' : 'text-slate-500'}`}>
                                  {dias < 0
                                    ? `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) > 1 ? 's' : ''}`
                                    : dias === 0 ? 'Vence hoy'
                                    : `${dias} día${dias > 1 ? 's' : ''} restante${dias > 1 ? 's' : ''}`}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-slate-700">—</span>}
                        </td>

                        {/* Estado — badge + condición como metadato sutil */}
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${est.color}`}>
                            {est.label}
                          </span>
                          <div className="text-xs text-slate-500 mt-1">
                            {grupo.devueltos.length}/{grupo.items.length} devueltos
                          </div>
                        </td>

                        {/* Acción — solo para préstamos activos/vencidos; icono ⋯ para completados */}
                        <td className="px-5 py-3.5 text-right">
                          {grupo.pendientes.length > 0 && (
                            <button
                              onClick={() => grupo.pendientes.length === 1
                                ? abrirDevolucion(grupo.pendientes[0])
                                : abrirDevolucionGrupo(grupo)}
                              className="text-xs text-white px-3 py-1.5 rounded-lg transition font-semibold whitespace-nowrap bg-emerald-600 hover:bg-emerald-700"
                            >
                              ↩ {grupo.pendientes.length > 1
                                ? `Devolver ${grupo.pendientes.length}`
                                : 'Devolver'}
                            </button>
                          )}
                          {grupo.estado === 'DEVUELTO' && (
                            <span className="text-slate-600 text-base" title="Completado">···</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Contador */}
        {!loading && gruposPrestamo.length > 0 && (
          <p className="text-xs text-slate-600 text-right">
            {gruposPrestamo.length} solicitud{gruposPrestamo.length !== 1 ? 'es' : ''} · {prestamosFiltrados.length} activo{prestamosFiltrados.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ═══ MODAL: Nuevo Préstamo ════════════════════════════════════════════════ */}

      {modalPrestar && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="glass w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <h2 className="text-lg font-bold text-white">Registrar Nuevo Préstamo</h2>
              <button
                onClick={() => setModalPrestar(false)}
                className="text-slate-400 hover:text-white text-2xl leading-none transition"
              >×</button>
            </div>
            <form onSubmit={guardarPrestamo} className="p-6 space-y-4">

              {/* Activos */}
              <div>
                <label className="block text-sm text-slate-300 font-medium mb-1.5">
                  Activos a prestar <span className="text-red-400/80 ml-0.5">*</span>
                </label>
                <ActivoCombobox
                  activos={activos}
                  value={formPrestar.activo_ids}
                  onChange={val => setFormPrestar({ ...formPrestar, activo_ids: val })}
                />
                <input type="text" required value={formPrestar.activo_ids.join(',')} onChange={() => {}}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0 }} tabIndex={-1} />
                {activos.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">No hay activos disponibles para préstamo en este momento.</p>
                )}
              </div>

              {/* Receptor */}
              <div className="space-y-3">
                {/* Tipo */}
                <div>
                  <label className="block text-sm text-slate-300 font-medium mb-1.5">Tipo de receptor</label>
                  <SelectDark
                    value={formPrestar.receptor_tipo}
                    onChange={v => {
                      setFormPrestar({ ...formPrestar, receptor_tipo: v, receptor_matricula: '', receptor_nombre: '' });
                      setAlumnoVerificado(null);
                      setBusquedaAlumno('');
                    }}
                    options={[
                      { value: 'ALUMNO',   label: 'Alumno' },
                      { value: 'DOCENTE',  label: 'Docente' },
                      { value: 'PERSONAL', label: 'Personal' },
                      { value: 'EXTERNO',  label: 'Externo' },
                    ]}
                  />
                </div>

                {/* ALUMNO → autocomplete nombre/matrícula */}
                {formPrestar.receptor_tipo === 'ALUMNO' ? (
                  <div>
                    <label className="block text-sm text-slate-300 font-medium mb-1.5">
                      Buscar alumno <span className="text-red-400/80 ml-0.5">*</span>
                      <span className="text-slate-500 font-normal ml-1">(nombre o matrícula)</span>
                    </label>

                    {/* Si ya hay alumno seleccionado, mostrar chip con opción de limpiar */}
                    {alumnoVerificado ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl
                                      bg-emerald-900/25 border border-emerald-700/40">
                        <span className="text-emerald-400 text-base">✅</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {formPrestar.receptor_nombre}
                          </p>
                          <p className="text-slate-400 text-xs font-mono">
                            {formPrestar.receptor_matricula}
                            {alumnoVerificado.grupo && <span className="ml-2 text-slate-500">· {alumnoVerificado.grupo}</span>}
                          </p>
                        </div>
                        <button type="button"
                          onClick={() => {
                            setAlumnoVerificado(null);
                            setBusquedaAlumno('');
                            setFormPrestar(prev => ({ ...prev, receptor_nombre: '', receptor_matricula: '' }));
                          }}
                          className="text-slate-500 hover:text-red-400 transition-colors text-xs px-1">
                          ✕ cambiar
                        </button>
                      </div>
                    ) : (
                      <>
                        <AutocompleteInput
                          endpoint="/catalogo/alumnos/buscar"
                          placeholder="Ej. García López o UTC250134…"
                          value={busquedaAlumno}
                          onChange={setBusquedaAlumno}
                          onSelect={alumno => {
                            const nombre = [alumno.apellido_paterno, alumno.apellido_materno, alumno.nombres]
                              .filter(Boolean).join(' ').trim();
                            setAlumnoVerificado(alumno);
                            setBusquedaAlumno(nombre);
                            setFormPrestar(prev => ({
                              ...prev,
                              receptor_nombre:    nombre,
                              receptor_matricula: alumno.matricula || '',
                            }));
                          }}
                          renderItem={alumno => (
                            <div className="flex items-center gap-2 py-0.5">
                              <span className="font-mono text-xs text-slate-400 w-24 shrink-0">
                                {alumno.matricula}
                              </span>
                              <span className="text-slate-200 text-sm truncate">
                                {[alumno.apellido_paterno, alumno.apellido_materno, alumno.nombres].filter(Boolean).join(' ')}
                              </span>
                              {alumno.grupo && (
                                <span className="ml-auto text-xs text-slate-500 shrink-0">{alumno.grupo}</span>
                              )}
                            </div>
                          )}
                          className="input-dark text-sm rounded-xl w-full"
                          minChars={2}
                        />
                        {/* hidden inputs para que el form los recoja */}
                        <input type="text" required value={formPrestar.receptor_nombre} onChange={() => {}}
                          style={{ position:'absolute', opacity:0, pointerEvents:'none', height:0 }} tabIndex={-1} />
                      </>
                    )}
                  </div>
                ) : (
                  /* No ALUMNO → campos libres */
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm text-slate-400 mb-1.5">
                        Nombre del receptor <span className="text-red-400">*</span>
                      </label>
                      <input type="text" required placeholder="Nombre completo"
                        value={formPrestar.receptor_nombre}
                        onChange={e => setFormPrestar({ ...formPrestar, receptor_nombre: e.target.value })}
                        className="input-dark text-sm rounded-xl w-full" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm text-slate-400 mb-1.5">ID / Matrícula</label>
                      <input type="text" placeholder="Opcional"
                        value={formPrestar.receptor_matricula}
                        onChange={e => setFormPrestar({ ...formPrestar, receptor_matricula: e.target.value })}
                        className="input-dark text-sm rounded-xl w-full" />
                    </div>
                  </div>
                )}
              </div>

              {/* Propósito */}
              <div>
                <label className="block text-sm text-slate-300 font-medium mb-1.5">Propósito del préstamo</label>
                <input type="text" placeholder="Ej. Proyecto final, Práctica de laboratorio…"
                  value={formPrestar.proposito}
                  onChange={e => setFormPrestar({ ...formPrestar, proposito: e.target.value })}
                  className="input-dark text-sm rounded-xl w-full" />
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Fecha de devolución esperada</label>
                <DatePickerDark
                  value={formPrestar.fecha_devolucion_esperada}
                  onChange={v => setFormPrestar({ ...formPrestar, fecha_devolucion_esperada: v })}
                  min={todayISOInMexico()}
                  placeholder="Seleccionar fecha..."
                />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm text-slate-300 font-medium mb-1.5">Notas adicionales</label>
                {/* rounded-xl para igualar la geometría de los otros inputs */}
                <textarea rows={2} placeholder="Condición actual, observaciones…"
                  value={formPrestar.notas}
                  onChange={e => setFormPrestar({ ...formPrestar, notas: e.target.value })}
                  className="input-dark text-sm rounded-xl w-full resize-none placeholder:text-slate-500" />
              </div>

              {/* Botones — misma altura (py-2.5) y border-radius (rounded-xl) */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalPrestar(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-300 transition-colors hover:text-white border border-white/15 hover:bg-white/8">
                  Cancelar
                </button>
                <button type="submit" disabled={saving || formPrestar.activo_ids.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors">
                  {saving
                    ? 'Registrando...'
                    : `Registrar préstamo (${formPrestar.activo_ids.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Registrar Devolución ════════════════════════════════════════ */}

      {modalDevolver && prestamoSeleccionado && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="glass w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <h2 className="text-lg font-bold text-white">
                {prestamoSeleccionado.esGrupo ? 'Devolver activos del préstamo' : 'Registrar Devolución'}
              </h2>
              <button onClick={() => { setModalDevolver(false); setPrestamoSel(null); }}
                className="text-slate-400 hover:text-white text-2xl leading-none transition">×</button>
            </div>
            <form onSubmit={guardarDevolucion} className="p-6 space-y-4">

              {/* Resumen */}
              <div className="rounded-xl p-4 space-y-1.5 text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {prestamoSeleccionado.esGrupo ? (
                  <>
                    <p>
                      <span className="text-slate-500">Folio:</span>{' '}
                      <span className="font-mono font-semibold text-blue-400">{prestamoSeleccionado.folio}</span>
                    </p>
                    <div>
                      <span className="text-slate-500">Activos a devolver:</span>
                      <ul className="mt-1 space-y-1">
                        {prestamoSeleccionado.items.map(item => (
                          <li key={item.id} className="font-medium text-slate-300">
                            • {item.activo_nombre}
                            {item.activo_codigo && <span className="text-slate-500"> ({item.activo_codigo})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p>
                    <span className="text-slate-500">Activo:</span>{' '}
                    <span className="font-semibold text-slate-200">{prestamoSeleccionado.activo_nombre}</span>
                  </p>
                )}
                <p>
                  <span className="text-slate-500">Receptor:</span>{' '}
                  <span className="font-medium text-slate-300">{prestamoSeleccionado.receptor_nombre}</span>
                  {prestamoSeleccionado.receptor_matricula && (
                    <span className="text-slate-500"> ({prestamoSeleccionado.receptor_matricula})</span>
                  )}
                </p>
                <p>
                  <span className="text-slate-500">Fecha préstamo:</span>{' '}
                  <span className="text-slate-300">{formatFecha(prestamoSeleccionado.fecha_prestamo)}</span>
                </p>
                {prestamoSeleccionado.estado === 'VENCIDO' && (
                  <p className="text-red-400 font-semibold flex items-center gap-1">
                    <span>⚠️</span> Este préstamo está vencido
                  </p>
                )}
              </div>

              {prestamoSeleccionado.esGrupo && (
                <p className="text-xs text-amber-500 rounded-lg px-3 py-2"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)' }}>
                  La condición seleccionada se aplicará a todos estos activos. Si alguno regresó diferente,
                  devuélvelo por separado desde la lista.
                </p>
              )}

              {/* Condición */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Condición de devolución <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CONDICION_OPCIONES.map(op => {
                    const sel = formDevolver.condicion_devolucion === op.value;
                    return (
                      <label key={op.value}
                        className="flex items-center gap-2 p-3 rounded-xl cursor-pointer transition text-sm"
                        style={{
                          background: sel ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${sel ? 'rgba(59,130,246,0.40)' : 'rgba(255,255,255,0.08)'}`,
                          color: sel ? '#93c5fd' : '#94a3b8',
                        }}>
                        <input type="radio" name="condicion" value={op.value}
                          checked={sel}
                          onChange={e => setFormDevolver({ ...formDevolver, condicion_devolucion: e.target.value })}
                          className="sr-only" />
                        <span className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                          style={{
                            borderColor: sel ? '#3b82f6' : 'rgba(255,255,255,0.25)',
                            background: sel ? '#3b82f6' : 'transparent',
                          }}>
                          {sel && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        {op.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Observaciones de devolución</label>
                <textarea rows={3} placeholder="Describe el estado del equipo al ser devuelto…"
                  value={formDevolver.notas_devolucion}
                  onChange={e => setFormDevolver({ ...formDevolver, notas_devolucion: e.target.value })}
                  className="input-dark text-sm rounded-xl w-full resize-none" />
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button type="button"
                  onClick={() => { setModalDevolver(false); setPrestamoSel(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 transition hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ background: 'rgba(16,185,129,0.80)', boxShadow: '0 0 14px rgba(16,185,129,0.25)' }}>
                  {saving
                    ? 'Guardando...'
                    : prestamoSeleccionado.esGrupo
                      ? `Confirmar ${prestamoSeleccionado.items.length} devoluciones`
                      : 'Confirmar devolución'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
