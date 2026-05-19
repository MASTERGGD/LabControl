import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';

const ESTADO_COLOR = {
  OPERATIVO:     'bg-green-900/50 border-green-700 text-green-300',
  MANTENIMIENTO: 'bg-yellow-900/50 border-yellow-700 text-yellow-300',
  DAÑADO:        'bg-red-900/50 border-red-700 text-red-300',
  BAJA:          'bg-gray-700 border-gray-600 text-slate-400',
};
const ESTADOS = ['OPERATIVO', 'MANTENIMIENTO', 'DAÑADO', 'BAJA'];

// ─── Modal PC ─────────────────────────────────────────────────────────────────

function ModalPC({ pc, labId, proximoNumero, onClose, onSave }) {
  const [form, setForm] = useState({
    numero:  pc?.numero  ?? proximoNumero,
    codigo:  pc?.codigo  ?? '',
    fila:    pc?.fila    ?? '',
    specs:   pc?.specs   ?? '',
    estado:  pc?.estado  ?? 'OPERATIVO',
    activa:  pc?.activa  ?? true,
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

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
    setForm(f => ({ ...f, numero: num, codigo: f.codigo || `PC-${String(num).padStart(2,'0')}` }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (pc) {
        await api.put(`/laboratorios/${labId}/computadoras/${pc.id}`, form);
      } else {
        await api.post(`/laboratorios/${labId}/computadoras`, form);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">{pc ? 'Editar computadora' : 'Nueva computadora'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Número *</label>
              <input name="numero" type="number" min="1" value={form.numero} onChange={handleNumeroChange} required
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Código *</label>
              <input name="codigo" value={form.codigo} onChange={handleChange} required
                placeholder="PC-01"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fila</label>
              <input name="fila" value={form.fila} onChange={handleChange}
                placeholder="A, B, C..."
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Estado</label>
              <SelectDark
                value={form.estado}
                onChange={v => handleChange({ target: { name: 'estado', value: v } })}
                options={ESTADOS.map(e => ({ value: e, label: e }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Especificaciones</label>
            <textarea name="specs" value={form.specs} onChange={handleChange} rows={2}
              placeholder="Intel Core i5, 8GB RAM, 256GB SSD..."
              className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          {pc && (
            <div className={`rounded-xl border p-3 ${form.activa ? 'bg-emerald-950/20 border-emerald-700/40' : 'bg-slate-900/70 border-slate-700'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-sm font-semibold ${form.activa ? 'text-emerald-300' : 'text-slate-300'}`} style={{margin:0}}>
                    {form.activa ? 'PC activa' : 'PC inactiva'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5" style={{marginBottom:0}}>
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
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
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
      setError(err.response?.data?.detail || 'Error en carga masiva');
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
      <div className="glass w-full max-w-md shadow-2xl">
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
  const cfg = PC_CFG[pc.estado] || PC_CFG.OPERATIVO;
  const inactiva = !pc.activa;
  return (
    <button onClick={onClick}
      style={{
        background: inactiva ? 'rgba(15,23,42,0.45)' : cfg.bg,
        border: `1.5px solid ${inactiva ? 'rgba(51,65,85,0.35)' : cfg.border}`,
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
        <p style={{fontSize:14, margin:'0 0 2px', lineHeight:1}}>{cfg.icon}</p>
      )}
      {/* Código */}
      <p style={{fontSize:11, fontWeight:800, color:'#f1f5f9', letterSpacing:'0.04em', margin:0}}>
        {pc.codigo}
      </p>
      {/* Fila */}
      {pc.fila && (
        <p style={{fontSize:9, color:'#475569', margin:'2px 0 0'}}>Fila {pc.fila}</p>
      )}
      {/* Badge estado */}
      <div style={{
        display:'inline-flex', alignItems:'center', gap:4,
        marginTop:5, padding:'2px 7px', borderRadius:20,
        background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{width:5, height:5, borderRadius:'50%', background: inactiva ? '#475569' : cfg.dot, flexShrink:0}}/>
        <span style={{fontSize:9, fontWeight:600, color: inactiva ? '#475569' : cfg.dot}}>
          {inactiva ? 'Inactiva' : cfg.label}
        </span>
      </div>
    </button>
  );
}

// ─── Panel de detalle administrativo ──────────────────────────────────────────
function PanelAdminPC({ pc, onClose, onEditar }) {
  const cfg = PC_CFG[pc.estado] || PC_CFG.OPERATIVO;
  return (
    <div style={{display:'flex', flexDirection:'column'}}>
      {/* Header */}
      <div style={{
        padding:'1rem 1.25rem 0.875rem',
        borderBottom:'1px solid rgba(255,255,255,0.07)',
        display:'flex', alignItems:'flex-start', justifyContent:'space-between',
      }}>
        <div>
          <p style={{fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase',
            letterSpacing:'0.14em', margin:'0 0 4px'}}>Computadora</p>
          <p style={{fontSize:22, fontWeight:800, color:'#f1f5f9', margin:0}}>{pc.codigo}</p>
          {pc.fila && <p style={{fontSize:11, color:'#475569', margin:'2px 0 0'}}>Fila {pc.fila} · #{pc.numero}</p>}
        </div>
        <button onClick={onClose}
          style={{background:'none', border:'none', cursor:'pointer', color:'#475569', padding:4, borderRadius:8}}
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

        {/* Specs */}
        {pc.specs && (
          <div style={{
            background:'rgba(30,41,59,0.5)', border:'1px solid rgba(255,255,255,0.07)',
            borderRadius:'0.875rem', padding:'0.75rem 1rem', marginBottom:14,
          }}>
            <p style={{fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase',
              letterSpacing:'0.12em', margin:'0 0 5px'}}>Especificaciones</p>
            <p style={{fontSize:12, color:'#94a3b8', margin:0, lineHeight:1.5}}>{pc.specs}</p>
          </div>
        )}

        {/* Acciones */}
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <button onClick={() => onEditar(pc)}
            style={{
              width:'100%', padding:'11px 16px', borderRadius:'0.75rem', border:'none',
              background:'rgba(59,130,246,0.15)', color:'#93c5fd',
              border:'1px solid rgba(59,130,246,0.30)',
              fontSize:13, fontWeight:600, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Editar PC
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Carga Masiva ────────────────────────────────────────────────────────
function ModalCargaMasiva({ labId, onClose, onSave }) {
  const [cantidad, setCantidad] = useState(10);
  const [prefijoFila, setPrefijoFila] = useState('');
  const [filas, setFilas] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post(`/laboratorios/${labId}/computadoras/bulk`, {
        cantidad: Number(cantidad),
        prefijo_fila: prefijoFila || null,
        filas: filas ? filas.split(',').map(f => f.trim().toUpperCase()).filter(Boolean) : null,
      });
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear PCs');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">Carga masiva de PCs</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Cantidad de PCs *</label>
            <input type="number" min="1" max="100" value={cantidad}
              onChange={e => setCantidad(e.target.value)} required
              className="w-full input-dark"/>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Filas <span className="text-slate-600">(separadas por coma, ej: A,B,C)</span>
            </label>
            <input type="text" value={filas} onChange={e => setFilas(e.target.value)}
              placeholder="A, B, C"
              className="w-full input-dark"/>
            <p className="text-xs text-slate-500 mt-1">Las PCs se distribuirán equitativamente entre las filas</p>
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


export default function LaboratorioDetalle() {
  const { labId } = useParams();
  const navigate  = useNavigate();
  const [lab, setLab]         = useState(null);
  const [pcs, setPcs]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [pcEditar, setPcEditar]   = useState(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalBulk, setModalBulk]  = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [selectedPc, setSelectedPc]       = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [rLab, rPcs] = await Promise.all([
        api.get(`/laboratorios/${labId}`),
        api.get(`/laboratorios/${labId}/computadoras`),
      ]);
      setLab(rLab.data);
      setPcs(rPcs.data);
    } catch {
      navigate('/admin/laboratorios');
    } finally {
      setLoading(false);
    }
  }, [labId, navigate]);

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

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-5">
        <button onClick={() => navigate('/admin/laboratorios')} className="hover:text-white transition-colors">
          Laboratorios
        </button>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-white">{lab?.nombre}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{lab?.nombre}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {lab?.ubicacion && `${lab.ubicacion} · `}
            {pcs.filter(p => p.activa).length} activas de {pcs.length} PCs registradas
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModalBulk(true)}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Carga masiva
          </button>
          <button onClick={() => setModalCrear(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva PC
          </button>
        </div>
      </div>

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
              background: filtroEstado===f.id ? '#2563eb' : 'rgba(255,255,255,0.05)',
              borderColor: filtroEstado===f.id ? '#3b82f6' : 'rgba(255,255,255,0.09)',
              color: filtroEstado===f.id ? '#fff' : '#64748b',
            }}>
            {f.label} {f.count}
          </button>
        ))}
      </div>

      {/* Grid de PCs */}
      {pcsFiltradas.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p>{pcs.length === 0 ? 'No hay PCs registradas en este laboratorio' : 'No hay PCs con ese filtro'}</p>
          {pcs.length === 0 && (
            <button onClick={() => setModalBulk(true)} className="mt-3 text-blue-400 hover:text-blue-300 text-sm underline">
              Hacer carga masiva
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
                      textTransform:'uppercase', color:'#334155', margin:'0 0 10px',
                      paddingBottom:6, borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
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
               style={{background:'rgba(6,10,24,0.97)', borderLeft:'1px solid rgba(255,255,255,0.08)',
                 boxShadow:'-8px 0 32px rgba(0,0,0,0.4)'}}>
          <PanelAdminPC pc={selectedPc}
            onClose={() => setSelectedPc(null)}
            onEditar={(pc) => { setSelectedPc(null); setPcEditar(pc); }}/>
        </aside>
      )}

      {/* Bottom sheet móvil */}
      {selectedPc && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={() => setSelectedPc(null)}/>
          <div className="relative rounded-t-2xl overflow-hidden"
               style={{background:'#0a1020', border:'1px solid rgba(255,255,255,0.08)',
                 maxHeight:'75vh', overflowY:'auto'}}>
            <div className="flex justify-center pt-3 pb-1">
              <div style={{width:36, height:4, borderRadius:99, background:'rgba(255,255,255,0.15)'}}/>
            </div>
            <PanelAdminPC pc={selectedPc}
              onClose={() => setSelectedPc(null)}
              onEditar={(pc) => { setSelectedPc(null); setPcEditar(pc); }}/>
          </div>
        </div>
      )}

      {/* Modales */}
      {(pcEditar || modalCrear) && (
        <ModalPC
          pc={pcEditar || null}
          labId={labId}
          proximoNumero={proximoNumero}
          onClose={() => { setPcEditar(null); setModalCrear(false); }}
          onSave={() => { setPcEditar(null); setModalCrear(false); cargar(); }}
        />
      )}
      {modalBulk && (
        <ModalCargaMasiva
          labId={labId}
          onClose={() => setModalBulk(false)}
          onSave={() => { setModalBulk(false); cargar(); }}
        />
      )}
    </AdminLayout>
  );
}
