import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../hooks/useApi';
import AutocompleteInput, { formatApiError } from '../../components/AutocompleteInput';
import SelectDark from '../../components/SelectDark';

// ─── Estilos visuales por estado de PC ────────────────────────────────────────
const PC_ESTILOS = {
  OCUPADA:       { bg:'rgba(15,30,65,0.92)',  border:'rgba(59,130,246,0.65)',  glow:'rgba(59,130,246,0.18)',  label:'Ocupada' },
  EN_CLASE:      { bg:'rgba(3,17,9,0.88)',    border:'rgba(22,101,52,0.45)',   glow:'transparent',            label:'Libre'   },
  OPERATIVO:     { bg:'rgba(3,17,9,0.88)',    border:'rgba(22,101,52,0.45)',   glow:'transparent',            label:'Libre'   },
  MANTENIMIENTO: { bg:'rgba(45,28,0,0.92)',   border:'rgba(217,119,6,0.75)',   glow:'rgba(217,119,6,0.12)',   label:'Mant.'   },
  DAÑADO:        { bg:'rgba(50,10,10,0.92)',  border:'rgba(220,38,38,0.65)',   glow:'rgba(220,38,38,0.12)',   label:'Dañado'  },
  BAJA:          { bg:'rgba(15,23,42,0.60)',  border:'rgba(51,65,85,0.40)',    glow:'transparent',            label:'Baja'    },
};

// ─── Tarjeta visual de PC ─────────────────────────────────────────────────────
function TarjetaPC({ pc, onClick, highlighted }) {
  const est = PC_ESTILOS[pc.estado] || PC_ESTILOS.OPERATIVO;
  const clickable = ['OCUPADA','EN_CLASE','OPERATIVO'].includes(pc.estado) && !pc.bloqueada;
  const ocupada   = pc.estado === 'OCUPADA' && pc.alumno;
  const mant      = pc.estado === 'MANTENIMIENTO';
  const dano      = pc.estado === 'DAÑADO';
  const baja      = pc.estado === 'BAJA';

  // Iniciales del alumno
  const initials = ocupada
    ? pc.alumno.nombre.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
    : null;

  // Apellido + inicial → "García R."
  const shortName = ocupada
    ? (() => {
        const p = pc.alumno.nombre.trim().split(/\s+/);
        if (p.length === 1) return p[0];
        const ap = p[0].charAt(0).toUpperCase() + p[0].slice(1).toLowerCase();
        const ini = p[p.length - 1].charAt(0).toUpperCase();
        return `${ap} ${ini}.`;
      })()
    : null;

  return (
    <button
      onClick={() => clickable && onClick(pc)}
      disabled={!clickable}
      style={{
        position: 'relative',
        background: est.bg,
        border: `1.5px solid ${est.border}`,
        borderRadius: '0.875rem',
        padding: ocupada ? '11px 9px 10px' : '14px 10px 12px',
        minWidth: 90,
        textAlign: 'center',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
        boxShadow: highlighted
          ? '0 0 0 2px #60a5fa, 0 0 18px rgba(59,130,246,0.35)'
          : (ocupada ? `0 0 14px ${est.glow}` : 'none'),
        opacity: baja ? 0.45 : 1,
        outline: 'none',
      }}
      onMouseEnter={e => {
        if (!clickable) return;
        e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
        e.currentTarget.style.boxShadow = highlighted
          ? '0 0 0 2px #60a5fa, 0 0 22px rgba(59,130,246,0.4)'
          : `0 6px 20px ${est.glow || 'rgba(0,0,0,0.3)'}, 0 0 0 1px ${est.border}`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = highlighted
          ? '0 0 0 2px #60a5fa, 0 0 18px rgba(59,130,246,0.35)'
          : (ocupada ? `0 0 14px ${est.glow}` : 'none');
      }}
      title={ocupada ? `${pc.alumno.nombre}\n${pc.alumno.matricula}` : pc.estado}
    >
      {/* Indicador de estado top-right */}
      {ocupada && (
        <span style={{
          position:'absolute', top:5, right:6,
          width:6, height:6, borderRadius:'50%',
          background:'#3b82f6',
          boxShadow:'0 0 6px rgba(59,130,246,0.8)',
        }}/>
      )}

      {/* Contenido según estado */}
      {ocupada ? (
        <>
          {/* Avatar con iniciales */}
          <div style={{
            width:28, height:28, borderRadius:'50%',
            background:'linear-gradient(135deg,#1d4ed8,#7c3aed)',
            margin:'0 auto 5px',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:10, fontWeight:800, color:'#fff', letterSpacing:'0.02em',
            boxShadow:'0 2px 8px rgba(59,130,246,0.35)',
          }}>
            {initials}
          </div>
          <p style={{fontSize:10, fontWeight:700, color:'#93c5fd', letterSpacing:'0.04em', margin:0}}>{pc.codigo}</p>
          <p style={{fontSize:9, color:'rgba(186,230,253,0.75)', lineHeight:1.2, margin:'2px 0 0',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:70}}>
            {shortName}
          </p>
          <p style={{fontSize:8, color:'rgba(100,116,139,0.85)', margin:'1px 0 0'}}>{pc.alumno.matricula}</p>
        </>
      ) : mant ? (
        <>
          <p style={{fontSize:15, margin:'0 0 3px', lineHeight:1}}>🔧</p>
          <p style={{fontSize:10, fontWeight:700, color:'#fbbf24', letterSpacing:'0.04em', margin:0}}>{pc.codigo}</p>
          <p style={{fontSize:9, color:'rgba(251,191,36,0.55)', margin:'2px 0 0'}}>Mant.</p>
        </>
      ) : dano ? (
        <>
          <p style={{fontSize:15, margin:'0 0 3px', lineHeight:1}}>⚠️</p>
          <p style={{fontSize:10, fontWeight:700, color:'#fca5a5', letterSpacing:'0.04em', margin:0}}>{pc.codigo}</p>
          <p style={{fontSize:9, color:'rgba(252,165,165,0.55)', margin:'2px 0 0'}}>Dañada</p>
        </>
      ) : baja ? (
        <>
          <p style={{fontSize:10, fontWeight:700, color:'#475569', letterSpacing:'0.04em', margin:0}}>{pc.codigo}</p>
          <p style={{fontSize:9, color:'rgba(71,85,105,0.6)', margin:'2px 0 0'}}>Baja</p>
        </>
      ) : (
        /* Libre */
        <>
          <p style={{fontSize:10, fontWeight:700, color:'#4ade80', letterSpacing:'0.04em', margin:0}}>{pc.codigo}</p>
          <p style={{fontSize:9, color:'rgba(74,222,128,0.4)', margin:'2px 0 0'}}>Libre</p>
        </>
      )}
    </button>
  );
}

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

// ─── Revisión de Recepción ────────────────────────────────────────────────────

const TIPO_PROBLEMA_OPTS = [
  { id:'DAÑO_FISICO',  label:'Daño físico'  },
  { id:'NO_ENCIENDE',  label:'No enciende'  },
  { id:'PERIFERICO',   label:'Periférico'   },
  { id:'RED',          label:'Red / Internet'},
  { id:'OTRO',         label:'Otro'         },
];

function RecepcionInicial({ pcs, sesion, sesionId, onConfirmada }) {
  // estados[pc_id] = { revisada, conProblema, tipo, descripcion, bloquear, prioridad }
  const [estados, setEstados]                 = useState({});
  const [ultimosUsuarios, setUltimosUsuarios] = useState({});
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');

  const pcsMapeables = pcs.filter(p => !['BAJA','MANTENIMIENTO','DAÑADO'].includes(p.estado));
  const pcsYaFuera   = pcs.filter(p => ['MANTENIMIENTO','DAÑADO'].includes(p.estado));

  // Agrupar por fila
  const filas = {};
  pcsMapeables.forEach(pc => {
    const fila = pc.fila || '—';
    if (!filas[fila]) filas[fila] = [];
    filas[fila].push(pc);
  });
  const filasOrd = Object.keys(filas).sort();

  const total     = pcsMapeables.length;
  const revisadas = pcsMapeables.filter(p => estados[p.pc_id]?.revisada).length;
  const pendientes = total - revisadas;
  const progreso  = total > 0 ? Math.round((revisadas / total) * 100) : 0;
  const conProblemasCount = pcsMapeables.filter(p => estados[p.pc_id]?.conProblema).length;
  const listo     = pendientes === 0;

  const marcarPC = async (pcId, conProblema) => {
    setEstados(prev => ({
      ...prev,
      [pcId]: {
        ...prev[pcId],
        revisada:    true,
        conProblema,
        tipo:        conProblema ? (prev[pcId]?.tipo || '') : '',
        descripcion: conProblema ? (prev[pcId]?.descripcion || '') : '',
        bloquear:    conProblema ? (prev[pcId]?.bloquear || false) : false,
        prioridad:   conProblema ? (prev[pcId]?.prioridad || 'MEDIA') : 'MEDIA',
      }
    }));
    if (conProblema && ultimosUsuarios[pcId] === undefined) {
      setUltimosUsuarios(prev => ({ ...prev, [pcId]: { loading: true } }));
      try {
        const { data } = await api.get(`/sesiones/pc/${pcId}/ultimo-usuario`);
        setUltimosUsuarios(prev => ({ ...prev, [pcId]: data.ultimo_usuario || null }));
      } catch {
        setUltimosUsuarios(prev => ({ ...prev, [pcId]: null }));
      }
    }
  };

  const setDetalle = (pcId, campo, valor) =>
    setEstados(prev => ({ ...prev, [pcId]: { ...prev[pcId], [campo]: valor } }));

  const handleConfirmar = async () => {
    setLoading(true); setError('');
    try {
      const items = pcsMapeables.map(pc => {
        const est = estados[pc.pc_id] || {};
        // build descripcion with tipo prefix
        let desc = est.descripcion || '';
        if (est.conProblema && est.tipo) {
          const tipoLabel = TIPO_PROBLEMA_OPTS.find(t => t.id === est.tipo)?.label || est.tipo;
          desc = desc ? `[${tipoLabel}] ${desc}` : `[${tipoLabel}]`;
        }
        return {
          computadora_id: pc.pc_id,
          estado:         est.conProblema ? 'CON_PROBLEMA' : 'OK',
          descripcion:    desc || '',
          prioridad:      est.prioridad || 'MEDIA',
          bloquear:       !!est.bloquear,
        };
      });
      await api.post(`/sesiones/${sesionId}/confirmar-recepcion`, { observaciones: items });
      onConfirmada();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Error al confirmar');
      setLoading(false);
    }
  };

  if (pcsMapeables.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
      </div>
    );
  }

  return (
    <div style={{minHeight:'100dvh',background:'#0b1120',color:'white',display:'flex',flexDirection:'column'}}>

      {/* ── HEADER ── */}
      <header style={{background:'rgba(15,23,42,0.95)',borderBottom:'1px solid rgba(255,255,255,0.06)',
        padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div>
          <p style={{fontSize:11,color:'#64748b',margin:'0 0 2px',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>
            {sesion.tipo_sesion === 'LIBRE' ? 'Uso Libre' : sesion.materia} · {sesion.laboratorio_nombre}
          </p>
          <h2 style={{fontSize:16,fontWeight:700,color:'#f1f5f9',margin:0,lineHeight:1.2}}>
            Recepción del laboratorio
          </h2>
          <p style={{fontSize:11,color:'#94a3b8',margin:'2px 0 0'}}>
            Revisión obligatoria antes de iniciar la clase
          </p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',
          background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.35)',borderRadius:8}}>
          <span style={{width:7,height:7,borderRadius:'50%',background:'#f59e0b',
            boxShadow:'0 0 8px #f59e0b',display:'inline-block'}}/>
          <span style={{fontSize:11,color:'#fbbf24',fontWeight:600}}>Inspección obligatoria</span>
        </div>
      </header>

      {/* ── INSTRUCCIÓN + PROGRESO ── */}
      <div style={{background:'rgba(245,158,11,0.06)',borderBottom:'1px solid rgba(245,158,11,0.12)',
        padding:'12px 20px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:8}}>
          <p style={{fontSize:12,color:'#fcd34d',margin:0,flex:1}}>
            🔍 Revise cada equipo. Si detecta un problema, márquelo y descríbalo — se genera reporte automático con trazabilidad.
          </p>
          {pcsYaFuera.length > 0 && (
            <span style={{fontSize:10,color:'#94a3b8',background:'rgba(255,255,255,0.04)',
              border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,padding:'3px 8px',whiteSpace:'nowrap'}}>
              🔧 {pcsYaFuera.length} excluida{pcsYaFuera.length>1?'s':''}: {pcsYaFuera.map(p=>p.codigo).join(', ')}
            </span>
          )}
        </div>
        {/* Barra de progreso */}
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{flex:1,height:5,background:'rgba(255,255,255,0.07)',borderRadius:99,overflow:'hidden'}}>
            <div style={{width:`${progreso}%`,height:'100%',borderRadius:99,
              background: progreso === 100
                ? 'linear-gradient(90deg,#10b981,#34d399)'
                : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
              transition:'width .3s ease'}}/>
          </div>
          <span style={{fontSize:11,fontWeight:700,color: progreso===100 ? '#34d399' : '#fbbf24',
            whiteSpace:'nowrap',minWidth:90,textAlign:'right'}}>
            {revisadas}/{total} revisadas
          </span>
          {conProblemasCount > 0 && (
            <span style={{fontSize:10,color:'#f87171',background:'rgba(239,68,68,0.1)',
              border:'1px solid rgba(239,68,68,0.25)',borderRadius:6,padding:'2px 7px',whiteSpace:'nowrap'}}>
              ⚠ {conProblemasCount} problema{conProblemasCount>1?'s':''}
            </span>
          )}
        </div>
      </div>

      {/* ── GRID POR FILA ── */}
      <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
        <div style={{maxWidth:860,margin:'0 auto',display:'flex',flexDirection:'column',gap:24}}>
          {filasOrd.map(fila => (
            <div key={fila}>
              {/* Cabecera de fila */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase',
                  color:'#334155',padding:'3px 8px',background:'rgba(255,255,255,0.04)',
                  border:'1px solid rgba(255,255,255,0.06)',borderRadius:5}}>
                  Fila {fila}
                </span>
                <div style={{flex:1,height:1,background:'rgba(255,255,255,0.05)'}}/>
                <span style={{fontSize:10,color:'#475569'}}>
                  {filas[fila].filter(p => estados[p.pc_id]?.revisada).length}/{filas[fila].length}
                </span>
              </div>

              {/* Tarjetas */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}}>
                {filas[fila].map(pc => {
                  const est = estados[pc.pc_id] || {};
                  const revisada     = !!est.revisada;
                  const conProblema  = !!est.conProblema;
                  const ultimoUsu    = ultimosUsuarios[pc.pc_id];

                  return (
                    <div key={pc.pc_id} style={{
                      background: conProblema
                        ? 'rgba(120,53,15,0.25)'
                        : revisada ? 'rgba(6,78,59,0.2)' : 'rgba(255,255,255,0.03)',
                      border: conProblema
                        ? '1.5px solid rgba(251,146,60,0.4)'
                        : revisada ? '1.5px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.07)',
                      borderRadius:12,
                      padding:'10px 12px',
                      transition:'all .2s',
                    }}>
                      {/* Fila superior: código + botones */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                        <div>
                          <p style={{fontSize:13,fontWeight:800,color:'#f1f5f9',margin:0,letterSpacing:'0.03em'}}>
                            {pc.codigo}
                          </p>
                          {pc.fila && (
                            <p style={{fontSize:9,color:'#475569',margin:'1px 0 0',textTransform:'uppercase',letterSpacing:'0.06em'}}>
                              Fila {pc.fila}
                            </p>
                          )}
                        </div>
                        <div style={{display:'flex',gap:5,flexShrink:0}}>
                          <button onClick={() => marcarPC(pc.pc_id, false)}
                            style={{
                              padding:'5px 11px',borderRadius:8,fontSize:11,fontWeight:700,
                              cursor:'pointer',transition:'all .15s',border:'none',
                              background: !conProblema && revisada
                                ? 'linear-gradient(135deg,#059669,#10b981)'
                                : 'rgba(255,255,255,0.07)',
                              color: !conProblema && revisada ? 'white' : '#64748b',
                              boxShadow: !conProblema && revisada ? '0 0 12px rgba(16,185,129,0.3)' : 'none',
                            }}>
                            ✓ OK
                          </button>
                          <button onClick={() => marcarPC(pc.pc_id, true)}
                            style={{
                              padding:'5px 11px',borderRadius:8,fontSize:11,fontWeight:700,
                              cursor:'pointer',transition:'all .15s',border:'none',
                              background: conProblema
                                ? 'linear-gradient(135deg,#dc2626,#ef4444)'
                                : 'rgba(255,255,255,0.07)',
                              color: conProblema ? 'white' : '#64748b',
                              boxShadow: conProblema ? '0 0 12px rgba(239,68,68,0.3)' : 'none',
                            }}>
                            ⚠ Problema
                          </button>
                        </div>
                      </div>

                      {/* Panel guiado cuando hay problema */}
                      {conProblema && (
                        <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(251,146,60,0.2)',
                          display:'flex',flexDirection:'column',gap:8}}>

                          {/* Tipo de problema */}
                          <div>
                            <p style={{fontSize:9,color:'#94a3b8',margin:'0 0 5px',fontWeight:600,
                              textTransform:'uppercase',letterSpacing:'0.08em'}}>Tipo de problema</p>
                            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                              {TIPO_PROBLEMA_OPTS.map(opt => (
                                <button key={opt.id}
                                  onClick={() => setDetalle(pc.pc_id,'tipo',opt.id)}
                                  style={{
                                    padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:600,
                                    cursor:'pointer',transition:'all .15s',
                                    background: est.tipo === opt.id
                                      ? 'rgba(251,146,60,0.25)' : 'rgba(255,255,255,0.05)',
                                    border: est.tipo === opt.id
                                      ? '1px solid rgba(251,146,60,0.5)' : '1px solid rgba(255,255,255,0.07)',
                                    color: est.tipo === opt.id ? '#fb923c' : '#64748b',
                                  }}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Descripción */}
                          <textarea rows={2}
                            placeholder="Describe el problema observado..."
                            value={est.descripcion || ''}
                            onChange={e => setDetalle(pc.pc_id,'descripcion',e.target.value)}
                            style={{
                              width:'100%',background:'rgba(0,0,0,0.3)',
                              border:'1px solid rgba(251,146,60,0.25)',color:'white',
                              fontSize:11,borderRadius:7,padding:'6px 9px',
                              resize:'none',outline:'none',fontFamily:'inherit',boxSizing:'border-box',
                            }}
                          />

                          {/* Prioridad + Bloquear */}
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                            <div style={{display:'flex',gap:4}}>
                              {[['BAJA','🟢'],['MEDIA','🟡'],['ALTA','🔴']].map(([v,ico]) => (
                                <button key={v} onClick={() => setDetalle(pc.pc_id,'prioridad',v)}
                                  style={{
                                    padding:'2px 8px',borderRadius:5,fontSize:9,fontWeight:700,
                                    cursor:'pointer',
                                    background: est.prioridad===v ? 'rgba(255,255,255,0.12)':'rgba(255,255,255,0.04)',
                                    border: est.prioridad===v ? '1px solid rgba(255,255,255,0.2)':'1px solid rgba(255,255,255,0.06)',
                                    color: est.prioridad===v ? '#f1f5f9':'#475569',
                                  }}>
                                  {ico} {v}
                                </button>
                              ))}
                            </div>
                            <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',userSelect:'none'}}>
                              <input type="checkbox" checked={!!est.bloquear}
                                onChange={e => setDetalle(pc.pc_id,'bloquear',e.target.checked)}
                                style={{accentColor:'#f87171'}}/>
                              <span style={{fontSize:10,color:'#f87171',fontWeight:600}}>Bloquear PC</span>
                            </label>
                          </div>

                          {/* Último usuario */}
                          {ultimoUsu?.loading ? (
                            <p style={{fontSize:10,color:'#64748b',fontStyle:'italic',margin:0}}>
                              Buscando último usuario…
                            </p>
                          ) : ultimoUsu && !ultimoUsu.loading ? (
                            <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                              background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:7}}>
                              <span style={{fontSize:14}}>🎓</span>
                              <div style={{minWidth:0,flex:1}}>
                                <p style={{fontSize:11,fontWeight:600,color:'#fcd34d',margin:0,
                                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                  {ultimoUsu.alumno_nombre}
                                </p>
                                <p style={{fontSize:9,color:'rgba(251,191,36,0.6)',margin:'1px 0 0'}}>
                                  {ultimoUsu.alumno_matricula}
                                  {ultimoUsu.sesion_materia ? ` · ${ultimoUsu.sesion_materia}` : ''}
                                </p>
                              </div>
                              <span style={{fontSize:9,color:'#64748b',whiteSpace:'nowrap'}}>último uso</span>
                            </div>
                          ) : ultimosUsuarios.hasOwnProperty(pc.pc_id) ? (
                            <p style={{fontSize:10,color:'#475569',fontStyle:'italic',margin:0}}>
                              Sin historial de uso previo
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER FIJO ── */}
      <footer style={{background:'rgba(15,23,42,0.97)',borderTop:'1px solid rgba(255,255,255,0.06)',
        padding:'12px 20px',flexShrink:0,display:'flex',alignItems:'center',
        justifyContent:'space-between',gap:12}}>
        <div>
          {!listo ? (
            <p style={{fontSize:13,color:'#94a3b8',margin:0}}>
              <span style={{fontWeight:700,color:'#f1f5f9'}}>{pendientes}</span> equipo{pendientes!==1?'s':''} por revisar
            </p>
          ) : conProblemasCount > 0 ? (
            <p style={{fontSize:13,color:'#fb923c',fontWeight:600,margin:0}}>
              ⚠ {conProblemasCount} problema{conProblemasCount!==1?'s':''} registrado{conProblemasCount!==1?'s':''}
            </p>
          ) : (
            <p style={{fontSize:13,color:'#34d399',fontWeight:600,margin:0}}>
              ✓ Todos los equipos en orden
            </p>
          )}
          {error && <p style={{fontSize:11,color:'#f87171',margin:'2px 0 0'}}>{error}</p>}
        </div>
        <button
          onClick={handleConfirmar}
          disabled={!listo || loading}
          style={{
            padding:'10px 24px',borderRadius:10,fontSize:13,fontWeight:700,
            border:'none',cursor: listo && !loading ? 'pointer' : 'not-allowed',
            transition:'all .2s',
            background: listo && !loading
              ? 'linear-gradient(135deg,#059669,#10b981)'
              : 'rgba(255,255,255,0.07)',
            color: listo && !loading ? 'white' : '#475569',
            boxShadow: listo && !loading ? '0 0 20px rgba(16,185,129,0.3)' : 'none',
            opacity: loading ? 0.7 : 1,
          }}>
          {loading
            ? 'Confirmando…'
            : listo
            ? `Iniciar clase${conProblemasCount > 0 ? ` (${conProblemasCount} incidente${conProblemasCount!==1?'s':''})` : ''}`
            : `Faltan ${pendientes} por revisar`}
        </button>
      </footer>
    </div>
  );
}
// ─── Panel de detalle de PC seleccionada ──────────────────────────────────────
function PanelDetallePC({ pc, onClose, onAsignar, onLiberar, onObservacion, onReportarDano }) {
  const libre   = pc.estado === 'EN_CLASE' || pc.estado === 'OPERATIVO';
  const ocupada = pc.estado === 'OCUPADA';

  const estadoColor = ocupada ? '#3b82f6' : '#4ade80';
  const estadoLabel = ocupada ? 'Ocupada' : 'Libre';

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
      {/* Header del panel */}
      <div style={{
        padding:'1rem 1.25rem 0.875rem',
        borderBottom:'1px solid rgba(255,255,255,0.07)',
        display:'flex', alignItems:'flex-start', justifyContent:'space-between',
      }}>
        <div>
          <p style={{fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase',
            letterSpacing:'0.14em', margin:'0 0 4px'}}>PC Seleccionada</p>
          <p style={{fontSize:22, fontWeight:800, color:'#f1f5f9', margin:0}}>{pc.codigo}</p>
          {pc.fila && <p style={{fontSize:11, color:'#475569', margin:'2px 0 0'}}>Fila {pc.fila}</p>}
        </div>
        <button onClick={onClose} style={{background:'none', border:'none', cursor:'pointer',
          color:'#475569', padding:4, borderRadius:8}}
          className="hover:text-white transition-colors">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Cuerpo */}
      <div style={{flex:1, padding:'1rem 1.25rem', overflowY:'auto'}}>

        {/* Badge estado */}
        <div style={{
          display:'inline-flex', alignItems:'center', gap:6,
          background: ocupada ? 'rgba(59,130,246,0.12)' : 'rgba(74,222,128,0.10)',
          border:`1px solid ${estadoColor}33`,
          borderRadius:20, padding:'4px 12px', marginBottom:16,
        }}>
          <span style={{width:7, height:7, borderRadius:'50%', background:estadoColor,
            boxShadow:`0 0 6px ${estadoColor}88`, flexShrink:0}}/>
          <span style={{fontSize:12, fontWeight:600, color:estadoColor}}>{estadoLabel}</span>
        </div>

        {/* Info alumno (si está ocupada) */}
        {ocupada && pc.alumno && (
          <div style={{
            background:'rgba(30,41,59,0.5)', border:'1px solid rgba(255,255,255,0.07)',
            borderRadius:'0.875rem', padding:'0.875rem 1rem', marginBottom:14,
          }}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <div style={{
                width:40, height:40, borderRadius:'50%', flexShrink:0,
                background:'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:14, fontWeight:800, color:'#fff',
              }}>
                {pc.alumno.nombre.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()}
              </div>
              <div style={{minWidth:0}}>
                <p style={{fontSize:13, fontWeight:600, color:'#e2e8f0', margin:0,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  {pc.alumno.nombre}
                </p>
                <p style={{fontSize:11, color:'#64748b', margin:'2px 0 0'}}>{pc.alumno.matricula}</p>
              </div>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {libre && (
            <button onClick={() => onAsignar(pc)}
              style={{
                width:'100%', padding:'11px 16px', borderRadius:'0.75rem', border:'none',
                background:'linear-gradient(135deg,#16a34a,#15803d)', color:'#fff',
                fontSize:13, fontWeight:700, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              Asignar alumno
            </button>
          )}
          {ocupada && (
            <>
              <button onClick={() => onLiberar(pc)}
                style={{
                  width:'100%', padding:'11px 16px', borderRadius:'0.75rem', border:'none',
                  background:'rgba(59,130,246,0.15)', color:'#93c5fd',
                  border:'1px solid rgba(59,130,246,0.30)',
                  fontSize:13, fontWeight:600, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
                </svg>
                Liberar PC
              </button>
              <button onClick={() => onObservacion(pc)}
                style={{
                  width:'100%', padding:'11px 16px', borderRadius:'0.75rem',
                  background:'transparent', color:'#94a3b8',
                  border:'1px solid rgba(255,255,255,0.10)',
                  fontSize:13, fontWeight:600, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
                </svg>
                Agregar observación
              </button>
            </>
          )}
          <button onClick={() => onReportarDano(pc)}
            style={{
              width:'100%', padding:'11px 16px', borderRadius:'0.75rem',
              background:'transparent', color:'#f87171',
              border:'1px solid rgba(239,68,68,0.20)',
              fontSize:13, fontWeight:600, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Reportar daño
          </button>
        </div>
      </div>
    </div>
  );
}


export default function SesionActiva() {
  const { sesionId } = useParams();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { usuario }  = useAuth();

  const [sesion, setSesion]         = useState(null);
  const [pcs, setPcs]               = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [selectedPc, setSelectedPc]    = useState(null);
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
    let shouldFallback = true;
    const token = sessionStorage.getItem('token');
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
      if (shouldFallback) iniciarPolling(); // fallback solo ante cierre inesperado
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
      shouldFallback = false;
      clearTimeout(wsTimerRef.current);
      clearInterval(pingInterval);
      detenerPolling();
      ws.close();
    };
  }, [sesion, navigate, iniciarPolling, detenerPolling]);

  // Filtrar PCs por estado + búsqueda
  const pcsFiltradas = pcs.filter(pc => {
    if (filtroEstado === 'libres'   && pc.estado !== 'EN_CLASE' && pc.estado !== 'OPERATIVO') return false;
    if (filtroEstado === 'ocupadas' && pc.estado !== 'OCUPADA') return false;
    if (filtroEstado === 'mant'     && pc.estado !== 'MANTENIMIENTO' && pc.estado !== 'DAÑADO') return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      pc.codigo.toLowerCase().includes(q) ||
      (pc.alumno?.nombre || '').toLowerCase().includes(q) ||
      (pc.alumno?.matricula || '').toLowerCase().includes(q) ||
      (pc.fila || '').toLowerCase().includes(q)
    );
  });

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
    if (pc.bloqueada || pc.estado === 'MANTENIMIENTO' || pc.estado === 'DAÑADO' || pc.estado === 'BAJA') return;
    setSelectedPc(pc);
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

  // ── Fase de revisión de recepción ────────────────────────────────────────────
  // Bloquea el mapa normal hasta que el docente complete la inspección inicial
  if (!sesion.recepcion_confirmada) {
    return (
      <RecepcionInicial
        pcs={pcs}
        sesion={sesion}
        sesionId={sesionId}
        onConfirmada={() => setSesion(s => ({ ...s, recepcion_confirmada: true }))}
      />
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
            <p className="font-semibold text-sm text-white leading-tight">
              {sesion.tipo_sesion === 'LIBRE'
                ? <span className="flex items-center gap-1.5">🖥️ Sesión Libre</span>
                : sesion.materia}
            </p>
            <p className="text-xs text-slate-400">
              {sesion.tipo_sesion === 'LIBRE'
                ? sesion.laboratorio_nombre
                : `${sesion.grupo} · ${sesion.laboratorio_nombre}`}
            </p>
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

      {/* Buscador + Chips de filtro */}
      <div className="px-4 py-2.5 border-b border-white/5 flex flex-wrap items-center gap-2"
           style={{background:'rgba(8,14,30,0.75)'}}>
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="PC, alumno, matrícula…"
            className="bg-white/5 border border-white/10 text-white text-sm rounded-xl pl-9 pr-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-green-500"/>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id:'todas',    label:'Todas',    count: pcs.length },
            { id:'libres',   label:'Libres',   count: pcsLibres },
            { id:'ocupadas', label:'Ocupadas', count: pcsOcupadas },
            { id:'mant',     label:'Mant.',    count: pcs.filter(p => p.estado==='MANTENIMIENTO'||p.estado==='DAÑADO').length },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltroEstado(f.id)}
              style={{
                padding:'5px 11px', borderRadius:20, fontSize:12, fontWeight:600,
                whiteSpace:'nowrap', transition:'all 0.15s', flexShrink:0,
                background: filtroEstado===f.id ? '#16a34a' : 'rgba(255,255,255,0.06)',
                border:`1px solid ${filtroEstado===f.id ? '#16a34a' : 'rgba(255,255,255,0.09)'}`,
                color: filtroEstado===f.id ? '#fff' : '#64748b',
              }}>
              {f.label}{f.count > 0 ? ` ${f.count}` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Banner tiempo extra (visible en móvil donde el topbar no muestra el timer) */}
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

      {/* Mapa de PCs + Panel detalle */}
      <div className="flex-1 overflow-hidden flex min-h-0">
      {/* Scroll area del mapa */}
      <div className="flex-1 overflow-auto p-4 lg:p-5">
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
                    const highlighted = !!(busqueda && (
                      pc.alumno?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
                      pc.alumno?.matricula?.includes(busqueda)
                    ));
                    return (
                      <TarjetaPC key={pc.pc_id} pc={pc} onClick={handlePcClick} highlighted={highlighted}/>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Sin filas definidas — grid plano */
          <div className="flex flex-wrap gap-2">
            {pcsFiltradas.sort((a,b) => a.numero - b.numero).map(pc => (
              <TarjetaPC key={pc.pc_id} pc={pc} onClick={handlePcClick} highlighted={false}/>
            ))}
          </div>
        )}
      </div>{/* fin scroll mapa */}

      {/* Panel detalle — desktop: columna lateral */}
      {selectedPc && (
        <aside className="hidden lg:flex w-80 shrink-0 flex-col border-l border-white/8 overflow-auto"
               style={{background:'rgba(6,10,24,0.92)'}}>
          <PanelDetallePC
            pc={selectedPc}
            onClose={() => setSelectedPc(null)}
            onAsignar={(pc) => { setSelectedPc(null); setModalAsignar(pc); }}
            onLiberar={(pc) => { setSelectedPc(null); setModalOcupada(pc); }}
            onObservacion={(pc) => { setSelectedPc(null); setModalObs(pc); }}
            onReportarDano={(pc) => { setSelectedPc(null); setModalDano(pc); }}
          />
        </aside>
      )}

      </div>{/* fin flex mapa+panel */}

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

      {/* Bottom sheet móvil — PC seleccionada */}
      {selectedPc && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={() => setSelectedPc(null)}/>
          <div className="relative rounded-t-2xl overflow-hidden"
               style={{background:'#0a1020', border:'1px solid rgba(255,255,255,0.08)', maxHeight:'72vh', overflowY:'auto'}}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div style={{width:36, height:4, borderRadius:99, background:'rgba(255,255,255,0.15)'}}/>
            </div>
            <PanelDetallePC
              pc={selectedPc}
              onClose={() => setSelectedPc(null)}
              onAsignar={(pc) => { setSelectedPc(null); setModalAsignar(pc); }}
              onLiberar={(pc) => { setSelectedPc(null); setModalOcupada(pc); }}
              onObservacion={(pc) => { setSelectedPc(null); setModalObs(pc); }}
              onReportarDano={(pc) => { setSelectedPc(null); setModalDano(pc); }}
            />
          </div>
        </div>
      )}

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
