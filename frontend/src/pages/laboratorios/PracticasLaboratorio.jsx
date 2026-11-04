import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../hooks/useApi';

const card = 'rounded-2xl border p-5';
const field = 'input-dark w-full';
const btn = 'rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50';
const blankMaterial = () => ({ insumo_id: '', descripcion: '', cantidad_solicitada: '', unidad: 'PIEZA', nota: '' });
const fechaLocal = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function PracticasLaboratorio() {
  const { usuario } = useAuth();
  const esDocente = usuario?.rol === 'DOCENTE';
  const puedePreparar = ['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB'].includes(usuario?.rol);
  const [laboratorios, setLaboratorios] = useState([]);
  const [laboratorioId, setLaboratorioId] = useState(usuario?.laboratorio_id ? String(usuario.laboratorio_id) : '');
  const [insumos, setInsumos] = useState([]);
  const [practicas, setPracticas] = useState([]);
  const [reservaciones, setReservaciones] = useState([]);
  const [seleccion, setSeleccion] = useState('');
  const [form, setForm] = useState({ plantilla_id: '', fecha_sesion: '', titulo: '', objetivo: '', procedimiento: '', notas_seguridad: '', materiales: [blankMaterial()] });
  const [guias, setGuias] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [nuevoInsumo, setNuevoInsumo] = useState(false);
  const [stockForm, setStockForm] = useState({ nombre: '', categoria: 'CONSUMIBLE', unidad: 'PIEZA', cantidad_disponible: 0, stock_minimo: 0, codigo_cas: '', lote: '', caduca_en: '', ubicacion_almacen: '', ficha_seguridad_url: '' });
  const [reporte, setReporte] = useState({ resultados: '', conclusiones: '', observaciones_docente: '' });
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState({});
  const [activos, setActivos] = useState([]);
  const [incidenteAbierto, setIncidenteAbierto] = useState(null);
  const [incidenteForm, setIncidenteForm] = useState({ tipo: 'SEGURIDAD', severidad: 'MEDIA', descripcion: '', acciones: '', activo_id: '' });
  const [residuoAbierto, setResiduoAbierto] = useState(null);
  const [residuoForm, setResiduoForm] = useState({ descripcion: '', clasificacion: 'QUIMICO', cantidad: '', unidad: 'g', destino: '' });

  const cargar = useCallback(async () => {
    if (!laboratorioId && !esDocente) return;
    setCargando(true); setError('');
    try {
      const params = esDocente ? '' : `?laboratorio_id=${laboratorioId}`;
      const [p, labs] = await Promise.all([
        api.get(`/practicas-laboratorio${params}`),
        api.get('/laboratorios?solo_activos=true'),
      ]);
      setPracticas(Array.isArray(p.data) ? p.data : []);
      setLaboratorios((labs.data || []).filter(l => ['QUIMICA', 'AGROINDUSTRIA'].includes((l.categoria || '').toUpperCase())));
      const labActual = esDocente ? null : laboratorioId;
      if (labActual) {
        const stock = await api.get(`/practicas-laboratorio/insumos?laboratorio_id=${labActual}`);
        setInsumos(stock.data || []);
        const sum = await api.get(`/practicas-laboratorio/resumen?laboratorio_id=${labActual}`);
        setResumen(sum.data);
        const res = await api.get(`/horarios/reservaciones?laboratorio_id=${labActual}`);
        setReservaciones((res.data || []).filter(r => ['PROGRAMADA', 'EN_CURSO'].includes(r.estado)));
      } else if (esDocente) {
        const [stockLabs, res] = await Promise.all([
          Promise.all((labs.data || []).filter(l => ['QUIMICA', 'AGROINDUSTRIA'].includes((l.categoria || '').toUpperCase())).map(l => api.get(`/practicas-laboratorio/insumos?laboratorio_id=${l.id}`).catch(() => ({ data: [] })))),
          api.get('/horarios/reservaciones'),
        ]);
        setInsumos(stockLabs.flatMap(x => x.data || []));
        setReservaciones((res.data || []).filter(r => ['PROGRAMADA', 'EN_CURSO'].includes(r.estado)));
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudieron cargar los datos de prácticas.');
    } finally { setCargando(false); }
  }, [laboratorioId, esDocente]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (usuario?.laboratorio_id && !laboratorioId) setLaboratorioId(String(usuario.laboratorio_id)); }, [usuario, laboratorioId]);

  const bloquesReservacion = useMemo(() => {
    const bloques = new Map();
    for (const reservacion of reservaciones) {
      const key = reservacion.bloque_reserva_id || `reservacion-${reservacion.id}`;
      const actual = bloques.get(key) || { key, reservas: [] };
      actual.reservas.push(reservacion);
      bloques.set(key, actual);
    }
    return [...bloques.values()].map(bloque => {
      const reservasOrdenadas = [...bloque.reservas].sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
      return {
        ...bloque,
        reservas: reservasOrdenadas,
        principal: reservasOrdenadas[0],
        hora_inicio: reservasOrdenadas[0]?.hora_inicio,
        hora_fin: reservasOrdenadas[reservasOrdenadas.length - 1]?.hora_fin,
      };
    });
  }, [reservaciones]);
  const reservacionesDisponibles = useMemo(() => {
    const usadas = new Set(practicas.map(p => p.reservacion_id));
    const labsAcademicos = new Set(laboratorios.map(l => Number(l.id)));
    return bloquesReservacion.filter(bloque => {
      const r = bloque.principal;
      return !bloque.reservas.some(item => usadas.has(item.id)) &&
        labsAcademicos.has(Number(r.laboratorio_id)) &&
        (esDocente || !laboratorioId || Number(r.laboratorio_id) === Number(laboratorioId));
    });
  }, [bloquesReservacion, practicas, esDocente, laboratorioId, laboratorios]);
  const reservacionSeleccionada = reservaciones.find(r => Number(r.id) === Number(seleccion));
  const insumosSolicitud = insumos.filter(i => !reservacionSeleccionada || Number(i.laboratorio_id) === Number(reservacionSeleccionada.laboratorio_id));
  const hoyLocal = fechaLocal(new Date());
  const mananaLocal = fechaLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const proximaPractica = [...practicas].filter(p => !['CERRADA', 'CANCELADA'].includes(p.estado) && p.fecha >= hoyLocal)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.hora_inicio).localeCompare(String(b.hora_inicio)))[0];

  useEffect(() => {
    const labId = esDocente ? reservacionSeleccionada?.laboratorio_id : laboratorioId;
    if (!labId) { setGuias([]); return; }
    api.get(`/practicas-laboratorio/guias?laboratorio_id=${labId}`).then(({ data }) => setGuias(data || [])).catch(() => setGuias([]));
  }, [esDocente, laboratorioId, reservacionSeleccionada?.laboratorio_id]);

  useEffect(() => {
    const labId = esDocente ? reservacionSeleccionada?.laboratorio_id : laboratorioId;
    if (!labId) { setActivos([]); return; }
    api.get(`/inventario/activos?laboratorio_id=${labId}&estado=OPERATIVO&solo_activos=true`).then(({ data }) => setActivos(data || [])).catch(() => setActivos([]));
  }, [esDocente, laboratorioId, reservacionSeleccionada?.laboratorio_id]);

  const run = async (operation, success = 'Cambios guardados.') => {
    setError(''); setMensaje('');
    try { await operation(); setMensaje(success); await cargar(); return true; }
    catch (e) { setError(e.response?.data?.detail || 'No se pudo completar la operación.'); }
    return false;
  };

  const crear = e => {
    e.preventDefault();
    if (!seleccion) return setError('Selecciona una reservación de laboratorio.');
    const materials = form.materiales.filter(m => m.descripcion.trim() && Number(m.cantidad_solicitada) > 0).map(m => ({
      ...m, insumo_id: m.insumo_id ? Number(m.insumo_id) : null, cantidad_solicitada: Number(m.cantidad_solicitada),
    }));
    run(() => api.post('/practicas-laboratorio', { ...form, plantilla_id: form.plantilla_id ? Number(form.plantilla_id) : null,
      fecha_sesion: form.fecha_sesion || null, titulo: form.titulo || null,
      reservacion_id: Number(seleccion), materiales }), 'Práctica y solicitud de materiales enviadas al responsable.');
  };

  const aplicarGuia = id => {
    const guia = guias.find(g => String(g.id) === String(id));
    setForm(guia ? { ...form, plantilla_id: String(guia.id), titulo: guia.titulo, objetivo: guia.objetivo || '',
      procedimiento: guia.procedimiento || '', notas_seguridad: guia.notas_seguridad || '',
      materiales: guia.materiales.length ? guia.materiales.map(m => ({ ...m, insumo_id: m.insumo_id ? String(m.insumo_id) : '',
        cantidad_solicitada: String(m.cantidad_solicitada), nota: '' })) : [blankMaterial()] }
      : { ...form, plantilla_id: '', titulo: '', objetivo: '', procedimiento: '', notas_seguridad: '', materiales: [blankMaterial()] });
  };

  const crearStock = async e => {
    e.preventDefault();
    const saved = await run(() => api.post('/practicas-laboratorio/insumos', {
      ...stockForm, laboratorio_id: Number(laboratorioId), cantidad_disponible: Number(stockForm.cantidad_disponible),
      stock_minimo: Number(stockForm.stock_minimo), caduca_en: stockForm.caduca_en || null,
    }), 'Insumo agregado al inventario del laboratorio.');
    if (saved) setNuevoInsumo(false);
  };

  const agregarExistencia = insumo => {
    const cantidad = window.prompt(`Cantidad que ingresará a ${insumo.nombre} (${insumo.unidad}):`);
    if (!cantidad || !Number.isFinite(Number(cantidad)) || Number(cantidad) <= 0) return;
    const observaciones = window.prompt('Referencia de compra, lote o motivo de entrada:') || null;
    run(() => api.post(`/practicas-laboratorio/insumos/${insumo.id}/entrada`, { cantidad: Number(cantidad), observaciones }), 'Entrada registrada en la bitácora de inventario.');
  };

  const verMovimientos = async insumo => {
    if (movimientos[insumo.id]) return setMovimientos(current => ({ ...current, [insumo.id]: null }));
    try {
      const { data } = await api.get(`/practicas-laboratorio/insumos/${insumo.id}/movimientos`);
      setMovimientos(current => ({ ...current, [insumo.id]: data }));
    } catch (e) { setError(e.response?.data?.detail || 'No se pudo cargar la bitácora.'); }
  };

  const preparar = practica => {
    const materiales = practica.materiales.map(m => ({ material_id: m.id, cantidad_entregada: Number(m.cantidad_entregada_solicitada ?? m.cantidad_solicitada) }));
    run(() => api.post(`/practicas-laboratorio/${practica.id}/preparar`, { materiales }), 'Materiales preparados y entregados.');
  };

  const iniciar = practica => run(async () => {
    const result = await api.post(`/practicas-laboratorio/${practica.id}/iniciar`);
    setReporte({ resultados: result.data.resultados || '', conclusiones: result.data.conclusiones || '', observaciones_docente: result.data.observaciones_docente || '' });
  }, 'Práctica iniciada. Lista del grupo cargada.');

  const guardarAsistencia = practica => run(() => api.put(`/practicas-laboratorio/${practica.id}/asistencia`, {
    alumnos: practica.asistencias.map(a => ({ alumno_id: a.alumno_id, estado: a.estado, observacion: a.observacion || null })),
  }), 'Asistencia guardada.');

  const cerrar = practica => {
    const materiales = practica.materiales.map(m => ({ material_id: m.id,
      cantidad_consumida: Number(m.cantidad_consumida ?? m.cantidad_entregada), cantidad_merma: Number(m.cantidad_merma || 0),
      cantidad_devuelta: Number(m.cantidad_devuelta || 0), nota: m.nota || null }));
    run(() => api.post(`/practicas-laboratorio/${practica.id}/cerrar`, { ...reporte, materiales }), 'Práctica cerrada; consumos y devoluciones registrados.');
  };

  const actualizarAsistencia = (practica, alumnoId, estado) => setPracticas(current => current.map(p => p.id !== practica.id ? p : ({
    ...p, asistencias: p.asistencias.map(a => a.alumno_id === alumnoId ? { ...a, estado } : a),
  })));
  const actualizarCierreMaterial = (practica, materialId, fieldName, value) => setPracticas(current => current.map(p => p.id !== practica.id ? p : ({
    ...p, materiales: p.materiales.map(m => m.id === materialId ? { ...m, [fieldName]: value } : m),
  })));

  return <AdminLayout>
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">SIGA · Laboratorios docentes</p>
          <h1 className="mt-1 text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Prácticas de laboratorio</h1>
          <p className="mt-2 max-w-3xl text-sm" style={{ color: 'var(--text-secondary)' }}>Las solicitudes se generan al reservar una clase con práctica. Aquí consulta la preparación del laboratorio y completa asistencia, incidencias y reporte.</p>
        </div>
        {puedePreparar && <select className={`${field} max-w-sm`} value={laboratorioId} onChange={e => setLaboratorioId(e.target.value)}>
          <option value="">Selecciona laboratorio</option>{laboratorios.map(l => <option key={l.id} value={l.id}>{l.nombre} · {l.categoria}</option>)}
        </select>}
      </header>
      {mensaje && <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensaje}</div>}
      {error && <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{String(error)}</div>}
      {esDocente && proximaPractica && proximaPractica.fecha <= mananaLocal && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><div><p className="text-xs font-bold uppercase tracking-wider">Próxima práctica</p><p className="mt-1 text-lg font-bold">{proximaPractica.titulo} · {proximaPractica.fecha === hoyLocal ? 'Hoy' : 'Mañana'}</p><p className="text-sm">{proximaPractica.laboratorio_nombre} · {proximaPractica.hora_inicio}–{proximaPractica.hora_fin} · {proximaPractica.estado}</p></div>{proximaPractica.estado === 'PREPARADA' && proximaPractica.fecha === hoyLocal && <button className={`${btn} bg-blue-700 text-white`} onClick={() => iniciar(proximaPractica)}>Iniciar práctica</button>}</div>}

      {esDocente && <div className={`${card} space-y-3`} style={{ background: 'var(--surface-panel)', borderColor: 'var(--surface-border)' }}>
        <div><h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Seguimiento de prácticas</h2><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Al reservar, SIGA crea aquí la solicitud y la envía al responsable. No vuelvas a capturarla.</p></div>
        {practicas.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm" style={{ color: 'var(--text-secondary)', borderColor: 'var(--surface-border)' }}>Aún no tienes prácticas solicitadas. Para iniciar una, abre <b>Solicitar laboratorio</b>, marca que la clase incluye una práctica y completa sus datos en el mismo formulario.</p>}
        <details className="rounded-xl border p-3" style={{ borderColor: 'var(--surface-border)' }}>
          <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Registrar seguimiento de una reservación anterior</summary>
          <form onSubmit={crear} className="mt-4 space-y-4">
        <div><h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Reservación anterior sin solicitud formal</h3><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Usa esta opción solo para reservas creadas antes de la integración.</p></div>
        <select className={field} required value={seleccion} onChange={e => { const r = reservaciones.find(x => String(x.id) === e.target.value); setSeleccion(e.target.value); setForm(current => ({ ...current, fecha_sesion: r?.fecha_actividad || '' })); }}><option value="">Reservación de Química o Agroindustria</option>
          {reservacionesDisponibles.map(bloque => <option key={bloque.key} value={bloque.principal.id}>{bloque.principal.laboratorio_nombre} · {bloque.principal.materia} · grupo {bloque.principal.grupo} · {bloque.principal.fecha_actividad || bloque.principal.dia_nombre || 'sesión programada'} · {bloque.hora_inicio}–{bloque.hora_fin}</option>)}
        </select>
        <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Fecha de esta práctica<input className={`${field} mt-1 max-w-xs`} type="date" required={!reservacionSeleccionada?.fecha_actividad} min={hoyLocal} value={form.fecha_sesion} onChange={e => setForm({ ...form, fecha_sesion: e.target.value })} disabled={Boolean(reservacionSeleccionada?.fecha_actividad)}/></label>
        <select className={field} value={form.plantilla_id} onChange={e => aplicarGuia(e.target.value)}><option value="">Crear solicitud desde cero</option>{guias.map(g => <option key={g.id} value={g.id}>{g.titulo}{g.materia ? ` · ${g.materia}` : ''}</option>)}</select>
        <div className="grid gap-3 md:grid-cols-2"><input className={field} placeholder="Nombre de la práctica" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })}/>
          <input className={field} placeholder="Objetivo" value={form.objetivo} onChange={e => setForm({ ...form, objetivo: e.target.value })}/></div>
        <textarea className={field} rows="3" placeholder="Procedimiento y consideraciones de seguridad" value={form.procedimiento} onChange={e => setForm({ ...form, procedimiento: e.target.value })}/>
        <textarea className={field} rows="2" placeholder="Precauciones o equipo de protección requerido" value={form.notas_seguridad} onChange={e => setForm({ ...form, notas_seguridad: e.target.value })}/>
        <div className="space-y-2"><p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Materiales y reactivos</p>
          {form.materiales.map((m, idx) => <div key={idx} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <select className={field} value={m.insumo_id} onChange={e => { const next = [...form.materiales]; const id = e.target.value; const item = insumosSolicitud.find(x => String(x.id) === id); next[idx] = { ...m, insumo_id: id, descripcion: item?.nombre || m.descripcion, unidad: item?.unidad || m.unidad }; setForm({ ...form, materiales: next }); }}><option value="">Texto libre / equipo reutilizable</option>{insumosSolicitud.map(i => <option key={i.id} value={i.id}>{i.nombre} · existencia {i.cantidad_disponible} {i.unidad}</option>)}</select>
            <input className={field} placeholder="Descripción" value={m.descripcion} onChange={e => { const next = [...form.materiales]; next[idx].descripcion = e.target.value; setForm({ ...form, materiales: next }); }}/>
            <input className={field} type="number" min="0" step="any" placeholder="Cantidad" value={m.cantidad_solicitada} onChange={e => { const next = [...form.materiales]; next[idx].cantidad_solicitada = e.target.value; setForm({ ...form, materiales: next }); }}/>
            <input className={field} placeholder="Unidad" value={m.unidad} onChange={e => { const next = [...form.materiales]; next[idx].unidad = e.target.value; setForm({ ...form, materiales: next }); }}/>
            <button type="button" className={`${btn} border`} onClick={() => setForm({ ...form, materiales: form.materiales.filter((_, i) => i !== idx) })}>Quitar</button>
          </div>)}
          <button type="button" className={`${btn} border border-emerald-300 text-emerald-700`} onClick={() => setForm({ ...form, materiales: [...form.materiales, blankMaterial()] })}>+ Agregar material</button>
        </div>
        <button className={`${btn} bg-emerald-700 text-white`} disabled={cargando}>Crear seguimiento anterior</button>
          </form>
        </details>
      </div>}

      {puedePreparar && laboratorioId && <section className={`${card} space-y-4`} style={{ background: 'var(--surface-panel)', borderColor: 'var(--surface-border)' }}>
        {resumen && <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{[
          ['Total prácticas', resumen.practicas_total], ['Solicitadas', resumen.practicas_solicitadas], ['En curso', resumen.practicas_en_curso],
          ['Cerradas', resumen.practicas_cerradas], ['Stock bajo', resumen.stock_bajo], ['Incidentes', resumen.incidentes],
        ].map(([label, value]) => <div key={label} className="rounded-xl border p-3" style={{ borderColor: 'var(--surface-border)' }}><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p><p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p></div>)}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Consumibles y reactivos</h2><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Inventario por laboratorio con lote, caducidad, código CAS y ficha de seguridad.</p></div>
          <button className={`${btn} border border-emerald-300 text-emerald-700`} onClick={() => setNuevoInsumo(v => !v)}>+ Registrar insumo</button></div>
        {nuevoInsumo && <form onSubmit={crearStock} className="grid gap-2 rounded-xl border p-3 md:grid-cols-4" style={{ borderColor: 'var(--surface-border)' }}>
          <input className={field} required placeholder="Nombre" value={stockForm.nombre} onChange={e => setStockForm({ ...stockForm, nombre: e.target.value })}/>
          <select className={field} value={stockForm.categoria} onChange={e => setStockForm({ ...stockForm, categoria: e.target.value })}><option value="CONSUMIBLE">Consumible</option><option value="REACTIVO">Reactivo</option></select>
          <input className={field} required placeholder="Unidad" value={stockForm.unidad} onChange={e => setStockForm({ ...stockForm, unidad: e.target.value })}/>
          <input className={field} type="number" min="0" step="any" placeholder="Existencia" value={stockForm.cantidad_disponible} onChange={e => setStockForm({ ...stockForm, cantidad_disponible: e.target.value })}/>
          <input className={field} placeholder="Código CAS" value={stockForm.codigo_cas} onChange={e => setStockForm({ ...stockForm, codigo_cas: e.target.value })}/>
          <input className={field} placeholder="Lote" value={stockForm.lote} onChange={e => setStockForm({ ...stockForm, lote: e.target.value })}/>
          <input className={field} type="date" value={stockForm.caduca_en} onChange={e => setStockForm({ ...stockForm, caduca_en: e.target.value })}/>
          <input className={field} type="number" min="0" step="any" placeholder="Stock mínimo" value={stockForm.stock_minimo} onChange={e => setStockForm({ ...stockForm, stock_minimo: e.target.value })}/>
          <input className={`${field} md:col-span-2`} placeholder="Ubicación de almacenamiento" value={stockForm.ubicacion_almacen} onChange={e => setStockForm({ ...stockForm, ubicacion_almacen: e.target.value })}/>
          <input className={`${field} md:col-span-2`} type="url" placeholder="URL de ficha de seguridad" value={stockForm.ficha_seguridad_url} onChange={e => setStockForm({ ...stockForm, ficha_seguridad_url: e.target.value })}/>
          <button className={`${btn} bg-emerald-700 text-white md:col-span-4`}>Guardar insumo</button>
        </form>}
        <div className="grid gap-2 md:grid-cols-2">{insumos.map(i => <div key={i.id} className="rounded-xl border p-3" style={{ borderColor: i.stock_bajo || i.caducado ? '#ef4444' : 'var(--surface-border)' }}>
          <div className="flex justify-between gap-2"><strong style={{ color: 'var(--text-primary)' }}>{i.nombre}</strong><span className="text-sm">{i.cantidad_disponible} {i.unidad}</span></div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{i.categoria}{i.codigo_cas ? ` · CAS ${i.codigo_cas}` : ''}{i.lote ? ` · Lote ${i.lote}` : ''}{i.caduca_en ? ` · Caduca ${i.caduca_en}` : ''}</p>
          {i.ficha_seguridad_url && <a className="mr-3 text-xs text-blue-600 underline" href={i.ficha_seguridad_url} target="_blank" rel="noreferrer">Ficha de seguridad</a>}
          <button className="text-xs font-semibold text-emerald-700 underline" onClick={() => agregarExistencia(i)}>Registrar entrada</button>
          <button className="ml-3 text-xs font-semibold text-blue-700 underline" onClick={() => verMovimientos(i)}>Bitácora</button>
          {Array.isArray(movimientos[i.id]) && <div className="mt-2 w-full space-y-1 border-t pt-2" style={{ borderColor: 'var(--surface-border)' }}>{movimientos[i.id].length ? movimientos[i.id].map(x => <p key={x.id} className="text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(x.creado_en).toLocaleDateString()} · {x.tipo} · {x.cantidad} · {x.usuario || 'SIGA'}{x.observaciones ? ` · ${x.observaciones}` : ''}</p>) : <p className="text-xs">Sin movimientos registrados.</p>}</div>}
          {(i.stock_bajo || i.caducado) && <p className="mt-1 text-xs font-semibold text-red-600">{i.caducado ? 'Caducado' : 'Stock bajo'}</p>}
        </div>)}</div>
      </section>}

      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Sesiones y seguimiento</h2><button className={`${btn} border`} onClick={cargar}>{cargando ? 'Actualizando…' : 'Actualizar'}</button></div>
        {!practicas.length && <div className={`${card} text-sm`} style={{ background: 'var(--surface-panel)', borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}>Aún no hay prácticas asociadas a las reservaciones de este laboratorio.</div>}
        {practicas.map(p => <article key={p.id} className={`${card} space-y-4`} style={{ background: 'var(--surface-panel)', borderColor: 'var(--surface-border)' }}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{p.estado}</span><h3 className="mt-2 text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{p.titulo}</h3><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{p.laboratorio_nombre} · {p.materia} · Grupo {p.grupo} · {p.fecha || 'Fecha de reservación'} {p.hora_inicio && `· ${p.hora_inicio}–${p.hora_fin}`}</p></div>
            {!esDocente && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Docente: {p.docente_nombre}</span>}</div>
          {p.objetivo && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}><b>Objetivo:</b> {p.objetivo}</p>}
          {(p.procedimiento || p.notas_seguridad) && <details><summary className="cursor-pointer text-sm font-semibold">Procedimiento y seguridad</summary>{p.procedimiento && <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>{p.procedimiento}</p>}{p.notas_seguridad && <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-amber-700">Precauciones: {p.notas_seguridad}</p>}</details>}
          {!!p.materiales.length && <div className="space-y-2"><h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Material solicitado</h4>{p.materiales.map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: 'var(--surface-border)' }}><span style={{ color: 'var(--text-primary)' }}>{m.descripcion}: solicita {m.cantidad_solicitada} {m.unidad}{m.existencia != null ? ` · existencia actual ${m.existencia}` : ''}</span>
            {puedePreparar && p.estado === 'SOLICITADA' && <label className="flex items-center gap-2 text-xs">Entregar <input className="input-dark w-24" type="number" min="0" max={m.cantidad_solicitada} step="any" value={m.cantidad_entregada_solicitada ?? m.cantidad_solicitada} onChange={e => actualizarCierreMaterial(p, m.id, 'cantidad_entregada_solicitada', e.target.value)}/></label>}
            {puedePreparar && p.estado === 'EN_CURSO' && <div className="flex gap-2"><input className="input-dark w-24" type="number" min="0" step="any" placeholder="Consumido" value={m.cantidad_consumida ?? ''} onChange={e => actualizarCierreMaterial(p, m.id, 'cantidad_consumida', e.target.value)}/><input className="input-dark w-24" type="number" min="0" step="any" placeholder="Merma" value={m.cantidad_merma ?? ''} onChange={e => actualizarCierreMaterial(p, m.id, 'cantidad_merma', e.target.value)}/><input className="input-dark w-24" type="number" min="0" step="any" placeholder="Devuelto" value={m.cantidad_devuelta ?? ''} onChange={e => actualizarCierreMaterial(p, m.id, 'cantidad_devuelta', e.target.value)}/></div>}
          </div>)}</div>}
          {p.estado === 'EN_CURSO' && <>
            <div className="space-y-2"><div><h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Lista oficial del grupo · {p.asistencias.length} estudiantes</h4><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.grupo_academico_periodo ? `Inscripciones activas del periodo ${p.grupo_academico_periodo}` : 'Inscripciones activas del grupo académico'}{p.carga_docente_id ? ' · Carga docente vinculada' : ' · Vinculación por periodo, carrera y grupo'}{p.clase_docente_id ? ` · Registro de clase #${p.clase_docente_id}` : ''}</p></div><div className="max-h-72 space-y-1 overflow-auto">{p.asistencias.map(a => <div key={a.alumno_id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--surface-border)' }}><span style={{ color: 'var(--text-primary)' }}>{a.matricula} · {a.alumno_nombre}</span><select className="input-dark" value={a.estado} onChange={e => actualizarAsistencia(p, a.alumno_id, e.target.value)}><option value="PRESENTE">Presente</option><option value="FALTA">Falta</option><option value="RETARDO">Retardo</option><option value="JUSTIFICADA">Justificada</option></select></div>)}</div><button className={`${btn} border border-blue-300 text-blue-700`} onClick={() => guardarAsistencia(p)}>Guardar asistencia</button></div>
            <div className="grid gap-2 md:grid-cols-3"><textarea className={field} rows="3" placeholder="Resultados" value={reporte.resultados} onChange={e => setReporte({ ...reporte, resultados: e.target.value })}/><textarea className={field} rows="3" placeholder="Conclusiones" value={reporte.conclusiones} onChange={e => setReporte({ ...reporte, conclusiones: e.target.value })}/><textarea className={field} rows="3" placeholder="Observaciones" value={reporte.observaciones_docente} onChange={e => setReporte({ ...reporte, observaciones_docente: e.target.value })}/></div>
            <div className="space-y-2"><div className="flex flex-wrap gap-2"><button className={`${btn} bg-emerald-700 text-white`} onClick={() => cerrar(p)}>Cerrar práctica y guardar informe</button><button className={`${btn} border border-red-300 text-red-700`} onClick={() => { setIncidenteAbierto(incidenteAbierto === p.id ? null : p.id); setIncidenteForm({ tipo: 'SEGURIDAD', severidad: 'MEDIA', descripcion: '', acciones: '', activo_id: '' }); }}>Reportar incidente</button><button className={`${btn} border border-amber-300 text-amber-800`} onClick={() => { setResiduoAbierto(residuoAbierto === p.id ? null : p.id); setResiduoForm({ descripcion: '', clasificacion: 'QUIMICO', cantidad: '', unidad: 'g', destino: '' }); }}>Registrar residuo</button></div>
              {incidenteAbierto === p.id && <form className="grid gap-2 rounded-xl border border-red-200 bg-red-50 p-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); run(() => api.post(`/practicas-laboratorio/${p.id}/incidentes`, { ...incidenteForm, activo_id: incidenteForm.activo_id ? Number(incidenteForm.activo_id) : null, requiere_seguimiento: true }), 'Incidente registrado y enviado a seguimiento.'); setIncidenteAbierto(null); }}>
                <select className={field} value={incidenteForm.tipo} onChange={e => setIncidenteForm({ ...incidenteForm, tipo: e.target.value })}><option>SEGURIDAD</option><option>DERRAME</option><option>ROTURA</option><option>EXPOSICION</option><option>EQUIPO</option><option>OTRO</option></select>
                <select className={field} value={incidenteForm.severidad} onChange={e => setIncidenteForm({ ...incidenteForm, severidad: e.target.value })}><option>BAJA</option><option>MEDIA</option><option>ALTA</option><option>CRITICA</option></select>
                <select className={`${field} md:col-span-2`} value={incidenteForm.activo_id} onChange={e => setIncidenteForm({ ...incidenteForm, activo_id: e.target.value })}><option value="">Sin equipo patrimonial asociado</option>{activos.map(a => <option key={a.id} value={a.id}>{a.nombre} · {a.codigo_inventario}</option>)}</select>
                <textarea className={`${field} md:col-span-2`} required minLength="4" rows="2" placeholder="Describe lo ocurrido" value={incidenteForm.descripcion} onChange={e => setIncidenteForm({ ...incidenteForm, descripcion: e.target.value })}/>
                <textarea className={`${field} md:col-span-2`} rows="2" placeholder="Acciones inmediatas" value={incidenteForm.acciones} onChange={e => setIncidenteForm({ ...incidenteForm, acciones: e.target.value })}/>
                <button className={`${btn} bg-red-700 text-white md:col-span-2`}>Registrar incidente y abrir seguimiento</button>
              </form>}
              {residuoAbierto === p.id && <form className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); run(() => api.post(`/practicas-laboratorio/${p.id}/residuos`, { ...residuoForm, cantidad: Number(residuoForm.cantidad) }), 'Residuo agregado a la bitácora de esta práctica.'); setResiduoAbierto(null); }}>
                <input className={field} required placeholder="Descripción del residuo" value={residuoForm.descripcion} onChange={e => setResiduoForm({ ...residuoForm, descripcion: e.target.value })}/>
                <select className={field} value={residuoForm.clasificacion} onChange={e => setResiduoForm({ ...residuoForm, clasificacion: e.target.value })}><option>QUIMICO</option><option>RPBI</option><option>VIDRIO</option><option>COMUN</option><option>OTRO</option></select>
                <div className="flex gap-2"><input className={field} required type="number" min="0.001" step="any" placeholder="Cantidad" value={residuoForm.cantidad} onChange={e => setResiduoForm({ ...residuoForm, cantidad: e.target.value })}/><input className="input-dark w-24" required placeholder="Unidad" value={residuoForm.unidad} onChange={e => setResiduoForm({ ...residuoForm, unidad: e.target.value })}/></div>
                <input className={field} placeholder="Destino o recipiente de disposición" value={residuoForm.destino} onChange={e => setResiduoForm({ ...residuoForm, destino: e.target.value })}/>
                <button className={`${btn} bg-amber-700 text-white md:col-span-2`}>Guardar residuo</button>
              </form>}
            </div>
          </>}
          {p.residuos?.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><b>Residuos de la práctica</b>{p.residuos.map(x => <p key={x.id}>{x.clasificacion} · {x.descripcion}: {x.cantidad} {x.unidad}{x.destino ? ` · Destino: ${x.destino}` : ''}</p>)}</div>}
          {p.incidentes.length > 0 && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><b>Incidentes reportados</b>{p.incidentes.map(i => <div key={i.id} className="flex flex-wrap items-center justify-between gap-2"><span>{i.severidad} · {i.tipo} · {i.estado}{i.activo_nombre ? ` · Equipo: ${i.activo_nombre}` : ''}: {i.descripcion}{i.acciones ? ` · Acciones: ${i.acciones}` : ''}</span>{puedePreparar && i.estado !== 'RESUELTO' && <button className="rounded-lg border border-amber-500 px-2 py-1 text-xs font-semibold" onClick={() => { const acciones = window.prompt('Acciones y seguimiento realizado:', i.acciones || '') || ''; run(() => api.put(`/practicas-laboratorio/incidentes/${i.id}`, { estado: 'RESUELTO', acciones }), 'Incidente marcado como resuelto.'); }}>Marcar resuelto</button>}</div>)}</div>}
          {puedePreparar && p.estado === 'SOLICITADA' && <button className={`${btn} bg-emerald-700 text-white`} onClick={() => preparar(p)}>Preparar y entregar materiales</button>}
          {puedePreparar && p.estado === 'CERRADA' && <button className={`${btn} border border-blue-300 text-blue-700`} onClick={() => run(() => api.post(`/practicas-laboratorio/guias/desde-practica/${p.id}`, {}), 'Guía guardada para reutilizar en futuras sesiones.')}>Guardar como guía de práctica</button>}
          {esDocente && p.estado === 'PREPARADA' && <button className={`${btn} bg-blue-700 text-white`} onClick={() => iniciar(p)}>Iniciar práctica y cargar lista</button>}
          {p.estado === 'CERRADA' && <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700"><b>Informe:</b> {p.resultados || 'Sin resultados registrados'}<br/><b>Conclusiones:</b> {p.conclusiones || 'Sin conclusiones registradas'}</div>}
        </article>)}
      </section>
    </div>
  </AdminLayout>;
}

export default PracticasLaboratorio;
