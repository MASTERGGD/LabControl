import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { formatApiError } from '../../components/AutocompleteInput';

const ESTADOS = ['', 'ENVIADA', 'REQUIERE_CORRECCION', 'VALIDADA', 'RECHAZADA', 'BORRADOR', 'PENDIENTE_CAPTURA'];

const ESTADO_INFO = {
  PENDIENTE_CAPTURA:   { cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30',    label: 'Pendiente captura' },
  BORRADOR:            { cls: 'bg-blue-500/15   text-blue-400   border-blue-500/30',    label: 'Borrador'          },
  ENVIADA:             { cls: 'bg-amber-500/15  text-amber-400  border-amber-500/30',   label: 'Enviada — pendiente' },
  REQUIERE_CORRECCION: { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30',  label: 'Req. corrección'   },
  VALIDADA:            { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Validada'        },
  RECHAZADA:           { cls: 'bg-red-500/15    text-red-400    border-red-500/30',     label: 'Rechazada'         },
};

function Badge({ estado }) {
  const e = ESTADO_INFO[estado] || { cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30', label: estado };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${e.cls}`}>{e.label}</span>;
}

// ── Secciones para mostrar en detalle ────────────────────────────────────────
const SECCIONES_DETALLE = [
  { titulo: 'Datos personales', campos: [
    ['nombre_completo','Nombre completo'],['fecha_ingreso','Fecha ingreso'],
    ['carrera','Carrera'],['sexo','Sexo'],['estado_civil','Estado civil'],
    ['lugar_nacimiento','Lugar de nacimiento'],['fecha_nacimiento','Fecha nacimiento'],
    ['tiene_hijos','Tiene hijos'],['num_hijos','Núm. hijos'],
    ['habla_lengua','Habla lengua indígena'],['lengua','Lengua'],
  ]},
  { titulo: 'Contacto y domicilios', campos: [
    ['telefono','Teléfono'],
    ['procedencia_calle','Proc. calle'],['procedencia_colonia','Proc. colonia'],
    ['procedencia_localidad','Proc. localidad'],['procedencia_municipio','Proc. municipio'],
    ['procedencia_estado','Proc. estado'],['procedencia_cp','Proc. C.P.'],
    ['residencia_calle','Res. calle'],['residencia_colonia','Res. colonia'],
    ['residencia_localidad','Res. localidad'],['residencia_municipio','Res. municipio'],
    ['residencia_estado','Res. estado'],['residencia_cp','Res. C.P.'],
  ]},
  { titulo: 'Antecedentes escolares', campos: [
    ['bachillerato','Bachillerato'],['bachillerato_ubicacion','Ubicación'],
    ['periodo_estudios','Período estudios'],['promedio','Promedio'],['area_bachillerato','Área'],
  ]},
  { titulo: 'Situación económica', campos: [
    ['depende_de','Depende de'],['responsable_nombre','Nombre responsable'],
    ['responsable_parentesco','Parentesco'],['responsable_ocupacion','Ocupación'],
    ['responsable_estudios','Estudios responsable'],['responsable_telefono','Tel. responsable'],
    ['ingreso_mensual','Ingreso mensual'],['gasto_mensual','Gasto mensual'],
    ['dependientes','Dependientes'],['recibe_apoyo','Recibe apoyo'],['institucion_apoyo','Institución'],
  ]},
  { titulo: 'Salud', campos: [
    ['tiene_alergia','Alergia'],['alergia_cual','¿Cuál alergia?'],['alergia_medicamento','Medicamento'],
    ['enfermedad_cronica','Enf. crónica'],['enfermedad_cual','¿Cuál?'],['enfermedad_medicamento','Medicamento'],
    ['tiene_discapacidad','Discapacidad'],['discapacidad_tipo','Tipo'],['discapacidad_medicamento','Medicamento'],
    ['informacion_relevante','Información relevante'],
  ]},
];

// ── Modal detalle + revisión ──────────────────────────────────────────────────
function ModalFicha({ fichaId, onClose, onCambio }) {
  const [ficha, setFicha]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [accion, setAccion]   = useState('');     // VALIDADA | REQUIERE_CORRECCION | RECHAZADA
  const [nota, setNota]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get(`/servicios-escolares/fichas/${fichaId}`)
      .then(r => setFicha(r.data))
      .catch(() => setError('Error al cargar ficha'))
      .finally(() => setLoading(false));
  }, [fichaId]);

  const guardarEstado = async () => {
    if (!accion) return;
    if (accion === 'REQUIERE_CORRECCION' && !nota.trim()) {
      setError('Escribe la nota de corrección para el alumno'); return;
    }
    setSaving(true); setError('');
    try {
      await api.patch(`/servicios-escolares/fichas/${fichaId}/estado`, {
        estado: accion, nota_correccion: nota || null,
      });
      onCambio();
      onClose();
    } catch (e) {
      setError(formatApiError(e, 'Error al cambiar estado'));
    } finally { setSaving(false); }
  };

  const puedeRevisar = ficha && ['ENVIADA', 'REQUIERE_CORRECCION'].includes(ficha.estado);

  const fmt = (v) => {
    if (v === null || v === undefined || v === '') return <span className="text-slate-600">—</span>;
    if (v === true)  return <span className="text-emerald-400">Sí</span>;
    if (v === false) return <span className="text-slate-500">No</span>;
    return String(v);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="glass rounded-2xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Ficha socioeconómica</h3>
            {ficha && (
              <p className="text-slate-400 text-sm mt-1">
                {ficha.alumno_nombre} · {ficha.alumno_matricula} · {ficha.periodo}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 animate-pulse">Cargando…</div>
        ) : !ficha ? (
          <div className="p-6 text-red-400">{error}</div>
        ) : (
          <>
            {/* Estado actual */}
            <div className="px-6 pt-4 flex items-center gap-3">
              <Badge estado={ficha.estado} />
              {ficha.enviada_en && (
                <span className="text-xs text-slate-500">
                  Enviada: {new Date(ficha.enviada_en).toLocaleDateString('es-MX')}
                </span>
              )}
              {ficha.nota_correccion && (
                <span className="text-xs text-orange-400">Nota: {ficha.nota_correccion}</span>
              )}
            </div>

            {/* Datos de la ficha por secciones */}
            <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto">
              {SECCIONES_DETALLE.map(sec => (
                <div key={sec.titulo}>
                  <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">{sec.titulo}</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {sec.campos.map(([campo, label]) => (
                      ficha[campo] !== null && ficha[campo] !== undefined && ficha[campo] !== '' ? (
                        <div key={campo} className="flex flex-col">
                          <span className="text-xs text-slate-500">{label}</span>
                          <span className="text-sm text-white">{fmt(ficha[campo])}</span>
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Revisión */}
            {puedeRevisar && (
              <div className="border-t border-white/10 p-6 space-y-4">
                <h4 className="text-sm font-semibold text-white">Decisión de revisión</h4>
                <div className="flex gap-2">
                  {['VALIDADA', 'REQUIERE_CORRECCION', 'RECHAZADA'].map(op => {
                    const colors = {
                      VALIDADA: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                      REQUIERE_CORRECCION: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
                      RECHAZADA: 'bg-red-500/15 text-red-400 border-red-500/30',
                    };
                    const labels = {
                      VALIDADA: '✓ Validar', REQUIERE_CORRECCION: '✏️ Requiere corrección', RECHAZADA: '✕ Rechazar',
                    };
                    return (
                      <button
                        key={op}
                        onClick={() => { setAccion(op); setNota(''); }}
                        className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                          accion === op
                            ? colors[op] + ' ring-2 ring-offset-1 ring-offset-transparent'
                            : 'border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        {labels[op]}
                      </button>
                    );
                  })}
                </div>

                {(accion === 'REQUIERE_CORRECCION' || accion === 'RECHAZADA') && (
                  <textarea
                    value={nota}
                    onChange={e => setNota(e.target.value)}
                    placeholder={accion === 'REQUIERE_CORRECCION'
                      ? 'Indica al alumno qué debe corregir…'
                      : 'Motivo del rechazo (opcional)…'}
                    rows={3}
                    className="input-dark w-full text-sm"
                  />
                )}

                {error && <p className="text-sm text-red-400">{error}</p>}

                <div className="flex justify-end gap-2">
                  <button onClick={onClose} className="btn-ghost">Cancelar</button>
                  <button
                    onClick={guardarEstado}
                    disabled={!accion || saving}
                    className="btn-primary disabled:opacity-50"
                  >
                    {saving ? 'Guardando…' : 'Confirmar decisión'}
                  </button>
                </div>
              </div>
            )}

            {!puedeRevisar && (
              <div className="border-t border-white/10 p-4 flex justify-end">
                <button onClick={onClose} className="btn-ghost">Cerrar</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SEFichas() {
  const [fichas, setFichas]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('ENVIADA');
  const [fichaSelId, setFichaSelId]     = useState(null);

  const cargar = useCallback(async (q = busqueda, estado = filtroEstado) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 80 });
      if (q.trim()) params.set('q', q.trim());
      if (estado)   params.set('estado', estado);
      const { data } = await api.get(`/servicios-escolares/fichas?${params}`);
      setFichas(data.items || []);
      setTotal(data.total || 0);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [busqueda, filtroEstado]);

  useEffect(() => { cargar(); }, []);

  const onBuscar = (e) => {
    setBusqueda(e.target.value);
    clearTimeout(window._seTimer2);
    window._seTimer2 = setTimeout(() => cargar(e.target.value, filtroEstado), 350);
  };

  const onFiltro = (e) => {
    setFiltroEstado(e.target.value);
    cargar(busqueda, e.target.value);
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Estudios socioeconómicos</h1>
            <p className="text-slate-400 text-sm">{total} fichas</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="glass rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={busqueda}
            onChange={onBuscar}
            placeholder="🔍 Buscar por nombre o matrícula…"
            className="input-dark flex-1"
          />
          <select value={filtroEstado} onChange={onFiltro} className="input-dark sm:w-52">
            {ESTADOS.map(e => (
              <option key={e} value={e}>{e ? (ESTADO_INFO[e]?.label || e) : 'Todos los estados'}</option>
            ))}
          </select>
        </div>

        {/* Lista */}
        <div className="glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500 animate-pulse">Cargando…</div>
          ) : fichas.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-500">Sin fichas con el filtro seleccionado</p>
              {filtroEstado === 'ENVIADA' && (
                <p className="text-slate-600 text-sm mt-2">No hay fichas enviadas pendientes de revisión.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Alumno</th>
                    <th className="px-4 py-3 text-left">Carrera</th>
                    <th className="px-4 py-3 text-left">Período</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Enviada</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {fichas.map(f => (
                    <tr key={f.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{f.alumno_nombre || '—'}</p>
                        <p className="text-slate-500 text-xs font-mono">{f.alumno_matricula}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                        {f.alumno_carrera}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{f.periodo}</td>
                      <td className="px-4 py-3">
                        <Badge estado={f.estado} />
                        {f.nota_correccion && (
                          <p className="text-xs text-orange-400 mt-1 max-w-[160px] truncate">{f.nota_correccion}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {f.enviada_en ? new Date(f.enviada_en).toLocaleDateString('es-MX') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setFichaSelId(f.id)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30"
                        >
                          {['ENVIADA','REQUIERE_CORRECCION'].includes(f.estado) ? 'Revisar' : 'Ver'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {fichaSelId && (
        <ModalFicha
          fichaId={fichaSelId}
          onClose={() => setFichaSelId(null)}
          onCambio={() => cargar()}
        />
      )}
    </AdminLayout>
  );
}
