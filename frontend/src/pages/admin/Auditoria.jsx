import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import SelectDark      from '../../components/SelectDark';
import DatePickerDark from '../../components/DatePickerDark';
import api         from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

// ── Colores por tipo de accion ─────────────────────────────────────────────
const BADGE = {
  LOGIN_OK:           'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  LOGIN_FALLIDO:      'bg-red-500/20    text-red-400    border-red-500/30',
  LOGOUT:             'bg-slate-500/15  text-slate-400  border-slate-500/30',
  CREAR_USUARIO:      'bg-blue-500/15   text-blue-400   border-blue-500/30',
  EDITAR_USUARIO:     'bg-amber-500/15  text-amber-400  border-amber-500/30',
  ELIMINAR_USUARIO:   'bg-red-500/15    text-red-400    border-red-500/30',
  IMPORTAR_USUARIOS:  'bg-violet-500/15 text-violet-400 border-violet-500/30',
  CAMBIAR_PASSWORD:   'bg-orange-500/15 text-orange-400 border-orange-500/30',
  ABRIR_SESION:       'bg-cyan-500/15   text-cyan-400   border-cyan-500/30',
  CERRAR_SESION:      'bg-slate-500/15  text-slate-400  border-slate-500/30',
  CREAR_ACTIVO:       'bg-blue-500/15   text-blue-400   border-blue-500/30',
  EDITAR_ACTIVO:      'bg-amber-500/15  text-amber-400  border-amber-500/30',
  ELIMINAR_ACTIVO:    'bg-red-500/15    text-red-400    border-red-500/30',
  IMPORTAR_ACTIVOS:   'bg-violet-500/15 text-violet-400 border-violet-500/30',
  CREAR_PRESTAMO:     'bg-teal-500/15   text-teal-400   border-teal-500/30',
  DEVOLVER_PRESTAMO:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  CREAR_LAB:          'bg-blue-500/15   text-blue-400   border-blue-500/30',
  EDITAR_LAB:         'bg-amber-500/15  text-amber-400  border-amber-500/30',
};

function AccionBadge({ accion, exito }) {
  const cls = !exito
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : (BADGE[accion] || 'bg-slate-500/15 text-slate-400 border-slate-500/30');
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
      {!exito && <span>&#x2715;</span>}
      {accion.replace(/_/g, ' ')}
    </span>
  );
}

function DetalleModal({ log, onClose }) {
  if (!log) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
         onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-base">Detalle del registro</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="space-y-3 text-sm">
          {[
            ['ID',        log.id],
            ['Fecha/Hora', log.timestamp ? new Date(log.timestamp).toLocaleString('es-MX') : '—'],
            ['Usuario',   log.usuario_nombre || '—'],
            ['Email',     log.usuario_email  || '—'],
            ['Accion',    <AccionBadge key="a" accion={log.accion} exito={log.exito} />],
            ['Recurso',   log.recurso],
            ['Recurso ID',log.recurso_id ?? '—'],
            ['IP',        log.ip_address || '—'],
            ['Resultado', log.exito ? 'Exitoso' : 'Fallido'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <span className="text-slate-500 w-28 shrink-0">{k}</span>
              <span className="text-slate-200 break-all">{v}</span>
            </div>
          ))}
          {log.detalle && (
            <div>
              <span className="text-slate-500 block mb-1">Detalle</span>
              <pre className="bg-slate-800 rounded-xl p-3 text-xs text-slate-300 overflow-auto max-h-40">
                {JSON.stringify(log.detalle, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EXITO_OPTS = [
  { value: '',      label: 'Todos los resultados' },
  { value: 'true',  label: 'Exitosos' },
  { value: 'false', label: 'Fallidos' },
];

export default function Auditoria() {
  const { toast: addToast } = useToast();

  const [items,      setItems]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [pages,      setPages]      = useState(1);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [detalle,    setDetalle]    = useState(null);
  const [exportando, setExportando] = useState(false);

  // Filtros
  const [buscar,      setBuscar]      = useState('');
  const [accion,      setAccion]      = useState('');
  const [recurso,     setRecurso]     = useState('');
  const [exito,       setExito]       = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin,    setFechaFin]    = useState('');

  const [opciones, setOpciones] = useState({ acciones: [], recursos: [] });

  useEffect(() => {
    api.get('/auditoria/acciones').then(r => setOpciones(r.data)).catch(() => {});
  }, []);

  const cargar = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 50 };
      if (buscar)       params.buscar       = buscar;
      if (accion)       params.accion       = accion;
      if (recurso)      params.recurso      = recurso;
      if (exito !== '') params.exito        = exito === 'true';
      if (fechaInicio)  params.fecha_inicio = fechaInicio;
      if (fechaFin)     params.fecha_fin    = fechaFin;

      const r = await api.get('/auditoria/', { params });
      setItems(r.data.items);
      setTotal(r.data.total);
      setPages(r.data.pages);
      setPage(p);
    } catch {
      addToast('Error al cargar bitacora', 'error');
    } finally {
      setLoading(false);
    }
  }, [buscar, accion, recurso, exito, fechaInicio, fechaFin]); // eslint-disable-line

  useEffect(() => { cargar(1); }, []); // eslint-disable-line

  const exportar = async () => {
    setExportando(true);
    try {
      const params = {};
      if (buscar)       params.buscar       = buscar;
      if (accion)       params.accion       = accion;
      if (recurso)      params.recurso      = recurso;
      if (exito !== '') params.exito        = exito === 'true';
      if (fechaInicio)  params.fecha_inicio = fechaInicio;
      if (fechaFin)     params.fecha_fin    = fechaFin;

      const r = await api.get('/auditoria/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bitacora_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast('Error al exportar', 'error');
    } finally {
      setExportando(false);
    }
  };

  const limpiar = () => {
    setBuscar(''); setAccion(''); setRecurso(''); setExito('');
    setFechaInicio(''); setFechaFin('');
    setTimeout(() => cargar(1), 0);
  };

  const inputCls = `
    bg-slate-800/60 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2
    focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
    placeholder-slate-500 transition-colors w-full
  `;

  // Opciones para SelectDark
  const accionOpts = [
    { value: '', label: 'Todas las acciones' },
    ...opciones.acciones.map(a => ({ value: a, label: a.replace(/_/g, ' ') })),
  ];
  const recursoOpts = [
    { value: '', label: 'Todos los recursos' },
    ...opciones.recursos.map(r => ({ value: r, label: r })),
  ];

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Bitacora de Auditoria</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {total.toLocaleString()} registros totales
            </p>
          </div>
          <button
            onClick={exportar}
            disabled={exportando}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500
                       disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors
                       shadow-lg shadow-emerald-900/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
            {exportando ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>

        {/* Filtros */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Texto libre */}
            <input
              className={inputCls}
              placeholder="Buscar usuario, IP..."
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && cargar(1)}
            />

            {/* Accion — SelectDark */}
            <SelectDark
              value={accion}
              onChange={setAccion}
              options={accionOpts}
              placeholder="Todas las acciones"
              size="sm"
            />

            {/* Recurso — SelectDark */}
            <SelectDark
              value={recurso}
              onChange={setRecurso}
              options={recursoOpts}
              placeholder="Todos los recursos"
              size="sm"
            />

            {/* Resultado — SelectDark */}
            <SelectDark
              value={exito}
              onChange={setExito}
              options={EXITO_OPTS}
              placeholder="Todos los resultados"
              size="sm"
            />

            {/* Fechas */}
            <DatePickerDark
              value={fechaInicio}
              onChange={setFechaInicio}
              placeholder="Fecha inicio"
            />
            <DatePickerDark
              value={fechaFin}
              onChange={setFechaFin}
              placeholder="Fecha fin"
            />
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => cargar(1)}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Buscar
            </button>
            <button
              onClick={limpiar}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    {['Fecha/Hora','Usuario','Accion','Recurso','Recurso ID','IP',''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-slate-500">
                        <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        Sin registros para los filtros aplicados
                      </td>
                    </tr>
                  ) : items.map((item, idx) => (
                    <tr key={item.id}
                        className={`border-b border-slate-800/50 transition-colors cursor-pointer
                          ${idx % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-800/20'}
                          ${!item.exito ? 'bg-red-950/10' : ''}
                          hover:bg-slate-700/30`}
                        onClick={() => setDetalle(item)}>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {item.timestamp
                          ? new Date(item.timestamp).toLocaleString('es-MX', {
                              year:'numeric', month:'2-digit', day:'2-digit',
                              hour:'2-digit', minute:'2-digit', second:'2-digit'
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-200 text-xs font-medium leading-tight">
                          {item.usuario_nombre || <span className="text-slate-600">Sistema</span>}
                        </div>
                        {item.usuario_email && (
                          <div className="text-slate-500 text-[11px]">{item.usuario_email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AccionBadge accion={item.accion} exito={item.exito} />
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{item.recurso}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{item.recurso_id ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">{item.ip_address || '—'}</td>
                      <td className="px-4 py-3">
                        <button className="text-slate-600 hover:text-blue-400 transition-colors" title="Ver detalle"
                                onClick={e => { e.stopPropagation(); setDetalle(item); }}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginacion */}
        {pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-slate-500 text-xs">
              Pagina {page} de {pages} &nbsp;&middot;&nbsp; {total.toLocaleString()} registros
            </p>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => cargar(page - 1)}
                      className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-30
                                 text-slate-300 rounded-lg transition-colors">
                Anterior
              </button>
              <button disabled={page >= pages} onClick={() => cargar(page + 1)}
                      className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-30
                                 text-slate-300 rounded-lg transition-colors">
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Modal detalle */}
        <DetalleModal log={detalle} onClose={() => setDetalle(null)} />
      </div>
    </AdminLayout>
  );
}
