import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark     from '../../components/SelectDark';
import DatePickerDark from '../../components/DatePickerDark';

// ─── Combobox de búsqueda de activos ─────────────────────────────────────────
function ActivoCombobox({ activos, value, onChange }) {
  const [query, setQuery]         = useState('');
  const [abierto, setAbierto]     = useState(false);
  const [destacado, setDestacado] = useState(-1);
  const inputRef  = useRef(null);
  const listaRef  = useRef(null);

  // Texto que muestra el input cuando hay un valor seleccionado
  const seleccionado = activos.find(a => String(a.id) === String(value));
  const labelSeleccionado = seleccionado
    ? `${seleccionado.codigo_inventario ? seleccionado.codigo_inventario + ' — ' : ''}${seleccionado.nombre} (${seleccionado.laboratorio_nombre || 'Sin lab'})`
    : '';

  const filtrados = query.trim() === ''
    ? activos
    : activos.filter(a => {
        const q = query.toLowerCase();
        return (
          a.nombre?.toLowerCase().includes(q) ||
          a.codigo_inventario?.toLowerCase().includes(q) ||
          a.numero_serie?.toLowerCase().includes(q) ||
          a.laboratorio_nombre?.toLowerCase().includes(q) ||
          a.categoria?.toLowerCase().includes(q)
        );
      });

  const seleccionar = (a) => {
    onChange(String(a.id));
    setQuery('');
    setAbierto(false);
    setDestacado(-1);
  };

  const limpiar = () => {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  };

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (!inputRef.current?.closest('.activo-combobox')?.contains(e.target)) {
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
        style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.12)' }}>
        <span className="pl-3 text-slate-500 text-sm select-none">🔍</span>
        <input
          ref={inputRef}
          type="text"
          placeholder={value ? labelSeleccionado : 'Buscar por nombre, No. inventario, serie o laboratorio…'}
          value={value && !abierto ? '' : query}
          onFocus={() => setAbierto(true)}
          onChange={e => { setQuery(e.target.value); setAbierto(true); setDestacado(-1); }}
          onKeyDown={handleKey}
          className="flex-1 px-2 py-2 text-sm text-slate-200 outline-none placeholder-slate-600"
          style={{ background: 'transparent' }}
          autoComplete="off"
        />
        {value
          ? <button type="button" onClick={limpiar} className="pr-3 text-slate-500 hover:text-red-400 text-lg leading-none">×</button>
          : <span className="pr-3 text-slate-600 text-xs">▾</span>
        }
      </div>

      {/* Etiqueta del seleccionado */}
      {value && !abierto && (
        <div className="mt-1 px-2 py-1 rounded-lg text-xs text-blue-300 flex items-center gap-2"
          style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)' }}>
          <span>✓</span>
          <span className="font-medium truncate">{labelSeleccionado}</span>
        </div>
      )}

      {/* Lista desplegable */}
      {abierto && (
        <div
          ref={listaRef}
          className="absolute z-50 mt-1 w-full rounded-xl shadow-2xl max-h-64 overflow-y-auto"
          style={{
            background: 'rgba(15,23,42,0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {filtrados.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">
              Sin resultados para "{query}"
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-xs text-slate-600 sticky top-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,23,42,0.98)' }}>
                {filtrados.length} activo{filtrados.length !== 1 ? 's' : ''} disponible{filtrados.length !== 1 ? 's' : ''}
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
                    color: destacado === i ? '#93c5fd' : '#cbd5e1',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
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
  DEVUELTO: { label: 'Devuelto', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
};

const CONDICION_OPCIONES = [
  { value: 'BUENO',       label: 'Bueno' },
  { value: 'REGULAR',     label: 'Regular' },
  { value: 'MALO',        label: 'Malo — requiere revisión' },
  { value: 'DAÑADO',      label: 'Dañado — fuera de servicio' },
];

const CATEGORIAS_LABEL = {
  COMPUTADORA:    '🖥️ Computadora',
  IMPRESORA_3D:   '🖨️ Impresora 3D',
  BRAZO_ROBOTICO: '🦾 Brazo Robótico',
  SCANNER:        '📡 Escáner',
  IOT:            '🔌 IoT',
  HERRAMIENTA:    '🔧 Herramienta',
  MOBILIARIO:     '🪑 Mobiliario',
  OTRO:           '📦 Otro',
};

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
    activo_id: '',
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

  // ─── Carga inicial ────────────────────────────────────────────────────────────

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.append('estado', filtroEstado);
      if (filtroLab)    params.append('laboratorio_id', filtroLab);

      const [prestRes, statsRes, labsRes] = await Promise.all([
        api.get(`/inventario/prestamos?${params}`),
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
      const params = new URLSearchParams({ solo_disponibles: 'true' });
      if (filtroLab) params.append('laboratorio_id', filtroLab);
      const res = await api.get(`/inventario/activos?${params}`);
      setActivos(res.data);
    } catch {
      setActivos([]);
    }
    setFormPrestar({
      activo_id: '',
      receptor_nombre: '',
      receptor_matricula: '',
      receptor_tipo: 'ALUMNO',
      proposito: '',
      fecha_devolucion_esperada: '',
      notas: '',
    });
    setModalPrestar(true);
  };

  // ─── Guardar préstamo ─────────────────────────────────────────────────────────

  const guardarPrestamo = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/inventario/prestamos', formPrestar);
      setModalPrestar(false);
      cargarTodo();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al registrar préstamo');
    } finally {
      setSaving(false);
    }
  };

  // ─── Abrir modal devolución ───────────────────────────────────────────────────

  const abrirDevolucion = (prestamo) => {
    setPrestamoSel(prestamo);
    setFormDevolver({ condicion_devolucion: 'BUENO', notas_devolucion: '' });
    setModalDevolver(true);
  };

  // ─── Guardar devolución ───────────────────────────────────────────────────────

  const guardarDevolucion = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/inventario/prestamos/${prestamoSeleccionado.id}/devolver`, formDevolver);
      setModalDevolver(false);
      setPrestamoSel(null);
      cargarTodo();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al registrar devolución');
    } finally {
      setSaving(false);
    }
  };

  // ─── Filtrado local por texto ─────────────────────────────────────────────────

  const prestamosFiltrados = prestamos.filter(p => {
    if (!filtroTexto) return true;
    const txt = filtroTexto.toLowerCase();
    return (
      p.activo_nombre?.toLowerCase().includes(txt) ||
      p.receptor_nombre?.toLowerCase().includes(txt) ||
      p.receptor_matricula?.toLowerCase().includes(txt)
    );
  });

  const vencidos = prestamos.filter(p => p.estado === 'VENCIDO');

  // ─── UI ───────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">

        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Préstamos de Equipo</h1>
            <p className="text-sm text-slate-400 mt-1">
              Registro y control de préstamos de activos tecnológicos
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
            { label: 'Total préstamos', value: stats.prestamos_totales ?? '—', dot: '#94a3b8', num: 'text-white' },
            { label: 'Activos',   value: stats.prestamos_activos  ?? '—', dot: '#60a5fa', num: 'text-blue-400' },
            { label: 'Vencidos',  value: stats.prestamos_vencidos ?? '—', dot: '#f87171', num: 'text-red-400' },
            { label: 'Devueltos', value: stats.prestamos_devueltos?? '—', dot: '#34d399', num: 'text-emerald-400' },
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
          style={{ background: 'rgba(30,41,59,0.50)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>

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
                  <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Activo</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Receptor</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Propósito</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Préstamo</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Devolución</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {prestamosFiltrados.map((p, idx) => {
                    const est  = ESTADOS_PRESTAMO[p.estado] || ESTADOS_PRESTAMO.ACTIVO;
                    const dias = p.estado === 'ACTIVO' && p.fecha_devolucion_esperada
                      ? diasRestantes(p.fecha_devolucion_esperada)
                      : null;

                    return (
                      <tr key={p.id}
                        className="transition-colors"
                        style={{
                          background: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent'}
                      >
                        {/* Activo */}
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-200">{p.activo_nombre}</div>
                          {p.activo_categoria && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {CATEGORIAS_LABEL[p.activo_categoria] || p.activo_categoria}
                            </div>
                          )}
                          {p.activo_lab && (
                            <div className="text-xs text-slate-600">{p.activo_lab}</div>
                          )}
                        </td>
                        {/* Receptor */}
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-200">{p.receptor_nombre}</div>
                          {p.receptor_matricula && (
                            <div className="text-xs text-slate-500 font-mono">{p.receptor_matricula}</div>
                          )}
                          <div className="text-xs text-slate-600">{p.receptor_tipo}</div>
                        </td>
                        {/* Propósito */}
                        <td className="px-5 py-3.5">
                          <div className="text-slate-400 max-w-xs truncate text-sm">{p.proposito || <span className="text-slate-700">—</span>}</div>
                        </td>
                        {/* Fecha préstamo */}
                        <td className="px-5 py-3.5 text-slate-400 text-sm whitespace-nowrap">
                          {formatFecha(p.fecha_prestamo)}
                        </td>
                        {/* Devolución */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {p.fecha_devolucion_esperada ? (
                            <div>
                              <div className={`text-sm ${dias !== null && dias < 0 ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                                {formatFecha(p.fecha_devolucion_esperada)}
                              </div>
                              {dias !== null && p.estado === 'ACTIVO' && (
                                <div className={`text-xs mt-0.5 ${dias < 0 ? 'text-red-500' : dias <= 2 ? 'text-amber-400' : 'text-slate-500'}`}>
                                  {dias < 0
                                    ? `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) > 1 ? 's' : ''}`
                                    : dias === 0 ? 'Vence hoy'
                                    : `${dias} día${dias > 1 ? 's' : ''} restante${dias > 1 ? 's' : ''}`}
                                </div>
                              )}
                              {p.estado === 'DEVUELTO' && p.fecha_devolucion_real && (
                                <div className="text-xs text-emerald-500 mt-0.5">
                                  Devuelto: {formatFecha(p.fecha_devolucion_real)}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-slate-700">—</span>}
                        </td>
                        {/* Estado */}
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${est.color}`}>
                            {est.label}
                          </span>
                          {p.condicion_devolucion && (
                            <div className="text-xs text-slate-600 mt-1">
                              {p.condicion_devolucion}
                            </div>
                          )}
                        </td>
                        {/* Acción */}
                        <td className="px-5 py-3.5 text-right">
                          {(p.estado === 'ACTIVO' || p.estado === 'VENCIDO') && (
                            <button
                              onClick={() => abrirDevolucion(p)}
                              className="text-xs text-emerald-300 px-3 py-1.5 rounded-lg transition font-medium whitespace-nowrap"
                              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
                            >
                              ↩ Devolver
                            </button>
                          )}
                          {p.estado === 'DEVUELTO' && (
                            <span className="text-xs text-slate-600 italic">Completado</span>
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
        {!loading && prestamosFiltrados.length > 0 && (
          <p className="text-xs text-slate-600 text-right">
            {prestamosFiltrados.length} préstamo{prestamosFiltrados.length !== 1 ? 's' : ''} encontrado{prestamosFiltrados.length !== 1 ? 's' : ''}
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

              {/* Activo */}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">
                  Activo a prestar <span className="text-red-400">*</span>
                </label>
                <ActivoCombobox
                  activos={activos}
                  value={formPrestar.activo_id}
                  onChange={val => setFormPrestar({ ...formPrestar, activo_id: val })}
                />
                <input type="text" required value={formPrestar.activo_id} onChange={() => {}}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0 }} tabIndex={-1} />
                {activos.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">No hay activos disponibles para préstamo en este momento.</p>
                )}
              </div>

              {/* Receptor */}
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
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Matrícula / ID</label>
                  <input type="text" placeholder="Ej. 230001"
                    value={formPrestar.receptor_matricula}
                    onChange={e => setFormPrestar({ ...formPrestar, receptor_matricula: e.target.value })}
                    className="input-dark text-sm rounded-xl w-full" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Tipo de receptor</label>
                  <SelectDark
                    value={formPrestar.receptor_tipo}
                    onChange={v => setFormPrestar({ ...formPrestar, receptor_tipo: v })}
                    options={[
                      { value: 'ALUMNO',   label: 'Alumno' },
                      { value: 'DOCENTE',  label: 'Docente' },
                      { value: 'PERSONAL', label: 'Personal' },
                      { value: 'EXTERNO',  label: 'Externo' },
                    ]}
                  />
                </div>
              </div>

              {/* Propósito */}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Propósito del préstamo</label>
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
                  min={new Date().toISOString().split('T')[0]}
                  placeholder="Seleccionar fecha..."
                />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Notas adicionales</label>
                <textarea rows={2} placeholder="Condición actual, observaciones…"
                  value={formPrestar.notas}
                  onChange={e => setFormPrestar({ ...formPrestar, notas: e.target.value })}
                  className="input-dark text-sm rounded-xl w-full resize-none" />
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalPrestar(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 transition hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving || activos.length === 0}
                  className="flex-1 btn-blue py-2.5 text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Registrando…' : 'Registrar Préstamo'}
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
              <h2 className="text-lg font-bold text-white">Registrar Devolución</h2>
              <button onClick={() => { setModalDevolver(false); setPrestamoSel(null); }}
                className="text-slate-400 hover:text-white text-2xl leading-none transition">×</button>
            </div>
            <form onSubmit={guardarDevolucion} className="p-6 space-y-4">

              {/* Resumen */}
              <div className="rounded-xl p-4 space-y-1.5 text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p>
                  <span className="text-slate-500">Activo:</span>{' '}
                  <span className="font-semibold text-slate-200">{prestamoSeleccionado.activo_nombre}</span>
                </p>
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
                  {saving ? 'Guardando…' : '✓ Confirmar Devolución'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
