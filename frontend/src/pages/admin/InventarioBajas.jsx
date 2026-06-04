import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import SelectDark from '../../components/SelectDark';
import ExpedienteActivo from '../../components/ExpedienteActivo';
import api from '../../hooks/useApi';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';

const ESTADOS = ['SOLICITADA','EN_REVISION','VALIDADA_FISICAMENTE','AUTORIZADA','RECHAZADA','EJECUTADA','CANCELADA'];

const ESTADO_BADGE = {
  SOLICITADA:             'bg-blue-500/15 text-blue-300 border-blue-500/30',
  EN_REVISION:            'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  VALIDADA_FISICAMENTE:   'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  AUTORIZADA:             'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  RECHAZADA:              'bg-red-500/15 text-red-300 border-red-500/30',
  EJECUTADA:              'bg-slate-500/15 text-slate-300 border-slate-500/30',
  CANCELADA:              'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}

function BadgeEstado({ estado }) {
  const cls = ESTADO_BADGE[estado] || 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded border ${cls}`}>
      {estado?.replace(/_/g, ' ')}
    </span>
  );
}

// Mapa de transiciones: qué acciones están disponibles por estado
const ACCIONES = {
  SOLICITADA:           ['revisar', 'rechazar', 'cancelar'],
  EN_REVISION:          ['validar', 'rechazar', 'cancelar'],
  VALIDADA_FISICAMENTE: ['autorizar', 'rechazar', 'cancelar'],
  AUTORIZADA:           ['ejecutar', 'cancelar'],
  RECHAZADA:            [],
  EJECUTADA:            [],
  CANCELADA:            [],
};

const ACCION_LABEL = {
  revisar:   { label: 'Revisar',   cls: 'btn-ghost text-blue-300 border-blue-500/30'   },
  validar:   { label: 'Validar',   cls: 'btn-ghost text-cyan-300 border-cyan-500/30'   },
  autorizar: { label: 'Autorizar', cls: 'btn-ghost text-emerald-300 border-emerald-500/30' },
  ejecutar:  { label: 'Ejecutar baja', cls: 'bg-red-600 hover:bg-red-700 text-white border-0 px-3 py-1.5 rounded-lg text-xs font-medium' },
  rechazar:  { label: 'Rechazar',  cls: 'btn-ghost text-red-300 border-red-500/30'     },
  cancelar:  { label: 'Cancelar',  cls: 'btn-ghost text-slate-400'                     },
};

export default function InventarioBajas() {
  const { addToast } = useToast();
  const { themeKey } = useTheme();
  const navigate = useNavigate();

  const [bajas, setBajas]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filtroEstado, setFiltro]   = useState('');
  const [accionando, setAccionando] = useState(null);  // {bajaId, accion}
  const [obs, setObs]               = useState('');
  const [expedienteActivo, setExpedienteActivo] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtroEstado ? `?estado=${filtroEstado}` : '';
      const r = await api.get(`/inventario/bajas${params}`);
      setBajas(r.data);
    } catch { addToast('Error al cargar solicitudes de baja', 'error'); }
    finally { setLoading(false); }
  }, [filtroEstado]); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const ejecutarAccion = async () => {
    if (!accionando) return;
    try {
      await api.post(`/inventario/bajas/${accionando.bajaId}/${accionando.accion}`,
        obs ? { observaciones: obs } : {});
      addToast(`Acción "${accionando.accion}" registrada correctamente`, 'success');
      setAccionando(null);
      setObs('');
      cargar();
    } catch (e) {
      addToast(e.response?.data?.detail || 'Error al procesar la acción', 'error');
    }
  };

  const bajasFiltradas = filtroEstado ? bajas.filter(b => b.estado === filtroEstado) : bajas;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => navigate('/admin/inventario')}
                className="text-slate-400 hover:text-white transition-colors text-sm">
                ← Inventario
              </button>
            </div>
            <h1 className="text-2xl font-bold text-white">Bajas Patrimoniales</h1>
            <p className="text-slate-400 text-sm mt-0.5">Trámites de baja de bienes institucionales</p>
          </div>
          <div className="flex items-center gap-3">
            <SelectDark
              value={filtroEstado}
              onChange={setFiltro}
              options={[{value:'',label:'Todos los estados'}, ...ESTADOS.map(e=>({value:e,label:e.replace(/_/g,' ')}))]}
              placeholder="Filtrar por estado"
            />
          </div>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : bajasFiltradas.length === 0 ? (
          <div className="text-center py-20 text-slate-500">No hay solicitudes de baja{filtroEstado ? ' con ese estado' : ''}.</div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-slate-400 uppercase">
                  <th className="px-4 py-3 text-left">Bien</th>
                  <th className="px-4 py-3 text-left">Motivo</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Trazabilidad</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bajasFiltradas.map(b => (
                  <tr key={b.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpedienteActivo({ id: b.activo_id, nombre: b.activo_nombre, codigo_inventario: b.activo_codigo })}
                        className="text-left group">
                        <p className="text-white group-hover:text-emerald-400 transition-colors font-medium">{b.activo_nombre}</p>
                        <p className="text-xs text-slate-500">{b.activo_codigo}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-[200px]">
                      <p className="truncate">{b.motivo}</p>
                      {b.destino_final && <p className="text-xs text-slate-500 truncate">Destino: {b.destino_final}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <BadgeEstado estado={b.estado} />
                      {b.migrado_version && (
                        <p className="text-[10px] text-amber-400/70 mt-1 italic">Previo a v1.3</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 space-y-0.5">
                      <p>Solicitó: <span className="text-slate-300">{b.solicitado_por || '—'}</span> · {fmt(b.fecha_solicitud)}</p>
                      {b.revisado_por    && <p>Revisó: <span className="text-slate-300">{b.revisado_por}</span> · {fmt(b.fecha_revision)}</p>}
                      {b.validado_por    && <p>Validó: <span className="text-slate-300">{b.validado_por}</span> · {fmt(b.fecha_validacion)}</p>}
                      {b.autorizado_por  && <p>Autorizó: <span className="text-slate-300">{b.autorizado_por}</span> · {fmt(b.fecha_autorizacion)}</p>}
                      {b.ejecutado_por   && <p>Ejecutó: <span className="text-slate-300">{b.ejecutado_por}</span> · {fmt(b.fecha_ejecucion)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(ACCIONES[b.estado] || []).map(accion => (
                          <button
                            key={accion}
                            onClick={() => { setAccionando({ bajaId: b.id, accion, baja: b }); setObs(''); }}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${ACCION_LABEL[accion].cls}`}>
                            {ACCION_LABEL[accion].label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de confirmación de acción */}
      {accionando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold text-white mb-1 capitalize">{accionando.accion} solicitud de baja</h3>
            <p className="text-sm text-slate-400 mb-4">
              {accionando.baja?.activo_nombre} · {accionando.baja?.activo_codigo}
            </p>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Observaciones (opcional)"
              rows={3}
              className="input-dark w-full resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setAccionando(null)} className="btn-ghost text-slate-400">Cancelar</button>
              <button onClick={ejecutarAccion}
                className={accionando.accion === 'ejecutar'
                  ? 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium'
                  : 'btn-emerald'}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expediente drawer */}
      {expedienteActivo && (
        <ExpedienteActivo
          activoId={expedienteActivo.id}
          activo={expedienteActivo}
          mode="drawer"
          onClose={() => setExpedienteActivo(null)}
        />
      )}
    </AdminLayout>
  );
}
