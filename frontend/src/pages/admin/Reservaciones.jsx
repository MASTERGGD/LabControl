import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../hooks/useApi';
import CuatrimestreSelect, { getCuatrimestreActual } from '../../components/CuatrimestreSelect';
import AutocompleteInput, { formatApiError } from '../../components/AutocompleteInput';
import SelectDark from '../../components/SelectDark';
import TimeGrid from '../../components/TimeGrid';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTO = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

// Gradientes por estado — dark glassmorphism
const GRAD_SLOT = {
  MIO:         'linear-gradient(135deg,#4f46e5 0%,#2563eb 100%)',
  OCUPADO:     'linear-gradient(135deg,#1e3a5f 0%,#1e40af 100%)',
  EN_DISPUTA:  'linear-gradient(135deg,#78350f 0%,#b45309 100%)',
  YO_SOLICITE: 'linear-gradient(135deg,#7c2d12 0%,#c2410c 100%)',
};

// ─── Modal: Reservar un slot libre ───────────────────────────────────────────

function ModalReservar({ slot, cuatrimestre, laboratorio_id, onClose, onGuardado }) {
  const { usuario } = useAuth();
  const [form, setForm]             = useState({ materia: '', grupo: '', cuatrimestre });
  const [materiaQuery, setMateriaQuery] = useState('');
  const [materiaInfo, setMateriaInfo]   = useState(null); // materia seleccionada del catálogo
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const seleccionarMateria = (m) => {
    const nombre = m.nombre || '';
    setMateriaQuery(nombre);
    setMateriaInfo(m);
    setForm(f => ({ ...f, materia: nombre }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/horarios/reservaciones', {
        horario_id:     slot.horario_id,
        laboratorio_id: laboratorio_id,
        docente_id:     usuario.id,
        materia:        form.materia,
        grupo:          form.grupo,
        cuatrimestre:   form.cuatrimestre,
      });
      onGuardado();
      onClose();
    } catch (err) {
      setError(formatApiError(err, 'Error al reservar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm rounded-2xl overflow-hidden shadow-glass" style={{ animation:'fadeUp .2s ease' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-semibold text-white">Reservar horario</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {DIAS_LABEL[slot.dia_semana]} · {slot.hora_inicio} – {slot.hora_fin}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5">
              Materia <span className="text-red-400">*</span>
              <span className="text-slate-600 normal-case font-normal ml-1">(escribe para buscar del catálogo)</span>
            </label>
            <AutocompleteInput
              endpoint="/catalogo/materias/buscar"
              placeholder="Ej. Bases de Datos…"
              value={materiaQuery}
              onChange={(txt) => {
                setMateriaQuery(txt);
                setForm(f => ({ ...f, materia: txt }));
                if (!txt) setMateriaInfo(null);
              }}
              onSelect={seleccionarMateria}
              renderItem={(m) => (
                <div>
                  <p className="font-medium leading-tight">{m.nombre}</p>
                  {m.cuatrimestre_oficial && (
                    <p className="text-xs text-slate-500 leading-tight">{m.cuatrimestre_oficial}º cuatrimestre</p>
                  )}
                </div>
              )}
            />
            <input type="text" required className="sr-only" value={form.materia} readOnly tabIndex={-1} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5">
              Grupo <span className="text-red-400">*</span>
            </label>
            <input required type="text" placeholder="Ej. DyGS-8vo. A"
              value={form.grupo} onChange={e => setForm({...form, grupo: e.target.value})}
              className="input-dark w-full"
            />
          </div>
          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-50 transition-all"
              style={{ background:'linear-gradient(135deg,#10b981,#059669)', boxShadow:'0 0 16px rgba(16,185,129,.25)' }}>
              {saving ? 'Reservando…' : '✓ Reservar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Ver mi reservación ────────────────────────────────────────────────

function ModalMiReservacion({ slot, onClose, onCancelada, onGuardado }) {
  const [cancelando, setCancelando] = useState(false);
  const [confirmar,  setConfirmar]  = useState(false);
  const [error,      setError]      = useState('');
  const r = slot.reservacion;

  const handleCancelar = async () => {
    setCancelando(true); setError('');
    try {
      await api.delete(`/horarios/reservaciones/${r.id}`);
      onCancelada();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cancelar');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm rounded-2xl overflow-hidden shadow-glass" style={{ animation:'fadeUp .2s ease' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-semibold text-white">Mi reservación</h2>
            <p className="text-sm text-slate-400">{DIAS_LABEL[slot.dia_semana]} · {slot.hora_inicio} – {slot.hora_fin}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="glass-sm rounded-xl p-4 space-y-2 text-sm" style={{ border:'1px solid rgba(59,130,246,0.2)' }}>
            <p><span className="text-slate-400">Materia:</span> <span className="font-semibold text-white ml-2">{r.materia}</span></p>
            <p><span className="text-slate-400">Grupo:</span> <span className="text-slate-200 ml-2">{r.grupo}</span></p>
            <p><span className="text-slate-400">Cuatrimestre:</span> <span className="text-slate-200 ml-2">{r.cuatrimestre}</span></p>
            {slot.solicitudes_n > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop:'1px solid rgba(245,158,11,0.2)' }}>
                <p className="text-amber-400 font-medium flex items-center gap-1 text-xs">
                  <span>⚠️</span>
                  {slot.solicitudes_n} docente{slot.solicitudes_n > 1 ? 's' : ''} también
                  {slot.solicitudes_n > 1 ? ' solicitan' : ' solicita'} este horario
                </p>
                <p className="text-xs text-slate-500 mt-0.5">El administrador te contactará si surge un conflicto</p>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}

          {!confirmar ? (
            <button onClick={() => setConfirmar(true)}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all text-red-400 hover:text-red-300"
              style={{ border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.06)' }}>
              🗑 Liberar este horario
            </button>
          ) : (
            <div className="glass-sm rounded-xl p-4 space-y-3" style={{ border:'1px solid rgba(239,68,68,0.25)' }}>
              <p className="text-sm text-slate-300 text-center">¿Confirmar liberación del horario?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmar(false)} className="btn-ghost flex-1 py-2 text-sm">No, mantener</button>
                <button onClick={handleCancelar} disabled={cancelando}
                  className="flex-1 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50 transition-all"
                  style={{ background:'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                  {cancelando ? 'Liberando…' : 'Sí, liberar'}
                </button>
              </div>
            </div>
          )}
          <button onClick={onClose} className="btn-ghost w-full py-2 text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Solicitar slot ocupado ────────────────────────────────────────────

function ModalSolicitar({ slot, onClose, onSolicitado }) {
  const r = slot.reservacion;
  const [form, setForm]               = useState({ materia: '', grupo: '', motivo: '' });
  const [materiaQuery, setMateriaQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const seleccionarMateria = (m) => {
    setMateriaQuery(m.nombre || '');
    setForm(f => ({ ...f, materia: m.nombre || '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/horarios/reservaciones/${r.id}/solicitar`, form);
      onSolicitado();
      onClose();
    } catch (err) {
      setError(formatApiError(err, 'Error al enviar solicitud'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md rounded-2xl overflow-hidden shadow-glass" style={{ animation:'fadeUp .2s ease' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-semibold text-white">Solicitar horario</h2>
            <p className="text-sm text-slate-400">{DIAS_LABEL[slot.dia_semana]} · {slot.hora_inicio} – {slot.hora_fin}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Info del dueño actual */}
          <div className="glass-sm rounded-xl p-3 text-sm" style={{ border:'1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-slate-500 mb-1">Actualmente ocupado por:</p>
            <p className="font-semibold text-white">{r.docente_nombre}</p>
            <p className="text-slate-400">{r.materia} · {r.grupo}</p>
            {slot.solicitudes_n > 0 && (
              <p className="text-amber-400 text-xs mt-1">⚠️ {slot.solicitudes_n} solicitud(es) pendiente(s)</p>
            )}
          </div>
          <p className="text-sm text-slate-400">
            Al enviar esta solicitud, el administrador del laboratorio revisará el caso y decidirá si el horario puede ser reasignado.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5">
                Tu materia <span className="text-red-400">*</span>
                <span className="text-slate-600 normal-case font-normal ml-1">(escribe para buscar)</span>
              </label>
              <AutocompleteInput
                endpoint="/catalogo/materias/buscar"
                placeholder="Ej. Minería de Datos…"
                value={materiaQuery}
                onChange={(txt) => { setMateriaQuery(txt); setForm(f => ({ ...f, materia: txt })); }}
                onSelect={seleccionarMateria}
                renderItem={(m) => (
                  <div>
                    <p className="font-medium leading-tight">{m.nombre}</p>
                    {m.cuatrimestre_oficial && (
                      <p className="text-xs text-slate-500">{m.cuatrimestre_oficial}º cuatrimestre</p>
                    )}
                  </div>
                )}
              />
              <input type="text" required className="sr-only" value={form.materia} readOnly tabIndex={-1} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5">Tu grupo <span className="text-red-400">*</span></label>
              <input required type="text" placeholder="Ej. TIeID-5to. A"
                value={form.grupo} onChange={e => setForm({...form, grupo: e.target.value})}
                className="input-dark w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5">Motivo (opcional)</label>
              <textarea rows={2} placeholder="¿Por qué necesitas este horario en particular?"
                value={form.motivo} onChange={e => setForm({...form, motivo: e.target.value})}
                className="input-dark resize-none w-full"
              />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-50 transition-all"
                style={{ background:'linear-gradient(135deg,#ea580c,#c2410c)', boxShadow:'0 0 16px rgba(234,88,12,.25)' }}>
                {saving ? 'Enviando…' : '📩 Enviar solicitud'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Retiro de mi solicitud ────────────────────────────────────────────

function ModalYoSolicite({ slot, onClose, onRetirado }) {
  const [retirando, setRetirando] = useState(false);
  const [error,     setError]     = useState('');
  const r = slot.reservacion;

  const handleRetirar = async () => {
    setRetirando(true); setError('');
    try {
      await api.delete(`/horarios/reservaciones/${r.id}/solicitar`);
      onRetirado();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al retirar');
    } finally {
      setRetirando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm rounded-2xl overflow-hidden shadow-glass" style={{ animation:'fadeUp .2s ease' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold text-white">Mi solicitud pendiente</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="glass-sm rounded-xl p-4 text-sm space-y-1" style={{ border:'1px solid rgba(245,158,11,0.25)' }}>
            <p className="font-semibold text-amber-400">En espera de resolución del administrador</p>
            <p className="text-slate-300">{DIAS_LABEL[slot.dia_semana]} · {slot.hora_inicio} – {slot.hora_fin}</p>
            <p className="text-slate-500 text-xs mt-1">Actualmente de: {r.docente_nombre} ({r.materia})</p>
          </div>
          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">Cerrar</button>
            <button onClick={handleRetirar} disabled={retirando}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-50 transition-all"
              style={{ border:'1px solid rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.1)', color:'#fca5a5' }}>
              {retirando ? 'Retirando…' : 'Retirar solicitud'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Panel de Conflictos (solo admins) ───────────────────────────────────────

function PanelConflictos({ laboratorio_id, onResuelto }) {
  const [conflictos, setConflictos] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [resolviendo, setResolviendo] = useState(null);
  const [notas, setNotas]           = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = laboratorio_id ? `?laboratorio_id=${laboratorio_id}` : '';
      const res = await api.get(`/horarios/conflictos${params}`);
      setConflictos(res.data);
    } catch { setConflictos([]); }
    finally { setLoading(false); }
  }, [laboratorio_id]);

  useEffect(() => { cargar(); }, [cargar]);

  const resolver = async (solicitud_id, decision) => {
    try {
      await api.put(`/horarios/conflictos/${solicitud_id}/resolver`, { decision, notas });
      setResolviendo(null);
      setNotas('');
      cargar();
      onResuelto();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al resolver');
    }
  };

  if (loading) return <div className="text-center py-6 text-slate-400 text-sm">Cargando conflictos…</div>;
  if (conflictos.length === 0) return (
    <div className="text-center py-8 text-slate-400">
      <span className="text-3xl block mb-2">✅</span>
      <p className="text-sm">Sin conflictos pendientes</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {conflictos.map(c => (
        <div key={c.solicitud_id} className="glass-sm rounded-2xl overflow-hidden"
          style={{ border:'1px solid rgba(245,158,11,0.2)' }}>
          {/* Encabezado */}
          <div className="px-4 py-3 flex items-center gap-2"
            style={{ background:'rgba(245,158,11,0.07)', borderBottom:'1px solid rgba(245,158,11,0.15)' }}>
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-amber-300 text-sm">{c.dia_nombre} · {c.hora_inicio}–{c.hora_fin}</p>
              <p className="text-xs text-amber-500">{c.laboratorio}</p>
            </div>
          </div>
          {/* Comparación lado a lado */}
          <div className="grid grid-cols-2" style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div className="p-4" style={{ borderRight:'1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Tiene el slot</p>
              <p className="font-semibold text-white text-sm">{c.docente_original_nombre}</p>
              <p className="text-xs text-slate-400 mt-0.5">{c.materia_original}</p>
              <p className="text-xs text-slate-500">{c.grupo_original}</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-orange-400 font-medium mb-1 uppercase tracking-wide">Lo solicita</p>
              <p className="font-semibold text-white text-sm">{c.solicitante_nombre}</p>
              <p className="text-xs text-slate-400 mt-0.5">{c.materia_solicitada}</p>
              <p className="text-xs text-slate-500">{c.grupo_solicitado}</p>
            </div>
          </div>
          {c.motivo && (
            <div className="px-4 py-2 text-xs text-slate-500 italic"
              style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              Motivo: "{c.motivo}"
            </div>
          )}
          {/* Acciones */}
          {resolviendo === c.solicitud_id ? (
            <div className="px-4 py-3 space-y-2">
              <textarea rows={2} placeholder="Notas para los docentes (opcional)…"
                value={notas} onChange={e => setNotas(e.target.value)}
                className="input-dark resize-none w-full text-sm"
              />
              <div className="flex gap-2">
                <button onClick={() => { setResolviendo(null); setNotas(''); }}
                  className="btn-ghost flex-1 py-2 text-xs">Cancelar</button>
                <button onClick={() => resolver(c.solicitud_id, 'RECHAZAR')}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-slate-300 transition-all"
                  style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)' }}>
                  ✗ Mantener original
                </button>
                <button onClick={() => resolver(c.solicitud_id, 'APROBAR')}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                  style={{ background:'linear-gradient(135deg,#10b981,#059669)', boxShadow:'0 0 12px rgba(16,185,129,.2)' }}>
                  ✓ Transferir slot
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3">
              <button onClick={() => setResolviendo(c.solicitud_id)}
                className="btn-blue w-full py-2 text-sm font-medium">
                Resolver conflicto
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Grid semanal ─────────────────────────────────────────────────────────────

function GridSemanal({ slots, onSlotClick }) {
  const horas       = [...new Set(slots.map(s => s.hora_inicio))].sort();
  const dias        = [...new Set(slots.map(s => s.dia_semana))].sort();
  const idx         = {};
  // horaFinMap: primer slot encontrado para cada hora_inicio
  const horaFinMap  = {};
  slots.forEach(s => {
    idx[`${s.dia_semana}-${s.hora_inicio}`] = s;
    if (!horaFinMap[s.hora_inicio]) horaFinMap[s.hora_inicio] = s.hora_fin;
  });

  return (
    <TimeGrid
      dias={dias}
      horas={horas}
      horaFinMap={horaFinMap}
      showBreak={false}
      renderCell={(dia, hora) => {
        const slot = idx[`${dia}-${hora}`];

        /* Sin dato en este cruce */
        if (!slot) {
          return (
            <div className="h-full rounded-lg"
              style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', minHeight: '56px' }} />
          );
        }

        /* LIBRE — rectángulo sutil + hover azul eléctrico */
        if (slot.estado_vista === 'LIBRE') {
          return (
            <div
              onClick={() => onSlotClick(slot)}
              className="group h-full flex items-center justify-center cursor-pointer rounded-lg transition-all duration-150"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                minHeight: '56px',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background   = 'rgba(59,130,246,0.10)';
                e.currentTarget.style.border       = '1px solid rgba(59,130,246,0.50)';
                e.currentTarget.style.boxShadow    = '0 0 12px rgba(59,130,246,0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background   = 'rgba(255,255,255,0.03)';
                e.currentTarget.style.border       = '1px solid rgba(255,255,255,0.07)';
                e.currentTarget.style.boxShadow    = 'none';
              }}
            >
              <svg className="w-4 h-4 text-slate-700 group-hover:text-blue-400 transition-colors"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          );
        }

        /* Ocupado / mío / disputa / solicitado */
        const grad     = GRAD_SLOT[slot.estado_vista] || GRAD_SLOT.OCUPADO;
        const clickable = ['MIO','OCUPADO','EN_DISPUTA','YO_SOLICITE'].includes(slot.estado_vista);

        return (
          <div
            onClick={() => clickable && onSlotClick(slot)}
            className={`relative h-full flex flex-col justify-between p-2 rounded-lg overflow-hidden transition-all duration-150
              ${clickable ? 'cursor-pointer' : ''}
              ${slot.estado_vista === 'EN_DISPUTA' ? 'slot-disputa' : ''}`}
            style={{
              background: grad,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              minHeight: '56px',
            }}
            onMouseEnter={e => { if (clickable) e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            <p className="text-xs font-medium text-white leading-tight truncate">
              {slot.reservacion?.materia || '—'}
            </p>
            <div>
              {slot.estado_vista !== 'MIO' && slot.reservacion?.docente_nombre && (
                <p className="text-[10px] text-white/75 truncate font-medium">
                  {slot.reservacion.docente_nombre}
                </p>
              )}
              {slot.reservacion?.grupo && (
                <p className="text-[10px] text-white/55">{slot.reservacion.grupo}</p>
              )}
            </div>
            {slot.estado_vista === 'EN_DISPUTA' && (
              <span className="absolute top-1 right-1 text-[9px] bg-amber-400 text-amber-900 px-1 rounded font-bold leading-tight">!</span>
            )}
            {slot.estado_vista === 'MIO' && slot.solicitudes_n > 0 && (
              <span className="absolute top-1 right-1 text-[9px] bg-yellow-400 text-yellow-900 px-1 rounded font-bold leading-tight">
                {slot.solicitudes_n}↑
              </span>
            )}
          </div>
        );
      }}
    />
  );
}

// ─── Leyenda ──────────────────────────────────────────────────────────────────

function Leyenda({ esDocente }) {
  const items = [
    { color: '#10b981', label: 'Disponible' },
    { color: '#4f46e5', label: 'Mi reserva' },
    { color: '#1e40af', label: 'Ocupado' },
    { color: '#b45309', label: 'En disputa' },
    ...(esDocente ? [{ color: '#c2410c', label: 'Solicité' }] : []),
  ];
  return (
    <div className="flex flex-wrap gap-3 items-center justify-end">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          <span className="text-xs text-slate-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Reservaciones() {
  const { usuario } = useAuth();
  const esAdmin     = ['SUPER_ADMIN', 'LAB_ADMIN'].includes(usuario?.rol);
  const esDocente   = usuario?.rol === 'DOCENTE';

  const [laboratorios, setLaboratorios]   = useState([]);
  const [labId, setLabId]                 = useState('');
  const [cuatrimestre, setCuatrimestre]   = useState(getCuatrimestreActual);
  const [slots, setSlots]                 = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [conflictosN, setConflictosN]     = useState(0);
  const [verConflictos, setVerConflictos] = useState(false);

  // Modales
  const [modalSlot, setModalSlot] = useState(null); // { tipo, slot }

  // Cargar labs
  useEffect(() => {
    api.get('/laboratorios').then(res => {
      setLaboratorios(res.data);
      if (res.data.length > 0) {
        const defaultLab = usuario?.rol === 'LAB_ADMIN'
          ? res.data.find(l => l.id === usuario.laboratorio_id) || res.data[0]
          : res.data[0];
        setLabId(defaultLab?.id || '');
      }
    }).catch(() => {});
  }, []);

  const cargarGrid = useCallback(async () => {
    if (!labId || !cuatrimestre) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/horarios/disponibilidad?laboratorio_id=${labId}&cuatrimestre=${cuatrimestre}`);
      setSlots(res.data.slots || []);
    } catch (e) {
      setError('Error al cargar el horario del laboratorio');
    } finally {
      setLoading(false);
    }
  }, [labId, cuatrimestre]);

  // Cargar conflictos pendientes (solo admins)
  const cargarConflictos = useCallback(async () => {
    if (!esAdmin) return;
    try {
      const params = labId ? `?laboratorio_id=${labId}` : '';
      const res = await api.get(`/horarios/conflictos${params}`);
      setConflictosN(res.data.length);
    } catch { setConflictosN(0); }
  }, [esAdmin, labId]);

  useEffect(() => { cargarGrid(); }, [cargarGrid]);
  useEffect(() => { cargarConflictos(); }, [cargarConflictos]);

  const handleSlotClick = (slot) => {
    const tipo = slot.estado_vista;
    if (tipo === 'LIBRE')       setModalSlot({ tipo: 'reservar',   slot });
    else if (tipo === 'MIO')    setModalSlot({ tipo: 'mi_reserva', slot });
    else if (tipo === 'OCUPADO' || tipo === 'EN_DISPUTA') {
      if (esDocente) setModalSlot({ tipo: 'solicitar', slot });
    }
    else if (tipo === 'YO_SOLICITE') setModalSlot({ tipo: 'yo_solicite', slot });
  };

  const cerrarModal = () => setModalSlot(null);
  const recargar    = () => { cargarGrid(); cargarConflictos(); };

  const conflictosPendientes = slots.filter(s => s.estado_vista === 'EN_DISPUTA').length;

  return (
    <AdminLayout>
      {/* Fondo oscuro slate-950 */}
      <div className="p-6 space-y-5 min-h-screen" style={{ background: 'rgb(2 6 23)' }}>

        {/* Encabezado */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Horario del Laboratorio</h1>
            <p className="text-sm text-slate-400 mt-1">
              {esDocente
                ? 'Selecciona un horario disponible o solicita uno ocupado'
                : 'Vista semanal de reservaciones. Resuelve conflictos desde el panel lateral.'}
            </p>
          </div>
          {esAdmin && conflictosN > 0 && (
            <button onClick={() => setVerConflictos(!verConflictos)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition"
              style={{
                background: verConflictos
                  ? 'rgba(217,119,6,0.9)'
                  : 'rgba(217,119,6,0.15)',
                color: verConflictos ? '#fff' : '#fbbf24',
                border: '1px solid rgba(217,119,6,0.4)',
              }}>
              ⚠️ {conflictosN} conflicto{conflictosN > 1 ? 's' : ''} pendiente{conflictosN > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Filtros — glass card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-400">Laboratorio</label>
              <SelectDark
                value={labId}
                onChange={setLabId}
                className="min-w-[180px]"
                placeholder="— Seleccionar —"
                options={[{ value: '', label: '— Seleccionar —' }, ...laboratorios.map(l => ({ value: l.id, label: l.nombre }))]}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-400">Cuatrimestre</label>
              <CuatrimestreSelect value={cuatrimestre} onChange={setCuatrimestre} className="w-44" />
            </div>
            <button onClick={recargar}
              title="Actualizar"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '14px',
                cursor: 'pointer',
                color: '#94a3b8',
              }}>
              🔄
            </button>
          </div>
        </div>

        {/* Layout: Grid + Panel conflictos */}
        <div className={`flex gap-5 ${verConflictos ? 'items-start' : ''}`}>

          {/* Grid semanal — glass container */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Leyenda — parte superior derecha */}
            <Leyenda esDocente={esDocente} />

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '14px',
              }}>{error}</div>
            )}

            {!labId ? (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                padding: '64px 16px',
                textAlign: 'center',
                color: '#475569',
              }}>
                <span className="text-4xl block mb-3">📅</span>
                <p>Selecciona un laboratorio para ver el horario</p>
              </div>
            ) : loading ? (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                padding: '64px 16px',
                textAlign: 'center',
                color: '#475569',
              }}>
                <div className="text-3xl animate-spin mb-2">⚙️</div>
                <p className="text-sm">Cargando horario…</p>
              </div>
            ) : slots.length === 0 ? (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                padding: '64px 16px',
                textAlign: 'center',
                color: '#475569',
              }}>
                <span className="text-4xl block mb-3">📅</span>
                <p className="text-sm">No hay horarios definidos para este laboratorio y cuatrimestre</p>
                {esAdmin && (
                  <p className="text-xs mt-2" style={{ color: '#60a5fa' }}>
                    Ve a <strong>Horarios</strong> para agregar slots disponibles
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Contenedor del grid con backdrop-blur */}
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}>
                  <GridSemanal slots={slots} onSlotClick={handleSlotClick} />
                </div>
                {/* Resumen de conflictos para docente */}
                {esDocente && conflictosPendientes > 0 && (
                  <div style={{
                    background: 'rgba(217,119,6,0.1)',
                    border: '1px solid rgba(217,119,6,0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    fontSize: '14px',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span>⚠️</span>
                    <span>Hay <strong>{conflictosPendientes}</strong> horario(s) en disputa. El administrador revisará cada caso.</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Panel de conflictos (admin) */}
          {esAdmin && verConflictos && (
            <div className="w-80 shrink-0 space-y-3">
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(217,119,6,0.25)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(217,119,6,0.2)',
                  background: 'rgba(217,119,6,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <h3 className="font-semibold text-sm" style={{ color: '#fbbf24' }}>⚠️ Conflictos pendientes</h3>
                  <button onClick={() => setVerConflictos(false)}
                    style={{ color: '#f59e0b', fontSize: '20px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
                <div className="p-4">
                  <PanelConflictos laboratorio_id={labId || null} onResuelto={recargar} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modales */}
      {modalSlot?.tipo === 'reservar' && (
        <ModalReservar slot={modalSlot.slot} cuatrimestre={cuatrimestre} laboratorio_id={labId}
          onClose={cerrarModal} onGuardado={recargar} />
      )}
      {modalSlot?.tipo === 'mi_reserva' && (
        <ModalMiReservacion slot={modalSlot.slot}
          onClose={cerrarModal} onCancelada={recargar} onGuardado={recargar} />
      )}
      {modalSlot?.tipo === 'solicitar' && (
        <ModalSolicitar slot={modalSlot.slot}
          onClose={cerrarModal} onSolicitado={recargar} />
      )}
      {modalSlot?.tipo === 'yo_solicite' && (
        <ModalYoSolicite slot={modalSlot.slot}
          onClose={cerrarModal} onRetirado={recargar} />
      )}
    </AdminLayout>
  );
}
