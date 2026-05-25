/**
 * ApartarEspacio.jsx
 * Flujo unificado para solicitar cualquier espacio institucional:
 *   1. Selector de tipo de espacio (tarjetas)
 *   2. Calendario semanal de disponibilidad
 *   3. Formulario de solicitud adaptativo según tipo
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import TimeGrid from '../../components/TimeGrid';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

// ─── Constantes ────────────────────────────────────────────────────────────────
const TIPO_LABEL = { AUDIOVISUAL: 'Sala Audiovisual', RECTORIA: 'Sala de Rectoría', OTRO: 'Otro' };
const TIPO_ICON  = { AUDIOVISUAL: '🎥', RECTORIA: '🏛️', OTRO: '🏢' };
const TIPO_DESC  = {
  AUDIOVISUAL: 'Proyector, audio, micrófono, presidium y más.',
  RECTORIA:    'Reuniones formales de la dirección y rectoría.',
  OTRO:        'Espacio institucional de uso general.',
};
const TIPO_GRAD  = {
  AUDIOVISUAL: 'from-blue-600/20 to-cyan-600/20 border-blue-500/30',
  RECTORIA:    'from-purple-600/20 to-violet-600/20 border-purple-500/30',
  OTRO:        'from-slate-600/20 to-slate-700/20 border-slate-500/30',
};

const ESTADO_COLOR = {
  PENDIENTE: 'bg-amber-500/30 text-amber-300 border-amber-500/40',
  APROBADA:  'bg-green-500/30 text-green-300 border-green-500/40',
  LIBRE:     'bg-white/5 text-slate-400 border-white/10',
};

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HORAS = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];

const REQS = [
  { key: 'PROYECTOR',      label: 'Proyector' },
  { key: 'AUDIO',          label: 'Audio' },
  { key: 'MICROFONO',      label: 'Micrófono' },
  { key: 'ACOMODO_SILLAS', label: 'Acomodo sillas' },
  { key: 'MANTELES',       label: 'Manteles' },
  { key: 'COFFEE_BREAK',   label: 'Coffee break' },
  { key: 'PRESIDIUM',      label: 'Mesa principal / Presidium' },
  { key: 'INTERNET',       label: 'Internet' },
  { key: 'OTRO',           label: 'Otro (especificar)' },
];

// ─── Utilidades de fecha ───────────────────────────────────────────────────────
function getLunes(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function fmtDate(date) {
  return date.toISOString().slice(0, 10);
}
function fmtDisplay(date) {
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}
function hm2min(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

// ─── Componente Calendarlo semanal ────────────────────────────────────────────
function CalendarioSemana({ espacio, semanaInicio, setSemanaInicio, onSeleccionar }) {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading]         = useState(false);

  const cargar = useCallback(async () => {
    if (!espacio) return;
    setLoading(true);
    try {
      const { data } = await api.get(
        `/espacios/institucionales/${espacio.id}/disponibilidad?fecha_inicio=${fmtDate(semanaInicio)}`
      );
      setSolicitudes(data.solicitudes || []);
    } catch { setSolicitudes([]); }
    finally { setLoading(false); }
  }, [espacio, semanaInicio]);

  useEffect(() => { cargar(); }, [cargar]);

  const semanaFin = addDays(semanaInicio, 5);
  const fechas = Array.from({ length: 6 }, (_, i) => addDays(semanaInicio, i));
  const dias = [0, 1, 2, 3, 4, 5];

  // Construir mapa: "YYYY-MM-DD HH" → solicitudes
  const mapa = {};
  for (const s of solicitudes) {
    const iniH = parseInt(s.hora_inicio.split(':')[0]);
    const finH = parseInt(s.hora_fin.split(':')[0]);
    for (let h = iniH; h < finH; h++) {
      const key = `${s.fecha}_${String(h).padStart(2,'0')}:00`;
      if (!mapa[key]) mapa[key] = [];
      mapa[key].push(s);
    }
  }

  const hIni = parseInt(espacio.hora_inicio_permitida?.split(':')[0] || 8);
  const hFin = parseInt(espacio.hora_fin_permitida?.split(':')[0] || 20);
  const horasPermitidas = HORAS
    .filter(h => parseInt(h) >= hIni && parseInt(h) < hFin)
    .map(h => `${h}:00`);
  const horaFinMap = {};
  horasPermitidas.forEach(hora => {
    horaFinMap[hora] = `${String(parseInt(hora.split(':')[0]) + 1).padStart(2, '0')}:00`;
  });

  const esPasado = (fecha, hora) => new Date(`${fmtDate(fecha)}T${hora}:00`) < new Date();

  const renderCell = (dia, hora) => {
    const fecha = fechas[dia];
    const fechaKey = fmtDate(fecha);
    const bloques = mapa[`${fechaKey}_${hora}`] || [];
    const aprobada = bloques.find(b => b.estado === 'APROBADA');
    const pendiente = bloques.find(b => b.estado === 'PENDIENTE');
    const miSolicitud = bloques.find(b => b.solicitante_id === usuario?.id);

    if (aprobada) {
      const esMia = aprobada.solicitante_id === usuario?.id;
      return (
        <div title={`${aprobada.solicitante_nombre}: ${aprobada.motivo}`}
          className={`h-full min-h-[56px] rounded-lg p-2 overflow-hidden border ${
            esMia ? 'bg-indigo-600/40 border-indigo-400/60' : 'bg-blue-900/35 border-blue-500/35'
          }`}>
          {esMia && <p className="text-[10px] font-bold text-indigo-200/80 uppercase tracking-wide">Mi solicitud</p>}
          <p className={`text-xs font-bold leading-tight truncate ${esMia ? 'text-indigo-100' : 'text-blue-200'}`}>
            {aprobada.motivo}
          </p>
          <p className={`text-[10px] mt-1 truncate ${esMia ? 'text-indigo-200/70' : 'text-blue-200/70'}`}>
            {aprobada.solicitante_nombre}
          </p>
        </div>
      );
    }

    if (pendiente) {
      const esMia = miSolicitud?.id === pendiente.id;
      return (
        <div title={`Pendiente: ${pendiente.solicitante_nombre}`}
          className={`h-full min-h-[56px] rounded-lg p-2 overflow-hidden border ${
            esMia ? 'bg-orange-600/30 border-orange-400/50' : 'bg-amber-600/25 border-amber-500/40'
          }`}>
          <p className={`text-xs font-bold leading-tight truncate ${esMia ? 'text-orange-200' : 'text-amber-200'}`}>
            {esMia ? 'Mi solicitud pendiente' : 'Pendiente'}
          </p>
          <p className={`text-[10px] mt-1 truncate ${esMia ? 'text-orange-200/70' : 'text-amber-200/70'}`}>
            {pendiente.motivo}
          </p>
        </div>
      );
    }

    if (esPasado(fecha, hora)) {
      return <div className="h-full min-h-[56px] rounded-lg border border-white/[0.04] bg-white/[0.015] opacity-40" />;
    }

    return (
      <button type="button" onClick={() => onSeleccionar(fechaKey, hora.slice(0, 2))}
        className="group h-full min-h-[56px] w-full rounded-lg border border-white/[0.07] bg-white/[0.03] flex items-center justify-center transition-all duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:shadow-[0_0_12px_rgba(59,130,246,0.15)]"
        title="Solicitar este horario">
        <svg className="w-4 h-4 text-slate-700 group-hover:text-blue-400 transition-colors"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Navegación semana */}
      <div className="flex items-center justify-between">
        <button onClick={() => setSemanaInicio(addDays(semanaInicio, -7))}
          className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="text-center">
          <p className="text-white font-semibold text-sm">
            {fmtDisplay(semanaInicio)} – {fmtDisplay(semanaFin)}
          </p>
          <p className="text-xs text-slate-400">Semana {semanaInicio.toLocaleDateString('es-MX', { year: 'numeric' })}</p>
        </div>
        <button onClick={() => setSemanaInicio(addDays(semanaInicio, 7))}
          className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 text-xs text-slate-400 justify-end">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/40 border border-green-500/50"/> Aprobado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/40 border border-amber-500/50"/> Pendiente</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/30 border border-blue-500/40"/> Libre (clic para solicitar)</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400 animate-pulse">Cargando disponibilidad…</div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-slate-950">
          <TimeGrid
            dias={dias}
            horas={horasPermitidas}
            horaFinMap={horaFinMap}
            renderCell={renderCell}
            showBreak={false}
          />
        </div>
      )}
    </div>
  );
}

// ─── Formulario solicitud ──────────────────────────────────────────────────────
function FormSolicitud({ espacio, fecha, horaPreset, onClose, onCreada }) {
  const { usuario } = useAuth();
  const { toast: showToast } = useToast();

  const [form, setForm] = useState({
    area_solicitante: '',
    hora_inicio: horaPreset ? `${horaPreset}:00` : espacio.hora_inicio_permitida,
    hora_fin:    horaPreset ? `${String(parseInt(horaPreset)+1).padStart(2,'0')}:00` : '10:00',
    motivo: '',
    numero_asistentes: '',
    observaciones: '',
    requerimientos: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleReq = (tipo) => {
    setForm(f => {
      const ya = f.requerimientos.find(r => r.tipo === tipo);
      return {
        ...f,
        requerimientos: ya
          ? f.requerimientos.filter(r => r.tipo !== tipo)
          : [...f.requerimientos, { tipo, descripcion: '', cantidad: 1, requerido: true }],
      };
    });
  };
  const setReqDesc = (tipo, desc) => {
    setForm(f => ({
      ...f,
      requerimientos: f.requerimientos.map(r => r.tipo === tipo ? { ...r, descripcion: desc } : r),
    }));
  };
  const tieneReq = (tipo) => form.requerimientos.some(r => r.tipo === tipo);

  const handleSubmit = async e => {
    e.preventDefault();
    if (hm2min(form.hora_fin) <= hm2min(form.hora_inicio)) {
      setError('La hora de fin debe ser mayor que la de inicio'); return;
    }
    setSaving(true); setError('');
    try {
      await api.post('/espacios/solicitudes', {
        espacio_id:        espacio.id,
        area_solicitante:  form.area_solicitante,
        fecha,
        hora_inicio:       form.hora_inicio,
        hora_fin:          form.hora_fin,
        motivo:            form.motivo,
        numero_asistentes: form.numero_asistentes ? Number(form.numero_asistentes) : null,
        observaciones:     form.observaciones,
        requerimientos:    form.requerimientos,
      });
      showToast('Solicitud enviada correctamente', 'success');
      onCreada();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al enviar solicitud');
    } finally { setSaving(false); }
  };

  const esAudiovisual = espacio.tipo === 'AUDIOVISUAL';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-glass animate-fadeUp overflow-y-auto max-h-[90vh]">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">📋 Solicitar espacio</h3>
            <p className="text-xs text-slate-400 mt-0.5">{espacio.nombre} · {fecha}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Solicitante (read-only) */}
          <div className="bg-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <div>
              <p className="text-sm font-medium text-white">{usuario?.nombre}</p>
              <p className="text-xs text-slate-400">{usuario?.email}</p>
            </div>
          </div>

          {/* Área solicitante */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Área / Departamento</label>
            <input className="input-dark" value={form.area_solicitante}
              onChange={e => set('area_solicitante', e.target.value)}
              placeholder="Ej: Coordinación Académica, Dirección…" />
          </div>

          {/* Horario */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Hora inicio *</label>
              <input type="time" className="input-dark" value={form.hora_inicio}
                onChange={e => set('hora_inicio', e.target.value)} required
                min={espacio.hora_inicio_permitida} max={espacio.hora_fin_permitida} />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Hora fin *</label>
              <input type="time" className="input-dark" value={form.hora_fin}
                onChange={e => set('hora_fin', e.target.value)} required
                min={espacio.hora_inicio_permitida} max={espacio.hora_fin_permitida} />
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              {esAudiovisual ? 'Evento / Motivo *' : 'Motivo de la reunión *'}
            </label>
            <input className="input-dark" value={form.motivo} required
              onChange={e => set('motivo', e.target.value)}
              placeholder={esAudiovisual ? 'Ej: Ceremonia de egresados, presentación...' : 'Ej: Reunión de directores de área…'} />
          </div>

          {/* Asistentes */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Número de asistentes {espacio.capacidad ? `(máx. ${espacio.capacidad})` : ''}
            </label>
            <input type="number" min="1" max={espacio.capacidad || 9999} className="input-dark"
              value={form.numero_asistentes} onChange={e => set('numero_asistentes', e.target.value)}
              placeholder="Ej: 25" />
          </div>

          {/* Requerimientos — Audiovisual */}
          {esAudiovisual && (
            <div>
              <label className="block text-sm text-slate-400 mb-2">Requerimientos</label>
              <div className="grid grid-cols-2 gap-2">
                {REQS.map(req => (
                  <label key={req.key} className={`flex items-center gap-2 cursor-pointer select-none
                    rounded-xl px-3 py-2 border transition-colors text-sm
                    ${tieneReq(req.key)
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                    <input type="checkbox" className="hidden" checked={tieneReq(req.key)}
                      onChange={() => toggleReq(req.key)} />
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors
                      ${tieneReq(req.key) ? 'bg-blue-500 border-blue-400' : 'border-slate-500'}`}>
                      {tieneReq(req.key) && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5"/></svg>}
                    </span>
                    {req.label}
                  </label>
                ))}
              </div>
              {/* Descripción para OTRO */}
              {tieneReq('OTRO') && (
                <input className="input-dark mt-2" placeholder="Describe el otro requerimiento…"
                  value={form.requerimientos.find(r => r.tipo === 'OTRO')?.descripcion || ''}
                  onChange={e => setReqDesc('OTRO', e.target.value)} />
              )}
            </div>
          )}

          {/* Requerimientos — Rectoría simplificado */}
          {!esAudiovisual && (
            <div className="grid grid-cols-2 gap-2">
              {['COFFEE_BREAK', 'PROYECTOR', 'AUDIO', 'INTERNET'].map(tipo => {
                const r = REQS.find(r => r.key === tipo);
                return (
                  <label key={tipo} className={`flex items-center gap-2 cursor-pointer select-none
                    rounded-xl px-3 py-2 border transition-colors text-sm
                    ${tieneReq(tipo)
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}>
                    <input type="checkbox" className="hidden" checked={tieneReq(tipo)}
                      onChange={() => toggleReq(tipo)} />
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                      ${tieneReq(tipo) ? 'bg-blue-500 border-blue-400' : 'border-slate-500'}`}>
                      {tieneReq(tipo) && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5"/></svg>}
                    </span>
                    {r?.label}
                  </label>
                );
              })}
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Observaciones adicionales</label>
            <textarea className="input-dark resize-none" rows={2} value={form.observaciones}
              onChange={e => set('observaciones', e.target.value)}
              placeholder="Cualquier detalle adicional que el responsable deba conocer…" />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-blue flex-1">
              {saving ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function ApartarEspacio() {
  const navigate = useNavigate();
  const [paso, setPaso]                 = useState(1); // 1=selector, 2=calendario, 3=form
  const [espacios, setEspacios]         = useState([]);
  const [espacioSel, setEspacioSel]     = useState(null);
  const [semanaInicio, setSemanaInicio] = useState(getLunes(new Date()));
  const [fechaSel, setFechaSel]         = useState(null);
  const [horaSel, setHoraSel]           = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    api.get('/espacios/institucionales?solo_activos=true')
      .then(r => setEspacios(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const seleccionarEspacio = (esp) => {
    setEspacioSel(esp);
    setSemanaInicio(getLunes(new Date()));
    setPaso(2);
  };

  const handleSeleccionarBloque = (fecha, hora) => {
    setFechaSel(fecha);
    setHoraSel(hora);
    setPaso(3);
  };

  const handleCreada = () => {
    setPaso(2);
    setFechaSel(null);
    setHoraSel(null);
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-6">

        {/* Header + Breadcrumb */}
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
            <button onClick={() => setPaso(1)} className={`hover:text-white transition-colors ${paso === 1 ? 'text-white font-medium' : ''}`}>
              Espacios
            </button>
            {paso >= 2 && (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
                <button onClick={() => setPaso(2)} className={`hover:text-white transition-colors ${paso === 2 ? 'text-white font-medium' : ''}`}>
                  {espacioSel?.nombre}
                </button>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Apartar espacio</h1>
          <p className="text-slate-400 text-sm mt-0.5">Selecciona el espacio que deseas solicitar</p>
        </div>

        {/* Paso 1 — Selector de espacio */}
        {paso === 1 && (
          loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {[1,2,3].map(i => <div key={i} className="glass rounded-2xl h-40 animate-pulse" />)}
            </div>
          ) : espacios.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <p className="text-slate-400">No hay espacios disponibles en este momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {espacios.map(esp => (
                <button key={esp.id}
                  onClick={() => seleccionarEspacio(esp)}
                  className={`glass rounded-2xl p-6 text-left border bg-gradient-to-br transition-all hover:scale-[1.02] active:scale-100 ${TIPO_GRAD[esp.tipo]}`}>
                  <div className="text-4xl mb-3">{TIPO_ICON[esp.tipo]}</div>
                  <h3 className="font-bold text-white text-lg">{esp.nombre}</h3>
                  <p className="text-slate-400 text-sm mt-1">{TIPO_DESC[esp.tipo]}</p>
                  {esp.ubicacion && (
                    <p className="text-slate-500 text-xs mt-2">📍 {esp.ubicacion}</p>
                  )}
                  <div className="flex gap-3 mt-3 text-xs text-slate-400">
                    <span>🕐 {esp.hora_inicio_permitida}–{esp.hora_fin_permitida}</span>
                    {esp.capacidad && <span>👥 {esp.capacidad} personas</span>}
                  </div>
                </button>
              ))}
            </div>
          )
        )}

        {/* Paso 2 — Calendario */}
        {paso === 2 && espacioSel && (
          <div className="space-y-4">
          <div className="glass rounded-2xl p-4 flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="text-3xl">{TIPO_ICON[espacioSel.tipo]}</span>
              <div>
              <p className="font-semibold text-white">{espacioSel.nombre}</p>
              <p className="text-sm text-slate-400">{TIPO_DESC[espacioSel.tipo]}</p>
              <p className="text-xs text-slate-500 mt-1">
                Tiempo operativo entre eventos: {espacioSel.buffer_antes_minutos || 0} min antes / {espacioSel.buffer_despues_minutos || 0} min despues.
              </p>
              {espacioSel.estado_operativo && espacioSel.estado_operativo !== 'DISPONIBLE' && (
                <p className="text-xs text-amber-300 mt-1">
                  Estado operativo: {espacioSel.estado_operativo}. {espacioSel.aviso_operativo || 'La solicitud queda sujeta a verificacion del responsable.'}
                </p>
              )}
            </div>
              <button onClick={() => setPaso(1)}
                className="ml-auto text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl px-3 py-1.5 transition-colors">
                Cambiar espacio
              </button>
            </div>
            <CalendarioSemana
              espacio={espacioSel}
              semanaInicio={semanaInicio}
              setSemanaInicio={setSemanaInicio}
              onSeleccionar={handleSeleccionarBloque}
            />
            <p className="text-xs text-slate-500 text-center">
              Haz clic en cualquier bloque azul para realizar una solicitud
            </p>
          </div>
        )}

        {/* Paso 3 — Formulario (modal) */}
        {paso === 3 && espacioSel && fechaSel && (
          <FormSolicitud
            espacio={espacioSel}
            fecha={fechaSel}
            horaPreset={horaSel}
            onClose={() => setPaso(2)}
            onCreada={handleCreada}
          />
        )}
      </div>
    </AdminLayout>
  );
}
