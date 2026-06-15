import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import AutocompleteInput from '../../components/AutocompleteInput';
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

function SeccionHeader({ icon, titulo, count }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xl">{icon}</span>
      <h3 className="font-semibold text-base text-white">{titulo}</h3>
      {count !== undefined && (
        <span className="ml-auto bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full font-medium">{count}</span>
      )}
    </div>
  );
}

export default function ConsultaPersona() {
  const [busqueda, setBusqueda]     = useState('');
  const [seleccionado, setSeleccionado] = useState(null); // alumno del catálogo
  const [loading, setLoading]       = useState(false);
  const [resultado, setResultado]   = useState(null);
  const [error, setError]           = useState('');

  const cargarPerfil = async (matricula) => {
    setLoading(true); setError(''); setResultado(null);
    try {
      const r = await api.get(`/adeudos/persona/${encodeURIComponent(matricula)}`);
      setResultado(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo obtener la información.');
    } finally { setLoading(false); }
  };

  const handleSeleccionar = (persona) => {
    // Soporta tanto alumnos (tienen matricula) como personal (tienen numero_empleado)
    const identificador = persona.identificador || persona.matricula;
    const nombre = persona.nombre ||
      [persona.apellido_paterno, persona.apellido_materno, persona.nombres].filter(Boolean).join(' ');
    setBusqueda(`${identificador} — ${nombre}`);
    setSeleccionado({ ...persona, identificador, nombre });
    cargarPerfil(identificador);
  };

  const limpiar = () => {
    setBusqueda(''); setSeleccionado(null); setResultado(null); setError('');
  };

  const res = resultado?.resumen;
  const tieneProblemas = res?.tiene_adeudos_activos || res?.prestamos_vencidos > 0;

  return (
    <AdminLayout>
      <div className="p-2 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors shrink-0"
          title="Volver"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Consulta de Persona</h1>
          <p className="text-slate-400 text-sm">
            Busca alumnos, docentes o personal por nombre, matrícula o número de empleado
          </p>
        </div>
      </div>

      {/* Buscador — input como protagonista, sin caja dentro de caja */}
      <div className="glass rounded-2xl p-4">
        {!seleccionado ? (
          <AutocompleteInput
            endpoint="/catalogo/buscar-personas"
            placeholder="Escribe nombre, matrícula o número de empleado…"
            value={busqueda}
            onChange={setBusqueda}
            onSelect={handleSeleccionar}
            minChars={2}
            className="input-dark w-full text-base"
            renderItem={p => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-base shrink-0">
                    {p.tipo === 'ALUMNO' ? '🎓' : '👤'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{p.nombre}</p>
                    <p className="text-xs text-slate-400 font-mono">{p.subtitulo}</p>
                  </div>
                </div>
                {p.extra && (
                  <span className="text-xs text-slate-500 shrink-0 truncate max-w-[120px]">{p.extra}</span>
                )}
              </div>
            )}
          />
        ) : (
          /* Chip del alumno seleccionado */
          <div className="flex items-center gap-3 p-3 bg-slate-800/60 border border-slate-700 rounded-xl">
            <span className="text-2xl">{seleccionado?.tipo === 'PERSONAL' ? '👤' : '🎓'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">{resultado?.nombre || busqueda}</p>
              <p className="text-slate-400 text-xs font-mono">{seleccionado.identificador}</p>
            </div>
            <button onClick={limpiar}
              className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors shrink-0">
              ✕ Cambiar
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 mt-3 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Cargando perfil…
          </div>
        )}
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
                  <span className="text-3xl">🎓</span>
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
                { label: 'Pendientes',    val: res.adeudos_pendientes,  color: res.adeudos_pendientes > 0  ? 'text-red-400'     : 'text-slate-400' },
                { label: 'En revisión',   val: res.adeudos_revision,    color: res.adeudos_revision   > 0  ? 'text-amber-400'   : 'text-slate-400' },
                { label: 'Resueltos',     val: res.adeudos_resueltos,   color: 'text-emerald-400' },
                { label: 'Exonerados',    val: res.adeudos_exonerados,  color: 'text-slate-400' },
                { label: 'Préstamos act.',val: res.prestamos_activos,   color: 'text-blue-400' },
                { label: 'Vencidos',      val: res.prestamos_vencidos,  color: res.prestamos_vencidos > 0  ? 'text-red-400'     : 'text-slate-400' },
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
                      {a.prestamo_id && <span>Préstamo #{a.prestamo_id}</span>}
                      {a.computadora_codigo && <span>PC: {a.computadora_codigo}</span>}
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
                        p.vencido             ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                        p.estado==='DEVUELTO' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
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
            <div className="glass rounded-2xl p-12 text-center">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-slate-300 font-semibold text-lg">Sin adeudos ni préstamos</p>
              <p className="text-slate-500 text-sm mt-1">Este alumno no tiene registros pendientes.</p>
            </div>
          )}
        </div>
      )}

      {/* Estado inicial */}
      {!resultado && !loading && !error && (
        <div className="glass rounded-2xl p-16 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-slate-400 font-medium text-lg">Busca una persona para consultar su historial</p>
          <p className="text-slate-500 text-sm mt-2">
            Escribe el nombre o matrícula — verás adeudos, préstamos y trazabilidad en una sola vista
          </p>
        </div>
      )}

      </div>{/* /max-w-7xl */}
    </AdminLayout>
  );
}
