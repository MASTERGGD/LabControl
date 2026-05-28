import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import AdminLayout from '../../components/AdminLayout';
import CuatrimestreSelect, { getCuatrimestreActual } from '../../components/CuatrimestreSelect';
import TimeGrid from '../../components/TimeGrid';
import SelectDark from '../../components/SelectDark';
import api from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const HORAS = [
  '07:00','08:00','09:00','09:45',
  '10:00','10:15','11:00','12:00',
  '13:00','14:00','15:00','16:00',
  '17:00','18:00','19:00','20:00',
];

const ESTADOS_CUMPLIMIENTO = [
  { value: 'IMPARTIDA', label: 'Impartida', color: '#86efac' },
  { value: 'NO_ASISTIO', label: 'No asistió', color: '#fca5a5' },
  { value: 'CANCELADA_TARDIA', label: 'Cancelada tarde', color: '#fdba74' },
];

// Períodos oficiales UTECAN (para mostrar en el modal)
const PERIODOS_UTECAN = [
  { n: 1, inicio: '08:00', fin: '09:00' },
  { n: 2, inicio: '09:00', fin: '09:45' },
  { n: 3, inicio: '10:15', fin: '11:00', receso: true },
  { n: 4, inicio: '11:00', fin: '12:00' },
  { n: 5, inicio: '12:00', fin: '13:00' },
  { n: 6, inicio: '13:00', fin: '14:00' },
  { n: 7, inicio: '14:00', fin: '15:00' },
  { n: 8, inicio: '15:00', fin: '16:00' },
];

// ─── Modal horario individual ──────────────────────────────────────────────────

function ModalHorario({ labId, cuatrimestre, slot, onClose, onSave, preselect }) {
  const esEdicion = !!slot;
  const [form, setForm] = useState({
    laboratorio_id: labId,
    cuatrimestre:   cuatrimestre,
    dia_semana:     slot?.dia_semana ?? preselect?.dia_semana ?? 0,
    hora_inicio:    slot?.hora_inicio ?? preselect?.hora_inicio ?? '08:00',
    hora_fin:       slot?.hora_fin    ?? preselect?.hora_fin    ?? '09:00',
    activo:         slot?.activo      ?? true,
  });
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      await api.delete(`/horarios/${slot.id}`);
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo eliminar');
      setEliminando(false);
      setConfirmarEliminar(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.name === 'dia_semana' ? Number(e.target.value)
              : e.target.name === 'activo' ? e.target.checked
              : e.target.value;
    setForm({ ...form, [e.target.name]: val });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.hora_fin <= form.hora_inicio) {
      setError('La hora de fin debe ser posterior a la de inicio');
      return;
    }
    setLoading(true);
    try {
      if (esEdicion) {
        await api.put(`/horarios/${slot.id}`, {
          dia_semana: form.dia_semana,
          hora_inicio: form.hora_inicio,
          hora_fin: form.hora_fin,
          activo: form.activo,
        });
      } else {
        await api.post('/horarios', form);
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
          <h3 className="font-semibold text-white">{esEdicion ? 'Editar horario' : 'Nuevo horario'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Día de la semana</label>
            <SelectDark
              value={form.dia_semana}
              onChange={v => handleChange({ target: { name: 'dia_semana', value: Number(v) } })}
              options={DIAS.map((d, i) => ({ value: i, label: d }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Hora inicio</label>
              <SelectDark
                value={form.hora_inicio}
                onChange={v => handleChange({ target: { name: 'hora_inicio', value: v } })}
                options={HORAS.map(h => ({ value: h, label: h }))}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Hora fin</label>
              <SelectDark
                value={form.hora_fin}
                onChange={v => handleChange({ target: { name: 'hora_fin', value: v } })}
                options={HORAS.filter(h => h > form.hora_inicio).map(h => ({ value: h, label: h }))}
              />
            </div>
          </div>
          {esEdicion && (
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange}
                className="w-4 h-4 rounded accent-blue-600"/>
              Horario activo
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
              {loading ? 'Guardando...' : (esEdicion ? 'Actualizar' : 'Crear')}
            </button>
          </div>
          {/* Eliminar slot (solo si está libre y en edición) */}
          {esEdicion && !slot.reservado && (
            <div className="border-t border-white/5 pt-3 mt-1">
              {!confirmarEliminar ? (
                <button type="button" onClick={() => setConfirmarEliminar(true)}
                  className="w-full text-red-400 hover:text-red-300 text-sm py-2 rounded-lg hover:bg-red-900/20 transition-colors border border-transparent hover:border-red-800">
                  🗑 Eliminar este turno
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 text-center">¿Confirmar eliminación del turno?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmarEliminar(false)}
                      className="flex-1 bg-gray-700 text-gray-300 rounded-lg py-2 text-sm">
                      No, cancelar
                    </button>
                    <button type="button" onClick={handleEliminar} disabled={eliminando}
                      className="flex-1 bg-red-700 hover:bg-red-600 text-white rounded-lg py-2 text-sm font-semibold">
                      {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Modal carga masiva de slots ───────────────────────────────────────────────

function ModalBulk({ labId, cuatrimestre, onClose, onSave }) {
  const [dias, setDias]           = useState([0, 1, 2, 3, 4]);
  const [horaInicio, setHoraInicio] = useState('07:00');
  const [horaFin, setHoraFin]       = useState('09:00');
  const [loading, setLoading]     = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError]         = useState('');

  const toggleDia = (d) => setDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (dias.length === 0) { setError('Selecciona al menos un día'); return; }
    if (horaFin <= horaInicio) { setError('La hora de fin debe ser posterior a la de inicio'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/horarios/bulk', {
        laboratorio_id: labId,
        cuatrimestre,
        dias,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
      });
      setResultado(data);
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error en carga masiva');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">Carga masiva de horarios</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        {!resultado ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Días de la semana</label>
              <div className="flex gap-2 flex-wrap">
                {DIAS.map((d, i) => (
                  <button key={i} type="button" onClick={() => toggleDia(i)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                      ${dias.includes(i)
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-slate-400 hover:text-white'}`}>
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Hora inicio</label>
                <SelectDark
                  value={horaInicio}
                  onChange={setHoraInicio}
                  options={HORAS.map(h => ({ value: h, label: h }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Hora fin</label>
                <SelectDark
                  value={horaFin}
                  onChange={setHoraFin}
                  options={HORAS.filter(h => h > horaInicio).map(h => ({ value: h, label: h }))}
                />
              </div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-sm text-slate-400">
              Creará <strong className="text-white">{dias.length}</strong> turno(s) de{' '}
              <strong className="text-white">{horaInicio} – {horaFin}</strong> para{' '}
              {dias.map(d => DIAS[d].slice(0, 3)).join(', ')}
            </div>
            {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                {loading ? 'Creando...' : `Crear ${dias.length} turno(s)`}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-green-900/40 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold">{resultado.creados} turno(s) creado(s)</p>
              {resultado.omitidos > 0 && <p className="text-yellow-400 text-sm mt-1">{resultado.omitidos} omitidos (ya existían)</p>}
            </div>
            <button onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal: Cargar períodos UTECAN ────────────────────────────────────────────

function ModalPeriodosUtecan({ labId, cuatrimestre, onClose, onSave }) {
  const [dias, setDias]       = useState([0, 1, 2, 3, 4]);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError]     = useState('');

  const toggleDia = (d) => setDias(prev =>
    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
  );

  const handleCargar = async () => {
    if (dias.length === 0) { setError('Selecciona al menos un día'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/horarios/periodos-utecan', {
        laboratorio_id: labId,
        cuatrimestre,
        dias,
      });
      setResultado(data);
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cargar períodos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Cargar períodos UTECAN</h3>
            <p className="text-xs text-slate-400 mt-0.5">Crea los 8 períodos académicos estándar de una sola vez</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {!resultado ? (
          <div className="p-6 space-y-5">
            {/* Preview de períodos */}
            <div>
              <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wide">Períodos que se crearán</p>
              <div className="bg-slate-950/60 rounded-xl border border-gray-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Período</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Inicio</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Fin</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Duración</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODOS_UTECAN.map((p, i) => (
                      <React.Fragment key={p.n}>
                        {p.receso && (
                          <tr className="bg-amber-900/20">
                            <td colSpan={4} className="px-3 py-1.5 text-amber-500 text-xs italic">
                              ☕ Receso 9:45 – 10:15
                            </td>
                          </tr>
                        )}
                        <tr className={i % 2 === 0 ? '' : 'bg-gray-800/40'}>
                          <td className="px-3 py-2 text-white font-medium">P{p.n}</td>
                          <td className="px-3 py-2 text-gray-300">{p.inicio}</td>
                          <td className="px-3 py-2 text-gray-300">{p.fin}</td>
                          <td className="px-3 py-2 text-slate-400">
                            {(() => {
                              const [h1, m1] = p.inicio.split(':').map(Number);
                              const [h2, m2] = p.fin.split(':').map(Number);
                              const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
                              return `${mins} min`;
                            })()}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selección de días */}
            <div>
              <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wide">¿Qué días aplicar?</p>
              <div className="flex gap-2 flex-wrap">
                {DIAS.map((d, i) => (
                  <button key={i} type="button" onClick={() => toggleDia(i)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                      ${dias.includes(i)
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-slate-400 hover:text-white'}`}>
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg px-4 py-3 text-xs text-blue-300">
              Se crearán hasta <strong>{8 * dias.length}</strong> turnos para <strong>{cuatrimestre}</strong>.
              Los que ya existan se omitirán automáticamente.
            </div>

            {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={handleCargar} disabled={loading || dias.length === 0}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                {loading ? 'Creando períodos…' : `✓ Cargar ${8 * dias.length} turnos`}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-green-900/40 rounded-full flex items-center justify-center mx-auto text-3xl">
              ✅
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{resultado.creados} períodos creados</p>
              {resultado.omitidos > 0 && (
                <p className="text-yellow-400 text-sm mt-1">{resultado.omitidos} ya existían (omitidos)</p>
              )}
            </div>
            <button onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Página principal ──────────────────────────────────────────────────────────

// ─── Motivos predefinidos de bloqueo ──────────────────────────────────────────
const MOTIVOS_BLOQUEO = [
  { icon: '🎓', label: 'Reunión de academia' },
  { icon: '🔧', label: 'Mantenimiento del laboratorio' },
  { icon: '📅', label: 'Evento institucional' },
  { icon: '🏫', label: 'Actividad escolar' },
  { icon: '🚫', label: 'Día no hábil' },
  { icon: '📝', label: 'Otro' },
];

// ─── Modal Bloquear Slot ───────────────────────────────────────────────────────

function ModalBloquear({ slot, onClose, onBloqueado }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [motivoId, setMotivoId]       = useState(null);
  const [motivoCustom, setMotivoCustom] = useState('');
  const [cancelarRes, setCancelarRes] = useState(true);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const motivoSeleccionado = motivoId !== null ? MOTIVOS_BLOQUEO[motivoId] : null;
  const motivoFinal = motivoSeleccionado
    ? (motivoId === MOTIVOS_BLOQUEO.length - 1 && motivoCustom.trim()
        ? motivoCustom.trim()
        : motivoSeleccionado.label)
    : '';

  const handleBloquear = async () => {
    if (!motivoFinal) { setError('Selecciona o describe el motivo del bloqueo'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post(`/horarios/${slot.id}/bloquear`, {
        motivo: motivoFinal,
        cancelar_reservacion: cancelarRes,
      });
      onBloqueado();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al bloquear');
      setLoading(false);
    }
  };

  const DIAS_NOMBRE = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-sm shadow-2xl rounded-2xl overflow-hidden ${isDay ? 'bg-white border border-slate-200' : 'glass'}`}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${isDay ? '#e2e8f0' : 'rgba(255,255,255,0.05)'}` }}>
          <div>
            <h3 className={`font-semibold ${isDay ? 'text-slate-950' : 'text-white'}`}>🔒 Bloquear turno institucional</h3>
            <p className={`text-xs mt-0.5 ${isDay ? 'text-slate-600' : 'text-slate-400'}`}>
              {DIAS_NOMBRE[slot.dia_semana]} · {slot.hora_inicio}–{slot.hora_fin}
            </p>
          </div>
          <button onClick={onClose} className={isDay ? 'text-slate-500 hover:text-slate-950' : 'text-slate-400 hover:text-white'}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Motivo */}
          <div>
            <p className={`text-xs mb-2 ${isDay ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>¿Motivo del bloqueo?</p>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS_BLOQUEO.map((m, i) => (
                <button key={i} type="button" onClick={() => { setMotivoId(i); setMotivoCustom(''); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-all
                    ${motivoId === i
                      ? isDay
                        ? 'border-purple-500 bg-purple-50 text-purple-950 shadow-sm'
                        : 'border-purple-500 bg-purple-900/40 text-purple-200'
                      : isDay
                        ? 'border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white'
                        : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-white/5'}`}>
                  <span>{m.icon}</span>
                  <span className="leading-tight text-xs">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Campo libre si eligió "Otro" */}
          {motivoId === MOTIVOS_BLOQUEO.length - 1 && (
            <div>
              <label className={`block text-xs mb-1 ${isDay ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>Describe el motivo</label>
              <input value={motivoCustom} onChange={e => setMotivoCustom(e.target.value)}
                placeholder="Ej: Visita de supervisión..."
                className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${isDay ? 'bg-white border-slate-300 text-slate-950 placeholder:text-slate-400' : 'input-dark text-white'}`}/>
            </div>
          )}

          {/* Cancelar reservación existente */}
          {slot.reservado && (
            <button type="button" onClick={() => setCancelarRes(v => !v)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all
                ${cancelarRes
                  ? isDay ? 'border-red-300 bg-red-50 text-red-900' : 'border-red-500 bg-red-900/30 text-red-200'
                  : isDay ? 'border-slate-300 text-slate-600 hover:border-slate-400' : 'border-gray-600 text-slate-400 hover:border-gray-500'}`}>
              <span className="text-base">{cancelarRes ? '❌' : '⬜'}</span>
              <span className="flex-1 text-left">
                <span className="font-medium block">Cancelar la reservación existente</span>
                <span className="text-xs opacity-70">
                  {cancelarRes ? 'La reservación del docente será cancelada' : 'La reservación se mantiene (solo bloquea nuevas)'}
                </span>
              </span>
            </button>
          )}

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${isDay ? 'bg-slate-100 hover:bg-slate-200 text-slate-900' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
              Cancelar
            </button>
            <button onClick={handleBloquear} disabled={loading || !motivoFinal}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                loading || !motivoFinal
                  ? isDay ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-gray-600 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}>
              {loading ? 'Bloqueando...' : '🔒 Bloquear turno'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer detalle de reservación (panel lateral) ───────────────────────────
function DrawerDetalleReservacion({ slot, onClose, onCancelada, esSuperAdmin, onBloquear }) {
  const r = slot.reservacion;
  const [cancelando, setCancelando]       = useState(false);
  const [confirmar, setConfirmar]         = useState(false);
  const [error, setError]                 = useState('');
  const [estadoCumplimiento, setEstadoCumplimiento] = useState('IMPARTIDA');
  const [motivoCumplimiento, setMotivoCumplimiento] = useState('');
  const [marcando, setMarcando]           = useState(false);
  // Resolver requerimiento
  const [req, setReq]                     = useState(r?.requerimiento ?? null);
  const [resolviendoReq, setResolviendoReq] = useState(false);
  const [notaAdmin, setNotaAdmin]         = useState('');
  const [mostrarNotaReq, setMostrarNotaReq] = useState(false);
  const DIAS_NOMBRE = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

  const handleCancelar = async () => {
    setCancelando(true); setError('');
    try {
      await api.delete(`/horarios/reservaciones/${r.id}`);
      onCancelada();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cancelar');
      setCancelando(false); setConfirmar(false);
    }
  };

  const handleResolverReq = async (estado) => {
    if (!req) return;
    setResolviendoReq(true);
    try {
      const { data } = await api.put(`/horarios/requerimientos/${req.id}/resolver`, {
        estado,
        nota_admin: notaAdmin.trim() || undefined,
      });
      setReq(data);
      setMostrarNotaReq(false);
      setNotaAdmin('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al resolver requerimiento');
    } finally { setResolviendoReq(false); }
  };

  const handleMarcarEstado = async () => {
    setMarcando(true); setError('');
    try {
      await api.post(`/horarios/reservaciones/${r.id}/marcar-estado`, {
        estado: estadoCumplimiento,
        motivo: motivoCumplimiento.trim() || undefined,
      });
      onCancelada();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al marcar estado');
    } finally {
      setMarcando(false);
    }
  };

  // Badge de estado con rayas para EN_DISPUTA
  const estadoBadge = r?.estado === 'PROGRAMADA'
    ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">● Programada</span>
    : r?.estado === 'EN_DISPUTA'
    ? <span className="slot-disputa text-[11px] font-semibold px-2 py-0.5 rounded-full text-amber-400">⚡ En disputa</span>
    : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">{r?.estado}</span>;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full w-full max-w-sm z-50 overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg,#0d1b2e,#0f172a)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
          animation: 'slideInRight .25s ease',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 py-4 flex items-center gap-3"
             style={{ background:'rgba(13,27,46,0.95)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">Turno reservado</p>
            <p className="text-xs text-slate-500">{DIAS_NOMBRE[slot.dia_semana]} · {slot.hora_inicio}–{slot.hora_fin}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Info reservación */}
          <div className="glass-sm rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Estado</span>
              {estadoBadge}
            </div>
            {r && (
              <>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Materia</p>
                  <p className="text-white font-bold">{r.materia}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Grupo</p>
                    <p className="text-slate-200 text-sm">{r.grupo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Docente</p>
                    <p className="text-slate-200 text-sm">{r.docente_nombre}</p>
                  </div>
                </div>
                {r.cuatrimestre && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Cuatrimestre</p>
                    <p className="text-slate-400 text-xs">{r.cuatrimestre}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Requerimientos del docente (panel admin) ── */}
          {r?.estado !== 'IMPARTIDA' && (
            <div className="rounded-xl p-4 space-y-3" style={{ background:'rgba(15,23,42,0.65)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Cumplimiento docente</p>
                  <p className="text-xs text-slate-500 mt-0.5">Registra el resultado de este turno</p>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 text-slate-400">{r?.estado}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ESTADOS_CUMPLIMIENTO.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEstadoCumplimiento(opt.value)}
                    className="py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      color: estadoCumplimiento === opt.value ? '#020617' : opt.color,
                      background: estadoCumplimiento === opt.value ? opt.color : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${estadoCumplimiento === opt.value ? opt.color : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={motivoCumplimiento}
                onChange={e => setMotivoCumplimiento(e.target.value)}
                placeholder="Nota opcional"
                className="input-dark w-full text-sm resize-none"
              />
              <button
                type="button"
                onClick={handleMarcarEstado}
                disabled={marcando}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background:'linear-gradient(135deg,#2563eb,#4f46e5)', color:'#fff' }}>
                {marcando ? 'Guardando...' : 'Marcar estado'}
              </button>
            </div>
          )}

          {req && (() => {
            const items = Array.isArray(req.items) ? req.items : [];
            const ESTADO_STYLE = {
              PENDIENTE:      { bg:'rgba(234,179,8,0.08)',  border:'rgba(234,179,8,0.28)',  text:'#fde68a', label:'⏳ Pendiente' },
              CONFIRMADO:     { bg:'rgba(34,197,94,0.08)',  border:'rgba(34,197,94,0.28)',  text:'#86efac', label:'✅ Confirmado' },
              RECHAZADO:      { bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.28)',  text:'#fca5a5', label:'❌ Rechazado' },
              DOCENTE_PROVEE: { bg:'rgba(99,102,241,0.10)', border:'rgba(99,102,241,0.32)', text:'#c4b5fd', label:'💾 Docente provee' },
            };
            const st = ESTADO_STYLE[req.estado] || ESTADO_STYLE.PENDIENTE;
            return (
              <div className="rounded-xl p-4 space-y-3" style={{ background: st.bg, border: `1px solid ${st.border}` }}>
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: st.text }}>
                    <span>📋</span> Requerimientos del docente
                  </p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
                    {st.label}
                  </span>
                </div>

                {/* Items */}
                {items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {items.map(item => (
                      <span key={item} className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background:'rgba(234,179,8,0.12)', color:'#fde68a', border:'1px solid rgba(234,179,8,0.25)' }}>
                        {item}
                      </span>
                    ))}
                  </div>
                )}
                {req.descripcion && <p className="text-xs text-slate-300 italic leading-relaxed">"{req.descripcion}"</p>}

                {/* Tiene instalador */}
                {req.tiene_instalador && (
                  <p className="text-xs text-indigo-300 flex items-center gap-1.5">
                    <span>💾</span> El docente <strong>tiene el instalador</strong> y puede compartirlo
                  </p>
                )}

                {/* Urgente */}
                {req.urgente && (
                  <p className="text-xs text-red-400 font-bold flex items-center gap-1.5">
                    <span>🔴</span> URGENTE — clase en menos de 3 días hábiles
                  </p>
                )}

                {/* Nota del admin anterior */}
                {req.nota_admin && (
                  <div className="bg-white/5 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-400">Tu nota:</p>
                    <p className="text-xs text-slate-200 italic mt-0.5">"{req.nota_admin}"</p>
                  </div>
                )}

                {/* Botones de acción — solo si no está resuelto */}
                {req.estado === 'PENDIENTE' && (
                  <div className="space-y-2 pt-1">
                    {/* Campo de nota opcional */}
                    {mostrarNotaReq ? (
                      <textarea
                        rows={2}
                        placeholder="Nota para el docente (opcional)…"
                        value={notaAdmin}
                        onChange={e => setNotaAdmin(e.target.value)}
                        className="w-full text-xs rounded-lg px-3 py-2 resize-none focus:outline-none"
                        style={{ background:'rgba(15,23,42,0.7)', border:'1px solid rgba(255,255,255,0.1)', color:'#e2e8f0' }}
                      />
                    ) : (
                      <button onClick={() => setMostrarNotaReq(true)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
                        <span>✏️</span> Agregar nota para el docente
                      </button>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleResolverReq('CONFIRMADO')}
                        disabled={resolviendoReq}
                        className="py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                        style={{ background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.35)', color:'#86efac' }}>
                        ✅ Confirmar
                      </button>
                      <button
                        onClick={() => handleResolverReq('DOCENTE_PROVEE')}
                        disabled={resolviendoReq}
                        className="py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                        style={{ background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.32)', color:'#c4b5fd' }}>
                        💾 Docente provee
                      </button>
                      <button
                        onClick={() => handleResolverReq('RECHAZADO')}
                        disabled={resolviendoReq}
                        className="py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                        style={{ background:'rgba(239,68,68,0.10)', border:'1px solid rgba(239,68,68,0.28)', color:'#fca5a5' }}>
                        ❌ Rechazar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Info estado EN_DISPUTA */}
          {r?.estado === 'EN_DISPUTA' && (
            <div className="slot-disputa rounded-xl p-4">
              <p className="text-amber-400 font-semibold text-sm flex items-center gap-2">
                <span>⚡</span> Conflicto de horario
              </p>
              <p className="text-xs text-amber-200/70 mt-1 leading-relaxed">
                Dos docentes solicitaron este horario. Requiere resolución del administrador.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}

          {/* Acciones */}
          <div className="space-y-2 pb-4">
            {esSuperAdmin && (
              <button onClick={onBloquear}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all
                           bg-violet-600/20 hover:bg-violet-600 text-violet-400 hover:text-white border border-violet-500/30 hover:border-violet-500">
                🔒 Bloquear este turno
              </button>
            )}
            <button onClick={onClose} className="btn-ghost w-full">Cerrar</button>
            {!confirmar ? (
              <button onClick={() => setConfirmar(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all
                           bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 hover:border-red-500/40">
                🗑 Cancelar reservación
              </button>
            ) : (
              <div className="glass-sm rounded-xl p-3 space-y-2">
                <p className="text-xs text-center text-slate-400">
                  ¿Confirmar cancelación de <strong className="text-white">{r?.docente_nombre}</strong>?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmar(false)} className="btn-ghost flex-1 py-2 text-xs">No, volver</button>
                  <button onClick={handleCancelar} disabled={cancelando}
                    className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl py-2 text-xs font-semibold transition-all">
                    {cancelando ? 'Cancelando…' : 'Sí, cancelar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal detalle de reservación (admin) — ALIAS PARA COMPATIBILIDAD ─────────

// ─── Modal detalle de bloqueo ──────────────────────────────────────────────────

function ModalDetalleBloqueo({ slot, onClose, onDesbloqueado }) {
  const b = slot.bloqueo;
  const [desbloqueando, setDesbloqueando] = useState(false);
  const [error, setError]                 = useState('');
  const DIAS_NOMBRE = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

  const handleDesbloquear = async () => {
    setDesbloqueando(true);
    setError('');
    try {
      await api.delete(`/horarios/${slot.id}/bloquear`);
      onDesbloqueado();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al desbloquear');
      setDesbloqueando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-2xl">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">🔒 Turno bloqueado</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 space-y-3">
            <div className="text-xs text-purple-300 font-medium uppercase tracking-wide">
              {DIAS_NOMBRE[slot.dia_semana]} · {slot.hora_inicio}–{slot.hora_fin}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Motivo</p>
              <p className="text-white font-semibold">{b.motivo}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Bloqueado por</p>
              <p className="text-gray-300">{b.creado_por}</p>
            </div>
            {b.fecha_creacion && (
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Fecha</p>
                <p className="text-slate-400 text-sm">
                  {new Date(b.fecha_creacion).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })}
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cerrar
            </button>
            <button onClick={handleDesbloquear} disabled={desbloqueando}
              className="flex-1 bg-purple-700 hover:bg-purple-600 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {desbloqueando ? 'Desbloqueando...' : '🔓 Desbloquear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function Horarios() {
  const { usuario }                   = useAuth();
  const esSuperAdmin                  = usuario?.rol === 'SUPER_ADMIN';
  const [labs, setLabs]               = useState([]);
  const [labSeleccionado, setLabSeleccionado] = useState('');
  const [cuatrimestre, setCuatrimestre] = useState(getCuatrimestreActual);
  const [horarios, setHorarios]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [modalNuevo, setModalNuevo]     = useState(false);
  const [modalBulk, setModalBulk]       = useState(false);
  const [modalUtecan, setModalUtecan]   = useState(false);
  const [slotEditar, setSlotEditar]     = useState(null);
  const [slotDetalle, setSlotDetalle]   = useState(null);   // reservado
  const [slotBloquear, setSlotBloquear] = useState(null);   // abrir modal bloquear
  const [slotBloqueo, setSlotBloqueo]   = useState(null);   // ver detalle bloqueo
  // Drag-select state
  const [isDragging, setIsDragging]     = useState(false);
  const [dragStartKey, setDragStartKey] = useState(null);
  const [selectedCells, setSelectedCells] = useState(new Set());


  // Cargar labs al inicio
  useEffect(() => {
    api.get('/laboratorios?solo_activos=true').then(({ data }) => {
      setLabs(data);
      if (data.length > 0) setLabSeleccionado(data[0].id);
    });
  }, []);

  const cargarHorarios = useCallback(async () => {
    if (!labSeleccionado || !cuatrimestre) return;
    setLoading(true);
    try {
      const { data } = await api.get(
        `/horarios?laboratorio_id=${labSeleccionado}&cuatrimestre=${encodeURIComponent(cuatrimestre)}&solo_activos=false`
      );
      setHorarios(data);
    } finally {
      setLoading(false);
    }
  }, [labSeleccionado, cuatrimestre]);

  useEffect(() => { cargarHorarios(); }, [cargarHorarios]);
  // Drag-select: end on mouseup anywhere
  // esSuperAdmin se incluye en deps para que el closure siempre lea el valor actual
  useEffect(() => {
    const onMouseUp = () => {
      // Capa 1: Super admin nunca usa arrastre para crear — su click abre modal de bloqueo
      if (isDragging && selectedCells.size > 0 && !esSuperAdmin) {
        // Extract hour range from selected cells
        const keys = Array.from(selectedCells);
        const horas = [...new Set(keys.map(k => k.split('|')[0]))].sort();
        const dias  = [...new Set(keys.map(k => parseInt(k.split('|')[1])))].sort();
        if (horas.length > 0 && dias.length === 1) {
          // Single-day drag: open quick create modal for that day+range
          const horaInicio = horas[0];
          const horaFin    = horaFinMap[horas[horas.length - 1]] || horas[horas.length - 1];
          const diaNum     = dias[0];
          setSlotEditar(null);
          // Pre-fill modal
          setModalNuevo({ preselect: { dia_semana: diaNum, hora_inicio: horaInicio, hora_fin: horaFin } });
        }
      }
      setIsDragging(false);
      setSelectedCells(new Set());
      setDragStartKey(null);
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [isDragging, selectedCells, esSuperAdmin]); // horaFinMap se captura en renderCell, no aquí


  // Construir grid: { "08:00": { 0: horario|null, 1: horario|null, ... } }
  const grid = {};
  // mapa inicio → fin para mostrar rango en columna de hora
  const horaFinMap = {};
  horarios.forEach(h => {
    if (!grid[h.hora_inicio]) grid[h.hora_inicio] = {};
    grid[h.hora_inicio][h.dia_semana] = h;
    horaFinMap[h.hora_inicio] = h.hora_fin;
  });
  const horasConSlots = Object.keys(grid).sort();

  const handleDesactivar = async (id) => {
    try {
      await api.delete(`/horarios/${id}`);
      cargarHorarios();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al desactivar');
    }
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Horarios</h1>
          <p className="text-slate-400 text-sm mt-0.5">Disponibilidad del cuatrimestre por laboratorio</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Botón estrella: períodos UTECAN */}
          <button onClick={() => setModalUtecan(true)} disabled={!labSeleccionado}
            className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            title="Carga automática de los 8 períodos académicos UTECAN"
            style={{
              background: 'rgba(16,185,129,0.20)',
              border: '1px solid rgba(16,185,129,0.35)',
              boxShadow: '0 0 14px rgba(16,185,129,0.15)',
            }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.background='rgba(16,185,129,0.35)'; e.currentTarget.style.boxShadow='0 0 20px rgba(16,185,129,0.30)'; } }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(16,185,129,0.20)'; e.currentTarget.style.boxShadow='0 0 14px rgba(16,185,129,0.15)'; }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            Períodos UTECAN
          </button>
          <button onClick={() => setModalBulk(true)} disabled={!labSeleccionado}
            className="flex items-center gap-2 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.10)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Carga masiva
          </button>
          <button onClick={() => setModalNuevo(true)} disabled={!labSeleccionado}
            className="flex items-center gap-2 btn-blue px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo turno
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6 rounded-xl p-4"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', position: 'relative', zIndex: 2 }}>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Laboratorio</label>
          <SelectDark
            value={labSeleccionado}
            onChange={v => setLabSeleccionado(Number(v))}
            className="min-w-[180px]"
            options={labs.map(l => ({ value: l.id, label: l.nombre }))}
          />
        </div>
        <div className="flex items-end pb-0.5 gap-2">
          <span className="text-xs text-slate-500">Cuatrimestre</span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background:'rgba(59,130,246,0.15)', color:'#93c5fd', border:'1px solid rgba(59,130,246,0.25)' }}>
            📅 {cuatrimestre}
          </span>
        </div>
        <div className="flex items-end pb-0.5">
          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-green-700 inline-block"></span> Libre (arrastra para crear)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-purple-700 inline-block"></span> Bloqueado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-gray-600 inline-block opacity-40"></span> Inactivo
            </span>
          </div>
        </div>
      </div>

      {/* Grid semanal */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      ) : horasConSlots.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <p>No hay horarios definidos para este laboratorio y cuatrimestre</p>
          <button onClick={() => setModalBulk(true)}
            className="mt-3 text-blue-400 hover:text-blue-300 text-sm underline">
            Crear con carga masiva
          </button>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgb(2 6 23)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <TimeGrid
            dias={[0,1,2,3,4,5]}
            horas={horasConSlots}
            horaFinMap={horaFinMap}
            showBreak={true}
            renderCell={(dia, hora) => {
              const slot = grid[hora]?.[dia];
              if (!slot) {
                return (
                  <div className="h-full rounded-lg border border-dashed border-white/[0.07] opacity-40"
                    style={{ background: 'rgba(255,255,255,0.015)', minHeight: '40px' }} />
                );
              }
              const esReservado = slot.reservado;
              const esInactivo  = !slot.activo;
              const esBloqueado = slot.bloqueado;
              const esDisputa   = slot.reservacion?.estado === 'EN_DISPUTA';
              const res         = slot.reservacion;
              const bloqueo     = slot.bloqueo;
              const cellKey     = `${hora}|${dia}`;
              const isSelecting = selectedCells.has(cellKey);
              return (
                <div
                  className={`rounded-lg px-2 py-1.5 flex flex-col gap-0.5 transition-all group select-none h-full
                    ${isSelecting  ? 'slot-selecting'
                    : esInactivo  ? 'slot-inactivo border border-dashed border-white/10 cursor-default'
                    : esBloqueado ? 'slot-bloqueado cursor-pointer hover:brightness-110'
                    : esDisputa   ? 'slot-disputa cursor-pointer hover:brightness-110'
                    : esReservado ? 'slot-reservado cursor-pointer hover:brightness-110'
                    :              'slot-libre cursor-crosshair'}`}
                  onMouseDown={e => {
                    // Super admin usa click para bloquear, no para arrastre de creación
                    if (esInactivo || esBloqueado || esReservado || esSuperAdmin) return;
                    e.preventDefault();
                    setIsDragging(true);
                    setDragStartKey(cellKey);
                    setSelectedCells(new Set([cellKey]));
                  }}
                  onMouseEnter={() => {
                    if (!isDragging) return;
                    const startDia = dragStartKey?.split('|')[1];
                    if (startDia !== String(dia)) return;
                    setSelectedCells(prev => new Set([...prev, cellKey]));
                  }}
                  onClick={() => {
                    if (isDragging) return;
                    if (esInactivo) return;
                    if (esBloqueado) { setSlotBloqueo(slot); return; }
                    if (esReservado) { setSlotDetalle(slot); return; }
                    if (esSuperAdmin) {
                      // Capa 2: limpiar cualquier drag state residual antes de abrir el modal
                      setIsDragging(false);
                      setSelectedCells(new Set());
                      setSlotBloquear(slot);
                      return;
                    }
                    setSlotEditar(slot);
                  }}>

                  {/* Bloqueado */}
                  {esBloqueado && (
                    <>
                      <p className="text-xs font-semibold text-purple-300 leading-tight">🔒 Bloqueado</p>
                      {bloqueo && (
                        <p className="text-xs text-purple-400/80 leading-tight truncate">{bloqueo.motivo}</p>
                      )}
                    </>
                  )}

                  {/* Libre / inactivo */}
                  {!esBloqueado && !esReservado && (
                    <>
                      <span className="text-xs font-mono text-slate-500 leading-tight">
                        {slot.hora_inicio}–{slot.hora_fin}
                      </span>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs text-green-400/80">
                          {esSuperAdmin ? '🔒 Bloquear' : 'Libre'}
                        </span>
                        {!esInactivo && !esSuperAdmin && (
                          <button
                            onClick={(ev) => { ev.stopPropagation(); handleDesactivar(slot.id); }}
                            className="hidden group-hover:block text-slate-600 hover:text-red-400 transition-colors"
                            title="Desactivar">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {/* Reservado */}
                  {!esBloqueado && esReservado && res && (
                    <>
                      <p className="text-xs font-semibold text-white leading-tight line-clamp-1">{res.materia}</p>
                      <p className="text-xs text-blue-300 leading-tight">{res.grupo}</p>
                      <p className="text-xs text-slate-400 leading-tight line-clamp-1">{res.docente_nombre}</p>
                    </>
                  )}
                </div>
              );
            }}
          />
        </div>
      )}

      {/* Stats */}
      {horarios.length > 0 && (
        <div className="flex gap-4 mt-4 text-sm text-slate-500 flex-wrap">
          <span>{horarios.filter(h => h.activo && !h.reservado && !h.bloqueado).length} libres</span>
          <span className="text-blue-400">{horarios.filter(h => h.reservado && !h.bloqueado).length} reservados</span>
          {horarios.some(h => h.bloqueado) && (
            <span className="text-purple-400">{horarios.filter(h => h.bloqueado).length} bloqueados</span>
          )}
          <span>{horarios.filter(h => !h.activo).length} inactivos</span>
        </div>
      )}

      {/* Modales */}
      {(modalNuevo || slotEditar) && (
        <ModalHorario
          labId={labSeleccionado}
          cuatrimestre={cuatrimestre}
          slot={slotEditar}
          preselect={typeof modalNuevo === 'object' ? modalNuevo.preselect : null}
          onClose={() => { setModalNuevo(false); setSlotEditar(null); }}
          onSave={() => { setModalNuevo(false); setSlotEditar(null); cargarHorarios(); }}
        />
      )}
      {modalBulk && (
        <ModalBulk
          labId={labSeleccionado}
          cuatrimestre={cuatrimestre}
          onClose={() => setModalBulk(false)}
          onSave={cargarHorarios}
        />
      )}
      {modalUtecan && (
        <ModalPeriodosUtecan
          labId={labSeleccionado}
          cuatrimestre={cuatrimestre}
          onClose={() => setModalUtecan(false)}
          onSave={() => { setModalUtecan(false); cargarHorarios(); }}
        />
      )}
      {slotDetalle && (
        <DrawerDetalleReservacion
          slot={slotDetalle}
          esSuperAdmin={esSuperAdmin}
          onClose={() => setSlotDetalle(null)}
          onCancelada={() => { setSlotDetalle(null); cargarHorarios(); }}
          onBloquear={() => { setSlotBloquear(slotDetalle); setSlotDetalle(null); }}
        />
      )}
      {slotBloquear && (
        <ModalBloquear
          slot={slotBloquear}
          onClose={() => setSlotBloquear(null)}
          onBloqueado={() => { setSlotBloquear(null); cargarHorarios(); }}
        />
      )}
      {slotBloqueo && (
        <ModalDetalleBloqueo
          slot={slotBloqueo}
          onClose={() => setSlotBloqueo(null)}
          onDesbloqueado={() => { setSlotBloqueo(null); cargarHorarios(); }}
        />
      )}
    </AdminLayout>
  );
}
