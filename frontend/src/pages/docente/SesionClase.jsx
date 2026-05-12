import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../hooks/useApi';
import CuatrimestreSelect, { getCuatrimestreActual } from '../../components/CuatrimestreSelect';
import AutocompleteInput, { formatApiError } from '../../components/AutocompleteInput';
import SelectDark from '../../components/SelectDark';
import TimeGrid from '../../components/TimeGrid';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTO = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

/** Convierte 'HH:MM' a minutos desde medianoche */
function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Genera opciones de duración en pasos de 15 min, siempre incluyendo maxMin como tope */
function opcionesDuracion(maxMin) {
  const pasos = [15, 30, 45, 50, 60, 75, 90, 100, 120];
  const filtrados = pasos.filter(m => m < maxMin);
  return [...filtrados, maxMin]; // maxMin siempre aparece como última opción
}

function fmtMin(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${m} min (${h > 0 ? `${h}h ` : ''}${min > 0 ? `${min}min` : ''})`.replace(/\s+/g, ' ').trim();
}

const ESTILOS_SLOT = {
  LIBRE:       { bg: 'bg-green-900/40 border-green-700/60 hover:bg-green-900/70',   texto: 'text-green-300',  cursor: 'cursor-pointer' },
  MIO:         { bg: 'bg-blue-600 border-blue-500 hover:bg-blue-500',               texto: 'text-white',      cursor: 'cursor-pointer' },
  OCUPADO:     { bg: 'bg-red-900/40 border-red-700/60 hover:bg-red-900/60',         texto: 'text-red-300',    cursor: 'cursor-pointer' },
  EN_DISPUTA:  { bg: 'bg-amber-900/40 border-amber-600/60 hover:bg-amber-900/60',   texto: 'text-amber-300',  cursor: 'cursor-pointer' },
  YO_SOLICITE: { bg: 'bg-orange-900/40 border-orange-600/60',                       texto: 'text-orange-300', cursor: 'cursor-default'  },
  BLOQUEADO:   { bg: 'bg-purple-900/40 border-purple-700/60',                       texto: 'text-purple-300', cursor: 'cursor-default'  },
};

// ─── DocenteLayout ────────────────────────────────────────────────────────────

function DocenteLayout({ children, onCambiarPwd }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen text-white">
      <header className="glass-sm border-b border-white/5 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <span className="font-bold text-white">LabControl</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 hidden sm:block">{usuario?.nombre}</span>
          <span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded-full font-medium">DOCENTE</span>
          <button onClick={onCambiarPwd}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/8 transition-colors"
            title="Cambiar contraseña">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
          </button>
          <button onClick={() => { logout(); navigate('/login'); }}
            className="text-sm text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Salir
          </button>
        </div>
      </header>
      <main className="p-3 sm:p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}

// ─── Modal: Cambiar contraseña ─────────────────────────────────────────────────

function ModalCambiarPassword({ onClose }) {
  const [form, setForm]       = useState({ password_actual: '', password_nuevo: '', confirmar: '' });
  const [error, setError]     = useState('');
  const [ok, setOk]           = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password_nuevo !== form.confirmar) { setError('Las contraseñas no coinciden'); return; }
    if (form.password_nuevo.length < 6) { setError('Mínimo 6 caracteres'); return; }
    setLoading(true); setError('');
    try {
      await api.put('/usuarios/me/password', {
        password_actual: form.password_actual,
        password_nuevo:  form.password_nuevo,
      });
      setOk(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cambiar contraseña');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">🔑 Cambiar contraseña</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        {ok ? (
          <div className="p-6 text-center space-y-4">
            <div className="text-4xl">✅</div>
            <p className="text-white font-semibold">¡Contraseña actualizada!</p>
            <button onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-semibold">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {['password_actual','password_nuevo','confirmar'].map((campo, i) => (
              <div key={campo}>
                <label className="block text-sm text-slate-400 mb-1">
                  {i === 0 ? 'Contraseña actual' : i === 1 ? 'Nueva contraseña' : 'Confirmar nueva contraseña'}
                </label>
                <input type="password" required value={form[campo]}
                  onChange={e => setForm({...form, [campo]: e.target.value})}
                  placeholder={i === 0 ? 'Tu contraseña actual' : 'Mínimo 6 caracteres'}
                  className="w-full input-dark text-white  px-4 py-2.5  focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            ))}
            {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm">Cancelar</button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-lg py-2.5 text-sm font-semibold">
                {loading ? 'Guardando…' : 'Actualizar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Panel de estado de requerimiento (docente ve el estado) ─────────────────

const REQ_ESTADO_STYLE = {
  PENDIENTE:      { bg:'rgba(234,179,8,0.10)',  border:'rgba(234,179,8,0.30)',  text:'#fde68a', label:'⏳ Pendiente de revisión' },
  CONFIRMADO:     { bg:'rgba(34,197,94,0.10)',  border:'rgba(34,197,94,0.30)',  text:'#86efac', label:'✅ Confirmado por el admin' },
  RECHAZADO:      { bg:'rgba(239,68,68,0.10)',  border:'rgba(239,68,68,0.30)',  text:'#fca5a5', label:'❌ No disponible' },
  DOCENTE_PROVEE: { bg:'rgba(99,102,241,0.12)', border:'rgba(99,102,241,0.35)', text:'#c4b5fd', label:'💾 Tú provees el software' },
};

function RequerimientoStatusPanel({ req }) {
  if (!req) return null;
  const items = Array.isArray(req.items) ? req.items : [];
  const style = REQ_ESTADO_STYLE[req.estado] || REQ_ESTADO_STYLE.PENDIENTE;
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
      <div className="flex items-center justify-between flex-wrap gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: style.text }}>📋 Mis requerimientos</p>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}>
          {style.label}
        </span>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map(item => (
            <span key={item} className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background:'rgba(34,197,94,0.12)', color:'#86efac', border:'1px solid rgba(34,197,94,0.25)' }}>
              {item}
            </span>
          ))}
        </div>
      )}
      {req.descripcion && <p className="text-xs text-slate-300 italic">"{req.descripcion}"</p>}
      {req.urgente && (
        <p className="text-xs text-red-400 font-semibold flex items-center gap-1.5">
          <span>🔴</span> Marcado como urgente (clase próxima)
        </p>
      )}
      {req.nota_admin && (
        <div className="pt-1.5 border-t border-white/5">
          <p className="text-xs text-slate-400">Respuesta del administrador:</p>
          <p className="text-xs text-slate-200 italic mt-0.5">"{req.nota_admin}"</p>
        </div>
      )}
    </div>
  );
}

// ─── Modal: Reservar slot libre ───────────────────────────────────────────────

// Requerimientos rápidos
const CHECKS_REQ = [
  { key: 'proyector',   label: 'Proyector / pantalla',   icon: '📽️' },
  { key: 'internet',    label: 'Acceso a internet',       icon: '🌐' },
  { key: 'software',    label: 'Software específico',     icon: '💿' },
  { key: 'audio',       label: 'Micrófono / bocinas',     icon: '🔊' },
  { key: 'extensiones', label: 'Extensiones / contactos', icon: '🔌' },
];

function ModalReservar({ slot, cuatrimestre, laboratorio_id, onClose, onGuardado }) {
  const { usuario } = useAuth();
  const [form, setForm]               = useState({ materia: '', grupo: '', cuatrimestre });
  const [materiaQuery, setMateriaQuery] = useState('');
  const [materiaInfo, setMateriaInfo]   = useState(null);
  const [checks, setChecks]           = useState({});
  const [notaReq, setNotaReq]         = useState('');
  const [tieneInstalador, setTieneInstalador] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const seleccionarMateria = (m) => {
    setMateriaQuery(m.nombre || '');
    setMateriaInfo(m);
    setForm(f => ({ ...f, materia: m.nombre || '' }));
  };

  const toggleCheck = (key) => setChecks(c => ({ ...c, [key]: !c[key] }));

  const hayReqs = CHECKS_REQ.some(c => checks[c.key]) || notaReq.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.materia.trim()) { setError('Escribe o selecciona una materia.'); return; }
    setSaving(true); setError('');
    const reqItems = CHECKS_REQ.filter(c => checks[c.key]).map(c => c.label);
    try {
      await api.post('/horarios/reservaciones', {
        horario_id:           slot.horario_id,
        laboratorio_id:       laboratorio_id,
        docente_id:           usuario.id,
        materia:              form.materia,
        grupo:                form.grupo,
        cuatrimestre:         form.cuatrimestre,
        req_items:            reqItems.length ? reqItems : undefined,
        req_descripcion:      notaReq.trim() || undefined,
        req_tiene_instalador: checks.software ? tieneInstalador : undefined,
      });
      onGuardado(); onClose();
    } catch (err) {
      setError(formatApiError(err, 'Error al reservar'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">Reservar horario</h2>
            <p className="text-sm text-slate-400 mt-0.5">{DIAS_LABEL[slot.dia_semana]} · {slot.hora_inicio} – {slot.hora_fin}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Materia */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Materia *
              <span className="text-slate-500 font-normal text-xs ml-1">(escribe para buscar)</span>
            </label>
            <div className="[&_input]:bg-gray-700 [&_input]:text-white [&_input]:border-gray-600
                            [&_input:focus]:ring-green-500 [&_ul]:bg-gray-800 [&_ul]:border-gray-600
                            [&_li]:text-gray-200 [&_li:hover]:bg-gray-700 [&_div]:text-slate-400">
              <AutocompleteInput
                endpoint="/catalogo/materias/buscar"
                placeholder="Ej. Bases de Datos…"
                value={materiaQuery}
                onChange={(txt) => {
                  setMateriaQuery(txt);
                  setMateriaInfo(null);
                  setForm(f => ({ ...f, materia: txt }));
                }}
                onSelect={seleccionarMateria}
                renderItem={(m) => (
                  <div>
                    <p className="font-medium leading-tight">{m.nombre}</p>
                    {m.cuatrimestre_oficial && (
                      <p className="text-xs text-slate-400 leading-tight">{m.cuatrimestre_oficial}º cuatrimestre</p>
                    )}
                  </div>
                )}
              />
            </div>
            <input type="text" required className="sr-only" value={form.materia} readOnly tabIndex={-1} />
          </div>

          {/* Grupo */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Grupo *</label>
            <input required type="text" placeholder="Ej. DyGS-8vo. A"
              value={form.grupo} onChange={e => setForm({...form, grupo: e.target.value})}
              className="w-full input-dark text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"/>
          </div>

          {/* ── Requerimientos ── */}
          <div className="rounded-xl p-4 space-y-3" style={{ background:'rgba(30,41,59,0.6)', border:'1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1.5">
              <span>📋</span> Requerimientos para la clase
              <span className="text-slate-600 normal-case font-normal">(opcional)</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CHECKS_REQ.map(c => (
                <label key={c.key}
                  className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 transition-colors select-none"
                  style={{
                    background: checks[c.key] ? 'rgba(34,197,94,0.15)' : 'rgba(15,23,42,0.5)',
                    border: `1px solid ${checks[c.key] ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!checks[c.key]}
                    onChange={() => toggleCheck(c.key)}
                    className="accent-green-500 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-xs">{c.icon}</span>
                  <span className="text-xs text-slate-300 leading-tight">{c.label}</span>
                </label>
              ))}
            </div>
            <textarea
              rows={2}
              placeholder="Detalle adicional… ej. 'Necesito MATLAB R2024 instalado'"
              value={notaReq}
              onChange={e => setNotaReq(e.target.value)}
              className="w-full input-dark text-sm resize-none px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ minHeight: '56px' }}
            />

            {/* Toggle instalador — solo cuando Software específico está marcado */}
            {checks.software && (
              <label className="flex items-center gap-3 cursor-pointer rounded-xl px-4 py-3 transition-colors select-none"
                style={{ background: tieneInstalador ? 'rgba(234,179,8,0.12)' : 'rgba(15,23,42,0.5)', border: `1px solid ${tieneInstalador ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
                <input type="checkbox" checked={tieneInstalador} onChange={() => setTieneInstalador(v => !v)}
                  className="accent-yellow-400 w-4 h-4 shrink-0" />
                <div>
                  <p className="text-sm text-slate-200 font-medium">💾 Tengo el instalador disponible</p>
                  <p className="text-xs text-slate-500 leading-tight mt-0.5">Puedo compartirlo con el administrador del laboratorio</p>
                </div>
              </label>
            )}

            {/* Aviso urgencia */}
            {hayReqs && (
              <p className="text-xs text-amber-400/80 flex items-center gap-1.5 px-1">
                <span>⏰</span> Si la clase es en menos de 3 días hábiles, el sistema marcará la solicitud como <strong>urgente</strong>.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-semibold">
              {saving ? 'Reservando…' : '✓ Reservar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Mi reservación + Iniciar sesión ───────────────────────────────────

function ModalMiReservacion({ slot, sesionActiva, onClose, onCancelada, onSesionIniciada }) {
  const navigate = useNavigate();
  const r = slot.reservacion;
  const grupo = slot._grupo; // info de períodos consecutivos si aplica
  const [cancelando, setCancelando]   = useState(false);
  const [confirmar, setConfirmar]     = useState(false);
  const [iniciando, setIniciando]     = useState(false);
  // Duración máxima = tiempo exacto del slot reservado (no se puede pasar de eso)
  const slotDurMin  = toMin(slot.hora_fin) - toMin(slot.hora_inicio);
  const durDefault  = grupo ? grupo.duracionMin : slotDurMin;
  const [duracion, setDuracion]       = useState(durDefault);
  const [error, setError]             = useState('');

  const handleCancelar = async () => {
    setCancelando(true);
    try {
      await api.delete(`/horarios/reservaciones/${r.id}`);
      onCancelada(); onClose();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al cancelar');
    } finally { setCancelando(false); }
  };

  const handleIniciarSesion = async () => {
    setIniciando(true); setError('');
    try {
      const { data } = await api.post('/sesiones', {
        laboratorio_id:   r.laboratorio_id,
        materia:          r.materia,
        grupo:            r.grupo,
        reservacion_id:   r.id,
        fin_estimado_min: duracion,
      });
      onSesionIniciada(data);
      navigate(`/docente/sesion/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al iniciar sesión');
      setIniciando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm shadow-2xl">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">Mi reservación</h2>
            <p className="text-sm text-slate-400">{DIAS_LABEL[slot.dia_semana]} · {slot.hora_inicio} – {slot.hora_fin}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Info de la reservación */}
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 space-y-1.5 text-sm">
            <p><span className="text-slate-400">Materia:</span> <span className="font-semibold text-white">{r.materia}</span></p>
            <p><span className="text-slate-400">Grupo:</span> <span className="text-gray-200">{r.grupo}</span></p>
            <p><span className="text-slate-400">Laboratorio:</span> <span className="text-gray-200">{r.laboratorio_nombre}</span></p>

            {/* Períodos consecutivos detectados */}
            {grupo && grupo.total > 1 && (
              <div className="mt-2 pt-2 border-t border-blue-700/50">
                <p className="text-blue-300 text-xs font-medium mb-1.5">
                  📚 Clase de {grupo.total} períodos consecutivos
                </p>
                <div className="flex items-center gap-1.5 text-xs text-gray-300">
                  <span className="font-mono bg-blue-800/60 px-1.5 py-0.5 rounded">{slot.hora_inicio}</span>
                  <span className="text-slate-500">→</span>
                  <span className="font-mono bg-blue-800/60 px-1.5 py-0.5 rounded">{grupo.horaFinGrupo}</span>
                  <span className="text-slate-500 ml-1">({grupo.duracionMin} min en total)</span>
                </div>
                <p className="text-slate-500 text-xs mt-1">
                  Se abrirá una sola sesión que cubre todos los períodos
                </p>
              </div>
            )}

            {slot.solicitudes_n > 0 && (
              <div className="mt-2 pt-2 border-t border-blue-700/50">
                <p className="text-amber-400 flex items-center gap-1 text-xs font-medium">
                  ⚠️ {slot.solicitudes_n} docente{slot.solicitudes_n > 1 ? 's solicitan' : ' solicita'} este horario
                </p>
              </div>
            )}
          </div>

          {/* Requerimientos registrados (nuevo modelo) */}
          {r?.requerimiento && <RequerimientoStatusPanel req={r.requerimiento} />}

          {/* Sesión activa en otro lado */}
          {sesionActiva && sesionActiva.reservacion_id !== r.id && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3 text-sm">
              <p className="text-amber-400 font-medium">⚠️ Ya tienes una sesión activa</p>
              <p className="text-slate-400 text-xs mt-0.5">{sesionActiva.materia} — {sesionActiva.laboratorio_nombre}</p>
              <button onClick={() => navigate(`/docente/sesion/${sesionActiva.id}`)}
                className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-white py-1.5 rounded-lg text-xs font-semibold">
                Ir a sesión activa →
              </button>
            </div>
          )}

          {/* Iniciar sesión */}
          {!sesionActiva && (
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400">Duración de la sesión</label>
                  <span className="text-xs text-slate-600">
                    slot reservado: <span className="text-blue-400 font-mono">{slot.hora_inicio}–{slot.hora_fin}</span>
                    {' '}({slotDurMin} min)
                  </span>
                </div>
                {grupo && grupo.total > 1 ? (
                  // Duración calculada automáticamente por períodos consecutivos
                  <div className="w-full bg-white/5 border border-gray-600 rounded-xl px-3 py-2 text-sm flex items-center justify-between">
                    <span className="text-gray-300">{grupo.duracionMin} min</span>
                    <span className="text-xs text-blue-400">calculado automáticamente</span>
                  </div>
                ) : (
                  <>
                    <SelectDark
                      value={duracion}
                      onChange={v => setDuracion(Number(v))}
                      options={opcionesDuracion(slotDurMin).map(m => ({
                        value: m,
                        label: `${fmtMin(m)}${m === slotDurMin ? ' ← tiempo completo' : ''}`,
                      }))}
                    />
                    {duracion < slotDurMin && (
                      <p className="text-xs text-amber-400/80 mt-1 flex items-center gap-1">
                        <span>⚠</span> Terminarás {slotDurMin - duracion} min antes de que venza tu reservación
                      </p>
                    )}
                  </>
                )}
              </div>
              {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
              <button onClick={handleIniciarSesion} disabled={iniciando}
                className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all">
                {iniciando
                  ? <><span className="animate-spin">⚙️</span> Iniciando…</>
                  : <><span className="text-lg">▶</span> Iniciar sesión de clase</>}
              </button>
            </div>
          )}

          {/* Liberar / cancelar */}
          <div className="pt-1 border-t border-white/5">
            {!confirmar ? (
              <button onClick={() => setConfirmar(true)}
                className="w-full border border-red-800 text-red-400 py-2 rounded-lg hover:bg-red-900/20 text-sm transition">
                🗑 Liberar este horario
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-400 text-center">¿Confirmar liberación?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmar(false)}
                    className="flex-1 bg-gray-700 text-gray-300 py-2 rounded-lg text-sm">No</button>
                  <button onClick={handleCancelar} disabled={cancelando}
                    className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-semibold">
                    {cancelando ? 'Liberando…' : 'Sí, liberar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={onClose}
            className="w-full border border-gray-700 text-slate-500 py-2 rounded-lg text-sm hover:bg-white/4">
            Cerrar
          </button>
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
  const [error, setError]   = useState('');

  const seleccionarMateria = (m) => {
    setMateriaQuery(m.nombre || '');
    setForm(f => ({ ...f, materia: m.nombre || '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.materia.trim()) { setError('Escribe o selecciona una materia.'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/horarios/reservaciones/${r.id}/solicitar`, form);
      onSolicitado(); onClose();
    } catch (err) {
      setError(formatApiError(err, 'Error al enviar solicitud'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-2xl">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">Solicitar horario</h2>
            <p className="text-sm text-slate-400">{DIAS_LABEL[slot.dia_semana]} · {slot.hora_inicio} – {slot.hora_fin}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-3 text-sm">
            <p className="text-slate-400 mb-0.5">Actualmente de:</p>
            <p className="font-semibold text-white">{r.docente_nombre}</p>
            <p className="text-slate-400 text-xs">{r.materia} · {r.grupo}</p>
          </div>
          <p className="text-sm text-slate-400">El docente titular recibirá una notificación y podrá cederte el espacio directamente, sin intervención del administrador.</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Tu materia *
                <span className="text-slate-500 font-normal text-xs ml-1">(escribe para buscar)</span>
              </label>
              <div className="[&_input]:bg-gray-700 [&_input]:text-white [&_input]:border-gray-600
                              [&_input:focus]:ring-orange-500 [&_ul]:bg-gray-800 [&_ul]:border-gray-600
                              [&_li]:text-gray-200 [&_li:hover]:bg-gray-700 [&_div]:text-slate-400">
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
                        <p className="text-xs text-slate-400">{m.cuatrimestre_oficial}º cuatrimestre</p>
                      )}
                    </div>
                  )}
                />
              </div>
              <input type="text" required className="sr-only" value={form.materia} readOnly tabIndex={-1} />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Tu grupo *</label>
              <input required type="text" placeholder="Ej. TIeID-5to. A"
                value={form.grupo} onChange={e => setForm({...form, grupo: e.target.value})}
                className="w-full input-dark text-white  px-3 py-2 text-sm  focus:outline-none focus:ring-2 focus:ring-orange-500"/>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Motivo (opcional)</label>
              <textarea rows={2} placeholder="¿Por qué necesitas este horario?"
                value={form.motivo} onChange={e => setForm({...form, motivo: e.target.value})}
                className="w-full input-dark text-white  px-3 py-2 text-sm  focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"/>
            </div>
            {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-semibold">
                {saving ? 'Enviando…' : '📩 Enviar solicitud'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Mi solicitud pendiente ────────────────────────────────────────────

function ModalYoSolicite({ slot, onClose, onRetirado }) {
  const [retirando, setRetirando] = useState(false);
  const r = slot.reservacion;

  const handleRetirar = async () => {
    setRetirando(true);
    try {
      await api.delete(`/horarios/reservaciones/${r.id}/solicitar`);
      onRetirado(); onClose();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al retirar');
    } finally { setRetirando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">Mi solicitud pendiente</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="bg-orange-900/30 border border-orange-700/50 rounded-xl p-4 text-sm space-y-1 mb-4">
          <p className="font-semibold text-orange-300">En espera de resolución</p>
          <p className="text-slate-400">{DIAS_LABEL[slot.dia_semana]} · {slot.hora_inicio} – {slot.hora_fin}</p>
          <p className="text-slate-500 text-xs mt-1">Actualmente de: {r.docente_nombre} ({r.materia})</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 bg-gray-700 text-gray-300 py-2 rounded-lg text-sm">Cerrar</button>
          <button onClick={handleRetirar} disabled={retirando}
            className="flex-1 border border-red-700 text-red-400 py-2 rounded-lg hover:bg-red-900/20 text-sm font-medium">
            {retirando ? 'Retirando…' : 'Retirar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Sesión sin reservación (ad-hoc) ───────────────────────────────────

const DURACIONES_DOCENTE = [50, 100, 150, 200];

function ModalSesionLibre({ labs, onClose, onSesionIniciada }) {
  const navigate  = useNavigate();
  const [labId,    setLabId]    = useState(labs[0]?.id ?? '');
  const [materia,  setMateria]  = useState('');
  const [grupo,    setGrupo]    = useState('');
  const [duracion, setDuracion] = useState(100);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [sesionActiva, setSesionActiva] = useState(null);

  useEffect(() => {
    if (!labId) return;
    api.get(`/sesiones?estado=ABIERTA&laboratorio_id=${labId}`)
      .then(res => setSesionActiva(res.data.length > 0 ? res.data[0] : null))
      .catch(() => setSesionActiva(null));
  }, [labId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/sesiones', {
        laboratorio_id:   Number(labId),
        materia:          materia.trim(),
        grupo:            grupo.trim(),
        fin_estimado_min: duracion,
      });
      onSesionIniciada(data);
      navigate(`/docente/sesion/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al abrir sesión');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-glass animate-fadeUp">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{background:'linear-gradient(135deg,#10b981,#059669)'}}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-white">Sesión sin reservación</h3>
              <p className="text-xs text-slate-400">Para clases o usos no programados</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Aviso sesión activa */}
          {sesionActiva && (
            <div className="bg-amber-950/40 border border-amber-700/40 rounded-xl p-3 text-sm">
              <p className="text-amber-400 font-medium">⚠️ Ya hay una sesión abierta en este laboratorio</p>
              <p className="text-slate-400 text-xs mt-0.5">{sesionActiva.materia} · {sesionActiva.grupo}</p>
              <button type="button"
                onClick={() => { onClose(); navigate(`/docente/sesion/${sesionActiva.id}`); }}
                className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-white py-1.5 rounded-lg text-xs font-semibold transition-colors">
                Ir a la sesión activa →
              </button>
            </div>
          )}

          {/* Laboratorio */}
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Laboratorio *</label>
            <SelectDark
              value={labId}
              onChange={setLabId}
              options={labs.map(l => ({ value: l.id, label: l.nombre }))}
            />
          </div>

          {/* Materia + Grupo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Materia *</label>
              <input value={materia} onChange={e => setMateria(e.target.value)} required
                placeholder="Ej: Programación"
                className="w-full input-dark text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Grupo *</label>
              <input value={grupo} onChange={e => setGrupo(e.target.value)} required
                placeholder="Ej: IDGS-01A"
                className="w-full input-dark text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
            </div>
          </div>

          {/* Duración — pastillas */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Duración estimada</label>
            <div className="grid grid-cols-4 gap-2">
              {DURACIONES_DOCENTE.map(m => (
                <button key={m} type="button" onClick={() => setDuracion(m)}
                  className={`py-2.5 rounded-xl border text-xs font-medium transition-all
                    ${duracion === m
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-glow-em'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'}`}>
                  {m} min
                </button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="glass-sm p-3 text-xs text-slate-400 space-y-1">
            <p>• Los alumnos quedan registrados al asignarles una PC en el mapa</p>
            <p>• Al cerrar la sesión se libera el registro de todos los equipos</p>
            <p>• La sesión aparece en el historial del laboratorio</p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving || !labId || !!sesionActiva}
              className="btn-emerald flex-1">
              {saving ? 'Abriendo…' : '▶ Abrir sesión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── GridSemanal ──────────────────────────────────────────────────────────────

// Detecta grupos de slots consecutivos con la misma materia+grupo por día
// Retorna un mapa: "dia-hora_inicio" → { pos: 1|2|..., total: N, esInicio: bool, esFin: bool, horaFinGrupo: "HH:MM" }
function detectarGruposConsecutivos(slots) {
  const grupos = {};
  // Agrupar por día
  const porDia = {};
  slots.forEach(s => {
    if (s.estado_vista !== 'MIO') return;
    if (!porDia[s.dia_semana]) porDia[s.dia_semana] = [];
    porDia[s.dia_semana].push(s);
  });

  Object.values(porDia).forEach(diaSlots => {
    const ordenados = [...diaSlots].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    let i = 0;
    while (i < ordenados.length) {
      const grupo = [ordenados[i]];
      // Encadenar slots consecutivos de la misma materia+grupo
      while (i + grupo.length < ordenados.length) {
        const actual  = grupo[grupo.length - 1];
        const sig     = ordenados[i + grupo.length];
        const mismaClase = actual.reservacion?.materia === sig.reservacion?.materia &&
                           actual.reservacion?.grupo   === sig.reservacion?.grupo;
        const consecutivo = actual.hora_fin === sig.hora_inicio;
        if (mismaClase && consecutivo) grupo.push(sig);
        else break;
      }
      const horaFinGrupo = grupo[grupo.length - 1].hora_fin;
      grupo.forEach((s, pos) => {
        grupos[`${s.dia_semana}-${s.hora_inicio}`] = {
          pos: pos + 1,
          total: grupo.length,
          esInicio: pos === 0,
          esFin: pos === grupo.length - 1,
          horaFinGrupo,
          duracionMin: grupo.reduce((acc, sl) => {
            const [ih, im] = sl.hora_inicio.split(':').map(Number);
            const [fh, fm] = sl.hora_fin.split(':').map(Number);
            return acc + (fh * 60 + fm) - (ih * 60 + im);
          }, 0),
        };
      });
      i += grupo.length;
    }
  });
  return grupos;
}

// ─── Gradientes para celdas del docente ───────────────────────────────────────
const GRAD_DOC = {
  LIBRE:       'linear-gradient(135deg, rgba(16,185,129,0.13) 0%, rgba(5,150,105,0.07) 100%)',
  MIO:         'linear-gradient(135deg, rgba(79,70,229,0.55) 0%, rgba(99,102,241,0.35) 100%)',
  OCUPADO:     'linear-gradient(135deg, rgba(30,64,175,0.35) 0%, rgba(37,99,235,0.18) 100%)',
  EN_DISPUTA:  'linear-gradient(135deg, rgba(180,83,9,0.45)  0%, rgba(217,119,6,0.25) 100%)',
  YO_SOLICITE: 'linear-gradient(135deg, rgba(194,65,12,0.40) 0%, rgba(234,88,12,0.20) 100%)',
  BLOQUEADO:   'linear-gradient(135deg, rgba(88,28,135,0.30) 0%, rgba(109,40,217,0.15) 100%)',
};

function GridSemanal({ slots, onSlotClick }) {
  const horas = [...new Set(slots.map(s => s.hora_inicio))].sort();
  const dias  = [...new Set(slots.map(s => s.dia_semana))].sort();
  const idx   = {};
  const horaFinMap = {};
  slots.forEach(s => {
    idx[`${s.dia_semana}-${s.hora_inicio}`] = s;
    horaFinMap[s.hora_inicio] = s.hora_fin;
  });

  const gruposConsecutivos = detectarGruposConsecutivos(slots);

  const renderCell = (dia, hora) => {
    const slot = idx[`${dia}-${hora}`];
    if (!slot) {
      return (
        <div style={{
          height: '100%', minHeight: '40px',
          background: 'rgba(255,255,255,0.015)',
          border: '1px dashed rgba(255,255,255,0.06)',
          borderRadius: '8px',
        }} />
      );
    }

    const clave = `${dia}-${hora}`;
    const grupo = gruposConsecutivos[clave];
    const esSegundoEnGrupo = grupo && !grupo.esInicio;
    const grad = GRAD_DOC[slot.estado_vista] || GRAD_DOC.LIBRE;

    // Borde color por estado
    const borderColor = {
      LIBRE:       'rgba(16,185,129,0.30)',
      MIO:         'rgba(99,102,241,0.55)',
      OCUPADO:     'rgba(37,99,235,0.30)',
      EN_DISPUTA:  'rgba(217,119,6,0.45)',
      YO_SOLICITE: 'rgba(234,88,12,0.40)',
      BLOQUEADO:   'rgba(109,40,217,0.30)',
    }[slot.estado_vista] || 'rgba(255,255,255,0.08)';

    // Color de texto principal por estado
    const txtColor = {
      LIBRE:       '#6ee7b7',
      MIO:         '#e0e7ff',
      OCUPADO:     '#93c5fd',
      EN_DISPUTA:  '#fcd34d',
      YO_SOLICITE: '#fdba74',
      BLOQUEADO:   '#c4b5fd',
    }[slot.estado_vista] || '#94a3b8';

    const isClickable = ['LIBRE','MIO','OCUPADO','EN_DISPUTA'].includes(slot.estado_vista);

    return (
      <div style={{ height: '100%', minHeight: '40px' }}>
        {/* Conector visual entre slots consecutivos del mismo grupo */}
        {esSegundoEnGrupo && (
          <div style={{
            display: 'flex', justifyContent: 'center',
            height: '6px', marginBottom: '-2px',
          }}>
            <div style={{ width: '2px', height: '100%', background: 'rgba(99,102,241,0.45)' }} />
          </div>
        )}
        <button
          onClick={() => isClickable && onSlotClick({ ...slot, _grupo: grupo })}
          style={{
            width: '100%', height: esSegundoEnGrupo ? 'calc(100% - 4px)' : '100%',
            background: grad,
            border: `1px solid ${borderColor}`,
            borderRadius: '8px',
            padding: '6px 8px',
            textAlign: 'left',
            cursor: isClickable ? 'pointer' : 'default',
            transition: 'filter 0.15s, box-shadow 0.15s',
            boxShadow: slot.estado_vista === 'MIO' ? '0 2px 10px rgba(79,70,229,0.25)' : 'none',
            outline: 'none',
          }}
          onMouseEnter={e => { if (isClickable) e.currentTarget.style.filter = 'brightness(1.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
        >
          {slot.estado_vista === 'LIBRE' ? (
            <span style={{ fontSize: '11px', fontWeight: 600, color: txtColor }}>+ Disponible</span>
          ) : slot.estado_vista === 'BLOQUEADO' ? (
            <>
              <p style={{ fontSize: '11px', fontWeight: 700, color: txtColor, lineHeight: 1.3 }}>🚫 No disponible</p>
              {slot.bloqueo?.motivo && (
                <p style={{ fontSize: '10px', color: 'rgba(196,181,253,0.7)', lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: '2px' }}>
                  {slot.bloqueo.motivo}
                </p>
              )}
            </>
          ) : (
            <>
              {/* ★ Mi reserva — solo para MIO */}
              {slot.estado_vista === 'MIO' && (
                <p style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(224,231,255,0.6)', lineHeight: 1.2, marginBottom: '2px', letterSpacing: '0.03em' }}>
                  ★ Mi reserva
                </p>
              )}

              {/* Nombre de la materia */}
              <p style={{ fontSize: '11px', fontWeight: 700, color: txtColor, lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {slot.reservacion?.materia || '—'}
              </p>

              {/* Grupo */}
              {slot.reservacion?.grupo && (
                <p style={{ fontSize: '10px', color: `${txtColor}99`, lineHeight: 1.2, marginTop: '1px' }}>
                  {slot.reservacion.grupo}
                </p>
              )}

              {/* Badges de acción */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '5px' }}>
                {slot.estado_vista === 'MIO' && slot.solicitudes_n > 0 && (
                  <span style={{ fontSize: '10px', background: 'rgba(180,83,9,0.5)', color: '#fcd34d', borderRadius: '999px', padding: '1px 6px', fontWeight: 600 }}>
                    ⚠️ {slot.solicitudes_n}
                  </span>
                )}
                {slot.estado_vista === 'MIO' && grupo?.total > 1 && (
                  <span style={{ fontSize: '10px', background: 'rgba(30,58,138,0.7)', color: '#bfdbfe', borderRadius: '999px', padding: '1px 6px', fontWeight: 700 }}>
                    P{grupo.pos}/{grupo.total}
                  </span>
                )}
                {slot.estado_vista === 'MIO' && (grupo ? grupo.esInicio : true) && (
                  <span style={{ fontSize: '10px', background: 'rgba(6,78,59,0.7)', color: '#6ee7b7', borderRadius: '999px', padding: '1px 6px', fontWeight: 700 }}>
                    ▶ Iniciar
                  </span>
                )}
                {slot.estado_vista === 'MIO' && grupo && !grupo.esInicio && (
                  <span style={{ fontSize: '10px', color: 'rgba(147,197,253,0.6)', padding: '1px 4px' }}>
                    ↑ continúa
                  </span>
                )}
                {slot.estado_vista === 'OCUPADO' && (
                  <span style={{ fontSize: '10px', color: `${txtColor}99`, padding: '1px 2px' }}>Solicitar</span>
                )}
                {slot.estado_vista === 'YO_SOLICITE' && (
                  <span style={{ fontSize: '10px', background: 'rgba(124,45,18,0.6)', color: '#fdba74', borderRadius: '999px', padding: '1px 6px', fontWeight: 600 }}>
                    Pendiente
                  </span>
                )}
              </div>
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <div style={{
      borderRadius: '16px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)',
      background: 'rgb(2 6 23)',
      backdropFilter: 'blur(12px)',
    }}>
      <TimeGrid
        dias={dias}
        horas={horas}
        horaFinMap={horaFinMap}
        renderCell={renderCell}
        showBreak={true}
      />
    </div>
  );
}

// ─── Vista móvil: un día a la vez con tabs ────────────────────────────────────

function GridMobile({ slots, onSlotClick }) {
  const dias = [...new Set(slots.map(s => s.dia_semana))].sort();
  const gruposConsecutivos = detectarGruposConsecutivos(slots);

  // Día activo: hoy si tiene slots, si no el primero disponible
  const hoy = new Date().getDay(); // 0=Dom,1=Lun...
  const hoyIdx = hoy === 0 ? 5 : hoy - 1; // convertir a 0=Lun
  const [diaActivo, setDiaActivo] = useState(
    dias.includes(hoyIdx) ? hoyIdx : dias[0] ?? 0
  );

  const slotsDia = slots
    .filter(s => s.dia_semana === diaActivo)
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

  const COLOR = {
    LIBRE:       { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.30)',  txt: '#6ee7b7' },
    MIO:         { bg: 'rgba(79,70,229,0.40)',    border: 'rgba(99,102,241,0.60)',  txt: '#e0e7ff' },
    OCUPADO:     { bg: 'rgba(30,64,175,0.30)',    border: 'rgba(37,99,235,0.35)',   txt: '#93c5fd' },
    EN_DISPUTA:  { bg: 'rgba(180,83,9,0.35)',     border: 'rgba(217,119,6,0.50)',   txt: '#fcd34d' },
    YO_SOLICITE: { bg: 'rgba(194,65,12,0.30)',    border: 'rgba(234,88,12,0.45)',   txt: '#fdba74' },
    BLOQUEADO:   { bg: 'rgba(88,28,135,0.25)',    border: 'rgba(109,40,217,0.35)',  txt: '#c4b5fd' },
  };

  return (
    <div>
      {/* ── Tabs de días ── */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '12px',
        overflowX: 'auto', paddingBottom: '4px',
      }}>
        {dias.map(d => {
          const tieneMio = slots.some(s => s.dia_semana === d && s.estado_vista === 'MIO');
          const activo   = d === diaActivo;
          return (
            <button key={d} onClick={() => setDiaActivo(d)} style={{
              flexShrink: 0,
              padding: '7px 14px',
              borderRadius: '10px',
              border: activo ? '1px solid rgba(99,102,241,0.7)' : '1px solid rgba(255,255,255,0.08)',
              background: activo ? 'rgba(79,70,229,0.40)' : 'rgba(255,255,255,0.04)',
              color: activo ? '#e0e7ff' : '#94a3b8',
              fontWeight: activo ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              position: 'relative',
              fontFamily: 'inherit',
            }}>
              {DIAS_LABEL[d]}
              {tieneMio && (
                <span style={{
                  position: 'absolute', top: '4px', right: '4px',
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: '#6366f1',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Cards del día ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {slotsDia.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
            <p>Sin horarios este día</p>
          </div>
        ) : slotsDia.map(slot => {
          const c     = COLOR[slot.estado_vista] || COLOR.LIBRE;
          const clave = `${slot.dia_semana}-${slot.hora_inicio}`;
          const grupo = gruposConsecutivos[clave];
          const isClickable = ['LIBRE','MIO','OCUPADO','EN_DISPUTA'].includes(slot.estado_vista);

          return (
            <button key={clave} onClick={() => isClickable && onSlotClick({ ...slot, _grupo: grupo })}
              style={{
                width: '100%', textAlign: 'left',
                background: c.bg, border: `1px solid ${c.border}`,
                borderRadius: '14px', padding: '14px 16px',
                cursor: isClickable ? 'pointer' : 'default',
                boxShadow: slot.estado_vista === 'MIO' ? '0 4px 16px rgba(79,70,229,0.25)' : 'none',
                fontFamily: 'inherit',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                {/* Hora */}
                <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>
                  {slot.hora_inicio} – {slot.hora_fin}
                </span>
                {/* Badges */}
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  {slot.estado_vista === 'MIO' && grupo?.total > 1 && (
                    <span style={{ fontSize: '11px', background: 'rgba(30,58,138,0.8)', color: '#bfdbfe', borderRadius: '999px', padding: '2px 8px', fontWeight: 700 }}>
                      P{grupo.pos}/{grupo.total}
                    </span>
                  )}
                  {slot.estado_vista === 'MIO' && slot.solicitudes_n > 0 && (
                    <span style={{ fontSize: '11px', background: 'rgba(180,83,9,0.6)', color: '#fcd34d', borderRadius: '999px', padding: '2px 8px' }}>
                      ⚠️ {slot.solicitudes_n}
                    </span>
                  )}
                  {slot.estado_vista === 'MIO' && (grupo ? grupo.esInicio : true) && (
                    <span style={{ fontSize: '11px', background: 'rgba(6,78,59,0.8)', color: '#6ee7b7', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                      ▶ Iniciar
                    </span>
                  )}
                  {slot.estado_vista === 'MIO' && grupo && !grupo.esInicio && (
                    <span style={{ fontSize: '11px', color: 'rgba(147,197,253,0.7)' }}>↑ continúa</span>
                  )}
                  {slot.estado_vista === 'LIBRE' && (
                    <span style={{ fontSize: '11px', background: 'rgba(6,78,59,0.6)', color: '#6ee7b7', borderRadius: '999px', padding: '2px 10px' }}>
                      + Reservar
                    </span>
                  )}
                  {slot.estado_vista === 'OCUPADO' && (
                    <span style={{ fontSize: '11px', color: '#93c5fd', opacity: 0.8 }}>Solicitar</span>
                  )}
                  {slot.estado_vista === 'YO_SOLICITE' && (
                    <span style={{ fontSize: '11px', background: 'rgba(124,45,18,0.7)', color: '#fdba74', borderRadius: '999px', padding: '2px 8px' }}>Pendiente</span>
                  )}
                  {slot.estado_vista === 'BLOQUEADO' && (
                    <span style={{ fontSize: '11px', color: '#c4b5fd', opacity: 0.7 }}>🚫 Bloqueado</span>
                  )}
                </div>
              </div>

              {/* Materia */}
              {slot.estado_vista === 'MIO' && (
                <p style={{ margin: 0, fontSize: '10px', color: 'rgba(224,231,255,0.55)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '2px' }}>
                  ★ MI RESERVA
                </p>
              )}
              {slot.reservacion?.materia ? (
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: c.txt, lineHeight: 1.3 }}>
                  {slot.reservacion.materia}
                </p>
              ) : slot.estado_vista === 'LIBRE' ? (
                <p style={{ margin: 0, fontSize: '14px', color: '#6ee7b7', opacity: 0.8 }}>Disponible para reservar</p>
              ) : slot.estado_vista === 'BLOQUEADO' ? (
                <p style={{ margin: 0, fontSize: '14px', color: '#c4b5fd', opacity: 0.8 }}>
                  {slot.bloqueo?.motivo || 'No disponible'}
                </p>
              ) : null}

              {/* Grupo */}
              {slot.reservacion?.grupo && (
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: `${c.txt}99` }}>
                  {slot.reservacion.grupo}
                </p>
              )}

              {/* Duración total si hay grupo consecutivo */}
              {grupo && grupo.total > 1 && grupo.esInicio && (
                <p style={{ margin: '5px 0 0', fontSize: '11px', color: 'rgba(147,197,253,0.65)' }}>
                  🕐 Clase de {grupo.total} períodos · hasta {grupo.horaFinGrupo} ({grupo.duracionMin} min)
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Hook para detectar móvil ─────────────────────────────────────────────────

function useEsMobil() {
  const [esMobil, setEsMobil] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setEsMobil(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return esMobil;
}

// ─── Leyenda ──────────────────────────────────────────────────────────────────

function Leyenda() {
  const items = [
    { color: '#10b981', label: 'Disponible' },
    { color: '#6366f1', label: 'Mi reserva' },
    { color: '#3b82f6', label: 'Ocupado' },
    { color: '#f59e0b', label: 'En disputa' },
    { color: '#f97316', label: 'Solicité' },
  ];
  return (
    <div className="flex flex-wrap gap-3 items-center justify-end">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, display: 'inline-block', flexShrink: 0 }} />
          <span className="text-xs text-slate-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SesionClase() {
  const navigate    = useNavigate();
  const { usuario } = useAuth();
  const esMobil     = useEsMobil();

  const [laboratorios, setLaboratorios]       = useState([]);
  const [labId, setLabId]                     = useState('');
  const [cuatrimestre, setCuatrimestre]       = useState(getCuatrimestreActual);
  const [slots, setSlots]                     = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [sesionActiva, setSesionActiva]       = useState(null);
  const [modalSlot, setModalSlot]             = useState(null);
  const [modalLibre, setModalLibre]           = useState(false);
  const [modalPwd, setModalPwd]               = useState(false);
  const [solicRecibidas, setSolicRecibidas]   = useState([]);
  const [accionando, setAccionando]           = useState(null); // reservacion_id en proceso

  // Cargar laboratorios
  useEffect(() => {
    api.get('/laboratorios?solo_activos=true').then(res => {
      setLaboratorios(res.data);
      if (res.data.length > 0) setLabId(res.data[0].id);
    }).catch(() => {});
  }, []);

  // Verificar si hay sesión activa
  const cargarSesionActiva = useCallback(async () => {
    try {
      const { data } = await api.get('/sesiones/activas');
      setSesionActiva(data.length > 0 ? data[0] : null);
    } catch { setSesionActiva(null); }
  }, []);

  // Cargar grid de disponibilidad
  const cargarGrid = useCallback(async () => {
    if (!labId || !cuatrimestre) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/horarios/disponibilidad?laboratorio_id=${labId}&cuatrimestre=${cuatrimestre}`);
      setSlots(data.slots || []);
    } catch { setSlots([]); }
    finally { setLoading(false); }
  }, [labId, cuatrimestre]);

  // Cargar solicitudes pendientes recibidas (mis slots con petición de otro docente)
  const cargarSolicRecibidas = useCallback(async () => {
    try {
      const { data } = await api.get('/horarios/mis-solicitudes-recibidas');
      setSolicRecibidas(data || []);
    } catch { setSolicRecibidas([]); }
  }, []);

  useEffect(() => { cargarSesionActiva(); }, [cargarSesionActiva]);
  useEffect(() => { cargarGrid(); }, [cargarGrid]);
  useEffect(() => { cargarSolicRecibidas(); }, [cargarSolicRecibidas]);
  // Resetear scroll al cambiar de laboratorio (evita espacio vacío arriba con labs más cortos)
  useEffect(() => { window.scrollTo(0, 0); }, [labId]);

  const recargar = () => { cargarGrid(); cargarSesionActiva(); cargarSolicRecibidas(); };

  const handleCeder = async (reservacion_id) => {
    setAccionando(reservacion_id);
    try {
      await api.post(`/horarios/reservaciones/${reservacion_id}/ceder`);
      recargar();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al ceder el espacio');
    } finally { setAccionando(null); }
  };

  const handleRechazarSolicitud = async (reservacion_id) => {
    setAccionando(reservacion_id);
    try {
      await api.post(`/horarios/reservaciones/${reservacion_id}/rechazar-solicitud`);
      recargar();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al rechazar');
    } finally { setAccionando(null); }
  };

  const handleSlotClick = (slot) => {
    const tipo = slot.estado_vista;
    if (tipo === 'BLOQUEADO')        return; // no se puede interactuar
    if (tipo === 'LIBRE')            setModalSlot({ tipo: 'reservar',      slot });
    else if (tipo === 'MIO')         setModalSlot({ tipo: 'mi_reserva',    slot });
    else if (tipo === 'OCUPADO')     setModalSlot({ tipo: 'solicitar',     slot });
    else if (tipo === 'EN_DISPUTA')  setModalSlot({ tipo: 'en_disputa',    slot });
    else if (tipo === 'YO_SOLICITE') setModalSlot({ tipo: 'yo_solicite',   slot });
  };

  const cerrar = () => setModalSlot(null);

  return (
    <DocenteLayout onCambiarPwd={() => setModalPwd(true)}>

      {/* ── Panel: Solicitudes recibidas (otro docente quiere mi espacio) ──── */}
      {solicRecibidas.length > 0 && (
        <div className="mb-5 space-y-3">
          {solicRecibidas.map(s => (
            <div key={s.reservacion_id}
              className="rounded-xl border border-amber-600/50 p-4"
              style={{ background: 'rgba(120,53,15,0.35)' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-amber-300 font-semibold text-sm flex items-center gap-2">
                    📩 Solicitud de espacio
                    <span className="text-xs font-normal bg-amber-900/60 text-amber-400 px-2 py-0.5 rounded-full border border-amber-700/40">
                      {s.dia_nombre} · {s.hora_inicio}–{s.hora_fin}
                    </span>
                  </p>
                  <p className="text-white text-sm mt-1">
                    <span className="font-semibold">{s.solicitante_nombre}</span>
                    {' '}solicita tu horario de{' '}
                    <span className="text-slate-300">{s.mi_materia}</span>
                    {' '}para impartir{' '}
                    <span className="font-semibold text-amber-200">{s.materia_solicitada}</span>
                    {' '}(grupo {s.grupo_solicitado})
                  </p>
                  {s.motivo && (
                    <p className="text-slate-400 text-xs mt-1 italic">"{s.motivo}"</p>
                  )}
                  <p className="text-xs text-amber-900/80 mt-1">{s.laboratorio_nombre}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleRechazarSolicitud(s.reservacion_id)}
                    disabled={accionando === s.reservacion_id}
                    className="px-3 py-1.5 rounded-lg border border-red-700/60 text-red-400 text-xs font-medium hover:bg-red-900/30 transition-colors disabled:opacity-40">
                    {accionando === s.reservacion_id ? '…' : '✕ Rechazar'}
                  </button>
                  <button
                    onClick={() => handleCeder(s.reservacion_id)}
                    disabled={accionando === s.reservacion_id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors disabled:opacity-40">
                    {accionando === s.reservacion_id ? 'Procesando…' : '✓ Ceder espacio'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Banner sesión activa */}
      {sesionActiva && (
        <div className="mb-5 bg-green-900/40 border border-green-700/60 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-green-300 font-semibold">🟢 Sesión activa en progreso</p>
            <p className="text-gray-300 text-sm mt-0.5">
              {sesionActiva.materia} · {sesionActiva.grupo} · {sesionActiva.laboratorio_nombre}
            </p>
          </div>
          <button onClick={() => navigate(`/docente/sesion/${sesionActiva.id}`)}
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shrink-0 transition-colors">
            Continuar →
          </button>
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">
            {esMobil ? 'Mi horario' : 'Mi horario semanal'}
          </h1>
          {!esMobil && (
            <p className="text-sm text-slate-400 mt-1">
              Selecciona un turno para reservarlo, iniciarlo o solicitar uno ocupado.
            </p>
          )}
        </div>
        <button onClick={() => setModalLibre(true)}
          className="flex items-center gap-2 input-dark hover:bg-gray-600 text-white px-3 py-2 text-sm font-medium transition-colors shrink-0 rounded-lg">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          {esMobil ? 'Sin reserva' : 'Sesión sin reservación'}
        </button>
      </div>

      {/* Filtros */}
      <div className="glass p-3 mb-4 flex flex-wrap gap-2 items-center" style={{ position: 'relative', zIndex: 2 }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <label className="text-xs font-medium text-slate-400 shrink-0">Lab</label>
          <SelectDark
            value={labId}
            onChange={setLabId}
            className="flex-1 min-w-0"
            options={laboratorios.map(l => ({ value: l.id, label: l.nombre }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Cuatrimestre</span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background:'rgba(59,130,246,0.15)', color:'#93c5fd', border:'1px solid rgba(59,130,246,0.25)' }}>
            📅 {cuatrimestre}
          </span>
        </div>
        <button onClick={recargar}
          className="ml-auto text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Actualizar
        </button>
      </div>

      {/* Leyenda + Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      ) : slots.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <p>No hay horarios disponibles para este laboratorio y cuatrimestre.</p>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <Leyenda />
          </div>
          {esMobil
            ? <GridMobile slots={slots} onSlotClick={handleSlotClick} />
            : <GridSemanal slots={slots} onSlotClick={handleSlotClick} />
          }
        </>
      )}

      {/* Modales */}
      {modalSlot?.tipo === 'reservar' && (
        <ModalReservar slot={modalSlot.slot} cuatrimestre={cuatrimestre} laboratorio_id={labId}
          onClose={cerrar} onGuardado={recargar} />
      )}
      {modalSlot?.tipo === 'mi_reserva' && (
        <ModalMiReservacion slot={modalSlot.slot} sesionActiva={sesionActiva}
          onClose={cerrar} onCancelada={recargar} onSesionIniciada={recargar} />
      )}
      {modalSlot?.tipo === 'solicitar' && (
        <ModalSolicitar slot={modalSlot.slot}
          onClose={cerrar} onSolicitado={recargar} />
      )}
      {modalSlot?.tipo === 'yo_solicite' && (
        <ModalYoSolicite slot={modalSlot.slot}
          onClose={cerrar} onRetirado={recargar} />
      )}
      {modalSlot?.tipo === 'en_disputa' && (
        <ModalMiReservacion
          slot={modalSlot.slot}
          sesionActiva={sesionActiva}
          onClose={cerrar}
          onCancelada={recargar}
          onSesionIniciada={setSesionActiva}
        />
      )}
      {modalLibre && (
        <ModalSesionLibre
          labs={laboratorios}
          onClose={() => setModalLibre(false)}
          onSesionIniciada={setSesionActiva}
        />
      )}
      {modalPwd && <ModalCambiarPassword onClose={() => setModalPwd(false)} />}
    </DocenteLayout>
  );
}
