import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import SelectDark from '../../components/SelectDark';

// ─── Configuración de tipos, prioridades y estados ────────────────────────────

const TIPOS_ICON = {
  DAÑO:          { label:'Daño físico',   emoji:'💥', svg: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> },
  MANTENIMIENTO: { label:'Mantenimiento', emoji:'🔧', svg: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
  PERDIDA:       { label:'Pérdida',       emoji:'❓', svg: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  OTRO:          { label:'Otro',          emoji:'📌', svg: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg> },
};

// Iconos contextuales extra para detectar por descripción
function iconFromDesc(desc = '') {
  const d = desc.toLowerCase();
  if (d.includes('clima') || d.includes('temperatura') || d.includes('calor') || d.includes('frio'))
    return <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>;
  if (d.includes('red') || d.includes('internet') || d.includes('cable') || d.includes('switch'))
    return <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg>;
  if (d.includes('pantalla') || d.includes('monitor') || d.includes('display'))
    return <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>;
  if (d.includes('batería') || d.includes('bateria') || d.includes('corriente') || d.includes('voltaje'))
    return <svg className="w-3.5 h-3.5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>;
  return null;
}

const PRIORIDAD_BADGE = {
  ALTA: {
    cls: 'bg-red-500/20 text-red-400 border border-red-500/30',
    dayCls: 'bg-red-50 text-red-700 border border-red-300',
    label: '🔴 Alta'
  },
  MEDIA: {
    cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    dayCls: 'bg-amber-100 text-amber-800 border border-amber-300',
    label: '🟡 Media'
  },
  BAJA: {
    cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    dayCls: 'bg-slate-100 text-slate-700 border border-slate-300',
    label: '⚪ Baja'
  },
};

const COLUMNAS = [
  { key: 'PENDIENTE',   label: 'Reportados',  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)', icon: '⏳' },
  { key: 'EN_REVISION', label: 'En Revisión', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)', icon: '🔍' },
  { key: 'REPARADO',    label: 'Reparados',   color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)', icon: '✅' },
];

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day:'2-digit', month:'short' });
}

const ORIGENES = { PRESTAMO:'📦 Préstamo', SESION:'🖥️ Sesión', MANUAL:'✍️ Manual' };

// ─── Tarjeta de incidente ─────────────────────────────────────────────────────
function KanbanCard({ incidente, onDragStart, onClick, isDragOver }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const tipo  = TIPOS_ICON[incidente.tipo] || TIPOS_ICON.OTRO;
  const pri   = PRIORIDAD_BADGE[incidente.prioridad] || PRIORIDAD_BADGE.MEDIA;
  const extra = iconFromDesc(incidente.descripcion);
  const nombre = incidente.activo_nombre
    || (incidente.pc_codigo ? `PC ${incidente.pc_codigo}` : '—');

  // No permitir arrastrar si tiene adeudo pendiente (no resuelto/cancelado)
  const adeudoPendiente = incidente.adeudo_id &&
    incidente.adeudo_estado !== 'RESUELTO' && incidente.adeudo_estado !== 'CANCELADO';

  return (
    <div
      draggable={!adeudoPendiente}
      onDragStart={adeudoPendiente ? undefined : e => onDragStart(e, incidente)}
      onClick={() => onClick(incidente)}
      className={`glass-sm rounded-xl p-3.5 transition-all duration-150 select-none group
                  ${isDay ? 'bg-white border border-slate-200 hover:border-slate-300' : 'hover:brightness-110'}
                  ${adeudoPendiente ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
                  ${isDragOver ? 'ring-2 ring-blue-500/50' : ''}`}
      style={{ borderLeft: `3px solid ${incidente.prioridad === 'ALTA' ? '#ef4444' : incidente.prioridad === 'MEDIA' ? '#f59e0b' : '#475569'}` }}
    >
      {/* Cabecera: ícono tipo + nombre + badge prioridad */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0" title={tipo.label}>{tipo.emoji}</span>
          <p className={`text-sm font-semibold truncate ${isDay ? 'text-slate-950' : 'text-white'}`}>{nombre}</p>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isDay ? pri.dayCls : pri.cls}`}>
          {pri.label}
        </span>
      </div>

      {/* Descripción */}
      {incidente.descripcion && (
        <div className="flex items-start gap-1.5 mb-2">
          {extra && <span className="mt-0.5 shrink-0">{extra}</span>}
          <p className={`text-xs line-clamp-2 leading-relaxed ${isDay ? 'text-slate-700' : 'text-slate-400'}`}>{incidente.descripcion}</p>
        </div>
      )}

      {/* Badge adeudo vinculado */}
      {incidente.adeudo_id && (
        <div className="mt-2 mb-1">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border
            ${incidente.adeudo_estado === 'RESUELTO' || incidente.adeudo_estado === 'CANCELADO'
              ? isDay ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-emerald-900/30 border-emerald-500/30 text-emerald-400'
              : isDay ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-orange-900/30 border-orange-500/40 text-orange-300'}`}
            title={`Adeudo #${incidente.adeudo_id} — ${incidente.adeudo_persona || ''}`}
          >
            ⚖️ Adeudo #{incidente.adeudo_id}
            {incidente.adeudo_estado === 'RESUELTO' || incidente.adeudo_estado === 'CANCELADO'
              ? ' · Resuelto' : ' · Pendiente'}
          </span>
        </div>
      )}

      {/* Meta info */}
      <div className="flex items-center justify-between gap-2 mt-2">
        <div className={`flex items-center gap-1.5 text-[10px] ${isDay ? 'text-slate-600' : 'text-slate-500'}`}>
          {incidente.laboratorio_nombre && (
            <span className="flex items-center gap-0.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              </svg>
              <span className="truncate max-w-[80px]">{incidente.laboratorio_nombre}</span>
            </span>
          )}
        </div>
        <span className={`text-[10px] ${isDay ? 'text-slate-500' : 'text-slate-600'}`}>{formatFecha(incidente.fecha_reporte)}</span>
      </div>

      {/* Indicador de arrastre — oculto si tiene adeudo pendiente */}
      {!(incidente.adeudo_id && incidente.adeudo_estado !== 'RESUELTO' && incidente.adeudo_estado !== 'CANCELADO') && (
        <div className="flex justify-center mt-2 opacity-0 group-hover:opacity-30 transition-opacity">
          <div className="flex gap-0.5">
            {[1,2,3].map(i => <div key={i} className="w-0.5 h-3 bg-slate-400 rounded-full"/>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Columna Kanban ───────────────────────────────────────────────────────────
function KanbanColumn({ col, cards, onDrop, onDragOver, onDragLeave, isDragTarget, onCardClick, dragItem }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: isDragTarget ? col.bg : isDay ? '#ffffff' : 'rgba(15,23,42,0.5)',
        border: `1px solid ${isDragTarget ? col.border : isDay ? '#dbe3ef' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isDragTarget ? `0 0 20px ${col.border}` : 'none',
        minHeight: 400,
      }}
      onDragOver={e => { e.preventDefault(); onDragOver(col.key); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(col.key); }}
    >
      {/* Header columna */}
      <div className="px-4 py-3 flex items-center justify-between"
           style={{ borderBottom: `1px solid ${col.border}`, background: col.bg }}>
        <div className="flex items-center gap-2">
          <span className="text-base">{col.icon}</span>
          <span className={`font-semibold text-sm ${isDay ? 'text-slate-950' : 'text-white'}`}>{col.label}</span>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: col.color + '33', color: col.color, border: `1px solid ${col.color}44` }}>
          {cards.length}
        </span>
      </div>

      {/* Tarjetas */}
      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        {cards.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-10 text-xs text-center ${isDay ? 'text-slate-600' : 'text-slate-600'}`}>
            <div className="text-3xl mb-2 opacity-30">{col.icon}</div>
            <p>Sin incidentes aquí</p>
            {isDragTarget && <p className="text-slate-400 mt-1">Suelta aquí para mover</p>}
          </div>
        ) : (
          cards.map(inc => (
            <KanbanCard
              key={inc.id}
              incidente={inc}
              onDragStart={(e, item) => { e.dataTransfer.effectAllowed = 'move'; dragItem.current = item; }}
              onClick={onCardClick}
              isDragOver={false}
            />
          ))
        )}
        {isDragTarget && cards.length > 0 && (
          <div className="h-12 rounded-xl border-2 border-dashed flex items-center justify-center text-xs text-slate-500 transition-all"
               style={{ borderColor: col.color + '60' }}>
            Soltar aquí
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Drawer de detalle ────────────────────────────────────────────────────────
function DrawerDetalle({ incidente, laboratorios, onClose, onActualizado }) {
  const navigate = useNavigate();
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [form, setForm] = useState({
    estado:            incidente.estado,
    prioridad:         incidente.prioridad,
    notas_seguimiento: incidente.notas_seguimiento || '',
    costo_reparacion:  incidente.costo_reparacion  || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const { toast } = useToast();

  const handleGuardar = async () => {
    setSaving(true); setError('');
    try {
      await api.put(`/inventario/incidentes/${incidente.id}`, {
        estado:    form.estado,
        prioridad: form.prioridad,
        notas_seguimiento: form.notas_seguimiento || null,
        costo_reparacion:  form.costo_reparacion ? parseFloat(form.costo_reparacion) : null,
      });
      toast('Incidente actualizado correctamente', 'success', { title: 'Guardado' });
      onActualizado();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const tipo = TIPOS_ICON[incidente.tipo] || TIPOS_ICON.OTRO;
  const nombre = incidente.activo_nombre || (incidente.pc_codigo ? `PC ${incidente.pc_codigo}` : 'Equipo');

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 overflow-y-auto"
           style={{
             background: isDay ? '#f8fafc' : 'linear-gradient(180deg,#0d1b2e,#0f172a)',
             borderLeft: isDay ? '1px solid #dbe3ef' : '1px solid rgba(255,255,255,0.07)',
             boxShadow: isDay ? '-20px 0 60px rgba(15,23,42,0.16)' : '-20px 0 60px rgba(0,0,0,0.5)',
             animation: 'slideInRight .25s ease',
           }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* Header drawer */}
        <div className="sticky top-0 z-10 px-5 py-4 flex items-center gap-3"
             style={{
               background: isDay ? 'rgba(248,250,252,0.96)' : 'rgba(13,27,46,0.95)',
               backdropFilter:'blur(12px)',
               borderBottom: isDay ? '1px solid #dbe3ef' : '1px solid rgba(255,255,255,0.06)'
             }}>
          <span className="text-2xl">{tipo.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className={`font-bold truncate ${isDay ? 'text-slate-950' : 'text-white'}`}>{nombre}</p>
            {incidente.laboratorio_nombre && (
              <p className="text-xs text-slate-500 truncate">📍 {incidente.laboratorio_nombre}</p>
            )}
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-xl transition-colors ${isDay ? 'text-slate-500 hover:text-slate-950 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Info */}
          <div className={`glass-sm rounded-xl p-4 space-y-3 text-sm ${isDay ? 'bg-white border border-slate-200' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Origen</span>
              <span className={isDay ? 'text-slate-800' : 'text-slate-300'}>{ORIGENES[incidente.origen] || incidente.origen}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Reportado por</span>
              <span className={`${isDay ? 'text-slate-800' : 'text-slate-300'} font-medium`}>{incidente.reportado_por || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Fecha</span>
              <span className={isDay ? 'text-slate-800' : 'text-slate-300'}>{new Date(incidente.fecha_reporte).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}</span>
            </div>
            {incidente.descripcion && (
              <div className="pt-2 border-t border-white/5">
                <p className="text-slate-500 text-xs mb-1">Descripción</p>
                <p className={`${isDay ? 'text-slate-800' : 'text-slate-300'} leading-relaxed`}>{incidente.descripcion}</p>
              </div>
            )}
          </div>

          {/* Estado */}
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Estado</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['PENDIENTE',   '⏳', isDay ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-amber-500/50 bg-amber-500/10 text-amber-300'],
                ['EN_REVISION', '🔍', isDay ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-blue-500/50 bg-blue-500/10 text-blue-300'],
                ['REPARADO',    '✅', isDay ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'],
                ['DADO_DE_BAJA','📦', isDay ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-500/50 bg-slate-500/10 text-slate-400'],
              ].map(([val, icon, cls]) => (
                <label key={val} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer text-sm transition-all
                  ${form.estado === val ? `${cls} border-opacity-100` : isDay ? 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white' : 'border-white/5 hover:border-white/10 text-slate-400'}`}>
                  <input type="radio" name="estado" value={val} className="sr-only"
                    checked={form.estado === val}
                    onChange={() => setForm({...form, estado: val})} />
                  <span>{icon}</span>
                  <span className="font-medium text-xs">
                    {val === 'PENDIENTE' ? 'Pendiente' : val === 'EN_REVISION' ? 'En revisión' : val === 'REPARADO' ? 'Reparado' : 'Dado de baja'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Prioridad */}
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Prioridad</p>
            <div className="flex gap-2">
              {[['ALTA','🔴', isDay ? 'border-red-500 bg-red-50 text-red-800' : 'border-red-500/50 bg-red-500/10 text-red-300'],
                ['MEDIA','🟡', isDay ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-amber-500/50 bg-amber-500/10 text-amber-300'],
                ['BAJA','⚪', isDay ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-500/50 bg-slate-500/10 text-slate-400']].map(([val,icon,cls]) => (
                <button key={val} type="button"
                  onClick={() => setForm({...form, prioridad: val})}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5
                    ${form.prioridad === val ? `${cls}` : isDay ? 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white' : 'border-white/5 text-slate-500 hover:border-white/10'}`}>
                  {icon} {val === 'ALTA' ? 'Alta' : val === 'MEDIA' ? 'Media' : 'Baja'}
                </button>
              ))}
            </div>
          </div>

          {/* Costo */}
          <div>
            <label className="block text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Costo estimado</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
              <input type="number" min="0" step="0.01" placeholder="0.00"
                value={form.costo_reparacion}
                onChange={e => setForm({...form, costo_reparacion: e.target.value})}
                className="input-dark pl-7" />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Notas de seguimiento</label>
            <textarea rows={4} placeholder="Describe qué se revisó, reparó o quién atendió…"
              value={form.notas_seguimiento}
              onChange={e => setForm({...form, notas_seguimiento: e.target.value})}
              className="input-dark resize-none leading-relaxed" />
          </div>

          {/* Adeudo vinculado o botón crear */}
          {incidente.alumno_responsable && (
            <div className={`glass-sm rounded-xl p-4 space-y-2 ${isDay ? 'bg-white border border-slate-200' : ''}`}>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Alumno responsable</p>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${isDay ? 'text-slate-950' : 'text-white'}`}>{incidente.alumno_responsable.nombre}</p>
                  <p className="text-xs text-slate-500">{incidente.alumno_responsable.matricula}</p>
                </div>

                {/* Si ya existe adeudo vinculado → mostrar estado + link */}
                {incidente.adeudo_id ? (
                  <button
                    onClick={() => navigate(`/admin/adeudos?id=${incidente.adeudo_id}`)}
                    className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors
                      ${incidente.adeudo_estado === 'RESUELTO' || incidente.adeudo_estado === 'CANCELADO'
                        ? isDay ? 'text-emerald-800 border-emerald-300 bg-emerald-50 hover:bg-emerald-100' : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
                        : isDay ? 'text-orange-800 border-orange-300 bg-orange-50 hover:bg-orange-100' : 'text-orange-300 border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20'}`}
                  >
                    ⚖️ Adeudo #{incidente.adeudo_id}
                    {' · '}{incidente.adeudo_estado === 'RESUELTO' ? 'Resuelto'
                          : incidente.adeudo_estado === 'CANCELADO' ? 'Cancelado'
                          : 'Pendiente'}
                  </button>
                ) : (
                  /* Sin adeudo → ofrecer crear */
                  <button
                    onClick={() => {
                      const params = new URLSearchParams({
                        identificador: incidente.alumno_responsable.matricula,
                        nombre:        incidente.alumno_responsable.nombre,
                        tipo:          'ALUMNO',
                        descripcion:   `Daño en ${incidente.activo_nombre || (incidente.pc_codigo ? `PC ${incidente.pc_codigo}` : 'equipo')}${incidente.descripcion ? ': ' + incidente.descripcion : ''}`,
                        incidente_id:  String(incidente.id),
                      });
                      navigate(`/admin/adeudos?${params.toString()}`);
                    }}
                    className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${isDay ? 'text-amber-900 border-amber-300 bg-amber-100 hover:bg-amber-200' : 'text-amber-300 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'}`}
                  >
                    📋 Crear adeudo
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bloqueo visual si el adeudo impide reabrir */}
          {incidente.adeudo_id &&
           incidente.adeudo_estado !== 'RESUELTO' &&
           incidente.adeudo_estado !== 'CANCELADO' && (
            <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${isDay ? 'bg-orange-50 border-orange-300 text-orange-900' : 'bg-orange-900/20 border-orange-500/30 text-orange-300'}`}>
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>
                Este incidente tiene un <strong>adeudo pendiente</strong> vinculado.
                No puede volver a estados anteriores hasta que el adeudo sea resuelto o cancelado.
                Si el equipo necesita otra revisión, crea un nuevo incidente de inspección.
              </span>
            </div>
          )}

          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pb-4">
            <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleGuardar} disabled={saving} className="btn-blue flex-1">
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal de confirmación (reemplaza window.confirm) ────────────────────────
function ModalConfirmar({ mensaje, detalle, labelAceptar = 'Eliminar', onAceptar, onCancelar }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-sm rounded-2xl overflow-hidden shadow-glass"
           style={{ animation: 'fadeUp .2s ease' }}>
        {/* Ícono + mensaje */}
        <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center"
               style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-white text-base">{mensaje}</p>
            {detalle && <p className="text-slate-400 text-sm mt-1">{detalle}</p>}
          </div>
        </div>
        {/* Botones */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onCancelar} className="btn-ghost flex-1 py-2.5 text-sm">
            Cancelar
          </button>
          <button onClick={onAceptar}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white transition-all"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 0 16px rgba(239,68,68,.25)' }}>
            {labelAceptar}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Combobox con búsqueda de activos ────────────────────────────────────────
function ComboboxActivo({ activos, value, onChange, placeholder = 'Buscar por nombre o código…', sinActivoLabel = '— Sin activo específico —' }) {
  const [query,  setQuery]  = useState('');
  const [open,   setOpen]   = useState(false);
  const ref = useRef(null);

  const selected = activos.find(a => String(a.id) === String(value));

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = activos.filter(a => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (a.nombre?.toLowerCase().includes(q) || a.codigo_inventario?.toLowerCase().includes(q));
  }).slice(0, 10);

  const handleSelect = (activo) => {
    onChange(activo ? String(activo.id) : '');
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      {selected ? (
        /* Chip de seleccionado */
        <div className="input-dark flex items-center justify-between gap-2 cursor-default">
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-white text-sm font-medium truncate">{selected.nombre}</span>
            <span className="text-slate-500 text-xs font-mono">{selected.codigo_inventario}</span>
          </div>
          <button type="button" onClick={() => handleSelect(null)}
            className="text-slate-400 hover:text-white shrink-0 text-xl leading-none px-1 transition-colors" title="Limpiar">
            ×
          </button>
        </div>
      ) : (
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="input-dark pl-9 w-full"
          />
        </div>
      )}

      {open && !selected && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-2xl"
          style={{ background:'#0d1b2e', border:'1px solid rgba(255,255,255,0.1)', maxHeight:280, overflowY:'auto' }}>
          {/* Opción vacía */}
          <button type="button" onClick={() => handleSelect(null)}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-500 hover:bg-white/5 transition-colors"
            style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            {sinActivoLabel}
          </button>

          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500 text-center">Sin resultados para "{query}"</div>
          ) : (
            filtered.map(a => (
              <button key={a.id} type="button" onClick={() => handleSelect(a)}
                className="w-full px-4 py-2.5 text-left hover:bg-white/5 transition-colors flex items-center justify-between gap-3 group"
                style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate group-hover:text-blue-200 transition-colors">{a.nombre}</p>
                  {a.laboratorio_nombre && (
                    <p className="text-xs text-slate-500 truncate">📍 {a.laboratorio_nombre}</p>
                  )}
                </div>
                <span className="text-xs font-mono text-blue-400 shrink-0 bg-blue-500/10 px-2 py-0.5 rounded-md">
                  {a.codigo_inventario}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal nuevo incidente ────────────────────────────────────────────────────
function ModalNuevoIncidente({ laboratorios, activos, onClose, onCreado }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const { usuario } = useAuth();
  const esLabAdmin = usuario?.rol === 'LAB_ADMIN';
  const labIdFijo  = esLabAdmin ? String(usuario.laboratorio_id) : '';

  const [form, setForm] = useState({ activo_id:'', laboratorio_id: labIdFijo, tipo:'DAÑO', prioridad:'MEDIA', descripcion:'', origen:'MANUAL' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const { toast } = useToast();

  const handleGuardar = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/inventario/incidentes', {
        ...form,
        activo_id:      form.activo_id      ? parseInt(form.activo_id)      : null,
        laboratorio_id: form.laboratorio_id ? parseInt(form.laboratorio_id) : null,
      });
      toast('Incidente reportado y registrado', 'success', { title: 'Reporte creado' });
      onCreado(); onClose();
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al crear incidente');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-md shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="font-semibold text-white">Reportar Incidente</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleGuardar} className="p-6 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wide mb-2">Tipo de incidente</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TIPOS_ICON).map(([val, { label, emoji }]) => (
                <label key={val}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer text-sm transition-all
                    ${form.tipo === val ? 'border-blue-500/60 bg-blue-500/10 text-white font-medium' : 'border-white/5 text-slate-400 hover:border-white/10'}`}>
                  <input type="radio" name="tipo" value={val} className="sr-only"
                    checked={form.tipo === val} onChange={() => setForm({...form, tipo: val})} />
                  <span>{emoji}</span> {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">Activo afectado</label>
            <ComboboxActivo
              activos={activos}
              value={form.activo_id}
              onChange={val => setForm({...form, activo_id: val})}
            />
          </div>

          {esLabAdmin ? (
            /* LAB_ADMIN: muestra el nombre de su lab, no puede cambiarlo */
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">Laboratorio</label>
              <div className="input-dark flex items-center gap-2 opacity-70 cursor-not-allowed">
                <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <span className="text-slate-300 text-sm">
                  {laboratorios.find(l => String(l.id) === labIdFijo)?.nombre || 'Tu laboratorio'}
                </span>
                <span className="ml-auto text-xs text-slate-600">Fijo</span>
              </div>
            </div>
          ) : (
            /* SUPER_ADMIN: puede elegir cualquier lab */
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">Laboratorio</label>
              <SelectDark
                value={form.laboratorio_id}
                onChange={v => setForm({...form, laboratorio_id: v})}
                placeholder="— Seleccionar —"
                options={[{ value: '', label: '— Seleccionar —' }, ...laboratorios.map(l => ({ value: l.id, label: l.nombre }))]}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wide mb-2">Prioridad</label>
            <div className="flex gap-2">
              {[['ALTA','🔴'],['MEDIA','🟡'],['BAJA','⚪']].map(([val,icon]) => (
                <button key={val} type="button" onClick={() => setForm({...form, prioridad: val})}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5
                    ${form.prioridad === val
                      ? val === 'ALTA'  ? isDay ? 'border-red-500 bg-red-50 text-red-800' : 'border-red-500/60 bg-red-500/10 text-red-300'
                      : val === 'MEDIA' ? isDay ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                      :                  isDay ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-500/60 bg-slate-500/10 text-slate-400'
                      : isDay ? 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white' : 'border-white/5 text-slate-500 hover:border-white/10'}`}>
                  {icon} {val === 'ALTA' ? 'Alta' : val === 'MEDIA' ? 'Media' : 'Baja'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">Descripción del problema</label>
            <textarea rows={3} required placeholder="Describe el daño o problema encontrado…"
              value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})}
              className="input-dark resize-none" />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-all">
              {saving ? 'Reportando…' : '📋 Reportar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// MANTENIMIENTO PREVENTIVO — componentes
// ══════════════════════════════════════════════════════════════════════════════

const TIPOS_MP = [
  { key: 'LIMPIEZA_FISICA',    label: 'Limpieza física',    emoji: '🧹' },
  { key: 'REVISION_SOFTWARE',  label: 'Revisión software',  emoji: '💻' },
  { key: 'ACTUALIZACION',      label: 'Actualización',      emoji: '⬆️' },
  { key: 'REVISION_HARDWARE',  label: 'Revisión hardware',  emoji: '🔩' },
  { key: 'FORMATEO',           label: 'Formateo',           emoji: '💿' },
  { key: 'RESPALDO',           label: 'Respaldo',           emoji: '💾' },
  { key: 'INSPECCION',         label: 'Inspección',         emoji: '🔍' },
  { key: 'OTRO',               label: 'Otro',               emoji: '📌' },
];

const PERIODOS_MP = [
  { key: 'SEMANAL',     label: 'Semanal'     },
  { key: 'MENSUAL',     label: 'Mensual'     },
  { key: 'TRIMESTRAL',  label: 'Trimestral'  },
  { key: 'SEMESTRAL',   label: 'Semestral'   },
  { key: 'ANUAL',       label: 'Anual'       },
  { key: 'UNICO',       label: 'Única vez'   },
];

const ESTADOS_MP_BADGE = {
  PENDIENTE:   { cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',   label: '⏳ Pendiente'   },
  EN_PROCESO:  { cls: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',      label: '🔧 En proceso'  },
  COMPLETADO:  { cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25', label: '✅ Completado' },
  OMITIDO:     { cls: 'bg-slate-500/15 text-slate-400 border border-slate-500/25',   label: '⏭️ Omitido'    },
};

function diasParaVencer(fechaStr) {
  if (!fechaStr) return null;
  const diff = Math.ceil((new Date(fechaStr) - new Date()) / (1000*60*60*24));
  return diff;
}

// ─── Modal: Programar mantenimiento preventivo ─────────────────────────────

function ModalNuevoMant({ laboratorios, activos, onClose, onCreado }) {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const esLabAdmin = usuario?.rol === 'LAB_ADMIN';
  const labIdFijo  = esLabAdmin ? String(usuario.laboratorio_id) : '';

  const [form, setForm] = useState({
    laboratorio_id: labIdFijo, activo_id: '', tipo: 'LIMPIEZA_FISICA',
    periodicidad: 'TRIMESTRAL', fecha_programada: '', fecha_limite: '',
    descripcion: '', checklist: '',
  });
  const [saving, setSaving] = useState(false);
  const [checkItems, setCheckItems] = useState(['']);

  const activosFiltrados = activos.filter(a =>
    !form.laboratorio_id || String(a.laboratorio_id) === String(form.laboratorio_id)
  );

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!form.fecha_programada) return;
    setSaving(true);
    try {
      const checks = checkItems.filter(c => c.trim());
      await api.post('/inventario/mantenimientos-preventivos', {
        laboratorio_id:   form.laboratorio_id || null,
        activo_id:        form.activo_id || null,
        tipo:             form.tipo,
        periodicidad:     form.periodicidad,
        fecha_programada: form.fecha_programada,
        fecha_limite:     form.fecha_limite || null,
        descripcion:      form.descripcion || null,
        checklist:        checks.length ? JSON.stringify(checks) : null,
      });
      toast('Mantenimiento programado', 'success');
      onCreado(); onClose();
    } catch { toast('Error al programar', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <form onSubmit={handleGuardar}
        className="glass w-full max-w-lg rounded-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Programar Mantenimiento Preventivo</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Tipo de mantenimiento *</label>
            <SelectDark
              value={form.tipo}
              onChange={v => setForm({...form, tipo: v})}
              options={TIPOS_MP.map(t => ({ value: t.key, label: `${t.emoji} ${t.label}` }))}
            />
          </div>

          {esLabAdmin ? (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Laboratorio</label>
              <div className="input-dark text-sm flex items-center gap-2 opacity-70 cursor-not-allowed">
                <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <span className="text-slate-300">{laboratorios.find(l => String(l.id) === labIdFijo)?.nombre || 'Tu laboratorio'}</span>
                <span className="ml-auto text-xs text-slate-600">Fijo</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Laboratorio</label>
              <SelectDark
                value={form.laboratorio_id}
                onChange={v => setForm({...form, laboratorio_id: v, activo_id: ''})}
                placeholder="— Todos —"
                options={[{ value: '', label: '— Todos —' }, ...laboratorios.map(l => ({ value: l.id, label: l.nombre }))]}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">Equipo específico</label>
            <ComboboxActivo
              activos={activosFiltrados}
              value={form.activo_id}
              onChange={val => setForm({...form, activo_id: val})}
              placeholder="Buscar equipo por nombre o código…"
              sinActivoLabel="— Todo el laboratorio —"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Periodicidad</label>
            <SelectDark
              value={form.periodicidad}
              onChange={v => setForm({...form, periodicidad: v})}
              options={PERIODOS_MP.map(p => ({ value: p.key, label: p.label }))}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Fecha programada *</label>
            <input type="date" required value={form.fecha_programada} onChange={e => setForm({...form, fecha_programada: e.target.value})} className="input-dark text-sm w-full"/>
          </div>

          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-slate-400">
                Alerta de vencimiento
                <span className="ml-1 text-slate-600">(opcional — si no se completa antes, aparece en rojo)</span>
              </label>
              {form.fecha_programada && (
                <button type="button"
                  onClick={() => {
                    const deltaMap = { SEMANAL:7, MENSUAL:30, TRIMESTRAL:90, SEMESTRAL:180, ANUAL:365, UNICO:14 };
                    const dias = deltaMap[form.periodicidad] || 14;
                    const base = new Date(form.fecha_programada);
                    base.setDate(base.getDate() + dias);
                    setForm({...form, fecha_limite: base.toISOString().split('T')[0]});
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  Auto (+1 periodo)
                </button>
              )}
            </div>
            <input type="date" value={form.fecha_limite} onChange={e => setForm({...form, fecha_limite: e.target.value})} className="input-dark text-sm w-full"/>
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Descripción / instrucciones</label>
            <textarea rows={2} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})}
              placeholder="Describe qué se realizará…"
              className="input-dark text-sm w-full resize-none"/>
          </div>
        </div>

        {/* Checklist */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">Checklist de tareas</label>
          <div className="flex flex-col gap-1.5">
            {checkItems.map((item, i) => (
              <div key={i} className="flex gap-2">
                <input value={item} onChange={e => { const n=[...checkItems]; n[i]=e.target.value; setCheckItems(n); }}
                  placeholder={`Tarea ${i+1}`} className="input-dark text-sm flex-1"/>
                {checkItems.length > 1 && (
                  <button type="button" onClick={() => setCheckItems(checkItems.filter((_,j) => j!==i))}
                    className="text-slate-500 hover:text-red-400 px-2">×</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setCheckItems([...checkItems,''])}
              className="text-xs text-blue-400 hover:text-blue-300 text-left mt-1">+ Agregar tarea</button>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-blue flex-1 py-2.5 text-sm font-semibold">
            {saving ? 'Guardando…' : 'Programar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Drawer: Completar mantenimiento preventivo ────────────────────────────

function DrawerCompletarMant({ mant, onClose, onActualizado }) {
  const { toast } = useToast();
  const [checks, setChecks] = useState(() => {
    try { return JSON.parse(mant.checklist || '[]'); } catch { return []; }
  });
  const [checkDone, setCheckDone] = useState(() => checks.map(() => false));
  const [notas, setNotas] = useState('');
  const [costo, setCosto] = useState('');
  const [duracion, setDuracion] = useState('');
  const [saving, setSaving] = useState(false);

  const tipoInfo = TIPOS_MP.find(t => t.key === mant.tipo) || { emoji: '🔧', label: mant.tipo };

  const handleCompletar = async () => {
    setSaving(true);
    try {
      await api.put(`/inventario/mantenimientos-preventivos/${mant.id}`, {
        estado: 'COMPLETADO',
        notas_result: notas || null,
        costo: costo ? parseFloat(costo) : null,
        duracion_min: duracion ? parseInt(duracion) : null,
      });
      toast('Mantenimiento completado ✅', 'success');
      onActualizado(); onClose();
    } catch { toast('Error al completar', 'error'); }
    finally { setSaving(false); }
  };

  const handleIniciar = async () => {
    try {
      await api.put(`/inventario/mantenimientos-preventivos/${mant.id}`, {
        estado: 'EN_PROCESO',
        fecha_inicio: new Date().toISOString(),
      });
      toast('Marcado como En proceso', 'info');
      onActualizado(); onClose();
    } catch { toast('Error', 'error'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto flex flex-col"
        style={{ background:'rgba(15,23,42,0.97)', borderLeft:'1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>

        <div className="p-5 border-b border-white/8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{tipoInfo.emoji}</span>
                <h2 className="text-lg font-bold text-white">{tipoInfo.label}</h2>
              </div>
              <p className="text-sm text-slate-400">{mant.activo_nombre || mant.laboratorio_nombre || 'General'}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none shrink-0">×</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ESTADOS_MP_BADGE[mant.estado]?.cls}`}>
              {ESTADOS_MP_BADGE[mant.estado]?.label}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-300">
              🔄 {PERIODOS_MP.find(p => p.key === mant.periodicidad)?.label}
            </span>
          </div>
        </div>

        <div className="flex-1 p-5 flex flex-col gap-5">
          {/* Info básica */}
          <div className="glass-sm rounded-xl p-4 space-y-2 text-sm">
            <p><span className="text-slate-400">Programado:</span> <span className="text-white">{formatFecha(mant.fecha_programada)}</span></p>
            {mant.fecha_limite && (
              <p><span className="text-slate-400">Límite:</span>{' '}
                <span className={diasParaVencer(mant.fecha_limite) < 0 ? 'text-red-400 font-semibold' : 'text-white'}>
                  {formatFecha(mant.fecha_limite)}
                  {diasParaVencer(mant.fecha_limite) < 0 && ' ⚠️ VENCIDO'}
                </span>
              </p>
            )}
            {mant.descripcion && <p className="text-slate-300 pt-1 border-t border-white/5">{mant.descripcion}</p>}
          </div>

          {/* Checklist */}
          {checks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Checklist</p>
              <div className="flex flex-col gap-2">
                {checks.map((item, i) => (
                  <label key={i} className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={checkDone[i]} onChange={() => {
                      const n = [...checkDone]; n[i] = !n[i]; setCheckDone(n);
                    }} className="w-4 h-4 rounded accent-emerald-500"/>
                    <span className={`text-sm ${checkDone[i] ? 'line-through text-slate-500' : 'text-slate-200'}`}>{item}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/8">
                <div className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${checks.length ? (checkDone.filter(Boolean).length/checks.length)*100 : 0}%` }}/>
              </div>
              <p className="text-xs text-slate-500 mt-1">{checkDone.filter(Boolean).length}/{checks.length} tareas</p>
            </div>
          )}

          {/* Registrar resultado */}
          {mant.estado !== 'COMPLETADO' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registrar resultado</p>
              <textarea rows={3} value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones del mantenimiento…"
                className="input-dark text-sm resize-none w-full"/>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Costo ($)</label>
                  <input type="number" min="0" value={costo} onChange={e => setCosto(e.target.value)} className="input-dark text-sm w-full"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Duración (min)</label>
                  <input type="number" min="0" value={duracion} onChange={e => setDuracion(e.target.value)} className="input-dark text-sm w-full"/>
                </div>
              </div>
            </div>
          )}

          {mant.estado === 'COMPLETADO' && mant.notas_result && (
            <div className="glass-sm rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Resultado registrado</p>
              <p className="text-sm text-slate-300">{mant.notas_result}</p>
              {mant.costo && <p className="text-xs text-emerald-400 mt-1">Costo: ${mant.costo}</p>}
              {mant.duracion_min && <p className="text-xs text-blue-400 mt-0.5">Duración: {mant.duracion_min} min</p>}
              {mant.completado_por && <p className="text-xs text-slate-500 mt-0.5">Por: {mant.completado_por}</p>}
            </div>
          )}
        </div>

        {mant.estado !== 'COMPLETADO' && (
          <div className="p-5 border-t border-white/8 flex gap-3">
            {mant.estado === 'PENDIENTE' && (
              <button onClick={handleIniciar} className="btn-ghost flex-1 py-2.5 text-sm">
                🔧 Iniciar
              </button>
            )}
            <button onClick={handleCompletar} disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white transition-all"
              style={{ background:'linear-gradient(135deg,#10b981,#059669)', boxShadow:'0 0 16px rgba(16,185,129,.3)' }}>
              {saving ? 'Guardando…' : '✅ Marcar completado'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Preventivo ───────────────────────────────────────────────────────

function TabPreventivo({ laboratorios }) {
  const { toast } = useToast();
  const [mantenimientos, setMantenimientos] = useState([]);
  const [activos,   setActivos]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filtroLab, setFiltroLab] = useState('');
  const [filtroEst, setFiltroEst] = useState('');
  const [modalNuevo,    setModalNuevo]    = useState(false);
  const [drawerMant,    setDrawerMant]    = useState(null);
  const [confirmElim,   setConfirmElim]   = useState(null); // { id, nombre }

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroLab) params.append('laboratorio_id', filtroLab);
      if (filtroEst) params.append('estado', filtroEst);
      const [mRes, aRes] = await Promise.all([
        api.get(`/inventario/mantenimientos-preventivos?${params}`),
        api.get('/inventario/activos?solo_activos=true'),
      ]);
      setMantenimientos(mRes.data);
      setActivos(aRes.data);
    } catch { toast('Error al cargar mantenimientos', 'error'); }
    finally { setLoading(false); }
  }, [filtroLab, filtroEst]);

  useEffect(() => { cargar(); }, [cargar]);

  const proximos = mantenimientos.filter(m => m.estado === 'PENDIENTE' && diasParaVencer(m.fecha_limite) !== null && diasParaVencer(m.fecha_limite) <= 7);
  const vencidos = mantenimientos.filter(m => m.estado === 'PENDIENTE' && m.fecha_limite && diasParaVencer(m.fecha_limite) < 0);

  const handleEliminar = async () => {
    if (!confirmElim) return;
    try {
      await api.delete(`/inventario/mantenimientos-preventivos/${confirmElim.id}`);
      toast('Mantenimiento eliminado', 'success'); cargar();
    } catch { toast('Error al eliminar', 'error'); }
    finally { setConfirmElim(null); }
  };

  return (
    <div>
      {/* Alertas */}
      {vencidos.length > 0 && (
        <div className="mb-4 rounded-xl p-4 flex items-start gap-3"
          style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
          <span className="text-xl">🚨</span>
          <div>
            <p className="font-semibold text-red-300 text-sm">{vencidos.length} mantenimiento{vencidos.length>1?'s':''} vencido{vencidos.length>1?'s':''}</p>
            <p className="text-xs text-red-400/70 mt-0.5">{vencidos.map(m => m.activo_nombre || m.laboratorio_nombre || m.tipo).join(' · ')}</p>
          </div>
        </div>
      )}
      {proximos.length > 0 && vencidos.length === 0 && (
        <div className="mb-4 rounded-xl p-4 flex items-start gap-3"
          style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)' }}>
          <span className="text-xl">⚠️</span>
          <p className="text-amber-300 text-sm font-medium">{proximos.length} mantenimiento{proximos.length>1?'s':''} vence{proximos.length===1?'':'n'} en los próximos 7 días</p>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <SelectDark
          value={filtroLab}
          onChange={setFiltroLab}
          className="w-52"
          placeholder="Todos los laboratorios"
          options={[{ value: '', label: 'Todos los laboratorios' }, ...laboratorios.map(l => ({ value: l.id, label: l.nombre }))]}
        />
        <SelectDark
          value={filtroEst}
          onChange={setFiltroEst}
          className="w-44"
          placeholder="Todos los estados"
          options={[{ value: '', label: 'Todos los estados' }, ...Object.entries(ESTADOS_MP_BADGE).map(([k, v]) => ({ value: k, label: v.label }))]}
        />
        <button onClick={cargar} className="btn-ghost px-3 py-2 text-sm">↻ Actualizar</button>
        <button onClick={() => setModalNuevo(true)}
          className="ml-auto btn-blue px-4 py-2.5 text-sm font-semibold">
          + Programar mantenimiento
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : mantenimientos.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-4xl mb-3">🗓️</p>
          <p className="font-medium">No hay mantenimientos programados</p>
          <p className="text-sm mt-1">Haz clic en "+ Programar mantenimiento" para empezar</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.06)' }}>
          <table className="w-full text-sm" style={{ background:'rgb(2 6 23)', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                {['Tipo','Equipo / Lab','Programado','Límite','Periodicidad','Estado',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mantenimientos.map((m, idx) => {
                const tipoInfo = TIPOS_MP.find(t => t.key === m.tipo) || { emoji:'🔧', label: m.tipo };
                const badge    = ESTADOS_MP_BADGE[m.estado] || ESTADOS_MP_BADGE.PENDIENTE;
                const dias     = diasParaVencer(m.fecha_limite);
                const vencido  = dias !== null && dias < 0;
                const urgente  = dias !== null && dias >= 0 && dias <= 3;
                return (
                  <tr key={m.id} onClick={() => setDrawerMant(m)}
                    style={{
                      background: idx%2===1 ? 'rgba(255,255,255,0.018)' : 'transparent',
                      borderBottom:'1px solid rgba(255,255,255,0.04)',
                      cursor:'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background=idx%2===1 ? 'rgba(255,255,255,0.018)':'transparent'}
                  >
                    <td className="px-4 py-3">
                      <span className="mr-1.5">{tipoInfo.emoji}</span>
                      <span className="text-slate-200 font-medium">{tipoInfo.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-200 truncate max-w-[180px]">{m.activo_nombre || '—'}</p>
                      {m.laboratorio_nombre && <p className="text-xs text-slate-500 truncate">{m.laboratorio_nombre}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-400">{formatFecha(m.fecha_programada)}</td>
                    <td className="px-4 py-3">
                      {m.fecha_limite ? (
                        <span className={`font-mono text-xs font-semibold ${vencido ? 'text-red-400' : urgente ? 'text-amber-400' : 'text-slate-400'}`}>
                          {vencido ? '⚠️ ' : urgente ? '🔔 ' : ''}{formatFecha(m.fecha_limite)}
                          {dias !== null && <span className="ml-1 opacity-70">({dias > 0 ? `${dias}d` : dias === 0 ? 'hoy' : `${Math.abs(dias)}d tarde`})</span>}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">{PERIODOS_MP.find(p=>p.key===m.periodicidad)?.label || m.periodicidad}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setConfirmElim({ id: m.id, nombre: (TIPOS_MP.find(t=>t.key===m.tipo)?.label || m.tipo) + (m.activo_nombre ? ` — ${m.activo_nombre}` : '') })}
                        className="text-slate-600 hover:text-red-400 transition-colors p-1" title="Eliminar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalNuevo && (
        <ModalNuevoMant laboratorios={laboratorios} activos={activos}
          onClose={() => setModalNuevo(false)} onCreado={cargar} />
      )}
      {drawerMant && (
        <DrawerCompletarMant mant={drawerMant}
          onClose={() => setDrawerMant(null)} onActualizado={cargar} />
      )}
      {confirmElim && (
        <ModalConfirmar
          mensaje="¿Eliminar mantenimiento programado?"
          detalle={confirmElim.nombre}
          labelAceptar="Sí, eliminar"
          onAceptar={handleEliminar}
          onCancelar={() => setConfirmElim(null)}
        />
      )}
    </div>
  );
}

// ─── Tab: Historial por equipo ─────────────────────────────────────────────

const EVENTO_STYLE = {
  INCIDENTE: {
    color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.30)',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  },
  PRESTAMO: {
    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.30)',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/></svg>,
  },
  MANTENIMIENTO_PREVENTIVO: {
    color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.30)',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  },
};

function TabHistorial({ laboratorios }) {
  const { toast } = useToast();
  const [activos,    setActivos]    = useState([]);
  const [filtroLab,  setFiltroLab]  = useState('');
  const [activoSel,  setActivoSel]  = useState('');
  const [historial,  setHistorial]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('');

  useEffect(() => {
    api.get('/inventario/activos?solo_activos=true')
      .then(r => setActivos(r.data)).catch(() => {});
  }, []);

  const cargarHistorial = useCallback(async (id) => {
    if (!id) { setHistorial(null); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/inventario/activos/${id}/historial`);
      setHistorial(data);
    } catch { toast('Error al cargar historial', 'error'); setHistorial(null); }
    finally { setLoading(false); }
  }, []);

  const activosFiltrados = activos.filter(a =>
    !filtroLab || String(a.laboratorio_id) === String(filtroLab)
  );

  const eventos = (historial?.eventos || []).filter(e =>
    !filtroTipo || e.tipo_evento === filtroTipo
  );
  const activoHistorial = historial?.activo || activos.find(a => String(a.id) === String(activoSel)) || {};

  const formatFechaLarga = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  };

  return (
    <div>
      {/* Selector de equipo */}
      <div className="glass rounded-2xl p-5 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-40">
          <label className="block text-xs text-slate-400 mb-1.5">Laboratorio</label>
          <SelectDark
            value={filtroLab}
            onChange={v => { setFiltroLab(v); setActivoSel(''); setHistorial(null); }}
            placeholder="Todos los laboratorios"
            options={[{ value: '', label: 'Todos los laboratorios' }, ...laboratorios.map(l => ({ value: l.id, label: l.nombre }))]}
          />
        </div>
        <div className="flex-1 min-w-52">
          <label className="block text-xs text-slate-400 mb-1.5">Equipo *</label>
          <SelectDark
            value={activoSel}
            onChange={v => { setActivoSel(v); cargarHistorial(v); }}
            placeholder="— Selecciona un equipo —"
            options={[{ value: '', label: '— Selecciona un equipo —' }, ...activosFiltrados.map(a => ({ value: a.id, label: `${a.nombre} · ${a.codigo_inventario}` }))]}
          />
        </div>
        {historial && (
          <div className="flex gap-2">
            {['','INCIDENTE','PRESTAMO','MANTENIMIENTO_PREVENTIVO'].map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filtroTipo===t ? 'bg-blue-500/25 border-blue-500/50 text-blue-300' : 'border-white/10 text-slate-400 hover:border-white/20'}`}>
                {t==='' ? 'Todo' : t==='INCIDENTE' ? '💥 Incidentes' : t==='PRESTAMO' ? '📦 Préstamos' : '🔧 Preventivo'}
              </button>
            ))}
          </div>
        )}
      </div>

      {!activoSel && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-5xl mb-4">🖥️</p>
          <p className="font-medium text-slate-400">Selecciona un equipo para ver su historial</p>
          <p className="text-sm mt-1">Verás todos los incidentes, préstamos y mantenimientos</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
      )}

      {historial && !loading && (
        <>
          {/* Card resumen del equipo */}
          <div className="glass-sm rounded-2xl p-5 mb-6 flex flex-wrap gap-5 items-start">
            <div className="flex-1 min-w-48">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Equipo</p>
              <p className="text-xl font-bold text-white">{activoHistorial.nombre || 'Equipo seleccionado'}</p>
              <p className="text-sm text-slate-400">{activoHistorial.codigo || activoHistorial.codigo_inventario || 'Sin codigo'} · {activoHistorial.categoria || 'Sin categoria'}</p>
              {activoHistorial.marca && <p className="text-xs text-slate-500 mt-0.5">{activoHistorial.marca} {activoHistorial.modelo}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { label:'Estado', value: activoHistorial.estado || '—', color: activoHistorial.estado==='OPERATIVO' ? 'text-emerald-400' : activoHistorial.estado==='MANTENIMIENTO' ? 'text-amber-400' : 'text-red-400' },
                { label:'Resguardante', value: activoHistorial.resguardo_nombre || 'Sin resguardante', color:'text-slate-300' },
                { label:'Total eventos', value: historial.total_eventos ?? eventos.length, color:'text-blue-400' },
              ].map(s => (
                <div key={s.label} className="glass rounded-xl px-4 py-3 text-center min-w-24">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          {eventos.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>Sin eventos{filtroTipo ? ' de este tipo' : ''} registrados</p>
            </div>
          ) : (
            <div className="relative pl-8">
              {/* Línea vertical */}
              <div className="absolute left-3.5 top-0 bottom-0 w-px" style={{ background:'rgba(255,255,255,0.08)' }}/>

              {eventos.map((ev, idx) => {
                const style = EVENTO_STYLE[ev.tipo_evento] || EVENTO_STYLE.INCIDENTE;
                return (
                  <div key={idx} className="relative mb-5 last:mb-0">
                    {/* Punto en la línea */}
                    <div className="absolute -left-[18px] top-4 w-3 h-3 rounded-full flex items-center justify-center"
                      style={{ background: style.bg, border:`2px solid ${style.color}` }}/>

                    <div className="rounded-2xl p-4 transition-all"
                      style={{ background: style.bg, border:`1px solid ${style.border}` }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span style={{ color: style.color }}>{style.icon}</span>
                          <p className="font-semibold text-white text-sm">{ev.titulo}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono text-slate-400">{formatFechaLarga(ev.fecha)}</p>
                          {ev.fecha_fin && <p className="text-xs text-slate-600">hasta {formatFechaLarga(ev.fecha_fin)}</p>}
                        </div>
                      </div>

                      {ev.descripcion && (
                        <p className="text-sm text-slate-300 mt-2">{ev.descripcion}</p>
                      )}

                      {ev.proposito && (
                        <p className="text-sm text-slate-300 mt-2">Propósito: {ev.proposito}</p>
                      )}

                      <div className="flex flex-wrap gap-2 mt-3">
                        {ev.estado && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full"
                            style={{ background:'rgba(255,255,255,0.06)', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.08)' }}>
                            {ev.estado}
                          </span>
                        )}
                        {ev.prioridad && (
                          <span className={`text-xs px-2.5 py-0.5 rounded-full ${PRIORIDAD_BADGE[ev.prioridad]?.cls}`}>
                            {PRIORIDAD_BADGE[ev.prioridad]?.label}
                          </span>
                        )}
                        {ev.condicion_salida && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Salida: {ev.condicion_salida}
                          </span>
                        )}
                        {ev.receptor_tipo && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                            {ev.receptor_tipo}
                          </span>
                        )}
                        {ev.condicion_retorno && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Retorno: {ev.condicion_retorno}
                          </span>
                        )}
                        {ev.costo != null && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            💰 ${ev.costo}
                          </span>
                        )}
                        {ev.duracion_min != null && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
                            ⏱️ {ev.duracion_min} min
                          </span>
                        )}
                        {ev.usuario && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-500/10 text-slate-500">
                            👤 {ev.usuario}
                          </span>
                        )}
                      </div>

                      {ev.notas && (
                        <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-white/5 italic">"{ev.notas}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

export default function Mantenimiento() {
  const [tab,          setTab]          = useState('kanban');
  const [incidentes,   setIncidentes]   = useState([]);
  const [laboratorios, setLaboratorios] = useState([]);
  const [activos,      setActivos]      = useState([]);
  const [stats,        setStats]        = useState({});
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [filtroTexto,  setFiltroTexto]  = useState('');
  const [filtroLab,    setFiltroLab]    = useState('');
  const [drawerInc,    setDrawerInc]    = useState(null);
  const [modalNuevo,   setModalNuevo]   = useState(false);
  const [dragTarget,   setDragTarget]   = useState(null);
  const dragItem = useRef(null);
  const { toast } = useToast();
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';

  const cargarTodo = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filtroLab) params.append('laboratorio_id', filtroLab);
      const [incRes, statsRes, labsRes] = await Promise.all([
        api.get(`/inventario/incidentes?${params}`),
        api.get('/inventario/incidentes/estadisticas'),
        api.get('/laboratorios'),
      ]);
      setIncidentes(incRes.data);
      setStats(statsRes.data);
      setLaboratorios(labsRes.data);
    } catch { setError('Error al cargar datos'); }
    finally  { setLoading(false); }
  }, [filtroLab]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const abrirModalNuevo = async () => {
    try { const r = await api.get('/inventario/activos?solo_activos=true'); setActivos(r.data); }
    catch { setActivos([]); }
    setModalNuevo(true);
  };

  // Drag & drop handler
  const handleDrop = async (targetEstado) => {
    const inc = dragItem.current;
    if (!inc || inc.estado === targetEstado) { setDragTarget(null); dragItem.current = null; return; }

    // Bloquear reabrir si tiene adeudo pendiente
    const adeudoPendiente = inc.adeudo_id &&
      inc.adeudo_estado !== 'RESUELTO' && inc.adeudo_estado !== 'CANCELADO';
    if (adeudoPendiente && (targetEstado === 'PENDIENTE' || targetEstado === 'EN_REVISION')) {
      toast(
        `No se puede reabrir — este incidente tiene un adeudo pendiente (#${inc.adeudo_id}). ` +
        `Resuelve el adeudo primero, o crea un nuevo incidente de inspección.`,
        'error'
      );
      setDragTarget(null); dragItem.current = null;
      return;
    }

    try {
      await api.put(`/inventario/incidentes/${inc.id}`, { estado: targetEstado });
      const colLabel = COLUMNAS.find(c => c.key === targetEstado)?.label || targetEstado;
      toast(`Movido a "${colLabel}"`, 'success');
      cargarTodo();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al mover incidente';
      toast(msg, 'error');
    }
    setDragTarget(null); dragItem.current = null;
  };

  // Filtrado local
  const filtered = incidentes.filter(i => {
    if (!filtroTexto) return true;
    const t = filtroTexto.toLowerCase();
    return (i.activo_nombre?.toLowerCase().includes(t) ||
            i.descripcion?.toLowerCase().includes(t)   ||
            i.laboratorio_nombre?.toLowerCase().includes(t) ||
            i.pc_codigo?.toLowerCase().includes(t));
  });

  // Agrupar en columnas (DADO_DE_BAJA no aparece en kanban)
  const kanban = {};
  COLUMNAS.forEach(c => { kanban[c.key] = []; });
  filtered.forEach(i => {
    if (kanban[i.estado]) kanban[i.estado].push(i);
  });

  const pendientesAlta = incidentes.filter(i => i.prioridad === 'ALTA' && i.estado === 'PENDIENTE');

  // ─── Configuración de pestañas ──────────────────────────────────────────────
  const TABS = [
    {
      key: 'kanban',
      label: 'Incidentes',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>,
      badge: incidentes.filter(i => i.estado === 'PENDIENTE').length || null,
      badgeColor: 'bg-amber-500/20 text-amber-400',
    },
    {
      key: 'preventivo',
      label: 'Preventivo',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
      badge: null,
      badgeColor: '',
    },
    {
      key: 'historial',
      label: 'Historial por equipo',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
      badge: null,
      badgeColor: '',
    },
  ];

  return (
    <AdminLayout>
      {/* Header principal */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className={`text-2xl font-bold ${isDay ? 'text-slate-950' : 'text-white'}`}>Mantenimiento</h1>
          <p className={`${isDay ? 'text-slate-600' : 'text-slate-400'} text-sm mt-0.5`}>Incidentes · Preventivo · Historial de equipos</p>
        </div>
        {tab === 'kanban' && (
          <button onClick={abrirModalNuevo}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:shadow-[0_0_16px_rgba(234,88,12,.4)]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Reportar Incidente
          </button>
        )}
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl" style={{
        background: isDay ? '#ffffff' : 'rgba(255,255,255,0.04)',
        border: isDay ? '1px solid #dbe3ef' : '1px solid rgba(255,255,255,0.07)'
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200
              ${tab === t.key
                ? isDay ? 'bg-emerald-50 text-slate-950 shadow border border-emerald-100' : 'bg-slate-700/80 text-white shadow-lg'
                : isDay ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-50' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge ? (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${t.badgeColor}`}>
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Pestaña: Kanban de incidentes ───────────────────────────────────── */}
      {tab === 'kanban' && (
        <>
          {/* Alerta alta prioridad */}
          {pendientesAlta.length > 0 && (
            <div className="mb-4 glass-sm border border-red-700/40 rounded-xl p-4 flex items-start gap-3">
              <span className="text-xl mt-0.5">🚨</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-red-300 text-sm">
                  {pendientesAlta.length} incidente{pendientesAlta.length > 1 ? 's' : ''} de ALTA prioridad pendientes
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {pendientesAlta.slice(0,4).map(i => (
                    <button key={i.id} onClick={() => setDrawerInc(i)}
                      className="text-xs bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full transition-colors">
                      {i.activo_nombre || `PC ${i.pc_codigo}` || 'Equipo'} · {i.laboratorio_nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stats + filtros */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {[
              { label:'Pendientes',  value: stats.pendientes  ?? '—', color: isDay ? 'text-amber-800' : 'text-amber-400' },
              { label:'En revisión', value: stats.en_revision ?? '—', color:'text-blue-400'  },
              { label:'Reparados',   value: stats.reparados   ?? '—', color:'text-emerald-400' },
              { label:'Alta prioridad', value: stats.alta_prioridad ?? '—', color:'text-red-400' },
            ].map(s => (
              <div key={s.label} className={`glass-sm rounded-xl px-4 py-2.5 flex items-center gap-2.5 ${isDay ? 'bg-white border border-slate-200' : ''}`}>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className={`${isDay ? 'text-slate-600' : 'text-slate-500'} text-xs`}>{s.label}</p>
              </div>
            ))}

            <div className="flex-1 min-w-48">
              <input type="text" placeholder="Buscar equipo, descripción, lab…"
                value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)}
                className="input-dark text-sm" />
            </div>

            <SelectDark
              value={filtroLab}
              onChange={setFiltroLab}
              className="w-44"
              placeholder="Todos los labs"
              options={[{ value: '', label: 'Todos los labs' }, ...laboratorios.map(l => ({ value: l.id, label: l.nombre }))]}
            />

            <button onClick={cargarTodo} className="btn-ghost px-3 py-2.5 text-sm" title="Actualizar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          </div>

          {error && <div className="mb-4 bg-red-950/40 border border-red-800/50 text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>}

          {/* Tablero Kanban */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {COLUMNAS.map(col => (
                <KanbanColumn
                  key={col.key}
                  col={col}
                  cards={kanban[col.key] || []}
                  dragItem={dragItem}
                  isDragTarget={dragTarget === col.key}
                  onDragOver={setDragTarget}
                  onDragLeave={() => setDragTarget(null)}
                  onDrop={handleDrop}
                  onCardClick={setDrawerInc}
                />
              ))}
            </div>
          )}

          {/* Drawer detalle */}
          {drawerInc && (
            <DrawerDetalle
              incidente={drawerInc}
              laboratorios={laboratorios}
              onClose={() => setDrawerInc(null)}
              onActualizado={cargarTodo}
            />
          )}

          {/* Modal nuevo */}
          {modalNuevo && (
            <ModalNuevoIncidente
              laboratorios={laboratorios}
              activos={activos}
              onClose={() => setModalNuevo(false)}
              onCreado={cargarTodo}
            />
          )}
        </>
      )}

      {/* ── Pestaña: Mantenimiento Preventivo ──────────────────────────────── */}
      {tab === 'preventivo' && (
        <TabPreventivo laboratorios={laboratorios} />
      )}

      {/* ── Pestaña: Historial por equipo ──────────────────────────────────── */}
      {tab === 'historial' && (
        <TabHistorial laboratorios={laboratorios} />
      )}
    </AdminLayout>
  );
}
