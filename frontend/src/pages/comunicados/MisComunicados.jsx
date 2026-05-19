/**
 * MisComunicados.jsx
 * Vista del usuario: comunicados institucionales que le corresponden.
 * - Filtros por estado de lectura, categoría y prioridad
 * - Drawer de detalle con acción "Marcar como leído" y "Confirmar lectura"
 * - Historial completo de comunicados leídos
 */
import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

// ─── Constantes ────────────────────────────────────────────────────────────────
const CATEGORIAS = {
  ACADEMICO:      { l: 'Académico',       color: 'bg-blue-500/20 text-blue-300 border-blue-500/30'        },
  ADMINISTRATIVO: { l: 'Administrativo',  color: 'bg-slate-500/20 text-slate-300 border-slate-500/30'     },
  EVENTOS:        { l: 'Eventos',         color: 'bg-purple-500/20 text-purple-300 border-purple-500/30'  },
  MANTENIMIENTO:  { l: 'Mantenimiento',   color: 'bg-orange-500/20 text-orange-300 border-orange-500/30'  },
  RRHH:           { l: 'Recursos Humanos',color: 'bg-pink-500/20 text-pink-300 border-pink-500/30'        },
  GENERAL:        { l: 'General',         color: 'bg-teal-500/20 text-teal-300 border-teal-500/30'        },
  URGENTE:        { l: 'Urgente',         color: 'bg-red-500/20 text-red-300 border-red-500/30'           },
};
const PRIORIDAD_CFG = {
  INFORMATIVO: { dot: 'bg-slate-400', ring: 'border-slate-500/30' },
  IMPORTANTE:  { dot: 'bg-amber-400', ring: 'border-amber-500/30' },
  URGENTE:     { dot: 'bg-red-400',   ring: 'border-red-500/30'   },
};

// ─── Drawer Detalle ────────────────────────────────────────────────────────────
function DrawerDetalle({ comunicado: c, onClose, onActualizado }) {
  const { toast: showToast } = useToast();
  const [acting, setActing] = useState(false);
  const cat  = CATEGORIAS[c.categoria]    || { l: c.categoria, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' };
  const prio = PRIORIDAD_CFG[c.prioridad] || PRIORIDAD_CFG.INFORMATIVO;

  const marcarLeido = async () => {
    if (c.leido) return;
    setActing(true);
    try {
      await api.post(`/comunicados/${c.id}/leer`, {});
      showToast('Marcado como leído', 'success');
      onActualizado();
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error'); }
    finally { setActing(false); }
  };

  const confirmarLectura = async () => {
    setActing(true);
    try {
      await api.post(`/comunicados/${c.id}/confirmar`, {});
      showToast('Lectura confirmada', 'success');
      onActualizado();
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error'); }
    finally { setActing(false); }
  };

  const isUrgente = c.prioridad === 'URGENTE';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md bg-slate-900 border-l border-white/10 flex flex-col h-full overflow-hidden animate-slideInRight ${
        isUrgente ? 'border-l-2 border-l-red-500/50' : ''
      }`}>

        {/* Header */}
        <div className={`px-6 py-5 border-b border-white/5 ${
          isUrgente ? 'bg-gradient-to-r from-red-950/40' : 'bg-gradient-to-r from-slate-800/50'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cat.color}`}>
                  {cat.l}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
                  {c.prioridad.charAt(0) + c.prioridad.slice(1).toLowerCase()}
                </span>
                {c.leido && (
                  <span className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-full">
                    ✓ Leído
                  </span>
                )}
                {c.confirmado && (
                  <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-full">
                    ✓ Confirmado
                  </span>
                )}
              </div>
              <h3 className="font-bold text-white text-lg leading-snug">{c.titulo}</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white mt-1 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Urgente banner */}
          {isUrgente && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-red-400 text-lg">⚠️</span>
              <p className="text-sm text-red-300 font-medium">Comunicado urgente — requiere atención inmediata</p>
            </div>
          )}

          {/* Contenido */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Contenido</h4>
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line bg-white/5 rounded-xl p-4">
              {c.contenido}
            </p>
          </section>

          {/* Meta info */}
          <section className="space-y-2">
            {c.area_emisora && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 w-28 flex-shrink-0">Área emisora</span>
                <span className="text-slate-300">{c.area_emisora}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 w-28 flex-shrink-0">Publicado por</span>
              <span className="text-slate-300">{c.autor_nombre}</span>
            </div>
            {c.fecha_publicacion && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 w-28 flex-shrink-0">Publicado el</span>
                <span className="text-slate-300">{c.fecha_publicacion?.slice(0,16).replace('T',' ')}</span>
              </div>
            )}
            {c.fecha_expiracion && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 w-28 flex-shrink-0">Expira el</span>
                <span className="text-slate-300">{c.fecha_expiracion?.slice(0,16).replace('T',' ')}</span>
              </div>
            )}
          </section>

          {/* Estado lectura */}
          {(c.leido || c.confirmado) && (
            <section className="space-y-2 border-t border-white/5 pt-4">
              {c.leido_en && (
                <p className="text-xs text-slate-500">
                  Leído el {c.leido_en?.slice(0,16).replace('T',' ')}
                </p>
              )}
              {c.confirmado_en && (
                <p className="text-xs text-slate-500">
                  Confirmado el {c.confirmado_en?.slice(0,16).replace('T',' ')}
                </p>
              )}
            </section>
          )}
        </div>

        {/* Footer acciones */}
        <div className="p-4 border-t border-white/5 space-y-2">
          {!c.leido && (
            <button onClick={marcarLeido} disabled={acting}
              className="w-full bg-blue-600/70 hover:bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
              {acting ? 'Procesando…' : '✓ Marcar como leído'}
            </button>
          )}
          {c.requiere_confirmacion && !c.confirmado && (
            <button onClick={confirmarLectura} disabled={acting}
              className="w-full bg-green-600/70 hover:bg-green-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
              {acting ? 'Procesando…' : '✅ Confirmar lectura'}
            </button>
          )}
          {c.leido && !c.requiere_confirmacion && (
            <p className="text-center text-xs text-slate-500 py-1">Ya leíste este comunicado</p>
          )}
          {c.leido && c.requiere_confirmacion && c.confirmado && (
            <p className="text-center text-xs text-slate-500 py-1">Lectura confirmada ✓</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function MisComunicados() {
  const { toast: showToast } = useToast();
  const [comunicados, setComunicados] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filtro, setFiltro]           = useState('pendientes'); // 'pendientes' | 'todos'
  const [filtroCat, setFiltroCat]     = useState('');
  const [detalle, setDetalle]         = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtro === 'pendientes' ? '?solo_pendientes=true' : '';
      const { data } = await api.get(`/comunicados/mis-comunicados${params}`);
      setComunicados(data);
    } catch { showToast('Error al cargar comunicados', 'error'); }
    finally { setLoading(false); }
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleActualizado = () => {
    setDetalle(prev => {
      if (!prev) return null;
      // Recargamos pero mantenemos el drawer abierto
      cargar();
      return prev;
    });
  };

  const filtrados = comunicados.filter(c => !filtroCat || c.categoria === filtroCat);

  // Separar urgentes del resto
  const urgentes  = filtrados.filter(c => c.prioridad === 'URGENTE'     && !c.leido);
  const normales  = filtrados.filter(c => c.prioridad !== 'URGENTE'     || c.leido);

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Comunicados</h1>
          <p className="text-slate-400 text-sm mt-0.5">Avisos institucionales dirigidos a ti</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1 glass rounded-xl p-1">
            {[
              { k: 'pendientes', l: 'Pendientes' },
              { k: 'todos',      l: 'Todos'      },
            ].map(({ k, l }) => (
              <button key={k} onClick={() => setFiltro(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filtro === k ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}>{l}</button>
            ))}
          </div>
          <select className="input-dark !py-1.5 !text-sm w-auto"
            value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
            <option value="">Todas las categorías</option>
            {Object.entries(CATEGORIAS).map(([v, c]) =>
              <option key={v} value={v}>{c.l}</option>
            )}
          </select>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="glass rounded-2xl h-24 animate-pulse" />)}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center space-y-3">
            <div className="text-5xl">📭</div>
            <p className="text-white font-semibold">
              {filtro === 'pendientes' ? 'Sin comunicados pendientes' : 'Sin comunicados'}
            </p>
            <p className="text-slate-400 text-sm">
              {filtro === 'pendientes'
                ? 'Estás al día. No tienes comunicados sin leer.'
                : 'No hay comunicados disponibles.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Urgentes primero */}
            {urgentes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-red-400/70 uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5">
                  ⚠️ Urgentes
                </h3>
                <div className="space-y-2">
                  {urgentes.map(c => <TarjetaComunicado key={c.id} c={c} onClick={() => setDetalle(c)} />)}
                </div>
              </div>
            )}

            {/* Resto */}
            {normales.length > 0 && (
              <div>
                {urgentes.length > 0 && (
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
                    Otros comunicados
                  </h3>
                )}
                <div className="space-y-2">
                  {normales.map(c => <TarjetaComunicado key={c.id} c={c} onClick={() => setDetalle(c)} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {detalle && (
        <DrawerDetalle
          comunicado={detalle}
          onClose={() => setDetalle(null)}
          onActualizado={handleActualizado}
        />
      )}
    </AdminLayout>
  );
}

function TarjetaComunicado({ c, onClick }) {
  const cat  = CATEGORIAS[c.categoria]    || { l: c.categoria, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' };
  const prio = PRIORIDAD_CFG[c.prioridad] || PRIORIDAD_CFG.INFORMATIVO;
  const isUrgente = c.prioridad === 'URGENTE' && !c.leido;

  return (
    <div onClick={onClick}
      className={`glass rounded-2xl p-4 cursor-pointer hover:bg-white/5 transition-colors ${
        isUrgente ? 'border border-red-500/30' : ''
      } ${!c.leido ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cat.color}`}>
              {cat.l}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
              {c.prioridad.charAt(0) + c.prioridad.slice(1).toLowerCase()}
            </span>
            {!c.leido && (
              <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" title="No leído" />
            )}
            {c.requiere_confirmacion && !c.confirmado && c.leido && (
              <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                Pendiente confirmar
              </span>
            )}
          </div>
          <p className={`font-medium text-sm truncate ${!c.leido ? 'text-white' : 'text-slate-300'}`}>
            {c.titulo}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{c.contenido}</p>
          {c.area_emisora && (
            <p className="text-xs text-slate-600 mt-1">📍 {c.area_emisora}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-500">
            {c.fecha_publicacion?.slice(0,10)}
          </p>
          {c.leido && <p className="text-xs text-green-500 mt-1">✓ Leído</p>}
        </div>
      </div>
    </div>
  );
}
