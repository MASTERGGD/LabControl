/**
 * ExpedienteActivo — componente reutilizable del historial completo de un bien patrimonial.
 *
 * Modos:
 *   mode="drawer"  → panel lateral deslizante (default)
 *   mode="modal"   → diálogo centrado
 *   mode="page"    → renderizado inline (para ruta dedicada)
 *
 * Props:
 *   activoId  {number}    — ID del activo
 *   activo    {object}    — objeto con {codigo_inventario, nombre} para el header (opcional)
 *   mode      {string}    — "drawer" | "modal" | "page"
 *   onClose   {function}  — callback para cerrar (no requerido en mode="page")
 */
import { useEffect, useState, useCallback } from 'react';
import api from '../hooks/useApi';
import { useTheme } from '../context/ThemeContext';

const BADGE = {
  PENDIENTE:   'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  EN_REVISION: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  REPARADO:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  AUTORIZADO:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  EJECUTADA:   'bg-red-500/15 text-red-300 border-red-500/30',
  BAJA:        'bg-red-500/15 text-red-300 border-red-500/30',
  ACTIVO:      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  DEVUELTO:    'bg-slate-500/15 text-slate-300 border-slate-500/30',
  RECIBIDO:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  LOCALIZADO:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  NO_LOCALIZADO: 'bg-red-500/15 text-red-300 border-red-500/30',
};

function badge(val) {
  const cls = BADGE[val] || 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded border ${cls}`}>
      {val}
    </span>
  );
}

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function SectionCard({ title, items, renderItem, emptyMsg = 'Sin registros' }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-white mb-3">{title}</h4>
      {items?.length ? (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {items.map((item, i) => (
            <div key={item.id ?? i} className="text-xs border-b border-white/5 pb-2 last:border-0">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">{emptyMsg}</p>
      )}
    </div>
  );
}

function KpiRow({ data }) {
  const kpis = [
    ['Movimientos',    data?.movimientos?.length  ?? 0, 'text-blue-300'],
    ['Bajas',          data?.bajas?.length         ?? 0, 'text-red-300'],
    ['Levantamientos', data?.levantamientos?.length ?? 0, 'text-amber-300'],
    ['Préstamos',      data?.prestamos?.length      ?? 0, 'text-emerald-300'],
    ['Incidentes',     data?.incidentes?.length     ?? 0, 'text-orange-300'],
  ];
  return (
    <div className="grid grid-cols-5 gap-2">
      {kpis.map(([label, val, cls]) => (
        <div key={label} className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
          <p className={`text-2xl font-bold ${val === 0 ? 'text-slate-600' : cls}`}>{val}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

function ExpedienteContent({ activoId, activo: activoProp }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/inventario/activos/${activoId}/expediente`)
      .then(r => setData(r.data))
      .catch(() => setError('No se pudo cargar el expediente.'))
      .finally(() => setLoading(false));
  }, [activoId]); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const bien = data?.activo || activoProp;

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="text-center py-10 text-red-400 text-sm">{error}
      <button onClick={cargar} className="block mx-auto mt-3 text-xs text-slate-400 underline">Reintentar</button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header del bien */}
      {bien && (
        <div className="flex items-start gap-3 pb-4 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate">{bien.nombre}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {bien.codigo_inventario} · {bien.categoria} · {bien.estado_admin}
            </p>
            <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-400">
              {bien.departamento_nombre && <span>📍 {bien.departamento_nombre}</span>}
              {bien.responsable_nombre  && <span>👤 {bien.responsable_nombre}</span>}
              {bien.resguardante_externo_nombre && <span>👤 {bien.resguardante_externo_nombre} (externo)</span>}
            </div>
          </div>
          {bien.migrado_version && (
            <span className="text-[10px] text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded bg-amber-400/5 shrink-0">
              Datos previos a {bien.migrado_version}
            </span>
          )}
        </div>
      )}

      {/* KPIs */}
      <KpiRow data={data} />

      {/* Grilla de secciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <SectionCard
          title="Movimientos patrimoniales"
          items={data?.movimientos}
          renderItem={m => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-slate-200 font-medium">{m.tipo?.replace(/_/g,' ')}</span>
                {badge(m.estado)}
              </div>
              <p className="text-slate-400">
                {m.departamento_origen_nombre || m.ubicacion_origen_nombre || '—'}
                {' → '}
                {m.departamento_destino_nombre || m.ubicacion_destino_nombre || '—'}
              </p>
              <p className="text-slate-500 mt-0.5">{fmt(m.fecha_solicitud)}</p>
            </>
          )}
        />

        <SectionCard
          title="Solicitudes de baja"
          items={data?.bajas}
          renderItem={b => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-slate-200 font-medium truncate">{b.motivo}</span>
                {badge(b.estado)}
              </div>
              <div className="text-slate-400 space-y-0.5">
                <p>Solicitó: {b.solicitado_por || '—'} · {fmt(b.fecha_solicitud)}</p>
                {b.autorizado_por && <p>Autorizó: {b.autorizado_por} · {fmt(b.fecha_autorizacion)}</p>}
                {b.migrado_version && (
                  <p className="text-amber-400/70 italic">Previo a trazabilidad de autorización</p>
                )}
              </div>
            </>
          )}
        />

        <SectionCard
          title="Levantamientos físicos"
          items={data?.levantamientos}
          renderItem={r => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-slate-200 font-medium">{r.levantamiento_nombre || `Levantamiento #${r.levantamiento_id}`}</span>
                {badge(r.estado)}
              </div>
              <p className="text-slate-400">
                {r.ubicacion_reportada && `Ubicación reportada: ${r.ubicacion_reportada}`}
              </p>
              <p className="text-slate-500">{fmt(r.fecha_revision)} · {r.revisado_por || '—'}</p>
            </>
          )}
        />

        <SectionCard
          title="Préstamos"
          items={data?.prestamos}
          renderItem={p => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-slate-200 font-medium">{p.solicitante_nombre}</span>
                {badge(p.estado)}
              </div>
              <p className="text-slate-400">Salida: {fmt(p.fecha_salida)} · Esperado: {fmt(p.fecha_retorno_esperada)}</p>
              {p.fecha_retorno_real && <p className="text-emerald-400">Devuelto: {fmt(p.fecha_retorno_real)}</p>}
            </>
          )}
        />

        <SectionCard
          title="Incidentes"
          items={data?.incidentes}
          renderItem={i => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-slate-200 font-medium">{i.tipo} · {i.prioridad}</span>
                {badge(i.estado)}
              </div>
              <p className="text-slate-400 truncate">{i.descripcion || '—'}</p>
              <p className="text-slate-500">{fmt(i.fecha_reporte)} · Reportó: {i.reportado_por || '—'}</p>
            </>
          )}
        />

      </div>
    </div>
  );
}

// ── Wrapper según mode ──────────────────────────────────────────────────────────

export default function ExpedienteActivo({ activoId, activo, mode = 'drawer', onClose }) {
  const { themeKey } = useTheme();
  const isDark = themeKey === 'dark';

  if (mode === 'page') {
    return (
      <div className="p-6">
        <ExpedienteContent activoId={activoId} activo={activo} />
      </div>
    );
  }

  if (mode === 'modal') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose?.()}>
        <div className="glass w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-white">Expediente del bien</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto p-6">
            <ExpedienteContent activoId={activoId} activo={activo} />
          </div>
        </div>
      </div>
    );
  }

  // mode="drawer" (default) — panel lateral deslizante
  return (
    <>
      {/* Backdrop semitransparente */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl z-50 flex flex-col shadow-2xl"
           style={{ background: isDark ? 'rgba(15,23,42,0.97)' : '#ffffff', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0"
             style={{ background: isDark ? 'rgba(30,41,59,0.95)' : '#f8fafc' }}>
          <div>
            <h3 className="font-semibold text-white">Expediente del bien</h3>
            {activo && <p className="text-xs text-slate-400 mt-0.5">{activo.codigo_inventario} · {activo.nombre}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          <ExpedienteContent activoId={activoId} activo={activo} />
        </div>
      </div>
    </>
  );
}
