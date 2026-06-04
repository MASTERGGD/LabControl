import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import SelectDark from '../../components/SelectDark';
import ExpedienteActivo from '../../components/ExpedienteActivo';
import api from '../../hooks/useApi';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';

const ESTADOS_REVISION = ['LOCALIZADO','NO_LOCALIZADO','OTRA_UBICACION','DANADO','PROPUESTO_BAJA','DATOS_INCOMPLETOS'];

const REVISION_BADGE = {
  LOCALIZADO:      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  NO_LOCALIZADO:   'bg-red-500/15 text-red-300 border-red-500/30',
  OTRA_UBICACION:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
  DANADO:          'bg-orange-500/15 text-orange-300 border-orange-500/30',
  PROPUESTO_BAJA:  'bg-red-900/30 text-red-300 border-red-700/30',
  DATOS_INCOMPLETOS: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}

function RevBadge({ estado }) {
  const cls = REVISION_BADGE[estado] || 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded border ${cls}`}>
      {estado?.replace(/_/g,' ')}
    </span>
  );
}

// ── Modal de revisión de un activo ─────────────────────────────────────────────
function ModalRevision({ levantamientoId, activo, onClose, onDone }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    estado: 'LOCALIZADO',
    ubicacion_reportada: '',
    resguardante_reportado: '',
    observaciones: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/inventario/levantamientos/${levantamientoId}/revisiones`, {
        activo_id: activo.id,
        ...form,
      });
      addToast('Revisión registrada', 'success');
      onDone?.();
      onClose();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Error al registrar revisión', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-semibold text-white mb-1">Registrar revisión física</h3>
        <p className="text-xs text-slate-400 mb-4">{activo.codigo_inventario} · {activo.nombre}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Estado del bien *</label>
            <SelectDark
              value={form.estado}
              onChange={v => setForm(f => ({ ...f, estado: v }))}
              options={ESTADOS_REVISION.map(e => ({ value: e, label: e.replace(/_/g,' ') }))}
            />
          </div>
          {['OTRA_UBICACION','DATOS_INCOMPLETOS'].includes(form.estado) && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ubicación reportada</label>
              <input value={form.ubicacion_reportada}
                onChange={e => setForm(f => ({ ...f, ubicacion_reportada: e.target.value }))}
                className="input-dark w-full" placeholder="Ej. Sala de cómputo 2, Edificio A" />
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Resguardante reportado</label>
            <input value={form.resguardante_reportado}
              onChange={e => setForm(f => ({ ...f, resguardante_reportado: e.target.value }))}
              className="input-dark w-full" placeholder="Nombre de quien tiene el bien" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Observaciones</label>
            <textarea value={form.observaciones}
              onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
              rows={3} className="input-dark w-full resize-none"
              placeholder="Condición física, daños observados, etc." />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-ghost text-slate-400">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-emerald">
              {saving ? 'Guardando...' : 'Registrar revisión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Vista de un levantamiento abierto (lista de bienes) ────────────────────────
function VistaLevantamiento({ lev, onBack, onRefresh }) {
  const { addToast } = useToast();
  const [activos, setActivos]   = useState([]);
  const [revisiones, setRevisiones] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [revisar, setRevisar]   = useState(null);
  const [expediente, setExpediente] = useState(null);
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const scope = lev.laboratorio_id
        ? `laboratorio_id=${lev.laboratorio_id}`
        : lev.departamento_id
          ? `departamento_id=${lev.departamento_id}`
          : '';
      const [rActivos, rLev] = await Promise.all([
        api.get(`/inventario/activos?${scope}&page_size=500`),
        api.get(`/inventario/levantamientos`),
      ]);
      setActivos(Array.isArray(rActivos.data) ? rActivos.data : rActivos.data?.items || []);
      const levActual = rLev.data.find(l => l.id === lev.id);
      setRevisiones(levActual?.revisiones || []);
    } catch { addToast('Error al cargar activos', 'error'); }
    finally { setLoading(false); }
  }, [lev.id]); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const cerrar = async () => {
    setCerrando(true);
    try {
      await api.post(`/inventario/levantamientos/${lev.id}/cerrar`);
      addToast('Levantamiento cerrado', 'success');
      onRefresh();
      onBack();
    } catch (e) {
      addToast(e.response?.data?.detail || 'Error al cerrar', 'error');
    } finally { setCerrando(false); }
  };

  const revisionDeActivo = (activoId) => revisiones.find(r => r.activo_id === activoId);
  const revisados = revisiones.length;
  const total     = activos.length;
  const pct       = total > 0 ? Math.round((revisados / total) * 100) : 0;

  const resumen = ESTADOS_REVISION.reduce((acc, e) => {
    acc[e] = revisiones.filter(r => r.estado === e).length;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Sub-header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm mb-1 transition-colors">
            ← Levantamientos
          </button>
          <h2 className="text-xl font-bold text-white">{lev.nombre}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Inicio: {fmt(lev.fecha_inicio)}
            {lev.laboratorio_nombre && ` · Lab: ${lev.laboratorio_nombre}`}
            {lev.departamento_nombre && ` · Depto: ${lev.departamento_nombre}`}
          </p>
        </div>
        {lev.estado === 'ABIERTO' && (
          <button onClick={cerrar} disabled={cerrando}
            className="btn-ghost text-amber-300 border-amber-500/30 text-sm">
            {cerrando ? 'Cerrando...' : 'Cerrar levantamiento'}
          </button>
        )}
      </div>

      {/* Progreso */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white font-medium">Progreso de revisión</span>
          <span className="text-sm text-emerald-400 font-bold">{revisados} / {total} bienes ({pct}%)</span>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
               style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {Object.entries(resumen).filter(([,v]) => v > 0).map(([estado, cnt]) => (
            <div key={estado} className="flex items-center gap-1.5 text-xs">
              <RevBadge estado={estado} />
              <span className="text-slate-400">{cnt}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla de activos */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-slate-400 uppercase">
                <th className="px-4 py-3 text-left">Bien</th>
                <th className="px-4 py-3 text-left">Resguardante</th>
                <th className="px-4 py-3 text-left">Estado revisión</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {activos.map(a => {
                const rev = revisionDeActivo(a.id);
                return (
                  <tr key={a.id} className={`hover:bg-white/3 transition-colors ${rev ? '' : 'opacity-70'}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => setExpediente(a)} className="text-left group">
                        <p className="text-white group-hover:text-emerald-400 transition-colors font-medium">{a.nombre}</p>
                        <p className="text-xs text-slate-500">{a.codigo_inventario} · {a.categoria}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {a.responsable_nombre || a.resguardante_externo_nombre || <span className="text-slate-600">Sin asignar</span>}
                    </td>
                    <td className="px-4 py-3">
                      {rev ? (
                        <div>
                          <RevBadge estado={rev.estado} />
                          {rev.observaciones && (
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[160px]">{rev.observaciones}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600 italic">Sin revisar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lev.estado === 'ABIERTO' && (
                        <button onClick={() => setRevisar(a)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                            rev
                              ? 'btn-ghost text-slate-400'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white border-0'
                          }`}>
                          {rev ? 'Actualizar' : 'Revisar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {revisar && (
        <ModalRevision
          levantamientoId={lev.id}
          activo={revisar}
          onClose={() => setRevisar(null)}
          onDone={cargar}
        />
      )}
      {expediente && (
        <ExpedienteActivo activoId={expediente.id} activo={expediente} mode="drawer" onClose={() => setExpediente(null)} />
      )}
    </div>
  );
}

// ── Página principal de levantamientos ────────────────────────────────────────
export default function InventarioLevantamientos() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [levantamientos, setLevantamientos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activo, setActivo]     = useState(null);   // levantamiento seleccionado
  const [creando, setCreando]   = useState(false);
  const [form, setForm]         = useState({ nombre: '', laboratorio_id: '', departamento_id: '' });
  const [labs, setLabs]         = useState([]);
  const [deptos, setDeptos]     = useState([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [rLev, rLabs, rDeptos] = await Promise.all([
        api.get('/inventario/levantamientos'),
        api.get('/laboratorios'),
        api.get('/departamentos'),
      ]);
      setLevantamientos(rLev.data);
      setLabs(rLabs.data);
      setDeptos(rDeptos.data);
    } catch { addToast('Error al cargar levantamientos', 'error'); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/inventario/levantamientos', {
        nombre: form.nombre,
        laboratorio_id: form.laboratorio_id || null,
        departamento_id: form.departamento_id || null,
      });
      addToast('Levantamiento creado', 'success');
      setCreando(false);
      setForm({ nombre: '', laboratorio_id: '', departamento_id: '' });
      cargar();
    } catch (e) {
      addToast(e.response?.data?.detail || 'Error al crear levantamiento', 'error');
    }
  };

  if (activo) {
    return (
      <AdminLayout>
        <div className="p-6">
          <VistaLevantamiento
            lev={activo}
            onBack={() => setActivo(null)}
            onRefresh={cargar}
          />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => navigate('/admin/inventario')} className="text-slate-400 hover:text-white transition-colors text-sm">
                ← Inventario
              </button>
            </div>
            <h1 className="text-2xl font-bold text-white">Levantamientos Físicos</h1>
            <p className="text-slate-400 text-sm mt-0.5">Verificación física del inventario patrimonial</p>
          </div>
          <button onClick={() => setCreando(true)} className="btn-emerald">
            + Nuevo levantamiento
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : levantamientos.length === 0 ? (
          <div className="text-center py-20 text-slate-500">No hay levantamientos registrados.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {levantamientos.map(l => {
              const total    = l.total_activos ?? 0;
              const revisados = l.total_revisados ?? l.revisiones?.length ?? 0;
              const pct = total > 0 ? Math.round(revisados / total * 100) : 0;
              const isAbierto = l.estado === 'ABIERTO';
              return (
                <button key={l.id} onClick={() => setActivo(l)}
                  className="glass rounded-xl p-5 text-left hover:border-emerald-500/40 transition-all border border-white/10 hover:border-white/20">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{l.nombre}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {l.laboratorio_nombre || l.departamento_nombre || 'Institucional'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ml-2 shrink-0 ${
                      isAbierto ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                    }`}>{l.estado}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Progreso</span>
                      <span className="text-emerald-400 font-medium">{revisados}/{total} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">{fmt(l.fecha_inicio)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal nuevo levantamiento */}
      {creando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold text-white mb-4">Nuevo levantamiento físico</h3>
            <form onSubmit={crear} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre del levantamiento *</label>
                <input value={form.nombre} onChange={e => setForm(f=>({...f,nombre:e.target.value}))}
                  required className="input-dark w-full" placeholder="Ej. Levantamiento Lab TI — Jun 2026" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Laboratorio (opcional)</label>
                <SelectDark value={form.laboratorio_id} onChange={v => setForm(f=>({...f,laboratorio_id:v,departamento_id:''}))}
                  options={[{value:'',label:'— Sin laboratorio —'}, ...labs.map(l=>({value:l.id,label:l.nombre}))]} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Departamento (opcional)</label>
                <SelectDark value={form.departamento_id} onChange={v => setForm(f=>({...f,departamento_id:v,laboratorio_id:''}))}
                  options={[{value:'',label:'— Sin departamento —'}, ...deptos.map(d=>({value:d.id,label:d.nombre}))]} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setCreando(false)} className="btn-ghost text-slate-400">Cancelar</button>
                <button type="submit" className="btn-emerald">Crear levantamiento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
