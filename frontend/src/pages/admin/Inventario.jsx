import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';

const CATEGORIA_ICONO = {
  COMPUTADORA:    { emoji: '🖥️', color: 'bg-blue-900/50 border-blue-700' },
  IMPRESORA_3D:   { emoji: '🖨️', color: 'bg-purple-900/50 border-purple-700' },
  BRAZO_ROBOTICO: { emoji: '🦾', color: 'bg-orange-900/50 border-orange-700' },
  SCANNER:        { emoji: '📡', color: 'bg-cyan-900/50 border-cyan-700' },
  IOT:            { emoji: '🔌', color: 'bg-green-900/50 border-green-700' },
  HERRAMIENTA:    { emoji: '🔧', color: 'bg-yellow-900/50 border-yellow-700' },
  MOBILIARIO:     { emoji: '🪑', color: 'bg-gray-700 border-gray-600' },
  OTRO:           { emoji: '📦', color: 'bg-gray-700 border-gray-600' },
};

const ESTADO_BADGE = {
  OPERATIVO:     'bg-green-900/60 text-green-300',
  MANTENIMIENTO: 'bg-yellow-900/60 text-yellow-300',
  DAÑADO:        'bg-red-900/60 text-red-300',
  BAJA:          'bg-gray-700 text-slate-400',
};

const CATEGORIAS = ['COMPUTADORA','IMPRESORA_3D','BRAZO_ROBOTICO','SCANNER','IOT','HERRAMIENTA','MOBILIARIO','OTRO'];
const ESTADOS    = ['OPERATIVO','MANTENIMIENTO','DAÑADO','BAJA'];

// ─── Modal Importar ───────────────────────────────────────────────────────────

function ModalImportar({ onClose, onDone }) {
  const [archivo, setArchivo]         = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [cargando, setCargando]       = useState(false);
  const [resultado, setResultado]     = useState(null);
  const [error, setError]             = useState('');
  const [labsDisp, setLabsDisp]       = useState([]);
  const inputRef = useRef();

  useEffect(() => {
    api.get('/inventario/labs-nombres')
      .then(r => setLabsDisp(r.data))
      .catch(() => {});
  }, []);

  const elegirArchivo = (file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Solo se aceptan archivos .xlsx o .xls');
      return;
    }
    setArchivo(file);
    setError('');
    setResultado(null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setArrastrando(false);
    elegirArchivo(e.dataTransfer.files[0]);
  };

  const importar = async () => {
    if (!archivo) return;
    setCargando(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', archivo);
      const { data } = await api.post('/inventario/activos/importar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResultado(data);
    } catch (err) {
      const det = err?.response?.data?.detail;
      setError(typeof det === 'string' ? det : 'Error al importar el archivo');
    } finally {
      setCargando(false);
    }
  };

  const handleCerrar = () => {
    if (resultado?.creados > 0 || resultado?.actualizados > 0) onDone();
    else onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-xl shadow-2xl">
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Importar inventario desde Excel</h3>
            <p className="text-xs text-slate-400 mt-0.5">Usa la plantilla UTC para importar masivamente</p>
          </div>
          <button onClick={handleCerrar} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">

          {/* Resultado */}
          {resultado ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-900/40 border border-green-800 rounded-xl p-3">
                  <p className="text-2xl font-bold text-green-400">{resultado.creados}</p>
                  <p className="text-xs text-green-300 mt-0.5">Creados</p>
                </div>
                <div className="bg-blue-900/40 border border-blue-800 rounded-xl p-3">
                  <p className="text-2xl font-bold text-blue-400">{resultado.actualizados}</p>
                  <p className="text-xs text-blue-300 mt-0.5">Actualizados</p>
                </div>
                <div className={`rounded-xl p-3 border ${resultado.total_errores > 0 ? 'bg-red-900/40 border-red-800' : 'bg-gray-700 border-gray-600'}`}>
                  <p className={`text-2xl font-bold ${resultado.total_errores > 0 ? 'text-red-400' : 'text-slate-400'}`}>{resultado.total_errores}</p>
                  <p className={`text-xs mt-0.5 ${resultado.total_errores > 0 ? 'text-red-300' : 'text-slate-400'}`}>Errores</p>
                </div>
              </div>

              {resultado.errores?.length > 0 && (
                <div className="bg-slate-950 border border-gray-700 rounded-xl p-3 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold text-gray-300 mb-2">Filas con errores:</p>
                  <div className="space-y-1.5">
                    {resultado.errores.map((e, i) => (
                      <div key={i} className="text-xs bg-red-900/20 border border-red-900 rounded-lg px-3 py-1.5">
                        <span className="text-red-400 font-medium">Fila {e.fila}</span>
                        {e.codigo && <span className="text-slate-400"> · {e.codigo}</span>}
                        {e.nombre && <span className="text-slate-400"> — {e.nombre}</span>}
                        <ul className="mt-1 list-disc list-inside text-red-300 space-y-0.5">
                          {e.errores.map((msg, j) => <li key={j}>{msg}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleCerrar}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                {resultado.creados > 0 || resultado.actualizados > 0 ? 'Listo — ver inventario' : 'Cerrar'}
              </button>
            </div>
          ) : (
            <>
              {/* Dropzone */}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                  ${arrastrando ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500 hover:bg-white/8/30'}`}>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => elegirArchivo(e.target.files[0])} />
                {archivo ? (
                  <div>
                    <p className="text-2xl mb-2">📊</p>
                    <p className="text-white font-medium text-sm">{archivo.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(archivo.size / 1024).toFixed(1)} KB</p>
                    <button onClick={e => { e.stopPropagation(); setArchivo(null); }}
                      className="mt-2 text-xs text-red-400 hover:text-red-300 underline">
                      Quitar archivo
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-3xl mb-2">📂</p>
                    <p className="text-white text-sm font-medium">Arrastra tu archivo aquí</p>
                    <p className="text-slate-400 text-xs mt-1">o haz clic para seleccionar</p>
                    <p className="text-slate-500 text-xs mt-2">Formatos: .xlsx · .xls</p>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Nombres de labs disponibles */}
              {labsDisp.length > 0 && (
                <div className="bg-white/4 border border-gray-600 rounded-xl px-4 py-3">
                  <p className="text-xs text-slate-400 font-medium mb-2">
                    📋 Escribe exactamente uno de estos nombres en la columna <span className="text-yellow-300">LABORATORIO</span>:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {labsDisp.map(l => (
                      <span key={l.id}
                        className="text-xs bg-gray-800 border border-gray-600 text-gray-200 rounded-md px-2 py-1 font-mono">
                        {l.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={importar} disabled={!archivo || cargando}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                  {cargando ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Importando...
                    </>
                  ) : '⬆️ Importar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal Activo ─────────────────────────────────────────────────────────────

function ModalActivo({ activo, labs, onClose, onSave }) {
  const esEdicion = !!activo;
  const [form, setForm] = useState({
    laboratorio_id:    activo?.laboratorio_id    ?? '',
    nombre:            activo?.nombre            ?? '',
    categoria:         activo?.categoria         ?? 'COMPUTADORA',
    area:              activo?.area              ?? '',
    marca:             activo?.marca             ?? '',
    modelo:            activo?.modelo            ?? '',
    numero_serie:      activo?.numero_serie      ?? '',
    valor:             activo?.valor             ?? '',
    estado:            activo?.estado            ?? 'OPERATIVO',
    especificaciones:  activo?.especificaciones  ?? '',
    observaciones:     activo?.observaciones     ?? '',
    resguardo_nombre:  activo?.resguardo_nombre  ?? '',
    activo:            activo?.activo            ?? true,
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const val = e.target.name === 'laboratorio_id' ? Number(e.target.value)
              : e.target.name === 'valor'          ? (e.target.value === '' ? '' : Number(e.target.value))
              : e.target.name === 'activo'         ? e.target.checked
              : e.target.value;
    setForm({ ...form, [e.target.name]: val });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (payload.valor === '') delete payload.valor;
      ['marca','modelo','numero_serie','especificaciones','observaciones'].forEach(k => {
        if (!payload[k]) delete payload[k];
      });
      if (esEdicion) {
        delete payload.laboratorio_id;
        await api.put(`/inventario/activos/${activo.id}`, payload);
      } else {
        await api.post('/inventario/activos', payload);
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
      <div className="glass w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-gray-800">
          <h3 className="font-semibold text-white">{esEdicion ? 'Editar activo' : 'Nuevo activo'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Laboratorio (solo al crear) */}
          {!esEdicion && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Laboratorio *</label>
              <SelectDark
                value={form.laboratorio_id}
                onChange={v => handleChange({ target: { name: 'laboratorio_id', value: v } })}
                placeholder="Seleccionar..."
                options={[{ value: '', label: 'Seleccionar...' }, ...labs.map(l => ({ value: l.id, label: l.nombre }))]}
              />
            </div>
          )}

          {/* Código generado — solo visible en edición */}
          {esEdicion && (
            <div className="flex items-center gap-2 bg-white/5 border border-gray-600 rounded-xl px-4 py-3">
              <span className="text-xs text-slate-400">Código inventario:</span>
              <span className="font-mono text-sm font-semibold text-blue-300">{activo.codigo_inventario}</span>
              <span className="ml-auto text-xs text-slate-500 italic">Asignado por el sistema</span>
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre *</label>
            <input name="nombre" value={form.nombre} onChange={handleChange} required
              placeholder="Ej: Impresora 3D Creality Ender 3"
              className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Área
                <span className="text-slate-500 font-normal ml-1 text-xs">(prefijo del código)</span>
              </label>
              <input name="area" value={form.area} onChange={handleChange}
                placeholder="Ej: LTI, LINF, LMEC"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase placeholder-normal"/>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Resguardante</label>
              <input name="resguardo_nombre" value={form.resguardo_nombre} onChange={handleChange}
                placeholder="Nombre del responsable"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Categoría *</label>
              <SelectDark
                value={form.categoria}
                onChange={v => handleChange({ target: { name: 'categoria', value: v } })}
                options={CATEGORIAS.map(c => ({ value: c, label: c.replace('_', ' ') }))}
              />
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Marca</label>
              <input name="marca" value={form.marca} onChange={handleChange} placeholder="Ej: HP, Creality"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Modelo</label>
              <input name="modelo" value={form.modelo} onChange={handleChange} placeholder="Ej: EliteDesk 800"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">No. Serie</label>
              <input name="numero_serie" value={form.numero_serie} onChange={handleChange}
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Valor ($)</label>
              <input name="valor" type="number" min="0" step="0.01" value={form.valor} onChange={handleChange}
                placeholder="0.00"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Especificaciones</label>
            <textarea name="especificaciones" value={form.especificaciones} onChange={handleChange} rows={2}
              placeholder="Ej: Intel i5, 8GB RAM, 256GB SSD..."
              className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"/>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Observaciones</label>
            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows={2}
              placeholder="Notas adicionales..."
              className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"/>
          </div>

          {esEdicion && (
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange}
                className="w-4 h-4 rounded accent-blue-600"/>
              Activo en inventario
            </label>
          )}

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Guardando...' : (esEdicion ? 'Actualizar' : 'Registrar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function Inventario() {
  const navigate = useNavigate();
  const [activos, setActivos]   = useState([]);
  const [labs, setLabs]         = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filtroLab, setFiltroLab]         = useState('');
  const [filtroCat, setFiltroCat]         = useState('');
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [busqueda, setBusqueda]           = useState('');
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const [vistaGrid, setVistaGrid]         = useState(true);
  const [modalNuevo, setModalNuevo]       = useState(false);
  const [activoEditar, setActivoEditar]   = useState(null);
  const [modalImportar, setModalImportar] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroLab)    params.append('laboratorio_id', filtroLab);
      if (filtroCat)    params.append('categoria', filtroCat);
      if (filtroEstado) params.append('estado', filtroEstado);
      if (soloDisponibles) params.append('solo_disponibles', 'true');

      const [rA, rL, rS] = await Promise.all([
        api.get(`/inventario/activos?${params}`),
        api.get('/laboratorios?solo_activos=true'),
        api.get('/inventario/estadisticas' + (filtroLab ? `?laboratorio_id=${filtroLab}` : '')),
      ]);
      setActivos(rA.data);
      setLabs(rL.data);
      setStats(rS.data);
    } finally {
      setLoading(false);
    }
  }, [filtroLab, filtroCat, filtroEstado, soloDisponibles]);

  useEffect(() => { cargar(); }, [cargar]);

  const activosFiltrados = activos.filter(a => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return a.nombre.toLowerCase().includes(q)
      || a.codigo_inventario.toLowerCase().includes(q)
      || (a.marca || '').toLowerCase().includes(q)
      || (a.modelo || '').toLowerCase().includes(q);
  });

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventario</h1>
          <p className="text-slate-400 text-sm mt-0.5">Equipos, dispositivos y activos del laboratorio</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/admin/prestamos')}
            className="flex items-center gap-2 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
            📋 Préstamos
          </button>
          <button onClick={() => setModalImportar(true)}
            className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(16,185,129,0.20)',
              border: '1px solid rgba(16,185,129,0.35)',
              boxShadow: '0 0 14px rgba(16,185,129,0.18)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.35)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(16,185,129,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.20)'; e.currentTarget.style.boxShadow = '0 0 14px rgba(16,185,129,0.18)'; }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Importar Excel
          </button>
          <button onClick={() => setModalNuevo(true)}
            className="flex items-center gap-2 btn-blue px-4 py-2.5 text-sm font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo activo
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total',         val: stats.total_activos,        color: 'text-white' },
            { label: 'Operativos',    val: stats.operativos,           color: 'text-green-400' },
            { label: 'Mantenimiento', val: stats.en_mantenimiento,     color: 'text-yellow-400' },
            { label: 'Préstamos',     val: stats.prestamos_activos,    color: 'text-blue-400' },
            { label: 'Vencidos',      val: stats.prestamos_vencidos,   color: stats.prestamos_vencidos > 0 ? 'text-red-400' : 'text-slate-500' },
          ].map(s => (
            <div key={s.label} className="glass p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5 items-center" style={{ position: 'relative', zIndex: 2 }}>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar nombre, código, marca..."
            className="glass-sm border border-gray-700 text-white text-sm rounded-lg pl-9 pr-4 py-2 w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>
        <SelectDark
          value={filtroLab}
          onChange={setFiltroLab}
          className="w-44"
          placeholder="Todos los labs"
          options={[{ value: '', label: 'Todos los labs' }, ...labs.map(l => ({ value: l.id, label: l.nombre }))]}
        />
        <SelectDark
          value={filtroCat}
          onChange={setFiltroCat}
          className="w-44"
          placeholder="Todas las categorías"
          options={[{ value: '', label: 'Todas las categorías' }, ...CATEGORIAS.map(c => ({ value: c, label: c.replace('_',' ') }))]}
        />
        <SelectDark
          value={filtroEstado}
          onChange={setFiltroEstado}
          className="w-40"
          placeholder="Todos los estados"
          options={[{ value: '', label: 'Todos los estados' }, ...ESTADOS.map(e => ({ value: e, label: e }))]}
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={soloDisponibles} onChange={e => setSoloDisponibles(e.target.checked)}
            className="w-4 h-4 rounded accent-blue-600"/>
          Disponibles
        </label>
        <span className="text-sm text-slate-500">{activosFiltrados.length} activo(s)</span>

        {/* Toggle vista */}
        <div className="ml-auto flex bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <button onClick={() => setVistaGrid(true)}
            className={`px-3 py-2 text-sm transition-colors ${vistaGrid ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            ⊞
          </button>
          <button onClick={() => setVistaGrid(false)}
            className={`px-3 py-2 text-sm transition-colors ${!vistaGrid ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            ☰
          </button>
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      ) : activosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">📦</p>
          <p>{activos.length === 0 ? 'No hay activos registrados' : 'No hay resultados con esos filtros'}</p>
          {activos.length === 0 && (
            <button onClick={() => setModalNuevo(true)} className="mt-3 text-blue-400 hover:text-blue-300 text-sm underline">
              Registrar el primero
            </button>
          )}
        </div>
      ) : vistaGrid ? (
        /* Vista grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activosFiltrados.map(a => {
            const cat = CATEGORIA_ICONO[a.categoria] || CATEGORIA_ICONO.OTRO;
            // Icono de herramienta cambia de color según estado
            const herramientaColor = a.categoria === 'HERRAMIENTA'
              ? (a.estado === 'OPERATIVO' ? 'bg-emerald-900/50 border-emerald-700'
                : a.estado === 'MANTENIMIENTO' ? 'bg-yellow-900/50 border-yellow-600'
                : 'bg-red-900/50 border-red-700')
              : cat.color;
            const vencido = a.prestado && a.prestamo_estado === 'VENCIDO';
            return (
              <div key={a.id}
                className={`rounded-xl p-4 flex flex-col gap-2 transition-all ${!a.activo ? 'opacity-50' : ''}`}
                style={{
                  background: 'rgba(30,41,59,0.55)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: `1px solid ${vencido ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow: vencido
                    ? 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px rgba(239,68,68,0.15)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
                onMouseEnter={e => e.currentTarget.style.border = `1px solid ${vencido ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.14)'}`}
                onMouseLeave={e => e.currentTarget.style.border = `1px solid ${vencido ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.07)'}`}>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl ${herramientaColor} border flex items-center justify-center text-xl shrink-0`}>
                    {cat.emoji}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_BADGE[a.estado] || 'bg-gray-700 text-slate-400'}`}>
                      {a.estado}
                    </span>
                    {a.prestado && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${a.prestamo_estado === 'VENCIDO' ? 'bg-red-900/60 text-red-300' : 'bg-blue-900/60 text-blue-300'}`}>
                        {a.prestamo_estado === 'VENCIDO' ? '⚠️ Vencido' : '📤 Prestado'}
                      </span>
                    )}
                  </div>
                </div>
                {/* Info */}
                <div className="flex-1">
                  <p className="font-semibold text-white text-sm leading-tight">{a.nombre}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{a.codigo_inventario}</p>
                  {(a.marca || a.modelo) && (
                    <p className="text-xs text-slate-500 mt-0.5">{[a.marca, a.modelo].filter(Boolean).join(' · ')}</p>
                  )}
                  {a.laboratorio_nombre && (
                    <p className="text-xs text-slate-500 mt-1">{a.laboratorio_nombre}</p>
                  )}
                </div>
                {/* Acciones */}
                <div className="flex gap-2 pt-2 border-t border-white/5 mt-auto">
                  <button onClick={() => setActivoEditar(a)}
                    className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-1.5 transition-colors">
                    Editar
                  </button>
                  {!a.prestado && a.estado === 'OPERATIVO' && (
                    <button onClick={() => navigate('/admin/prestamos', { state: { activoId: a.id } })}
                      className="flex-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg py-1.5 transition-colors">
                      Prestar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Vista tabla */
        <div className="glass overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Activo</th>
                <th className="text-left px-4 py-3">Categoría</th>
                <th className="text-left px-4 py-3">Lab</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Préstamo</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {activosFiltrados.map((a, idx) => (
                <tr key={a.id}
                  className={`transition-colors ${!a.activo ? 'opacity-50' : ''}`}
                  style={{
                    background: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent'}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{a.nombre}</p>
                    <p className="text-xs text-slate-400">{a.codigo_inventario}{a.marca ? ` · ${a.marca}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    {CATEGORIA_ICONO[a.categoria]?.emoji} {a.categoria.replace('_',' ')}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{a.laboratorio_nombre || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ESTADO_BADGE[a.estado] || 'bg-gray-700 text-gray-300'}`}>
                      {a.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {a.prestado ? (
                      <span className="text-yellow-400 font-medium">● Prestado</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setActivoEditar(a)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                        title="Editar activo">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {!a.prestado && a.estado === 'OPERATIVO' && (
                        <button onClick={() => navigate('/admin/prestamos', { state: { activoId: a.id } })}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-gray-600 rounded-lg transition-colors"
                          title="Prestar activo">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales */}
      {(modalNuevo || activoEditar) && (
        <ModalActivo
          activo={activoEditar}
          labs={labs}
          onClose={() => { setModalNuevo(false); setActivoEditar(null); }}
          onSave={() => { setModalNuevo(false); setActivoEditar(null); cargar(); }}
        />
      )}
      {modalImportar && (
        <ModalImportar
          onClose={() => setModalImportar(false)}
          onDone={() => { setModalImportar(false); cargar(); }}
  