import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';
import { useTheme } from '../../context/ThemeContext';
import ExpedienteActivo from '../../components/ExpedienteActivo';

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

const CATEGORIAS = ['COMPUTADORA','IMPRESORA_3D','BRAZO_ROBOTICO','SCANNER','IOT','HERRAMIENTA','MOBILIARIO','AUDIOVISUAL','REDES','MEDICO','OFICINA','VEHICULO','OTRO'];
const ALCANCES   = ['LABORATORIO','INSTITUCIONAL'];
const ESTADOS_ADMIN = ['BORRADOR','EN_REVISION','OBSERVADO','VALIDADO','RECHAZADO','BAJA_SOLICITADA'];
const TIPOS_MOVIMIENTO = ['TRANSFERENCIA_DEPARTAMENTO','CAMBIO_UBICACION','CAMBIO_RESGUARDANTE','MANTENIMIENTO','BAJA'];
const TIPOS_UBICACION = ['EDIFICIO','OFICINA','AULA','LABORATORIO','ALMACEN','BIBLIOTECA','CONSULTORIO','TALLER','EXTERIOR','OTRO'];
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
                <div className="bg-white/4 border border-white/10 rounded-xl px-4 py-3">
                  {/* 1+4 — "LABORATORIO" en verde institucional; texto de instrucción en gris legible */}
                  <p className="text-xs text-slate-300 font-medium mb-2">
                    Escribe exactamente uno de estos nombres en la columna{' '}
                    <span className="text-emerald-400 font-semibold">'Laboratorio'</span>:
                  </p>
                  {/* 2 — Tags con fondo gris sutil moderno, sin bordes oscuros */}
                  <div className="flex flex-wrap gap-1.5">
                    {labsDisp.map(l => (
                      <span key={l.id}
                        className="text-xs bg-slate-700/60 border border-white/10 text-slate-300 rounded-lg px-2.5 py-1 font-mono">
                        {l.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-white/15 text-slate-300 hover:bg-white/8 hover:text-white text-sm font-medium transition-colors">
                  Cancelar
                </button>
                {/* 3 — SVG blanco en lugar del emoji ⬆️ */}
                <button onClick={importar} disabled={!archivo || cargando}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                  {cargando ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Importando...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                      </svg>
                      Importar
                    </>
                  )}
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

function ModalActivo({ activo, labs, departamentos, ubicaciones, onClose, onSave }) {
  const esEdicion = !!activo;
  const [form, setForm] = useState({
    alcance:           activo?.alcance           ?? 'LABORATORIO',
    laboratorio_id:    activo?.laboratorio_id    ?? '',
    departamento_id:   activo?.departamento_id   ?? '',
    ubicacion_id:      activo?.ubicacion_id      ?? '',
    ubicacion_tipo:    activo?.ubicacion_tipo    ?? 'OFICINA',
    ubicacion_nombre:  activo?.ubicacion_nombre  ?? '',
    responsable_id:    activo?.responsable_id    ?? '',
    tipo_inventario:   activo?.tipo_inventario   ?? 'ACTIVO',
    estado_admin:      activo?.estado_admin      ?? 'VALIDADO',
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
    resguardante_externo_nombre: activo?.resguardante_externo_nombre ?? '',
    activo:            activo?.activo            ?? true,
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const val = ['laboratorio_id','departamento_id','ubicacion_id','responsable_id'].includes(e.target.name) ? (e.target.value === '' ? '' : Number(e.target.value))
              : e.target.name === 'valor'          ? (e.target.value === '' ? '' : Number(e.target.value))
              : e.target.name === 'activo'         ? e.target.checked
              : e.target.value;
    const next = { ...form, [e.target.name]: val };
    setForm(next);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (payload.valor === '') delete payload.valor;
      payload.tipo_inventario = 'ACTIVO';
      payload.cantidad = 1;
      payload.unidad_medida = 'PIEZA';
      delete payload.stock_minimo;
      ['laboratorio_id','departamento_id','ubicacion_id','responsable_id','marca','modelo','numero_serie','especificaciones','observaciones','resguardante_externo_nombre','ubicacion_nombre'].forEach(k => {
        if (!payload[k]) delete payload[k];
      });
      if (esEdicion) {
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
      <div className="glass w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-gray-800">
          <h3 className="font-semibold text-white">{esEdicion ? 'Editar activo' : 'Nuevo activo'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-300 font-medium mb-1">Pertenece a</label>
            <SelectDark
              value={form.alcance}
              onChange={v => handleChange({ target: { name: 'alcance', value: v } })}
              options={ALCANCES.map(a => ({ value: a, label: a === 'INSTITUCIONAL' ? 'Institucional / sin laboratorio' : 'Un laboratorio' }))}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 font-medium mb-1">Estado administrativo</label>
            <SelectDark
              value={form.estado_admin}
              onChange={v => handleChange({ target: { name: 'estado_admin', value: v } })}
              options={ESTADOS_ADMIN.map(e => ({ value: e, label: e.replace(/_/g, ' ') }))}
            />
          </div>

          {/* Laboratorio (solo al crear) */}
          {form.alcance === 'LABORATORIO' && (
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1">
                Laboratorio <span className="text-red-400/80 ml-0.5">*</span>
              </label>
              <SelectDark
                value={form.laboratorio_id}
                onChange={v => handleChange({ target: { name: 'laboratorio_id', value: v } })}
                placeholder="Seleccionar laboratorio..."
                options={[{ value: '', label: 'Seleccionar laboratorio...' }, ...labs.map(l => ({ value: l.id, label: l.nombre }))]}
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
            <label className="block text-sm text-slate-300 font-medium mb-1">
              Nombre <span className="text-red-400/80 ml-0.5">*</span>
            </label>
            <input name="nombre" value={form.nombre} onChange={handleChange} required
              placeholder="Ej: Impresora 3D Creality Ender 3"
              className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Departamento responsable</label>
              <SelectDark
                value={form.departamento_id}
                onChange={v => handleChange({ target: { name: 'departamento_id', value: v } })}
                placeholder="Sin departamento"
                options={[{ value: '', label: 'Sin departamento' }, ...departamentos.map(d => ({ value: d.id, label: d.nombre }))]}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ubicacion registrada</label>
              <SelectDark
                value={form.ubicacion_id}
                onChange={v => handleChange({ target: { name: 'ubicacion_id', value: v } })}
                placeholder="Sin ubicacion"
                options={[{ value: '', label: 'Sin ubicacion' }, ...ubicaciones.map(u => ({ value: u.id, label: u.label || u.nombre, sublabel: u.tipo }))]}
              />
            </div>
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
              <input name="resguardante_externo_nombre" value={form.resguardante_externo_nombre} onChange={handleChange}
                placeholder="Nombre del responsable"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>

          {!form.ubicacion_id && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Tipo de ubicacion</label>
                <SelectDark
                  value={form.ubicacion_tipo}
                  onChange={v => handleChange({ target: { name: 'ubicacion_tipo', value: v } })}
                  options={TIPOS_UBICACION.map(t => ({ value: t, label: t.replace(/_/g, ' ') }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Ubicacion fisica</label>
                <input name="ubicacion_nombre" value={form.ubicacion_nombre} onChange={handleChange}
                  placeholder="Ej: Edificio A / Oficina Sistemas"
                  className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1">
                Categoría <span className="text-red-400/80 ml-0.5">*</span>
              </label>
              <SelectDark
                value={form.categoria}
                onChange={v => handleChange({ target: { name: 'categoria', value: v } })}
                options={CATEGORIAS.map(c => ({
                  value: c,
                  label: c.replace(/_/g, ' ').toLowerCase().replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()),
                }))}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1">Estado</label>
              <SelectDark
                value={form.estado}
                onChange={v => handleChange({ target: { name: 'estado', value: v } })}
                options={ESTADOS.map(e => ({
                  value: e,
                  label: e.charAt(0).toUpperCase() + e.slice(1).toLowerCase(),
                }))}
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
              <label className="block text-sm text-slate-300 font-medium mb-1">Valor ($)</label>
              {/* Ocultar spin buttons nativos del navegador */}
              <input name="valor" type="number" min="0" step="0.01" value={form.valor} onChange={handleChange}
                placeholder="0.00"
                className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
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
              className="flex-1 py-2.5 rounded-xl border border-white/15 text-slate-300 hover:bg-white/8 hover:text-white text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {loading ? 'Guardando...' : (esEdicion ? 'Actualizar' : 'Registrar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

function ModalMovimiento({ activo, departamentos, ubicaciones, onClose, onSave }) {
  const [form, setForm] = useState({
    tipo: 'TRANSFERENCIA_DEPARTAMENTO',
    departamento_destino_id: activo?.departamento_id ?? '',
    ubicacion_destino_id: activo?.ubicacion_id ?? '',
    ubicacion_destino_nombre: '',
    resguardante_destino_nombre: activo?.resguardante_externo_nombre ?? activo?.responsable_nombre ?? '',
    observaciones: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const val = ['departamento_destino_id','ubicacion_destino_id'].includes(e.target.name)
      ? (e.target.value === '' ? '' : Number(e.target.value))
      : e.target.value;
    setForm({ ...form, [e.target.name]: val });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      ['departamento_destino_id','ubicacion_destino_id','ubicacion_destino_nombre','resguardante_destino_nombre','observaciones'].forEach(k => {
        if (!payload[k]) delete payload[k];
      });
      payload.cantidad = 1;
      await api.post(`/inventario/activos/${activo.id}/movimientos`, payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al registrar movimiento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-gray-800">
          <div>
            <h3 className="font-semibold text-white">Movimiento de inventario</h3>
            <p className="text-xs text-slate-400 mt-0.5">{activo.codigo_inventario} · {activo.nombre}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1">Tipo</label>
              <SelectDark
                value={form.tipo}
                onChange={v => handleChange({ target: { name: 'tipo', value: v } })}
                options={TIPOS_MOVIMIENTO.map(t => ({ value: t, label: t.replace(/_/g, ' ') }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Departamento destino</label>
              <SelectDark
                value={form.departamento_destino_id}
                onChange={v => handleChange({ target: { name: 'departamento_destino_id', value: v } })}
                options={[{ value: '', label: 'Sin cambio' }, ...departamentos.map(d => ({ value: d.id, label: d.nombre }))]}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ubicacion destino</label>
              <SelectDark
                value={form.ubicacion_destino_id}
                onChange={v => handleChange({ target: { name: 'ubicacion_destino_id', value: v } })}
                options={[{ value: '', label: 'Sin ubicacion registrada' }, ...ubicaciones.map(u => ({ value: u.id, label: u.label || u.nombre, sublabel: u.tipo }))]}
              />
            </div>
          </div>

          {!form.ubicacion_destino_id && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ubicacion fisica destino</label>
              <input name="ubicacion_destino_nombre" value={form.ubicacion_destino_nombre} onChange={handleChange}
                placeholder="Ej: Edificio B / Aula 3"
                className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Resguardante destino</label>
            <input name="resguardante_destino_nombre" value={form.resguardante_destino_nombre} onChange={handleChange}
              placeholder="Nombre del responsable que recibe"
              className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Observaciones</label>
            <textarea name="observaciones" rows={2} value={form.observaciones} onChange={handleChange}
              placeholder="Motivo del movimiento"
              className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"/>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/15 text-slate-300 hover:bg-white/8 hover:text-white text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {loading ? 'Registrando...' : 'Solicitar movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalBaja({ activo, onClose, onSave }) {
  const [form, setForm] = useState({
    motivo: '',
    diagnostico: '',
    evidencia_url: '',
    destino_final: '',
    observaciones: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach(k => { if (!payload[k]) delete payload[k]; });
      await api.post(`/inventario/activos/${activo.id}/baja`, payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al solicitar baja');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-gray-800">
          <div>
            <h3 className="font-semibold text-white">Solicitar baja patrimonial</h3>
            <p className="text-xs text-slate-400 mt-0.5">{activo.codigo_inventario} · {activo.nombre}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-300 font-medium mb-1">Motivo de baja</label>
            <textarea name="motivo" rows={3} required value={form.motivo} onChange={handleChange}
              placeholder="Ej: Bien roto, obsoleto o sin reparación viable"
              className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"/>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Diagnóstico técnico</label>
            <textarea name="diagnostico" rows={2} value={form.diagnostico} onChange={handleChange}
              placeholder="Resultado de revisión o descripción del daño"
              className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"/>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Evidencia URL</label>
              <input name="evidencia_url" value={form.evidencia_url} onChange={handleChange}
                placeholder="Liga a foto/oficio"
                className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Destino final propuesto</label>
              <input name="destino_final" value={form.destino_final} onChange={handleChange}
                placeholder="Resguardo, desecho, donación..."
                className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Observaciones</label>
            <textarea name="observaciones" rows={2} value={form.observaciones} onChange={handleChange}
              className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"/>
          </div>
          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/15 text-slate-300 hover:bg-white/8 hover:text-white text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {loading ? 'Solicitando...' : 'Solicitar baja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ModalExpediente reemplazado por <ExpedienteActivo mode="drawer"> (componente compartido)

export default function Inventario() {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const navigate = useNavigate();
  const [activos, setActivos]   = useState([]);
  const [labs, setLabs]         = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filtroLab, setFiltroLab]         = useState('');
  const [filtroAlcance, setFiltroAlcance] = useState('');
  const [filtroDepartamento, setFiltroDepartamento] = useState('');
  const [filtroUbicacion, setFiltroUbicacion] = useState('');
  const [filtroEstadoAdmin, setFiltroEstadoAdmin] = useState('');
  const [filtroCat, setFiltroCat]         = useState('');
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [busqueda, setBusqueda]           = useState('');
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const vistaGrid = false;
  const setVistaGrid = () => {};
  const [modalNuevo, setModalNuevo]       = useState(false);
  const [activoEditar, setActivoEditar]   = useState(null);
  const [activoMover, setActivoMover]     = useState(null);
  const [activoBaja, setActivoBaja]       = useState(null);
  const [activoExpediente, setActivoExpediente] = useState(null);
  const [modalImportar, setModalImportar] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroLab)    params.append('laboratorio_id', filtroLab);
      if (filtroAlcance) params.append('alcance', filtroAlcance);
      if (filtroDepartamento) params.append('departamento_id', filtroDepartamento);
      if (filtroUbicacion) params.append('ubicacion_id', filtroUbicacion);
      if (filtroEstadoAdmin) params.append('estado_admin', filtroEstadoAdmin);
      if (filtroCat)    params.append('categoria', filtroCat);
      if (filtroEstado) params.append('estado', filtroEstado);
      if (soloDisponibles) params.append('solo_disponibles', 'true');

      const statsParams = new URLSearchParams(params);
      statsParams.delete('categoria');
      statsParams.delete('estado');
      statsParams.delete('solo_disponibles');

      const [rA, rL, rD, rU, rS] = await Promise.all([
        api.get(`/inventario/activos?${params}`),
        api.get('/laboratorios?solo_activos=true'),
        api.get('/departamentos?activo=true'),
        api.get('/inventario/ubicaciones'),
        api.get(`/inventario/estadisticas?${statsParams}`),
      ]);
      setActivos(rA.data);
      setLabs(rL.data);
      setDepartamentos(rD.data);
      setUbicaciones(rU.data);
      setStats(rS.data);
    } finally {
      setLoading(false);
    }
  }, [filtroLab, filtroAlcance, filtroDepartamento, filtroUbicacion, filtroEstadoAdmin, filtroCat, filtroEstado, soloDisponibles]);

  useEffect(() => { cargar(); }, [cargar]);

  const activosFiltrados = activos.filter(a => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return a.nombre.toLowerCase().includes(q)
      || a.codigo_inventario.toLowerCase().includes(q)
      || (a.marca || '').toLowerCase().includes(q)
      || (a.modelo || '').toLowerCase().includes(q)
      || (a.departamento_nombre || '').toLowerCase().includes(q)
      || (a.ubicacion_label || '').toLowerCase().includes(q)
      || (a.resguardante_externo_nombre || '').toLowerCase().includes(q)
      || (a.responsable_nombre || '').toLowerCase().includes(q);
  });

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventario institucional</h1>
          <p className="text-slate-400 text-sm mt-0.5">Activos por laboratorio, departamento, ubicacion y responsable</p>
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
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
          {[
            { label: 'Total',         val: stats.total_activos,        color: 'text-white' },
            { label: 'Operativos',    val: stats.operativos,           color: 'text-green-400' },
            { label: 'Mantenimiento', val: stats.en_mantenimiento,     color: 'text-yellow-400' },
            { label: 'Institucional', val: stats.institucionales || 0,  color: 'text-emerald-400' },
            { label: 'Bajas pend.',    val: stats.bajas_pendientes || 0, color: (stats.bajas_pendientes || 0) > 0 ? 'text-red-400' : 'text-slate-500' },
            { label: 'No localizados', val: stats.no_localizados || 0,   color: (stats.no_localizados || 0) > 0 ? 'text-orange-400' : 'text-slate-500' },
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
          value={filtroAlcance}
          onChange={setFiltroAlcance}
          className="w-44"
          placeholder="Todo el alcance"
          options={[{ value: '', label: 'Todo el alcance' }, ...ALCANCES.map(a => ({ value: a, label: a === 'INSTITUCIONAL' ? 'Institucional' : 'Laboratorio' }))]}
        />
        <SelectDark
          value={filtroDepartamento}
          onChange={setFiltroDepartamento}
          className="w-52"
          placeholder="Todos los deptos"
          options={[{ value: '', label: 'Todos los deptos' }, ...departamentos.map(d => ({ value: d.id, label: d.nombre }))]}
        />
        <SelectDark
          value={filtroUbicacion}
          onChange={setFiltroUbicacion}
          className="w-52"
          placeholder="Todas las ubicaciones"
          options={[{ value: '', label: 'Todas las ubicaciones' }, ...ubicaciones.map(u => ({ value: u.id, label: u.label || u.nombre, sublabel: u.tipo }))]}
        />
        <SelectDark
          value={filtroEstadoAdmin}
          onChange={setFiltroEstadoAdmin}
          className="w-48"
          placeholder="Validacion"
          options={[{ value: '', label: 'Toda validacion' }, ...ESTADOS_ADMIN.map(e => ({ value: e, label: e.replace(/_/g, ' ') }))]}
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
        <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer select-none">
          <input type="checkbox" checked={soloDisponibles} onChange={e => setSoloDisponibles(e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-600"/>
          Disponibles
        </label>
        <span className="text-xs text-slate-500 px-2 py-1 rounded-lg bg-white/5">
          {activosFiltrados.length} activo(s)
        </span>

        {/* Toggle vista */}
        <div className="hidden">
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
                  background: isDay ? '#FFFFFF' : 'rgba(30,41,59,0.55)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: `1px solid ${vencido ? 'rgba(239,68,68,0.35)' : isDay ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow: vencido
                    ? '0 8px 20px rgba(239,68,68,0.10)'
                    : isDay ? '0 1px 3px rgba(15,23,42,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
                onMouseEnter={e => e.currentTarget.style.border = `1px solid ${vencido ? 'rgba(239,68,68,0.5)' : isDay ? 'rgba(37,99,235,0.28)' : 'rgba(255,255,255,0.14)'}`}
                onMouseLeave={e => e.currentTarget.style.border = `1px solid ${vencido ? 'rgba(239,68,68,0.35)' : isDay ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.07)'}`}>
                {/* Header */}
                <div className="flex items-start justify-between">
                  {/* Icono perfectamente centrado con Flexbox */}
                  <div className={`w-11 h-11 rounded-xl ${herramientaColor} border flex items-center justify-center shrink-0`}
                    style={{ fontSize: '22px', lineHeight: 1 }}>
                    {cat.emoji}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_BADGE[a.estado] || 'bg-gray-700 text-slate-400'}`}>
                      {/* Formato tipo título para el estado */}
                      {a.estado.charAt(0).toUpperCase() + a.estado.slice(1).toLowerCase()}
                    </span>
                    {a.prestado && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${a.prestamo_estado === 'VENCIDO' ? 'bg-red-900/60 text-red-300' : 'bg-blue-900/60 text-blue-300'}`}>
                        {a.prestamo_estado === 'VENCIDO' ? '⚠️ Vencido' : '📤 Prestado'}
                      </span>
                    )}
                  </div>
                </div>
                {/* Info — texto en formato tipo título */}
                <div className="flex-1">
                  <p className={`font-semibold text-sm leading-tight ${isDay ? 'text-slate-950' : 'text-white'}`}>
                    {a.nombre
                      ? a.nombre.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase())
                      : '—'}
                  </p>
                  {/* Código de inventario en mayúsculas — correcto y destacado */}
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{a.codigo_inventario}</p>
                  {(a.marca || a.modelo) && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[a.marca, a.modelo].filter(Boolean)
                        .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
                        .join(' · ')}
                    </p>
                  )}
                  {a.laboratorio_nombre && (
                    <p className="text-xs text-slate-500 mt-1">
                      {a.laboratorio_nombre.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase())}
                    </p>
                  )}
                  {(a.departamento_nombre || a.ubicacion_label) && (
                    <p className="text-xs text-slate-500 mt-1">
                      {[a.departamento_nombre, a.ubicacion_label].filter(Boolean).join(' / ')}
                    </p>
                  )}
                  <span className={`inline-flex mt-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    a.alcance === 'INSTITUCIONAL'
                      ? 'bg-emerald-900/50 text-emerald-300'
                      : 'bg-slate-700/70 text-slate-300'
                  }`}>
                    {a.alcance === 'INSTITUCIONAL' ? 'Institucional' : 'Laboratorio'}
                  </span>
                </div>
                {/* Acciones — Editar ghost (30%) + Prestar sólido (70%) */}
                <div className="flex gap-2 pt-2 border-t border-white/5 mt-auto">
                  <button onClick={() => setActivoEditar(a)}
                    className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                      isDay
                        ? 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                        : 'border border-white/15 text-slate-300 hover:bg-white/8'
                    }`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>
                  <button onClick={() => setActivoMover(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/90 hover:bg-blue-600 text-white transition-colors">
                    Mover
                  </button>
                  <button onClick={() => setActivoExpediente(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors">
                    Exp.
                  </button>
                  <button onClick={() => setActivoBaja(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-900/70 hover:bg-red-800 text-red-100 transition-colors">
                    Baja
                  </button>
                  {!a.prestado && a.estado === 'OPERATIVO' ? (
                    <button onClick={() => navigate('/admin/prestamos', { state: { activoId: a.id } })}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
                      Prestar
                    </button>
                  ) : (
                    <div className="flex-1" /> // espaciador para mantener el Editar alineado
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Vista tabla */
        <div className="glass overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-white/5 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Activo</th>
                <th className="text-left px-4 py-3">Categoría</th>
                <th className="text-left px-4 py-3">Alcance</th>
                <th className="text-left px-4 py-3">Responsable</th>
                <th className="text-left px-4 py-3">Ubicacion</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Validacion</th>
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
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      a.alcance === 'INSTITUCIONAL'
                        ? 'bg-emerald-900/40 text-emerald-300'
                        : 'bg-slate-700/70 text-slate-300'
                    }`}>
                      {a.alcance === 'INSTITUCIONAL' ? 'Institucional' : 'Laboratorio'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    <p>{a.departamento_nombre || a.laboratorio_nombre || <span className="text-slate-600">Sin responsable</span>}</p>
                    {(a.responsable_nombre || a.resguardante_externo_nombre) && (
                      <p className="text-slate-500 mt-0.5">{a.responsable_nombre || a.resguardante_externo_nombre}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    {a.ubicacion_label || a.ubicacion_nombre || <span className="text-slate-600">Sin ubicacion</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ESTADO_BADGE[a.estado] || 'bg-gray-700 text-gray-300'}`}>
                      {a.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      a.estado_admin === 'VALIDADO'
                        ? 'bg-green-900/40 text-green-300'
                        : a.estado_admin?.includes('BAJA')
                          ? 'bg-red-900/50 text-red-300'
                          : 'bg-yellow-900/40 text-yellow-300'
                    }`}>
                      {(a.estado_admin || 'VALIDADO').replace(/_/g, ' ')}
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
                      <button onClick={() => setActivoMover(a)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-gray-600 rounded-lg transition-colors"
                        title="Mover activo">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </button>
                      <button onClick={() => setActivoExpediente(a)}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-gray-600 rounded-lg transition-colors"
                        title="Expediente">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
                        </svg>
                      </button>
                      <button onClick={() => setActivoBaja(a)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-gray-600 rounded-lg transition-colors"
                        title="Solicitar baja">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
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
          departamentos={departamentos}
          ubicaciones={ubicaciones}
          onClose={() => { setModalNuevo(false); setActivoEditar(null); }}
          onSave={() => { setModalNuevo(false); setActivoEditar(null); cargar(); }}
        />
      )}
      {modalImportar && (
        <ModalImportar
          onClose={() => setModalImportar(false)}
          onDone={() => { setModalImportar(false); cargar(); }}
        />
      )}
      {activoMover && (
        <ModalMovimiento
          activo={activoMover}
          departamentos={departamentos}
          ubicaciones={ubicaciones}
          onClose={() => setActivoMover(null)}
          onSave={() => { setActivoMover(null); cargar(); }}
        />
      )}
      {activoBaja && (
        <ModalBaja
          activo={activoBaja}
          onClose={() => setActivoBaja(null)}
          onSave={() => { setActivoBaja(null); cargar(); }}
        />
      )}
      {activoExpediente && (
        <ExpedienteActivo
          activoId={activoExpediente.id}
          activo={activoExpediente}
          mode="drawer"
          onClose={() => setActivoExpediente(null)}
        />
      )}
    </AdminLayout>
  );
}
