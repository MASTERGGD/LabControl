import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
import { getApiErrorMessage } from '../../utils/apiError';

const toTitleCase = s => !s ? '' : s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
const esLabComputo = categoria => (categoria || '').toUpperCase() === 'COMPUTO';
const categoriaLabel = c => c ? c.replace(/_/g, ' ').toLowerCase().replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()) : 'Sin clasificar';
const capacidadUnidad = c => esLabComputo(c) ? 'equipos' : 'personas/puestos';

const ESTADO_COLOR = {
  OPERATIVO:     'bg-green-900/50 border-green-700 text-green-300',
  MANTENIMIENTO: 'bg-yellow-900/50 border-yellow-700 text-yellow-300',
  DAÑADO:        'bg-red-900/50 border-red-700 text-red-300',
  BAJA:          'bg-gray-700 border-gray-600 text-slate-400',
};
const ESTADOS = ['OPERATIVO', 'MANTENIMIENTO', 'DAÑADO', 'BAJA'];

// ─── Modal PC ─────────────────────────────────────────────────────────────────

const normalizarCodigoPc = codigo => (codigo || '').trim().toUpperCase().replace(/-+/g, '-');
const codigoPcAutomatico = numero => `PC-${String(numero).padStart(2, '0')}`;

function ModalPC({ pc, pcs, labId, proximoNumero, onClose, onSave }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [form, setForm] = useState({
    activo_id: pc?.activo_id ? String(pc.activo_id) : '',
    motivo_asignacion: '',
    numero:  pc?.numero  ?? proximoNumero,
    codigo:  pc?.codigo  ?? codigoPcAutomatico(proximoNumero),
    fila:    pc?.fila    ?? '',
    specs:   pc?.specs   ?? '',
    estado:  pc?.estado  ?? 'OPERATIVO',
    activa:  pc?.activa  ?? true,
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [activos, setActivos] = useState([]);
  const [loadingActivos, setLoadingActivos] = useState(true);

  useEffect(() => {
    let mounted = true;
    const cargarActivos = async () => {
      setLoadingActivos(true);
      try {
        const { data } = await api.get(
          `/inventario/activos?laboratorio_id=${labId}&categoria=COMPUTADORA&estado_admin=VALIDADO`
        );
        if (mounted) {
          setActivos((Array.isArray(data) ? data : []).filter(
            activo => !activo.computadora_id || activo.computadora_id === pc?.id
          ));
        }
      } catch (err) {
        if (mounted) setError(getApiErrorMessage(err, 'No se pudo cargar el inventario de computadoras'));
      } finally {
        if (mounted) setLoadingActivos(false);
      }
    };
    cargarActivos();
    return () => { mounted = false; };
  }, [labId, pc?.id]);

  const activoSeleccionado = activos.find(
    activo => String(activo.id) === String(form.activo_id)
  ) || pc?.activo || null;

  const handleChange = (e) => {
    const val = e.target.name === 'numero' ? Number(e.target.value)
              : e.target.name === 'activa'  ? e.target.checked
              : e.target.value;
    setForm({ ...form, [e.target.name]: val });
    setError('');
  };

  // Auto-generar código al cambiar número
  const handleNumeroChange = (e) => {
    const num = Number(e.target.value);
    setForm(f => ({
      ...f,
      numero: num,
      codigo: !pc || /^PC-+\d+$/i.test(f.codigo)
        ? codigoPcAutomatico(num)
        : f.codigo,
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const codigoNormalizado = normalizarCodigoPc(form.codigo);
    const duplicadoNumero = pcs.some(item =>
      item.id !== pc?.id && Number(item.numero) === Number(form.numero)
    );
    const duplicadoCodigo = pcs.some(item =>
      item.id !== pc?.id && normalizarCodigoPc(item.codigo) === codigoNormalizado
    );
    if (duplicadoNumero || duplicadoCodigo) {
      setError(
        duplicadoNumero
          ? `Ya existe una PC con el número ${form.numero}`
          : `Ya existe una PC con el código ${codigoNormalizado}`
      );
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        activo_id: form.activo_id ? Number(form.activo_id) : null,
        motivo_asignacion: form.motivo_asignacion || null,
        codigo: codigoNormalizado,
      };
      if (pc) {
        await api.put(`/laboratorios/${labId}/computadoras/${pc.id}`, payload);
      } else {
        await api.post(`/laboratorios/${labId}/computadoras`, payload);
      }
      onSave();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al guardar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-md shadow-2xl rounded-2xl backdrop-blur-xl"
        style={{
          background: isDay ? '#ffffff' : 'rgba(15,23,42,0.96)',
          border: `1px solid ${isDay ? '#cbd5e1' : 'rgba(255,255,255,0.10)'}`,
        }}
      >
        <div className="px-6 py-4 border-b theme-divider flex items-center justify-between">
          <h3 className="font-semibold theme-title">{pc ? 'Editar computadora' : 'Nueva computadora'}</h3>
          <button onClick={onClose} className="theme-muted hover:text-red-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm theme-text mb-1">Número *</label>
              <input name="numero" type="number" min="1" value={form.numero} onChange={handleNumeroChange} required
                className="w-full input-dark px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm theme-text mb-1">Código *</label>
              <input name="codigo" value={form.codigo} onChange={handleChange} required
                placeholder="PC-01"
                className="w-full input-dark px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm theme-text mb-1">Fila</label>
              <input name="fila" value={form.fila} onChange={handleChange}
                placeholder="A, B, C..."
                className="w-full input-dark px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm theme-text mb-1">Estado</label>
              <SelectDark
                value={form.estado}
                onChange={v => handleChange({ target: { name: 'estado', value: v } })}
                options={ESTADOS.map(e => ({ value: e, label: e }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm theme-text mb-1">
              Equipo físico de inventario
            </label>
            <SelectDark
              value={form.activo_id}
              onChange={value => {
                setForm(current => ({ ...current, activo_id: value, motivo_asignacion: '' }));
                setError('');
              }}
              disabled={loadingActivos}
              options={[
                { value: '', label: loadingActivos ? 'Cargando activos...' : 'Sin vínculo patrimonial' },
                ...activos.map(activo => ({
                  value: String(activo.id),
                  label: `${activo.codigo_inventario} · ${activo.nombre}`,
                })),
              ]}
            />
            <p className="text-xs theme-muted mt-1">
              El puesto {form.codigo || 'PC'} conserva sesiones y horarios; el activo aporta serie, marca,
              modelo, mantenimiento y expediente patrimonial.
            </p>
          </div>
          {activoSeleccionado && (
            <div className="rounded-xl border p-3 text-sm"
              style={{
                background: isDay ? '#eff6ff' : 'rgba(59,130,246,0.10)',
                borderColor: isDay ? '#93c5fd' : 'rgba(59,130,246,0.25)',
              }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold" style={{ margin: 0, color: isDay ? '#1e3a8a' : '#bfdbfe' }}>
                    {activoSeleccionado.codigo_inventario} · {activoSeleccionado.nombre}
                  </p>
                  <p className="text-xs mt-1" style={{ marginBottom: 0, color: isDay ? '#475569' : '#94a3b8' }}>
                    {[activoSeleccionado.marca, activoSeleccionado.modelo, activoSeleccionado.numero_serie]
                      .filter(Boolean).join(' · ') || 'Sin marca, modelo o serie registrados'}
                  </p>
                </div>
                <span className="text-[10px] uppercase font-bold" style={{ color: isDay ? '#1d4ed8' : '#93c5fd' }}>Vinculado</span>
              </div>
              {pc && String(pc.activo_id || '') !== String(form.activo_id || '') && (
                <input
                  value={form.motivo_asignacion}
                  onChange={e => setForm(current => ({ ...current, motivo_asignacion: e.target.value }))}
                  placeholder="Motivo del reemplazo o asignación"
                  className="w-full input-dark mt-3 text-sm"
                />
              )}
            </div>
          )}
          {!activoSeleccionado && !loadingActivos && (
            <div className="rounded-xl border p-3"
              style={{ background: isDay ? '#fffbeb' : 'rgba(245,158,11,0.10)', borderColor: isDay ? '#f59e0b' : 'rgba(245,158,11,0.25)' }}>
              <p className="text-sm font-semibold" style={{ margin: 0, color: isDay ? '#92400e' : '#fcd34d' }}>Sin vínculo patrimonial</p>
              <p className="text-xs mt-1" style={{ marginBottom: 0, color: isDay ? '#78350f' : '#fde68a' }}>
                Podrá usarse como posición operativa, pero no tendrá serie, resguardo, mantenimiento ni expediente de inventario asociados.
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm theme-text mb-1">Notas operativas / configuración</label>
            <textarea name="specs" value={form.specs} onChange={handleChange} rows={2}
              placeholder="Software instalado, configuración del puesto, observaciones..."
              className="w-full input-dark px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          {pc && (
            <div className="rounded-xl border p-3" style={{
              background: form.activa
                ? (isDay ? '#ecfdf5' : 'rgba(6,78,59,0.20)')
                : (isDay ? '#f8fafc' : 'rgba(15,23,42,0.70)'),
              borderColor: form.activa
                ? (isDay ? '#6ee7b7' : 'rgba(4,120,87,0.40)')
                : (isDay ? '#cbd5e1' : '#334155'),
            }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{
                    margin:0,
                    color: form.activa ? (isDay ? '#065f46' : '#6ee7b7') : (isDay ? '#334155' : '#cbd5e1'),
                  }}>
                    {form.activa ? 'PC activa' : 'PC inactiva'}
                  </p>
                  <p className="text-xs mt-0.5" style={{marginBottom:0, color: isDay ? '#475569' : '#64748b'}}>
                    {form.activa
                      ? 'Aparece disponible en filtros, sesiones y reportes.'
                      : 'Se conserva en historial. Puedes reactivarla cuando vuelva a operar.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, activa: !f.activa, estado: !f.activa ? 'OPERATIVO' : f.estado }))}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    form.activa
                      ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                      : 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30'
                  }`}
                >
                  {form.activa ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                isDay ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}>
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Guardando...' : (pc && !pc.activa && form.activa ? 'Reactivar PC' : (pc ? 'Actualizar' : 'Crear'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Carga Masiva ────────────────────────────────────────────────────────

function ModalBulk({ labId, onClose, onSave }) {
  const [form, setForm] = useState({ cantidad: 25, prefijo_codigo: 'PC', filas: 5, specs: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleChange = (e) => {
    const val = ['cantidad', 'filas'].includes(e.target.name) ? Number(e.target.value) : e.target.value;
    setForm({ ...form, [e.target.name]: val });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post(`/laboratorios/${labId}/computadoras/bulk`, form);
      setResultado(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error en carga masiva'));
    } finally {
      setLoading(false);
    }
  };

  if (resultado) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="glass w-full max-w-md shadow-2xl p-6 text-center">
          <div className="w-12 h-12 bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-white font-semibold mb-1">{resultado.mensaje}</h3>
          <p className="text-slate-400 text-sm">
            {resultado.codigos.slice(0, 5).join(', ')}{resultado.codigos.length > 5 ? `... +${resultado.codigos.length - 5} más` : ''}
          </p>
          <button onClick={() => { onSave(); onClose(); }}
            className="mt-5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors">
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-md shadow-2xl rounded-2xl backdrop-blur-xl"
        style={{
          background: isDay ? '#ffffff' : 'rgba(15,23,42,0.96)',
          border: `1px solid ${isDay ? '#cbd5e1' : 'rgba(255,255,255,0.10)'}`,
        }}
      >
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">Carga masiva de PCs</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cantidad *</label>
              <input name="cantidad" type="number" min="1" max="100" value={form.cantidad} onChange={handleChange}
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Prefijo código *</label>
              <input name="prefijo_codigo" value={form.prefijo_codigo} onChange={handleChange} required
                placeholder="PC, LAB1"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Número de filas (opcional)</label>
            <input name="filas" type="number" min="1" max="20" value={form.filas} onChange={handleChange}
              className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-slate-500 mt-1">Para asignar letra de fila (A, B, C...) automáticamente</p>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Especificaciones (opcional)</label>
            <input name="specs" value={form.specs} onChange={handleChange}
              placeholder="Intel Core i5, 8GB RAM..."
              className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-sm text-slate-400">
            Se crearán: <strong className="text-white">{form.prefijo_codigo.replace(/-+$/,'')}-01</strong> al{' '}
            <strong className="text-white">{form.prefijo_codigo.replace(/-+$/,'')}-{String(form.cantidad).padStart(2,'0')}</strong>
          </div>
          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Creando...' : `Crear ${form.cantidad} PCs`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

// ─── Config visual por estado ──────────────────────────────────────────────────
const PC_CFG = {
  OPERATIVO:     { bg:'rgba(3,17,9,0.88)',   border:'rgba(22,101,52,0.5)',   dot:'#4ade80', label:'Operativa',  icon:null   },
  MANTENIMIENTO: { bg:'rgba(45,28,0,0.92)',  border:'rgba(217,119,6,0.75)',  dot:'#fbbf24', label:'Mant.',      icon:'🔧'   },
  DAÑADO:        { bg:'rgba(50,10,10,0.92)', border:'rgba(220,38,38,0.65)',  dot:'#f87171', label:'Dañada',     icon:'⚠️'  },
  BAJA:          { bg:'rgba(15,23,42,0.55)', border:'rgba(51,65,85,0.4)',    dot:'#475569', label:'Baja',       icon:'🚫'   },
};

// ─── Tarjeta PC administrativa ─────────────────────────────────────────────────
function TarjetaPCAdmin({ pc, onClick }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const cfg = PC_CFG[pc.estado] || PC_CFG.OPERATIVO;
  const inactiva = !pc.activa;
  const dayStyle = {
    OPERATIVO: { bg:'#ecfdf5', border:'#34d399', text:'#064e3b', badge:'#d1fae5', badgeText:'#047857' },
    MANTENIMIENTO: { bg:'#fffbeb', border:'#f59e0b', text:'#78350f', badge:'#fef3c7', badgeText:'#92400e' },
    DAÑADO: { bg:'#fef2f2', border:'#ef4444', text:'#7f1d1d', badge:'#fee2e2', badgeText:'#991b1b' },
    BAJA: { bg:'#f1f5f9', border:'#94a3b8', text:'#334155', badge:'#e2e8f0', badgeText:'#475569' },
  }[pc.estado] || { bg:'#ecfdf5', border:'#34d399', text:'#064e3b', badge:'#d1fae5', badgeText:'#047857' };
  return (
    <button onClick={onClick}
      style={{
        background: isDay
          ? (inactiva ? '#f1f5f9' : dayStyle.bg)
          : (inactiva ? 'rgba(15,23,42,0.45)' : cfg.bg),
        border: `1.5px solid ${isDay
          ? (inactiva ? '#cbd5e1' : dayStyle.border)
          : (inactiva ? 'rgba(51,65,85,0.35)' : cfg.border)}`,
        borderRadius: '0.875rem',
        padding: '10px 10px 8px',
        minWidth: 96,
        textAlign: 'center',
        cursor: 'pointer',
        opacity: inactiva ? 0.5 : 1,
        transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 6px 20px ${cfg.border}55`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
      }}>
      {/* Icono de estado especial */}
      {cfg.icon && (
        <p style={{fontSize:13, margin:'0 0 2px', lineHeight:1}}>{cfg.icon}</p>
      )}
      {/* Código limpio (sin doble guion) */}
      <p style={{fontSize:11, fontWeight:800, color:isDay ? dayStyle.text : '#f1f5f9', letterSpacing:'0.04em', margin:0}}>
        {pc.codigo.replace('--', '-')}
      </p>
      <p style={{
        fontSize:8, fontWeight:700, margin:'3px 0 0',
        color: pc.activo_id ? (isDay ? '#1d4ed8' : '#60a5fa') : (isDay ? '#475569' : '#94a3b8'),
      }}>
        {pc.activo_id ? '● Inventariado' : '○ Sin inventario'}
      </p>
      {/* Badge estado — alto contraste */}
      <div style={{
        display:'inline-flex', alignItems:'center', gap:4,
        marginTop:6, padding:'2px 8px', borderRadius:20,
        background: isDay ? (inactiva ? '#e2e8f0' : dayStyle.badge)
          : inactiva ? 'rgba(71,85,105,0.2)'
          : pc.estado === 'OPERATIVO' ? 'rgba(16,185,129,0.15)'
          : pc.estado === 'MANTENIMIENTO' ? 'rgba(245,158,11,0.18)'
          : pc.estado === 'DAÑADO' ? 'rgba(239,68,68,0.15)'
          : 'rgba(71,85,105,0.15)',
      }}>
        <span style={{width:5, height:5, borderRadius:'50%', flexShrink:0,
          background: inactiva ? '#64748b' : cfg.dot}}/>
        <span style={{fontSize:9, fontWeight:700,
          color: isDay ? (inactiva ? '#475569' : dayStyle.badgeText)
            : inactiva ? '#94a3b8'
            : pc.estado === 'OPERATIVO' ? '#6ee7b7'
            : pc.estado === 'MANTENIMIENTO' ? '#fcd34d'
            : pc.estado === 'DAÑADO' ? '#fca5a5'
            : '#94a3b8'}}>
          {inactiva ? 'Inactiva' : cfg.label}
        </span>
      </div>
    </button>
  );
}

// ─── Panel de detalle administrativo ──────────────────────────────────────────
function PanelAdminPC({ pc, labId, onClose, onEditar, canEdit }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const cfg = PC_CFG[pc.estado] || PC_CFG.OPERATIVO;
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoadingHistorial(true);
    api.get(`/laboratorios/${labId}/computadoras/${pc.id}/historial-activos`)
      .then(({ data }) => {
        if (mounted) setHistorial(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (mounted) setHistorial([]);
      })
      .finally(() => {
        if (mounted) setLoadingHistorial(false);
      });
    return () => { mounted = false; };
  }, [labId, pc.id]);

  const fechaCorta = value => value
    ? new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <div style={{display:'flex', flexDirection:'column'}}>
      {/* Header */}
      <div style={{
        padding:'1rem 1.25rem 0.875rem',
        borderBottom:`1px solid ${isDay ? '#e2e8f0' : 'rgba(255,255,255,0.07)'}`,
        display:'flex', alignItems:'flex-start', justifyContent:'space-between',
      }}>
        <div>
          <p style={{fontSize:10, fontWeight:700, color:isDay ? '#64748b' : '#475569', textTransform:'uppercase',
            letterSpacing:'0.14em', margin:'0 0 4px'}}>Computadora</p>
          <p style={{fontSize:22, fontWeight:800, color:isDay ? '#0f172a' : '#f1f5f9', margin:0}}>{pc.codigo}</p>
          {pc.fila && <p style={{fontSize:11, color:isDay ? '#64748b' : '#475569', margin:'2px 0 0'}}>Fila {pc.fila} · #{pc.numero}</p>}
        </div>
        <button onClick={onClose}
          style={{background:'none', border:'none', cursor:'pointer', color:isDay ? '#475569' : '#64748b', padding:4, borderRadius:8}}
          className="hover:text-white transition-colors">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Cuerpo */}
      <div style={{padding:'1rem 1.25rem'}}>
        {/* Badge estado */}
        <div style={{
          display:'inline-flex', alignItems:'center', gap:6,
          background:`${cfg.dot}15`, border:`1px solid ${cfg.dot}33`,
          borderRadius:20, padding:'5px 12px', marginBottom:16,
        }}>
          <span style={{width:7, height:7, borderRadius:'50%', background:cfg.dot,
            boxShadow:`0 0 6px ${cfg.dot}88`}}/>
          <span style={{fontSize:12, fontWeight:600, color:cfg.dot}}>{cfg.label}</span>
          {!pc.activa && <span style={{fontSize:11, color:'#475569', marginLeft:4}}>· Inactiva</span>}
        </div>

        {/* Vínculo patrimonial */}
        <div style={{
          background: pc.activo
            ? (isDay ? '#eff6ff' : 'rgba(37,99,235,0.10)')
            : (isDay ? '#fffbeb' : 'rgba(245,158,11,0.08)'),
          border: `1px solid ${pc.activo
            ? (isDay ? '#93c5fd' : 'rgba(59,130,246,0.28)')
            : (isDay ? '#f59e0b' : 'rgba(245,158,11,0.24)')}`,
          borderRadius:'0.875rem', padding:'0.75rem 1rem', marginBottom:14,
        }}>
          <p style={{fontSize:10, fontWeight:700, color:pc.activo ? (isDay ? '#1d4ed8' : '#60a5fa') : (isDay ? '#92400e' : '#f59e0b'),
            textTransform:'uppercase', letterSpacing:'0.12em', margin:'0 0 5px'}}>
            Equipo físico
          </p>
          {pc.activo ? (
            <>
              <p style={{fontSize:13, fontWeight:700, color:isDay ? '#1e293b' : '#e2e8f0', margin:0}}>
                {pc.activo.codigo_inventario} · {pc.activo.nombre}
              </p>
              <p style={{fontSize:11, color:isDay ? '#475569' : '#94a3b8', margin:'4px 0 0', lineHeight:1.5}}>
                {[pc.activo.marca, pc.activo.modelo, pc.activo.numero_serie]
                  .filter(Boolean).join(' · ') || 'Sin datos técnicos registrados'}
              </p>
              {pc.activo.numero_oficial && (
                <p style={{fontSize:10, color:isDay ? '#475569' : '#64748b', margin:'3px 0 0'}}>
                  Patrimonial: {pc.activo.numero_oficial}
                </p>
              )}
            </>
          ) : (
            <p style={{fontSize:12, color:isDay ? '#78350f' : '#fbbf24', margin:0}}>
              Este puesto aún no está vinculado con un activo de inventario.
            </p>
          )}
        </div>

        {/* Specs */}
        {pc.specs && (
          <div style={{
            background:isDay ? '#f8fafc' : 'rgba(30,41,59,0.5)',
            border:`1px solid ${isDay ? '#cbd5e1' : 'rgba(255,255,255,0.07)'}`,
            borderRadius:'0.875rem', padding:'0.75rem 1rem', marginBottom:14,
          }}>
            <p style={{fontSize:10, fontWeight:700, color:isDay ? '#475569' : '#64748b', textTransform:'uppercase',
              letterSpacing:'0.12em', margin:'0 0 5px'}}>Notas operativas</p>
            <p style={{fontSize:12, color:isDay ? '#334155' : '#94a3b8', margin:0, lineHeight:1.5}}>{pc.specs}</p>
          </div>
        )}

        <div style={{marginBottom:16}}>
          <p style={{fontSize:10, fontWeight:700, color:isDay ? '#475569' : '#64748b', textTransform:'uppercase',
            letterSpacing:'0.12em', margin:'0 0 8px'}}>Historial de equipos</p>
          {loadingHistorial ? (
            <p style={{fontSize:11, color:isDay ? '#475569' : '#64748b', margin:0}}>Cargando historial...</p>
          ) : historial.length === 0 ? (
            <p style={{fontSize:11, color:isDay ? '#475569' : '#64748b', margin:0}}>Sin asignaciones patrimoniales registradas.</p>
          ) : (
            <div style={{display:'flex', flexDirection:'column', gap:7}}>
              {historial.map(item => (
                <div key={item.id} style={{
                  borderLeft:`2px solid ${item.fecha_fin ? (isDay ? '#94a3b8' : '#475569') : '#3b82f6'}`,
                  paddingLeft:9,
                }}>
                  <p style={{fontSize:11, fontWeight:700, color:item.fecha_fin ? (isDay ? '#475569' : '#94a3b8') : (isDay ? '#1e3a8a' : '#bfdbfe'), margin:0}}>
                    {item.codigo_inventario} · {item.nombre}
                  </p>
                  <p style={{fontSize:10, color:isDay ? '#64748b' : '#64748b', margin:'2px 0 0'}}>
                    {fechaCorta(item.fecha_inicio)}
                    {item.fecha_fin ? ` a ${fechaCorta(item.fecha_fin)}` : ' · Asignación actual'}
                  </p>
                  {item.motivo && (
                    <p style={{fontSize:10, color:isDay ? '#475569' : '#64748b', margin:'2px 0 0'}}>{item.motivo}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acciones */}
        {canEdit && <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <button onClick={() => onEditar(pc)}
            style={{
              width:'100%', padding:'11px 16px', borderRadius:'0.75rem', border:'none',
              background:isDay ? '#dbeafe' : 'rgba(59,130,246,0.15)',
              color:isDay ? '#1e3a8a' : '#93c5fd',
              border:`1px solid ${isDay ? '#93c5fd' : 'rgba(59,130,246,0.30)'}`,
              fontSize:13, fontWeight:600, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Editar PC
          </button>
        </div>}
      </div>
    </div>
  );
}

// ─── Modal Carga Masiva ────────────────────────────────────────────────────────
function ModalCargaMasiva({ labId, onClose, onSave }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [cantidad, setCantidad] = useState(10);
  const [prefijoCodigo, setPrefijoCodigo] = useState('PC');
  const [filas, setFilas] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post(`/laboratorios/${labId}/computadoras/bulk`, {
        cantidad: Number(cantidad),
        prefijo_codigo: prefijoCodigo.trim() || 'PC',
        filas: filas ? Number(filas) : null,
      });
      onSave();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al crear PCs'));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b theme-divider flex items-center justify-between">
          <h3 className="font-semibold theme-title">Carga masiva de PCs</h3>
          <button onClick={onClose} className="theme-muted hover:text-red-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm theme-text mb-1">Cantidad de PCs *</label>
            <input type="number" min="1" max="100" value={cantidad}
              onChange={e => setCantidad(e.target.value)} required
              className="w-full input-dark"/>
          </div>
          <div>
            <label className="block text-sm theme-text mb-1">Prefijo de codigo *</label>
            <input type="text" value={prefijoCodigo} onChange={e => setPrefijoCodigo(e.target.value)}
              required maxLength={10}
              placeholder="PC"
              className="w-full input-dark"/>
            <p className="text-xs theme-muted mt-1">Se generaran codigos como {(prefijoCodigo || 'PC').replace(/-+$/,'')}-01.</p>
          </div>
          <div>
            <label className="block text-sm theme-text mb-1">
              Numero de filas
            </label>
            <input type="number" min="1" max="20" value={filas} onChange={e => setFilas(e.target.value)}
              required
              className="w-full input-dark"/>
            <p className="text-xs theme-muted mt-1">Las PCs se distribuirán equitativamente entre las filas</p>
          </div>
          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-blue flex-1">
              {loading ? 'Creando…' : `Crear ${cantidad} PCs`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LaboratorioAdministrativo({ lab, inventarioCount, onIrInventario }) {
  const activosTexto = inventarioCount === 1 ? '1 activo asociado' : `${inventarioCount} activos asociados`;

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl p-5"
        style={{
          background: 'rgba(15,23,42,0.62)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400" style={{ margin: 0 }}>
              {categoriaLabel(lab?.categoria)}
            </p>
            <h2 className="text-xl font-bold text-white mt-2" style={{ marginBottom: 0 }}>
              Administración del laboratorio
            </h2>
            <p className="text-sm text-slate-400 mt-1" style={{ marginBottom: 0 }}>
              Inventario, resguardo, ubicación y control administrativo del espacio.
            </p>
          </div>
          <button
            onClick={onIrInventario}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: 'linear-gradient(135deg,#2563eb,#38bdf8)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20 13V7a2 2 0 00-2-2h-3.5M4 13V7a2 2 0 012-2h3.5m5 14H18a2 2 0 002-2v-3M4 14v3a2 2 0 002 2h3.5M9 5l3-3 3 3M9 19l3 3 3-3" />
            </svg>
            Abrir inventario
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
          {[
            { label: 'Capacidad', value: `${lab?.capacidad || 0}`, sub: capacidadUnidad(lab?.categoria) },
            { label: 'Inventario', value: inventarioCount, sub: activosTexto },
            { label: 'Estado', value: lab?.activo ? 'Activo' : 'Inactivo', sub: lab?.ubicacion ? toTitleCase(lab.ubicacion) : 'Sin ubicación' },
          ].map(item => (
            <div key={item.label} className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs text-slate-500" style={{ margin: 0 }}>{item.label}</p>
              <p className="text-2xl font-bold text-white mt-1" style={{ marginBottom: 0 }}>{item.value}</p>
              <p className="text-xs text-slate-400 mt-0.5" style={{ marginBottom: 0 }}>{item.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: 'rgba(30,41,59,0.44)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 className="text-sm font-semibold text-white" style={{ margin: 0 }}>Funciones disponibles</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {[
            { title: 'Alta de activos', text: 'Registra mobiliario, material, herramientas o equipo especializado.' },
            { title: 'Movimientos', text: 'Controla cambios de ubicación, resguardante, mantenimiento y bajas.' },
            { title: 'Levantamientos', text: 'Valida inventarios físicos por laboratorio cuando corresponda.' },
          ].map(item => (
            <div key={item.title} className="rounded-lg p-4" style={{ background: 'rgba(15,23,42,0.45)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-semibold text-white" style={{ margin: 0 }}>{item.title}</p>
              <p className="text-xs text-slate-400 mt-1.5" style={{ marginBottom: 0 }}>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


export default function LaboratorioDetalle() {
  const { labId } = useParams();
  const navigate  = useNavigate();
  const { usuario } = useAuth();
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const { toast: showToast } = useToast();
  const puedeGestionarPcs = ['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB'].includes(usuario?.rol);
  const puedeCargaMasiva = ['SUPER_ADMIN', 'LAB_ADMIN'].includes(usuario?.rol);
  const [lab, setLab]         = useState(null);
  const [pcs, setPcs]         = useState([]);
  const [inventarioCount, setInventarioCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pcEditar, setPcEditar]   = useState(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalBulk, setModalBulk]  = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [selectedPc, setSelectedPc]       = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const rLab = await api.get(`/laboratorios/${labId}`);
      setLab(rLab.data);

      if (esLabComputo(rLab.data?.categoria)) {
        const rPcs = await api.get(`/laboratorios/${labId}/computadoras`);
        setPcs(rPcs.data);
        setInventarioCount(0);
      } else {
        setPcs([]);
        try {
          const rInv = await api.get(`/inventario/activos?laboratorio_id=${labId}`);
          setInventarioCount(Array.isArray(rInv.data) ? rInv.data.length : 0);
        } catch {
          setInventarioCount(0);
        }
      }
    } catch (err) {
      if (err.response?.status === 403) {
        showToast('No tienes acceso a ese laboratorio.', 'warning');
      } else {
        showToast('No se pudo cargar el laboratorio solicitado.', 'error');
      }
      navigate('/admin/laboratorios');
    } finally {
      setLoading(false);
    }
  }, [labId, navigate, showToast]);

  useEffect(() => { cargar(); }, [cargar]);

  const pcsFiltradas = filtroEstado === 'TODOS'
    ? pcs
    : filtroEstado === 'INACTIVAS'
    ? pcs.filter(p => !p.activa)
    : pcs.filter(p => p.estado === filtroEstado && p.activa);

  const proximoNumero = pcs.length > 0 ? Math.max(...pcs.map(p => p.numero)) + 1 : 1;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-24">
          <svg className="animate-spin w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      </AdminLayout>
    );
  }

  const labComputo = esLabComputo(lab?.categoria);

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm theme-muted mb-5">
        <button onClick={() => navigate('/admin/laboratorios')} className="hover:text-blue-600 transition-colors">
          Laboratorios
        </button>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="theme-title">{lab?.nombre}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold theme-title">{toTitleCase(lab?.nombre)}</h1>
          <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>
            {lab?.ubicacion && `${toTitleCase(lab.ubicacion)} · `}
            {labComputo
              ? `${pcs.filter(p => p.activa).length} activas de ${pcs.length} PCs registradas`
              : `Capacidad: ${lab?.capacidad || 0} ${capacidadUnidad(lab?.categoria)}`}
          </p>
        </div>
        {labComputo && puedeGestionarPcs && (
        <div className="flex gap-2">
          {puedeCargaMasiva && (
            <button onClick={() => setModalBulk(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'transparent', border: '1.5px solid #059669', color: '#10b981' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(5,150,105,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Carga masiva
            </button>
          )}
          <button onClick={() => setModalCrear(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(135deg,#047857,#059669)'}
            onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg,#059669,#10b981)'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva PC
          </button>
        </div>
        )}
      </div>

      {!labComputo ? (
        <LaboratorioAdministrativo
          lab={lab}
          inventarioCount={inventarioCount}
          onIrInventario={() => navigate(`/admin/inventario?laboratorio_id=${labId}&categoria_lab=${encodeURIComponent(lab?.categoria || '')}`)}
        />
      ) : (
        <>
      {/* Leyenda de estados */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {[
            { id:'TODOS',       label:'Todas',      count: pcs.length },
            { id:'OPERATIVO',   label:'Operativas', count: pcs.filter(p=>p.estado==='OPERATIVO'&&p.activa).length },
            { id:'MANTENIMIENTO',label:'Mant.',     count: pcs.filter(p=>p.estado==='MANTENIMIENTO'&&p.activa).length },
            { id:'DAÑADO',      label:'Dañadas',    count: pcs.filter(p=>p.estado==='DAÑADO'&&p.activa).length },
            { id:'BAJA',        label:'Baja',       count: pcs.filter(p=>p.estado==='BAJA'&&p.activa).length },
            { id:'INACTIVAS',   label:'Inactivas',  count: pcs.filter(p=>!p.activa).length },
          ].map(f => (
          <button key={f.id}
            onClick={() => setFiltroEstado(f.id)}
            style={{
              padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600,
              transition:'all 0.15s', border:'1px solid',
              background: filtroEstado===f.id
                ? '#2563eb'
                : (isDay ? '#ffffff' : 'rgba(255,255,255,0.05)'),
              borderColor: filtroEstado===f.id
                ? '#3b82f6'
                : (isDay ? '#cbd5e1' : 'rgba(255,255,255,0.09)'),
              color: filtroEstado===f.id ? '#fff' : (isDay ? '#334155' : '#64748b'),
            }}>
            {f.label} {f.count}
          </button>
        ))}
      </div>

      {/* Grid de PCs */}
      {pcsFiltradas.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p>{pcs.length === 0 ? 'No hay PCs registradas en este laboratorio' : 'No hay PCs con ese filtro'}</p>
          {pcs.length === 0 && puedeGestionarPcs && (
            <button
              onClick={() => puedeCargaMasiva ? setModalBulk(true) : setModalCrear(true)}
              className="mt-3 text-blue-400 hover:text-blue-300 text-sm underline"
            >
              {puedeCargaMasiva ? 'Hacer carga masiva' : 'Registrar la primera PC'}
            </button>
          )}
        </div>
      ) : (
        /* ── Grid de PCs agrupado por fila ── */
        (() => {
          const filas = {};
          pcsFiltradas.forEach(pc => {
            const fila = pc.fila || '—';
            if (!filas[fila]) filas[fila] = [];
            filas[fila].push(pc);
          });
          const filasOrd = Object.keys(filas).sort();
          return (
            <div className="space-y-6">
              {filasOrd.map(fila => (
                <div key={fila}>
                  {fila !== '—' && (
                    <p style={{fontSize:10, fontWeight:700, letterSpacing:'0.16em',
                      textTransform:'uppercase', color:isDay ? '#475569' : '#64748b', margin:'0 0 10px',
                      paddingBottom:6, borderBottom:`1px solid ${isDay ? '#e2e8f0' : 'rgba(255,255,255,0.05)'}`}}>
                      Fila {fila}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {filas[fila].sort((a,b)=>a.numero-b.numero).map(pc => (
                      <TarjetaPCAdmin key={pc.id} pc={pc}
                        onClick={() => setSelectedPc(pc)}/>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      )}

      {/* Panel detalle PC — desktop */}
      {selectedPc && (
        <aside className="hidden lg:block fixed top-0 right-0 h-full w-80 z-30 overflow-auto"
               style={{background:isDay ? '#ffffff' : 'rgba(6,10,24,0.97)', borderLeft:`1px solid ${isDay ? '#cbd5e1' : 'rgba(255,255,255,0.08)'}`,
                 boxShadow:'-8px 0 32px rgba(0,0,0,0.4)'}}>
          <PanelAdminPC pc={selectedPc} labId={labId}
            onClose={() => setSelectedPc(null)}
            canEdit={puedeGestionarPcs}
            onEditar={(pc) => { setSelectedPc(null); setPcEditar(pc); }}/>
        </aside>
      )}

      {/* Bottom sheet móvil */}
      {selectedPc && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={() => setSelectedPc(null)}/>
          <div className="relative rounded-t-2xl overflow-hidden"
               style={{background:isDay ? '#ffffff' : '#0a1020', border:`1px solid ${isDay ? '#cbd5e1' : 'rgba(255,255,255,0.08)'}`,
                 maxHeight:'75vh', overflowY:'auto'}}>
            <div className="flex justify-center pt-3 pb-1">
              <div style={{width:36, height:4, borderRadius:99, background:isDay ? '#cbd5e1' : 'rgba(255,255,255,0.15)'}}/>
            </div>
            <PanelAdminPC pc={selectedPc} labId={labId}
              onClose={() => setSelectedPc(null)}
              canEdit={puedeGestionarPcs}
              onEditar={(pc) => { setSelectedPc(null); setPcEditar(pc); }}/>
          </div>
        </div>
      )}

      {/* Modales */}
      {puedeGestionarPcs && (pcEditar || modalCrear) && (
        <ModalPC
          pc={pcEditar || null}
          pcs={pcs}
          labId={labId}
          proximoNumero={proximoNumero}
          onClose={() => { setPcEditar(null); setModalCrear(false); }}
          onSave={() => { setPcEditar(null); setModalCrear(false); cargar(); }}
        />
      )}
      {puedeCargaMasiva && modalBulk && (
        <ModalCargaMasiva
          labId={labId}
          onClose={() => setModalBulk(false)}
          onSave={() => { setModalBulk(false); cargar(); }}
        />
      )}
        </>
      )}
    </AdminLayout>
  );
}
