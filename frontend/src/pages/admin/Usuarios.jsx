import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';

const ROLES = ['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB', 'ADMINISTRATIVO', 'TUTORIA_ADMIN', 'SERVICIOS_ESCOLARES', 'DOCENTE'];

// SUPER_ADMIN destaca en azul; todos los demás en gris neutro para reducir ruido visual
const ROL_COLOR = {
  SUPER_ADMIN:         'bg-blue-900/70  text-blue-200  border border-blue-700/50',
  LAB_ADMIN:           'bg-slate-700/60 text-slate-200 border border-slate-600/40',
  RESPONSABLE_LAB:     'bg-slate-700/60 text-slate-200 border border-slate-600/40',
  ADMINISTRATIVO:      'bg-slate-700/60 text-slate-200 border border-slate-600/40',
  TUTORIA_ADMIN:       'bg-slate-700/60 text-slate-200 border border-slate-600/40',
  SERVICIOS_ESCOLARES: 'bg-slate-700/60 text-slate-200 border border-slate-600/40',
  DOCENTE:             'bg-slate-700/60 text-slate-200 border border-slate-600/40',
};

const ROL_LABEL = {
  SUPER_ADMIN:         'Super Admin',
  LAB_ADMIN:           'Admin Lab',
  RESPONSABLE_LAB:     'Responsable Lab',
  ADMINISTRATIVO:      'Administrativo',
  TUTORIA_ADMIN:       'Tutoría',
  SERVICIOS_ESCOLARES: 'Escolares',
  DOCENTE:             'Docente',
  ALUMNO:              'Alumno',
};

const toTitleCase = s =>
  !s ? '' : s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());


// ─── Modal Crear / Editar ──────────────────────────────────────────────────────

function ModalUsuario({ usuario, labs, departamentos = [], onClose, onSave }) {
  const [form, setForm] = useState({
    nombre:              usuario?.nombre              || '',
    email:               usuario?.email               || '',
    numero_empleado:     usuario?.numero_empleado     || '',
    rol:                 usuario?.rol                 || 'DOCENTE',
    laboratorio_id:      usuario?.laboratorio_id      ?? '',
    departamento_id:     usuario?.departamento_id     ?? '',
    password:            '',
    activo:              usuario?.activo              ?? true,
    acceso_consultorio:  usuario?.acceso_consultorio  ?? false,
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const esEdicion = !!usuario;

  const handleChange = (e) => {
    const val = e.target.name === 'activo' ? e.target.checked
              : ['laboratorio_id', 'departamento_id'].includes(e.target.name) ? (e.target.value === '' ? '' : Number(e.target.value))
              : e.target.value;
    setForm({ ...form, [e.target.name]: val });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.numero_empleado) delete payload.numero_empleado;
      if (!payload.laboratorio_id && payload.laboratorio_id !== 0) delete payload.laboratorio_id;
      if (!payload.departamento_id && payload.departamento_id !== 0) delete payload.departamento_id;
      if (esEdicion) {
        delete payload.password; // no se cambia desde aquí
        await api.put(`/usuarios/${usuario.id}`, payload);
      } else {
        if (!payload.password) { setError('La contraseña es requerida'); setLoading(false); return; }
        await api.post('/usuarios', payload);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const necesitaLab = ['LAB_ADMIN', 'RESPONSABLE_LAB'].includes(form.rol);
  const necesitaDepartamento = form.rol === 'ADMINISTRATIVO';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">{esEdicion ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 gap-4">
            {/* Nombre */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Nombre completo *</label>
              <input name="nombre" value={form.nombre} onChange={handleChange} required
                placeholder="Ej: Juan García López"
                className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Email + Num empleado */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Email *</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} required
                  placeholder="correo@utecan.edu.mx"
                  className="w-full input-dark text-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ textOverflow: 'ellipsis' }} />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">No. Empleado</label>
                <input name="numero_empleado" value={form.numero_empleado} onChange={handleChange}
                  placeholder="Ej: EMP-001"
                  className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Rol + Laboratorio */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Rol *</label>
                <SelectDark
                  value={form.rol}
                  onChange={v => setForm({
                    ...form,
                    rol: v,
                    laboratorio_id: ['LAB_ADMIN', 'RESPONSABLE_LAB'].includes(v) ? form.laboratorio_id : '',
                    departamento_id: v === 'ADMINISTRATIVO' ? form.departamento_id : '',
                  })}
                  options={ROLES.map(r => ({ value: r, label: r }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Laboratorio {necesitaLab && <span className="text-red-400">*</span>}
                </label>
                <SelectDark
                  value={form.laboratorio_id}
                  onChange={v => setForm({ ...form, laboratorio_id: v === '' ? '' : Number(v) })}
                  placeholder="— Ninguno —"
                  options={[
                    { value: '', label: '— Ninguno —' },
                    ...labs.map(l => ({ value: l.id, label: l.nombre })),
                  ]}
                />
              </div>
            </div>

            {/* Departamento */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Departamento {necesitaDepartamento && <span className="text-red-400">*</span>}
              </label>
              <SelectDark
                value={form.departamento_id}
                onChange={v => setForm({ ...form, departamento_id: v === '' ? '' : Number(v) })}
                placeholder="— Ninguno —"
                options={[
                  { value: '', label: '— Ninguno —' },
                  ...departamentos.map(d => ({ value: d.id, label: `${d.nombre} (${d.clave})`, wrap: true })),
                ]}
              />
            </div>

            {/* Password (solo en creación) */}
            {!esEdicion && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Contraseña inicial *</label>
                <input name="password" type="password" value={form.password} onChange={handleChange}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {/* Activo + Acceso consultorio (solo en edición) */}
            {esEdicion && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                  <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange}
                    className="w-4 h-4 rounded accent-blue-600" />
                  Usuario activo
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" name="acceso_consultorio"
                    checked={form.acceso_consultorio}
                    onChange={e => setForm({ ...form, acceso_consultorio: e.target.checked })}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-slate-400">
                    Permitir acceso al Consultorio Médico
                  </span>
                </label>
                {form.acceso_consultorio && (
                  <p className="rounded-lg px-3 py-2"
                    style={{ backgroundColor: '#E8F0FE', color: '#1E3A8A', border: '1px solid #BFDBFE', fontSize: '13px' }}>
                    ℹ️ Este usuario visualizará el módulo de consultorio médico en su menú de navegación principal, aunque su rol sea docente o administrativo.
                  </p>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 rounded-lg py-2.5 text-sm font-medium transition-colors" style={{ color: '#374151' }}>
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Guardando...' : (esEdicion ? 'Actualizar' : 'Crear usuario')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ─── Modal Reset Password ──────────────────────────────────────────────────────

function ModalResetPwd({ usuario, onClose }) {
  const [loading, setLoading]     = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError]         = useState('');
  const [copiado, setCopiado]     = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/usuarios/${usuario.id}/reset-password`);
      setResultado(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al resetear');
    } finally {
      setLoading(false);
    }
  };

  const copiar = () => {
    navigator.clipboard.writeText(resultado.password_temporal);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-2xl p-6">
        {!resultado ? (
          <>
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-yellow-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold">Resetear contraseña</h3>
              <p className="text-slate-400 text-sm mt-1">
                Se generará una contraseña temporal para <strong className="text-white">{usuario.nombre}</strong>.
              </p>
            </div>
            {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mb-4">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={handleReset} disabled={loading}
                className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                {loading ? 'Reseteando...' : 'Resetear'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-white font-semibold">Contraseña generada</h3>
              <p className="text-slate-400 text-sm mt-1">Comparte esta contraseña con el usuario.</p>
            </div>
            <div className="bg-gray-700 rounded-xl px-4 py-3 flex items-center justify-between mb-4 border border-gray-600">
              <span className="font-mono text-yellow-300 text-lg tracking-wider">{resultado.password_temporal}</span>
              <button onClick={copiar} className="text-slate-400 hover:text-white ml-3 transition-colors" title="Copiar">
                {copiado
                  ? <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                }
              </button>
            </div>
            <button onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              Listo
            </button>
          </>
        )}
      </div>
    </div>
  );
}


// ─── Modal Carga Masiva Excel ──────────────────────────────────────────────────

function ModalExcel({ onClose, onSave }) {
  const fileRef = useRef(null);
  const [archivo, setArchivo]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError]         = useState('');

  const handleFile = (e) => {
    setArchivo(e.target.files[0]);
    setError('');
  };

  const handleUpload = async () => {
    if (!archivo) { setError('Selecciona un archivo Excel'); return; }
    setLoading(true);
    const formData = new FormData();
    formData.append('archivo', archivo);
    try {
      const { data } = await api.post('/usuarios/bulk-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResultado(data);
      if (data.resumen.creados > 0) onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al procesar el archivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">Carga masiva desde Excel</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!resultado ? (
            <>
              {/* Instrucciones */}
              <div className="bg-white/5 rounded-xl p-4 text-sm text-gray-300 space-y-2">
                <p className="font-medium text-white">Formato requerido del Excel:</p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="text-slate-400">
                        {['nombre *', 'email *', 'rol *', 'numero_empleado', 'laboratorio_id'].map(c => (
                          <th key={c} className="text-left pr-4 py-1">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-gray-300">
                        <td className="pr-4">Juan García</td>
                        <td className="pr-4">jgarcia@utecan.edu.mx</td>
                        <td className="pr-4">DOCENTE</td>
                        <td className="pr-4">EMP-001</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-slate-500 text-xs">Roles validos: SUPER_ADMIN, LAB_ADMIN, RESPONSABLE_LAB, ADMINISTRATIVO, TUTORIA_ADMIN, SERVICIOS_ESCOLARES, DOCENTE</p>
              </div>

              {/* Selector de archivo */}
              <div
                onClick={() => fileRef.current.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                  ${archivo ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500'}`}
              >
                <svg className="w-8 h-8 mx-auto mb-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {archivo
                  ? <p className="text-blue-300 text-sm font-medium">{archivo.name}</p>
                  : <p className="text-slate-400 text-sm">Click para seleccionar archivo .xlsx</p>
                }
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={handleUpload} disabled={loading || !archivo}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                  {loading ? 'Procesando...' : 'Cargar usuarios'}
                </button>
              </div>
            </>
          ) : (
            /* Resultado */
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Procesados', val: resultado.resumen.procesados, cls: 'text-gray-300' },
                  { label: 'Creados',    val: resultado.resumen.creados,    cls: 'text-green-400' },
                  { label: 'Omitidos',  val: resultado.resumen.omitidos,   cls: 'text-yellow-400' },
                  { label: 'Errores',   val: resultado.resumen.errores,    cls: 'text-red-400'    },
                ].map(s => (
                  <div key={s.label} className="bg-gray-700 rounded-xl p-3 text-center">
                    <p className={`text-2xl font-bold ${s.cls}`}>{s.val}</p>
                    <p className="text-xs text-slate-400 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Creados con contraseñas */}
              {resultado.creados.length > 0 && (
                <div>
                  <p className="text-sm text-green-400 font-medium mb-2">Usuarios creados — contraseñas temporales:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {resultado.creados.map((u, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-700 rounded-lg px-3 py-2 text-xs">
                        <span className="text-white">{u.nombre}</span>
                        <span className="text-slate-400">{u.email}</span>
                        <span className="font-mono text-yellow-300">{u.password_temporal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errores */}
              {resultado.errores.length > 0 && (
                <div>
                  <p className="text-sm text-red-400 font-medium mb-2">Errores:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {resultado.errores.map((e, i) => (
                      <p key={i} className="text-xs text-red-300">Fila {e.fila}: {e.error}</p>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={onClose}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Modal de confirmación (dark theme) ───────────────────────────────────────

function ModalConfirmar({ mensaje, detalle, labelAceptar = 'Confirmar', onAceptar, onCancelar }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm rounded-2xl overflow-hidden shadow-glass">
        <div className="px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-snug">{mensaje}</p>
              {detalle && <p className="text-slate-400 text-xs mt-1 leading-relaxed">{detalle}</p>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onCancelar}
            className="flex-1 btn-ghost py-2 rounded-xl text-sm font-medium">
            Cancelar
          </button>
          <button onClick={onAceptar}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
            {labelAceptar}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Página principal ──────────────────────────────────────────────────────────

export default function Usuarios() {
  const { usuario: yo } = useAuth();
  const { toast } = useToast();

  const [usuarios, setUsuarios]   = useState([]);
  const [labs, setLabs]           = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // Filtros
  const [filtroRol, setFiltroRol]           = useState('TODOS');
  const [filtroActivo, setFiltroActivo]     = useState('todos');
  const [busqueda, setBusqueda]             = useState('');

  // Autocomplete
  const [sugerencias, setSugerencias]           = useState([]);
  const [showSugerencias, setShowSugerencias]   = useState(false);
  const searchWrapRef = useRef(null);

  // Selección múltiple
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [bulkLoading, setBulkLoading]   = useState(false);
  const [confirmDesactivar, setConfirmDesactivar] = useState(false);
  const [userEliminar, setUserEliminar]           = useState(null);

  // Modales
  const [modalCrear, setModalCrear]           = useState(false);
  const [userEditar, setUserEditar]           = useState(null);
  const [userReset, setUserReset]             = useState(null);
  const [modalExcel, setModalExcel]           = useState(false);
  const [modalDocentes, setModalDocentes]     = useState(false);
  const [reporteDocentes, setReporteDocentes] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filtroRol !== 'TODOS') params.append('rol', filtroRol);
      if (filtroActivo === 'activos')   params.append('activo', 'true');
      if (filtroActivo === 'inactivos') params.append('activo', 'false');

      const [rU, rL, rD] = await Promise.all([
        api.get(`/usuarios?${params}`),
        api.get('/laboratorios?solo_activos=true'),
        api.get('/departamentos?activo=true'),
      ]);
      // Alumnos se gestionan en Catálogos, no en Usuarios
      const lista = Array.isArray(rU.data) ? rU.data : (rU.data?.items || []);
      setUsuarios(lista.filter(u => u.rol !== 'ALUMNO'));
      setLabs(rL.data);
      setDepartamentos(Array.isArray(rD.data) ? rD.data : []);
    } catch {
      setError('No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, [filtroRol, filtroActivo]);

  useEffect(() => { cargar(); }, [cargar]);

  // Limpiar selección cuando cambia el filtro
  useEffect(() => { setSelectedIds(new Set()); }, [filtroRol, filtroActivo, busqueda]);

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowSugerencias(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const usuariosFiltrados = usuarios.filter(u => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return u.nombre.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || (u.numero_empleado || '').toLowerCase().includes(q)
      || (u.departamento_nombre || '').toLowerCase().includes(q)
      || (u.departamento_clave || '').toLowerCase().includes(q);
  });

  // ── Autocomplete ────────────────────────────────────────────────────────────
  const handleBusquedaChange = (val) => {
    setBusqueda(val);
    if (val.length >= 2) {
      const q = val.toLowerCase();
      const matches = usuarios
        .filter(u => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.departamento_nombre || '').toLowerCase().includes(q))
        .slice(0, 7);
      setSugerencias(matches);
      setShowSugerencias(matches.length > 0);
    } else {
      setShowSugerencias(false);
    }
  };

  const selectSugerencia = (u) => {
    setBusqueda(u.nombre);
    setShowSugerencias(false);
  };

  // ── Bulk selection ───────────────────────────────────────────────────────────
  const allSelected  = usuariosFiltrados.length > 0 && selectedIds.size === usuariosFiltrados.length;
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(usuariosFiltrados.map(u => u.id)));
  };

  const desactivarSeleccionados = async () => {
    setBulkLoading(true);
    try {
      await Promise.all([...selectedIds].map(id => api.put(`/usuarios/${id}`, { activo: false })));
      toast(`${selectedIds.size} usuario(s) desactivados`, 'success');
      setSelectedIds(new Set());
      cargar();
    } catch {
      toast('Error al desactivar usuarios', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleEliminar = async () => {
    if (!userEliminar) return;
    try {
      await api.delete(`/usuarios/${userEliminar.id}`);
      toast(`Usuario '${userEliminar.nombre}' eliminado permanentemente`, 'success');
      setUserEliminar(null);
      cargar();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al eliminar el usuario';
      toast(msg, 'error');
      setUserEliminar(null);
    }
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <p className="text-slate-400 text-sm mt-0.5">Docentes, administradores y accesos al sistema</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModalDocentes(true)}
            className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(13,148,136,0.25)',
              border: '1px solid rgba(20,184,166,0.35)',
              boxShadow: '0 0 14px rgba(20,184,166,0.18)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(13,148,136,0.40)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(20,184,166,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(13,148,136,0.25)'; e.currentTarget.style.boxShadow = '0 0 14px rgba(20,184,166,0.18)'; }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
            </svg>
            Importar Docentes
          </button>
          <button onClick={() => setModalExcel(true)}
            className="flex items-center gap-2 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 0 10px rgba(255,255,255,0.04)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = ''; }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Cargar Excel
          </button>
          <button onClick={() => setModalCrear(true)}
            className="flex items-center gap-2 btn-blue px-4 py-2.5 text-sm font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo usuario
          </button>
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">

        {/* Búsqueda con autocomplete */}
        <div className="relative" ref={searchWrapRef}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={busqueda}
            onChange={e => handleBusquedaChange(e.target.value)}
            onFocus={() => busqueda.length >= 2 && sugerencias.length > 0 && setShowSugerencias(true)}
            placeholder="Buscar nombre, email..."
            className="input-dark text-white text-sm rounded-xl pl-9 pr-9 py-2 w-60 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            style={{ paddingLeft: 36, paddingRight: 36 }}
          />
          {busqueda && (
            <button onClick={() => { setBusqueda(''); setShowSugerencias(false); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {/* Dropdown de sugerencias */}
          {showSugerencias && (
            <div className="absolute top-full left-0 right-0 mt-1.5 glass border border-white/10 rounded-xl z-30 overflow-hidden shadow-2xl"
              style={{ minWidth: '260px' }}>
              {sugerencias.map(u => (
                <button key={u.id} onMouseDown={() => selectSugerencia(u)}
                  className="w-full text-left px-3 py-2.5 hover:bg-white/8 transition-colors flex items-center gap-3 border-b border-white/[0.04] last:border-0">
                  <div className="w-7 h-7 rounded-full bg-blue-600/25 flex items-center justify-center shrink-0 text-xs font-bold text-blue-300">
                    {u.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{toTitleCase(u.nombre)}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full shrink-0 ${ROL_COLOR[u.rol] || 'bg-gray-700 text-gray-300'}`}>
                    {ROL_LABEL[u.rol] || u.rol}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filtro Rol */}
        <SelectDark
          value={filtroRol}
          onChange={setFiltroRol}
          className="w-44"
          options={[
            { value: 'TODOS', label: 'Todos los roles' },
            ...ROLES.map(r => ({ value: r, label: r })),
          ]}
        />

        {/* Filtro Estado */}
        <SelectDark
          value={filtroActivo}
          onChange={setFiltroActivo}
          className="w-36"
          options={[
            { value: 'todos',     label: 'Todos' },
            { value: 'activos',   label: 'Solo activos' },
            { value: 'inactivos', label: 'Solo inactivos' },
          ]}
        />

        <span className="text-sm text-slate-500 ml-1">
          {usuariosFiltrados.length} resultado{usuariosFiltrados.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Barra de acciones masivas */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-xl border border-blue-500/20"
          style={{ background: 'rgba(59,130,246,0.06)' }}>
          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm text-blue-300 font-medium">
            {selectedIds.size} usuario{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setConfirmDesactivar(true)} disabled={bulkLoading}
              className="flex items-center gap-1.5 text-sm bg-red-500/15 text-red-400 border border-red-500/25 px-3 py-1.5 rounded-lg hover:bg-red-500/25 transition-colors disabled:opacity-50">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              {bulkLoading ? 'Desactivando...' : 'Desactivar'}
            </button>
            <button onClick={() => setSelectedIds(new Set())}
              className="text-sm text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      ) : usuariosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p>{usuarios.length === 0 ? 'No hay usuarios registrados' : 'No hay resultados para ese filtro'}</p>
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: 'rgba(255,255,255,0.04)' }}>
              <tr className="text-slate-400 text-xs uppercase tracking-wider">
                {/* Checkbox "Seleccionar todo" */}
                <th className="w-10 px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                    title={allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                  />
                </th>
                <th className="text-left px-4 py-3.5">Usuario</th>
                <th className="text-left px-4 py-3.5">Rol</th>
                <th className="text-left px-4 py-3.5">Laboratorio</th>
                <th className="text-left px-4 py-3.5">Departamento</th>
                <th className="text-left px-4 py-3.5">Estado</th>
                <th className="text-right px-4 py-3.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map((u, idx) => {
                const isSelected = selectedIds.has(u.id);
                return (
                  <tr
                    key={u.id}
                    onClick={() => toggleSelect(u.id)}
                    className="cursor-pointer transition-colors"
                    style={{
                      background: isSelected
                        ? 'rgba(59,130,246,0.10)'
                        : idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      opacity: !u.activo ? 0.55 : 1,
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = isSelected
                        ? 'rgba(59,130,246,0.10)'
                        : idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent';
                    }}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(u.id)}
                        className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Usuario */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            background: u.rol === 'SUPER_ADMIN' ? 'rgba(59,130,246,0.2)'
                              : u.rol === 'LAB_ADMIN' ? 'rgba(168,85,247,0.2)'
                              : u.rol === 'RESPONSABLE_LAB' ? 'rgba(20,184,166,0.2)'
                              : 'rgba(16,185,129,0.2)',
                            color: u.rol === 'SUPER_ADMIN' ? '#93c5fd'
                              : u.rol === 'LAB_ADMIN' ? '#d8b4fe'
                              : u.rol === 'RESPONSABLE_LAB' ? '#5eead4'
                              : '#6ee7b7',
                          }}>
                          {u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white leading-tight">{toTitleCase(u.nombre)}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{u.email}</p>
                          {u.numero_empleado && (
                            <p className="text-slate-600 text-xs font-mono">{u.numero_empleado}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Rol */}
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROL_COLOR[u.rol] || 'bg-gray-700 text-gray-300'}`}>
                        {ROL_LABEL[u.rol] || u.rol}
                      </span>
                    </td>

                    {/* Laboratorio */}
                    <td className="px-4 py-4 text-slate-300 text-sm">
                      {u.laboratorio_nombre || <span className="text-slate-600">—</span>}
                    </td>

                    {/* Departamento — solo siglas, nombre completo en tooltip */}
                    <td className="px-4 py-4">
                      {u.departamento_clave ? (
                        <span
                          title={u.departamento_nombre || u.departamento_clave}
                          className="cursor-default text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 border border-slate-600/30">
                          {u.departamento_clave}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                        u.activo
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                          : 'bg-slate-700/50 text-slate-400 border border-slate-600/40'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.activo ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setUserEditar(u)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-white/8 rounded-lg transition-colors"
                          title="Editar usuario">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {u.id !== yo?.id && (
                          <button onClick={() => setUserReset(u)}
                            className="p-2 text-slate-400 hover:text-yellow-400 hover:bg-white/8 rounded-lg transition-colors"
                            title="Resetear contraseña">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                          </button>
                        )}
                        {u.id !== yo?.id && u.rol !== 'SUPER_ADMIN' && (
                          <button onClick={() => setUserEliminar(u)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Eliminar usuario">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
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

      {/* Modales */}
      {(modalCrear || userEditar) && (
        <ModalUsuario
          usuario={userEditar}
          labs={labs}
          departamentos={departamentos}
          onClose={() => { setModalCrear(false); setUserEditar(null); }}
          onSave={() => { setModalCrear(false); setUserEditar(null); cargar(); }}
        />
      )}
      {userReset && (
        <ModalResetPwd usuario={userReset} onClose={() => setUserReset(null)} />
      )}
      {modalExcel && (
        <ModalExcel onClose={() => setModalExcel(false)} onSave={cargar} />
      )}
      {modalDocentes && (
        <ModalImportarDocentes
          onClose={() => setModalDocentes(false)}
          onImportado={(data) => { setModalDocentes(false); setReporteDocentes(data); cargar(); }}
        />
      )}
      {reporteDocentes && (
        <ModalReporteDocentes
          reporte={reporteDocentes}
          onClose={() => setReporteDocentes(null)}
        />
      )}
      {confirmDesactivar && (
        <ModalConfirmar
          mensaje={`¿Desactivar ${selectedIds.size} usuario${selectedIds.size !== 1 ? 's' : ''} seleccionado${selectedIds.size !== 1 ? 's' : ''}?`}
          detalle="Los usuarios desactivados no podrán iniciar sesión. Puedes reactivarlos editando cada perfil."
          labelAceptar="Desactivar"
          onCancelar={() => setConfirmDesactivar(false)}
          onAceptar={() => { setConfirmDesactivar(false); desactivarSeleccionados(); }}
        />
      )}
      {userEliminar && (
        <ModalConfirmarEliminar
          usuario={userEliminar}
          onCancelar={() => setUserEliminar(null)}
          onAceptar={handleEliminar}
        />
      )}
    </AdminLayout>
  );
}

// ─── Modal: Confirmar eliminación permanente ──────────────────────────────────

function ModalConfirmarEliminar({ usuario, onCancelar, onAceptar }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-glass animate-fadeUp">
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 bg-red-900/40 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Eliminar usuario</h3>
            <p className="text-slate-400 text-sm mt-1">
              ¿Eliminar permanentemente a <span className="text-white font-medium">{usuario.nombre}</span>?
            </p>
            <p className="text-slate-500 text-xs mt-2">
              Esta acción no se puede deshacer. Si el usuario tiene historial (horarios, sesiones, inventario),
              el sistema bloqueará la eliminación y deberás desactivarlo en su lugar.
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onCancelar}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={onAceptar}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Importar docentes desde Plantilla_Docentes_UTECAN.xlsx ────────────

function ModalImportarDocentes({ onClose, onImportado }) {
  const [archivo, setArchivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const inputRef = React.useRef();

  const handleImportar = async () => {
    if (!archivo) { setError('Selecciona un archivo Excel primero'); return; }
    setLoading(true);
    setError('');
    const form = new FormData();
    form.append('archivo', archivo);
    try {
      const { data } = await api.post('/usuarios/importar-docentes', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onImportado(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al procesar el archivo');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">👩‍🏫 Importar Docentes</h3>
            <p className="text-xs text-slate-400 mt-0.5">Usa la Plantilla_Docentes_UTECAN.xlsx</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
              ${archivo ? 'border-teal-600 bg-teal-900/20' : 'border-gray-600 hover:border-gray-500 bg-gray-900/40'}`}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { setArchivo(e.target.files[0]); setError(''); }}/>
            {archivo ? (
              <>
                <p className="text-2xl mb-2">📊</p>
                <p className="text-teal-400 font-medium text-sm">{archivo.name}</p>
                <p className="text-slate-500 text-xs mt-1">{(archivo.size / 1024).toFixed(1)} KB — clic para cambiar</p>
              </>
            ) : (
              <>
                <p className="text-3xl mb-2">📂</p>
                <p className="text-gray-300 text-sm font-medium">Clic para seleccionar</p>
                <p className="text-slate-500 text-xs mt-1">Archivo .xlsx con hoja «Docentes»</p>
              </>
            )}
          </div>
          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={handleImportar} disabled={loading || !archivo}
              className="flex-1 bg-teal-700 hover:bg-teal-600 disabled:bg-gray-600 disabled:text-slate-400 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Importando...' : '⬆ Importar docentes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Reporte de importación de docentes ────────────────────────────────

function ModalReporteDocentes({ reporte, onClose }) {
  const { resumen = {}, creados = [], actualizados = [], errores = [] } = reporte;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-white">Resultado — Importar Docentes</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-900/40 border border-green-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{resumen.creados ?? 0}</p>
              <p className="text-xs text-green-300 mt-1">Creados</p>
            </div>
            <div className="bg-blue-900/40 border border-blue-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">{resumen.actualizados ?? 0}</p>
              <p className="text-xs text-blue-300 mt-1">Actualizados</p>
            </div>
            <div className={`rounded-xl p-4 text-center border ${
              (resumen.errores ?? 0) > 0 ? 'bg-red-900/40 border-red-700/50' : 'bg-white/4 border-gray-600/50'}`}>
              <p className={`text-2xl font-bold ${(resumen.errores ?? 0) > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {resumen.errores ?? 0}
              </p>
              <p className={`text-xs mt-1 ${(resumen.errores ?? 0) > 0 ? 'text-red-300' : 'text-slate-400'}`}>Con error</p>
            </div>
          </div>
          {creados.length > 0 && (
            <div>
              <p className="text-xs text-green-400 font-semibold mb-2 uppercase tracking-wide">Docentes creados</p>
              <div className="bg-slate-950/60 rounded-xl border border-gray-700 divide-y divide-gray-700/50 max-h-40 overflow-y-auto">
                {creados.map((d, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{d.nombre}</p>
                      <p className="text-slate-400 text-xs">{d.email}</p>
                    </div>
                    <span className="text-xs bg-yellow-900/50 text-yellow-300 border border-yellow-700/50 px-2 py-0.5 rounded-full font-mono">
                      {d.password_temporal}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-yellow-400 mt-2">⚠ Comparte las contraseñas temporales con cada docente — deben cambiarla al primer acceso.</p>
            </div>
          )}
          {errores.length > 0 && (
            <div>
              <p className="text-xs text-red-400 font-semibold mb-2 uppercase tracking-wide">Filas con error</p>
              <div className="bg-slate-950/60 rounded-xl border border-gray-700 divide-y divide-gray-700/50">
                {errores.map((e, i) => (
                  <div key={i} className="px-3 py-2">
                    <p className="text-xs text-slate-400 font-mono">Fila {e.fila} — {e.datos}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {e.errores.map((err, j) => (
                        <span key={j} className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded-full border border-red-800/50">{err}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-white/5 shrink-0">
          <button onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
