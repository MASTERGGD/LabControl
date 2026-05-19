/**
 * ComunicadosAdmin.jsx
 * Vista administrativa de Comunicados Institucionales (SUPER_ADMIN / LAB_ADMIN).
 * - Listado con filtros por estado y categoría
 * - Modal crear/editar
 * - Acciones: publicar, archivar, eliminar
 * - Panel lateral de reporte de lecturas
 */
import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

// ─── Constantes ────────────────────────────────────────────────────────────────
const CATEGORIAS = [
  { v: 'ACADEMICO',      l: 'Académico',        color: 'bg-blue-500/20 text-blue-300 border-blue-500/30'     },
  { v: 'ADMINISTRATIVO', l: 'Administrativo',    color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
  { v: 'EVENTOS',        l: 'Eventos',           color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { v: 'MANTENIMIENTO',  l: 'Mantenimiento',     color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  { v: 'RRHH',           l: 'Recursos Humanos',  color: 'bg-pink-500/20 text-pink-300 border-pink-500/30'     },
  { v: 'GENERAL',        l: 'General',           color: 'bg-teal-500/20 text-teal-300 border-teal-500/30'     },
  { v: 'URGENTE',        l: 'Urgente',           color: 'bg-red-500/20 text-red-300 border-red-500/30'        },
];
const PRIORIDADES = [
  { v: 'INFORMATIVO', l: 'Informativo', dot: 'bg-slate-400' },
  { v: 'IMPORTANTE',  l: 'Importante',  dot: 'bg-amber-400' },
  { v: 'URGENTE',     l: 'Urgente',     dot: 'bg-red-400'   },
];
const ESTADOS_CFG = {
  BORRADOR:  { label: 'Borrador',  bg: 'bg-slate-500/20 border-slate-500/30', text: 'text-slate-400'  },
  PUBLICADO: { label: 'Publicado', bg: 'bg-green-500/20 border-green-500/30', text: 'text-green-300'  },
  ARCHIVADO: { label: 'Archivado', bg: 'bg-slate-500/10 border-slate-500/20', text: 'text-slate-500'  },
};
const ROLES_OPTS = [
  { v: 'SUPER_ADMIN',    l: 'Super Admin'   },
  { v: 'LAB_ADMIN',      l: 'Lab Admin'     },
  { v: 'DOCENTE',        l: 'Docente'       },
  { v: 'ADMINISTRATIVO', l: 'Administrativo'},
];
const CAT_MAP  = Object.fromEntries(CATEGORIAS.map(c  => [c.v, c]));
const PRIO_MAP = Object.fromEntries(PRIORIDADES.map(p => [p.v, p]));

const EMPTY_FORM = {
  titulo: '', contenido: '', categoria: 'GENERAL', prioridad: 'INFORMATIVO',
  requiere_confirmacion: false, area_emisora: '', departamento_emisor_id: '',
  fecha_publicacion: '', fecha_expiracion: '',
  dest_tipo: 'TODOS', dest_roles: [], dest_usuarios: [], dest_departamentos: [],
};

const toStartOfDay = value => value ? `${value}T00:00:00` : null;
const toEndOfDay = value => value ? `${value}T23:59:59` : null;

// ─── Modal Crear/Editar ────────────────────────────────────────────────────────
function ModalComunicado({ comunicado, onClose, onSaved }) {
  const { toast: showToast } = useToast();
  const [form, setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [busquedaUsuario, setBusquedaUsuario] = useState('');
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);

  useEffect(() => {
    setCargandoUsuarios(true);
    api.get('/usuarios?activo=true')
      .then(res => setUsuarios(Array.isArray(res.data) ? res.data : []))
      .catch(() => setUsuarios([]))
      .finally(() => setCargandoUsuarios(false));
    api.get('/departamentos?activo=true')
      .then(res => setDepartamentos(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDepartamentos([]));
  }, []);

  useEffect(() => {
    if (!comunicado) { setForm(EMPTY_FORM); return; }
    // Reconstruir estado del form desde el comunicado existente
    const dests = comunicado.destinatarios || [];
    let dest_tipo = 'TODOS', dest_roles = [], dest_usuarios = [], dest_departamentos = [];
    const tiposTodos   = dests.find(d => d.tipo === 'TODOS');
    const tiposRoles   = dests.filter(d => d.tipo === 'ROL').map(d => d.ref);
    const tiposDeptos  = dests.filter(d => d.tipo === 'DEPARTAMENTO').map(d => d.ref);
    const tiposUsuario = dests.filter(d => d.tipo === 'USUARIO').map(d => ({
      id: Number(d.ref),
      nombre: `Usuario #${d.ref}`,
      email: '',
      rol: '',
    }));
    if (tiposTodos) dest_tipo = 'TODOS';
    else if (tiposRoles.length) { dest_tipo = 'ROL'; dest_roles = tiposRoles; }
    else if (tiposDeptos.length) { dest_tipo = 'DEPARTAMENTO'; dest_departamentos = tiposDeptos; }
    else if (tiposUsuario.length) { dest_tipo = 'USUARIO'; dest_usuarios = tiposUsuario; }

    setForm({
      titulo:                comunicado.titulo || '',
      contenido:             comunicado.contenido || '',
      categoria:             comunicado.categoria || 'GENERAL',
      prioridad:             comunicado.prioridad || 'INFORMATIVO',
      requiere_confirmacion: comunicado.requiere_confirmacion || false,
      area_emisora:          comunicado.area_emisora || '',
      departamento_emisor_id: comunicado.departamento_emisor_id || '',
      fecha_publicacion:     comunicado.fecha_publicacion?.slice(0,10) || '',
      fecha_expiracion:      comunicado.fecha_expiracion?.slice(0,10)  || '',
      dest_tipo, dest_roles, dest_usuarios, dest_departamentos,
    });
  }, [comunicado]);

  useEffect(() => {
    if (!form.dest_usuarios.length || !usuarios.length) return;
    setForm(f => ({
      ...f,
      dest_usuarios: f.dest_usuarios.map(sel =>
        usuarios.find(u => u.id === sel.id) || sel
      ),
    }));
  }, [usuarios]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buildDestinatarios = () => {
    if (form.dest_tipo === 'TODOS') return [{ tipo: 'TODOS', ref: null }];
    if (form.dest_tipo === 'ROL')
      return form.dest_roles.map(r => ({ tipo: 'ROL', ref: r }));
    if (form.dest_tipo === 'USUARIO')
      return form.dest_usuarios.map(u => ({ tipo: 'USUARIO', ref: String(u.id) }));
    if (form.dest_tipo === 'DEPARTAMENTO')
      return form.dest_departamentos.map(id => ({ tipo: 'DEPARTAMENTO', ref: String(id) }));
    return [];
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.titulo.trim())    { setError('El título es obligatorio');   return; }
    if (!form.contenido.trim()) { setError('El contenido es obligatorio'); return; }
    const destinatarios = buildDestinatarios();
    if (!destinatarios.length)  { setError('Define al menos un destinatario'); return; }

    setSaving(true); setError('');
    try {
      const payload = {
        titulo:                form.titulo.trim(),
        contenido:             form.contenido.trim(),
        categoria:             form.categoria,
        prioridad:             form.prioridad,
        requiere_confirmacion: form.requiere_confirmacion,
        area_emisora:          form.area_emisora?.trim() || null,
        departamento_emisor_id: form.departamento_emisor_id ? Number(form.departamento_emisor_id) : null,
        fecha_publicacion:     toStartOfDay(form.fecha_publicacion),
        fecha_expiracion:      toEndOfDay(form.fecha_expiracion),
        destinatarios,
      };
      if (comunicado) {
        await api.put(`/comunicados/${comunicado.id}`, payload);
        showToast('Comunicado actualizado', 'success');
      } else {
        await api.post('/comunicados', payload);
        showToast('Comunicado creado', 'success');
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const toggleRol = rol => {
    set('dest_roles', form.dest_roles.includes(rol)
      ? form.dest_roles.filter(r => r !== rol)
      : [...form.dest_roles, rol]);
  };

  const agregarUsuario = usuario => {
    if (form.dest_usuarios.some(u => u.id === usuario.id)) return;
    set('dest_usuarios', [...form.dest_usuarios, usuario]);
    setBusquedaUsuario('');
  };

  const quitarUsuario = usuarioId => {
    set('dest_usuarios', form.dest_usuarios.filter(u => u.id !== usuarioId));
  };

  const toggleDepartamento = id => {
    const value = String(id);
    set('dest_departamentos', form.dest_departamentos.includes(value)
      ? form.dest_departamentos.filter(depId => depId !== value)
      : [...form.dest_departamentos, value]);
  };

  const usuariosFiltrados = usuarios
    .filter(u => !form.dest_usuarios.some(sel => sel.id === u.id))
    .filter(u => {
      const q = busquedaUsuario.trim().toLowerCase();
      if (!q) return true;
      return [u.nombre, u.email, u.rol, u.numero_empleado]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    })
    .slice(0, 8);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-2xl shadow-glass animate-fadeUp overflow-y-auto max-h-[92vh]">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">
            {comunicado ? '✏️ Editar comunicado' : '📢 Nuevo comunicado'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Título */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Título *</label>
            <input className="input-dark" value={form.titulo}
              onChange={e => set('titulo', e.target.value)}
              placeholder="Título del comunicado" required />
          </div>

          {/* Contenido */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Contenido *</label>
            <textarea className="input-dark resize-none" rows={5} value={form.contenido}
              onChange={e => set('contenido', e.target.value)}
              placeholder="Escribe el contenido del comunicado…" required />
          </div>

          {/* Categoría + Prioridad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Categoría</label>
              <select className="input-dark" value={form.categoria}
                onChange={e => set('categoria', e.target.value)}>
                {CATEGORIAS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Prioridad</label>
              <select className="input-dark" value={form.prioridad}
                onChange={e => set('prioridad', e.target.value)}>
                {PRIORIDADES.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </div>
          </div>

          {/* Área emisora */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Área emisora</label>
            <input className="input-dark" value={form.area_emisora}
              onChange={e => set('area_emisora', e.target.value)}
              placeholder="Ej: Dirección Académica, TI, Administración…" />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Departamento emisor</label>
            <select className="input-dark" value={form.departamento_emisor_id}
              onChange={e => set('departamento_emisor_id', e.target.value)}>
              <option value="">Sin departamento asignado</option>
              {departamentos.map(dep => (
                <option key={dep.id} value={dep.id}>{dep.nombre} ({dep.clave})</option>
              ))}
            </select>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fecha de publicación</label>
              <input type="date" className="input-dark" value={form.fecha_publicacion}
                onChange={e => set('fecha_publicacion', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fecha de expiración</label>
              <input type="date" className="input-dark" value={form.fecha_expiracion}
                onChange={e => set('fecha_expiracion', e.target.value)} />
            </div>
          </div>

          {/* Requiere confirmación */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-500"
              checked={form.requiere_confirmacion}
              onChange={e => set('requiere_confirmacion', e.target.checked)} />
            <span className="text-sm text-slate-300">Requiere confirmación de lectura</span>
          </label>

          {/* Destinatarios */}
          <div className="space-y-3 bg-white/5 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Destinatarios</p>
            <div className="flex gap-2 flex-wrap">
              {['TODOS','ROL','DEPARTAMENTO','USUARIO'].map(t => (
                <button key={t} type="button"
                  onClick={() => set('dest_tipo', t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    form.dest_tipo === t ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}>
                  {t === 'TODOS' ? 'Todos los usuarios' : t === 'ROL' ? 'Por rol' : t === 'DEPARTAMENTO' ? 'Por departamento' : 'Usuarios específicos'}
                </button>
              ))}
            </div>
            {form.dest_tipo === 'ROL' && (
              <div className="flex flex-wrap gap-2 mt-2">
                {ROLES_OPTS.map(r => (
                  <label key={r.v} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-blue-500"
                      checked={form.dest_roles.includes(r.v)}
                      onChange={() => toggleRol(r.v)} />
                    <span className="text-sm text-slate-300">{r.l}</span>
                  </label>
                ))}
              </div>
            )}
            {form.dest_tipo === 'DEPARTAMENTO' && (
              <div className="flex flex-wrap gap-2 mt-2">
                {departamentos.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay departamentos activos.</p>
                ) : departamentos.map(dep => (
                  <label key={dep.id} className="flex items-center gap-2 cursor-pointer rounded-lg bg-white/5 px-3 py-2">
                    <input type="checkbox" className="accent-blue-500"
                      checked={form.dest_departamentos.includes(String(dep.id))}
                      onChange={() => toggleDepartamento(dep.id)} />
                    <span className="text-sm text-slate-300">{dep.nombre}</span>
                    <span className="text-xs text-slate-500">{dep.clave}</span>
                  </label>
                ))}
              </div>
            )}
            {form.dest_tipo === 'USUARIO' && (
              <div className="mt-2 space-y-3">
                {form.dest_usuarios.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.dest_usuarios.map(u => (
                      <span key={u.id}
                        className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-100">
                        <span className="max-w-[220px] truncate">{u.nombre}</span>
                        {u.rol && <span className="text-blue-300/70">{u.rol}</span>}
                        <button type="button" onClick={() => quitarUsuario(u.id)}
                          className="text-blue-200/70 hover:text-white transition-colors"
                          title="Quitar destinatario">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <input
                    className="input-dark"
                    value={busquedaUsuario}
                    onChange={e => setBusquedaUsuario(e.target.value)}
                    placeholder="Buscar por nombre, correo, rol o número de empleado"
                  />
                  <div className="mt-2 rounded-xl border border-white/10 bg-slate-900/95 overflow-hidden">
                    {cargandoUsuarios ? (
                      <p className="px-3 py-3 text-sm text-slate-500">Cargando usuarios...</p>
                    ) : usuariosFiltrados.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-slate-500">
                        {busquedaUsuario.trim() ? 'No hay usuarios con esa búsqueda.' : 'No hay usuarios disponibles.'}
                      </p>
                    ) : (
                      usuariosFiltrados.map(u => (
                        <button key={u.id} type="button"
                          onClick={() => agregarUsuario(u)}
                          className="w-full px-3 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{u.nombre}</p>
                              <p className="text-xs text-slate-500 truncate">{u.email}</p>
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-white/5 text-slate-400 shrink-0">
                              {u.rol}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-blue disabled:opacity-50">
              {saving ? 'Guardando…' : comunicado ? 'Guardar cambios' : 'Crear comunicado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Panel lecturas ────────────────────────────────────────────────────────────
function PanelLecturas({ comunicado, onClose }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/comunicados/${comunicado.id}/lecturas`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [comunicado.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border-l border-white/10 flex flex-col h-full overflow-hidden animate-slideInRight">
        <div className="px-6 py-5 border-b border-white/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-white">Reporte de lecturas</h3>
              <p className="text-sm text-slate-400 mt-0.5 truncate max-w-xs">{comunicado.titulo}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white mt-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 glass rounded-xl animate-pulse" />)}
            </div>
          ) : data ? (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total',     value: data.total,      color: 'text-white'       },
                  { label: 'Leídos',    value: data.leidos,     color: 'text-green-300'   },
                  { label: 'Pendientes',value: data.pendientes, color: 'text-amber-300'   },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Barra de progreso */}
              <div className="bg-white/5 rounded-full h-2 overflow-hidden">
                <div className="bg-green-500 h-full rounded-full transition-all"
                  style={{ width: data.total ? `${(data.leidos/data.total)*100}%` : '0%' }} />
              </div>

              {/* Detalle */}
              <div className="space-y-2">
                {data.detalle.map(u => (
                  <div key={u.usuario_id}
                    className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{u.nombre}</p>
                      <p className="text-xs text-slate-500">{u.rol}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {u.confirmado ? (
                        <span className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-full">
                          ✓ Confirmado
                        </span>
                      ) : u.leido ? (
                        <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-full">
                          ✓ Leído
                        </span>
                      ) : (
                        <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-full">
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-slate-500 text-sm">No se pudo cargar el reporte.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function ComunicadosAdmin() {
  const { toast: showToast } = useToast();
  const [comunicados, setComunicados] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [modal,    setModal]    = useState(null);   // null | 'crear' | objeto comunicado
  const [lecturas, setLecturas] = useState(null);   // comunicado seleccionado para reporte
  const [confirming, setConfirming] = useState(null); // { id, accion }

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado)    params.set('estado',    filtroEstado);
      if (filtroCategoria) params.set('categoria', filtroCategoria);
      const { data } = await api.get(`/comunicados?${params}`);
      setComunicados(data);
    } catch { showToast('Error al cargar comunicados', 'error'); }
    finally { setLoading(false); }
  }, [filtroEstado, filtroCategoria]);

  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (id, endpoint, label) => {
    try {
      await api.post(`/comunicados/${id}/${endpoint}`, {});
      showToast(`Comunicado ${label}`, 'success');
      cargar();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error');
    } finally { setConfirming(null); }
  };

  const eliminar = async id => {
    try {
      await api.delete(`/comunicados/${id}`);
      showToast('Comunicado eliminado', 'success');
      cargar();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error');
    } finally { setConfirming(null); }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Comunicados</h1>
            <p className="text-slate-400 text-sm mt-0.5">Gestión de comunicados institucionales</p>
          </div>
          <button onClick={() => setModal('crear')} className="btn-blue flex items-center gap-2 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo comunicado
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3">
          {/* Estado */}
          <div className="flex gap-1 glass rounded-xl p-1">
            {[
              { k: '',          l: 'Todos'     },
              { k: 'BORRADOR',  l: 'Borrador'  },
              { k: 'PUBLICADO', l: 'Publicados' },
              { k: 'ARCHIVADO', l: 'Archivados' },
            ].map(({ k, l }) => (
              <button key={k} onClick={() => setFiltroEstado(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filtroEstado === k ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}>{l}</button>
            ))}
          </div>
          {/* Categoría */}
          <select className="input-dark !py-1.5 !text-sm w-auto"
            value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="glass rounded-2xl h-24 animate-pulse" />)}
          </div>
        ) : comunicados.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center space-y-3">
            <div className="text-5xl">📢</div>
            <p className="text-white font-semibold">Sin comunicados</p>
            <p className="text-slate-400 text-sm">Crea el primer comunicado institucional.</p>
            <button onClick={() => setModal('crear')} className="btn-blue mx-auto">
              Crear comunicado
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {comunicados.map(c => {
              const est  = ESTADOS_CFG[c.estado]  || ESTADOS_CFG.BORRADOR;
              const cat  = CAT_MAP[c.categoria]   || { l: c.categoria, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' };
              const prio = PRIO_MAP[c.prioridad]  || PRIO_MAP.INFORMATIVO;
              return (
                <div key={c.id} className="glass rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Badges */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${est.bg} ${est.text}`}>
                          {est.label}
                        </span>
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cat.color}`}>
                          {cat.l}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                          <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
                          {prio.l}
                        </span>
                        {c.requiere_confirmacion && (
                          <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded-full">
                            Req. confirmación
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-white truncate">{c.titulo}</h3>
                      <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{c.contenido}</p>
                      <div className="flex gap-3 mt-2 text-xs text-slate-500">
                        {(c.departamento_emisor_nombre || c.area_emisora) && <span>📍 {c.departamento_emisor_nombre || c.area_emisora}</span>}
                        <span>por {c.autor_nombre}</span>
                        {c.fecha_publicacion && <span>📅 {c.fecha_publicacion?.slice(0,10)}</span>}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {c.estado === 'BORRADOR' && (
                        <>
                          <button onClick={() => setModal(c)}
                            className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors">
                            ✏️ Editar
                          </button>
                          <button onClick={() => setConfirming({ id: c.id, accion: 'publicar' })}
                            className="text-xs px-3 py-1.5 bg-green-600/70 hover:bg-green-600 text-white rounded-lg transition-colors">
                            📤 Publicar
                          </button>
                          <button onClick={() => setConfirming({ id: c.id, accion: 'eliminar' })}
                            className="text-xs px-3 py-1.5 bg-red-600/40 hover:bg-red-600/70 text-red-300 rounded-lg transition-colors">
                            🗑 Eliminar
                          </button>
                        </>
                      )}
                      {c.estado === 'PUBLICADO' && (
                        <>
                          <button onClick={() => setLecturas(c)}
                            className="text-xs px-3 py-1.5 bg-blue-600/40 hover:bg-blue-600/70 text-blue-300 rounded-lg transition-colors">
                            📊 Lecturas
                          </button>
                          <button onClick={() => setConfirming({ id: c.id, accion: 'archivar' })}
                            className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors">
                            📁 Archivar
                          </button>
                        </>
                      )}
                      {c.estado === 'ARCHIVADO' && (
                        <button onClick={() => setLecturas(c)}
                          className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg transition-colors">
                          📊 Ver lecturas
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Confirmación inline */}
                  {confirming?.id === c.id && (
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-300">
                        {confirming.accion === 'publicar' && '¿Publicar este comunicado?'}
                        {confirming.accion === 'archivar' && '¿Archivar este comunicado?'}
                        {confirming.accion === 'eliminar' && '¿Eliminar permanentemente?'}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirming(null)}
                          className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg transition-colors">
                          No
                        </button>
                        <button onClick={() => {
                          if (confirming.accion === 'eliminar') eliminar(c.id);
                          else accion(c.id, confirming.accion,
                            confirming.accion === 'publicar' ? 'publicado' : 'archivado');
                        }}
                          className={`text-xs px-3 py-1.5 rounded-lg text-white transition-colors ${
                            confirming.accion === 'eliminar' ? 'bg-red-600 hover:bg-red-500'
                            : confirming.accion === 'publicar' ? 'bg-green-600 hover:bg-green-500'
                            : 'bg-slate-600 hover:bg-slate-500'
                          }`}>
                          Sí, {confirming.accion === 'eliminar' ? 'eliminar' : confirming.accion}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modal && (
        <ModalComunicado
          comunicado={modal === 'crear' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}

      {/* Panel lecturas */}
      {lecturas && (
        <PanelLecturas
          comunicado={lecturas}
          onClose={() => setLecturas(null)}
        />
      )}
    </AdminLayout>
  );
}
