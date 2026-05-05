import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CARRERAS_DEFAULT = [
  'Ing. en Desarrollo y Gestión de Software',
  'Ing. en Agricultura Sustentable y Protegida',
  'Lic. en Administración',
  'Lic. en Contaduría',
  'Lic. en Protección Civil y Emergencias',
  'Ing. en Tecnologías de la Información',
  'TSU en Desarrollo de Software Multiplataforma',
  'TSU en Agricultura Sustentable y Protegida',
  'TSU en Contaduría',
  'TSU en Administración',
];

const PERIODOS_DEFAULT = [
  'ENE-ABR 2025','MAY-AGO 2025','SEP-DIC 2025',
  'ENE-ABR 2026','MAY-AGO 2026','SEP-DIC 2026',
  'ENE-ABR 2027','MAY-AGO 2027',
];

const GRUPOS = ['A','B','C','D'];


// ─── Componente: Reporte de importación ───────────────────────────────────────

function ModalReporte({ reporte, titulo, onClose }) {
  const { creados = 0, actualizados = 0, total_errores = 0, errores = [] } = reporte;
  const total = creados + actualizados + total_errores;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-white">{titulo}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-900/40 border border-green-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{creados}</p>
              <p className="text-xs text-green-300 mt-1">Creados</p>
            </div>
            <div className="bg-blue-900/40 border border-blue-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">{actualizados}</p>
              <p className="text-xs text-blue-300 mt-1">Actualizados</p>
            </div>
            <div className={`rounded-xl p-4 text-center border ${
              total_errores > 0
                ? 'bg-red-900/40 border-red-700/50'
                : 'bg-white/4 border-gray-600/50'}`}>
              <p className={`text-2xl font-bold ${total_errores > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {total_errores}
              </p>
              <p className={`text-xs mt-1 ${total_errores > 0 ? 'text-red-300' : 'text-slate-400'}`}>
                Con error
              </p>
            </div>
          </div>

          {total_errores === 0 && (
            <div className="flex items-center gap-3 bg-green-900/20 border border-green-700/40 rounded-xl px-4 py-3">
              <span className="text-xl">✅</span>
              <p className="text-green-300 text-sm">
                Importación completada sin errores. {total} registros procesados.
              </p>
            </div>
          )}

          {/* Detalle de errores */}
          {errores.length > 0 && (
            <div>
              <p className="text-xs text-red-400 font-semibold mb-2 uppercase tracking-wide">
                Filas con problemas — corrígelas en el Excel y vuelve a importar
              </p>
              <div className="bg-slate-950/60 rounded-xl border border-gray-700 divide-y divide-gray-700/50 max-h-48 overflow-y-auto">
                {errores.map((e, i) => (
                  <div key={i} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-mono">Fila {e.fila}</span>
                      <span className="text-xs text-slate-500 truncate ml-2 max-w-[180px]">{e.datos}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {e.errores.map((err, j) => (
                        <span key={j} className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded-full border border-red-800/50">
                          {err}
                        </span>
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


// ─── Componente: Modal importar archivo ───────────────────────────────────────

function ModalImportar({ titulo, descripcion, endpoint, onClose, onImportado }) {
  const [archivo, setArchivo]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const inputRef = useRef();

  const handleImportar = async () => {
    if (!archivo) { setError('Selecciona un archivo Excel primero'); return; }
    setLoading(true);
    setError('');
    const form = new FormData();
    form.append('file', archivo);
    try {
      const { data } = await api.post(endpoint, form, {
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
            <h3 className="font-semibold text-white">{titulo}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{descripcion}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
              ${archivo ? 'border-green-600 bg-green-900/20' : 'border-gray-600 hover:border-gray-500 bg-gray-900/40'}`}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { setArchivo(e.target.files[0]); setError(''); }}/>
            {archivo ? (
              <>
                <p className="text-2xl mb-2">📊</p>
                <p className="text-green-400 font-medium text-sm">{archivo.name}</p>
                <p className="text-slate-500 text-xs mt-1">
                  {(archivo.size / 1024).toFixed(1)} KB — clic para cambiar
                </p>
              </>
            ) : (
              <>
                <p className="text-3xl mb-2">📂</p>
                <p className="text-gray-300 text-sm font-medium">Clic para seleccionar</p>
                <p className="text-slate-500 text-xs mt-1">Archivos .xlsx o .xls</p>
              </>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={handleImportar} disabled={loading || !archivo}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:text-slate-400 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Importando...' : '⬆ Importar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Modal: Alumno (crear / editar) ───────────────────────────────────────────

function ModalAlumno({ alumno, periodos, carreras, onClose, onGuardado }) {
  const esEdicion = !!alumno;
  const [form, setForm] = useState({
    matricula:        alumno?.matricula        ?? '',
    apellido_paterno: alumno?.apellido_paterno ?? '',
    apellido_materno: alumno?.apellido_materno ?? '',
    nombres:          alumno?.nombres          ?? '',
    carrera:          alumno?.carrera          ?? '',
    cuatrimestre:     alumno?.cuatrimestre     ?? '',
    grupo:            alumno?.grupo            ?? '',
    periodo:          alumno?.periodo          ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (esEdicion) {
        await api.put(`/catalogo/alumnos/${alumno.id}`, form);
      } else {
        await api.post('/catalogo/alumnos', form);
      }
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-gray-800 z-10">
          <h3 className="font-semibold text-white">{esEdicion ? 'Editar alumno' : 'Nuevo alumno'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Matrícula *</label>
            <input value={form.matricula} onChange={e => set('matricula', e.target.value)}
              placeholder="Ej: 2026-0001"
              className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required/>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Apellido Paterno *</label>
              <input value={form.apellido_paterno} onChange={e => set('apellido_paterno', e.target.value)}
                className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                required/>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Apellido Materno *</label>
              <input value={form.apellido_materno} onChange={e => set('apellido_materno', e.target.value)}
                className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                required/>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre(s) *</label>
            <input value={form.nombres} onChange={e => set('nombres', e.target.value)}
              className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required/>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Carrera *</label>
            <SelectDark
              value={form.carrera}
              onChange={v => set('carrera', v)}
              placeholder="Seleccionar carrera..."
              options={[{ value: '', label: 'Seleccionar carrera...' }, ...carreras.map(c => ({ value: c, label: c }))]}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cuatrimestre *</label>
              <SelectDark
                value={form.cuatrimestre}
                onChange={v => set('cuatrimestre', Number(v))}
                placeholder="—"
                options={[{ value: '', label: '—' }, ...Array.from({length:12},(_,i)=>i+1).map(n => ({ value: n, label: String(n) }))]}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Grupo *</label>
              <SelectDark
                value={form.grupo}
                onChange={v => set('grupo', v)}
                placeholder="—"
                options={[{ value: '', label: '—' }, ...GRUPOS.map(g => ({ value: g, label: g }))]}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Periodo *</label>
              <SelectDark
                value={form.periodo}
                onChange={v => set('periodo', v)}
                placeholder="—"
                options={[{ value: '', label: '—' }, ...periodos.map(p => ({ value: p, label: p }))]}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Guardando...' : (esEdicion ? 'Actualizar' : 'Crear alumno')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ─── Modal: Materia (crear / editar) ─────────────────────────────────────────

function ModalMateria({ materia, periodos, carreras, onClose, onGuardado }) {
  const esEdicion = !!materia;
  const [form, setForm] = useState({
    nombre:               materia?.nombre               ?? '',
    carrera:              materia?.carrera              ?? '',
    cuatrimestre_oficial: materia?.cuatrimestre_oficial ?? '',
    periodo:              materia?.periodo              ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const payload = {
      ...form,
      cuatrimestre_oficial: form.cuatrimestre_oficial ? Number(form.cuatrimestre_oficial) : null,
    };
    try {
      if (esEdicion) {
        await api.put(`/catalogo/materias/${materia.id}`, payload);
      } else {
        await api.post('/catalogo/materias', payload);
      }
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">{esEdicion ? 'Editar materia' : 'Nueva materia'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre de la materia *</label>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              placeholder="Ej: Bases de Datos"
              className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required/>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Carrera</label>
            <SelectDark
              value={form.carrera}
              onChange={v => set('carrera', v)}
              placeholder="Todas / No especificada"
              options={[{ value: '', label: 'Todas / No especificada' }, ...carreras.map(c => ({ value: c, label: c }))]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cuatrimestre oficial</label>
              <SelectDark
                value={form.cuatrimestre_oficial}
                onChange={v => set('cuatrimestre_oficial', v)}
                placeholder="—"
                options={[{ value: '', label: '—' }, ...Array.from({length:12},(_,i)=>i+1).map(n => ({ value: n, label: String(n) }))]}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Periodo</label>
              <SelectDark
                value={form.periodo}
                onChange={v => set('periodo', v)}
                placeholder="—"
                options={[{ value: '', label: '—' }, ...periodos.map(p => ({ value: p, label: p }))]}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Guardando...' : (esEdicion ? 'Actualizar' : 'Crear materia')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  Página principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function Catalogo() {
  const [tab, setTab]         = useState('alumnos');  // 'alumnos' | 'materias'

  // Datos
  const [alumnos, setAlumnos]   = useState([]);
  const [materias, setMaterias] = useState([]);
  const [periodos, setPeriodos] = useState(PERIODOS_DEFAULT);
  const [carreras, setCarreras] = useState(CARRERAS_DEFAULT);
  const [loading, setLoading]   = useState(false);

  // Filtros alumnos
  const [filtPeriodo, setFiltPeriodo] = useState('');
  const [filtCarrera, setFiltCarrera] = useState('');
  const [filtGrupo, setFiltGrupo]     = useState('');
  const [filtActivo, setFiltActivo]   = useState('true');
  const [filtQ, setFiltQ]             = useState('');

  // Filtros materias
  const [filtMPeriodo, setFiltMPeriodo] = useState('');
  const [filtMActivo, setFiltMActivo]   = useState('true');
  const [filtMQ, setFiltMQ]             = useState('');

  // Modales
  const [modalAlumno, setModalAlumno]       = useState(null);  // null | 'nuevo' | alumno
  const [modalMateria, setModalMateria]     = useState(null);
  const [modalImportar, setModalImportar]   = useState(null);  // null | 'alumnos' | 'materias'
  const [reporte, setReporte]               = useState(null);
  const [reporteTitulo, setReporteTitulo]   = useState('');

  // Confirmar desactivar
  const [confirmDesactivar, setConfirmDesactivar] = useState(null);

  // Cargar datos de referencia al inicio
  useEffect(() => {
    api.get('/catalogo/periodos').then(({ data }) => {
      if (data.length > 0) setPeriodos([...new Set([...data, ...PERIODOS_DEFAULT])]);
    }).catch(() => {});
    api.get('/catalogo/carreras').then(({ data }) => {
      if (data.length > 0) setCarreras([...new Set([...data, ...CARRERAS_DEFAULT])]);
    }).catch(() => {});
  }, []);

  // ── Cargar alumnos ──────────────────────────────────────────────────────────
  const cargarAlumnos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtPeriodo) params.append('periodo',  filtPeriodo);
      if (filtCarrera) params.append('carrera',  filtCarrera);
      if (filtGrupo)   params.append('grupo',    filtGrupo);
      if (filtActivo)  params.append('activo',   filtActivo);
      if (filtQ)       params.append('q',        filtQ);
      const { data } = await api.get(`/catalogo/alumnos?${params}`);
      setAlumnos(data);
    } finally { setLoading(false); }
  }, [filtPeriodo, filtCarrera, filtGrupo, filtActivo, filtQ]);

  // ── Cargar materias ─────────────────────────────────────────────────────────
  const cargarMaterias = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtMPeriodo) params.append('periodo', filtMPeriodo);
      if (filtMActivo)  params.append('activo',  filtMActivo);
      if (filtMQ)       params.append('q',       filtMQ);
      const { data } = await api.get(`/catalogo/materias?${params}`);
      setMaterias(data);
    } finally { setLoading(false); }
  }, [filtMPeriodo, filtMActivo, filtMQ]);

  useEffect(() => {
    if (tab === 'alumnos')  cargarAlumnos();
    if (tab === 'materias') cargarMaterias();
  }, [tab, cargarAlumnos, cargarMaterias]);

  // ── Desactivar ──────────────────────────────────────────────────────────────
  const desactivar = async (tipo, id) => {
    try {
      await api.delete(`/catalogo/${tipo}/${id}`);
      tipo === 'alumnos' ? cargarAlumnos() : cargarMaterias();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al desactivar');
    } finally { setConfirmDesactivar(null); }
  };

  // ── Reactivar ───────────────────────────────────────────────────────────────
  const reactivar = async (tipo, item) => {
    try {
      await api.put(`/catalogo/${tipo}/${item.id}`, { activo: true });
      tipo === 'alumnos' ? cargarAlumnos() : cargarMaterias();
    } catch (err) { alert(err.response?.data?.detail || 'Error'); }
  };

  const handleReporte = (data, titulo) => {
    setModalImportar(null);
    setReporte(data);
    setReporteTitulo(titulo);
    tab === 'alumnos' ? cargarAlumnos() : cargarMaterias();
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Catálogos</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Alumnos y materias por periodo — base para autocomplete en el sistema
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModalImportar(tab)}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
            </svg>
            Importar Excel
          </button>
          <button
            onClick={() => tab === 'alumnos' ? setModalAlumno('nuevo') : setModalMateria('nuevo')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Agregar {tab === 'alumnos' ? 'alumno' : 'materia'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-800/60 rounded-xl p-1 w-fit border border-gray-700">
        {[
          { key: 'alumnos',  label: '🎓 Alumnos',  count: alumnos.length  },
          { key: 'materias', label: '📚 Materias', count: materias.length },
        ].map(({ key, label, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
              ${tab === key
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              tab === key ? 'bg-blue-500 text-white' : 'bg-gray-700 text-slate-400'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── TAB ALUMNOS ──────────────────────────────────────────────────────── */}
      {tab === 'alumnos' && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 mb-4 bg-gray-800 border border-gray-700 rounded-xl p-4">
            <input value={filtQ} onChange={e => setFiltQ(e.target.value)}
              placeholder="Buscar nombre o matrícula…"
              className="input-dark text-white text-sm  px-3 py-2  focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"/>
            <SelectDark
              value={filtPeriodo}
              onChange={setFiltPeriodo}
              className="w-40"
              placeholder="Todos los periodos"
              options={[{ value: '', label: 'Todos los periodos' }, ...periodos.map(p => ({ value: p, label: p }))]}
            />
            <SelectDark
              value={filtCarrera}
              onChange={setFiltCarrera}
              className="max-w-xs"
              placeholder="Todas las carreras"
              options={[{ value: '', label: 'Todas las carreras' }, ...carreras.map(c => ({ value: c, label: c }))]}
            />
            <SelectDark
              value={filtGrupo}
              onChange={setFiltGrupo}
              className="w-32"
              placeholder="Todos grupos"
              options={[{ value: '', label: 'Todos grupos' }, ...GRUPOS.map(g => ({ value: g, label: `Grupo ${g}` }))]}
            />
            <SelectDark
              value={filtActivo}
              onChange={setFiltActivo}
              className="w-28"
              options={[
                { value: 'true',  label: 'Activos' },
                { value: 'false', label: 'Inactivos' },
                { value: '',      label: 'Todos' },
              ]}
            />
          </div>

          {/* Tabla */}
          {loading ? (
            <div className="flex justify-center py-16">
              <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            </div>
          ) : alumnos.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">🎓</p>
              <p className="font-medium">No hay alumnos registrados</p>
              <p className="text-sm mt-1">Usa «Importar Excel» con la plantilla oficial o agrega uno manualmente.</p>
            </div>
          ) : (
            <div className="glass overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/60">
                  <tr>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Matrícula</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Nombre completo</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Carrera</th>
                    <th className="text-center text-slate-400 text-xs font-medium px-3 py-3">Cuat.</th>
                    <th className="text-center text-slate-400 text-xs font-medium px-3 py-3">Grupo</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Periodo</th>
                    <th className="text-center text-slate-400 text-xs font-medium px-3 py-3">Estado</th>
                    <th className="px-4 py-3"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {alumnos.map(a => (
                    <tr key={a.id} className={`hover:bg-white/8/30 transition-colors ${!a.activo ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-300">{a.matricula}</td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{a.nombre_completo}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[180px] truncate">{a.carrera}</td>
                      <td className="px-3 py-3 text-center text-gray-300 text-xs">{a.cuatrimestre}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full font-medium">
                          {a.grupo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{a.periodo}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          a.activo
                            ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                            : 'bg-gray-700 text-slate-400 border border-gray-600'}`}>
                          {a.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => setModalAlumno(a)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                            Editar
                          </button>
                          {a.activo ? (
                            <button onClick={() => setConfirmDesactivar({ tipo: 'alumnos', id: a.id, nombre: a.nombre_completo })}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors">
                              Desactivar
                            </button>
                          ) : (
                            <button onClick={() => reactivar('alumnos', a)}
                              className="text-xs text-green-400 hover:text-green-300 transition-colors">
                              Activar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-white/5 text-xs text-slate-500">
                {alumnos.filter(a => a.activo).length} activos · {alumnos.filter(a => !a.activo).length} inactivos
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB MATERIAS ─────────────────────────────────────────────────────── */}
      {tab === 'materias' && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 mb-4 bg-gray-800 border border-gray-700 rounded-xl p-4">
            <input value={filtMQ} onChange={e => setFiltMQ(e.target.value)}
              placeholder="Buscar materia…"
              className="input-dark text-white text-sm  px-3 py-2  focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"/>
            <SelectDark
              value={filtMPeriodo}
              onChange={setFiltMPeriodo}
              className="w-40"
              placeholder="Todos los periodos"
              options={[{ value: '', label: 'Todos los periodos' }, ...periodos.map(p => ({ value: p, label: p }))]}
            />
            <SelectDark
              value={filtMActivo}
              onChange={setFiltMActivo}
              className="w-28"
              options={[
                { value: 'true',  label: 'Activas' },
                { value: 'false', label: 'Inactivas' },
                { value: '',      label: 'Todas' },
              ]}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            </div>
          ) : materias.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">📚</p>
              <p className="font-medium">No hay materias registradas</p>
              <p className="text-sm mt-1">Importa el archivo Excel de materias (hoja «concentrado») o agrega una manualmente.</p>
            </div>
          ) : (
            <div className="glass overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/60">
                  <tr>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Materia</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Carrera</th>
                    <th className="text-center text-slate-400 text-xs font-medium px-3 py-3">Cuat.</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Periodo</th>
                    <th className="text-center text-slate-400 text-xs font-medium px-3 py-3">Estado</th>
                    <th className="px-4 py-3"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {materias.map(m => (
                    <tr key={m.id} className={`hover:bg-white/8/30 transition-colors ${!m.activo ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{m.nombre}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">{m.carrera || '—'}</td>
                      <td className="px-3 py-3 text-center text-gray-300 text-xs">{m.cuatrimestre_oficial || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{m.periodo || '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.activo
                            ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                            : 'bg-gray-700 text-slate-400 border border-gray-600'}`}>
                          {m.activo ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => setModalMateria(m)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                            Editar
                          </button>
                          {m.activo ? (
                            <button onClick={() => setConfirmDesactivar({ tipo: 'materias', id: m.id, nombre: m.nombre })}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors">
                              Desactivar
                            </button>
                          ) : (
                            <button onClick={() => reactivar('materias', m)}
                              className="text-xs text-green-400 hover:text-green-300 transition-colors">
                              Activar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-white/5 text-xs text-slate-500">
                {materias.filter(m => m.activo).length} activas · {materias.filter(m => !m.activo).length} inactivas
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Confirmar desactivar ─────────────────────────────────────────────── */}
      {confirmDesactivar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="glass w-full max-w-sm shadow-2xl p-6 space-y-4">
            <p className="text-white font-semibold">¿Desactivar registro?</p>
            <p className="text-slate-400 text-sm">
              <span className="text-white">{confirmDesactivar.nombre}</span> quedará inactivo pero no se eliminará del historial.
              Puedes volver a activarlo cuando lo necesites.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDesactivar(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={() => desactivar(confirmDesactivar.tipo, confirmDesactivar.id)}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modales ──────────────────────────────────────────────────────────── */}
      {(modalAlumno === 'nuevo' || (modalAlumno && typeof modalAlumno === 'object')) && (
        <ModalAlumno
          alumno={modalAlumno === 'nuevo' ? null : modalAlumno}
          periodos={periodos}
          carreras={carreras}
          onClose={() => setModalAlumno(null)}
          onGuardado={() => { setModalAlumno(null); cargarAlumnos(); }}
        />
      )}

      {(modalMateria === 'nuevo' || (modalMateria && typeof modalMateria === 'object')) && (
        <ModalMateria
          materia={modalMateria === 'nuevo' ? null : modalMateria}
          periodos={periodos}
          carreras={carreras}
          onClose={() => setModalMateria(null)}
          onGuardado={() => { setModalMateria(null); cargarMaterias(); }}
        />
      )}

      {modalImportar && (
        <ModalImportar
          titulo={modalImportar === 'alumnos' ? '📥 Importar alumnos' : '📥 Importar materias'}
          descripcion={modalImportar === 'alumnos'
            ? 'Usa la Plantilla_Alumnos_UTECAN.xlsx'
            : 'Usa el archivo de materias UTECAN (hoja «concentrado»)'}
          endpoint={modalImportar === 'alumnos' ? '/catalogo/alumnos/importar' : '/catalogo/materias/importar'}
          onClose={() => setModalImportar(null)}
          onImportado={(data) => handleReporte(data,
            modalImportar === 'alumnos' ? 'Resultado — Importar alumnos' : 'Resultado — Importar materias'
          )}
        />
      )}

      {reporte && (
        <ModalReporte
          reporte={reporte}
          titulo={reporteTitulo}
          onClose={() => setReporte(null)}
        />
      )}
    </AdminLayout>
  );
}
