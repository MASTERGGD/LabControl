import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = centavos => pesos.format(centavos / 100);
const fecha = valor => new Date(valor).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
const medios = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta' };
const boton = 'rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50';
const botonPrincipal = boton + ' bg-emerald-700 text-white';
const panel = 'space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-panel)] p-5';
const conceptoNuevo = { id: null, nombre: '', precio: '', activo: true };

function aCentavos(valor) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(valor)) return 0;
  const [pesos, fraccion = ''] = valor.split('.');
  return Number(pesos) * 100 + Number(fraccion.padEnd(2, '0'));
}

function Recibo({ recibo, descargar, ocupado }) {
  return <section className={panel} aria-label="Recibo de pago">
    <article className="space-y-3">
      <h2 className="text-lg font-bold">UTECAN · Recibo interno</h2>
      <p className="font-semibold">{recibo.folio} · {fecha(recibo.fecha)}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
        <dt>Alumno</dt><dd>{recibo.alumno} · {recibo.matricula}</dd>
        <dt>Periodo del alumno</dt><dd>{recibo.periodo}</dd>
        <dt>Concepto</dt><dd>{recibo.concepto}</dd>
        <dt>Total pagado</dt><dd className="font-semibold">{dinero(recibo.importe_centavos)} MXN</dd>
        <dt>Medio</dt><dd>{medios[recibo.medio]}</dd>
        {recibo.referencia && <><dt>Referencia</dt><dd>{recibo.referencia}</dd></>}
        {recibo.medio === 'EFECTIVO' && <>
          <dt>Efectivo recibido</dt><dd>{dinero(recibo.recibido_centavos)}</dd>
          <dt>Cambio</dt><dd>{dinero(recibo.cambio_centavos)}</dd>
        </>}
        <dt>Registró</dt><dd>{recibo.cajero}</dd>
      </dl>
    </article>
    <button type="button" className={boton} disabled={ocupado} onClick={() => descargar(recibo)}>Descargar recibo PDF</button>
  </section>;
}

function Caja({ area }) {
  const base = '/cobranza/' + area.id;
  const [vista, setVista] = useState('pago');
  const [conceptos, setConceptos] = useState([]);
  const [edicion, setEdicion] = useState(conceptoNuevo);
  const [busqueda, setBusqueda] = useState('');
  const [resultado, setResultado] = useState(null);
  const [alumno, setAlumno] = useState(null);
  const [conceptoId, setConceptoId] = useState('');
  const [medio, setMedio] = useState('EFECTIVO');
  const [recibido, setRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [operacion, setOperacion] = useState(null);
  const [recibo, setRecibo] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [siguiente, setSiguiente] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const concepto = conceptos.find(c => String(c.id) === conceptoId && c.activo);
  const importe = concepto?.importe_centavos || 0;
  const efectivo = medio === 'EFECTIVO';
  const diferencia = aCentavos(recibido) - importe;
  const termino = busqueda.trim();
  const coincidencias = resultado?.termino === termino ? resultado : null;

  useEffect(() => {
    let activa = true;
    api.get(base + '/conceptos').then(({ data }) => {
      if (activa) setConceptos(data);
    }).catch(() => {
      if (activa) setError('No se pudo cargar el tabulador.');
    });
    return () => { activa = false; };
  }, [base]);

  useEffect(() => {
    if (vista !== 'pago' || alumno || !termino) return;
    let vigente = true;
    const temporizador = window.setTimeout(async () => {
      try {
        const { data } = await api.get(base + '/alumnos', { params: { q: termino } });
        if (vigente) setResultado({ termino, alumnos: data });
      } catch {
        if (vigente) setResultado({ termino, error: true });
      }
    }, 300);
    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
    };
  }, [alumno, base, termino, vista]);

  const ejecutar = async tarea => {
    if (ocupado) return;
    setOcupado(true);
    setError('');
    try {
      await tarea();
    } catch (e) {
      const detalle = e.response?.data?.detail;
      setError(typeof detalle === 'string' ? detalle : 'No se pudo completar la operación. Intenta de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  const registrar = e => {
    e.preventDefault();
    if (!operacion && (!alumno || !concepto || (efectivo ? diferencia < 0 : !referencia.trim()))) return;
    ejecutar(async () => {
      const solicitud = operacion || {
        operacion: crypto.randomUUID(), alumno_id: alumno.id, concepto_id: concepto.id,
        importe_centavos: importe, medio, recibido_centavos: efectivo ? aCentavos(recibido) : null,
        referencia: efectivo ? null : referencia.trim(),
      };
      setOperacion(solicitud);
      try {
        const { data } = await api.post(base + '/pagos', solicitud);
        setRecibo(data);
        setOperacion(null);
        setRecibido('');
        setReferencia('');
        setConceptoId('');
        setResultado(null);
        setAlumno(null);
        setBusqueda('');
      } catch (e) {
        if ([400, 403, 404, 409, 422].includes(e.response?.status)) {
          setOperacion(null);
          if (e.response.status === 409) {
            setConceptoId('');
            const { data } = await api.get(base + '/conceptos');
            setConceptos(data);
          }
        }
        throw e;
      }
    });
  };

  const guardarConcepto = e => {
    e.preventDefault();
    ejecutar(async () => {
      const data = { nombre: edicion.nombre.trim(), importe_centavos: aCentavos(edicion.precio), activo: edicion.activo };
      if (edicion.id) await api.put(base + '/conceptos/' + edicion.id, data);
      else await api.post(base + '/conceptos', data);
      setEdicion(conceptoNuevo);
      const respuesta = await api.get(base + '/conceptos');
      setConceptos(respuesta.data);
    });
  };

  const cargarHistorial = antes => ejecutar(async () => {
    const { data } = await api.get(base + '/pagos', { params: antes ? { antes } : {} });
    setHistorial(prev => antes ? [...prev, ...data.recibos] : data.recibos);
    setSiguiente(data.siguiente);
  });

  const descargarRecibo = pago => ejecutar(async () => {
    const { data } = await api.get(base + '/pagos/' + pago.id + '/recibo.pdf', { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'Recibo_' + pago.folio + '.pdf';
    enlace.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return <div className="space-y-5">
    <nav aria-label="Opciones de cobranza" className="flex flex-wrap gap-2">
      {Object.entries({ pago: 'Registrar pago', historial: 'Historial', ...(area.gestionar && { tabulador: 'Tabulador' }) })
        .map(([id, nombre]) => <button key={id} type="button" disabled={ocupado || !!operacion} aria-pressed={vista === id}
          className={vista === id ? botonPrincipal : boton} onClick={() => {
            setVista(id); setError(''); setRecibo(null);
            if (id === 'historial') cargarHistorial(null);
          }}>{nombre}</button>)}
    </nav>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 p-3">{error}</p>}
    {vista === 'pago' && <section className={panel}>
      {alumno ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div>
          <p className="font-semibold">{alumno.nombre}</p>
          <p className="text-sm">{alumno.matricula} · {alumno.periodo}</p>
        </div>
        <button type="button" className={boton} disabled={ocupado || !!operacion}
          onClick={() => setAlumno(null)}>Cambiar alumno</button>
      </div> : <div className="space-y-2">
        <label className="block">Matrícula, nombre o apellidos
          <input className="input-dark mt-1" type="search" maxLength={120} disabled={ocupado || !!operacion} value={busqueda}
            onChange={e => {
              if (e.target.value.trim() !== termino) setResultado(null);
              setBusqueda(e.target.value);
            }} />
        </label>
        {termino && <p role="status" className="text-sm text-[color:var(--text-secondary)]">
          {!coincidencias ? 'Buscando alumnos…'
            : coincidencias.error ? 'No se pudo buscar. Modifica el texto para volver a intentar.'
              : !coincidencias.alumnos.length ? 'No se encontraron alumnos.'
                : coincidencias.alumnos.length === 25 ? 'Se muestran hasta 25 resultados. Escribe más para precisar la búsqueda.'
                  : 'Selecciona un alumno de la lista.'}
        </p>}
        {!!coincidencias?.alumnos?.length && <ul aria-label="Coincidencias de alumnos"
          className="max-h-64 divide-y overflow-y-auto rounded-lg border border-[var(--surface-border)]">
          {coincidencias.alumnos.map(a => <li key={a.id}>
            <button type="button" className="block w-full px-3 py-2 text-left hover:bg-emerald-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
              onClick={() => setAlumno(a)}>
              <span className="block font-semibold">{a.nombre}</span>
              <span className="block text-sm text-[color:var(--text-secondary)]">{a.matricula} · {a.periodo}</span>
            </button>
          </li>)}
        </ul>}
      </div>}
      <form onSubmit={registrar} className="space-y-3">
        <fieldset disabled={ocupado || !!operacion} className="grid gap-3 sm:grid-cols-2">
          <label>Concepto<select className="input-dark mt-1" value={conceptoId} onChange={e => setConceptoId(e.target.value)} required>
            <option value="">Selecciona un concepto</option>
            {conceptos.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre} · {dinero(c.importe_centavos)}</option>)}
          </select></label>
          <label>Medio de pago<select className="input-dark mt-1" value={medio} onChange={e => setMedio(e.target.value)}>
            {Object.entries(medios).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select></label>
          {efectivo ? <label>Efectivo recibido<input className="input-dark mt-1" type="number" min="0.01" max="1000000" step="0.01" required value={recibido} onChange={e => setRecibido(e.target.value)} /></label>
            : <label>Referencia<input className="input-dark mt-1" maxLength={120} required value={referencia} onChange={e => setReferencia(e.target.value)} /></label>}
        </fieldset>
        {concepto && <p className="font-semibold">Total {dinero(importe)}{efectivo && recibido && (diferencia >= 0 ? ' · Cambio ' + dinero(diferencia) : ' · Faltan ' + dinero(-diferencia))}</p>}
        <button className={botonPrincipal} disabled={ocupado || (!operacion && (!alumno || !concepto || (efectivo ? diferencia < 0 : !referencia.trim())))}>
          {operacion ? 'Reintentar el mismo cobro' : 'Confirmar pago y emitir recibo'}
        </button>
      </form>
    </section>}
    {vista === 'tabulador' && <section className={panel}>
      <h2 className="text-lg font-bold">Tabulador de servicios</h2>
      <form onSubmit={guardarConcepto} className="flex flex-wrap items-end gap-3">
        <label className="grow">Concepto<input className="input-dark mt-1" required maxLength={150} value={edicion.nombre} onChange={e => setEdicion({ ...edicion, nombre: e.target.value })} /></label>
        <label>Importe (MXN)<input className="input-dark mt-1" type="number" required min="0.01" max="1000000" step="0.01" value={edicion.precio} onChange={e => setEdicion({ ...edicion, precio: e.target.value })} /></label>
        <label className="flex items-center gap-2 py-2"><input type="checkbox" checked={edicion.activo} onChange={e => setEdicion({ ...edicion, activo: e.target.checked })} />Activo</label>
        <button className={botonPrincipal} disabled={ocupado}>{edicion.id ? 'Guardar cambios' : 'Agregar concepto'}</button>
        {edicion.id && <button type="button" className={boton} onClick={() => setEdicion(conceptoNuevo)}>Cancelar edición</button>}
      </form>
      <ul className="divide-y divide-[var(--surface-border)]">
        {conceptos.map(c => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>{c.nombre} · {dinero(c.importe_centavos)}{!c.activo && ' · Inactivo'}</span>
          <button type="button" className={boton} onClick={() => setEdicion({ ...c, precio: (c.importe_centavos / 100).toFixed(2) })}>Editar</button>
        </li>)}
      </ul>
    </section>}
    {vista === 'historial' && <section className={panel}>
      <h2 className="text-lg font-bold">Recibos emitidos</h2>
      {!historial.length && !ocupado && <p>Aún no hay recibos.</p>}
      <ul className="divide-y divide-[var(--surface-border)]">
        {historial.map(p => <li key={p.folio} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>{p.folio} · {p.matricula} · {p.concepto} · {dinero(p.importe_centavos)}</span>
          <button type="button" className={boton} onClick={() => setRecibo(p)}>Ver recibo</button>
        </li>)}
      </ul>
      {siguiente && <button type="button" className={boton} disabled={ocupado} onClick={() => cargarHistorial(siguiente)}>Ver más</button>}
    </section>}
    {recibo && <Recibo recibo={recibo} descargar={descargarRecibo} ocupado={ocupado} />}
  </div>;
}

export default function Cobranza() {
  const [areas, setAreas] = useState(null);
  const [areaId, setAreaId] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let activa = true;
    api.get('/cobranza').then(({ data }) => {
      if (activa) { setAreas(data); setAreaId(String(data[0]?.id || '')); }
    }).catch(() => { if (activa) setError(true); });
    return () => { activa = false; };
  }, []);
  const area = areas?.find(item => String(item.id) === areaId);
  return <AdminLayout>
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Cobranza</h1>
      {error && <p role="alert">No se pudo cargar Finanzas.</p>}
      {!error && !areas && <p>Cargando Finanzas…</p>}
      {areas?.length === 0 && <p>No tienes un departamento de Finanzas habilitado para cobranza.</p>}
      {areas?.length > 1 && <label>Departamento<select className="input-dark mt-1" value={areaId} onChange={e => setAreaId(e.target.value)}>
        {areas.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
      </select></label>}
      {area && <Caja key={area.id} area={area} />}
    </div>
  </AdminLayout>;
}
