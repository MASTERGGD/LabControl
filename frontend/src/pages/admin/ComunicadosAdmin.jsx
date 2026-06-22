/**
 * ComunicadosAdmin.jsx
 * Vista administrativa de Comunicados Institucionales (SUPER_ADMIN / LAB_ADMIN).
 * - Listado con filtros por estado y categoría
 * - Modal crear/editar
 * - Acciones: publicar, archivar, eliminar
 * - Panel lateral de reporte de lecturas
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createBlendy } from 'blendy';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

// ─── Constantes ────────────────────────────────────────────────────────────────
const CATEGORIAS = [
  { v: 'GENERAL',        l: 'General',           color: 'bg-slate-100 text-slate-800 border-slate-300' },
  { v: 'URGENTE',        l: 'Urgente',           color: 'bg-red-50 text-red-800 border-red-300' },
  { v: 'EVENTOS',        l: 'Eventos institucionales', color: 'bg-violet-50 text-violet-800 border-violet-300' },
  { v: 'ACADEMICO',      l: 'Académico',         color: 'bg-blue-50 text-blue-800 border-blue-300' },
  { v: 'SERVICIOS_ESCOLARES', l: 'Servicios Escolares', color: 'bg-cyan-50 text-cyan-800 border-cyan-300' },
  { v: 'TUTORIA',        l: 'Tutoría',           color: 'bg-indigo-50 text-indigo-800 border-indigo-300' },
  { v: 'LABORATORIOS',   l: 'Laboratorios / TI', color: 'bg-sky-50 text-sky-800 border-sky-300' },
  { v: 'ADMINISTRATIVO', l: 'Administrativo',    color: 'bg-slate-100 text-slate-800 border-slate-300' },
  { v: 'RRHH',           l: 'Recursos Humanos',  color: 'bg-rose-50 text-rose-800 border-rose-300' },
  { v: 'MANTENIMIENTO',  l: 'Mantenimiento',     color: 'bg-orange-50 text-orange-800 border-orange-300' },
  { v: 'CONVOCATORIAS',  l: 'Convocatorias',     color: 'bg-purple-50 text-purple-800 border-purple-300' },
  { v: 'BECAS',          l: 'Becas y apoyos',    color: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  { v: 'CALENDARIO_ACADEMICO', l: 'Calendario académico', color: 'bg-amber-50 text-amber-800 border-amber-300' },
  { v: 'SEGURIDAD',      l: 'Seguridad / Protección Civil', color: 'bg-red-50 text-red-800 border-red-300' },
  { v: 'VINCULACION',    l: 'Vinculación',       color: 'bg-lime-50 text-lime-900 border-lime-300' },
];
const CATEGORIAS_SELECCIONABLES = CATEGORIAS.filter(c => c.v !== 'URGENTE');
const PRIORIDADES = [
  { v: 'INFORMATIVO', l: 'Informativo', dot: 'bg-slate-400' },
  { v: 'IMPORTANTE',  l: 'Importante',  dot: 'bg-amber-400' },
  { v: 'URGENTE',     l: 'Urgente',     dot: 'bg-red-400'   },
];
const ROLES_DESTINATARIO = ['DOCENTE', 'ADMINISTRATIVO', 'LAB_ADMIN', 'RESPONSABLE_LAB', 'TUTORIA_ADMIN', 'SERVICIOS_ESCOLARES', 'MEDICO'];
const SEGUIMIENTO_OPCIONES = [
  { v: '', l: 'Todos' },
  { v: 'CON_RESPUESTAS', l: 'Con respuestas' },
  { v: 'EN_SEGUIMIENTO', l: 'En seguimiento' },
  { v: 'REVISADOS', l: 'Revisados' },
  { v: 'PENDIENTES_LECTURA', l: 'Pendientes lectura' },
];
const generarPeriodos = () => {
  const year = new Date().getFullYear();
  const defs = [
    { n: 1, l: 'Enero-Abril' },
    { n: 2, l: 'Mayo-Agosto' },
    { n: 3, l: 'Septiembre-Diciembre' },
  ];
  return [year - 1, year, year + 1].flatMap(y =>
    defs.map(p => ({ v: `${y}-${p.n}`, l: `${p.l} ${y}` }))
  );
};
const PERIODOS_ACADEMICOS = generarPeriodos();
const ESTADOS_CFG = {
  BORRADOR:  { label: 'Borrador',  bg: 'bg-slate-500/20 border-slate-500/30', text: 'text-slate-400'  },
  PUBLICADO: { label: 'Publicado', bg: 'bg-emerald-50 border-emerald-300', text: 'text-emerald-800'  },
  ARCHIVADO: { label: 'Archivado', bg: 'bg-slate-500/10 border-slate-500/20', text: 'text-slate-500'  },
  PROGRAMADO:{ label: 'Programado', bg: 'bg-amber-500/20 border-amber-500/40', text: 'text-amber-300'  },
  EXPIRADO:  { label: 'Expirado',   bg: 'bg-slate-500/20 border-slate-500/30', text: 'text-slate-400'  },
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
  requiere_confirmacion: false, requiere_retroalimentacion: false, notificar_email: false, fijado: false,
  area_emisora: '', departamento_emisor_id: '',
  fecha_publicacion: '', fecha_expiracion: '', fecha_limite_respuesta: '',
  dest_tipo: 'TODOS', dest_roles: [], dest_usuarios: [], dest_departamentos: [],
};

const toStartOfDay = value => value ? `${value}T00:00:00` : null;
const toEndOfDay = value => value ? `${value}T23:59:59` : null;
const isFutureDate = value => value && new Date(value) > new Date();
const isPastDate = value => value && new Date(value) <= new Date();
const rangoPeriodo = value => {
  if (!value) return null;
  const [yearRaw, periodoRaw] = value.split('-');
  const year = Number(yearRaw);
  const periodo = Number(periodoRaw);
  if (!year || !periodo) return null;
  const rangos = {
    1: [new Date(year, 0, 1, 0, 0, 0), new Date(year, 3, 30, 23, 59, 59)],
    2: [new Date(year, 4, 1, 0, 0, 0), new Date(year, 7, 31, 23, 59, 59)],
    3: [new Date(year, 8, 1, 0, 0, 0), new Date(year, 11, 31, 23, 59, 59)],
  };
  return rangos[periodo] || null;
};
const toTitleCase = s =>
  s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());

const TZ = 'America/Mexico_City';
const fmtMX = (s, opts = {}) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString('es-MX', { timeZone: TZ, hour12: false, ...opts });
};

const fueActualizado = comunicado => {
  if (!comunicado?.actualizado_en) return false;
  const base = comunicado.fecha_publicacion || comunicado.creado_en;
  if (!base) return false;
  return new Date(comunicado.actualizado_en).getTime() - new Date(base).getTime() > 60_000;
};
const estadoVisible = comunicado => {
  if (comunicado.estado === 'PUBLICADO' && isFutureDate(comunicado.fecha_publicacion)) {
    return ESTADOS_CFG.PROGRAMADO;
  }
  if (comunicado.estado === 'PUBLICADO' && isPastDate(comunicado.fecha_expiracion)) {
    return ESTADOS_CFG.EXPIRADO;
  }
  return ESTADOS_CFG[comunicado.estado] || ESTADOS_CFG.BORRADOR;
};

// ─── Modal Crear/Editar ────────────────────────────────────────────────────────
function ModalComunicado({ comunicado, onClose, onSaved }) {
  const { toast: showToast } = useToast();
  const { usuario: usuarioActual } = useAuth();
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [form, setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [categoriasPermitidas, setCategoriasPermitidas] = useState(CATEGORIAS_SELECCIONABLES);
  const [busquedaUsuario, setBusquedaUsuario] = useState('');
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);
  const [adjuntosNuevos, setAdjuntosNuevos] = useState([]);

  const esTutorAdmin = usuarioActual?.rol === 'TUTORIA_ADMIN';
  const fechaPublicacionBloqueada = comunicado?.estado === 'PUBLICADO' && !isFutureDate(comunicado?.fecha_publicacion);

  useEffect(() => {
    setCargandoUsuarios(true);
    api.get(esTutorAdmin ? '/usuarios?rol=DOCENTE&activo=true' : '/usuarios?activo=true')
      .then(res => setUsuarios(Array.isArray(res.data) ? res.data : []))
      .catch(() => setUsuarios([]))
      .finally(() => setCargandoUsuarios(false));
    api.get('/departamentos?activo=true')
      .then(res => setDepartamentos(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDepartamentos([]));
  }, [esTutorAdmin]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (!esTutorAdmin && usuarioActual?.rol !== 'ADMINISTRATIVO' && form.departamento_emisor_id) {
      params.set('departamento_id', form.departamento_emisor_id);
    }
    api.get(`/comunicados/categorias-permitidas${params.toString() ? `?${params}` : ''}`)
      .then(res => {
        const permitidasRaw = Array.isArray(res.data)
          ? res.data.map(cat => {
              const local = CAT_MAP[cat.value];
              return { v: cat.value, l: local?.l || cat.label, color: local?.color || 'bg-slate-500/20 text-slate-300 border-slate-500/30' };
            })
          : CATEGORIAS_SELECCIONABLES;
        const permitidas = permitidasRaw.filter(cat => cat.v !== 'URGENTE');
        setCategoriasPermitidas(permitidas);
        if (permitidas.length && !permitidas.some(cat => cat.v === form.categoria)) {
          setForm(f => ({ ...f, categoria: permitidas[0].v }));
        }
      })
      .catch(() => setCategoriasPermitidas(CATEGORIAS_SELECCIONABLES));
  }, [esTutorAdmin, usuarioActual?.rol, form.departamento_emisor_id, form.categoria]);

  useEffect(() => {
    if (!comunicado) {
      setForm({
        ...EMPTY_FORM,
        categoria: EMPTY_FORM.categoria,
        area_emisora: esTutorAdmin ? 'Tutoría' : EMPTY_FORM.area_emisora,
        dest_tipo: esTutorAdmin ? 'ROL' : EMPTY_FORM.dest_tipo,
        dest_roles: esTutorAdmin ? ['DOCENTE'] : EMPTY_FORM.dest_roles,
        departamento_emisor_id: usuarioActual?.rol === 'ADMINISTRATIVO'
          ? (usuarioActual?.departamento_id || '')
          : '',
      });
      setAdjuntosNuevos([]);
      return;
    }
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
      requiere_retroalimentacion: comunicado.requiere_retroalimentacion || false,
      notificar_email:       comunicado.notificar_email || false,
      fijado:                comunicado.fijado || false,
      area_emisora:          comunicado.area_emisora || '',
      departamento_emisor_id: comunicado.departamento_emisor_id || '',
      fecha_publicacion:     comunicado.fecha_publicacion?.slice(0,10) || '',
      fecha_expiracion:      comunicado.fecha_expiracion?.slice(0,10)  || '',
      fecha_limite_respuesta: comunicado.fecha_limite_respuesta?.slice(0,10) || '',
      dest_tipo, dest_roles, dest_usuarios, dest_departamentos,
    });
    setAdjuntosNuevos([]);
  }, [comunicado, usuarioActual, esTutorAdmin]);

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

  useEffect(() => {
    if (!comunicado && form.prioridad === 'URGENTE' && !form.notificar_email) {
      setForm(f => ({ ...f, notificar_email: true }));
    }
  }, [comunicado, form.prioridad, form.notificar_email]);

  const buildDestinatarios = () => {
    if (esTutorAdmin && form.dest_tipo === 'ROL') return [{ tipo: 'ROL', ref: 'DOCENTE' }];
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
        requiere_retroalimentacion: form.requiere_retroalimentacion,
        notificar_email:       form.notificar_email,
        fecha_limite_respuesta: toEndOfDay(form.fecha_limite_respuesta),
        fijado:                form.fijado,
        area_emisora:          esTutorAdmin ? 'Tutoría' : (form.area_emisora?.trim() || null),
        departamento_emisor_id: esTutorAdmin ? null : usuarioActual?.rol === 'ADMINISTRATIVO'
          ? (usuarioActual?.departamento_id || null)
          : (form.departamento_emisor_id ? Number(form.departamento_emisor_id) : null),
        fecha_publicacion:     fechaPublicacionBloqueada ? undefined : toStartOfDay(form.fecha_publicacion),
        fecha_expiracion:      toEndOfDay(form.fecha_expiracion),
        destinatarios,
      };
      let guardado;
      if (comunicado) {
        const { data } = await api.put(`/comunicados/${comunicado.id}`, payload);
        guardado = data;
        showToast('Comunicado actualizado', 'success');
      } else {
        const { data } = await api.post('/comunicados', payload);
        guardado = data;
        showToast('Comunicado creado', 'success');
      }
      for (const file of adjuntosNuevos) {
        const fd = new FormData();
        fd.append('archivo', file);
        await api.post(`/comunicados/${guardado.id}/adjuntos`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
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

  const elegirAdjuntos = files => {
    const nuevos = Array.from(files || []);
    const permitidos = nuevos.filter(file =>
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      && file.size <= 5 * 1024 * 1024
    );
    if (permitidos.length !== nuevos.length) {
      setError('Solo se aceptan PDF, JPG, PNG o WEBP de hasta 5 MB');
    }
    setAdjuntosNuevos(prev => [...prev, ...permitidos].slice(0, 5));
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

  const esAdministrativo = usuarioActual?.rol === 'ADMINISTRATIVO';
  const rolesDisponibles = esTutorAdmin ? ROLES_OPTS.filter(r => r.v === 'DOCENTE') : ROLES_OPTS;
  const tiposDestinatario = esTutorAdmin ? ['ROL','USUARIO'] : ['TODOS','ROL','DEPARTAMENTO','USUARIO'];
  const departamentoAsignado = departamentos.find(dep => dep.id === Number(usuarioActual?.departamento_id));
  const nombreDepartamentoEmisor = usuarioActual?.departamento_nombre
    || departamentoAsignado?.nombre
    || 'Departamento no asignado';
  const claveDepartamentoEmisor = usuarioActual?.departamento_clave || departamentoAsignado?.clave;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-2xl shadow-glass animate-fadeUp overflow-y-auto max-h-[92vh]">
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-white/5 bg-slate-900/95 backdrop-blur-xl flex items-center justify-between">
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
                {categoriasPermitidas.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Se muestran solo las categorías válidas para el departamento emisor.
              </p>
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
              placeholder="Ej: Dirección Académica, TI, Administración…"
              disabled={esTutorAdmin} />
          </div>

          {esTutorAdmin ? (
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                Emisión de Tutoría
              </p>
              <p className="text-white font-semibold mt-1">
                Los comunicados se enviarán desde el proceso de Tutoría.
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Puedes enviarlos a todos los docentes o seleccionar docentes específicos.
              </p>
            </div>
          ) : esAdministrativo ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Departamento emisor
              </p>
              <p className="text-white font-semibold mt-1">
                Emite como: {nombreDepartamentoEmisor}
              </p>
              {claveDepartamentoEmisor && (
                <p className="text-xs text-amber-200/70 mt-0.5">{claveDepartamentoEmisor}</p>
              )}
              <p className="text-xs text-slate-400 mt-2">
                Tu usuario administrativo solo puede emitir comunicados desde el departamento asignado.
              </p>
            </div>
          ) : (
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
          )}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fecha de publicación</label>
              <input type="date" className="input-dark" value={form.fecha_publicacion}
                onChange={e => set('fecha_publicacion', e.target.value)}
                disabled={fechaPublicacionBloqueada} />
              {fechaPublicacionBloqueada && (
                <p className="text-xs text-amber-300 mt-1">
                  Fecha bloqueada: este comunicado ya fue visible para los usuarios.
                </p>
              )}
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

          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-white/10 bg-white/5 p-4">
            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-emerald-500"
              checked={form.notificar_email}
              onChange={e => set('notificar_email', e.target.checked)} />
            <span>
              <span className="block text-sm text-slate-200 font-medium">Notificar por correo institucional</span>
              <span className="block text-xs text-slate-500 mt-1">
                El correo solo avisa que hay un comunicado en SIGA; la lectura y confirmación se registran en plataforma.
              </span>
              {form.notificar_email && form.fecha_publicacion && isFutureDate(toStartOfDay(form.fecha_publicacion)) && (
                <span className="block text-xs text-amber-300 mt-1">
                  Si programas una fecha futura, el correo no se enviará hasta publicar un comunicado visible.
                </span>
              )}
            </span>
          </label>

          <div className="space-y-3 bg-white/5 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-500"
                checked={form.requiere_retroalimentacion}
                onChange={e => set('requiere_retroalimentacion', e.target.checked)} />
              <span className="text-sm text-slate-300">Requiere retroalimentación</span>
            </label>
            {form.requiere_retroalimentacion && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Fecha límite de respuesta</label>
                <input type="date" className="input-dark" value={form.fecha_limite_respuesta}
                  onChange={e => set('fecha_limite_respuesta', e.target.value)} />
              </div>
            )}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-500"
                checked={form.fijado}
                onChange={e => set('fijado', e.target.checked)} />
              <span className="text-sm text-slate-300">Fijar comunicado arriba</span>
            </label>
          </div>

          <div className="space-y-3 bg-white/5 rounded-xl p-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Adjuntos</p>
              <p className="text-xs text-slate-500 mt-1">PDF, JPG, PNG o WEBP. Máximo 5 MB por archivo.</p>
            </div>
            {comunicado?.adjuntos?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {comunicado.adjuntos.map(a => (
                  <span key={a.id} className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">
                    {a.nombre_original}
                  </span>
                ))}
              </div>
            )}
            {adjuntosNuevos.length > 0 && (
              <div className="space-y-1">
                {adjuntosNuevos.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span className="text-sm text-slate-300 truncate">{file.name}</span>
                    <button type="button" onClick={() => setAdjuntosNuevos(prev => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-red-300 hover:text-red-200">Quitar</button>
                  </div>
                ))}
              </div>
            )}
            <label className="block rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-center cursor-pointer hover:border-blue-500/40 transition-colors">
              <span className="text-sm text-slate-300">Seleccionar archivos</span>
              <input type="file" className="hidden" multiple accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={e => { elegirAdjuntos(e.target.files); e.target.value = ''; }} />
            </label>
          </div>

          {/* Destinatarios */}
          <div className="space-y-3 bg-white/5 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Destinatarios</p>
            <div className="flex gap-2 flex-wrap">
              {tiposDestinatario.map(t => (
                <button key={t} type="button"
                  onClick={() => set('dest_tipo', t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    form.dest_tipo === t ? 'bg-blue-600' : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                  style={form.dest_tipo === t ? { color: '#ffffff' } : undefined}>
                  {esTutorAdmin && t === 'ROL'
                    ? 'Todos los docentes'
                    : esTutorAdmin && t === 'USUARIO'
                      ? 'Docentes específicos'
                      : t === 'TODOS' ? 'Todos los usuarios' : t === 'ROL' ? 'Por rol' : t === 'DEPARTAMENTO' ? 'Por departamento' : 'Usuarios específicos'}
                </button>
              ))}
            </div>
            {form.dest_tipo === 'ROL' && (
              <div className="flex flex-wrap gap-2 mt-2">
                {rolesDisponibles.map(r => (
                  <label key={r.v} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-blue-500"
                      checked={form.dest_roles.includes(r.v)}
                      onChange={() => toggleRol(r.v)}
                      disabled={esTutorAdmin} />
                    <span className="text-sm text-slate-300">{r.l}</span>
                  </label>
                ))}
                {esTutorAdmin && (
                  <p className="basis-full text-xs text-cyan-300/80">
                    El Responsable de Tutoría solo puede emitir avisos al personal docente.
                  </p>
                )}
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
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
                        style={{
                          background: isDay ? '#dbeafe' : 'rgba(59,130,246,0.15)',
                          borderColor: isDay ? '#93c5fd' : 'rgba(59,130,246,0.3)',
                          color: isDay ? '#1e3a8a' : '#dbeafe',
                        }}>
                        <span className="max-w-[220px] truncate">{u.nombre}</span>
                        {u.rol && (
                          <span
                            className="rounded-full px-1.5 py-0.5 font-semibold"
                            style={{
                              background: isDay ? '#eff6ff' : 'rgba(147,197,253,0.12)',
                              color: isDay ? '#1d4ed8' : '#93c5fd',
                            }}
                          >
                            {u.rol}
                          </span>
                        )}
                        <button type="button" onClick={() => quitarUsuario(u.id)}
                          className="transition-colors"
                          style={{ color: isDay ? '#2563eb' : '#bfdbfe' }}
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
                  <div
                    className="mt-2 rounded-xl overflow-hidden"
                    style={{
                      background: isDay ? '#ffffff' : 'rgba(15,23,42,0.95)',
                      border: `1px solid ${isDay ? '#dbe3ef' : 'rgba(255,255,255,0.10)'}`,
                    }}
                  >
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
                          className="w-full px-3 py-2.5 text-left transition-colors last:border-b-0"
                          style={{
                            borderBottom: `1px solid ${isDay ? '#e2e8f0' : 'rgba(255,255,255,0.05)'}`,
                          }}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: isDay ? '#0f172a' : '#ffffff' }}>{u.nombre}</p>
                              <p className="text-xs truncate" style={{ color: isDay ? '#475569' : '#94a3b8' }}>{u.email}</p>
                            </div>
                            <span
                              className="text-[10px] font-semibold px-2 py-1 rounded-full shrink-0"
                              style={{
                                background: isDay ? '#f1f5f9' : 'rgba(255,255,255,0.05)',
                                color: isDay ? '#334155' : '#cbd5e1',
                                border: `1px solid ${isDay ? '#cbd5e1' : 'rgba(255,255,255,0.08)'}`,
                              }}
                            >
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

          <div className="sticky bottom-0 z-10 -mx-6 -mb-6 px-6 py-4 border-t border-white/5 bg-slate-900/95 backdrop-blur-xl flex justify-end gap-3">
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
function PanelLecturas({ comunicado, onClose, blendyId }) {
  const { usuario } = useAuth();
  const { toast: showToast } = useToast();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroLecturas, setFiltroLecturas] = useState('todos');
  const [comentarios, setComentarios] = useState({});
  const [enviando, setEnviando] = useState({});

  const cargar = useCallback(() => {
    setLoading(true);
    api.get(`/comunicados/${comunicado.id}/lecturas`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [comunicado.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const revisar = async respuestaId => {
    await api.post(`/comunicados/${comunicado.id}/respuestas/${respuestaId}/revisar`, { estado: 'REVISADO' });
    cargar();
  };

  const responderSeguimiento = async respuestaId => {
    const comentario = (comentarios[respuestaId] || '').trim();
    if (!comentario) {
      showToast('Escribe un comentario', 'error');
      return;
    }
    setEnviando(prev => ({ ...prev, [respuestaId]: true }));
    try {
      await api.post(`/comunicados/${comunicado.id}/respuestas/${respuestaId}/mensajes`, { comentario });
      setComentarios(prev => ({ ...prev, [respuestaId]: '' }));
      cargar();
    } catch (err) {
      showToast(err.response?.data?.detail || 'No se pudo enviar el comentario', 'error');
    } finally {
      setEnviando(prev => ({ ...prev, [respuestaId]: false }));
    }
  };

  const descargarRespuestaAdjunto = async (respuestaId, adjunto) => {
    const res = await api.get(
      `/comunicados/${comunicado.id}/respuestas/${respuestaId}/adjuntos/${adjunto.id}/descargar`,
      { responseType: 'blob' }
    );
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = adjunto.nombre_original;
    a.click();
    URL.revokeObjectURL(url);
  };

  const detalleFiltrado = useMemo(() => {
    const detalle = data?.detalle || [];
    if (filtroLecturas === 'leidos') return detalle.filter(u => u.leido || u.confirmado);
    if (filtroLecturas === 'pendientes') return detalle.filter(u => !u.leido && !u.confirmado);
    if (filtroLecturas === 'respondidos') return detalle.filter(u => Boolean(u.respuesta));
    return detalle;
  }, [data, filtroLecturas]);

  const resumenItems = data ? [
    { key: 'todos', label: 'Total', value: data.total, color: 'text-slate-950' },
    { key: 'leidos', label: 'Leidos', value: data.leidos, color: 'text-emerald-700' },
    comunicado.requiere_retroalimentacion
      ? { key: 'respondidos', label: 'Respondidos', value: data.respondidos, color: 'text-cyan-700' }
      : { key: 'pendientes', label: 'Pendientes', value: data.pendientes, color: 'text-amber-700' },
  ] : [];

  const cat  = CAT_MAP[comunicado.categoria]  || { l: comunicado.categoria,  color: 'bg-slate-100 text-slate-800 border-slate-300' };
  const prio = PRIO_MAP[comunicado.prioridad] || { l: comunicado.prioridad, dot: 'bg-slate-400' };
  const isUrgente = comunicado.prioridad === 'URGENTE';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        data-blendy-to={blendyId}
        className="relative w-full max-w-md bg-slate-900 border-l border-white/10 flex flex-col h-full overflow-hidden"
      >
        {/* Blendy requiere un único wrapper directo */}
        <div className="flex flex-col h-full overflow-hidden">

        {/* Header estilo MisComunicados */}
        <div className={`px-6 py-5 border-b border-white/5 flex-shrink-0 ${isUrgente ? 'bg-gradient-to-r from-red-950/40' : 'bg-gradient-to-r from-slate-800/50'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cat.color}`}>
                  {cat.l}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
                  {prio.l}
                </span>
              </div>
              <h3 className="font-bold text-white text-lg leading-snug">{comunicado.titulo}</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white mt-1 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Contenido del comunicado */}
        <div className="px-6 py-4 border-b border-white/5 flex-shrink-0 space-y-3">
          {isUrgente && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <p className="text-sm text-red-300 font-medium">Comunicado urgente — requiere atención inmediata</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Contenido</p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line bg-white/5 rounded-xl px-4 py-3">
              {comunicado.contenido}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 grid grid-cols-[110px,1fr] gap-x-3 gap-y-1.5 text-sm">
            {(comunicado.departamento_emisor_nombre || comunicado.area_emisora) && (
              <>
                <span className="text-slate-500">Área emisora</span>
                <span className="text-slate-300 font-medium">
                  {comunicado.departamento_emisor_nombre || comunicado.area_emisora}
                </span>
              </>
            )}
            <span className="text-slate-500">Publicado por</span>
            <span className="text-slate-300 font-medium">{comunicado.autor_nombre}</span>
            {comunicado.fecha_publicacion && (
              <>
                <span className="text-slate-500">Publicado el</span>
                <span className="text-slate-300">{fmtMX(comunicado.fecha_publicacion)}</span>
              </>
            )}
          </div>
        </div>

        {/* Reporte de lecturas */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reporte de lecturas</p>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : data ? (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-2">
                {resumenItems.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setFiltroLecturas(s.key)}
                    className={`rounded-xl p-3 text-center transition-all border ${
                      filtroLecturas === s.key
                        ? 'bg-blue-50 border-blue-300 shadow-lg shadow-blue-100'
                        : 'bg-slate-50 border-transparent hover:bg-slate-100'
                    }`}
                  >
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                  </button>
                ))}
              </div>

              {/* Barra de progreso */}
              <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-green-500 h-full rounded-full transition-all"
                  style={{ width: data.total ? `${(data.leidos/data.total)*100}%` : '0%' }} />
              </div>

              {/* Detalle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-slate-500">
                    Mostrando {detalleFiltrado.length} de {data.total}
                  </p>
                  {filtroLecturas !== 'todos' && (
                    <button
                      type="button"
                      onClick={() => setFiltroLecturas('todos')}
                      className="text-xs text-teal-700 hover:text-teal-900"
                    >
                      Ver todos
                    </button>
                  )}
                </div>
                {detalleFiltrado.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
                    <p className="text-sm text-slate-600">No hay usuarios en este filtro.</p>
                  </div>
                ) : detalleFiltrado.map(u => (
                  <div key={u.usuario_id}
                    className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                    <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-950 truncate">{u.nombre}</p>
                      <p className="text-xs text-slate-500">{u.rol}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {u.confirmado ? (
                        <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-full">
                          ✓ Confirmado
                        </span>
                      ) : u.leido ? (
                        <span className="text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded-full">
                          ✓ Leído
                        </span>
                      ) : (
                        <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">
                          Pendiente
                        </span>
                      )}
                    </div>
                    </div>
                    {comunicado.requiere_retroalimentacion && (
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        {u.respuesta ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className={`text-xs px-2 py-1 rounded-full border ${
                                u.respuesta.estado === 'REVISADO'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-cyan-50 text-cyan-800 border-cyan-200'
                              }`}>
                                {u.respuesta.estado === 'REVISADO' ? 'Revisado' : u.respuesta.estado === 'EN_SEGUIMIENTO' ? 'En seguimiento' : 'Respondido'}
                              </span>
                              {u.respuesta.estado !== 'REVISADO' && (
                                <button onClick={() => revisar(u.respuesta.id)}
                                  className="text-xs px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
                                  Marcar revisado
                                </button>
                              )}
                            </div>
                            <div className="space-y-2 mb-3">
                              {(u.respuesta.mensajes?.length ? u.respuesta.mensajes : [{
                                comentario: u.respuesta.comentario,
                                creado_en: u.respuesta.creado_en,
                                usuario_nombre: u.respuesta.usuario_nombre,
                              }]).map((m, idx) => (
                                <div key={m.id || idx} className={`flex ${m.usuario_id === usuario?.id ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[88%] rounded-xl border px-3 py-2 ${
                                    m.usuario_id === usuario?.id
                                      ? 'bg-blue-50 border-blue-200 text-blue-950'
                                      : 'bg-white border-slate-200 text-slate-900'
                                  }`}>
                                    <p className="text-[11px] font-medium opacity-70 mb-1">
                                      {m.usuario_nombre || (m.usuario_id === usuario?.id ? 'Tú' : u.nombre)}
                                    </p>
                                    <p className="text-sm whitespace-pre-line">{m.comentario}</p>
                                    {idx === 0 && u.respuesta.adjuntos?.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        {u.respuesta.adjuntos.map(a => (
                                          <button key={a.id} type="button"
                                            onClick={() => descargarRespuestaAdjunto(u.respuesta.id, a)}
                                            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-100">
                                            <span className="text-base">📎</span>
                                            <span className="min-w-0 flex-1 truncate">{a.nombre_original}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <p className="text-[11px] opacity-60 mt-1">
                                      {m.creado_en ? fmtMX(m.creado_en) : 'Enviado'}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-2">
                              <textarea
                                rows={2}
                                value={comentarios[u.respuesta.id] || ''}
                                onChange={e => setComentarios(prev => ({ ...prev, [u.respuesta.id]: e.target.value }))}
                                placeholder="Responder al seguimiento..."
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                              />
                              <button
                                type="button"
                                onClick={() => responderSeguimiento(u.respuesta.id)}
                                disabled={enviando[u.respuesta.id]}
                                className="w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                              >
                                {enviando[u.respuesta.id] ? 'Enviando...' : 'Enviar comentario'}
                              </button>
                            </div>
                            {false && u.respuesta.adjuntos?.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {u.respuesta.adjuntos.map(a => (
                                  <button key={a.id} type="button"
                                    onClick={() => descargarRespuestaAdjunto(u.respuesta.id, a)}
                                    className="text-xs text-blue-300 hover:text-blue-200">
                                    {a.nombre_original}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600 italic">Sin respuesta aún</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-slate-500 text-sm">No se pudo cargar el reporte.</p>}
        </div>
        </div>{/* /blendy wrapper */}
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
function PanelRespaldos({ onClose }) {
  const { toast: showToast } = useToast();
  const [estado, setEstado] = useState(null);
  const [respaldos, setRespaldos] = useState([]);
  const [contenido, setContenido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [estadoRes, respaldosRes] = await Promise.all([
        api.get('/comunicados/respaldos/estado'),
        api.get('/comunicados/respaldos'),
      ]);
      setEstado(estadoRes.data);
      setRespaldos(Array.isArray(respaldosRes.data) ? respaldosRes.data : []);
    } catch {
      showToast('Error al cargar respaldos', 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { cargar(); }, [cargar]);

  const generar = async () => {
    setProcesando(true);
    try {
      await api.post('/comunicados/respaldos', {
        estado: 'ARCHIVADO',
        antiguedad_dias: null,
        max_mb: 500,
      });
      showToast('Respaldo generado', 'success');
      cargar();
    } catch (err) {
      showToast(err.response?.data?.detail || 'No se pudo generar el respaldo', 'error');
    } finally { setProcesando(false); }
  };

  const importar = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('archivo', file);
    setProcesando(true);
    try {
      await api.post('/comunicados/respaldos/importar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast('Respaldo importado', 'success');
      cargar();
    } catch (err) {
      showToast(err.response?.data?.detail || 'No se pudo importar el respaldo', 'error');
    } finally { setProcesando(false); }
  };

  const descargar = async respaldo => {
    try {
      const res = await api.get(`/comunicados/respaldos/${respaldo.id}/descargar`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = respaldo.nombre_archivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('No se pudo descargar el respaldo', 'error');
    }
  };

  const verContenido = async respaldo => {
    setContenido({ loading: true, respaldo });
    try {
      const { data } = await api.get(`/comunicados/respaldos/${respaldo.id}/contenido`);
      setContenido(data);
    } catch {
      showToast('No se pudo leer el respaldo', 'error');
      setContenido(null);
    }
  };

  const comunicados = contenido?.manifest?.comunicados || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-900 border-l border-white/10 flex flex-col h-full overflow-hidden animate-slideInRight">
        <div className="px-6 py-5 border-b border-white/5 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-white">Respaldos de comunicados</h3>
            <p className="text-sm text-slate-400 mt-0.5">Paquetes ZIP con historial, destinatarios y lecturas</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-20 glass rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-slate-500">Comunicados</p>
                  <p className="text-2xl font-bold text-white mt-1">{estado?.total_comunicados || 0}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-slate-500">Archivados</p>
                  <p className="text-2xl font-bold text-amber-300 mt-1">{estado?.archivados || 0}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-slate-500">Estimado</p>
                  <p className="text-2xl font-bold text-cyan-300 mt-1">{estado?.tamano_estimado_mb || 0} MB</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={generar} disabled={procesando}
                  className="btn-blue disabled:opacity-50">
                  {procesando ? 'Procesando...' : 'Generar respaldo'}
                </button>
                <label className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm cursor-pointer transition-colors">
                  Importar ZIP
                  <input type="file" accept=".zip" className="hidden" onChange={importar} disabled={procesando} />
                </label>
              </div>

              <div className="space-y-3">
                {respaldos.length === 0 ? (
                  <div className="bg-white/5 rounded-xl p-6 text-center">
                    <p className="text-white font-semibold">Sin respaldos registrados</p>
                    <p className="text-sm text-slate-400 mt-1">Genera un paquete cuando tengas comunicados archivados.</p>
                  </div>
                ) : respaldos.map(r => (
                  <div key={r.id} className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{r.nombre_archivo}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {r.total_comunicados} comunicados - {r.tamano_mb} MB - {r.creado_en?.slice(0,10)}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-1 truncate">SHA-256: {r.sha256}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => verContenido(r)}
                          className="text-xs px-3 py-1.5 bg-blue-600/40 hover:bg-blue-600/70 text-blue-300 rounded-lg transition-colors">
                          Ver
                        </button>
                        <button onClick={() => descargar(r)} disabled={!r.disponible}
                          className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors disabled:opacity-40">
                          Descargar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {contenido && (
                <div className="border-t border-white/5 pt-5">
                  <h4 className="font-semibold text-white">Contenido del respaldo</h4>
                  {contenido.loading ? (
                    <p className="text-sm text-slate-400 mt-2">Leyendo respaldo...</p>
                  ) : comunicados.length === 0 ? (
                    <p className="text-sm text-slate-400 mt-2">El respaldo no contiene comunicados.</p>
                  ) : (
                    <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                      {comunicados.slice(0, 50).map(c => (
                        <div key={`${c.id}-${c.creado_en}`} className="bg-black/20 rounded-lg px-3 py-2">
                          <p className="text-sm font-medium text-white truncate">{c.titulo}</p>
                          <p className="text-xs text-slate-500">
                            {c.estado} - {c.categoria} - {c.creado_en?.slice(0,10)} - {c.lecturas?.length || 0} lecturas
                          </p>
                        </div>
                      ))}
                      {comunicados.length > 50 && (
                        <p className="text-xs text-slate-500">Mostrando 50 de {comunicados.length} comunicados.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComunicadosAdmin() {
  const { toast: showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [comunicados, setComunicados] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filtroEstado, setFiltroEstado]   = useState(searchParams.get('estado') || '');
  const categoriaInicial = searchParams.get('categoria') || '';
  const prioridadInicial = searchParams.get('prioridad') || '';
  const [filtroCategoria, setFiltroCategoria] = useState(categoriaInicial === 'URGENTE' ? '' : categoriaInicial);
  const [busqueda, setBusqueda] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState(categoriaInicial === 'URGENTE' ? 'URGENTE' : prioridadInicial);
  const [requiereConfirmacion, setRequiereConfirmacion] = useState(false);
  const [requiereRetro, setRequiereRetro] = useState(false);
  const [soloFijados, setSoloFijados] = useState(false);
  const [filtrosAvanzados, setFiltrosAvanzados] = useState(false);
  const [destTipo, setDestTipo] = useState('');
  const [destBusqueda, setDestBusqueda] = useState('');
  const [seguimiento, setSeguimiento] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [publicadoDesde, setPublicadoDesde] = useState('');
  const [publicadoHasta, setPublicadoHasta] = useState('');
  const [modal,    setModal]    = useState(null);
  const [lecturas, setLecturas] = useState(null);
  const [panelRespaldos, setPanelRespaldos] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const blendyRef = useRef(null);

  useEffect(() => {
    blendyRef.current = createBlendy({ animation: 'spring' });
    return () => { blendyRef.current = null; };
  }, []);

  const cargar = useCallback(async (resetPage = false) => {
    setLoading(true);
    const currentPage = resetPage ? 1 : page;
    if (resetPage) setPage(1);
    try {
      const params = new URLSearchParams();
      if (filtroEstado)    params.set('estado',    filtroEstado);
      if (filtroCategoria) params.set('categoria', filtroCategoria);
      if (busqueda.trim()) params.set('q', busqueda.trim());
      if (filtroPrioridad) params.set('prioridad', filtroPrioridad);
      if (requiereConfirmacion) params.set('requiere_confirmacion', 'true');
      if (requiereRetro) params.set('requiere_retroalimentacion', 'true');
      if (soloFijados) params.set('fijado', 'true');
      if (destTipo) params.set('dest_tipo', destTipo);
      if (destBusqueda.trim()) params.set('dest_busqueda', destBusqueda.trim());
      if (seguimiento) params.set('seguimiento', seguimiento);
      if (periodo) params.set('periodo', periodo);
      if (publicadoDesde) params.set('publicado_desde', toStartOfDay(publicadoDesde));
      if (publicadoHasta) params.set('publicado_hasta', toEndOfDay(publicadoHasta));
      params.set('page', currentPage);
      params.set('page_size', pageSize);
      const { data } = await api.get(`/comunicados?${params}`);
      setComunicados(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch { showToast('Error al cargar comunicados', 'error'); }
    finally { setLoading(false); }
  }, [filtroEstado, filtroCategoria, busqueda, filtroPrioridad, requiereConfirmacion, requiereRetro, soloFijados, destTipo, destBusqueda, seguimiento, periodo, publicadoDesde, publicadoHasta, page, pageSize]);

  // Cambio de página o page_size → cargar sin reset
  useEffect(() => { cargar(); }, [page, pageSize]);
  // Cambio de cualquier filtro → volver a página 1
  useEffect(() => { cargar(true); }, [filtroEstado, filtroCategoria, busqueda, filtroPrioridad, requiereConfirmacion, requiereRetro, soloFijados, destTipo, destBusqueda, seguimiento, periodo, publicadoDesde, publicadoHasta]);

  useEffect(() => {
    const estado = searchParams.get('estado') || '';
    const categoria = searchParams.get('categoria') || '';
    const prioridad = searchParams.get('prioridad') || '';
    setFiltroEstado(estado);
    setFiltroCategoria(categoria === 'URGENTE' ? '' : categoria);
    setFiltroPrioridad(categoria === 'URGENTE' ? 'URGENTE' : prioridad);
    if (searchParams.get('nuevo') === '1') {
      setModal('crear');
      const next = new URLSearchParams(searchParams);
      next.delete('nuevo');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Abrir panel de retroalimentación cuando se llega desde una notificación (?id=)
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam || comunicados.length === 0) return;
    const target = comunicados.find(c => c.id === parseInt(idParam));
    if (target) {
      setLecturas(target);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, comunicados, setSearchParams]);

  const abrirLecturas = (c) => {
    setLecturas(c);
    // Esperar dos frames: uno para que React renderice el panel,
    // otro para que el navegador lo pinte antes de que Blendy lo mida
    requestAnimationFrame(() => requestAnimationFrame(() => {
      blendyRef.current?.update();
      blendyRef.current?.toggle(`lecturas-${c.id}`);
    }));
  };

  const cerrarLecturas = () => {
    if (!lecturas) return;

    let cerrado = false;
    const finalizar = () => {
      if (cerrado) return;
      cerrado = true;
      setLecturas(null);
    };

    try {
      if (blendyRef.current?.untoggle) {
        blendyRef.current.untoggle(`lecturas-${lecturas.id}`, finalizar);
        window.setTimeout(finalizar, 320);
      } else {
        finalizar();
      }
    } catch {
      finalizar();
    }
  };

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

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstado('');
    setFiltroCategoria('');
    setFiltroPrioridad('');
    setRequiereConfirmacion(false);
    setRequiereRetro(false);
    setSoloFijados(false);
    setDestTipo('');
    setDestBusqueda('');
    setSeguimiento('');
    setPeriodo('');
    setPublicadoDesde('');
    setPublicadoHasta('');
  };

  const filtrosActivos = [
    busqueda.trim(),
    filtroEstado,
    filtroCategoria,
    filtroPrioridad,
    requiereConfirmacion,
    requiereRetro,
    soloFijados,
    destTipo,
    destBusqueda.trim(),
    seguimiento,
    periodo,
    publicadoDesde,
    publicadoHasta,
  ].filter(Boolean).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Comunicados</h1>
            <p className="text-slate-400 text-sm mt-0.5">Gestión de comunicados institucionales</p>
          </div>
          <div className="flex gap-2 self-start">
            <button onClick={() => setPanelRespaldos(true)}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition-colors">
              Respaldos
            </button>
            <button onClick={() => setModal('crear')} className="btn-blue flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Nuevo comunicado
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="space-y-3">
        {/* ── Fila 1: búsqueda + botones de estado ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por titulo, contenido, area o autor..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
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
                  filtroEstado === k ? 'bg-emerald-600 !text-white' : 'text-slate-400 hover:text-white'
                }`}>{l}</button>
            ))}
          </div>
        </div>
        {/* ── Fila 2: selectores de categoría, prioridad, periodo y acciones ── */}
        <div className="flex items-center gap-2">
          {/* Categoría */}
          <select className="input-dark !py-1.5 !text-sm flex-1 min-w-0"
            value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS_SELECCIONABLES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
          <select className="input-dark !py-1.5 !text-sm flex-1 min-w-0"
            value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)}>
            <option value="">Todas las prioridades</option>
            {PRIORIDADES.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <select className="input-dark !py-1.5 !text-sm flex-1 min-w-0"
            value={periodo} onChange={e => setPeriodo(e.target.value)}>
            <option value="">Todos los periodos</option>
            {PERIODOS_ACADEMICOS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <div className="flex items-center gap-2 pl-3 border-l border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setFiltrosAvanzados(v => !v)}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Más filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
            </button>
            {filtrosActivos > 0 && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-sm text-slate-700 hover:bg-slate-200 whitespace-nowrap"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        {filtrosAvanzados && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={requiereConfirmacion} onChange={e => setRequiereConfirmacion(e.target.checked)} />
                Requiere confirmacion
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={requiereRetro} onChange={e => setRequiereRetro(e.target.checked)} />
                Requiere retroalimentacion
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={soloFijados} onChange={e => setSoloFijados(e.target.checked)} />
                Solo fijados
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm text-slate-700">
                <span className="block text-xs font-medium text-slate-500">Publicado desde</span>
                <input
                  type="date"
                  value={publicadoDesde}
                  onChange={e => setPublicadoDesde(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-sm text-slate-700">
                <span className="block text-xs font-medium text-slate-500">Publicado hasta</span>
                <input
                  type="date"
                  value={publicadoHasta}
                  onChange={e => setPublicadoHasta(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <div className="hidden md:block" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={destTipo}
                onChange={e => { setDestTipo(e.target.value); setDestBusqueda(''); }}
              >
                <option value="">Destinatario: cualquiera</option>
                <option value="TODOS">Todos</option>
                <option value="ROL">Rol</option>
                <option value="USUARIO">Usuario</option>
                <option value="DEPARTAMENTO">Departamento</option>
              </select>
              {destTipo === 'ROL' ? (
                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={destBusqueda}
                  onChange={e => setDestBusqueda(e.target.value)}
                >
                  <option value="">Cualquier rol</option>
                  {ROLES_DESTINATARIO.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <input
                  value={destBusqueda}
                  onChange={e => setDestBusqueda(e.target.value)}
                  disabled={!destTipo || destTipo === 'TODOS'}
                  placeholder={destTipo === 'USUARIO' ? 'Buscar usuario...' : destTipo === 'DEPARTAMENTO' ? 'Buscar departamento...' : 'Selecciona tipo'}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 disabled:bg-slate-50"
                />
              )}
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={seguimiento}
                onChange={e => setSeguimiento(e.target.value)}
              >
                {SEGUIMIENTO_OPCIONES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
        )}
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
              const est  = estadoVisible(c);
              const cat  = CAT_MAP[c.categoria]   || { l: c.categoria, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' };
              const prio = PRIO_MAP[c.prioridad]  || PRIO_MAP.INFORMATIVO;
              const programado = c.estado === 'PUBLICADO' && isFutureDate(c.fecha_publicacion);
              const actualizado = fueActualizado(c);
              return (
                <div key={c.id}
                  className="glass rounded-2xl px-5 py-4 cursor-pointer hover:bg-white/[0.03] transition-colors"
                  onClick={() => abrirLecturas(c)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">

                      {/* Fila superior: estado + categoría + indicadores discretos */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {/* Estado — badge principal con color fuerte */}
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${est.bg} ${est.text}`}>
                          {est.label}
                        </span>
                        {/* Categoría */}
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${cat.color}`}>
                          {cat.l}
                        </span>
                        {/* Prioridad: solo punto + texto, sin fondo */}
                        {prio.v !== 'INFORMATIVO' && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
                            {prio.l}
                          </span>
                        )}
                        {/* Indicadores discretos (iconos, sin fondo de color) */}
                        {c.fijado && (
                          <span title="Fijado" className="text-slate-400 text-sm leading-none">📌</span>
                        )}
                        {c.requiere_confirmacion && (
                          <span title="Requiere confirmación" className="text-slate-400 text-sm leading-none">✅</span>
                        )}
                        {c.requiere_retroalimentacion && (
                          <span title="Requiere retroalimentación" className="text-slate-400 text-sm leading-none">💬</span>
                        )}
                        {c.notificar_email && (
                          <span title="Envía correo" className="text-slate-400 text-sm leading-none">✉️</span>
                        )}
                        {c.adjuntos?.length > 0 && (
                          <span title={`${c.adjuntos.length} adjunto(s)`} className="text-slate-400 text-sm leading-none">
                            📎 <span className="text-xs">{c.adjuntos.length}</span>
                          </span>
                        )}
                        {programado && (
                          <span className="text-xs text-amber-400 font-medium">⏰ Programado</span>
                        )}
                      </div>

                      {/* Título — más peso visual, estilo título */}
                      <h3 className="font-bold text-white text-base leading-snug">
                        {toTitleCase(c.titulo)}
                      </h3>
                      <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">{c.contenido}</p>

                      {/* Metadatos — gris neutro uniforme, sin colores que compitan */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-slate-500">
                        {(c.departamento_emisor_nombre || c.area_emisora) && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            {c.departamento_emisor_nombre || c.area_emisora}
                          </span>
                        )}
                        <span>por {c.autor_nombre}</span>
                        {c.fecha_publicacion && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                            {c.fecha_publicacion.slice(0,10)}
                          </span>
                        )}
                        {actualizado && (
                          <span>Actualizado {fmtMX(c.actualizado_en)}</span>
                        )}
                        {c.email_ultimo_envio && (
                          <span>Correos {c.email_enviados || 0} enviados · {c.email_fallidos || 0} fallidos</span>
                        )}
                      </div>
                    </div>

                    {/* Acciones — ancho uniforme en todos los botones */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0 w-[92px]" onClick={e => e.stopPropagation()}>
                      {/* Lecturas — acción primaria, Blendy origin */}
                      <button
                        data-blendy-from={`lecturas-${c.id}`}
                        onClick={() => abrirLecturas(c)}
                        className="w-full text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium text-center">
                        <span>Lecturas</span>
                      </button>
                      {/* Editar — ghost, solo si no archivado */}
                      {c.estado !== 'ARCHIVADO' && (
                        <button onClick={() => setModal(c)}
                          className="w-full text-xs px-3 py-1.5 border border-white/15 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg transition-colors text-center">
                          Editar
                        </button>
                      )}
                      {/* Publicar (borrador) */}
                      {c.estado === 'BORRADOR' && (
                        <button onClick={() => setConfirming({ id: c.id, accion: 'publicar' })}
                          className="w-full text-xs px-3 py-1.5 border border-emerald-600/50 hover:bg-emerald-600/20 text-emerald-400 rounded-lg transition-colors text-center">
                          Publicar
                        </button>
                      )}
                      {/* Archivar / Eliminar */}
                      {c.estado === 'PUBLICADO' && (
                        <button onClick={() => setConfirming({ id: c.id, accion: 'archivar' })}
                          className="w-full text-xs px-3 py-1.5 border border-white/10 hover:bg-white/5 text-slate-500 hover:text-slate-300 rounded-lg transition-colors text-center">
                          Archivar
                        </button>
                      )}
                      {c.estado === 'BORRADOR' && (
                        <button onClick={() => setConfirming({ id: c.id, accion: 'eliminar' })}
                          className="w-full text-xs px-3 py-1.5 border border-red-500/20 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors text-center">
                          Eliminar
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

        {/* ── Paginación ── */}
        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span>Mostrando {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} de {total} comunicados</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="ml-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs px-2 py-1"
              >
                {[10, 25, 50].map(n => <option key={n} value={n}>{n} por página</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-40 transition-colors">
                ‹
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) => p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 text-sm">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      page === p
                        ? 'bg-emerald-600 border-emerald-600 text-white font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    {p}
                  </button>
                ))
              }
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-40 transition-colors">
                ›
              </button>
            </div>
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
          onClose={cerrarLect