import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const ESTADO_CLS = {
  PENDIENTE:   'bg-red-500/15    text-red-400    border-red-500/30',
  EN_REVISION: 'bg-amber-500/15  text-amber-400  border-amber-500/30',
  RESUELTO:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  EXONERADO:   'bg-slate-500/15  text-slate-400  border-slate-500/30',
};
const ORIGEN_LABEL = {
  MANUAL:'Manual', PRESTAMO:'Préstamo',
  INCIDENTE_PRESENCIADO:'Presenciado', REVISION_ENTRADA:'Rev. entrada',
};

function Badge({ cls, children }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{children}</span>;
}

function SeccionHeader({ icon, titulo, count, color = 'text-white' }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xl">{icon}</span>
      <h3 className={`font-semibold text-base ${color}`}>{titulo}</h3>
      {count !== undefined && (
        <span className="ml-auto bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full font-medium">{count}</span>
      )}
    </div>
  );
}

export default function ConsultaPersona() {
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError]       = useState('');

  const buscar = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(''); setResultado(null);
    try {
      const r = await api.get(`/adeudos/persona/${encodeURIComponent(query.trim())}`);
      setResultado(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo obtener la información.');
    } finally { setLoading(false); }
  };

  const res = resultado?.resumen;
  const tieneAdeudosActivos = res?.tiene_adeudos_activos;
  const tienePrestamosVencidos = res?.prestamos_vencidos > 0;
  const tieneProblemas = tieneAdeudosActivos || tienePrestamosVencidos;

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Consulta de Persona</h1>
        <p className="text-slate-400 text-sm mt-1">
          Busca por matrícula o RFC para ver todos los adeudos y préstamos de una persona
        </p>
      </div>

      {/* Buscador */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <label className="text-slate-400 text-sm block mb-3">Matrícula del alumno o RFC / nómina del docente</label>
        <div className="flex gap-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            className="input-dark flex-1 text-base"
            placeholder="Ej: A12345 ó GARG800101XXX"
            autoFocus
          />
          <button onClick={buscar} disabled={loading || !query.trim()}
            className="btn-emerald px-6 disabled:opacity-50 shrink-0">
            {loading ? 'Buscando...' : '🔍 Buscar'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="space-y-6">

          {/* Tarjeta de identidad */}
          <div className={`rounded-2xl border p-6 ${tieneProblemas ? 'bg-red-950/20 border-red-800/40' : 'bg-emerald-950/20 border-emerald-800/40'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-3xl">{resultado.persona_tipo === 'DOCENTE' ? '👨‍🏫' : '🎓'}</span>
                  <div>
                    <h2 className="text-white text-xl font-bold">{resultado.nombre}</h2>
                    <p className="text-slate-400 font-mono text-sm">{resultado.identificador}</p>
                  </div>
                </div>
                {resultado.catalogo && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {resultado.catalogo.carrera && (
                      <span className="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full">{resultado.catalogo.carrera}</span>
                    )}
                    {resultado.catalogo.cuatrimestre && (
                      <span className="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full">Cuatrimestre {resultado.catalogo.cuatrimestre}</span>
                    )}
                    {resultado.catalogo.grupo && (
                      <span className="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full">Grupo {resultado.catalogo.grupo}</span>
                    )}
                    {resultado.catalogo.periodo && (
                      <span className="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full">{resultado.catalogo.periodo}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Semáforo */}
              <div className={`rounded-xl px-6 py-4 text-center shrink-0 ${tieneProblemas ? 'bg-red-900/30 border border-red-700/40' : 'bg-emerald-900/30 border border-emerald-700/40'}`}>
                <div className="text-4xl mb-1">{tieneProblemas ? '🔴' : '🟢'}</div>
                <p className={`font-bold text-sm ${tieneProblemas ? 'text-red-400' : 'text-emerald-400'}`}>
                  {tieneProblemas ? 'CON ADEUDOS' : 'SIN ADEUDOS'}
                </p>
              </div>
            </div>

            {/* Mini stats */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-5">
              {[
                { label: 'Pendientes',   val: res.adeudos_pendientes, color: res.adeudos_pendientes > 0 ? 'text-red-400' : 'text-slate-400' },
                { label: 'En revisión',  val: res.adeudos_revision,   color: res.adeudos_revision   > 0 ? 'text-amber-400' : 'text-slate-400' },
                { label: 'Resueltos',    val: res.adeudos_resueltos,  color: 'text-emerald-400' },
                { label: 'Exonerados',   val: res.adeudos_exonerados, color: 'text-slate-400' },
                { label: 'Préstamos act.',val: res.prestamos_activos, color: 'text-blue-400' },
                { label: 'Vencidos',     val: res.prestamos_vencidos, color: res.prestamos_vencidos > 0 ? 'text-red-400' : 'text-slate-400' },
              ].map(s => (
                <div key={s.label} className="bg-black/20 rounded-xl p-3 text-center">
                  <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-slate-500 text-[10px] mt-0.5 leading-tight">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Adeudos */}
          {resultado.adeudos.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <SeccionHeader icon="⚠️" titulo="Historial de adeudos" count={resultado.adeudos.length} />
              <div className="space-y-3">
                {resultado.adeudos.map(a => (
                  <div key={a.id}
                    className={`rounded-xl p-4 border transition-all ${
                      ['PENDIENTE','EN_REVISION'].includes(a.estado)
                        ? 'bg-red-950/10 border-red-800/30'
                        : 'bg-slate-800/30 border-slate-700/30'
                    }`}>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge cls={ESTADO_CLS[a.estado] || ESTADO_CLS.PENDIENTE}>
                        {a.estado.replace('_',' ')}
                      </Badge>
                      <span className="text-slate-500 text-xs">{ORIGEN_LABEL[a.origen_tipo] || a.origen_tipo}</span>
                      {a.laboratorio_nombre && (
                        <span className="text-slate-500 text-xs">📍 {a.laboratorio_nombre}</span>
                      )}
                      {a.cuatrimestre && (
                        <span className="text-slate-500 text-xs">📅 {a.cuatrimestre}</span>
                      )}
                      <span className="ml-auto text-slate-600 text-xs">#{a.id}</span>
                    </div>
                    <p className="text-slate-200 text-sm">{a.descripcion}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                      {a.fecha_reporte && (
                        <span>Reportado: {new Date(a.fecha_reporte).toLocaleDateString('es-MX')}</span>
                      )}
                      {a.monto_estimado != null && (
                        <span className="text-amber-400 font-medium">Monto: ${a.monto_estimado.toFixed(2)}</span>
                      )}
                      {a.sesion_id && <span>Sesión #{a.sesion_id}</span>}
                      {a.computadora_codigo && <span>PC: {a.computadora_codigo}</span>}
                      {a.prestamo_id && <span>Préstamo #{a.prestamo_id}</span>}
                    </div>
                    {a.notas_resolucion && (
                      <p className="mt-2 text-xs text-emerald-400 bg-emerald-900/10 rounded-lg px-3 py-1.5">
                        ✓ {a.notas_resolucion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Préstamos */}
          {resultado.prestamos.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <SeccionHeader icon="📦" titulo="Historial de préstamos" count={resultado.prestamos.length} />
              <div className="space-y-3">
                {resultado.prestamos.map(p => (
                  <div key={p.id}
                    className={`rounded-xl p-4 border ${
                      p.vencido
                        ? 'bg-red-950/10 border-red-800/30'
                        : p.estado === 'DEVUELTO'
                          ? 'bg-slate-800/30 border-slate-700/30'
                          : 'bg-blue-950/10 border-blue-800/30'
                    }`}>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        p.vencido            ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                        p.estado==='DEVUELTO'? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                                               'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      }`}>
                        {p.vencido ? '⚠️ Vencido' : p.estado}
                      </span>
                      <span className="text-white font-medium text-sm">{p.activo_nombre}</span>
                      <span className="text-slate-500 text-xs font-mono">{p.activo_codigo}</span>
                      <span className="ml-auto text-slate-600 text-xs">#{p.id}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                      {p.fecha_salida && <span>Salida: {new Date(p.fecha_salida).toLocaleDateString('es-MX')}</span>}
                      {p.fecha_retorno_esperada && (
                        <span className={p.vencido ? 'text-red-400 font-medium' : ''}>
                          Límite: {new Date(p.fecha_retorno_esperada).toLocaleDateString('es-MX')}
                        </span>
                      )}
                      {p.fecha_retorno_real && <span className="text-emerald-400">Devuelto: {new Date(p.fecha_retorno_real).toLocaleDateString('es-MX')}</span>}
                      {p.condicion_retorno && <span>Condición: {p.condicion_retorno}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sin registros */}
          {resultado.adeudos.length === 0 && resultado.prestamos.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <div className="text-5xl mb-3">📋</div>
              <p className="text-slate-400 font-medium">Sin registros para esta persona</p>
              <p className="text-slate-600 text-sm mt-1">No se encontraron adeudos ni préstamos asociados a este identificador.</p>
            </div>
          )}
        </div>
      )}

      {/* Estado inicial */}
      {!resultado && !loading && !error && (
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-16 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-slate-400 font-medium text-lg">Ingresa una matrícula o RFC para consultar</p>
          <p className="text-slate-600 text-sm mt-2">
            Verás todos los adeudos, préstamos y trazabilidad de incidentes en una sola vista
          </p>
        </div>
      )}
    </AdminLayout>
  );
}
