import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../hooks/useApi';
import AutocompleteInput, { formatApiError } from '../../components/AutocompleteInput';
import SelectDark from '../../components/SelectDark';

// ─── Colores por estado de PC ──────────────────────────────────────────────────
const PC_ESTILOS = {
  OCUPADA:       { bg: 'bg-red-900/70 border-red-600',    texto: 'text-red-200',    label: 'Ocupada'   },
  EN_CLASE:      { bg: 'bg-green-900/50 border-green-700', texto: 'text-green-300',  label: 'Libre'     },
  OPERATIVO:     { bg: 'bg-gray-700 border-gray-600',      texto: 'text-gray-300',   label: 'Libre'     },
  MANTENIMIENTO: { bg: 'bg-yellow-900/50 border-yellow-700', texto: 'text-yellow-300', label: 'Mant.'  },
  DAÑADO:        { bg: 'bg-orange-900/50 border-orange-700', texto: 'text-orange-300', label: 'Dañado' },
  BAJA:          { bg: 'bg-gray-800 border-gray-700 opacity-40', texto: 'text-slate-500', label: 'Baja'  },
};

// ─── Modal Asignar Alumno ─────────────────────────────────────────────────────

function ModalAsignar({ pc, sesionId, onClose, onAsignada }) {
  const [form, setForm]           = useState({ alumno_nombre: '', alumno_matricula: '' });
  const [alumnoQuery, setAlumnoQuery] = useState('');
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const seleccionarAlumno = (a) => {
    const nombre = [a.apellido_paterno, a.apellido_materno, a.nombres].filter(Boolean).join(' ');
    setAlumnoQuery(nombre);
    setAlumnoSeleccionado(a);
    setForm({ alumno_nombre: nombre, alumno_matricula: a.matricula || '' });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/sesiones/${sesionId}/asignaciones`, {
        computadora_id:   pc.pc_id,
        alumno_nombre:    form.alumno_nombre.trim(),
        alumno_matricula: form.alumno_matricula.trim(),
      });
      onAsignada();
    } catch (err) {
      setError(formatApiError(err, 'Error al asignar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Asignar alumno</h3>
            <p className="text-xs text-slate-400 mt-0.5">PC {pc.codigo}{pc.fila ? ` · Fila ${pc.fila}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Autocomplete alumno */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Buscar alumno *
              <span className="text-slate-500 font-normal ml-1">(nombre o matrícula)</span>
            </label>
            <div className="[&_input]:bg-gray-700 [&_input]:text-white [&_input]:border-gray-600
                            [&_input:focus]:ring-green-500 [&_ul]:bg-gray-800 [&_ul]:border-gray-600
                            [&_li]:text-gray-200 [&_li:hover]:bg-gray-700">
              <AutocompleteInput
                endpoint="/catalogo/alumnos/buscar"
                placeholder="Escribe nombre o matrícula…"
                value={alumnoQuery}
                onChange={(txt) => {
                  setAlumnoQuery(txt);
                  setAlumnoSeleccionado(null);
                  setForm(f => ({ ...f, alumno_nombre: txt, alumno_matricula: '' }));
                }}
                onSelect={seleccionarAlumno}
                renderItem={(a) => (
                  <div>
                    <p className="font-medium leading-tight">
                      {a.apellido_paterno} {a.apellido_materno}, {a.nombres}
                    </p>
                    <p className="text-xs text-slate-400 leading-tight">
                      {a.matricula} · {a.carrera ? a.carrera.split(' ').slice(0,3).join(' ') : '—'}
                      {a.grupo ? ` · Gpo ${a.grupo}` : ''}
                    </p>
                  </div>
                )}
              />
            </div>
            <input type="text" required className="sr-only" value={form.alumno_nombre} readOnly tabIndex={-1} />
          </div>

          {/* Datos auto-llenados o manuales */}
          {alumnoSeleccionado ? (
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg px-4 py-3 text-sm space-y-1">
              <p className="text-green-300 font-semibold">{form.alumno_nombre}</p>
              <p className="text-green-400/80">Matrícula: {form.alumno_matricula}</p>
              {alumnoSeleccionado.carrera && (
                <p className="text-green-400/60 text-xs">{alumnoSeleccionado.carrera}</p>
              )}
            </div>
          ) : (
            /* Campos manuales como fallback si no está en catálogo */
            form.alumno_nombre && !alumnoSeleccionado && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Matrícula *</label>
                <input
                  value={form.alumno_matricula}
                  onChange={e => setForm(f => ({ ...f, alumno_matricula: e.target.value }))}
                  required
                  placeholder="Ej: 2023100123"
                  className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )
          )}

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Asignando...' : 'Asignar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal PC Ocupada ──────────────────────────────────────────────────────────

function ModalPCOcupada({ pc, sesionId, onClose, onLiberada, onObservacion, onReportarDano }) {
  const [loading, setLoading] = useState(false);

  const handleLiberar = async () => {
    setLoading(true);
    try {
      await api.delete(`/sesiones/${sesionId}/asignaciones/${pc.alumno.asignacion_id}`);
      onLiberada();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al liberar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">PC {pc.codigo}</h3>
            {pc.fila && <p className="text-xs text-slate-400">Fila {pc.fila}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-700 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Alumno asignado</p>
            <p className="font-semibold text-white">{pc.alumno?.nombre}</p>
            <p className="text-sm text-gray-300">{pc.alumno?.matricula}</p>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={handleLiberar} disabled={loading}
              className="w-full bg-red-700 hover:bg-red-600 disabled:bg-red-900 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Liberando...' : '🔓 Liberar PC'}
            </button>
            <button onClick={() => onObservacion(pc)}
              className="w-full bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              ⚠️ Registrar observación
            </button>
            <button onClick={() => onReportarDano(pc)}
              className="w-full bg-orange-700 hover:bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              💥 Reportar daño al inventario
            </button>
            <button onClick={onClose}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Reportar Daño (desde sesión) ───────────────────────────────────────

function ModalReportarDano({ pc, sesion, onClose }) {
  const [form, setForm] = useState({
    tipo: 'DAÑO', prioridad: 'MEDIA', descripcion: '',
  });
  const [loading, setLoading] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/inventario/incidentes', {
        computadora_id: pc?.pc_id ?? null,
        laboratorio_id: sesion?.laboratorio_id ?? null,
        origen:    'SESION',
        origen_id: sesion?.id ?? null,
        tipo:      form.tipo,
        prioridad: form.prioridad,
        descripcion: form.descripcion || `Daño reportado durante sesión ${sesion?.materia || ''} — PC ${pc?.codigo}`,
      });
      setGuardado(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(formatApiError(err, 'Error al reportar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-2xl p-6">
        {guardado ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-green-400 font-semibold">Incidente reportado al administrador</p>
            <p className="text-slate-400 text-sm mt-1">El responsable del laboratorio recibirá el reporte</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h3 className="font-semibold text-white">💥 Reportar daño — PC {pc?.codigo}</h3>
              <p className="text-xs text-slate-400 mt-1">
                Este reporte irá directamente al módulo de Mantenimiento
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Tipo de incidente</label>
                <SelectDark
                  value={form.tipo}
                  onChange={v => setForm({...form, tipo: v})}
                  options={[
                    { value: 'DAÑO',          label: '💥 Daño físico' },
                    { value: 'MANTENIMIENTO', label: '🔧 Requiere mantenimiento' },
                    { value: 'OTRO',          label: '📌 Otro' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Prioridad</label>
                <div className="flex gap-2">
                  {[['ALTA','🔴 Alta'],['MEDIA','🟡 Media'],['BAJA','🟢 Baja']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setForm({...form, prioridad: v})}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition
                        ${form.prioridad === v ? 'border-orange-500 bg-orange-900/40 text-orange-300' : 'border-gray-600 text-slate-400 hover:border-gray-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Descripción del problema</label>
                <textarea value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})}
                  placeholder="Describe qué le pasó al equipo..." rows={3}
                  className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none text-sm"/>
              </div>
              {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                  {loading ? 'Reportando...' : '📋 Reportar'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal Cerrar Sesión ───────────────────────────────────────────────────────

function ModalCerrarSesion({ sesion, pcs, onClose, onCerrada }) {
  const [obs, setObs]         = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // ── Sección: PC con problema ───────────────────────────────────────────────
  const [reportarPC, setReportarPC]   = useState(false);
  const [pcReporte, setPcReporte]     = useState('');    // computadora_id
  const [notaPC, setNotaPC]           = useState('');
  const [bloquearPC, setBloquearPC]   = useState(false);

  // Solo PCs que no están ya en mantenimiento/baja
  const pcsDisponibles = (pcs || []).filter(
    p => !['MANTENIMIENTO','DAÑADO','BAJA'].includes(p.estado)
  );

  const handleCerrar = async () => {
    // Validar reporte de PC si está activo
    if (reportarPC && (!pcReporte || !notaPC.trim())) {
      setError('Selecciona la PC e ingresa una nota del problema.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // 1. Reportar PC si aplica (antes de cerrar para que la sesión aún exista)
      if (reportarPC && pcReporte && notaPC.trim()) {
        await api.post(`/sesiones/${sesion.id}/reportar-pc`, {
          computadora_id: parseInt(pcReporte),
          nota: notaPC.trim(),
          bloquear: bloquearPC,
        });
      }
      // 2. Cerrar la sesión
      await api.post(`/sesiones/${sesion.id}/cerrar`, { observacion_general: obs || null });
      onCerrada();
    } catch (err) {
      setError(formatApiError(err, 'Error al cerrar sesión'));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="p-5 border-b border-white/5 text-center">
          <div className="w-12 h-12 bg-orange-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/>
            </svg>
          </div>
          <h3 className="font-semibold text-white">¿Cerrar sesión?</h3>
          <p className="text-slate-400 text-sm mt-1">
            {sesion.materia} · {sesion.grupo}
          </p>
        </div>

        <div className="p-5 space-y-4">

          {/* Nota de cierre (opcional) */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nota de cierre (opcional)</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Ej: Clase completada sin incidentes."
              className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none text-sm"/>
          </div>

          {/* Separador */}
          <div className="border-t border-white/5"/>

          {/* Toggle: ¿PC con problema? */}
          <div>
            <button
              type="button"
              onClick={() => { setReportarPC(v => !v); setPcReporte(''); setNotaPC(''); setBloquearPC(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all
                ${reportarPC
                  ? 'border-amber-500 bg-amber-900/30 text-amber-200'
                  : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-white/5'}`}>
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="text-lg">🖥️</span>
                ¿Alguna PC quedó con problema?
              </span>
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
                ${reportarPC ? 'border-amber-400 bg-amber-400' : 'border-gray-500'}`}>
                {reportarPC && <span className="text-gray-900 text-xs font-bold">✓</span>}
              </span>
            </button>

            {reportarPC && (
              <div className="mt-3 space-y-3 pl-1">
                {/* Selector de PC */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">¿Cuál PC?</label>
                  <SelectDark
                    value={pcReporte}
                    onChange={setPcReporte}
                    placeholder="— Selecciona la PC —"
                    options={[
                      { value: '', label: '— Selecciona la PC —' },
                      ...pcsDisponibles.sort((a,b) => a.numero - b.numero).map(pc => ({
                        value: pc.pc_id,
                        label: `${pc.codigo}${pc.fila ? ` (Fila ${pc.fila})` : ''}${pc.alumno ? ` · ${pc.alumno.nombre.split(' ')[0]}` : ''}`,
                      })),
                    ]}
                  />
                </div>

                {/* Nota del problema */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">¿Qué pasó con esa PC?</label>
                  <textarea value={notaPC} onChange={e => setNotaPC(e.target.value)} rows={2}
                    placeholder="Ej: Se quedó instalando actualizaciones, no pude apagarla."
                    className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none text-sm"/>
                </div>

                {/* Bloquear PC */}
                <button
                  type="button"
                  onClick={() => setBloquearPC(v => !v)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all
                    ${bloquearPC
                      ? 'border-red-500 bg-red-900/30 text-red-200'
                      : 'border-gray-600 text-slate-400 hover:border-gray-500 hover:bg-white/4'}`}>
                  <span className="text-base">{bloquearPC ? '🔒' : '🔓'}</span>
                  <span className="flex-1 text-left">
                    <span className="font-medium block">
                      {bloquearPC ? 'PC bloqueada hasta que el admin la libere' : 'Bloquear PC temporalmente'}
                    </span>
                    <span className="text-xs opacity-70">
                      {bloquearPC
                        ? 'No se podrá asignar en la siguiente clase'
                        : 'Impide que se use hasta que el responsable la revise'}
                    </span>
                  </span>
                  <span className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                    ${bloquearPC ? 'border-red-400 bg-red-400' : 'border-gray-500'}`}>
                    {bloquearPC && <span className="text-gray-900 text-xs font-bold">✓</span>}
                  </span>
                </button>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} disabled={loading}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={handleCerrar} disabled={loading}
              className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {loading ? 'Cerrando...' : '⏹ Cerrar sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Observación (PC + Aula) ────────────────────────────────────────────

const CATEGORIAS_AULA = [
  { id: 'CANON',       icon: '🎥', label: 'Cañón / Proyector',  tipo: 'DAÑO',          prioridad: 'ALTA'  },
  { id: 'ILUMINACION', icon: '💡', label: 'Iluminación / AC',   tipo: 'MANTENIMIENTO', prioridad: 'MEDIA' },
  { id: 'MOBILIARIO',  icon: '🪑', label: 'Mobiliario dañado',  tipo: 'DAÑO',          prioridad: 'MEDIA' },
  { id: 'LIMPIEZA',    icon: '🧹', label: 'Limpieza del aula',  tipo: 'OTRO',          prioridad: 'BAJA'  },
  { id: 'SEGURIDAD',   icon: '🔒', label: 'Seguridad',          tipo: 'OTRO',          prioridad: 'ALTA'  },
  { id: 'OTRO',        icon: '📝', label: 'Otro',               tipo: 'OTRO',          prioridad: 'MEDIA' },
];

function ModalObservacion({ pc, sesionId, sesion, onClose }) {
  const [loading, setLoading]   = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError]       = useState('');

  // ── Modo AULA (sin PC) ───────────────────────────────────────────────────────
  const [categoriaId, setCategoriaId] = useState(null);
  const [aulaDesc, setAulaDesc]       = useState('');
  const [aulaPri, setAulaPri]         = useState('MEDIA');
  const categoriaSeleccionada = CATEGORIAS_AULA.find(c => c.id === categoriaId);

  const handleSelectCategoria = (cat) => {
    setCategoriaId(cat.id);
    setAulaPri(cat.prioridad);
  };

  const handleSubmitAula = async (e) => {
    e.preventDefault();
    if (!categoriaSeleccionada) return;
    setLoading(true);
    setError('');
    try {
      const descripcionFinal = aulaDesc.trim()
        ? `[${categoriaSeleccionada.label}] ${aulaDesc.trim()}`
        : `${categoriaSeleccionada.label} — reportado durante sesión ${sesion?.materia || ''}`;
      await api.post('/inventario/incidentes', {
        computadora_id: null,
        laboratorio_id: sesion?.laboratorio_id ?? null,
        origen:         'SESION',
        origen_id:      sesion?.id ?? null,
        tipo:           categoriaSeleccionada.tipo,
        prioridad:      aulaPri,
        descripcion:    descripcionFinal,
      });
      setGuardado(true);
      setTimeout(onClose, 1600);
    } catch (err) {
      setError(formatApiError(err, 'Error al reportar'));
    } finally {
      setLoading(false);
    }
  };

  // ── Modo PC (desde clic en una PC) ───────────────────────────────────────────
  const [pcForm, setPcForm] = useState({ tipo: 'FALLA_HARDWARE', descripcion: '', prioridad: 'MEDIA' });

  const handleSubmitPC = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post(`/sesiones/${sesionId}/observaciones`, {
        computadora_id: pc.pc_id,
        ...pcForm,
      });
      setGuardado(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(formatApiError(err, 'Error al guardar'));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">

        {guardado ? (
          <div className="text-center py-10 px-6">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-green-400 font-semibold text-base">
              {pc ? 'Observación registrada en la sesión' : 'Reporte enviado al responsable del laboratorio'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {pc ? 'Guardada en el historial de la sesión' : 'Aparecerá en el módulo de Mantenimiento'}
            </p>
          </div>

        ) : pc ? (
          /* ── Formulario PC específica ────────────────────────────── */
          <>
            <div className="px-5 pt-5 pb-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">⚠️ Observación — PC {pc.codigo}</h3>
                {pc.fila && <p className="text-xs text-slate-400 mt-0.5">Fila {pc.fila}</p>}
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmitPC} className="px-5 pb-5 pt-4 space-y-3">
              <SelectDark
                value={pcForm.tipo}
                onChange={v => setPcForm({...pcForm, tipo: v})}
                options={[
                  { value: 'FALLA_HARDWARE', label: '🔩 Falla de hardware' },
                  { value: 'FALLA_SOFTWARE', label: '💻 Falla de software' },
                  { value: 'LIMPIEZA',       label: '🧹 Requiere limpieza' },
                  { value: 'SIN_NOVEDAD',    label: '✅ Sin novedad' },
                  { value: 'OTRO',           label: '📌 Otro' },
                ]}
              />
              <SelectDark
                value={pcForm.prioridad}
                onChange={v => setPcForm({...pcForm, prioridad: v})}
                options={[
                  { value: 'BAJA',  label: '🟢 Prioridad baja' },
                  { value: 'MEDIA', label: '🟡 Prioridad media' },
                  { value: 'ALTA',  label: '🔴 Prioridad alta' },
                ]}
              />
              <textarea value={pcForm.descripcion} onChange={e => setPcForm({...pcForm, descripcion: e.target.value})}
                placeholder="Describe el problema observado..." rows={3}
                className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none text-sm"/>
              {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </>

        ) : (
          /* ── Formulario Aula / Instalaciones ─────────────────────── */
          <>
            <div className="px-5 pt-5 pb-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">⚠️ Reportar problema del aula</h3>
                <p className="text-xs text-slate-400 mt-0.5">El reporte llegará al responsable del laboratorio</p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmitAula} className="px-5 pb-5 pt-4 space-y-4">
              <div>
                <p className="text-xs text-slate-400 mb-2">¿Qué tipo de problema tienes?</p>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIAS_AULA.map(cat => (
                    <button key={cat.id} type="button"
                      onClick={() => handleSelectCategoria(cat)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-center
                        ${categoriaId === cat.id
                          ? 'border-yellow-500 bg-yellow-900/40 text-yellow-200'
                          : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-white/5'
                        }`}>
                      <span className="text-xl">{cat.icon}</span>
                      <span className="text-xs leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {categoriaSeleccionada && (
                <>
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Prioridad</p>
                    <div className="flex gap-2">
                      {[['ALTA','🔴 Alta'],['MEDIA','🟡 Media'],['BAJA','🟢 Baja']].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setAulaPri(v)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-medium transition
                            ${aulaPri === v
                              ? 'border-yellow-500 bg-yellow-900/40 text-yellow-300'
                              : 'border-gray-600 text-slate-400 hover:border-gray-500'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Descripción (opcional)</label>
                    <textarea value={aulaDesc} onChange={e => setAulaDesc(e.target.value)}
                      placeholder={`Detalles sobre ${categoriaSeleccionada.label.toLowerCase()}...`}
                      rows={2}
                      className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none text-sm"/>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading || !categoriaSeleccionada}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:text-slate-400 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                  {loading ? 'Enviando...' : '📋 Enviar reporte'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}


// ─── Temporizador ─────────────────────────────────────────────────────────────

function Temporizador({ segundos }) {
  if (segundos === null) return null;

  const abs     = Math.abs(segundos);
  const horas   = Math.floor(abs / 3600);
  const minutos = Math.floor((abs % 3600) / 60);
  const segs    = abs % 60;
  const fmt     = horas > 0
    ? `${horas}h ${String(minutos).padStart(2,'0')}m`
    : `${String(minutos).padStart(2,'0')}:${String(segs).padStart(2,'0')}`;

  const enOvertime   = segundos < 0;
  const avisoPrevio  = segundos >= 0 && segundos <= 600; // últimos 10 min

  if (enOvertime) return (
    <div className="flex items-center gap-2 bg-red-900/60 border border-red-600 rounded-lg px-3 py-1.5 animate-pulse">
      <span className="text-red-300 text-xs font-bold uppercase tracking-wide">Tiempo excedido</span>
      <span className="text-red-200 font-mono font-bold text-sm">+{fmt}</span>
    </div>
  );

  if (avisoPrevio) return (
    <div className="flex items-center gap-2 bg-amber-900/50 border border-amber-600 rounded-lg px-3 py-1.5">
      <span className="text-amber-300 text-xs font-medium">Tiempo restante</span>
      <span className="text-amber-200 font-mono font-bold text-sm">{fmt}</span>
    </div>
  );

  return (
    <div className="flex items-center gap-2 bg-gray-700/60 border border-gray-600 rounded-lg px-3 py-1.5">
      <span className="text-slate-400 text-xs">Tiempo</span>
      <span className="text-gray-200 font-mono font-bold text-sm">{fmt}</span>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function SesionActiva() {
  const { sesionId } = useParams();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { usuario }  = useAuth();

  const [sesion, setSesion]         = useState(null);
  const [pcs, setPcs]               = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [modalAsignar, setModalAsignar]   = useState(null);  // pc seleccionada
  const [modalOcupada, setModalOcupada]   = useState(null);
  const [modalCerrar, setModalCerrar]     = useState(false);
  const [modalObs, setModalObs]           = useState(null);
  const [modalDano, setModalDano]         = useState(null);
  const [wsConectado, setWsConectado]     = useState(false);
  const [modoPolling, setModoPolling]     = useState(false);
  const [countdown, setCountdown]         = useState(null); // segundos restantes (negativo = overtime)
  const wsRef        = useRef(null);
  const pollRef      = useRef(null);
  const wsTimerRef   = useRef(null);
  const countdownRef = useRef(null);

  // ── Polling HTTP fallback ──────────────────────────────────────────────────
  const cargarMapa = useCallback(async () => {
    try {
      const { data } = await api.get(`/sesiones/${sesionId}/mapa`);
      setPcs(data.pcs || []);
    } catch { /* silencioso */ }
  }, [sesionId]);

  const iniciarPolling = useCallback(() => {
    if (pollRef.current) return;
    setModoPolling(true);
    cargarMapa(); // carga inmediata
    pollRef.current = setInterval(cargarMapa, 3000);
  }, [cargarMapa]);

  const detenerPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setModoPolling(false);
  }, []);

  // Cargar datos iniciales
  const cargarSesion = useCallback(async () => {
    try {
      const { data } = await api.get(`/sesiones/${sesionId}`);
      setSesion(data);
    } catch {
      if (usuario?.rol === 'DOCENTE') navigate('/docente');
      else navigate('/admin/laboratorios');
    }
  }, [sesionId, navigate, usuario]);

  useEffect(() => { cargarSesion(); }, [cargarSesion]);

  // ── Temporizador countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sesion?.fin_estimado) return;
    const finEstimado = new Date(sesion.fin_estimado + 'Z'); // UTC

    const tick = () => {
      const diff = Math.floor((finEstimado - Date.now()) / 1000);
      setCountdown(diff);
    };
    tick(); // inmediato
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current);
  }, [sesion?.fin_estimado]);

  // Conectar WebSocket (con fallback a polling si falla en 5s)
  useEffect(() => {
    if (!sesion) return;
    const token = localStorage.getItem('token');
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsBase  = process.env.REACT_APP_WS_URL || `${wsProto}://${window.location.hostname}:8000`;
    const wsUrl = `${wsBase}/ws/mapa/${sesion.laboratorio_id}?token=${token}`;

    // Timer: si en 5 segundos no conecta, activar polling
    wsTimerRef.current = setTimeout(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        iniciarPolling();
      }
    }, 5000);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      clearTimeout(wsTimerRef.current);
      detenerPolling();
      setWsConectado(true);
    };
    ws.onclose = () => {
      setWsConectado(false);
      iniciarPolling(); // fallback al cerrar
    };
    ws.onerror = () => {
      setWsConectado(false);
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.tipo === 'estado_inicial') {
        setPcs(msg.pcs);
      } else if (msg.tipo === 'pc_actualizada') {
        setPcs(prev => prev.map(p => p.pc_id === msg.pc.pc_id ? { ...p, ...msg.pc } : p));
      } else if (msg.tipo === 'sesion_cerrada') {
        if (usuario?.rol === 'DOCENTE') navigate('/docente');
        else navigate('/admin/laboratorios');
      } else if (msg.tipo === 'ping') {
        ws.send('ping');
      }
    };

    // Ping periódico
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 25000);

    return () => {
      clearTimeout(wsTimerRef.current);
      clearInterval(pingInterval);
      detenerPolling();
      ws.close();
    };
  }, [sesion, navigate, iniciarPolling, detenerPolling]);

  // Filtrar PCs por búsqueda
  const pcsFiltradas = busqueda
    ? pcs.filter(pc =>
        pc.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
        (pc.alumno?.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (pc.alumno?.matricula || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (pc.fila || '').toLowerCase().includes(busqueda.toLowerCase())
      )
    : pcs;

  // Agrupar por fila
  const filas = {};
  pcsFiltradas.forEach(pc => {
    const fila = pc.fila || '—';
    if (!filas[fila]) filas[fila] = [];
    filas[fila].push(pc);
  });
  const filasOrdenadas = Object.keys(filas).sort();

  const pcsOcupadas = pcs.filter(p => p.estado === 'OCUPADA').length;
  const pcsLibres   = pcs.filter(p => p.estado === 'EN_CLASE' || p.estado === 'OPERATIVO').length;

  const handlePcClick = (pc) => {
    // PCs bloqueadas por mantenimiento/daño no son interactuables
    if (pc.bloqueada || pc.estado === 'MANTENIMIENTO' || pc.estado === 'DAÑADO' || pc.estado === 'BAJA') {
      return;
    }
    if (pc.estado === 'OCUPADA') {
      setModalOcupada(pc);
    } else if (pc.estado === 'EN_CLASE' || pc.estado === 'OPERATIVO') {
      setModalAsignar(pc);
    }
  };

  const handleSesionCerrada = () => {
    if (usuario?.rol === 'DOCENTE') navigate('/docente');
    else navigate('/admin/laboratorios');
  };

  if (!sesion) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white flex flex-col">
      {/* Topbar sesión */}
      <header className="glass-sm border-b border-white/5 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {/* Indicador WS / Polling */}
          <span className="relative flex h-2.5 w-2.5">
            {wsConectado
              ? <><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span></>
              : modoPolling
              ? <><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span></>
              : <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-500"></span>
            }
          </span>
          <div>
            <p className="font-semibold text-sm text-white leading-tight">{sesion.materia}</p>
            <p className="text-xs text-slate-400">{sesion.grupo} · {sesion.laboratorio_nombre}</p>
          </div>
        </div>

        {/* Stats rápidos + Temporizador */}
        <div className="hidden sm:flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-red-300 font-medium">{pcsOcupadas}</span>
            <span className="text-slate-400">ocupadas</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-green-300 font-medium">{pcsLibres}</span>
            <span className="text-slate-400">libres</span>
          </span>
          <Temporizador segundos={countdown} />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`${location.pathname}/asistencia`)}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors">
            📋 Asistencia
          </button>
          <button onClick={() => setModalObs({})}
            className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-xs font-medium transition-colors">
            ⚠️ Observación
          </button>
          <button onClick={() => setModalCerrar(true)}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-colors">
            ⏹ Cerrar
          </button>
        </div>
      </header>

      {/* Buscador */}
      <div className="px-4 py-3 bg-gray-850 border-b border-white/5/50">
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar PC, alumno, matrícula, fila..."
            className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg pl-9 pr-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-green-500"/>
        </div>
      </div>

      {/* Banner overtime (visible en móvil donde el topbar no muestra el timer) */}
      {countdown !== null && countdown < 0 && (
        <div className="bg-red-900/70 border-b border-red-700 px-4 py-2 flex items-center justify-between text-sm sm:hidden">
          <span className="text-red-300 font-semibold animate-pulse">
            ⚠️ Tu tiempo reservado terminó hace {Math.floor(Math.abs(countdown)/60)} min
          </span>
          <button onClick={() => setModalCerrar(true)}
            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg text-xs font-bold">
            Cerrar ahora
          </button>
        </div>
      )}

      {/* Mapa de PCs */}
      <div className="flex-1 overflow-auto p-4">
        {pcs.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
            {wsConectado || modoPolling ? 'Sin computadoras registradas en este laboratorio' : 'Conectando al servidor...'}
          </div>
        ) : filasOrdenadas.length > 0 ? (
          <div className="space-y-6">
            {filasOrdenadas.map(fila => (
              <div key={fila}>
                {fila !== '—' && (
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">
                    Fila {fila}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {filas[fila].sort((a,b) => a.numero - b.numero).map(pc => {
                    const estilo = PC_ESTILOS[pc.estado] || PC_ESTILOS.OPERATIVO;
                    const clickable = ['OCUPADA','EN_CLASE','OPERATIVO'].includes(pc.estado) && !pc.bloqueada;
                    return (
                      <button
                        key={pc.pc_id}
                        onClick={() => clickable && handlePcClick(pc)}
                        disabled={!clickable}
                        className={`rounded-xl border p-3 text-center transition-all min-w-[80px]
                          ${estilo.bg} ${clickable ? 'hover:scale-105 hover:shadow-lg cursor-pointer' : 'cursor-default'}
                          ${busqueda && (pc.alumno?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
                            pc.alumno?.matricula?.includes(busqueda))
                            ? 'ring-2 ring-blue-400' : ''}`}
                        title={pc.alumno ? `${pc.alumno.nombre}\n${pc.alumno.matricula}` : pc.estado}
                      >
                        <p className={`text-xs font-bold ${estilo.texto}`}>{pc.codigo}</p>
                        {pc.alumno ? (
                          <p className="text-xs text-white/80 mt-0.5 leading-tight truncate max-w-[70px]">
                            {pc.alumno.nombre.split(' ')[0]}
                          </p>
                        ) : (
                          <p className={`text-xs mt-0.5 ${estilo.texto} opacity-70`}>{estilo.label}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Sin filas definidas — grid plano */
          <div className="flex flex-wrap gap-2">
            {pcsFiltradas.sort((a,b) => a.numero - b.numero).map(pc => {
              const estilo = PC_ESTILOS[pc.estado] || PC_ESTILOS.OPERATIVO;
              const clickable = ['OCUPADA','EN_CLASE','OPERATIVO'].includes(pc.estado) && !pc.bloqueada;
              return (
                <button key={pc.pc_id}
                  onClick={() => clickable && handlePcClick(pc)}
                  disabled={!clickable}
                  className={`rounded-xl border p-3 text-center transition-all min-w-[72px]
                    ${estilo.bg} ${clickable ? 'hover:scale-105 cursor-pointer' : 'cursor-default'}`}>
                  <p className={`text-xs font-bold ${estilo.texto}`}>{pc.codigo}</p>
                  {pc.alumno
                    ? <p className="text-xs text-white/80 mt-0.5 truncate max-w-[64px]">{pc.alumno.nombre.split(' ')[0]}</p>
                    : <p className={`text-xs mt-0.5 ${estilo.texto} opacity-70`}>{estilo.label}</p>
                  }
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Leyenda inferior */}
      <footer className="glass-sm border-t border-white/5 px-4 py-2 flex items-center gap-4 text-xs text-slate-400 shrink-0">
        {[
          { color:'bg-red-500',    label: `${pcsOcupadas} Ocupadas` },
          { color:'bg-green-600',  label: `${pcsLibres} Libres` },
          { color:'bg-yellow-600', label: 'Mantenimiento' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${l.color}`}></span>{l.label}
          </span>
        ))}
        <span className="ml-auto">{sesion.codigo_sesion}</span>
      </footer>

      {/* Modales */}
      {modalAsignar && (
        <ModalAsignar pc={modalAsignar} sesionId={sesionId}
          onClose={() => setModalAsignar(null)}
          onAsignada={() => setModalAsignar(null)}
        />
      )}
      {modalOcupada && (
        <ModalPCOcupada pc={modalOcupada} sesionId={sesionId}
          onClose={() => setModalOcupada(null)}
          onLiberada={() => setModalOcupada(null)}
          onObservacion={(pc) => { setModalOcupada(null); setModalObs(pc); }}
          onReportarDano={(pc) => { setModalOcupada(null); setModalDano(pc); }}
        />
      )}
      {modalCerrar && (
        <ModalCerrarSesion sesion={sesion} pcs={pcs}
          onClose={() => setModalCerrar(false)}
          onCerrada={handleSesionCerrada}
        />
      )}
      {modalObs !== null && (
        <ModalObservacion
          pc={modalObs && Object.keys(modalObs).length > 0 ? modalObs : null}
          sesionId={sesionId}
          sesion={sesion}
          onClose={() => setModalObs(null)}
        />
      )}
      {modalDano && (
        <ModalReportarDano pc={modalDano} sesion={sesion}
          onClose={() => setModalDano(null)}
        />
      )}
    </div>
  );
}
