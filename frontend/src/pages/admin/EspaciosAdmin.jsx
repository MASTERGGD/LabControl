/**
 * EspaciosAdmin.jsx
 * Administración de Espacios Institucionales (SUPER_ADMIN)
 * - Crear / editar / desactivar espacios
 * - Asignar y quitar responsables
 */
import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

// ─── Constantes ────────────────────────────────────────────────────────────────
const TIPO_LABEL = { AUDIOVISUAL: 'Sala Audiovisual', RECTORIA: 'Sala de Rectoría', OTRO: 'Otro' };
const TIPO_ICON  = { AUDIOVISUAL: '🎥', RECTORIA: '🏛️', OTRO: '🏢' };
/* Tag neutro — color vivo reservado para alertas de estado, no para categorías */
const TIPO_COLOR = {
  AUDIOVISUAL: 'bg-slate-700/60 text-slate-300 border-slate-600/40',
  RECTORIA:    'bg-slate-700/60 text-slate-300 border-slate-600/40',
  OTRO:        'bg-slate-700/60 text-slate-300 border-slate-600/40',
};

const ESTADO_OP_COLOR = {
  DISPONIBLE:         'text-emerald-400',
  REQUIERE_LIMPIEZA:  'text-amber-400',
  REQUIERE_ACOMODO:   'text-amber-400',
  REVISION_TECNICA:   'text-orange-400',
  FUERA_SERVICIO:     'text-red-400',
};
const ESTADO_OP_LABEL = {
  DISPONIBLE:         'Disponible',
  REQUIERE_LIMPIEZA:  'Limpieza',
  REQUIERE_ACOMODO:   'Acomodo',
  REVISION_TECNICA:   'Rev. técnica',
  FUERA_SERVICIO:     'Fuera servicio',
};

const EMPTY_FORM = {
  nombre: '', tipo: 'AUDIOVISUAL', ubicacion: '', capacidad: '',
  descripcion: '', hora_inicio_permitida: '08:00', hora_fin_permitida: '20:00',
  requiere_aprobacion: true, buffer_antes_minutos: 0, buffer_despues_minutos: 30,
  estado_operativo: 'DISPONIBLE', aviso_operativo: '',
};

// ─── Modal Espacio ─────────────────────────────────────────────────────────────
function ModalEspacio({ espacio, onClose, onSaved }) {
  const { toast: showToast } = useToast();
  const [form, setForm]       = useState(espacio ? { ...espacio } : { ...EMPTY_FORM });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        nombre:      form.nombre.trim(),
        ubicacion:   form.ubicacion.trim()   || null,
        descripcion: form.descripcion.trim() || null,
        capacidad:   form.capacidad ? Number(form.capacidad) : null,
        buffer_antes_minutos: Number(form.buffer_antes_minutos || 0),
        buffer_despues_minutos: Number(form.buffer_despues_minutos || 0),
        aviso_operativo: form.aviso_operativo.trim() || null,
      };
      if (espacio) {
        await api.put(`/espacios/institucionales/${espacio.id}`, payload);
        showToast('Espacio actualizado', 'success');
      } else {
        await api.post('/espacios/institucionales', payload);
        showToast('Espacio creado', 'success');
      }
      onSaved();
    } catch (err) {
      setError(err.response.data.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-glass animate-fadeUp overflow-y-auto max-h-[90vh]">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">
            {espacio ? 'Editar espacio' : 'Nuevo espacio institucional'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre *</label>
            <input className="input-dark" value={form.nombre} onChange={e => set('nombre', e.target.value)}
              placeholder="Sala Audiovisual, Sala de Rectoría…" required />
          </div>
          {/* Tipo */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Tipo *</label>
            <select className="input-dark" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ubicación</label>
              <input className="input-dark" value={form.ubicacion} onChange={e => set('ubicacion', e.target.value)}
                placeholder="Ej: Edificio A, 2do piso" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Capacidad (personas)</label>
              <input type="number" min="1" className="input-dark" value={form.capacidad}
                onChange={e => set('capacidad', e.target.value)} placeholder="Ej: 30" />
            </div>
          </div>
          {/* Horario permitido */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Horario inicio</label>
              <input type="time" className="input-dark" value={form.hora_inicio_permitida}
                onChange={e => set('hora_inicio_permitida', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Horario fin</label>
              <input type="time" className="input-dark" value={form.hora_fin_permitida}
                onChange={e => set('hora_fin_permitida', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Margen antes de reserva (min)</label>
              <input type="number" min="0" max="120" className="input-dark" value={form.buffer_antes_minutos ?? 0}
                onChange={e => set('buffer_antes_minutos', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Margen después de reserva (min)</label>
              <input type="number" min="0" max="180" className="input-dark" value={form.buffer_despues_minutos ?? 30}
                onChange={e => set('buffer_despues_minutos', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Estado operativo</label>
            <select className="input-dark" value={form.estado_operativo || 'DISPONIBLE'}
              onChange={e => set('estado_operativo', e.target.value)}>
              <option value="DISPONIBLE">Disponible</option>
              <option value="REQUIERE_LIMPIEZA">Requiere limpieza</option>
              <option value="REQUIERE_ACOMODO">Requiere acomodo</option>
              <option value="REVISION_TECNICA">Revision tecnica</option>
              <option value="FUERA_SERVICIO">Fuera de servicio</option>
            </select>
          </div>
          {/* Descripción */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Descripción</label>
            <textarea className="input-dark resize-none" rows={2} value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              placeholder="Descripción breve del espacio y sus características…" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Aviso operativo visible</label>
            <textarea className="input-dark resize-none" rows={2} value={form.aviso_operativo || ''}
              onChange={e => set('aviso_operativo', e.target.value)}
              placeholder="Ej: requiere acomodo, limpieza o revision tecnica antes del evento..." />
          </div>
          {/* Requiere aprobación */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className={`relative w-10 h-5 rounded-full transition-colors ${form.requiere_aprobacion ? 'bg-blue-600' : 'bg-slate-700'}`}
              onClick={() => set('requiere_aprobacion', !form.requiere_aprobacion)}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.requiere_aprobacion ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-slate-300">Requiere aprobación explícita</span>
          </label>

          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-blue flex-1">
              {saving ? 'Guardando...' : (espacio ? 'Guardar cambios' : 'Crear espacio')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Panel Responsables ────────────────────────────────────────────────────────
function PanelResponsables({ espacio, onClose }) {
  const { toast: showToast } = useToast();
  const [responsables, setResponsables]   = useState(espacio.responsables || []);
  const [apoyos, setApoyos]               = useState(espacio.apoyos || []);
  const [usuarios, setUsuarios]           = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [selUsuario, setSelUsuario]       = useState('');
  const [selApoyo, setSelApoyo]           = useState('');
  const [loading, setLoading]             = useState(false);

  useEffect(() => {
    api.get('/usuarios?activo=true&page_size=200').then(r => {
      setUsuarios(r.data.items || r.data || []);
    }).catch(() => {});
    api.get('/departamentos?activo=true').then(r => {
      setDepartamentos(Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
  }, []);

  const asignar = async () => {
    if (!selUsuario) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/espacios/institucionales/${espacio.id}/responsables`, { usuario_id: Number(selUsuario) });
      setResponsables(p => [...p, data]);
      setSelUsuario('');
      showToast('Responsable asignado', 'success');
    } catch (err) {
      showToast(err.response.data.detail || 'Error', 'error');
    } finally { setLoading(false); }
  };

  const quitar = async (responsableId) => {
    try {
      await api.delete(`/espacios/institucionales/${espacio.id}/responsables/${responsableId}`);
      setResponsables(p => p.filter(r => r.id !== responsableId));
      showToast('Responsable removido', 'success');
    } catch {
      showToast('Error al remover', 'error');
    }
  };

  const asignarApoyo = async () => {
    if (!selApoyo) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/espacios/institucionales/${espacio.id}/apoyos`, {
        departamento_id: Number(selApoyo),
      });
      setApoyos(p => [...p, data]);
      setSelApoyo('');
      showToast('Área de apoyo asignada', 'success');
    } catch (err) {
      showToast(err.response.data.detail || 'Error', 'error');
    } finally { setLoading(false); }
  };

  const quitarApoyo = async (apoyoId) => {
    try {
      await api.delete(`/espacios/institucionales/${espacio.id}/apoyos/${apoyoId}`);
      setApoyos(p => p.filter(r => r.id !== apoyoId));
      showToast('Apoyo removido', 'success');
    } catch {
      showToast('Error al remover apoyo', 'error');
    }
  };

  const asignadosIds     = new Set(responsables.map(r => r.usuario_id));
  const disponibles      = usuarios.filter(u => !asignadosIds.has(u.id));
  const apoyoDeptoIds    = new Set(apoyos.map(r => r.departamento_id));
  const departamentosSinResponsable = departamentos.filter(d => !d.responsable_id);
  const disponiblesApoyo = departamentos.filter(d => d.responsable_id && !apoyoDeptoIds.has(d.id));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">👥 Responsables</h3>
            <p className="text-xs text-slate-400 mt-0.5">{espacio.nombre}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Lista responsables actuales */}
          <div className="space-y-2">
            {responsables.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Sin responsables asignados</p>
            ) : responsables.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm text-white font-medium">{r.nombre}</p>
                  <p className="text-xs text-slate-400">{r.email}</p>
                </div>
                <button onClick={() => quitar(r.id)}
                  className="text-red-400 hover:text-red-300 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-red-500/10">
                  Quitar
                </button>
              </div>
            ))}
          </div>
          {/* Asignar responsable */}
          <div className="border-t border-white/5 pt-4">
            <label className="block text-sm text-slate-400 mb-2">Asignar responsable</label>
            <div className="flex gap-2">
              <select className="input-dark flex-1" value={selUsuario} onChange={e => setSelUsuario(e.target.value)}>
                <option value="">— Seleccionar usuario —</option>
                {disponibles.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                ))}
              </select>
              <button onClick={asignar} disabled={!selUsuario || loading} className="btn-blue px-4">
                {loading ? '...' : 'Asignar'}
              </button>
            </div>
          </div>

          {/* Áreas de apoyo — por departamento */}
          <div className="border-t border-white/5 pt-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-slate-400 font-medium">Departamentos de apoyo</span>
              <span className="text-xs text-slate-500">· se notifica a su responsable</span>
            </div>
            {departamentosSinResponsable.length > 0 && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                {departamentosSinResponsable.length} departamento{departamentosSinResponsable.length !== 1 ? 's' : ''} sin responsable no se muestran como apoyo.
              </p>
            )}
            {apoyos.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-2">Sin departamentos asignados</p>
            ) : apoyos.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-blue-500/10 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm text-white font-medium">🏢 {r.departamento_nombre}</p>
                  <p className="text-xs text-slate-400">
                    Responsable: {r.responsable_nombre || 'Sin asignar'}
                    {r.responsable_email ? ` · ${r.responsable_email}` : ''}
                  </p>
                </div>
                <button onClick={() => quitarApoyo(r.id)}
                  className="text-red-400 hover:text-red-300 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-red-500/10">
                  Quitar
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <select className="input-dark flex-1" value={selApoyo} onChange={e => setSelApoyo(e.target.value)}>
                <option value="">— Departamento de apoyo —</option>
                {disponiblesApoyo.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}{d.responsable_nombre ? ` · ${d.responsable_nombre}` : ''}
                  </option>
                ))}
              </select>
              <button onClick={asignarApoyo} disabled={!selApoyo || loading} className="btn-blue px-4">
                {loading ? '...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function EspaciosAdmin() {
  const { toast: showToast } = useToast();
  const [espacios, setEspacios]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [soloActivos, setSoloActivos]     = useState(true);
  const [modalEspacio, setModalEspacio]   = useState(null);    // null | 'nuevo' | espacio
  const [panelResp, setPanelResp]         = useState(null);    // espacio seleccionado

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/espacios/institucionales?solo_activos=${soloActivos}`);
      setEspacios(data);
    } catch { showToast('Error al cargar espacios', 'error'); }
    finally { setLoading(false); }
  }, [soloActivos]);

  useEffect(() => { cargar(); }, [cargar]);

  const desactivar = async (esp) => {
    if (!window.confirm(`¿Desactivar "${esp.nombre}" Las solicitudes existentes no se eliminarán.`)) return;
    try {
      await api.delete(`/espacios/institucionales/${esp.id}`);
      showToast('Espacio desactivado', 'success');
      cargar();
    } catch (err) {
      showToast(err.response.data.detail || 'Error', 'error');
    }
  };

  const handleSaved = () => {
    setModalEspacio(null);
    cargar();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Espacios Institucionales</h1>
            <p className="text-slate-400 text-sm mt-0.5">Gestiona salas y asigna responsables</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800" />
              Solo activos
            </label>
            <button onClick={() => setModalEspacio('nuevo')} className="btn-blue flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Nuevo espacio
            </button>
          </div>
        </div>

        {/* Grid de espacios */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="glass rounded-2xl p-5 h-48 animate-pulse" />
            ))}
          </div>
        ) : espacios.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4">🏢</div>
            <p className="text-white font-semibold text-lg">Sin espacios registrados</p>
            <p className="text-slate-400 text-sm mt-1">Crea el primer espacio institucional</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {espacios.map(esp => (
              <div key={esp.id} className={`glass rounded-2xl p-5 flex flex-col gap-4 transition-all ${!esp.activo ? 'opacity-50' : ''}`}>

                {/* ── Cabecera ── */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{TIPO_ICON[esp.tipo] || '🏢'}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white leading-snug">{esp.nombre}</h3>
                      {esp.ubicacion && (
                        <p className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                          </svg>
                          {esp.ubicacion}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Tag neutro — color vivo reservado para alertas */}
                  <span className={`text-[11px] px-2 py-0.5 rounded border font-medium shrink-0 ${TIPO_COLOR[esp.tipo]}`}>
                    {TIPO_LABEL[esp.tipo]}
                  </span>
                </div>

                {/* ── Grid 2×3 simétrico ── */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    {
                      label: 'Horario',
                      val: <span className="text-slate-200 font-semibold">{esp.hora_inicio_permitida} – {esp.hora_fin_permitida}</span>,
                    },
                    {
                      label: 'Capacidad',
                      val: <span className="text-slate-200 font-semibold">{esp.capacidad ?? '-'} personas</span>,
                    },
                    {
                      label: 'Aprobación',
                      val: <span className={`font-semibold ${esp.requiere_aprobacion ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {esp.requiere_aprobacion ? 'Requerida' : 'Automática'}
                      </span>,
                    },
                    {
                      label: 'Responsables',
                      val: <span className="text-slate-200 font-semibold">
                        {esp.responsables.length || 0}
                        {esp.apoyos.length > 0 && <span className="text-slate-500 font-normal"> · apoyo {esp.apoyos.length}</span>}
                      </span>,
                    },
                    {
                      label: 'Margen entre reservas',
                      val: <span className="text-slate-200 font-semibold">
                        {esp.buffer_antes_minutos || 0}/{esp.buffer_despues_minutos || 0} min
                      </span>,
                    },
                    {
                      label: 'Estado',
                      val: <span className={`font-semibold ${ESTADO_OP_COLOR[esp.estado_operativo] || ESTADO_OP_COLOR.DISPONIBLE}`}>
                        {ESTADO_OP_LABEL[esp.estado_operativo] || 'Disponible'}
                      </span>,
                    },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-slate-500 mb-0.5">{label}</p>
                      {val}
                    </div>
                  ))}
                </div>

                {/* ── Acciones — ghost con iconos, sin recortes ── */}
                <div className="flex items-center gap-1 mt-auto pt-3 border-t border-white/5">
                  <button onClick={() => setModalEspacio(esp)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-xl py-2 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6-6 3 3-6 6H9v-3z"/>
                    </svg>
                    Editar
                  </button>
                  <button onClick={() => setPanelResp(esp)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-xl py-2 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    Responsables
                  </button>
                  {esp.activo && (
                    <button onClick={() => desactivar(esp)}
                      className="flex items-center justify-center gap-1.5 text-xs text-red-400/70 hover:text-red-300 hover:bg-red-500/10 rounded-xl px-3 py-2 transition-colors"
                      title="Desactivar espacio">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                      </svg>
                      Desactivar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modales */}
      {modalEspacio && (
        <ModalEspacio
          espacio={modalEspacio === 'nuevo' ? null : modalEspacio}
          onClose={() => setModalEspacio(null)}
          onSaved={handleSaved}
        />
      )}
      {panelResp && (
        <PanelResponsables
          espacio={panelResp}
          onClose={() => { setPanelResp(null); cargar(); }}
        />
      )}
    </AdminLayout>
  );
}
