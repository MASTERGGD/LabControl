import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { nombre: '', clave: '', descripcion: '', activo: true };

/* Devuelve siglas de máx 5 chars; si la clave ya es corta la usa tal cual */
const STOP = new Set(['Y', 'DE', 'LA', 'EL', 'LOS', 'LAS', 'DEL', 'E']);
const abrevClave = clave => {
  if (!clave) return '?';
  if (clave.length <= 6 && !clave.includes('-')) return clave.toUpperCase();
  return clave
    .split('-')
    .filter(w => w && !STOP.has(w.toUpperCase()))
    .map(w => w[0])
    .join('')
    .slice(0, 5)
    .toUpperCase();
};

/* ─── Modal: Asignar / quitar responsable ─────────────────────────────── */
function ModalResponsable({ departamento, onClose, onSaved }) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState([]);
  const [seleccionado, setSeleccionado] = useState(
    departamento.responsable_id
      ? { id: departamento.responsable_id, nombre: departamento.responsable_nombre, email: departamento.responsable_email, rol: departamento.responsable_rol }
      : null
  );
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const debounceRef = useRef(null);

  const buscar = val => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await api.get('/departamentos/usuarios/buscar', { params: { q: val } });
        setResultados(data);
      } catch { setResultados([]); }
      finally { setBuscando(false); }
    }, 300);
  };

  // Cargar lista inicial vacía al abrir
  useEffect(() => { buscar(''); }, []); // eslint-disable-line

  const asignar = async () => {
    setGuardando(true);
    try {
      await api.patch(`/departamentos/${departamento.id}/responsable`, {
        responsable_id: seleccionado?.id ?? null,
      });
      toast(seleccionado ? `Responsable asignado: ${seleccionado.nombre}` : 'Responsable quitado', 'success');
      onSaved();
    } catch (err) {
      toast(err.response?.data?.detail || 'No se pudo guardar', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const ROL_LABELS = {
    super_admin: 'Super Admin',
    lab_admin: 'Lab Admin',
    administrativo: 'Administrativo',
  };
  const ROL_COLORS = {
    super_admin: 'bg-purple-500/15 text-purple-300',
    lab_admin: 'bg-blue-500/15 text-blue-300',
    administrativo: 'bg-emerald-500/15 text-emerald-300',
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Responsable del departamento</h3>
            <p className="text-xs text-slate-400 mt-0.5">{departamento.nombre}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Responsable actual */}
          {seleccionado ? (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-blue-600/30 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{seleccionado.nombre}</p>
                <p className="text-xs text-slate-400 truncate">{seleccionado.email}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${ROL_COLORS[seleccionado.rol] || 'bg-slate-500/15 text-slate-300'}`}>
                {ROL_LABELS[seleccionado.rol] || seleccionado.rol}
              </span>
              <button onClick={() => setSeleccionado(null)} className="text-slate-400 hover:text-red-300 shrink-0" title="Quitar responsable">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">Sin responsable asignado</p>
          )}

          {/* Búsqueda */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Buscar usuario</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z"/>
              </svg>
              <input
                className="input-dark pl-9 pr-3"
                style={{ paddingLeft: 36, paddingRight: 12 }}
                value={query}
                onChange={e => buscar(e.target.value)}
                placeholder="Nombre o correo..."
              />
            </div>
          </div>

          {/* Resultados */}
          <div className="max-h-52 overflow-y-auto space-y-1 -mx-1 px-1">
            {buscando ? (
              <p className="text-xs text-slate-500 text-center py-3">Buscando...</p>
            ) : resultados.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-3">Sin resultados</p>
            ) : resultados.map(u => (
              <button
                key={u.id}
                onClick={() => setSeleccionado(u)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  seleccionado?.id === u.id
                    ? 'bg-blue-500/20 border border-blue-500/30'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-slate-300">{u.nombre?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{u.nombre}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${ROL_COLORS[u.rol] || 'bg-slate-500/15 text-slate-300'}`}>
                  {ROL_LABELS[u.rol] || u.rol}
                </span>
                {seleccionado?.id === u.id && (
                  <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                  </svg>
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
              Cancelar
            </button>
            <button onClick={asignar} disabled={guardando} className="btn-blue disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModalPermisosComunicados({ departamento, onClose }) {
  const { toast } = useToast();
  const { usuario: usuarioActual } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const isSuperAdmin = usuarioActual?.rol === 'SUPER_ADMIN';

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/departamentos/${departamento.id}/usuarios`);
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (err) {
      toast(err.response?.data?.detail || 'No se pudo cargar el personal', 'error');
    } finally {
      setLoading(false);
    }
  }, [departamento.id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggle = async (usuario, permiso, campo, extra = {}) => {
    if (usuario.es_responsable && permiso !== 'inventario:validar') return;
    const activo = !usuario[campo];
    setSavingId(usuario.id);
    try {
      const { data } = await api.patch(`/departamentos/${departamento.id}/permisos`, {
        usuario_id: usuario.id,
        permiso,
        activo,
        ...extra,
      });
      setUsuarios(prev => prev.map(u => u.id === usuario.id ? data : u));
      toast(activo ? 'Permiso activado' : 'Permiso desactivado', 'success');
    } catch (err) {
      toast(err.response?.data?.detail || 'No se pudo actualizar el permiso', 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onMouseDown={onClose}
    >
      <div
        className="glass w-full max-w-5xl shadow-glass animate-fadeUp max-h-[88vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-permisos-departamento-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h3 id="modal-permisos-departamento-title" className="font-semibold text-white">Permisos del departamento</h3>
            <p className="text-xs text-slate-400 mt-0.5">{departamento.nombre}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white rounded-lg p-2 hover:bg-white/10 transition-colors shrink-0"
            title="Cerrar"
            aria-label="Cerrar permisos"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto min-h-0">
          {loading ? (
            <div className="h-40 rounded-xl bg-white/5 animate-pulse" />
          ) : usuarios.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No hay usuarios activos asignados a este departamento.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
              <table className="w-full min-w-[820px] text-left">
                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-white/10">
                  <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-semibold">Usuario</th>
                    <th className="px-3 py-3 text-center font-semibold">Captura</th>
                    <th className="px-3 py-3 text-center font-semibold">Validacion</th>
                    {isSuperAdmin && <th className="px-3 py-3 text-center font-semibold">Institucional</th>}
                    <th className="px-3 py-3 text-center font-semibold">Comunicados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {usuarios.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-slate-300">{u.nombre?.[0]?.toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{u.nombre}</p>
                              {u.es_responsable && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20 shrink-0">
                                  Responsable
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 truncate max-w-[260px]">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Captura inventario para ${u.nombre}`}
                          className="w-4 h-4 rounded accent-emerald-500"
                          checked={!!u.puede_gestionar_inventario}
                          disabled={u.es_responsable || savingId === u.id}
                          onChange={() => toggle(u, 'inventario:write', 'puede_gestionar_inventario')}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Validar inventario para ${u.nombre}`}
                          className="w-4 h-4 rounded accent-amber-500"
                          checked={!!u.puede_validar_inventario}
                          disabled={savingId === u.id}
                          onChange={() => toggle(u, 'inventario:validar', 'puede_validar_inventario')}
                        />
                      </td>
                      {isSuperAdmin && (
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Inventario institucional para ${u.nombre}`}
                            title="Permite ver y validar inventario de toda la universidad sin cambiar la adscripcion del usuario."
                            className="w-4 h-4 rounded accent-emerald-500"
                            checked={!!u.puede_inventario_institucional}
                            disabled={savingId === u.id}
                            onChange={() => toggle(u, 'inventario:validar', 'puede_inventario_institucional', { scope_global: true })}
                          />
                        </td>
                      )}
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Comunicados para ${u.nombre}`}
                          className="w-4 h-4 rounded accent-blue-500"
                          checked={!!u.puede_enviar_comunicados}
                          disabled={u.es_responsable || savingId === u.id}
                          onChange={() => toggle(u, 'comunicados:write', 'puede_enviar_comunicados')}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-200 bg-white/10 hover:bg-white/15 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalDepartamento({ departamento, onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(departamento || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        nombre: form.nombre.trim(),
        clave: form.clave.trim() || null,
        descripcion: form.descripcion?.trim() || null,
        activo: !!form.activo,
      };
      if (departamento) {
        await api.put(`/departamentos/${departamento.id}`, payload);
        toast('Departamento actualizado', 'success');
      } else {
        await api.post('/departamentos', payload);
        toast('Departamento creado', 'success');
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar departamento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">{departamento ? 'Editar departamento' : 'Nuevo departamento'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre *</label>
            <input className="input-dark" required value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Dirección Académica" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Clave</label>
            <input className="input-dark" value={form.clave || ''}
              onChange={e => setForm({ ...form, clave: e.target.value })}
              placeholder="Ej: DIR-ACADEMICA" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Descripción</label>
            <textarea className="input-dark resize-none" rows={3} value={form.descripcion || ''}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Responsabilidad o alcance del departamento" />
          </div>
          {departamento && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" className="accent-blue-500" checked={form.activo}
                onChange={e => setForm({ ...form, activo: e.target.checked })} />
              Departamento activo
            </label>
          )}
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-blue disabled:opacity-50">
              {saving ? 'Guardando...' : departamento ? 'Guardar cambios' : 'Crear departamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalImportar({ onClose, onImported }) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    try {
      const data = new FormData();
      data.append('archivo', file);
      const res = await api.post('/departamentos/importar', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast(`Departamentos: ${res.data.resumen.creados} creados, ${res.data.resumen.actualizados} actualizados`, 'success');
      onImported();
    } catch (err) {
      toast(err.response?.data?.detail || 'No se pudo importar el archivo', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="glass w-full max-w-md p-6 space-y-4 shadow-glass animate-fadeUp">
        <div>
          <h3 className="font-semibold text-white">Importar departamentos</h3>
          <p className="text-sm text-slate-400 mt-1">Columnas: nombre, clave, descripcion, activo.</p>
        </div>
        <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white" />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancelar</button>
          <button type="submit" disabled={!file || loading} className="btn-blue disabled:opacity-50">
            {loading ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Departamentos() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const [departamentos, setDepartamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(null);
  const [importar, setImportar] = useState(false);
  const [modalResponsable, setModalResponsable] = useState(null);
  const [modalPermisos, setModalPermisos] = useState(null);
  const isSuperAdmin = usuario?.rol === 'SUPER_ADMIN';

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/departamentos');
      setDepartamentos(Array.isArray(data) ? data : []);
    } catch {
      toast('No se pudieron cargar los departamentos', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const desactivar = async dep => {
    try {
      await api.delete(`/departamentos/${dep.id}`);
      toast('Departamento desactivado', 'success');
      cargar();
    } catch (err) {
      toast(err.response?.data?.detail || 'No se pudo desactivar', 'error');
    }
  };

  const departamentosPermitidos = isSuperAdmin
    ? departamentos
    : departamentos.filter(dep => dep.responsable_id === usuario?.id);
  const visibles = departamentosPermitidos.filter(dep => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return [dep.nombre, dep.clave, dep.descripcion].filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q));
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Departamentos</h1>
            <p className="text-slate-400 text-sm mt-0.5">Áreas emisoras, responsables administrativos y segmentación institucional.</p>
          </div>
          {isSuperAdmin && <button onClick={() => setImportar(true)} className="btn-ghost flex items-center gap-2 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
            </svg>
            Importar
          </button>}
          {isSuperAdmin && <button onClick={() => setModal('crear')} className="btn-blue flex items-center gap-2 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo departamento
          </button>}
        </div>

        <div className="flex items-center gap-3">
          <input className="input-dark flex-1 max-w-md" value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar departamento o clave" />
          <span className="text-sm text-slate-500">{visibles.length} resultado{visibles.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="glass rounded-2xl h-32 animate-pulse" />
        ) : visibles.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <p className="text-white font-semibold">Sin departamentos</p>
            <p className="text-slate-400 text-sm mt-1">Crea o importa las áreas institucionales.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibles.map(dep => (
              <div key={dep.id} className="glass rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Chip de sigla — corto y uniforme, tooltip con clave completa */}
                    <span
                      title={dep.clave}
                      className="inline-block text-[11px] font-bold tracking-widest px-2 py-0.5 rounded bg-slate-700/60 text-slate-300 border border-slate-600/30 cursor-default"
                    >
                      {abrevClave(dep.clave)}
                    </span>
                    <h3
                      className="text-white font-semibold mt-2 leading-snug line-clamp-2 min-h-[2.75rem] break-words"
                      title={dep.nombre}
                    >
                      {dep.nombre}
                    </h3>
                    {dep.descripcion && (
                      <p className="text-sm text-slate-400 mt-1 line-clamp-2">{dep.descripcion}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                    dep.activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'
                  }`}>
                    {dep.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Responsable */}
                <div
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => isSuperAdmin && dep.activo && setModalResponsable(dep)}
                  title={isSuperAdmin && dep.activo ? 'Asignar responsable' : ''}
                >
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                    {dep.responsable_nombre ? (
                      <span className="text-[10px] font-bold text-slate-300">
                        {dep.responsable_nombre[0].toUpperCase()}
                      </span>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                    )}
                  </div>
                  <span className={`text-xs truncate ${dep.responsable_nombre ? 'text-slate-300' : 'text-slate-600 italic'} ${dep.activo ? 'group-hover:text-white' : ''}`}>
                    {dep.responsable_nombre || 'Sin responsable'}
                  </span>
                  {isSuperAdmin && dep.activo && (
                    <svg className="w-3 h-3 text-slate-600 group-hover:text-slate-400 shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6-6 3 3-6 6H9v-3z"/>
                    </svg>
                  )}
                </div>

                <div className="flex justify-end gap-1 border-t border-white/5 pt-3">
                  {dep.activo && (
                    <button
                      onClick={() => setModalPermisos(dep)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-emerald-300 hover:text-white hover:bg-emerald-500/10 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7 4h10a2 2 0 012 2v14l-7-3-7 3V6a2 2 0 012-2z"/>
                      </svg>
                      Permisos
                    </button>
                  )}
                  {isSuperAdmin && <button
                    onClick={() => setModal(dep)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6-6 3 3-6 6H9v-3z"/>
                    </svg>
                    Editar
                  </button>}
                  {isSuperAdmin && dep.activo && (
                    <button
                      onClick={() => desactivar(dep)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    >
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

      {modal && (
        <ModalDepartamento
          departamento={modal === 'crear' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}
      {importar && (
        <ModalImportar
          onClose={() => setImportar(false)}
          onImported={() => { setImportar(false); cargar(); }}
        />
      )}
      {modalResponsable && (
        <ModalResponsable
          departamento={modalResponsable}
          onClose={() => setModalResponsable(null)}
          onSaved={() => { setModalResponsable(null); cargar(); }}
        />
      )}
      {modalPermisos && (
        <ModalPermisosComunicados
          departamento={modalPermisos}
          onClose={() => setModalPermisos(null)}
        />
      )}
    </AdminLayout>
  );
}
