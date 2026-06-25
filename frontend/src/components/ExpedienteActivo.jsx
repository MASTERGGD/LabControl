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
import { formatDateInMexico, formatDateTimeInMexico } from '../utils/timezone';

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
  return formatDateInMexico(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return formatDateTimeInMexico(iso, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function label(val) {
  return val ? String(val).replace(/_/g, ' ') : '—';
}

function SectionCard({ title, items, renderItem, emptyMsg = 'Sin registros' }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  return (
    <div className={`border rounded-xl p-4 ${isDay ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
      <h4 className={`text-sm font-semibold mb-3 ${isDay ? 'text-slate-950' : 'text-white'}`}>{title}</h4>
      {items?.length ? (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {items.map((item, i) => (
            <div key={item.id ?? i} className={`text-xs border-b pb-2 last:border-0 ${isDay ? 'border-slate-100' : 'border-white/5'}`}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      ) : (
        <p className={`text-xs ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>{emptyMsg}</p>
      )}
    </div>
  );
}

function KpiRow({ data }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const kpis = [
    ['Movimientos',    data?.movimientos?.length  ?? 0, 'text-blue-300'],
    ['Bajas',          data?.bajas?.length         ?? 0, 'text-red-300'],
    ['Levantamientos', data?.levantamientos?.length ?? 0, 'text-amber-300'],
    ['Préstamos',      data?.prestamos?.length      ?? 0, 'text-emerald-300'],
    ['Auditoria',      data?.auditoria?.length      ?? 0, 'text-violet-300'],
    ['Incidentes',     data?.incidentes?.length     ?? 0, 'text-orange-300'],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {kpis.map(([label, val, cls]) => (
        <div key={label} className={`border rounded-lg p-3 text-center ${isDay ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
          <p className={`text-2xl font-bold ${val === 0 ? (isDay ? 'text-slate-600' : 'text-slate-300') : cls}`}>{val}</p>
          <p className={`text-[10px] mt-0.5 ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>{label}</p>
        </div>
      ))}
    </div>
  );
}

function Field({ label: title, value }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wide ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>{title}</p>
      <p className={`text-xs mt-0.5 ${isDay ? 'text-slate-950' : 'text-slate-100'}`}>{value || '—'}</p>
    </div>
  );
}

function Timeline({ items }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  return (
    <div className={`border rounded-xl p-4 ${isDay ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className={`text-sm font-semibold ${isDay ? 'text-slate-950' : 'text-white'}`}>Linea de tiempo</h4>
        <span className="text-[10px] text-slate-500">{items?.length || 0} evento(s)</span>
      </div>
      {items?.length ? (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {items.slice(0, 30).map((item, i) => (
            <div key={`${item.tipo}-${item.fecha}-${i}`} className="flex gap-3 text-xs">
              <div className="flex flex-col items-center">
                <span className={`w-2.5 h-2.5 rounded-full mt-1 ${
                  item.tipo === 'AUDITORIA' ? 'bg-violet-400'
                    : item.tipo === 'MOVIMIENTO' ? 'bg-blue-400'
                    : item.tipo === 'BAJA' ? 'bg-red-400'
                    : 'bg-emerald-400'
                }`} />
                {i < Math.min(items.length, 30) - 1 && <span className={`w-px flex-1 mt-1 ${isDay ? 'bg-slate-200' : 'bg-slate-700/60'}`} />}
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-semibold ${isDay ? 'text-slate-900' : 'text-slate-100'}`}>{item.titulo}</p>
                  {item.estado && badge(item.estado)}
                </div>
                {item.descripcion && <p className={`mt-0.5 ${isDay ? 'text-slate-600' : 'text-slate-300'}`}>{item.descripcion}</p>}
                <p className={`mt-0.5 ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
                  {fmtDateTime(item.fecha)}{item.actor ? ` · ${item.actor}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={`text-xs ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>Sin eventos registrados.</p>
      )}
    </div>
  );
}

function ExpedienteContent({ activoId, activo: activoProp }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
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
  const resumen = data?.resumen || {};

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
      {bien && (
        <div className={`border rounded-xl p-4 ${isDay ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className={`font-semibold truncate ${isDay ? 'text-slate-950' : 'text-white'}`}>{bien.nombre}</p>
              <p className={`text-xs mt-0.5 ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
                {bien.codigo_inventario} · {label(bien.categoria)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {badge(bien.estado_admin || 'VALIDADO')}
              {badge(bien.estado || 'OPERATIVO')}
            </div>
          </div>

          {resumen.alertas?.length > 0 && (
            <div className={`mt-4 rounded-lg border px-3 py-2 ${isDay ? 'bg-amber-50 border-amber-300' : 'bg-amber-500/10 border-amber-500/30'}`}>
              <p className={`text-xs font-semibold ${isDay ? 'text-amber-900' : 'text-amber-200'}`}>Pendientes de control</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {resumen.alertas.map((a, i) => (
                  <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${isDay ? 'text-amber-900 border-amber-300 bg-white' : 'text-amber-200 border-amber-500/30 bg-amber-500/10'}`}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            <Field label="Codigo SIGA" value={bien.codigo_inventario} />
            <Field label="No. oficial" value={bien.numero_oficial} />
            <Field label="Departamento" value={bien.departamento_nombre || bien.laboratorio_nombre} />
            <Field label="Ubicacion" value={bien.ubicacion_label || bien.ubicacion_nombre} />
            <Field label="Resguardante" value={bien.responsable_nombre || bien.resguardante_externo_nombre} />
            <Field label="Marca / modelo" value={[bien.marca, bien.modelo].filter(Boolean).join(' / ')} />
            <Field label="Serie" value={bien.numero_serie} />
            <Field label="Valor" value={bien.valor != null ? `$${Number(bien.valor).toLocaleString('es-MX')}` : null} />
            <Field label="Alcance" value={label(bien.alcance)} />
            <Field label="Ultimo evento" value={fmtDateTime(resumen.ultima_actualizacion)} />
          </div>
          <p className={`text-[11px] mt-3 ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
            El Codigo SIGA identifica al bien y se conserva aunque cambie de departamento. La transferencia actualiza el responsable patrimonial vigente y queda registrada en la linea de tiempo.
          </p>
        </div>
      )}

      {/* Header del bien */}
      {false && bien && (
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

      <Timeline items={data?.timeline || []} />

      {/* Grilla de secciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <SectionCard
          title="Movimientos patrimoniales"
          items={data?.movimientos}
          renderItem={m => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`font-medium ${isDay ? 'text-slate-900' : 'text-slate-100'}`}>{m.tipo?.replace(/_/g,' ')}</span>
                {badge(m.estado)}
              </div>
              <p className={isDay ? 'text-slate-600' : 'text-slate-300'}>
                {m.departamento_origen_nombre || m.ubicacion_origen_nombre || '—'}
                {' → '}
                {m.departamento_destino_nombre || m.ubicacion_destino_nombre || '—'}
              </p>
              <p className={`mt-0.5 ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>{fmt(m.fecha_solicitud)}</p>
            </>
          )}
        />

        <SectionCard
          title="Solicitudes de baja"
          items={data?.bajas}
          renderItem={b => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`font-medium truncate ${isDay ? 'text-slate-900' : 'text-slate-100'}`}>{b.motivo}</span>
                {badge(b.estado)}
              </div>
              <div className={`space-y-0.5 ${isDay ? 'text-slate-600' : 'text-slate-300'}`}>
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
                <span className={`font-medium ${isDay ? 'text-slate-900' : 'text-slate-100'}`}>{r.levantamiento_nombre || `Levantamiento #${r.levantamiento_id}`}</span>
                {badge(r.estado)}
              </div>
              <p className={isDay ? 'text-slate-600' : 'text-slate-300'}>
                {r.ubicacion_reportada && `Ubicación reportada: ${r.ubicacion_reportada}`}
              </p>
              <p className={isDay ? 'text-slate-500' : 'text-slate-400'}>{fmt(r.fecha_revision)} · {r.revisado_por || '—'}</p>
            </>
          )}
        />

        <SectionCard
          title="Préstamos"
          items={data?.prestamos}
          renderItem={p => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`font-medium ${isDay ? 'text-slate-900' : 'text-slate-100'}`}>{p.solicitante_nombre}</span>
                {badge(p.estado)}
              </div>
              <p className={isDay ? 'text-slate-600' : 'text-slate-300'}>Salida: {fmt(p.fecha_salida)} · Esperado: {fmt(p.fecha_retorno_esperada)}</p>
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
                <span className={`font-medium ${isDay ? 'text-slate-900' : 'text-slate-100'}`}>{i.tipo} · {i.prioridad}</span>
                {badge(i.estado)}
              </div>
              <p className={`truncate ${isDay ? 'text-slate-600' : 'text-slate-300'}`}>{i.descripcion || '—'}</p>
              <p className={isDay ? 'text-slate-500' : 'text-slate-400'}>{fmt(i.fecha_reporte)} · Reportó: {i.reportado_por || '—'}</p>
            </>
          )}
        />

        <SectionCard
          title="Auditoria administrativa"
          items={data?.auditoria}
          renderItem={a => (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`font-medium ${isDay ? 'text-slate-900' : 'text-slate-100'}`}>{label(a.accion)}</span>
                {a.exito ? badge('OK') : badge('ERROR')}
              </div>
              <p className={isDay ? 'text-slate-600' : 'text-slate-300'}>{a.usuario_nombre || 'Sistema'}</p>
              {a.detalle?.estado_nuevo && (
                <p className={`mt-0.5 ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
                  {a.detalle.estado_anterior || '—'} → {a.detalle.estado_nuevo}
                </p>
              )}
              {a.detalle?.observaciones && (
                <p className={`mt-0.5 ${isDay ? 'text-slate-600' : 'text-slate-300'}`}>{a.detalle.observaciones}</p>
              )}
              <p className={`mt-0.5 ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>{fmtDateTime(a.fecha)}</p>
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
  const isDark = themeKey !== 'day';

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
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>Expediente del bien</h3>
            <button onClick={onClose} className={`${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'} transition-colors`}>
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
            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>Expediente del bien</h3>
            {activo && <p className="text-xs text-slate-400 mt-0.5">{activo.codigo_inventario} · {activo.nombre}</p>}
          </div>
          <button onClick={onClose} className={`${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'} transition-colors p-1`}>
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
