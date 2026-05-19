import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

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
function LaboratoryCard({ lab, onVerPCs, onEditar, onDesactivar }) {
  const pct = lab.total_computadoras > 0 ? lab.computadoras_activas / lab.total_computadoras : 0;

  // Color de glow para el hover basado en disponibilidad
  const glowColor =
    lab.total_computadoras === 0 ? 'rgba(100,116,139,0.3)'
    : pct >= 0.70               ? 'rgba(16,185,129,0.25)'
    : pct >= 0.40               ? 'rgba(245,158,11,0.25)'
    :                             'rgba(239,68,68,0.25)';

  return (
    <div
      className={`group relative glass rounded-xl p-5 flex flex-col gap-4
                  transition-all duration-300 ease-out cursor-pointer select-none
                  ${lab.activo ? '' : 'opacity-50'}`}
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
        <StatusBadge activas={lab.computadoras_activas} total={lab.total_computadoras} />
      </div>

      {/* Cuerpo principal: ring + info */}
      <div className="flex items-center gap-4">
        <RingChart activas={lab.computadoras_activas} total={lab.total_computadoras} size={72} />

        <div className="flex-1 min-w-0 pr-12">
          <h3 className="font-bold text-white text-base leading-tight truncate group-hover:text-blue-200 transition-colors duration-200">
            {lab.nombre}
          </h3>
          {lab.ubicacion ? (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 truncate">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {lab.ubicacion}
            </p>
          ) : (
            <p className="text-xs text-slate-600 mt-1 italic">Sin ubicación</p>
          )}

          {/* Barra de progreso lineal */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">PCs activas</span>
              <span className="text-[10px] text-slate-400 font-medium">
                {lab.computadoras_activas} / {lab.total_computadoras}
                {lab.total_computadoras > 0 && (
                  <span className="text-slate-600"> ({Math.round(pct * 100)}%)</span>
                )}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.07)'}}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.round(pct * 100)}%`,
                  background:
                    pct >= 0.70 ? 'linear-gradient(90deg,#059669,#10b981)'
                    : pct >= 0.40 ? 'linear-gradient(90deg,#d97706,#f59e0b)'
                    : 'linear-gradient(90deg,#dc2626,#ef4444)',
                  boxShadow:
                    pct >= 0.70 ? '0 0 6px #10b98166'
                    : pct >= 0.40 ? '0 0 6px #f59e0b66'
                    : '0 0 6px #ef444466',
                }}
              />
            </div>
          </div>

          {/* Capacidad */}
          <p className="text-[10px] text-slate-600 mt-1.5">
            Capacidad: {lab.capacidad} equipos
            {!lab.activo && <span className="ml-2 text-slate-500">(Inactivo)</span>}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-2 pt-3 border-t border-white/5">
        <button
          onClick={() => onVerPCs(lab.id)}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold
                     py-2 rounded-xl transition-all duration-200
                     bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white
                     border border-blue-500/20 hover:border-blue-500
                     hover:shadow-[0_0_16px_rgba(59,130,246,.4)]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          Ver PCs
        </button>

        <button
          onClick={() => onEditar(lab)}
          className="px-3 py-2 rounded-xl transition-all duration-200
                     bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white
                     border border-white/5 hover:border-white/15"
          title="Editar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>

        {lab.activo && (
          <button
            onClick={() => onDesactivar(lab)}
            className="px-3 py-2 rounded-xl transition-all duration-200
                       bg-white/5 hover:bg-red-900/40 text-slate-400 hover:text-red-400
                       border border-white/5 hover:border-red-700/40"
            title="Desactivar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Modal Crear / Editar ─────────────────────────────────────────────────────
function ModalLab({ lab, onClose, onSave }) {
  const [form, setForm]       = useState({
    nombre: lab?.nombre || '',
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
      if (lab) await api.put(`/laboratorios/${lab.id}`, form);
      else     await api.post('/laboratorios', form);
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
            <label className="block text-sm text-slate-400 mb-1.5">Ubicación</label>
            <input name="ubicacion" value={form.ubicacion} onChange={handleChange}
              placeholder="Ej: Edificio A, Planta Baja" className="input-dark" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Capacidad (equipos)</label>
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
  const [labs, setLabs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [modalCrear, setModalCrear]   = useState(false);
  const [labEditar, setLabEditar]     = useState(null);
  const [labDesactivar, setLabDesactivar] = useState(null);
  const [soloActivos, setSoloActivos] = useState(true);

  const cargarLabs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get(`/laboratorios?solo_activos=${soloActivos}`);
      setLabs(data);
    } catch { setError('No se pudieron cargar los laboratorios'); }
    finally  { setLoading(false); }
  }, [soloActivos]);

  useEffect(() => { cargarLabs(); }, [cargarLabs]);

  const handleDesactivar = async () => {
    try {
      await api.delete(`/laboratorios/${labDesactivar.id}`);
      setLabDesactivar(null); cargarLabs();
    } catch (err) { alert(err.response?.data?.detail || 'Error al desactivar'); }
  };

  // Resumen rápido
  const totPCs     = labs.reduce((s, l) => s + l.total_computadoras, 0);
  const activasPCs = labs.reduce((s, l) => s + l.computadoras_activas, 0);

  return (
    <AdminLayout>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Laboratorios</h1>
          <p className="text-slate-400 text-sm mt-0.5">Gestión de laboratorios y equipos de cómputo</p>
        </div>
        <button
          onClick={() => setModalCrear(true)}
          className="btn-blue flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Nuevo laboratorio
        </button>
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
      <div className="flex items-center gap-3 mb-5">
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500" />
          Solo activos
        </label>
        <span className="text-slate-700">|</span>
        <span className="text-sm text-slate-500">{labs.length} laboratorio{labs.length !== 1 ? 's' : ''}</span>
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
          <p className="font-medium">No hay laboratorios registrados</p>
          <button onClick={() => setModalCrear(true)}
            className="mt-3 text-blue-400 hover:text-blue-300 text-sm underline transition-colors">
            Crear el primero →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {labs.map(lab => (
            <LaboratoryCard
              key={lab.id}
              lab={lab}
              onVerPCs={id => navigate(`/admin/laboratorios/${id}`)}
              onEditar={setLabEditar}
              onDesactivar={setLabDesactivar}
            />
          ))}
        </div>
      )}

      {/* ── Modales ── */}
      {(modalCrear || labEditar) && (
        <ModalLab
          lab={labEditar}
          onClose={() => { setModalCrear(false); setLabEditar(null); }}
          onSave={()  => { setModalCrear(false); setLabEditar(null); cargarLabs(); }}
        />
      )}
      {labDesactivar && (
        <ModalConfirmar
          lab={labDesactivar}
          onClose={()  => setLabDesactivar(null)}
          onConfirm={handleDesactivar}
        />
      )}
    </AdminLayout>
  );
}
