import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';
import { useAuth } from '../../context/AuthContext';

const toTitleCase = s => !s ? '' : s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
const CATEGORIAS_LAB = ['COMPUTO','QUIMICA','AGROINDUSTRIA','PARAMEDICO','MECATRONICA','ENFERMERIA','IDIOMAS','GENERAL','OTRO'];
const esLabComputo = categoria => (categoria || '').toUpperCase() === 'COMPUTO';
const categoriaLabel = c => c ? c.replace(/_/g, ' ').toLowerCase().replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()) : 'Sin clasificar';
const capacidadUnidad = c => esLabComputo(c) ? 'equipos' : 'personas/puestos';

// ─── Ring Progress Chart ───────────────────────────────────────────────────────
// SVG donut que cambia de color según disponibilidad
function RingChart({ activas, total, size = 72 }) {
  const r       = (size - 10) / 2;           // radio interior del stroke
  const cx      = size / 2;
  const cy      = size / 2;
  const circum  = 2 * Math.PI * r;
  const pct     = total > 0 ? activas / total : 0;
  const dash    = pct * circum;
  const gap     = circum - dash;

  // Color dinámico según disponibilidad
  const color =
    total === 0              ? '#475569'     // gris — sin PCs
    : pct >= 0.70            ? '#10b981'     // esmeralda — mucha disponibilidad
    : pct >= 0.40            ? '#f59e0b'     // ámbar — disponibilidad media
    :                          '#ef4444';    // rojo — casi lleno / lleno

  const textColor =
    total === 0              ? '#94a3b8'
    : pct >= 0.70            ? '#6ee7b7'
    : pct >= 0.40            ? '#fcd34d'
    :                          '#fca5a5';

  return (
    <div className="relative shrink-0" style={{width: size, height: size}}>
      <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={6} />
        {/* Progreso */}
        <circle cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${dash} ${gap}`}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dasharray .7s cubic-bezier(.4,0,.2,1), stroke .4s ease',
            filter: `drop-shadow(0 0 4px ${color}88)`,
          }}
        />
      </svg>
      {/* Texto centrado */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-base leading-none" style={{color: textColor}}>
          {activas}
        </span>
        <span className="text-[9px] text-slate-500 mt-0.5 leading-none">/{total}</span>
      </div>
    </div>
  );
}

// ─── Badge de estado dinámico ─────────────────────────────────────────────────
function StatusBadge({ activas, total }) {
  if (total === 0)
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-white/5">Sin PCs</span>;

  const pct = activas / total;
  if (pct >= 0.70)
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">● Disponible</span>;
  if (pct >= 0.40)
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">● Parcial</span>;
  if (pct > 0)
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">● Ocupado</span>;
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-700/20 text-red-400 border border-red-700/30">● Lleno</span>;
}

// ─── Tarjeta de Laboratorio ───────────────────────────────────────────────────
function CapacityBadge({ capacidad }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
      {capacidad || 0} puestos
    </span>
  );
}

function CapacityCircle({ capacidad, size = 72 }) {
  return (
    <div
      className="relative shrink-0 rounded-full flex flex-col items-center justify-center"
      style={{
        width: size,
        height: size,
        background: 'rgba(37,99,235,0.12)',
        border: '1px solid rgba(96,165,250,0.28)',
        boxShadow: '0 0 18px rgba(37,99,235,0.12)',
      }}
    >
      <span className="font-bold text-base leading-none text-blue-200">{capacidad || 0}</span>
      <span className="text-[9px] text-slate-500 mt-0.5 leading-none">puestos</span>
    </div>
  );
}

function LaboratoryCard({ lab, onVerPCs, onEditar, onDesactivar, onActivar, canManage }) {
  const esComputo = esLabComputo(lab.categoria);
  const pct = esComputo && lab.total_computadoras > 0 ? lab.computadoras_activas / lab.total_computadoras : 0;

  // Color de glow para el hover basado en disponibilidad
  const glowColor =
    !esComputo                 ? 'rgba(37,99,235,0.22)'
    : lab.total_computadoras === 0 ? 'rgba(100,116,139,0.3)'
    : pct >= 0.70               ? 'rgba(16,185,129,0.25)'
    : pct >= 0.40               ? 'rgba(245,158,11,0.25)'
    :                             'rgba(239,68,68,0.25)';

  return (
    <div
      className={`group relative glass rounded-xl p-5 flex flex-col gap-4
                  transition-all duration-300 ease-out cursor-pointer select-none`}
      style={{
        '--glow': glowColor,
        transition: 'transform .25s ease, box-shadow .25s ease, border-color .25s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = `0 12px 40px var(--glow), 0 0 0 1px ${glowColor}`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {/* Badge estado — esquina superior derecha */}
      <div className="absolute top-3.5 right-3.5">
        {esComputo
          ? <StatusBadge activas={lab.computadoras_activas} total={lab.total_computadoras} />
          : <CapacityBadge capacidad={lab.capacidad} />}
      </div>

      {/* Cuerpo principal: ring + info */}
      <div className="flex items-center gap-4">
        {esComputo
          ? <RingChart activas={lab.computadoras_activas} total={lab.total_computadoras} size={72} />
          : <CapacityCircle capacidad={lab.capacidad} size={72} />}

        <div className="flex-1 min-w-0 pr-12">
          <h3 className="font-bold text-white text-base leading-tight truncate group-hover:text-emerald-200 transition-colors duration-200">
            {toTitleCase(lab.nombre)}
          </h3>
          <span className="inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            {categoriaLabel(lab.categoria)}
          </span>
          {lab.ubicacion ? (
            <p className="text-xs mt-1 flex items-center gap-1 truncate" style={{ color: '#94a3b8' }}>
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {toTitleCase(lab.ubicacion)}
            </p>
          ) : (
            <p className="text-xs mt-1 italic" style={{ color: '#64748b' }}>Sin ubicación</p>
          )}

          {/* Barra de progreso lineal */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">{esComputo ? 'PCs activas' : 'Capacidad registrada'}</span>
              <span className="text-[10px] text-slate-400 font-medium">
                {esComputo ? (
                  <>
                    {lab.computadoras_activas} / {lab.total_computadoras}
                    {lab.total_computadoras > 0 && (
                      <span className="text-slate-600"> ({Math.round(pct * 100)}%)</span>
                    )}
                  </>
                ) : `${lab.capacidad || 0} ${capacidadUnidad(lab.categoria)}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.07)'}}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: esComputo ? `${Math.round(pct * 100)}%` : '100%',
                  background:
                    !esComputo ? 'linear-gradient(90deg,#2563eb,#38bdf8)'
                    : pct >= 0.70 ? 'linear-gradient(90deg,#059669,#10b981)'
                    : pct >= 0.40 ? 'linear-gradient(90deg,#d97706,#f59e0b)'
                    : 'linear-gradient(90deg,#dc2626,#ef4444)',
                  boxShadow:
                    !esComputo ? '0 0 6px #38bdf866'
                    : pct >= 0.70 ? '0 0 6px #10b98166'
                    : pct >= 0.40 ? '0 0 6px #f59e0b66'
                    : '0 0 6px #ef444466',
                }}
              />
            </div>
          </div>

          {/* Capacidad */}
          <p className="text-[10px] text-slate-600 mt-1.5">
            Capacidad: {lab.capacidad} {capacidadUnidad(lab.categoria)}
            {!lab.activo && <span className="ml-2 text-slate-500">(Inactivo)</span>}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-2 pt-3 border-t border-white/5">
        <button
          onClick={() => onVerPCs(lab.id)}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold
                     py-2 rounded-xl transition-all duration-200 text-white
                     hover:shadow-[0_0_16px_rgba(5,150,105,.35)]"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          {esComputo ? 'Ver PCs' : 'Ver laboratorio'}
        </button>

        {canManage && (
          <button
            onClick={() => onEditar(lab)}
            className="px-3 py-2 rounded-xl transition-all duration-200 text-slate-500 hover:text-white hover:bg-white/10"
            title="Editar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
        )}

        {canManage && (lab.activo ? (
            <button
              onClick={() => onDesactivar(lab)}
              className="px-3 py-2 rounded-xl transition-all duration-200 text-slate-500 hover:text-red-400 hover:bg-red-900/30"
              title="Desactivar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={() => onActivar(lab)}
              className="px-3 py-2 rounded-xl transition-all duration-200 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 text-xs font-semibold"
              title="Activar laboratorio"
            >
              Activar
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Modal Crear / Editar ─────────────────────────────────────────────────────
function ModalLab({ lab, onClose, onSave }) {
  const [form, setForm]       = useState({
    nombre: lab?.nombre || '',
    categoria: lab?.categoria || '',
    ubicacion: lab?.ubicacion || '',
    capacidad: lab?.capacidad ?? 25,
    activo: lab?.activo ?? true,
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const val = e.target.name === 'capacidad' ? Number(e.target.value)
              : e.target.name === 'activo'   ? e.target.checked
              : e.target.value;
    setForm({ ...form, [e.target.name]: val }); setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = {
        ...form,
        categoria: form.categoria || null,
      };
      const { data } = lab
        ? await api.put(`/laboratorios/${lab.id}`, payload)
        : await api.post('/laboratorios', payload);
      if (payload.categoria && data?.categoria !== payload.categoria) {
        setError('El backend no devolvio el tipo de laboratorio. Aplica la migracion y reinicia el backend.');
        return;
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">{lab ? 'Editar laboratorio' : 'Nuevo laboratorio'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Nombre *</label>
            <input name="nombre" value={form.nombre} onChange={handleChange} required
              placeholder="Ej: Lab de Cómputo 1" className="input-dark" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Tipo de laboratorio</label>
            <SelectDark
              value={form.categoria}
              onChange={v => setForm({ ...form, categoria: v })}
              placeholder="Sin clasificar"
              options={[
                { value: '', label: 'Sin clasificar' },
                ...CATEGORIAS_LAB.map(c => ({ value: c, label: categoriaLabel(c) })),
              ]}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Ubicación</label>
            <input name="ubicacion" value={form.ubicacion} onChange={handleChange}
              placeholder="Ej: Edificio A, Planta Baja" className="input-dark" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">
              Capacidad ({capacidadUnidad(form.categoria)})
            </label>
            <input name="capacidad" type="number" min="1" max="200" value={form.capacidad}
              onChange={handleChange} className="input-dark" />
          </div>
          {lab && (
            <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
              form.activo
                ? 'bg-emerald-950/20 border-emerald-700/40'
                : 'bg-slate-900/70 border-slate-700 hover:border-emerald-600/50'
            }`}>
              <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange}
                className="w-4 h-4 mt-0.5 rounded accent-emerald-600" />
              <span>
                <span className={`block text-sm font-semibold ${form.activo ? 'text-emerald-300' : 'text-slate-300'}`}>
                  {form.activo ? 'Laboratorio activo' : 'Laboratorio inactivo'}
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  {form.activo
                    ? 'Visible para horarios, sesiones, reportes y filtros principales.'
                    : 'Conserva historial. Activalo para volver a usarlo en operacion.'}
                </span>
              </span>
            </label>
          )}
          {error && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-blue flex-1">
              {loading ? 'Guardando…' : (lab ? 'Actualizar' : 'Crear')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Confirmar desactivar ───────────────────────────────────────────────
function ModalConfirmar({ lab, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-glass p-6 animate-fadeUp">
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3 border border-red-700/30">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <h3 className="text-white font-semibold">¿Desactivar laboratorio?</h3>
          <p className="text-slate-400 text-sm mt-1.5">
            Se desactivará <strong className="text-white">"{lab.nombre}"</strong>.<br/>Los datos se conservan.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            disabled={loading}
            onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); }}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-all">
            {loading ? 'Desactivando…' : 'Desactivar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Laboratorios() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const puedeAdministrar = usuario?.rol === 'SUPER_ADMIN';
  const esResponsable = usuario?.rol === 'RESPONSABLE_LAB';
  const [labs, setLabs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [modalCrear, setModalCrear]   = useState(false);
  const [labEditar, setLabEditar]     = useState(null);
  const [labDesactivar, setLabDesactivar] = useState(null);
  const [soloActivos, setSoloActivos] = useState(false);

  const cargarLabs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get(`/laboratorios?solo_activos=${soloActivos}`);
      const labsVisibles = esResponsable
        ? data.filter(lab => Number(lab.id) === Number(usuario?.laboratorio_id))
        : data;
      setLabs(labsVisibles);
    } catch { setError('No se pudieron cargar los laboratorios'); }
    finally  { setLoading(false); }
  }, [esResponsable, soloActivos, usuario?.laboratorio_id]);

  useEffect(() => { cargarLabs(); }, [cargarLabs]);

  const handleDesactivar = async () => {
    try {
      await api.delete(`/laboratorios/${labDesactivar.id}`);
      setLabDesactivar(null); cargarLabs();
    } catch (err) { alert(err.response?.data?.detail || 'Error al desactivar'); }
  };

  const handleActivar = async (lab) => {
    try {
      await api.put(`/laboratorios/${lab.id}`, { activo: true });
      cargarLabs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al activar');
    }
  };

  // Resumen rápido
  const labsComputo = labs.filter(l => esLabComputo(l.categoria));
  const totPCs     = labsComputo.reduce((s, l) => s + l.total_computadoras, 0);
  const activasPCs = labsComputo.reduce((s, l) => s + l.computadoras_activas, 0);
  const gruposLabs = Object.entries(labs.reduce((acc, lab) => {
    const key = lab.categoria || 'SIN_CLASIFICAR';
    acc[key] = acc[key] || [];
    acc[key].push(lab);
    return acc;
  }, {})).sort(([a], [b]) => categoriaLabel(a).localeCompare(categoriaLabel(b), 'es'));

  return (
    <AdminLayout>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{esResponsable ? 'Mi laboratorio' : 'Laboratorios'}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {esResponsable
              ? 'Consulta el laboratorio institucional que tienes asignado'
              : 'Gestión de laboratorios institucionales y sus recursos'}
          </p>
        </div>
        {puedeAdministrar && (
          <button
            onClick={() => setModalCrear(true)}
            className="btn-blue flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo laboratorio
          </button>
        )}
      </div>

      {/* ── Resumen ── */}
      {labs.length > 0 && !loading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon:'🏢', label:'Laboratorios', value: labs.length },
            { icon:'🖥️', label:'PCs activas',  value: activasPCs },
            { icon:'📊', label:'Disponibilidad', value: totPCs > 0 ? `${Math.round(activasPCs/totPCs*100)}%` : '—' },
          ].map(({icon,label,value}) => (
            <div key={label} className="glass-sm rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <div>
                <p className="text-white font-bold text-lg leading-none">{value}</p>
                <p className="text-slate-500 text-xs mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtro ── */}
      <div className="flex items-center gap-3 my-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: '#cbd5e1' }}>
          <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-500" />
          Solo activos
        </label>
        <span className="text-slate-600">|</span>
        <span className="text-sm" style={{ color: '#94a3b8' }}>{labs.length} laboratorio{labs.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/50 text-red-300 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* ── Loading ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : labs.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <svg className="w-14 h-14 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <p className="font-medium">
            {esResponsable ? 'No tienes un laboratorio asignado' : 'No hay laboratorios registrados'}
          </p>
          {esResponsable && (
            <p className="text-sm mt-2">Solicita a un administrador que revise tu asignación.</p>
          )}
          {puedeAdministrar && (
            <button onClick={() => setModalCrear(true)}
              className="mt-3 text-blue-400 hover:text-blue-300 text-sm underline transition-colors">
              Crear el primero →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {gruposLabs.map(([categoria, labsGrupo]) => (
            <section key={categoria}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-white">{categoriaLabel(categoria)}</h2>
                <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full bg-white/5">
                  {labsGrupo.length} laboratorio{labsGrupo.length !== 1 ? 's' : ''}
                </span>
                <div className="h-px bg-white/10 flex-1" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {labsGrupo.map(lab => (
                  <LaboratoryCard
                    key={lab.id}
                    lab={lab}
                    onVerPCs={id => navigate(`/admin/laboratorios/${id}`)}
                    onEditar={setLabEditar}
                    onDesactivar={setLabDesactivar}
                    onActivar={handleActivar}
                    canManage={puedeAdministrar}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Modales ── */}
      {puedeAdministrar && (modalCrear || labEditar) && (
        <ModalLab
          lab={labEditar}
          onClose={() => { setModalCrear(false); setLabEditar(null); }}
          onSave={()  => { setModalCrear(false); setLabEditar(null); cargarLabs(); }}
        />
      )}
      {puedeAdministrar && labDesactivar && (
        <ModalConfirmar
          lab={labDesactivar}
          onClose={()  => setLabDesactivar(null)}
          onConfirm={handleDesactivar}
        />
      )}
    </AdminLayout>
  );
}
