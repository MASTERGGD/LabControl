import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import SelectDark from '../../components/SelectDark';
import { useTheme } from '../../context/ThemeContext';
import { usePeriodo } from '../../context/PeriodoContext';
import { ModalCarreras } from '../servicios_escolares/SEAlumnos';

// ─── Utilidad: período escolar actual ────────────────────────────────────────

/**
 * Devuelve el período escolar UTECAN actual basado en la fecha del navegador.
 *   ene–abr  → "ENE-ABR YYYY"
 *   may–ago  → "MAY-AGO YYYY"
 *   sep–dic  → "SEP-DIC YYYY"
 */
function periodoActual() {
  const hoy  = new Date();
  const mes  = hoy.getMonth() + 1; // 1-12
  const anio = hoy.getFullYear();
  if (mes <= 4)  return `ENE-ABR ${anio}`;
  if (mes <= 8)  return `MAY-AGO ${anio}`;
  return `SEP-DIC ${anio}`;
}


// ─── Constantes ───────────────────────────────────────────────────────────────

const PERIODOS_DEFAULT = [
  'ENE-ABR 2025','MAY-AGO 2025','SEP-DIC 2025',
  'ENE-ABR 2026','MAY-AGO 2026','SEP-DIC 2026',
  'ENE-ABR 2027','MAY-AGO 2027',
];

const GRUPOS = ['A','B','C','D'];


// ─── Labels legibles para campos sensibles ────────────────────────────────────

const LABEL_CAMPO = {
  cuatrimestre: 'Cuatrimestre',
  carrera:      'Carrera',
  grupo:        'Grupo',
};

// ─── Componente: Reporte de importación ───────────────────────────────────────

function ModalReporte({ reporte, titulo, onClose }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const {
    creados          = 0,
    actualizados     = 0,
    sin_cambios      = 0,
    total_errores    = 0,
    errores          = [],
    cambios_sensibles = [],
  } = reporte;
  const total = creados + actualizados + sin_cambios + total_errores;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl max-h-[90vh] flex flex-col ${isDay ? 'border-slate-200 bg-white' : 'border-white/10 bg-slate-900'}`}>
        <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${isDay ? 'border-slate-200' : 'border-white/10'}`}>
          <h3 className={`font-semibold ${isDay ? 'text-slate-950' : 'text-white'}`}>{titulo}</h3>
          <button onClick={onClose} className={`${isDay ? 'text-slate-500 hover:text-slate-950' : 'text-slate-400 hover:text-white'}`} aria-label="Cerrar resultado de importación">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {/* Resumen en 4 tarjetas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className={`border rounded-xl p-3 text-center ${isDay ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-900/40 border-emerald-700/50'}`}>
              <p className={`text-2xl font-bold ${isDay ? 'text-emerald-700' : 'text-emerald-400'}`}>{creados}</p>
              <p className={`text-xs mt-1 ${isDay ? 'text-emerald-800' : 'text-emerald-300'}`}>Nuevos</p>
            </div>
            <div className={`border rounded-xl p-3 text-center ${isDay ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/40 border-blue-700/50'}`}>
              <p className={`text-2xl font-bold ${isDay ? 'text-blue-700' : 'text-blue-400'}`}>{actualizados}</p>
              <p className={`text-xs mt-1 ${isDay ? 'text-blue-800' : 'text-blue-300'}`}>Actualizados</p>
            </div>
            <div className={`border rounded-xl p-3 text-center ${isDay ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.04] border-slate-600/50'}`}>
              <p className={`text-2xl font-bold ${isDay ? 'text-slate-700' : 'text-slate-300'}`}>{sin_cambios}</p>
              <p className={`text-xs mt-1 ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>Sin cambios</p>
            </div>
            <div className={`rounded-xl p-3 text-center border ${
              total_errores > 0
                ? (isDay ? 'bg-red-50 border-red-200' : 'bg-red-900/40 border-red-700/50')
                : (isDay ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.04] border-slate-600/50')}`}>
              <p className={`text-2xl font-bold ${total_errores > 0 ? (isDay ? 'text-red-700' : 'text-red-400') : (isDay ? 'text-slate-700' : 'text-slate-400')}`}>
                {total_errores}
              </p>
              <p className={`text-xs mt-1 ${total_errores > 0 ? (isDay ? 'text-red-800' : 'text-red-300') : (isDay ? 'text-slate-600' : 'text-slate-400')}`}>
                Con error
              </p>
            </div>
          </div>

          {total_errores === 0 && cambios_sensibles.length === 0 && (
            <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${isDay ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-900/20 border-emerald-700/40'}`}>
              <span className="text-xl">✅</span>
              <p className={`text-sm ${isDay ? 'text-emerald-800' : 'text-emerald-300'}`}>
                Importación completada sin errores. {total} registros procesados.
              </p>
            </div>
          )}

          {/* Cambios sensibles aplicados */}
          {cambios_sensibles.length > 0 && (
            <div>
              <p className="text-xs text-amber-400 font-semibold mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <span>⚠️</span> Cambios aplicados en campos importantes ({cambios_sensibles.length})
              </p>
              <div className="bg-slate-950/60 rounded-xl border border-amber-800/40 divide-y divide-gray-700/50 max-h-48 overflow-y-auto">
                {cambios_sensibles.map((c, i) => (
                  <div key={i} className="px-3 py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-white font-medium truncate">{c.nombre}</p>
                      <p className="text-xs text-slate-500 font-mono">{c.matricula}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="text-slate-400">{LABEL_CAMPO[c.campo] ?? c.campo}</p>
                      <p className="text-red-400 line-through">{c.antes}</p>
                      <p className="text-green-400">{c.despues}</p>
                    </div>
                  </div>
                ))}
              </div>
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

        <div className={`px-6 py-4 border-t shrink-0 ${isDay ? 'border-slate-200' : 'border-white/10'}`}>
          <button onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2.5 text-sm font-semibold transition-colors"
            style={{ color: '#ffffff' }}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Componente: Modal importar archivo (flujo 2 pasos: preview → confirmar) ──

function ModalImportar({ titulo, descripcion, endpoint, supportsPreview, extraParams = {}, onClose, onImportado }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [archivo, setArchivo]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [preview, setPreview]     = useState(null);  // resultado de preview
  const inputRef = useRef();

  const enviarArchivo = async (modoPreview) => {
    if (!archivo) { setError('Selecciona un archivo Excel primero'); return; }
    setLoading(true);
    setError('');
    const form = new FormData();
    form.append('file', archivo);
    try {
      const query = new URLSearchParams(extraParams);
      if (supportsPreview) query.set('preview', modoPreview ? 'true' : 'false');
      const url = query.toString() ? `${endpoint}?${query}` : endpoint;
      const { data } = await api.post(url, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (modoPreview) {
        setPreview(data);
      } else {
        onImportado(data);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al procesar el archivo');
    } finally {
      setLoading(false);
    }
  };

  // ── Vista previa disponible ───────────────────────────────────────────────────
  if (preview) {
    const {
      creados          = 0,
      actualizados     = 0,
      sin_cambios      = 0,
      total_errores    = 0,
      cambios_sensibles = [],
    } = preview;
    const total = creados + actualizados + sin_cambios + total_errores;
    const hayCambiosSensibles = cambios_sensibles.length > 0;

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl max-h-[90vh] flex flex-col ${isDay ? 'border-slate-200 bg-white' : 'border-white/10 bg-slate-900'}`}>
          <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${isDay ? 'border-slate-200' : 'border-white/10'}`}>
            <div>
              <h3 className={`font-semibold ${isDay ? 'text-slate-950' : 'text-white'}`}>Vista previa — ¿aplicar cambios?</h3>
              <p className={`text-xs mt-0.5 ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>{archivo?.name}</p>
            </div>
            <button onClick={onClose} className={isDay ? 'text-slate-600 hover:text-slate-950' : 'text-slate-400 hover:text-white'}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className={`border rounded-xl p-3 text-center ${isDay ? 'bg-emerald-50 border-emerald-300' : 'bg-emerald-950/60 border-emerald-700'}`}>
                <p className={`text-xl font-bold ${isDay ? 'text-emerald-800' : 'text-emerald-300'}`}>{creados}</p>
                <p className={`text-xs font-medium mt-1 ${isDay ? 'text-emerald-900' : 'text-emerald-200'}`}>Nuevos</p>
              </div>
              <div className={`border rounded-xl p-3 text-center ${isDay ? 'bg-blue-50 border-blue-300' : 'bg-blue-950/60 border-blue-700'}`}>
                <p className={`text-xl font-bold ${isDay ? 'text-blue-800' : 'text-blue-300'}`}>{actualizados}</p>
                <p className={`text-xs font-medium mt-1 ${isDay ? 'text-blue-900' : 'text-blue-200'}`}>Se actualizan</p>
              </div>
              <div className={`border rounded-xl p-3 text-center ${isDay ? 'bg-slate-50 border-slate-300' : 'bg-slate-800 border-slate-600'}`}>
                <p className={`text-xl font-bold ${isDay ? 'text-slate-800' : 'text-slate-200'}`}>{sin_cambios}</p>
                <p className={`text-xs font-medium mt-1 ${isDay ? 'text-slate-700' : 'text-slate-300'}`}>Sin cambios</p>
              </div>
              <div className={`rounded-xl p-3 text-center border ${
                total_errores > 0
                  ? (isDay ? 'bg-red-50 border-red-300' : 'bg-red-950/60 border-red-700')
                  : (isDay ? 'bg-slate-50 border-slate-300' : 'bg-slate-800 border-slate-600')}`}>
                <p className={`text-xl font-bold ${total_errores > 0 ? (isDay ? 'text-red-800' : 'text-red-300') : (isDay ? 'text-slate-800' : 'text-slate-200')}`}>
                  {total_errores}
                </p>
                <p className={`text-xs font-medium mt-1 ${total_errores > 0 ? (isDay ? 'text-red-900' : 'text-red-200') : (isDay ? 'text-slate-700' : 'text-slate-300')}`}>
                  Con error
                </p>
              </div>
            </div>

            {/* Advertencia si no hay nada que hacer */}
            {creados === 0 && actualizados === 0 && total_errores === 0 && (
              <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/40 rounded-xl px-4 py-3">
                <span className="text-lg">ℹ️</span>
                <p className="text-blue-300 text-sm">
                  El archivo no tiene cambios respecto al catálogo actual. {sin_cambios} registros idénticos.
                </p>
              </div>
            )}

            {/* Cambios sensibles */}
            {hayCambiosSensibles && (
              <div>
                <p className="text-xs text-amber-400 font-semibold mb-2 uppercase tracking-wide flex items-center gap-1.5">
                  <span>⚠️</span> Cambios en campos importantes ({cambios_sensibles.length} alumnos)
                </p>
                <div className="bg-slate-950/60 rounded-xl border border-amber-800/40 divide-y divide-gray-700/50 max-h-40 overflow-y-auto">
                  {cambios_sensibles.map((c, i) => (
                    <div key={i} className="px-3 py-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-white font-medium truncate">{c.nombre}</p>
                        <p className="text-xs text-slate-500 font-mono">{c.matricula}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <p className="text-slate-400">{LABEL_CAMPO[c.campo] ?? c.campo}</p>
                        <p className="text-red-400 line-through">{c.antes}</p>
                        <p className="text-green-400">{c.despues}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-amber-500 mt-2">
                  Revisa los cambios anteriores antes de confirmar. Puedes cancelar y corregir el Excel si algo no es correcto.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div className={`px-6 py-4 border-t shrink-0 flex gap-3 ${isDay ? 'border-slate-200' : 'border-white/10'}`}>
            <button onClick={() => setPreview(null)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${isDay ? 'bg-slate-100 hover:bg-slate-200 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
              ← Volver
            </button>
            <button
              onClick={() => enviarArchivo(false)}
              disabled={loading || (creados === 0 && actualizados === 0)}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:text-slate-400 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Aplicando...' : `✅ Confirmar importación (${total - total_errores} registros)`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Paso 1: seleccionar archivo ───────────────────────────────────────────────
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
              onChange={e => { setArchivo(e.target.files[0]); setError(''); setPreview(null); }}/>
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

          {supportsPreview && archivo && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <span>💡</span>
              Se mostrará una vista previa antes de aplicar los cambios.
            </p>
          )}

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
            <button
              onClick={() => supportsPreview ? enviarArchivo(true) : enviarArchivo(false)}
              disabled={loading || !archivo}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:text-slate-400 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading
                ? (supportsPreview ? 'Analizando...' : 'Importando...')
                : (supportsPreview ? '🔍 Analizar archivo' : '⬆ Importar')}
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
    periodo:          alumno?.periodo          ?? (esEdicion ? '' : periodoActual()),
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

function ModalMateria({ materia, carreras, onClose, onGuardado }) {
  const esEdicion = !!materia;
  const [form, setForm] = useState({
    nombre:               materia?.nombre               ?? '',
    carrera:              materia?.carrera              ?? '',
    cuatrimestre_oficial: materia?.cuatrimestre_oficial ?? '',
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

          <div>
            <label className="block text-xs text-slate-400 mb-1">Cuatrimestre oficial</label>
            <SelectDark
              value={form.cuatrimestre_oficial}
              onChange={v => set('cuatrimestre_oficial', v)}
              placeholder="—"
              options={[{ value: '', label: '—' }, ...Array.from({length:12},(_,i)=>i+1).map(n => ({ value: n, label: String(n) }))]}
            />
            <p className="mt-2 text-xs text-slate-500">La materia pertenece al plan de estudios y podrá programarse en cualquier periodo académico.</p>
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

function ModalActivarEstudio({ alumno, periodoInicial, periodos, onClose, onOk }) {
  const [periodo, setPeriodo] = useState(periodoInicial || periodos[0] || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const activar = async (e) => {
    e.preventDefault();
    if (!periodo || guardando) return;
    setGuardando(true); setError('');
    try {
      await api.post(`/servicios-escolares/alumnos/${alumno.id}/fichas`, null, { params: { periodo } });
      onOk(`Estudio socioeconómico activado para ${alumno.nombre_completo}.`);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo activar el estudio socioeconómico.');
    } finally { setGuardando(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => !guardando && onClose()}>
    <form onSubmit={activar} onMouseDown={e => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900 shadow-2xl">
      <header className="border-b border-white/10 px-5 py-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Servicios Escolares</p><h2 className="mt-1 text-lg font-bold text-white">Activar estudio socioeconómico</h2><p className="mt-1 text-sm text-slate-400">{alumno.nombre_completo} · {alumno.matricula}</p></header>
      <div className="p-5"><label className="text-sm text-slate-300">Periodo<select required value={periodo} onChange={e => setPeriodo(e.target.value)} className="input-dark mt-1.5 w-full">{periodos.map(p => <option key={p} value={p}>{p}</option>)}</select></label><p className="mt-3 text-xs leading-5 text-slate-500">El alumno podrá capturar y guardar su información al ingresar a SIGA.</p>{error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}</div>
      <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4"><button type="button" disabled={guardando} onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancelar</button><button disabled={guardando || !periodo} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Activando…' : 'Activar ficha'}</button></footer>
    </form>
  </div>;
}

function ModalActivacionMasiva({ alumnos, periodoInicial, periodos, onClose, onOk }) {
  const [periodo, setPeriodo] = useState(periodoInicial || periodos[0] || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const activar = async (e) => {
    e.preventDefault(); setGuardando(true); setError('');
    try {
      const { data } = await api.post('/servicios-escolares/fichas/activar-masivo', { alumno_ids: alumnos.map(a => a.id), periodo });
      onOk(data);
    } catch (err) { setError(err.response?.data?.detail || 'No se pudo completar la activación masiva.'); }
    finally { setGuardando(false); }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => !guardando && onClose()}><form onSubmit={activar} onMouseDown={e => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900 shadow-2xl"><header className="border-b border-white/10 px-5 py-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Activación masiva</p><h2 className="mt-1 text-lg font-bold text-white">Activar {alumnos.length} estudios</h2><p className="mt-1 text-sm text-slate-400">Las fichas existentes se conservarán y serán omitidas.</p></header><div className="space-y-4 p-5"><label className="text-sm text-slate-300">Periodo<select required value={periodo} onChange={e => setPeriodo(e.target.value)} className="input-dark mt-1.5 w-full">{periodos.map(p => <option key={p} value={p}>{p}</option>)}</select></label><div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 p-3 text-xs text-slate-400">{alumnos.map(a => <p key={a.id} className="py-1"><span className="font-mono text-slate-500">{a.matricula}</span> · {a.nombre_completo}</p>)}</div>{error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}</div><footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4"><button type="button" disabled={guardando} onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancelar</button><button disabled={guardando || !periodo} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Activando…' : `Activar ${alumnos.length} fichas`}</button></footer></form></div>;
}

function ModalAccesoAlumno({ alumno, onClose, onOk }) {
  const [correo, setCorreo] = useState(alumno.correo_institucional || '');
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const activar = async (e) => { e.preventDefault(); setGuardando(true); setError(''); try { const { data } = await api.post(`/servicios-escolares/alumnos/${alumno.id}/activar-acceso`, { correo_institucional: correo.trim() || null }); setResultado(data); onOk(); } catch (err) { setError(err.response?.data?.detail || 'No se pudo crear el acceso SIGA.'); } finally { setGuardando(false); } };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md overflow-hidden rounded-2xl border border-blue-500/20 bg-slate-900 shadow-2xl">{resultado ? <div className="p-6"><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Acceso creado</p><h2 className="mt-1 text-lg font-bold text-white">Entrega estas credenciales al alumno</h2><div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4"><p className="text-xs text-slate-400">Usuario</p><p className="mt-1 break-all font-mono text-white">{resultado.email}</p><p className="mt-4 text-xs text-slate-400">Contraseña temporal</p><p className="mt-1 font-mono text-xl font-bold tracking-wider text-amber-300">{resultado.password_temporal}</p></div><p className="mt-4 text-xs leading-5 text-slate-500">La contraseña solo se muestra ahora. Al ingresar, el alumno deberá cambiarla y será dirigido a su estudio.</p><button onClick={onClose} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Entendido</button></div> : <form onSubmit={activar}><header className="border-b border-white/10 px-5 py-4"><p className="text-xs font-bold uppercase tracking-wider text-blue-400">Cuenta de alumno</p><h2 className="mt-1 text-lg font-bold text-white">Dar acceso a SIGA</h2><p className="mt-1 text-sm text-slate-400">{alumno.nombre_completo} · {alumno.matricula}</p></header><div className="p-5"><label className="text-sm text-slate-300">Correo de acceso <span className="text-slate-500">(opcional)</span><input type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder={`${alumno.matricula}@alumno.utecan.edu.mx`} className="input-dark mt-1.5 w-full" /></label><p className="mt-3 text-xs text-slate-500">Si queda vacío, se utilizará la matrícula como correo institucional.</p>{error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}</div><footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4"><button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancelar</button><button disabled={guardando} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Creando…' : 'Crear acceso'}</button></footer></form>}</div></div>;
}

export default function Catalogo({ modo = 'completo' }) {
  const { periodo: periodoGlobal } = usePeriodo();
  const [tab, setTab] = useState(modo === 'materias' ? 'materias' : 'alumnos');

  // Datos
  const [alumnos, setAlumnos]   = useState([]);
  const [materias, setMaterias] = useState([]);
  const [periodos, setPeriodos] = useState(PERIODOS_DEFAULT);
  const [periodosMaterias, setPeriodosMaterias] = useState([]);
  // El catalogo institucional es la unica fuente de carreras. No mezclar
  // valores de demostracion: una carrera inexistente aqui termina propagada
  // a materias, grupos y alumnos.
  const [carreras, setCarreras] = useState([]);
  const [loading, setLoading]   = useState(false);

  // El periodo se controla globalmente desde el encabezado de SIGA.
  const filtPeriodo = periodoGlobal?.clave || periodoActual();
  const [filtCarrera, setFiltCarrera] = useState('');
  const [filtGrupo, setFiltGrupo]     = useState('');
  const [filtActivo, setFiltActivo]   = useState('true');
  const [filtQ, setFiltQ]             = useState('');

  // Filtros del plan de estudios permanente
  const [filtMActivo, setFiltMActivo]   = useState('true');
  const [filtMQ, setFiltMQ]             = useState('');

  // Modales
  const [modalAlumno, setModalAlumno]       = useState(null);  // null | 'nuevo' | alumno
  const [modalMateria, setModalMateria]     = useState(null);
  const [modalImportar, setModalImportar]   = useState(null);  // null | 'alumnos' | 'materias'
  const [modalCarreras, setModalCarreras]   = useState(false);
  const [reporte, setReporte]               = useState(null);
  const [reporteTitulo, setReporteTitulo]   = useState('');

  // Confirmar desactivar
  const [confirmDesactivar, setConfirmDesactivar] = useState(null);
  const [alumnoParaEstudio, setAlumnoParaEstudio] = useState(null);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [activarSeleccionados, setActivarSeleccionados] = useState(false);
  const [alumnoParaAcceso, setAlumnoParaAcceso] = useState(null);
  const [mensaje, setMensaje] = useState('');

  // Cargar datos de referencia al inicio
  useEffect(() => {
    api.get('/catalogo/periodos').then(({ data }) => {
      if (data.length > 0) setPeriodos([...new Set([...data, ...PERIODOS_DEFAULT])]);
    }).catch(() => {});
    api.get('/catalogo/carreras').then(({ data }) => {
      setCarreras(data);
    }).catch(() => {});
    api.get('/catalogo/periodos/gestion-materias').then(({ data }) => {
      setPeriodosMaterias(data);
    }).catch(() => {});
  }, []);

  const periodoInstitucionalActual = periodosMaterias.find(p => p.es_actual)?.clave || periodoActual();

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
      if (filtMActivo)  params.append('activo',  filtMActivo);
      if (filtMQ)       params.append('q',       filtMQ);
      const { data } = await api.get(`/catalogo/materias?${params}`);
      setMaterias(data);
    } finally { setLoading(false); }
  }, [filtMActivo, filtMQ]);

  useEffect(() => {
    if (tab === 'alumnos')  cargarAlumnos();
    if (tab === 'materias') cargarMaterias();
  }, [tab, cargarAlumnos, cargarMaterias]);
  useEffect(() => { setSeleccionados(actual => new Set([...actual].filter(id => alumnos.some(a => a.id === id && a.activo)))); }, [alumnos]);

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
          <h1 className="text-2xl font-bold text-white">{modo === 'alumnos' ? 'Alumnos' : 'Materias'}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {modo === 'alumnos' ? 'Altas, importación e inscripciones por periodo y grupo' : 'Catálogo académico administrado por Dirección de División de Carrera'}
          </p>
          {tab === 'materias' && <span className="inline-flex items-center gap-1.5 mt-1.5 bg-blue-900/40 border border-blue-700/50 text-blue-300 text-xs font-medium px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <strong>Plan de estudios permanente</strong>
          </span>}
        </div>
        <div className="flex gap-2">
          {tab === 'alumnos' && (
            <button onClick={() => setModalCarreras(true)}
              className="flex items-center gap-2 border border-emerald-600 bg-white/5 hover:bg-emerald-600/10 text-emerald-500 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              <span aria-hidden="true">🎓</span> Carreras
            </button>
          )}
          <button
            onClick={() => setModalImportar(tab)}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
            </svg>
            Importar Excel
          </button>
          <button
            onClick={() => tab === 'alumnos' ? setModalAlumno('nuevo') : setModalMateria('nuevo')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Agregar {tab === 'alumnos' ? 'alumno' : 'materia'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      {modo === 'completo' && <div className="flex gap-1 mb-6 bg-gray-800/60 rounded-xl p-1 w-fit border border-gray-700">
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
      </div>}

      {/* ── TAB ALUMNOS ──────────────────────────────────────────────────────── */}
      {tab === 'alumnos' && (
        <>
          {mensaje && <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{mensaje}</div>}
          {seleccionados.size > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-3"><p className="text-sm text-emerald-200"><b>{seleccionados.size}</b> alumno(s) seleccionado(s)</p><div className="flex gap-2"><button onClick={() => setSeleccionados(new Set())} className="rounded-lg px-3 py-2 text-xs text-slate-400">Limpiar</button><button onClick={() => setActivarSeleccionados(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Activar estudios seleccionados</button></div></div>}
          {/* Filtros */}
          <div className="grid grid-cols-1 gap-3 mb-4 bg-gray-800 border border-gray-700 rounded-xl p-4 sm:grid-cols-2 lg:grid-cols-12">
            <input value={filtQ} onChange={e => setFiltQ(e.target.value)}
              placeholder="Buscar nombre o matrícula…"
              className="input-dark text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-2 lg:col-span-12"/>
            <SelectDark
              value={filtCarrera}
              onChange={setFiltCarrera}
              className="w-full sm:col-span-2 lg:col-span-7"
              menuMinWidth={460}
              placeholder="Todas las carreras"
              options={[{ value: '', label: 'Todas las carreras' }, ...carreras.map(c => ({ value: c, label: c, wrap: true }))]}
            />
            <SelectDark
              value={filtGrupo}
              onChange={setFiltGrupo}
              className="w-full lg:col-span-3"
              placeholder="Todos los grupos"
              options={[{ value: '', label: 'Todos los grupos' }, ...GRUPOS.map(g => ({ value: g, label: `Grupo ${g}` }))]}
            />
            <SelectDark
              value={filtActivo}
              onChange={setFiltActivo}
              className="w-full lg:col-span-2"
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
            <div className="glass overflow-x-auto">
              <table className="w-full min-w-[1280px] text-sm">
                <thead className="bg-slate-950/60">
                  <tr>
                    <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Seleccionar alumnos visibles" checked={alumnos.filter(a => a.activo).length > 0 && alumnos.filter(a => a.activo).every(a => seleccionados.has(a.id))} onChange={e => setSeleccionados(e.target.checked ? new Set(alumnos.filter(a => a.activo).map(a => a.id)) : new Set())} /></th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Matrícula</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Nombre completo</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Carrera</th>
                    <th className="text-center text-slate-400 text-xs font-medium px-3 py-3">Cuat.</th>
                    <th className="text-center text-slate-400 text-xs font-medium px-3 py-3">Grupo</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-3 py-3">Acceso SIGA</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-3 py-3">Estudio</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Periodo</th>
                    <th className="text-center text-slate-400 text-xs font-medium px-3 py-3">Estado</th>
                    <th className="px-4 py-3"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {alumnos.map(a => (
                    <tr key={a.id} className={`hover:bg-white/8/30 transition-colors ${!a.activo ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-3"><input type="checkbox" disabled={!a.activo} aria-label={`Seleccionar ${a.nombre_completo}`} checked={seleccionados.has(a.id)} onChange={() => setSeleccionados(actual => { const next = new Set(actual); if (next.has(a.id)) next.delete(a.id); else next.add(a.id); return next; })} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-300">{a.matricula}</td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{a.nombre_completo}</p>
                      </td>
                      <td className="min-w-[240px] max-w-[320px] px-4 py-3 text-xs leading-snug text-slate-400" title={a.carrera}>{a.carrera}</td>
                      <td className="px-3 py-3 text-center text-gray-300 text-xs">{a.cuatrimestre}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full font-medium">
                          {a.grupo}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">{a.tiene_acceso_siga ? <span className="font-medium text-emerald-500">✓ Habilitado</span> : <button onClick={() => setAlumnoParaAcceso(a)} className="font-semibold text-blue-500 hover:text-blue-400">Dar acceso</button>}</td>
                      <td className="px-3 py-3 text-xs">{a.ficha && a.ficha.periodo === (filtPeriodo || a.periodo) ? <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-500">{a.ficha.estado.replaceAll('_', ' ')}</span> : <span className="text-slate-500">Sin activar</span>}</td>
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
                          {a.activo && (!a.ficha || a.ficha.periodo !== (filtPeriodo || a.periodo) || a.ficha.estado === 'RECHAZADA') && <button onClick={() => setAlumnoParaEstudio(a)}
                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
                            Activar estudio
                          </button>}
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
              value={filtMActivo}
              onChange={setFiltMActivo}
              className="w-28"
              options={[
                { value: 'true',  label: 'Activas' },
                { value: 'false', label: 'Inactivas' },
                { value: '',      label: 'Todas' },
              ]}
            />
            <span className="inline-flex items-center rounded-full border border-blue-700/50 bg-blue-900/30 px-3 py-2 text-xs font-semibold text-blue-300">El periodo se asigna al programar la carga docente</span>
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
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Uso</th>
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
                      <td className="px-4 py-3 text-xs text-slate-400">Todos los periodos</td>
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
      {alumnoParaEstudio && <ModalActivarEstudio alumno={alumnoParaEstudio} periodoInicial={filtPeriodo || periodoInstitucionalActual} periodos={periodos} onClose={() => setAlumnoParaEstudio(null)} onOk={(texto) => { setAlumnoParaEstudio(null); setMensaje(texto); }} />}
      {activarSeleccionados && <ModalActivacionMasiva alumnos={alumnos.filter(a => seleccionados.has(a.id))} periodoInicial={filtPeriodo || periodoInstitucionalActual} periodos={periodos} onClose={() => setActivarSeleccionados(false)} onOk={(data) => { setActivarSeleccionados(false); setSeleccionados(new Set()); setMensaje(`${data.resumen.creadas} ficha(s) activada(s) · ${data.resumen.omitidas} ya existentes · ${data.resumen.errores} error(es).`); }} />}
      {alumnoParaAcceso && <ModalAccesoAlumno alumno={alumnoParaAcceso} onClose={() => { setAlumnoParaAcceso(null); cargarAlumnos(); }} onOk={cargarAlumnos} />}

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
          supportsPreview={modalImportar === 'alumnos'}
          extraParams={{}}
          onClose={() => setModalImportar(null)}
          onImportado={(data) => handleReporte(data,
            modalImportar === 'alumnos' ? 'Resultado — Importar alumnos' : 'Resultado — Importar materias'
          )}
        />
      )}

      {modalCarreras && (
        <ModalCarreras onClose={() => {
          setModalCarreras(false);
          api.get('/catalogo/carreras').then(({ data }) => {
            if (data.length > 0) setCarreras(data);
          }).catch(() => {});
        }} />
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
