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
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" name="activa" checked={form.activa} onChange={handleChange}
                className="w-4 h-4 rounded accent-blue-600" />
              Computadora activa
            </label>
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
              {loading ? 'Guardando...' : (pc ? 'Actualizar' : 'Crear')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Carga Masiva ────────────────────────────────────────────────────────

function ModalBulk({ labId, onClose, onSave }) {
  const [form, setForm] = useState({ cantidad: 25, prefijo_codigo: 'PC-', filas: 5, specs: '' });
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
                placeholder="PC-, LAB1-"
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
            Se crearán: <strong className="text-white">{form.prefijo_codigo}01</strong> al{' '}
            <strong className="text-white">{form.prefijo_codigo}{String(form.cantidad).padStart(2,'0')}</strong>
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
        {['TODOS', ...ESTADOS, 'INACTIVAS'].map(e => (
          <button key={e}
            onClick={() => setFiltroEstado(e)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border
              ${filtroEstado === e ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-slate-400 hover:text-white'}`}>
            {e === 'TODOS' ? `Todas (${pcs.length})` : e === 'INACTIVAS'
              ? `Inactivas (${pcs.filter(p => !p.activa).length})`
              : `${e} (${pcs.filter(p => p.estado === e && p.activa).length})`}
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
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {pcsFiltradas.map(pc => (
            <button
              key={pc.id}
              onClick={() => setPcEditar(pc)}
              className={`rounded-xl border p-3 text-center transition-all hover:scale-105 hover:shadow-lg
                ${!pc.activa ? 'bg-gray-800 border-gray-700 opacity-40' : ESTADO_COLOR[pc.estado] || ESTADO_COLOR.OPERATIVO}`}
              title={`${pc.codigo}${pc.specs ? '\n' + pc.specs : ''}`}
            >
              <div className="text-xs font-bold">{pc.codigo}</div>
              {pc.fila && <div className="text-xs opacity-70 mt-0.5">Fila {pc.fila}</div>}
              <div className="text-xs opacity-60 mt-1">{pc.activa ? pc.estado.slice(0,3) : 'BAJA'}</div>
            </button>
          ))}
        </div>
      )}

      {/* Modales */}
      {(modalCrear || pcEditar) && (
        <ModalPC
          pc={pcEditar}
          labId={Number(labId)}
          proximoNumero={proximoNumero}
          onClose={() => { setModalCrear(false); setPcEditar(null); }}
          onSave={() => { setModalCrear(false); setPcEditar(null); cargar(); }}
        />
      )}
      {modalBulk && (
        <ModalBulk
          labId={Number(labId)}
          onClose={() => setModalBulk(false)}
          onSave={cargar}
        />
      )}
    </AdminLayout>
  );
}
