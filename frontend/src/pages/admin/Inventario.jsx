import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { PanelBajas } from './InventarioBajas';
import { PanelLevantamientos } from './InventarioLevantamientos';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import ExpedienteActivo from '../../components/ExpedienteActivo';
import usePermission from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';

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

const CATEGORIAS_BASE = ['COMPUTADORA','IMPRESORA_3D','BRAZO_ROBOTICO','SCANNER','IOT','HERRAMIENTA','MOBILIARIO','AUDIOVISUAL','REDES','MEDICO','OFICINA','VEHICULO','OTRO'];
const CATEGORIAS_POR_LAB = {
  QUIMICA: ['CRISTALERIA','REACTIVO','INSTRUMENTO_MEDICION','EQUIPO_LABORATORIO','MATERIAL_CONSUMIBLE','SEGURIDAD_EPP','MOBILIARIO','ALMACENAMIENTO','OTRO'],
};
const CATEGORIAS = Array.from(new Set([...CATEGORIAS_BASE, ...Object.values(CATEGORIAS_POR_LAB).flat()]));
const ALCANCES   = ['LABORATORIO','INSTITUCIONAL'];
const ESTADOS_ADMIN = ['BORRADOR','EN_REVISION','OBSERVADO','VALIDADO','RECHAZADO','BAJA_SOLICITADA'];
const TIPOS_MOVIMIENTO = ['TRANSFERENCIA_DEPARTAMENTO','CAMBIO_UBICACION','CAMBIO_RESGUARDANTE','MANTENIMIENTO','BAJA'];
const TIPOS_UBICACION = ['EDIFICIO','OFICINA','AULA','LABORATORIO','ALMACEN','BIBLIOTECA','CONSULTORIO','TALLER','EXTERIOR','OTRO'];
const ESTADOS    = ['OPERATIVO','MANTENIMIENTO','DAÑADO','BAJA'];
const categoriaLabLabel = c => c ? c.replace(/_/g, ' ').toLowerCase().replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()) : '';
const categoriaActivoLabel = c => c ? c.replace(/_/g, ' ').toLowerCase().replace(/(?:^|\s)\S/g, ch => ch.toUpperCase()) : '';
const formatFechaCorta = iso => iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '';
const responsablePatrimonialLabel = (activo) => {
  const esLaboratorio = (activo?.alcance || '').toUpperCase() === 'LABORATORIO';
  if (esLaboratorio) return activo?.laboratorio_nombre || 'Laboratorio sin asignar';
  return activo?.departamento_nombre || 'Sin departamento responsable';
};
const mantenimientoTone = estado => {
  if (estado === 'VENCIDO') return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (estado === 'PROXIMO') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (estado === 'PROGRAMADO') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
};

// ─── Modal Importar ───────────────────────────────────────────────────────────

function ModalImportar({ onClose, onDone }) {
  const { usuario } = useAuth();
  const [archivo, setArchivo]         = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [cargando, setCargando]       = useState(false);
  const [resultado, setResultado]     = useState(null);
  const [error, setError]             = useState('');
  const [labsDisp, setLabsDisp]       = useState([]);
  const inputRef = useRef();
  const esDepartamental = usuario?.rol === 'ADMINISTRATIVO';
  const esLab = ['LAB_ADMIN', 'RESPONSABLE_LAB'].includes(usuario?.rol);

  useEffect(() => {
    if (esDepartamental) return;
    api.get('/inventario/labs-nombres')
      .then(r => setLabsDisp(r.data))
      .catch(() => {});
  }, [esDepartamental]);

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
      const { data } = await api.post('/inventario/activos/importar?estado_admin_default=BORRADOR', fd, {
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
            <p className="text-xs text-slate-400 mt-0.5">
              Carga inicial como preinventario en borrador
            </p>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-green-900/40 border border-green-800 rounded-xl p-3">
                  <p className="text-2xl font-bold text-green-400">{resultado.creados}</p>
                  <p className="text-xs text-green-300 mt-0.5">Creados</p>
                </div>
                <div className="bg-blue-900/40 border border-blue-800 rounded-xl p-3">
                  <p className="text-2xl font-bold text-blue-400">{resultado.actualizados}</p>
                  <p className="text-xs text-blue-300 mt-0.5">Actualizados</p>
                </div>
                <div className={`rounded-xl p-3 border ${resultado.duplicados_posibles > 0 ? 'bg-amber-900/40 border-amber-800' : 'bg-gray-700 border-gray-600'}`}>
                  <p className={`text-2xl font-bold ${resultado.duplicados_posibles > 0 ? 'text-amber-300' : 'text-slate-400'}`}>{resultado.duplicados_posibles || 0}</p>
                  <p className={`text-xs mt-0.5 ${resultado.duplicados_posibles > 0 ? 'text-amber-200' : 'text-slate-400'}`}>Duplicados</p>
                </div>
                <div className={`rounded-xl p-3 border ${resultado.total_errores > 0 ? 'bg-red-900/40 border-red-800' : 'bg-gray-700 border-gray-600'}`}>
                  <p className={`text-2xl font-bold ${resultado.total_errores > 0 ? 'text-red-400' : 'text-slate-400'}`}>{resultado.total_errores}</p>
                  <p className={`text-xs mt-0.5 ${resultado.total_errores > 0 ? 'text-red-300' : 'text-slate-400'}`}>Errores</p>
                </div>
              </div>
              <div className="bg-emerald-950/30 border border-emerald-900 rounded-xl px-3 py-2 text-xs text-emerald-200">
                Los activos nuevos quedaron como {resultado.estado_admin_default || 'BORRADOR'} para revision antes de validarlos oficialmente.
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
              <div className="bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-slate-300 leading-relaxed">
                <p className="font-semibold text-slate-100 mb-1">Modo preinventario</p>
                <p>
                  {esDepartamental
                    ? 'Los registros se cargan como institucionales y se asignan a tu departamento. Si el Excel trae Codigo SIGA o No. oficial, se actualiza ese activo; si no, se genera un codigo interno.'
                    : esLab
                      ? 'Los registros se cargan en tu laboratorio asignado. Si el Excel trae Codigo SIGA o No. oficial, se actualiza ese activo; si no, se genera un codigo interno.'
                      : 'Puedes cargar activos institucionales o de laboratorio. Si el Excel trae Codigo SIGA o No. oficial, se actualiza ese activo; si no, se genera un codigo interno.'}
                </p>
              </div>

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
              {!esDepartamental && labsDisp.length > 0 && (
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

              {esDepartamental && (
                <div className="bg-white/4 border border-white/10 rounded-xl px-4 py-3">
                  <p className="text-xs text-slate-300">
                    No necesitas llenar la columna <span className="text-emerald-400 font-semibold">'Laboratorio'</span>.
                    Para tu usuario, el sistema toma el departamento asignado y bloquea la carga a otros departamentos.
                  </p>
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

function ModalCatalogoInventario({ catalogo, onClose, onDone }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState('CATEGORIA_ACTIVO');
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    nombre: '',
    clave: '',
    prefijo_codigo: '',
    alcance: 'AMBOS',
    activo: true,
  });

  const items = useMemo(() => {
    const fuente = tipo === 'CATEGORIA_ACTIVO'
      ? (catalogo?.categorias_items || [])
      : (catalogo?.tipos_ubicacion_items || []);
    return [...fuente].sort((a, b) =>
      `${a.base ? '0' : '1'}-${a.nombre}`.localeCompare(`${b.base ? '0' : '1'}-${b.nombre}`, 'es')
    );
  }, [catalogo, tipo]);

  const resetForm = () => {
    setEditando(null);
    setError('');
    setForm({ nombre: '', clave: '', prefijo_codigo: '', alcance: 'AMBOS', activo: true });
  };

  const editar = (item) => {
    if (item.base || item.protegido || !item.id) return;
    setEditando(item);
    setError('');
    setForm({
      nombre: item.nombre || '',
      clave: item.clave || '',
      prefijo_codigo: item.prefijo_codigo || '',
      alcance: item.alcance || 'AMBOS',
      activo: item.activo !== false,
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setError('Escribe el nombre del elemento.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      if (editando?.id) {
        await api.put(`/inventario/catalogo/${editando.id}`, {
          nombre: form.nombre.trim(),
          prefijo_codigo: tipo === 'CATEGORIA_ACTIVO' ? (form.prefijo_codigo.trim() || null) : null,
          alcance: form.alcance,
          activo: form.activo,
        });
        toast('Elemento de catalogo actualizado.', 'success');
      } else {
        await api.post('/inventario/catalogo', {
          tipo,
          nombre: form.nombre.trim(),
          clave: form.clave.trim() || null,
          prefijo_codigo: tipo === 'CATEGORIA_ACTIVO' ? (form.prefijo_codigo.trim() || null) : null,
          alcance: form.alcance,
          activo: form.activo,
        });
        toast('Elemento agregado al catalogo.', 'success');
      }
      resetForm();
      await onDone();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar el elemento.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-5xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Catalogos de inventario</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Agrega categorias y tipos de ubicacion sin modificar el codigo del sistema.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="flex flex-wrap gap-2">
            {[
              ['CATEGORIA_ACTIVO', 'Categorias de activo'],
              ['TIPO_UBICACION', 'Tipos de ubicacion'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => { setTipo(value); resetForm(); }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  tipo === value
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="grid grid-cols-[1fr_110px_100px_100px] gap-3 px-4 py-3 text-xs uppercase tracking-wide text-slate-400 border-b border-white/10">
                <span>Elemento</span>
                <span>Prefijo</span>
                <span>Alcance</span>
                <span>Accion</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto divide-y divide-white/10">
                {items.map(item => (
                  <div key={`${item.base ? 'base' : 'custom'}-${item.clave}`} className="grid grid-cols-[1fr_110px_100px_100px] gap-3 px-4 py-3 items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{item.nombre}</p>
                      <p className="text-xs text-slate-400 font-mono">{item.clave}</p>
                    </div>
                    <span className="text-xs text-slate-300 font-mono">
                      {item.prefijo_codigo || '-'}
                    </span>
                    <span className="text-xs text-slate-300">
                      {item.alcance || 'AMBOS'}
                    </span>
                    {item.base || item.protegido || !item.id ? (
                      <span className="rounded-full bg-slate-800 text-slate-400 text-[11px] px-2 py-1 text-center">
                        Base
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => editar(item)}
                        className="rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-2"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={guardar} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 space-y-4">
              <div>
                <h4 className="text-white font-semibold">{editando ? 'Editar elemento' : 'Nuevo elemento'}</h4>
                <p className="text-xs text-slate-500 mt-1">
                  {tipo === 'CATEGORIA_ACTIVO'
                    ? 'El prefijo se usa para generar codigos automaticos.'
                    : 'Se usara en ubicaciones fisicas y formularios.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nombre</label>
                <input
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full input-dark text-white px-3 py-2.5"
                  placeholder={tipo === 'CATEGORIA_ACTIVO' ? 'Ej: Equipo de soldadura' : 'Ej: Laboratorio movil'}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Clave</label>
                <input
                  value={form.clave}
                  onChange={e => setForm(f => ({ ...f, clave: e.target.value.toUpperCase() }))}
                  disabled={Boolean(editando)}
                  className="w-full input-dark text-white px-3 py-2.5 disabled:opacity-60"
                  placeholder="Automatica si se deja vacia"
                />
              </div>

              {tipo === 'CATEGORIA_ACTIVO' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Prefijo para codigo</label>
                  <input
                    value={form.prefijo_codigo}
                    onChange={e => setForm(f => ({ ...f, prefijo_codigo: e.target.value.toUpperCase() }))}
                    className="w-full input-dark text-white px-3 py-2.5"
                    placeholder="Ej: SOL"
                    maxLength={12}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Alcance</label>
                <SelectDark
                  value={form.alcance}
                  onChange={v => setForm(f => ({ ...f, alcance: v }))}
                  options={[
                    { value: 'AMBOS', label: 'Laboratorio e institucional' },
                    { value: 'LABORATORIO', label: 'Solo laboratorio' },
                    { value: 'INSTITUCIONAL', label: 'Solo institucional' },
                  ]}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  className="w-4 h-4 rounded accent-emerald-600"
                />
                Activo en formularios
              </label>

              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {typeof error === 'string' ? error : 'No se pudo guardar el elemento.'}
                </p>
              )}

              <div className="flex gap-2">
                {editando && (
                  <button type="button" onClick={resetForm} className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-white py-2.5 text-sm font-semibold">
                    Cancelar edicion
                  </button>
                )}
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {guardando ? 'Guardando...' : (editando ? 'Actualizar' : 'Agregar')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalActivo({
  activo,
  labs,
  departamentos,
  departamentosFormulario,
  departamentoBloqueado,
  puedeAsignarLaboratorio,
  puedeValidarInventario,
  ubicaciones,
  categoriasInventario,
  tiposUbicacionInventario,
  laboratorioContextoId,
  categoriaLabContexto,
  onClose,
  onSave,
  onUbicacionCreada,
}) {
  const { themeKey } = useTheme();
  const isDayModal = themeKey === 'day';
  const esEdicion = !!activo;
  const laboratorioInicialId = puedeAsignarLaboratorio
    ? (activo?.laboratorio_id ?? laboratorioContextoId ?? '')
    : '';
  const laboratorioBloqueado = !esEdicion && Boolean(laboratorioContextoId);
  const departamentosDisponibles = departamentosFormulario?.length ? departamentosFormulario : departamentos;
  const departamentoUnico = !esEdicion && departamentoBloqueado && departamentosDisponibles.length === 1
    ? departamentosDisponibles[0].id
    : '';
  const labContexto = laboratorioInicialId
    ? labs.find(l => String(l.id) === String(laboratorioInicialId))
    : null;
  const ubicacionInicial = {
    nombre: '',
    tipo: 'OFICINA',
    edificio: '',
    piso: '',
    referencia: '',
    departamento_id: '',
  };
  const [form, setForm] = useState({
    alcance:           puedeAsignarLaboratorio
      ? (activo?.alcance ?? (laboratorioInicialId ? 'LABORATORIO' : 'INSTITUCIONAL'))
      : 'INSTITUCIONAL',
    laboratorio_id:    laboratorioInicialId,
    departamento_id:   activo?.departamento_id   ?? departamentoUnico,
    ubicacion_id:      activo?.ubicacion_id      ?? '',
    ubicacion_tipo:    activo?.ubicacion_tipo    ?? 'OFICINA',
    ubicacion_nombre:  activo?.ubicacion_nombre  ?? '',
    responsable_id:    activo?.responsable_id    ?? '',
    tipo_inventario:   activo?.tipo_inventario   ?? 'ACTIVO',
    estado_admin:      activo?.estado_admin      ?? (puedeValidarInventario ? 'VALIDADO' : 'BORRADOR'),
    nombre:            activo?.nombre            ?? '',
    categoria:         activo?.categoria         ?? 'COMPUTADORA',
    area:              activo?.area              ?? '',
    numero_oficial:    activo?.numero_oficial    ?? '',
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
  const [ubicacionesLocales, setUbicacionesLocales] = useState(ubicaciones);
  const [modalUbicacion, setModalUbicacion] = useState(false);
  const [formUbicacion, setFormUbicacion] = useState(ubicacionInicial);
  const [guardandoUbicacion, setGuardandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState('');
  const camposTrazablesBloqueados = esEdicion;

  useEffect(() => {
    setUbicacionesLocales(ubicaciones);
  }, [ubicaciones]);

  useEffect(() => {
    if (
      !esEdicion &&
      form.alcance === 'INSTITUCIONAL' &&
      departamentoBloqueado &&
      departamentosDisponibles.length === 1
    ) {
      setForm(f => ({ ...f, departamento_id: f.departamento_id || departamentosDisponibles[0].id }));
    }
  }, [departamentoBloqueado, departamentosDisponibles, esEdicion, form.alcance]);

  const labSeleccionado = form.alcance === 'LABORATORIO' && form.laboratorio_id
    ? labs.find(l => String(l.id) === String(form.laboratorio_id))
    : null;
  const categoriasCatalogo = categoriasInventario?.length
    ? categoriasInventario
    : CATEGORIAS.map(c => ({ clave: c, nombre: categoriaActivoLabel(c), alcance: 'AMBOS' }));
  const tiposUbicacionCatalogo = tiposUbicacionInventario?.length
    ? tiposUbicacionInventario
    : TIPOS_UBICACION.map(t => ({ clave: t, nombre: t.replace(/_/g, ' ') }));
  const categoriaNombre = useMemo(() => {
    const mapa = new Map(categoriasCatalogo.map(i => [i.clave, i.nombre || categoriaActivoLabel(i.clave)]));
    return clave => mapa.get(clave) || categoriaActivoLabel(clave);
  }, [categoriasCatalogo]);
  const categoriasDisponibles = useMemo(() => {
    const categoriaLab = (labSeleccionado?.categoria || categoriaLabContexto || '').toUpperCase();
    const permitidasPorAlcance = categoriasCatalogo
      .filter(item => {
        const alcanceItem = (item.alcance || 'AMBOS').toUpperCase();
        return alcanceItem === 'AMBOS' || alcanceItem === form.alcance;
      })
      .map(item => item.clave);
    const sugeridas = form.alcance === 'LABORATORIO'
      ? (CATEGORIAS_POR_LAB[categoriaLab] || [])
      : CATEGORIAS_BASE;
    const base = [
      ...sugeridas.filter(c => permitidasPorAlcance.includes(c)),
      ...permitidasPorAlcance.filter(c => !sugeridas.includes(c)),
    ];
    if (esEdicion && form.categoria && !base.includes(form.categoria)) {
      return [form.categoria, ...base];
    }
    return base;
  }, [categoriaLabContexto, categoriasCatalogo, esEdicion, form.alcance, form.categoria, labSeleccionado?.categoria]);

  useEffect(() => {
    if (!categoriasDisponibles.includes(form.categoria)) {
      setForm(f => ({ ...f, categoria: categoriasDisponibles[0] || 'OTRO' }));
    }
  }, [categoriasDisponibles, form.categoria]);

  const handleChange = (e) => {
    const val = ['laboratorio_id','departamento_id','ubicacion_id','responsable_id'].includes(e.target.name) ? (e.target.value === '' ? '' : Number(e.target.value))
              : e.target.name === 'valor'          ? (e.target.value === '' ? '' : Number(e.target.value))
              : e.target.name === 'activo'         ? e.target.checked
              : e.target.value;
    const next = {
      ...form,
      [e.target.name]: val,
      ...(e.target.name === 'alcance' && val === 'INSTITUCIONAL' && !laboratorioBloqueado ? { laboratorio_id: '' } : {}),
      ...(e.target.name === 'alcance' && val === 'LABORATORIO' ? { departamento_id: '' } : {}),
    };
    setForm(next);
    setError('');
  };

  const abrirNuevaUbicacion = () => {
    setFormUbicacion({
      ...ubicacionInicial,
      tipo: form.ubicacion_tipo || 'OFICINA',
      departamento_id: form.alcance === 'INSTITUCIONAL' ? (form.departamento_id || '') : '',
    });
    setErrorUbicacion('');
    setModalUbicacion(true);
  };

  const setCampoUbicacion = (campo, valor) => {
    setFormUbicacion(f => ({ ...f, [campo]: valor }));
    setErrorUbicacion('');
  };

  const guardarUbicacion = async (e) => {
    e.preventDefault();
    setGuardandoUbicacion(true);
    try {
      const payload = {
        nombre: formUbicacion.nombre.trim(),
        tipo: formUbicacion.tipo,
        edificio: formUbicacion.edificio.trim() || null,
        piso: formUbicacion.piso.trim() || null,
        referencia: formUbicacion.referencia.trim() || null,
        departamento_id: form.alcance === 'INSTITUCIONAL'
          ? (formUbicacion.departamento_id || null)
          : null,
        activo: true,
      };
      const { data } = await api.post('/inventario/ubicaciones', payload);
      const ordenar = (items) => [...items].sort((a, b) =>
        String(a.label || a.nombre).localeCompare(String(b.label || b.nombre), 'es')
      );
      setUbicacionesLocales(prev => ordenar([...prev.filter(u => u.id !== data.id), data]));
      setForm(f => ({ ...f, ubicacion_id: data.id, ubicacion_nombre: '' }));
      onUbicacionCreada?.(data);
      setModalUbicacion(false);
    } catch (err) {
      setErrorUbicacion(err.response?.data?.detail || 'Error al guardar la ubicacion');
    } finally {
      setGuardandoUbicacion(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (!puedeAsignarLaboratorio) {
        payload.alcance = 'INSTITUCIONAL';
        delete payload.laboratorio_id;
      }
      if (payload.alcance === 'LABORATORIO') {
        delete payload.departamento_id;
      }
      if (!puedeValidarInventario) {
        if (esEdicion) {
          delete payload.estado_admin;
        } else {
          payload.estado_admin = 'BORRADOR';
        }
      }
      if (esEdicion) {
        [
          'alcance',
          'laboratorio_id',
          'departamento_id',
          'ubicacion_id',
          'ubicacion_tipo',
          'ubicacion_nombre',
          'responsable_id',
          'resguardante_externo_nombre',
        ].forEach(k => delete payload[k]);
      }
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
      <div className="glass w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-white">{esEdicion ? 'Editar activo' : 'Nuevo activo'}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm text-slate-300 font-medium mb-1">Adscripción</label>
            <SelectDark
              value={form.alcance}
              onChange={v => handleChange({ target: { name: 'alcance', value: v } })}
              disabled={camposTrazablesBloqueados || laboratorioBloqueado || !puedeAsignarLaboratorio}
              options={(puedeAsignarLaboratorio ? ALCANCES : ['INSTITUCIONAL']).map(a => ({ value: a, label: a === 'INSTITUCIONAL' ? 'Institucional' : 'Asignado a laboratorio' }))}
            />
            {!puedeAsignarLaboratorio && (
              <p className="text-xs text-slate-500 mt-1.5">
                Tu inventario se registra como institucional del departamento asignado.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-slate-300 font-medium mb-1">Estado administrativo</label>
            {puedeValidarInventario ? (
              <SelectDark
                value={form.estado_admin}
                onChange={v => handleChange({ target: { name: 'estado_admin', value: v } })}
                options={ESTADOS_ADMIN.map(e => ({ value: e, label: e.replace(/_/g, ' ') }))}
              />
            ) : (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-amber-300">
                  {esEdicion ? form.estado_admin.replace(/_/g, ' ') : 'BORRADOR'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Los activos registrados se envían a revisión. Solo Inventario Institucional puede validarlos oficialmente.
                </p>
              </div>
            )}
          </div>

          {/* Laboratorio */}
          {form.alcance === 'LABORATORIO' && (
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1">
                Laboratorio asignado <span className="text-red-400/80 ml-0.5">*</span>
              </label>
              <SelectDark
                value={form.laboratorio_id}
                onChange={v => handleChange({ target: { name: 'laboratorio_id', value: v } })}
                disabled={camposTrazablesBloqueados || laboratorioBloqueado}
                placeholder={labContexto ? labContexto.nombre : 'Seleccionar laboratorio...'}
                options={[
                  ...(laboratorioBloqueado ? [] : [{ value: '', label: 'Seleccionar laboratorio...' }]),
                  ...labs.map(l => ({ value: l.id, label: l.nombre, sublabel: categoriaLabLabel(l.categoria) })),
                ]}
              />
              {laboratorioBloqueado && labContexto && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Se asignará automáticamente a {labContexto.nombre}.
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1.5">
                Para activos de laboratorio, el laboratorio es el responsable operativo; no requiere departamento responsable.
              </p>
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

          {camposTrazablesBloqueados && (
            <div className={`rounded-xl px-4 py-3 text-xs border ${
              isDayModal
                ? 'bg-blue-50 border-blue-300 text-blue-950'
                : 'bg-blue-950/30 border-blue-900 text-blue-100'
            }`}>
              {form.alcance === 'LABORATORIO'
                ? 'Ubicacion y resguardante se cambian desde Movimiento para conservar el historial del activo. El responsable operativo es el laboratorio.'
                : 'Departamento, ubicacion, resguardante y adscripcion se cambian desde Movimiento para conservar el historial del activo.'}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Numero oficial/patrimonial</label>
            <input name="numero_oficial" value={form.numero_oficial} onChange={handleChange}
              placeholder="Ej: etiqueta fisica, folio SIGA o numero patrimonial"
              className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>

          <div>
            <label className="block text-sm text-slate-300 font-medium mb-1">
              Nombre <span className="text-red-400/80 ml-0.5">*</span>
            </label>
            <input name="nombre" value={form.nombre} onChange={handleChange} required
              placeholder="Ej: Impresora 3D Creality Ender 3"
              className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>

          <div className={`grid gap-4 ${form.alcance === 'INSTITUCIONAL' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {form.alcance === 'INSTITUCIONAL' && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Departamento responsable</label>
                <SelectDark
                  value={form.departamento_id}
                  onChange={v => handleChange({ target: { name: 'departamento_id', value: v } })}
                  disabled={camposTrazablesBloqueados || departamentoBloqueado}
                  placeholder="Sin departamento"
                  options={[
                    ...(departamentoBloqueado ? [] : [{ value: '', label: 'Sin departamento' }]),
                    ...departamentosDisponibles.map(d => ({ value: d.id, label: d.nombre })),
                  ]}
                />
                {departamentoBloqueado && departamentosDisponibles.length === 1 && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    El registro queda limitado a tu departamento asignado.
                  </p>
                )}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className="block text-sm text-slate-400">Ubicación registrada</label>
                <button
                  type="button"
                  onClick={abrirNuevaUbicacion}
                  disabled={camposTrazablesBloqueados}
                  className="text-xs text-emerald-300 hover:text-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Nueva
                </button>
              </div>
              <SelectDark
                value={form.ubicacion_id}
                onChange={v => handleChange({ target: { name: 'ubicacion_id', value: v } })}
                disabled={camposTrazablesBloqueados}
                placeholder="Sin ubicación"
                options={[{ value: '', label: 'Sin ubicación' }, ...ubicacionesLocales.map(u => ({ value: u.id, label: u.label || u.nombre, sublabel: u.tipo }))]}
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
                disabled={camposTrazablesBloqueados}
                placeholder="Nombre del responsable"
                className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"/>
            </div>
          </div>

          {!form.ubicacion_id && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Tipo de ubicación</label>
                <SelectDark
                  value={form.ubicacion_tipo}
                  onChange={v => handleChange({ target: { name: 'ubicacion_tipo', value: v } })}
                  disabled={camposTrazablesBloqueados}
                  options={tiposUbicacionCatalogo.map(t => ({ value: t.clave, label: t.nombre || t.clave.replace(/_/g, ' ') }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Ubicación física</label>
                <input name="ubicacion_nombre" value={form.ubicacion_nombre} onChange={handleChange}
                  disabled={camposTrazablesBloqueados}
                  placeholder="Ej: Edificio A / Oficina Sistemas"
                  className="w-full input-dark text-white  px-3 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"/>
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
                options={categoriasDisponibles.map(c => ({
                  value: c,
                  label: categoriaNombre(c),
                }))}
              />
              {(labSeleccionado?.categoria || categoriaLabContexto) && CATEGORIAS_POR_LAB[(labSeleccionado?.categoria || categoriaLabContexto || '').toUpperCase()] && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Categorías sugeridas para {categoriaLabLabel(labSeleccionado?.categoria || categoriaLabContexto)}.
                </p>
              )}
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
      {modalUbicacion && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="glass rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Nueva ubicacion</h3>
                <p className="text-xs text-slate-400 mt-0.5">Crea una ubicacion reutilizable para inventario.</p>
              </div>
              <button type="button" onClick={() => setModalUbicacion(false)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <form onSubmit={guardarUbicacion} className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-300 font-medium mb-1">
                  Nombre <span className="text-red-400/80 ml-0.5">*</span>
                </label>
                <input
                  value={formUbicacion.nombre}
                  onChange={e => setCampoUbicacion('nombre', e.target.value)}
                  required
                  minLength={2}
                  maxLength={150}
                  placeholder="Ej: Oficina Sistemas, Aula 3, Rack 1"
                  className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className={`grid gap-4 ${form.alcance === 'INSTITUCIONAL' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Tipo</label>
                  <SelectDark
                    value={formUbicacion.tipo}
                    onChange={v => setCampoUbicacion('tipo', v)}
                    options={tiposUbicacionCatalogo.map(t => ({ value: t.clave, label: t.nombre || t.clave.replace(/_/g, ' ') }))}
                  />
                </div>
                {form.alcance === 'INSTITUCIONAL' && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Departamento</label>
                    <SelectDark
                      value={formUbicacion.departamento_id}
                      onChange={v => setCampoUbicacion('departamento_id', v)}
                      disabled={departamentoBloqueado}
                      placeholder="Sin departamento"
                      options={[
                        ...(departamentoBloqueado ? [] : [{ value: '', label: 'Sin departamento' }]),
                        ...departamentosDisponibles.map(d => ({ value: d.id, label: d.nombre })),
                      ]}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Edificio</label>
                  <input
                    value={formUbicacion.edificio}
                    onChange={e => setCampoUbicacion('edificio', e.target.value)}
                    maxLength={120}
                    placeholder="Ej: Edificio A"
                    className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Piso</label>
                  <input
                    value={formUbicacion.piso}
                    onChange={e => setCampoUbicacion('piso', e.target.value)}
                    maxLength={40}
                    placeholder="Ej: Planta baja"
                    className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Referencia</label>
                <input
                  value={formUbicacion.referencia}
                  onChange={e => setCampoUbicacion('referencia', e.target.value)}
                  maxLength={250}
                  placeholder="Ej: Junto al area de soporte"
                  className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {errorUbicacion && (
                <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{errorUbicacion}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalUbicacion(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/15 text-slate-300 hover:bg-white/8 hover:text-white text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoUbicacion}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {guardandoUbicacion ? 'Guardando...' : 'Crear y seleccionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

function ModalMovimiento({ activo, departamentos, ubicaciones, onClose, onSave }) {
  const { themeKey } = useTheme();
  const isDayModal = themeKey === 'day';
  const [form, setForm] = useState({
    tipo: 'TRANSFERENCIA_DEPARTAMENTO',
    departamento_destino_id: activo?.departamento_id ?? '',
    ubicacion_destino_id: activo?.ubicacion_id ?? '',
    ubicacion_destino_nombre: '',
    resguardante_destino_id: activo?.responsable_id ?? '',
    resguardante_destino_nombre: activo?.resguardante_externo_nombre ?? '',
    observaciones: '',
  });
  const [resguardantes, setResguardantes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (form.departamento_destino_id) params.append('departamento_id', form.departamento_destino_id);
    if (!form.departamento_destino_id && activo?.laboratorio_id) params.append('laboratorio_id', activo.laboratorio_id);
    api.get(`/inventario/resguardantes-opciones?${params}`)
      .then(r => setResguardantes(Array.isArray(r.data) ? r.data : []))
      .catch(() => setResguardantes([]));
  }, [form.departamento_destino_id, activo?.laboratorio_id]);

  const handleChange = (e) => {
    const val = ['departamento_destino_id','ubicacion_destino_id','resguardante_destino_id'].includes(e.target.name)
      ? (e.target.value === '' ? '' : Number(e.target.value))
      : e.target.value;
    setForm({
      ...form,
      [e.target.name]: val,
      ...(e.target.name === 'resguardante_destino_id' && val ? { resguardante_destino_nombre: '' } : {}),
      ...(e.target.name === 'resguardante_destino_nombre' && val ? { resguardante_destino_id: '' } : {}),
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      ['departamento_destino_id','ubicacion_destino_id','ubicacion_destino_nombre','resguardante_destino_id','resguardante_destino_nombre','observaciones'].forEach(k => {
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
          <div className={`rounded-xl px-4 py-3 text-xs border ${
            isDayModal
              ? 'bg-blue-50 border-blue-300 text-blue-950'
              : 'bg-blue-950/30 border-blue-900 text-blue-100'
          }`}>
            Este registro actualiza el activo y deja trazabilidad en el expediente: origen, destino, responsable, fecha y motivo.
          </div>

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
              <label className="block text-sm text-slate-400 mb-1">Ubicación destino</label>
              <SelectDark
                value={form.ubicacion_destino_id}
                onChange={v => handleChange({ target: { name: 'ubicacion_destino_id', value: v } })}
                options={[{ value: '', label: 'Sin ubicación registrada' }, ...ubicaciones.map(u => ({ value: u.id, label: u.label || u.nombre, sublabel: u.tipo }))]}
              />
            </div>
          </div>

          {!form.ubicacion_destino_id && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ubicación física destino</label>
              <input name="ubicacion_destino_nombre" value={form.ubicacion_destino_nombre} onChange={handleChange}
                placeholder="Ej: Edificio B / Aula 3"
                className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Resguardante SIGA</label>
              <SelectDark
                value={form.resguardante_destino_id}
                onChange={v => handleChange({ target: { name: 'resguardante_destino_id', value: v } })}
                placeholder="Sin usuario SIGA"
                options={[
                  { value: '', label: 'Sin usuario SIGA' },
                  ...resguardantes.map(u => ({
                    value: u.id,
                    label: u.nombre,
                    sublabel: u.departamento_nombre || u.laboratorio_nombre || u.email,
                  })),
                ]}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Resguardante externo</label>
              <input name="resguardante_destino_nombre" value={form.resguardante_destino_nombre} onChange={handleChange}
                disabled={Boolean(form.resguardante_destino_id)}
                placeholder="Nombre si no tiene cuenta SIGA"
                className="w-full input-dark text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"/>
            </div>
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
              className="flex-1 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              style={{ color: '#FFFFFF' }}>
              {loading ? 'Registrando...' : 'Registrar movimiento'}
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

const TABS = [
  { key: 'activos',         label: 'Activos' },
  { key: 'revision',        label: 'Revision' },
  { key: 'bajas',           label: 'Bajas' },
  { key: 'levantamientos',  label: 'Levantamientos' },
];

const VALIDACION_DECISION = {
  OBSERVADO: {
    titulo: 'Enviar observación',
    etiqueta: 'Observación para corregir',
    descripcion: 'El activo regresará al responsable para que corrija la información y pueda volver a revisión.',
    ayuda: 'Indica con precisión qué dato, documento o evidencia debe corregirse.',
    ejemplo: 'Ej. Falta capturar el número de serie y adjuntar evidencia de la etiqueta física.',
    boton: 'Enviar observación',
    tono: 'amber',
  },
  RECHAZADO: {
    titulo: 'No autorizar activo',
    etiqueta: 'Motivo de no autorización',
    descripcion: 'El alta no procederá. El responsable no podrá modificarla hasta que Inventario Institucional la reabra.',
    ayuda: 'Explica la causa administrativa, normativa o de duplicidad que impide autorizar el registro.',
    ejemplo: 'Ej. El activo ya está registrado con otro número patrimonial.',
    boton: 'No autorizar activo',
    tono: 'red',
  },
};

function ModalDecisionValidacion({
  decision,
  validando,
  isDay,
  onClose,
  onConfirmar,
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const config = VALIDACION_DECISION[decision.estado];
  const esRechazo = config.tono === 'red';

  useEffect(() => {
    textareaRef.current?.focus();
    const cerrarConEscape = (event) => {
      if (event.key === 'Escape' && !validando) onClose();
    };
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, [onClose, validando]);

  const confirmar = (event) => {
    event.preventDefault();
    const limpio = motivo.trim();
    if (!limpio) {
      setError('Escribe el motivo antes de continuar.');
      textareaRef.current?.focus();
      return;
    }
    onConfirmar(limpio);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={event => event.target === event.currentTarget && !validando && onClose()}
    >
      <form
        onSubmit={confirmar}
        className={`w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl ${
          isDay
            ? 'border-slate-200 bg-white'
            : 'border-white/10 bg-slate-900'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-validacion-titulo"
      >
        <div className={`border-b px-6 py-5 ${isDay ? 'border-slate-200' : 'border-white/10'}`}>
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              esRechazo
                ? 'bg-red-500/15 text-red-500'
                : 'bg-amber-500/15 text-amber-500'
            }`}>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={esRechazo
                    ? 'M6 18L18 6M6 6l12 12'
                    : 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'}
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="decision-validacion-titulo" className={`text-lg font-bold ${isDay ? 'text-slate-950' : 'text-white'}`}>
                {config.titulo}
              </h2>
              <p className={`mt-1 text-sm ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>
                {decision.activo.nombre}
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                {decision.activo.codigo_inventario}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={validando}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-500/10 hover:text-slate-300 disabled:opacity-50"
              aria-label="Cerrar"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className={`rounded-xl border px-4 py-3 ${
            esRechazo
              ? 'border-red-500/25 bg-red-500/10'
              : 'border-amber-500/25 bg-amber-500/10'
          }`}>
            <p className={`text-sm font-semibold ${esRechazo ? 'text-red-400' : 'text-amber-400'}`}>
              ¿Qué ocurrirá?
            </p>
            <p className={`mt-1 text-sm leading-relaxed ${isDay ? 'text-slate-700' : 'text-slate-300'}`}>
              {config.descripcion}
            </p>
          </div>

          <div>
            <label htmlFor="motivo-validacion" className={`mb-1.5 block text-sm font-semibold ${isDay ? 'text-slate-800' : 'text-slate-200'}`}>
              {config.etiqueta} <span className="text-red-500">*</span>
            </label>
            <p className="mb-2 text-xs text-slate-500">{config.ayuda}</p>
            <textarea
              ref={textareaRef}
              id="motivo-validacion"
              value={motivo}
              onChange={event => {
                setMotivo(event.target.value.slice(0, 500));
                if (error) setError('');
              }}
              rows={5}
              maxLength={500}
              placeholder={config.ejemplo}
              className={`w-full resize-none rounded-xl border px-3 py-3 text-sm outline-none transition ${
                isDay
                  ? 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                  : 'border-white/15 bg-slate-950/70 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              } ${error ? 'border-red-500' : ''}`}
            />
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <p className="text-xs text-red-400">{error}</p>
              <p className="text-xs text-slate-500">{motivo.length}/500</p>
            </div>
          </div>
        </div>

        <div className={`flex gap-3 border-t px-6 py-4 ${isDay ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.02]'}`}>
          <button
            type="button"
            onClick={onClose}
            disabled={validando}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
              isDay
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-white/15 text-slate-300 hover:bg-white/10'
            }`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={validando}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold !text-white transition-colors disabled:opacity-50 ${
              esRechazo
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-700 hover:bg-amber-800'
            }`}
            style={{ color: '#FFFFFF' }}
          >
            {validando ? 'Procesando...' : config.boton}
          </button>
        </div>
      </form>
    </div>
  );
}

function PanelRevisionInventario({
  activos,
  loading,
  validandoId,
  onCambiarEstado,
  onEditar,
  onExpediente,
  isDay,
}) {
  const [filtros, setFiltros] = useState({
    q: '',
    departamento: '',
    laboratorio: '',
    estado: '',
    fecha: '',
  });

  const departamentos = useMemo(() => {
    const map = new Map();
    activos.forEach(a => {
      if ((a.alcance || '').toUpperCase() === 'LABORATORIO') return;
      const key = a.departamento_id ? String(a.departamento_id) : '__SIN_DEPTO__';
      const label = a.departamento_nombre || 'Sin departamento';
      map.set(key, label);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [activos]);

  const laboratorios = useMemo(() => {
    const map = new Map();
    activos.forEach(a => {
      if (!a.laboratorio_id && !a.laboratorio_nombre) return;
      const key = a.laboratorio_id ? String(a.laboratorio_id) : a.laboratorio_nombre;
      map.set(key, a.laboratorio_nombre || `Laboratorio ${a.laboratorio_id}`);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [activos]);

  const activosFiltrados = useMemo(() => {
    const q = filtros.q.trim().toLowerCase();
    return activos.filter(a => {
      const texto = [
        a.nombre,
        a.codigo_inventario,
        a.numero_oficial,
        a.numero_serie,
        a.marca,
        a.modelo,
        a.departamento_nombre,
        a.laboratorio_nombre,
        a.ubicacion_label,
        a.ubicacion_nombre,
        a.responsable_nombre,
        a.registrado_por_nombre,
      ].filter(Boolean).join(' ').toLowerCase();
      const depKey = (a.alcance || '').toUpperCase() === 'LABORATORIO'
        ? ''
        : (a.departamento_id ? String(a.departamento_id) : '__SIN_DEPTO__');
      const labKey = a.laboratorio_id ? String(a.laboratorio_id) : a.laboratorio_nombre;
      const fechaBase = (a.validacion_fecha || a.registrado_fecha || '').slice(0, 10);
      return (
        (!q || texto.includes(q)) &&
        (!filtros.departamento || depKey === filtros.departamento) &&
        (!filtros.laboratorio || labKey === filtros.laboratorio) &&
        (!filtros.estado || (a.estado_admin || 'BORRADOR') === filtros.estado) &&
        (!filtros.fecha || fechaBase === filtros.fecha)
      );
    });
  }, [activos, filtros]);

  const filtrosActivos = filtros.q || filtros.departamento || filtros.laboratorio || filtros.estado || filtros.fecha;

  const conteos = activosFiltrados.reduce((acc, a) => {
    const key = a.estado_admin || 'VALIDADO';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const estadoClass = (estado) => {
    if (estado === 'EN_REVISION') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    if (estado === 'OBSERVADO') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (estado === 'RECHAZADO') return 'bg-red-500/15 text-red-300 border-red-500/30';
    return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <svg className="animate-spin w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl border p-4"
        style={{
          background: isDay ? '#FFFFFF' : 'rgba(15,23,42,0.55)',
          borderColor: isDay ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 min-w-[220px]">
            <label className={`block text-xs font-semibold mb-1.5 ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Buscar activo</label>
            <input
              value={filtros.q}
              onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
              placeholder="Codigo, serie, nombre, responsable..."
              className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                isDay
                  ? 'bg-white border-slate-300 text-slate-950 placeholder:text-slate-400 focus:border-emerald-500'
                  : 'bg-slate-950/60 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500'
              }`}
            />
          </div>
          <div className="w-full lg:w-56">
            <label className={`block text-xs font-semibold mb-1.5 ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Departamento</label>
            <SelectDark
              value={filtros.departamento}
              onChange={v => setFiltros(f => ({ ...f, departamento: v }))}
              placeholder="Todos"
              options={[
                { value: '', label: 'Todos' },
                ...departamentos.map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
          <div className="w-full lg:w-56">
            <label className={`block text-xs font-semibold mb-1.5 ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Laboratorio</label>
            <SelectDark
              value={filtros.laboratorio}
              onChange={v => setFiltros(f => ({ ...f, laboratorio: v }))}
              placeholder="Todos"
              options={[
                { value: '', label: 'Todos' },
                ...laboratorios.map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
          <div className="w-full lg:w-44">
            <label className={`block text-xs font-semibold mb-1.5 ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Estado</label>
            <SelectDark
              value={filtros.estado}
              onChange={v => setFiltros(f => ({ ...f, estado: v }))}
              placeholder="Todos"
              options={[
                { value: '', label: 'Todos' },
                { value: 'BORRADOR', label: 'Borrador' },
                { value: 'EN_REVISION', label: 'En revision' },
                { value: 'OBSERVADO', label: 'Observado' },
                { value: 'RECHAZADO', label: 'No autorizado' },
              ]}
            />
          </div>
          <div className="w-full lg:w-44">
            <label className={`block text-xs font-semibold mb-1.5 ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Dia</label>
            <input
              type="date"
              value={filtros.fecha}
              onChange={e => setFiltros(f => ({ ...f, fecha: e.target.value }))}
              className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                isDay
                  ? 'bg-white border-slate-300 text-slate-950 focus:border-emerald-500'
                  : 'bg-slate-950/60 border-white/10 text-white focus:border-emerald-500'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltros({ q: '', departamento: '', laboratorio: '', estado: '', fecha: '' })}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              filtrosActivos
                ? isDay
                  ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                  : 'border-white/10 bg-slate-800 text-white hover:bg-slate-700'
                : isDay
                  ? 'border-slate-200 bg-slate-50 text-slate-400'
                  : 'border-white/5 bg-slate-900/40 text-slate-600'
            }`}
            disabled={!filtrosActivos}
          >
            Limpiar
          </button>
        </div>
        <p className={`mt-3 text-xs ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
          Mostrando {activosFiltrados.length} de {activos.length} activo(s) pendientes. La fecha usa el registro inicial o la ultima revision del activo.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['BORRADOR', 'EN_REVISION', 'OBSERVADO', 'RECHAZADO'].map(estado => (
          <div key={estado} className="glass p-4">
            <p className={`text-2xl font-bold ${conteos[estado] ? 'text-emerald-400' : 'text-slate-500'}`}>
              {conteos[estado] || 0}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {estado === 'RECHAZADO' ? 'NO AUTORIZADO' : estado.replace(/_/g, ' ')}
            </p>
          </div>
        ))}
      </div>

      {activosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">OK</p>
          <p>{activos.length === 0 ? 'No hay activos pendientes de revision.' : 'No hay activos con esos filtros.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activosFiltrados.map(a => (
            <div
              key={a.id}
              className="rounded-xl p-4 border"
              style={{
                background: isDay ? '#FFFFFF' : 'rgba(30,41,59,0.55)',
                borderColor: isDay ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`font-semibold ${isDay ? 'text-slate-950' : 'text-white'}`}>{a.nombre}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{a.codigo_inventario}</p>
                  {a.numero_oficial && (
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">Oficial: {a.numero_oficial}</p>
                  )}
                </div>
                <span className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border font-semibold ${estadoClass(a.estado_admin)}`}>
                  {a.estado_admin === 'RECHAZADO'
                    ? 'NO AUTORIZADO'
                    : (a.estado_admin || 'BORRADOR').replace(/_/g, ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-slate-500">
                <p>Responsable: <span className={isDay ? 'text-slate-700' : 'text-slate-300'}>{responsablePatrimonialLabel(a)}</span></p>
                <p>Ubicacion: <span className={isDay ? 'text-slate-700' : 'text-slate-300'}>{a.ubicacion_label || a.ubicacion_nombre || 'Sin ubicacion'}</span></p>
                <p>Categoria: <span className={isDay ? 'text-slate-700' : 'text-slate-300'}>{categoriaActivoLabel(a.categoria)}</span></p>
                <p>Serie: <span className={isDay ? 'text-slate-700' : 'text-slate-300'}>{a.numero_serie || 'Sin serie'}</span></p>
                <p>Registro: <span className={isDay ? 'text-slate-700' : 'text-slate-300'}>{formatFechaCorta(a.registrado_fecha) || 'Sin fecha'}</span></p>
                <p>Revisor: <span className={isDay ? 'text-slate-700' : 'text-slate-300'}>{a.validacion_revisor || 'Sin revisar'}</span></p>
              </div>
              {a.validacion_motivo && (
                <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs text-amber-200">
                    {a.estado_admin === 'RECHAZADO' ? 'Motivo de no autorización' : 'Observación'}: {a.validacion_motivo}
                  </p>
                  {a.validacion_revisor && (
                    <p className="text-[10px] text-slate-500 mt-1">Revisó: {a.validacion_revisor}</p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-white/10">
                {a.estado_admin !== 'EN_REVISION' && (
                  <button
                    type="button"
                    disabled={validandoId === `${a.id}-EN_REVISION`}
                    onClick={() => onCambiarEstado(a, 'EN_REVISION')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 hover:bg-blue-800 !text-white disabled:opacity-50"
                    style={{ color: '#FFFFFF' }}
                  >
                    En revision
                  </button>
                )}
                <button
                  type="button"
                  disabled={validandoId === `${a.id}-VALIDADO`}
                  onClick={() => onCambiarEstado(a, 'VALIDADO')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 !text-white disabled:opacity-50"
                  style={{ color: '#FFFFFF' }}
                >
                  Validar
                </button>
                <button
                  type="button"
                  disabled={validandoId === `${a.id}-OBSERVADO`}
                  onClick={() => onCambiarEstado(a, 'OBSERVADO')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 hover:bg-amber-800 !text-white disabled:opacity-50"
                  style={{ color: '#FFFFFF' }}
                >
                  Observar
                </button>
                <button
                  type="button"
                  disabled={validandoId === `${a.id}-RECHAZADO`}
                  onClick={() => onCambiarEstado(a, 'RECHAZADO')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-700 hover:bg-red-800 !text-white disabled:opacity-50"
                  style={{ color: '#FFFFFF' }}
                >
                  No autorizar
                </button>
                <button
                  type="button"
                  onClick={() => onEditar(a)}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white"
                >
                  Editar datos
                </button>
                <button
                  type="button"
                  onClick={() => onExpediente(a)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white"
                >
                  Expediente
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Inventario() {
  const { themeKey } = useTheme();
  const { toast } = useToast();
  const { usuario } = useAuth();
  const { can } = usePermission();
  const puedeEditarInventario = can('inventario:write');
  const puedeValidarInventario = can('inventario:validar');
  const puedeImportarInventario = can('inventario:import') || puedeEditarInventario;
  const puedeExportarInventario = can('inventario:read');
  const puedeUsarPrestamos = can('prestamos:write');
  const puedeAsignarLaboratorio = ['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB'].includes(usuario?.rol);
  const isDay = themeKey === 'day';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabsVisibles = TABS.filter(t => {
    if (t.key === 'activos') return true;
    if (t.key === 'revision') return puedeValidarInventario;
    return puedeEditarInventario;
  });
  const tabActivo = tabsVisibles.find(t => t.key === searchParams.get('tab'))?.key || 'activos';
  const [activos, setActivos]   = useState([]);
  const [labs, setLabs]         = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [departamentosFormulario, setDepartamentosFormulario] = useState([]);
  const [departamentosFormularioGlobal, setDepartamentosFormularioGlobal] = useState(true);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [catalogoInventario, setCatalogoInventario] = useState({
    categorias_items: CATEGORIAS.map(c => ({ clave: c, nombre: categoriaActivoLabel(c), alcance: 'AMBOS', base: true, activo: true })),
    tipos_ubicacion_items: TIPOS_UBICACION.map(t => ({ clave: t, nombre: t.replace(/_/g, ' '), alcance: 'AMBOS', base: true, activo: true })),
  });
  const [stats, setStats]       = useState(null);
  const [mantenimientoAlertas, setMantenimientoAlertas] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filtroLab, setFiltroLab]         = useState(searchParams.get('laboratorio_id') || '');
  const [filtroAlcance, setFiltroAlcance] = useState('');
  const [filtroDepartamento, setFiltroDepartamento] = useState('');
  const [filtroUbicacion, setFiltroUbicacion] = useState('');
  const [filtroEstadoAdmin, setFiltroEstadoAdmin] = useState(searchParams.get('estado_admin') || '');
  const [filtroCat, setFiltroCat]         = useState('');
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [busqueda, setBusqueda]           = useState(searchParams.get('buscar') || '');
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const vistaGrid = false;
  const setVistaGrid = () => {};
  const [modalNuevo, setModalNuevo]       = useState(false);
  const [activoEditar, setActivoEditar]   = useState(null);
  const [activoMover, setActivoMover]     = useState(null);
  const [activoBaja, setActivoBaja]       = useState(null);
  const [activoExpediente, setActivoExpediente] = useState(null);
  const [modalImportar, setModalImportar] = useState(false);
  const [modalCatalogo, setModalCatalogo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [validandoId, setValidandoId] = useState(null);
  const [decisionValidacion, setDecisionValidacion] = useState(null);
  const categoriaLabContexto = searchParams.get('categoria_lab') || '';
  const laboratorioContextoId = filtroLab || (labs.length === 1 ? labs[0].id : '');

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
      statsParams.delete('estado_admin');
      statsParams.delete('solo_disponibles');
      const mantParams = new URLSearchParams(params);
      mantParams.delete('solo_disponibles');

      const [rA, rL, rD, rDW, rU, rS, rM, rC] = await Promise.all([
        api.get(`/inventario/activos?${params}`),
        api.get('/laboratorios?solo_activos=false'),
        api.get('/inventario/departamentos-opciones?modo=lectura'),
        api.get('/inventario/departamentos-opciones?modo=escritura'),
        api.get('/inventario/ubicaciones'),
        api.get(`/inventario/estadisticas?${statsParams}`),
        api.get(`/inventario/mantenimiento-alertas?${mantParams}`),
        api.get('/inventario/categorias'),
      ]);
      setActivos(rA.data);
      setLabs(rL.data);
      setDepartamentos(rD.data.items || []);
      setDepartamentosFormulario(rDW.data.items || []);
      setDepartamentosFormularioGlobal(Boolean(rDW.data.scope_global));
      setUbicaciones(rU.data);
      setStats(rS.data);
      setMantenimientoAlertas(rM.data);
      setCatalogoInventario(rC.data);
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
      || (a.numero_oficial || '').toLowerCase().includes(q)
      || (a.marca || '').toLowerCase().includes(q)
      || (a.modelo || '').toLowerCase().includes(q)
      || (a.departamento_nombre || '').toLowerCase().includes(q)
      || (a.ubicacion_label || '').toLowerCase().includes(q)
      || (a.resguardante_externo_nombre || '').toLowerCase().includes(q)
      || (a.responsable_nombre || '').toLowerCase().includes(q);
  });
  const activosRevision = activosFiltrados.filter(a =>
    ['BORRADOR', 'EN_REVISION', 'OBSERVADO', 'RECHAZADO'].includes(a.estado_admin || 'BORRADOR')
  );
  const conteosValidacion = stats?.por_estado_admin || {};
  const categoriasFiltro = catalogoInventario.categorias_items?.length
    ? catalogoInventario.categorias_items
    : CATEGORIAS.map(c => ({ clave: c, nombre: categoriaActivoLabel(c) }));

  const filtrosAplicados = [
    filtroLab,
    filtroAlcance,
    filtroDepartamento,
    filtroUbicacion,
    filtroEstadoAdmin,
    filtroCat,
    filtroEstado,
  ].filter(Boolean).length;

  const limpiarFiltros = () => {
    setFiltroLab('');
    setFiltroAlcance('');
    setFiltroDepartamento('');
    setFiltroUbicacion('');
    setFiltroEstadoAdmin('');
    setFiltroCat('');
    setFiltroEstado('');
  };

  const exportarCorte = async () => {
    setExportando(true);
    try {
      const params = new URLSearchParams();
      if (filtroLab) params.append('laboratorio_id', filtroLab);
      if (filtroAlcance) params.append('alcance', filtroAlcance);
      if (filtroDepartamento) params.append('departamento_id', filtroDepartamento);
      if (filtroUbicacion) params.append('ubicacion_id', filtroUbicacion);
      if (filtroEstadoAdmin) params.append('estado_admin', filtroEstadoAdmin);
      if (filtroCat) params.append('categoria', filtroCat);
      if (filtroEstado) params.append('estado', filtroEstado);
      if (soloDisponibles) params.append('solo_disponibles', 'true');
      if (busqueda.trim()) params.append('buscar', busqueda.trim());

      const response = await api.get(`/inventario/activos/exportar?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `corte_inventario_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast('Corte de inventario generado.', 'success');
    } catch (error) {
      toast(error.response?.data?.detail || 'No se pudo exportar el corte de inventario.', 'error');
    } finally {
      setExportando(false);
    }
  };

  const descargarResguardo = async (activo) => {
    try {
      const response = await api.get(`/inventario/activos/${activo.id}/resguardo`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `resguardo_${activo.codigo_inventario || activo.id}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast('Formato de resguardo generado.', 'success');
    } catch (error) {
      toast(error.response?.data?.detail || 'No se pudo generar el resguardo.', 'error');
    }
  };

  const descargarEtiquetas = async (activo = null) => {
    try {
      let endpoint = '';
      if (activo?.id) {
        endpoint = `/inventario/activos/${activo.id}/etiqueta`;
      } else {
        const params = new URLSearchParams();
        if (filtroLab) params.append('laboratorio_id', filtroLab);
        if (filtroAlcance) params.append('alcance', filtroAlcance);
        if (filtroDepartamento) params.append('departamento_id', filtroDepartamento);
        if (filtroUbicacion) params.append('ubicacion_id', filtroUbicacion);
        if (filtroEstadoAdmin) params.append('estado_admin', filtroEstadoAdmin);
        if (filtroCat) params.append('categoria', filtroCat);
        if (filtroEstado) params.append('estado', filtroEstado);
        if (soloDisponibles) params.append('solo_disponibles', 'true');
        if (busqueda.trim()) params.append('buscar', busqueda.trim());
        endpoint = `/inventario/activos/etiquetas?${params}`;
      }
      const response = await api.get(endpoint, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = activo?.id
        ? `etiqueta_${activo.codigo_inventario || activo.id}.pdf`
        : `etiquetas_inventario_${new Date().toISOString().slice(0, 10)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast(activo?.id ? 'Etiqueta generada.' : 'Etiquetas generadas.', 'success');
    } catch (error) {
      toast(error.response?.data?.detail || 'No se pudieron generar las etiquetas.', 'error');
    }
  };

  const abrirMantenimientoActivo = (activo, nuevo = false) => {
    const params = new URLSearchParams({
      tab: 'preventivo',
      activo_id: String(activo.id),
    });
    if (nuevo) params.set('nuevo', '1');
    navigate(`/admin/mantenimiento?${params.toString()}`);
  };

  const actualizarEstadoValidacion = async (activo, estado, observaciones = '') => {
    setValidandoId(`${activo.id}-${estado}`);
    try {
      await api.post(`/inventario/activos/${activo.id}/validacion`, {
        estado_admin: estado,
        observaciones: observaciones?.trim() || null,
      });
      const mensajes = {
        OBSERVADO: 'Observación enviada al responsable.',
        RECHAZADO: 'El activo quedó como no autorizado.',
        VALIDADO: 'Activo validado oficialmente.',
        EN_REVISION: 'Activo marcado en revisión.',
        BORRADOR: 'Activo devuelto a borrador.',
      };
      toast(mensajes[estado] || `Activo marcado como ${estado.replace(/_/g, ' ')}.`, 'success');
      setDecisionValidacion(null);
      await cargar();
    } catch (error) {
      toast(error.response?.data?.detail || 'No se pudo actualizar la validacion.', 'error');
    } finally {
      setValidandoId(null);
    }
  };

  const cambiarEstadoValidacion = (activo, estado) => {
    if (estado === 'OBSERVADO' || estado === 'RECHAZADO') {
      setDecisionValidacion({ activo, estado });
      return;
    }
    actualizarEstadoValidacion(activo, estado);
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventario institucional</h1>
          <p className="text-slate-400 text-sm mt-0.5">Activos, bajas y levantamientos físicos</p>
        </div>
        <div className="flex gap-2">
          {tabActivo === 'activos' && puedeUsarPrestamos && <button onClick={() => navigate('/admin/prestamos')}
            className="flex items-center gap-2 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
            Préstamos
          </button>}
          {tabActivo === 'activos' && puedeValidarInventario && <button onClick={() => setModalCatalogo(true)}
            className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(59,130,246,0.18)',
              border: '1px solid rgba(59,130,246,0.35)',
            }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h10M4 17h7"/>
            </svg>
            Catálogos inventario
          </button>}
          {tabActivo === 'activos' && puedeImportarInventario && <button onClick={() => setModalImportar(true)}
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
          </button>}
          {tabActivo === 'activos' && puedeExportarInventario && <button onClick={exportarCorte}
            disabled={exportando}
            title="Por defecto incluye únicamente activos validados"
            className="flex items-center gap-2 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}>
            <svg className={`w-4 h-4 ${exportando ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {exportando
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8"/>
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M4 5h16v14H4z"/>}
            </svg>
            {exportando ? 'Exportando...' : 'Exportar corte oficial'}
          </button>}
          {tabActivo === 'activos' && puedeExportarInventario && <button onClick={() => descargarEtiquetas()}
            title="Genera etiquetas únicamente para activos validados"
            className="flex items-center gap-2 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.25)',
            }}>
            <svg className="w-4 h-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm13 0h3v3m0 4h-3m-4-7h2m-2 4h2" />
            </svg>
            Etiquetas
          </button>}
          {tabActivo === 'activos' && puedeEditarInventario && <button onClick={() => setModalNuevo(true)}
            className="flex items-center gap-2 btn-blue px-4 py-2.5 text-sm font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo activo
          </button>}
        </div>
      </div>

      {/* ── Barra de tabs ── */}
      <div className="flex gap-1 mb-6 border-b border-white/10 pb-0">
        {tabsVisibles.map(t => (
          <button
            key={t.key}
            onClick={() => setSearchParams({
              ...(t.key === 'activos' ? {} : { tab: t.key }),
              ...(filtroLab ? { laboratorio_id: filtroLab } : {}),
              ...(categoriaLabContexto ? { categoria_lab: categoriaLabContexto } : {}),
            })}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative ${
              tabActivo === t.key
                ? 'text-white bg-white/8 border-b-2 border-emerald-400'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tabActivo === 'activos' && (
        <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 mr-1">Estado de validación:</span>
            {[
              ['BORRADOR', 'Borrador'],
              ['EN_REVISION', 'En revisión'],
              ['OBSERVADO', 'Observado'],
              ['RECHAZADO', 'No autorizado'],
              ['VALIDADO', 'Validado'],
            ].map(([estado, label]) => (
              <button
                key={estado}
                type="button"
                onClick={() => setFiltroEstadoAdmin(filtroEstadoAdmin === estado ? '' : estado)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  filtroEstadoAdmin === estado
                    ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                    : 'border-white/10 bg-slate-900/30 text-slate-300 hover:bg-white/10'
                }`}
              >
                {label}: {conteosValidacion[estado] || 0}
              </button>
            ))}
          </div>
          {!puedeValidarInventario && (
            <p className="text-xs text-slate-500 mt-2">
              Los registros nuevos permanecen en borrador hasta que Inventario Institucional los revise. Mientras tanto solo pueden consultarse y corregirse.
            </p>
          )}
          {puedeValidarInventario && (
            <p className="text-xs text-slate-500 mt-2">
              Solo los activos validados se incluyen en el inventario operativo y habilitan QR, resguardo, movimientos, préstamos, mantenimiento, bajas y levantamientos.
            </p>
          )}
        </div>
      )}

      {/* ── Tab: Bajas ── */}
      {tabActivo === 'bajas' && <PanelBajas />}

      {/* ── Tab: Levantamientos ── */}
      {tabActivo === 'levantamientos' && <PanelLevantamientos />}

      {tabActivo === 'revision' && (
        <PanelRevisionInventario
          activos={activosRevision}
          loading={loading}
          validandoId={validandoId}
          onCambiarEstado={cambiarEstadoValidacion}
          onEditar={setActivoEditar}
          onExpediente={setActivoExpediente}
          isDay={isDay}
        />
      )}

      {/* ── Tab: Activos (contenido original) ── */}
      {tabActivo === 'activos' && <>

      {mantenimientoAlertas && (mantenimientoAlertas.vencidos > 0 || mantenimientoAlertas.proximos_7 > 0) && (
        <div className={`mb-5 rounded-xl border px-4 py-3 ${
          mantenimientoAlertas.vencidos > 0
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${mantenimientoAlertas.vencidos > 0 ? 'text-red-300' : 'text-amber-300'}`}>
                {mantenimientoAlertas.vencidos > 0
                  ? `${mantenimientoAlertas.vencidos} mantenimiento(s) vencido(s)`
                  : `${mantenimientoAlertas.proximos_7} mantenimiento(s) por vencer`}
              </p>
              <p className="text-xs text-slate-400 mt-1 truncate">
                {mantenimientoAlertas.items.slice(0, 4).map(i => `${i.codigo_inventario} · ${i.tipo.replace(/_/g, ' ')}`).join('  |  ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/mantenimiento?tab=preventivo')}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-white/10 transition-colors"
            >
              Ver preventivos
            </button>
          </div>
        </div>
      )}

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
        <button
          type="button"
          onClick={() => setFiltrosAbiertos(v => !v)}
          aria-expanded={filtrosAbiertos}
          className="glass-sm border border-gray-700 text-slate-200 hover:text-white hover:border-emerald-500/50 text-sm rounded-lg px-4 py-2 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={filtrosAbiertos ? 'M20 12H4' : 'M12 4v16m8-8H4'} />
          </svg>
          {filtrosAbiertos ? 'Ocultar filtros' : '+ Filtros'}
          {filtrosAplicados > 0 && (
            <span className="text-[11px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-2 py-0.5">
              {filtrosAplicados}
            </span>
          )}
        </button>

        {filtrosAbiertos && (
          <>
        <SelectDark
          value={filtroLab}
          onChange={setFiltroLab}
          className="w-44"
          placeholder="Todos los labs"
          options={[{ value: '', label: 'Todos los labs' }, ...labs.map(l => ({ value: l.id, label: l.nombre, sublabel: categoriaLabLabel(l.categoria) }))]}
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
          placeholder="Validación"
          options={[{ value: '', label: 'Toda validación' }, ...ESTADOS_ADMIN.map(e => ({ value: e, label: e.replace(/_/g, ' ') }))]}
        />
        <SelectDark
          value={filtroCat}
          onChange={setFiltroCat}
          className="w-44"
          placeholder="Todas las categorías"
          options={[{ value: '', label: 'Todas las categorías' }, ...categoriasFiltro.map(c => ({ value: c.clave, label: c.nombre || categoriaActivoLabel(c.clave) }))]}
        />
        <SelectDark
          value={filtroEstado}
          onChange={setFiltroEstado}
          className="w-40"
          placeholder="Todos los estados"
          options={[{ value: '', label: 'Todos los estados' }, ...ESTADOS.map(e => ({ value: e, label: e }))]}
        />
          </>
        )}
        {filtrosAplicados > 0 && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/8 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
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
            const activoValidado = (a.estado_admin || 'VALIDADO') === 'VALIDADO';
            const activoEditable = puedeEditarInventario && (a.estado_admin !== 'RECHAZADO' || puedeValidarInventario);
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
                  {a.numero_oficial && (
                    <p className="text-[11px] text-slate-500 mt-0.5 font-mono">Oficial: {a.numero_oficial}</p>
                  )}
                  {a.categoria === 'COMPUTADORA' && (
                    <p className={`text-[11px] mt-1 font-semibold ${a.computadora_id ? 'text-blue-500' : 'text-amber-500'}`}>
                      {a.computadora_id
                        ? `Asignada como ${a.computadora_codigo}${a.computadora_fila ? ` · Fila ${a.computadora_fila}` : ''}`
                        : 'Sin asignar a un puesto PC'}
                    </p>
                  )}
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
                  <span className={`inline-flex mt-2 ml-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    a.estado_admin === 'VALIDADO'
                      ? 'bg-green-900/50 text-green-300'
                      : a.estado_admin === 'RECHAZADO'
                        ? 'bg-red-900/50 text-red-300'
                        : a.estado_admin === 'OBSERVADO'
                          ? 'bg-amber-900/60 text-amber-200'
                          : 'bg-yellow-900/40 text-yellow-300'
                  }`}>
                    {a.estado_admin === 'RECHAZADO'
                      ? 'NO AUTORIZADO'
                      : (a.estado_admin || 'BORRADOR').replace(/_/g, ' ')}
                  </span>
                  {a.validacion_motivo && (
                    <p className="text-xs text-amber-500 mt-2">
                      Motivo: {a.validacion_motivo}
                    </p>
                  )}
                  {a.mantenimiento?.estado_alerta && a.mantenimiento.estado_alerta !== 'OK' && (
                    <button
                      type="button"
                      onClick={() => abrirMantenimientoActivo(a)}
                      className={`inline-flex mt-2 ml-2 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${mantenimientoTone(a.mantenimiento.estado_alerta)}`}
                      title={a.mantenimiento.siguiente_limite ? `Limite: ${formatFechaCorta(a.mantenimiento.siguiente_limite)}` : 'Mantenimiento programado'}
                    >
                      {a.mantenimiento.estado_alerta === 'VENCIDO'
                        ? 'Mant. vencido'
                        : a.mantenimiento.estado_alerta === 'PROXIMO'
                          ? 'Mant. proximo'
                          : 'Mant. programado'}
                    </button>
                  )}
                </div>
                {/* Acciones — Editar ghost (30%) + Prestar sólido (70%) */}
                <div className="flex gap-2 pt-2 border-t border-white/5 mt-auto">
                  {activoEditable && <button onClick={() => setActivoEditar(a)}
                    className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                      isDay
                        ? 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                        : 'border border-white/15 text-slate-300 hover:bg-white/8'
                    }`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>}
                  {puedeEditarInventario && activoValidado && <button onClick={() => setActivoMover(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/90 hover:bg-blue-600 text-white transition-colors">
                    Mover
                  </button>}
                  <button onClick={() => setActivoExpediente(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors">
                    Exp.
                  </button>
                  {activoValidado && <button onClick={() => descargarResguardo(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700/80 hover:bg-amber-700 text-amber-50 transition-colors">
                    Resg.
                  </button>}
                  {activoValidado && <button onClick={() => descargarEtiquetas(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-700/80 hover:bg-teal-700 text-teal-50 transition-colors">
                    Etq.
                  </button>}
                  {puedeEditarInventario && activoValidado && <button onClick={() => abrirMantenimientoActivo(a, true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-700/80 hover:bg-yellow-700 text-yellow-50 transition-colors">
                    Mant.
                  </button>}
                  {puedeEditarInventario && activoValidado && <button onClick={() => setActivoBaja(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-900/70 hover:bg-red-800 text-red-100 transition-colors">
                    Baja
                  </button>}
                  {activoValidado && puedeUsarPrestamos && !a.prestado && a.estado === 'OPERATIVO' ? (
                    <button onClick={() => navigate('/admin/prestamos', { state: { activoId: a.id } })}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
                      Prestar
                    </button>
                  ) : !activoValidado ? (
                    <span className="flex-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-center text-[10px] font-semibold text-amber-300">
                      Pendiente de validación
                    </span>
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
          <table className="w-full min-w-[1220px] text-sm">
            <thead className="bg-white/5 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Activo</th>
                <th className="text-left px-4 py-3">Categoría</th>
                <th className="text-left px-4 py-3">Alcance</th>
                <th className="text-left px-4 py-3">Responsable</th>
                <th className="text-left px-4 py-3">Ubicación</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Mant.</th>
                <th className="text-left px-4 py-3">Validación</th>
                <th className="text-left px-4 py-3">Préstamo</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {activosFiltrados.map((a, idx) => {
                const activoValidado = (a.estado_admin || 'VALIDADO') === 'VALIDADO';
                const activoEditable = puedeEditarInventario && (a.estado_admin !== 'RECHAZADO' || puedeValidarInventario);
                return (
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
                     {a.numero_oficial && (
                       <p className="text-[11px] text-slate-500 font-mono">Oficial: {a.numero_oficial}</p>
                     )}
                     {a.categoria === 'COMPUTADORA' && (
                       <p className={`text-[11px] mt-1 font-semibold ${a.computadora_id ? 'text-blue-500' : 'text-amber-500'}`}>
                         {a.computadora_id
                           ? `Asignada como ${a.computadora_codigo}${a.computadora_fila ? ` · Fila ${a.computadora_fila}` : ''}`
                           : 'Sin asignar a un puesto PC'}
                       </p>
                     )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    {CATEGORIA_ICONO[a.categoria]?.emoji} {categoriaActivoLabel(a.categoria)}
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
                    <p>{responsablePatrimonialLabel(a)}</p>
                    {(a.responsable_nombre || a.resguardante_externo_nombre) && (
                      <p className="text-slate-500 mt-0.5">{a.responsable_nombre || a.resguardante_externo_nombre}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    {a.ubicacion_label || a.ubicacion_nombre || <span className="text-slate-600">Sin ubicación</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ESTADO_BADGE[a.estado] || 'bg-gray-700 text-gray-300'}`}>
                      {a.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.mantenimiento?.estado_alerta && a.mantenimiento.estado_alerta !== 'OK' ? (
                      <button
                        type="button"
                        onClick={() => abrirMantenimientoActivo(a)}
                        className={`px-2.5 py-1 rounded-full font-medium border ${mantenimientoTone(a.mantenimiento.estado_alerta)}`}
                        title={a.mantenimiento.siguiente_limite ? `Limite: ${formatFechaCorta(a.mantenimiento.siguiente_limite)}` : 'Mantenimiento programado'}
                      >
                        {a.mantenimiento.estado_alerta === 'VENCIDO'
                          ? 'Vencido'
                          : a.mantenimiento.estado_alerta === 'PROXIMO'
                            ? 'Proximo'
                            : 'Programado'}
                      </button>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      a.estado_admin === 'VALIDADO'
                        ? 'bg-green-900/40 text-green-300'
                        : a.estado_admin?.includes('BAJA')
                          ? 'bg-red-900/50 text-red-300'
                          : 'bg-yellow-900/40 text-yellow-300'
                    }`}>
                      {a.estado_admin === 'RECHAZADO'
                        ? 'NO AUTORIZADO'
                        : (a.estado_admin || 'VALIDADO').replace(/_/g, ' ')}
                    </span>
                    {a.validacion_motivo && (
                      <p className="mt-1 text-[11px] text-amber-400 max-w-[240px]">
                        {a.validacion_motivo}
                      </p>
                    )}
                    {a.validacion_revisor && (
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Revisó: {a.validacion_revisor}
                      </p>
                    )}
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
                      {activoEditable && <button onClick={() => setActivoEditar(a)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                        title="Editar activo">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>}
                      <button onClick={() => setActivoExpediente(a)}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-gray-600 rounded-lg transition-colors"
                        title="Expediente">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
                        </svg>
                      </button>
                      {activoValidado ? (
                        <>
                          {puedeEditarInventario && <button onClick={() => setActivoMover(a)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-gray-600 rounded-lg transition-colors"
                            title="Mover activo">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          </button>}
                          <button onClick={() => descargarResguardo(a)}
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-gray-600 rounded-lg transition-colors"
                            title="Descargar resguardo">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 12h6m-6 4h6M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
                            </svg>
                          </button>
                          <button onClick={() => descargarEtiquetas(a)}
                            className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-gray-600 rounded-lg transition-colors"
                            title="Descargar etiqueta QR">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h2m4 0v2m0 4h-2m-4-2h2" />
                            </svg>
                          </button>
                          {puedeEditarInventario && <button onClick={() => abrirMantenimientoActivo(a, true)}
                            className="p-1.5 text-slate-400 hover:text-yellow-400 hover:bg-gray-600 rounded-lg transition-colors"
                            title="Programar mantenimiento">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </button>}
                          {puedeEditarInventario && <button onClick={() => setActivoBaja(a)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-gray-600 rounded-lg transition-colors"
                            title="Solicitar baja">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                          </button>}
                          {puedeUsarPrestamos && !a.prestado && a.estado === 'OPERATIVO' && (
                            <button onClick={() => navigate('/admin/prestamos', { state: { activoId: a.id } })}
                              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-gray-600 rounded-lg transition-colors"
                              title="Prestar activo">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                              </svg>
                            </button>
                          )}
                        </>
                      ) : (
                        <span
                          className="ml-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300"
                          title="Las operaciones oficiales se habilitan después de la validación"
                        >
                          Pendiente de validación
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      </>} {/* fin tab activos */}

      {/* Modales */}
      {(modalNuevo || activoEditar) && (
        <ModalActivo
          activo={activoEditar}
          labs={labs}
          departamentos={departamentos}
          departamentosFormulario={departamentosFormulario}
          departamentoBloqueado={!departamentosFormularioGlobal && departamentosFormulario.length === 1}
          puedeAsignarLaboratorio={puedeAsignarLaboratorio}
          puedeValidarInventario={puedeValidarInventario}
          ubicaciones={ubicaciones}
          categoriasInventario={catalogoInventario.categorias_items || []}
          tiposUbicacionInventario={catalogoInventario.tipos_ubicacion_items || []}
          laboratorioContextoId={laboratorioContextoId}
          categoriaLabContexto={categoriaLabContexto}
          onClose={() => { setModalNuevo(false); setActivoEditar(null); }}
          onSave={() => { setModalNuevo(false); setActivoEditar(null); cargar(); }}
          onUbicacionCreada={u => setUbicaciones(prev => [...prev.filter(x => x.id !== u.id), u])}
        />
      )}
      {modalImportar && (
        <ModalImportar
          onClose={() => setModalImportar(false)}
          onDone={() => { setModalImportar(false); cargar(); }}
        />
      )}
      {modalCatalogo && (
        <ModalCatalogoInventario
          catalogo={catalogoInventario}
          onClose={() => setModalCatalogo(false)}
          onDone={cargar}
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
      {decisionValidacion && (
        <ModalDecisionValidacion
          key={`${decisionValidacion.activo.id}-${decisionValidacion.estado}`}
          decision={decisionValidacion}
          validando={validandoId === `${decisionValidacion.activo.id}-${decisionValidacion.estado}`}
          isDay={isDay}
          onClose={() => setDecisionValidacion(null)}
          onConfirmar={motivo => actualizarEstadoValidacion(
            decisionValidacion.activo,
            decisionValidacion.estado,
            motivo,
          )}
        />
      )}
    </AdminLayout>
  );
}
