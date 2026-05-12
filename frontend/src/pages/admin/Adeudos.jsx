import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import SelectDark from '../../components/SelectDark';
import CuatrimestreSelect, { getCuatrimestreActual } from '../../components/CuatrimestreSelect';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

// ── Badges ────────────────────────────────────────────────────────────────────
const ESTADO_CLS = {
  PENDIENTE:   'bg-red-500/15    text-red-400    border-red-500/30',
  EN_REVISION: 'bg-amber-500/15  text-amber-400  border-amber-500/30',
  RESUELTO:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  EXONERADO:   'bg-slate-500/15  text-slate-400  border-slate-500/30',
};
const TIPO_CLS = {
  DAÑO:                 'bg-orange-500/15  text-orange-400  border-orange-500/30',
  PERDIDA:              'bg-red-500/15     text-red-400     border-red-500/30',
  ROBO:                 'bg-rose-500/15    text-rose-400    border-rose-500/30',
  PRESTAMO_VENCIDO:     'bg-amber-500/15   text-amber-400   border-amber-500/30',
  PRESTAMO_NO_DEVUELTO: 'bg-red-700/15     text-red-300     border-red-700/30',
  OTRO:                 'bg-slate-500/15   text-slate-400   border-slate-500/30',
};
const ORIGEN_CLS = {
  MANUAL:                 'bg-slate-500/10   text-slate-400',
  PRESTAMO:               'bg-blue-500/10    text-blue-400',
  INCIDENTE_PRESENCIADO:  'bg-orange-500/10  text-orange-400',
  REVISION_ENTRADA:       'bg-violet-500/10  text-violet-400',
};
const ORIGEN_LABEL = {
  MANUAL:                 'Manual',
  PRESTAMO:               'Préstamo',
  INCIDENTE_PRESENCIADO:  'Presenciado',
  REVISION_ENTRADA:       'Rev. entrada',
};
const PERSONA_ICON = { ALUMNO: '🎓', DOCENTE: '👨‍🏫', OTRO: '👤' };

function EstadoBadge({ estado }) {
  const cls = ESTADO_CLS[estado] || ESTADO_CLS.PENDIENTE;
  const lbl = { PENDIENTE:'Pendiente', EN_REVISION:'En revisión', RESUELTO:'Resuelto', EXONERADO:'Exonerado' };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{lbl[estado] || estado}</span>;
}
function TipoBadge({ tipo }) {
  const cls = TIPO_CLS[tipo] || TIPO_CLS.OTRO;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>{tipo?.replace(/_/g,' ')}</span>;
}
function OrigenBadge({ origen }) {
  const cls = ORIGEN_CLS[origen] || 'bg-slate-500/10 text-slate-400';
  return <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium ${cls}`}>{ORIGEN_LABEL[origen] || origen}</span>;
}

// ── Modal Crear ────────────────────────────────────────────────────────────────
function ModalCrear({ labs, onCreado, onClose, initialValues }) {
  const { toast: addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [form, setForm] = useState({
    persona_nombre:        initialValues?.persona_nombre        || '',
    persona_identificador: initialValues?.persona_identificador || '',
    persona_tipo:          initialValues?.persona_tipo          || 'ALUMNO',
    descripcion:           initialValues?.descripcion           || '',
    tipo:                  initialValues?.tipo                  || 'DAÑO',
    origen_tipo:           initialValues?.origen_tipo           || 'MANUAL',
    laboratorio_id: '', sesion_id: '', computadora_id: '',
    incidente_id: initialValues?.incidente_id || null,
    cuatrimestre: getCuatrimestreActual(), monto_estimado: '',
  });
  const [candidatos, setCandidatos]   = useState([]);
  const [buscando, setBuscando]       = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buscarCandidatos = async () => {
    if (!form.sesion_id) return;
    setBuscando(true);
    try {
      const params = new URLSearchParams();
      if (form.computadora_id) params.set('computadora_id', form.computadora_id);
      const r = await api.get(`/adeudos/sesion/${form.sesion_id}/candidatos?${params}`);
      setCandidatos(Array.isArray(r.data) ? r.data : []);
    } catch { setCandidatos([]); } finally { setBuscando(false); }
  };

  const seleccionar = (c) => {
    set('persona_nombre',        c.alumno_nombre);
    set('persona_identificador', c.alumno_matricula);
    set('persona_tipo',          'ALUMNO');
    if (c.computadora_id) set('computadora_id', String(c.computadora_id));
  };

  const handleSubmit = async () => {
    if (!form.persona_nombre || !form.persona_identificador || !form.descripcion) {
      setError('Nombre, identificador y descripción son obligatorios.'); return;
    }
    setLoading(true); setError('');
    try {
      await api.post('/adeudos', {
        persona_nombre:        form.persona_nombre,
        persona_identificador: form.persona_identificador,
        persona_tipo:          form.persona_tipo,
        descripcion:           form.descripcion,
        tipo:                  form.tipo,
        origen_tipo:           form.origen_tipo,
        cuatrimestre:          form.cuatrimestre || null,
        laboratorio_id:        form.laboratorio_id   ? Number(form.laboratorio_id)   : null,
        sesion_id:             form.sesion_id         ? Number(form.sesion_id)         : null,
        computadora_id:        form.computadora_id    ? Number(form.computadora_id)    : null,
        monto_estimado:        form.monto_estimado    ? Number(form.monto_estimado)    : null,
        incidente_id:          form.incidente_id      ? Number(form.incidente_id)      : null,
      });
      addToast('Adeudo registrado', 'success');
      onCreado();
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold text-base">⚠️ Registrar responsabilidad</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">

          {/* Persona */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Persona responsable</p>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Tipo de persona</label>
              <div className="flex gap-2">
                {[['ALUMNO','🎓 Alumno'],['DOCENTE','👨‍🏫 Docente'],['OTRO','👤 Otro']].map(([v,l]) => (
                  <button key={v} onClick={() => set('persona_tipo', v)}
                    className={`flex-1 py-2 rounded-xl text-sm border transition-all ${form.persona_tipo === v ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {form.persona_tipo === 'DOCENTE' ? 'RFC / Nómina' : 'Matrícula'} *
                </label>
                <input value={form.persona_identificador} onChange={e => set('persona_identificador', e.target.value)}
                  className="input-dark w-full" placeholder={form.persona_tipo === 'DOCENTE' ? 'RFC123' : 'A12345'} />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nombre completo *</label>
                <input value={form.persona_nombre} onChange={e => set('persona_nombre', e.target.value)}
                  className="input-dark w-full" placeholder="Apellidos Nombre" />
              </div>
            </div>
          </div>

          {/* Buscar por sesión */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Buscar por sesión (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">ID de sesión</label>
                <input type="number" value={form.sesion_id} onChange={e => set('sesion_id', e.target.value)} className="input-dark w-full" placeholder="ID sesión" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">ID de PC (opcional)</label>
                <input type="number" value={form.computadora_id} onChange={e => set('computadora_id', e.target.value)} className="input-dark w-full" placeholder="ID PC" />
              </div>
            </div>
            <button onClick={buscarCandidatos} disabled={!form.sesion_id || buscando}
              className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm rounded-lg py-2 transition-colors">
              {buscando ? 'Buscando...' : '🔍 Ver alumnos de esa sesión'}
            </button>
            {candidatos.length > 0 && (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {candidatos.map(c => (
                  <button key={c.asignacion_id} onClick={() => seleccionar(c)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors text-sm">
                    <span className="text-white font-medium">{c.alumno_matricula}</span>
                    <span className="text-slate-400 ml-2">{c.alumno_nombre}</span>
                    {c.pc_codigo && <span className="text-slate-500 ml-2">PC: {c.pc_codigo}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detalle */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tipo</label>
                <SelectDark value={form.tipo} onChange={v => set('tipo', v)}
                  options={[
                    {value:'DAÑO',label:'Daño'},{value:'PERDIDA',label:'Pérdida'},
                    {value:'ROBO',label:'Robo'},{value:'OTRO',label:'Otro'},
                  ]} />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Origen</label>
                <SelectDark value={form.origen_tipo} onChange={v => set('origen_tipo', v)}
                  options={[
                    {value:'MANUAL',label:'Manual'},
                    {value:'INCIDENTE_PRESENCIADO',label:'Incidente presenciado'},
                    {value:'REVISION_ENTRADA',label:'Revisión de entrada'},
                  ]} />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Laboratorio</label>
              <SelectDark value={form.laboratorio_id} onChange={v => set('laboratorio_id', v)}
                options={[{value:'',label:'— Seleccionar —'}, ...labs.map(l => ({value:String(l.id),label:l.nombre}))]} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Descripción *</label>
              <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
                className="input-dark w-full resize-none" rows={3} placeholder="Describe el daño, pérdida o situación..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Cuatrimestre</label>
                <CuatrimestreSelect value={form.cuatrimestre} onChange={v => set('cuatrimestre', v)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Monto estimado ($)</label>
                <input type="number" min="0" step="0.01" value={form.monto_estimado}
                  onChange={e => set('monto_estimado', e.target.value)} className="input-dark w-full" placeholder="0.00" />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">Cancelar</button>
            <button onClick={handleSubmit} disabled={loading} className="btn-emerald flex-1 disabled:opacity-50">
              {loading ? 'Guardando...' : '⚠️ Registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Resolver ─────────────────────────────────────────────────────────────
function ModalResolver({ adeudo, onActualizado, onClose }) {
  const { toast: addToast } = useToast();
  const [estado, setEstado]   = useState(adeudo.estado);
  const [notas, setNotas]     = useState(adeudo.notas_resolucion || '');
  const [monto, setMonto]     = useState(adeudo.monto_estimado ?? '');
  const [loading, setLoading] = useState(false);

  const handleGuardar = async () => {
    setLoading(true);
    try {
      await api.patch(`/adeudos/${adeudo.id}`, {
        estado, notas_resolucion: notas || null,
        monto_estimado: monto !== '' ? Number(monto) : null,
      });
      addToast('Adeudo actualizado', 'success');
      onActualizado();
    } catch (e) {
      addToast(e.response?.data?.detail || 'Error', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-base">Actualizar responsabilidad</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-4 mb-5 space-y-1 text-sm">
          <p className="text-slate-500 text-xs">{PERSONA_ICON[adeudo.persona_tipo]} {adeudo.persona_tipo}</p>
          <p className="text-white font-medium">{adeudo.persona_nombre}</p>
          <p className="text-slate-400 font-mono text-xs">{adeudo.persona_identificador}</p>
          <p className="text-slate-300 mt-2 text-xs">{adeudo.descripcion}</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-2">Estado</label>
            <div className="grid grid-cols-2 gap-2">
              {[['PENDIENTE','🔴 Pendiente'],['EN_REVISION','🟡 En revisión'],['RESUELTO','🟢 Resuelto'],['EXONERADO','⚪ Exonerado']].map(([v,l]) => (
                <button key={v} onClick={() => setEstado(v)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${estado === v ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Monto definitivo ($)</label>
            <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="input-dark w-full" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Notas de resolución</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} className="input-dark w-full resize-none" rows={3}
              placeholder="¿Cómo se resolvió? ¿Hubo pago, reposición, exoneración?" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">Cancelar</button>
          <button onClick={handleGuardar} disabled={loading} className="btn-emerald flex-1 disabled:opacity-50">
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Detalle ──────────────────────────────────────────────────────────────
function ModalDetalle({ adeudo, onClose }) {
  if (!adeudo) return null;
  const rows = [
    ['Tipo persona',   `${PERSONA_ICON[adeudo.persona_tipo]} ${adeudo.persona_tipo}`],
    ['Identificador',  adeudo.persona_identificador],
    ['Nombre',         adeudo.persona_nombre],
    ['Tipo incidente', <TipoBadge key="t" tipo={adeudo.tipo} />],
    ['Origen',         <OrigenBadge key="o" origen={adeudo.origen_tipo} />],
    ['Estado',         <EstadoBadge key="e" estado={adeudo.estado} />],
    ['Laboratorio',    adeudo.laboratorio_nombre || '—'],
    ['Cuatrimestre',   adeudo.cuatrimestre || '—'],
    ['Monto estimado', adeudo.monto_estimado != null ? `$${adeudo.monto_estimado.toFixed(2)}` : '—'],
    ['Sesión',         adeudo.sesion_id ? `#${adeudo.sesion_id} (${adeudo.sesion_codigo || ''})` : '—'],
    ['PC',             adeudo.computadora_codigo || '—'],
    ['Préstamo ID',    adeudo.prestamo_id ? `#${adeudo.prestamo_id}` : '—'],
    ['Fecha reporte',  adeudo.fecha_reporte ? new Date(adeudo.fecha_reporte).toLocaleString('es-MX') : '—'],
    ['Reportado por',  adeudo.reportado_por || '—'],
    ['Fecha resolución', adeudo.fecha_resolucion ? new Date(adeudo.fecha_resolucion).toLocaleString('es-MX') : '—'],
    ['Resuelto por',   adeudo.resuelto_por || '—'],
    ['Notas',          adeudo.notas_resolucion || '—'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h3 className="text-white font-semibold text-base">Detalle #{adeudo.id}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6">
          <p className="text-slate-300 text-sm bg-slate-800/60 rounded-xl p-4 mb-4">{adeudo.descripcion}</p>
          <div className="space-y-3">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3 text-sm">
                <span className="text-slate-500 w-36 shrink-0">{k}</span>
                <span className="text-slate-200">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function Adeudos() {
  const { toast: addToast } = useToast();
  const [adeudos, setAdeudos]           = useState([]);
  const [labs, setLabs]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda]         = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo]     = useState('');
  const [filtroCuatri, setFiltroCuatri] = useState('');
  const [filtroLab, setFiltroLab]       = useState('');
  const [showCrear, setShowCrear]       = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [modoModal, setModoModal]       = useState(null);
  const [confirmEliminarId, setConfirmEliminarId] = useState(null);

  const fetchAdeudos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (busqueda)     params.set('identificador', busqueda);
      if (filtroEstado) params.set('estado',        filtroEstado);
      if (filtroTipo)   params.set('persona_tipo',  filtroTipo);
      if (filtroCuatri) params.set('cuatrimestre',  filtroCuatri);
      if (filtroLab)    params.set('lab_id',        filtroLab);
      const r = await api.get(`/adeudos?${params}`);
      setAdeudos(Array.isArray(r.data) ? r.data : []);
    } catch { addToast('Error al cargar adeudos', 'error'); }
    finally { setLoading(false); }
  }, [busqueda, filtroEstado, filtroTipo, filtroCuatri, filtroLab]);

  useEffect(() => { fetchAdeudos(); }, [fetchAdeudos]);
  useEffect(() => { api.get('/laboratorios').then(r => setLabs(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, []);

  // ── Pre-llenar modal desde query params (ej: desde Mantenimiento) ──────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const identificador = params.get('identificador');
    const nombre        = params.get('nombre');
    if (identificador && nombre) {
      // Limpiar los params de la URL sin recargar la página
      window.history.replaceState({}, '', window.location.pathname);
      setShowCrear(true);
      // El ModalCrear leerá estos valores via prop initialValues
      setPreFill({
        persona_identificador: identificador,
        persona_nombre:        nombre,
        persona_tipo:          params.get('tipo') || 'ALUMNO',
        descripcion:           params.get('descripcion') || '',
        incidente_id:          params.get('incidente_id') ? Number(params.get('incidente_id')) : null,
        origen_tipo:           'REVISION_ENTRADA',
        tipo:                  'DAÑO',
      });
    }
  }, []);

  const [preFill, setPreFill] = useState(null);

  const sincronizarPrestamos = async () => {
    setSincronizando(true);
    try {
      const r = await api.post('/adeudos/sincronizar-prestamos');
      addToast(r.data.mensaje, 'success');
      fetchAdeudos();
    } catch (e) {
      addToast(e.response?.data?.detail || 'Error al sincronizar', 'error');
    } finally { setSincronizando(false); }
  };

  const handleEliminar = async (id) => { setConfirmEliminarId(id); };
  const _doEliminar = async (id) => {

    try {
      await api.delete(`/adeudos/${id}`);
      addToast('Registro eliminado', 'success');
      fetchAdeudos();
    } catch (e) { addToast(e.response?.data?.detail || 'Error', 'error'); }
  };

  const stats = {
    total:     adeudos.length,
    pendiente: adeudos.filter(a => a.estado === 'PENDIENTE').length,
    revision:  adeudos.filter(a => a.estado === 'EN_REVISION').length,
    resuelto:  adeudos.filter(a => a.estado === 'RESUELTO').length,
    exonerado: adeudos.filter(a => a.estado === 'EXONERADO').length,
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Responsabilidades</h1>
          <p className="text-slate-400 text-sm mt-1">Adeudos y trazabilidad de incidentes por persona</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={sincronizarPrestamos} disabled={sincronizando}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            {sincronizando ? 'Sincronizando...' : 'Sync préstamos'}
          </button>
          <button onClick={() => setShowCrear(true)} className="btn-emerald flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Registrar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          {label:'Total',       val:stats.total,     color:'text-white',      bg:'bg-slate-800'},
          {label:'Pendientes',  val:stats.pendiente, color:'text-red-400',    bg:'bg-red-900/20'},
          {label:'En revisión', val:stats.revision,  color:'text-amber-400',  bg:'bg-amber-900/20'},
          {label:'Resueltos',   val:stats.resuelto,  color:'text-emerald-400',bg:'bg-emerald-900/20'},
          {label:'Exonerados',  val:stats.exonerado, color:'text-slate-400',  bg:'bg-slate-800/50'},
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-slate-700/50`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="sm:col-span-2">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="input-dark w-full" placeholder="🔍 Matrícula, RFC..." />
          </div>
          <SelectDark value={filtroTipo} onChange={setFiltroTipo}
            options={[{value:'',label:'Todo tipo'},{value:'ALUMNO',label:'🎓 Alumnos'},{value:'DOCENTE',label:'👨‍🏫 Docentes'},{value:'OTRO',label:'👤 Otro'}]} />
          <SelectDark value={filtroEstado} onChange={setFiltroEstado}
            options={[{value:'',label:'Todos los estados'},{value:'PENDIENTE',label:'🔴 Pendiente'},{value:'EN_REVISION',label:'🟡 En revisión'},{value:'RESUELTO',label:'🟢 Resuelto'},{value:'EXONERADO',label:'⚪ Exonerado'}]} />
          <CuatrimestreSelect value={filtroCuatri} onChange={setFiltroCuatri} />
        </div>
        <div className="flex justify-end mt-2">
          <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFiltroTipo(''); setFiltroCuatri(''); setFiltroLab(''); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Limpiar filtros</button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-500">Cargando...</div>
        ) : adeudos.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-slate-400 font-medium">Sin responsabilidades registradas</p>
            <p className="text-slate-600 text-sm mt-1">Usa "Sync préstamos" para revisar vencidos automáticamente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  {['Persona','Identificador','Tipo','Origen','Lab','Cuatrimestre','Monto','Estado','Acciones'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {adeudos.map((a, i) => (
                  <tr key={a.id} className={`hover:bg-slate-800/30 transition-colors ${i%2===0?'':'bg-slate-800/10'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{PERSONA_ICON[a.persona_tipo]}</span>
                        <span className="text-white font-medium text-xs max-w-[130px] truncate" title={a.persona_nombre}>{a.persona_nombre}</span>
                      </div>
                      <div className="mt-0.5 ml-6"><TipoBadge tipo={a.tipo} /></div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300 text-xs">{a.persona_identificador}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{a.persona_tipo}</td>
                    <td className="px-4 py-3"><OrigenBadge origen={a.origen_tipo} /></td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{a.laboratorio_nombre || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{a.cuatrimestre || '—'}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                      {a.monto_estimado != null ? `$${a.monto_estimado.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3"><EstadoBadge estado={a.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setSeleccionado(a); setModoModal('detalle'); }} title="Ver detalle"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </button>
                        {!['RESUELTO','EXONERADO'].includes(a.estado) && (
                          <button onClick={() => { setSeleccionado(a); setModoModal('resolver'); }} title="Actualizar estado"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-900/20 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          </button>
                        )}
                        <button onClick={() => handleEliminar(a.id)} title="Eliminar"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modales */}
      {showCrear && (
        <ModalCrear
          labs={labs}
          initialValues={preFill}
          onCreado={() => { setShowCrear(false); setPreFill(null); fetchAdeudos(); }}
          onClose={() => { setShowCrear(false); setPreFill(null); }}
        />
      )}
      {modoModal === 'resolver' && seleccionado && (
        <ModalResolver
          adeudo={seleccionado}
          onActualizado={() => { setModoModal(null); setSeleccionado(null); fetchAdeudos(); }}
          onClose={() => { setModoModal(null); setSeleccionado(null); }}
        />
      )}
      {confirmEliminarId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl" style={{animation:'fadeUp .2s ease'}}>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.3)'}}>
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </div>
              <div>
                <p className="font-semibold text-white text-base">¿Eliminar este registro?</p>
                <p className="text-slate-400 text-sm mt-1">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setConfirmEliminarId(null)} className="flex-1 py-2.5 text-sm font-medium rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors">Cancelar</button>
              <button onClick={() => { _doEliminar(confirmEliminarId); setConfirmEliminarId(null); }} className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white transition-all" style={{background:'linear-gradient(135deg,#ef4444,#dc2626)',boxShadow:'0 0 16px rgba(239,68,68,.25)'}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
      {modoModal === 'detalle' && seleccionado && (
        <ModalDetalle
          adeudo={seleccionado}
          onClose={() => { setModoModal(null); setSeleccionado(null); }}
        />
      )}
    </AdminLayout>
  );
}
