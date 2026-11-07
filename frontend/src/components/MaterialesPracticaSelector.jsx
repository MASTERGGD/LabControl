import React, { useEffect, useState } from 'react';
import api from '../hooks/useApi';

const nuevoMaterial = () => ({ insumo_id: '', descripcion: '', cantidad_solicitada: '', unidad: 'PIEZA', nota: '' });
const normalizar = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const claveMaterial = material => material.catalogo_clave || (material.insumo_id ? `insumo:${material.insumo_id}` : '');

export default function MaterialesPracticaSelector({ laboratorioId, materiales, onChange }) {
  const [catalogo, setCatalogo] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [soloDisponibles, setSoloDisponibles] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCatalogo([]); setError('');
    if (!laboratorioId) { setCargando(false); return undefined; }
    setCargando(true);
    api.get(`/practicas-laboratorio/catalogo-materiales?laboratorio_id=${laboratorioId}`)
      .then(({ data }) => {
        if (!Array.isArray(data)) throw new Error('Catálogo inválido');
        if (vigente) setCatalogo(data);
      })
      .catch(() => { if (vigente) setError('No se pudo consultar el inventario del laboratorio. Puedes reintentar o capturar un material no registrado.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [laboratorioId, intento]);

  const filtrados = catalogo.filter(item => (!tipo || item.tipo === tipo)
    && (!soloDisponibles || item.disponible > 0)
    && normalizar(`${item.nombre} ${item.codigo}`).includes(normalizar(busqueda)));
  const actualizar = (indice, cambio) => onChange(materiales.map((m, i) => i === indice ? { ...m, ...cambio } : m));
  const seleccionar = (indice, clave) => {
    const item = catalogo.find(x => x.clave === clave);
    actualizar(indice, item ? {
      catalogo_clave: clave, insumo_id: item.insumo_id || '',
      descripcion: item.tipo === 'EQUIPO' ? `${item.nombre} · ${item.codigo}`.slice(0, 180) : item.nombre,
      unidad: item.unidad,
      nota: item.tipo === 'EQUIPO' ? `Equipo de inventario: ${item.codigo}. Disponibilidad y entrega pendientes de confirmar por el responsable.` : '',
    } : { catalogo_clave: '', insumo_id: '', descripcion: '', unidad: 'PIEZA', nota: 'Material no registrado: pendiente de confirmar por el responsable.' });
  };

  return <section className="space-y-3" aria-label="Materiales de la práctica">
    <h3 className="text-sm font-semibold">Materiales, reactivos y equipo solicitado</h3>
    <p className="text-xs opacity-80">Consulta las existencias de este laboratorio. Son orientativas: el responsable confirmará disponibilidad y entrega al recibir tu solicitud.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Buscar en el laboratorio<input className="input-dark mt-1 w-full" type="search" placeholder="Nombre, código de inventario o CAS" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
      <label className="text-xs">Tipo de material<select className="input-dark mt-1 w-full" value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los tipos</option><option value="MATERIAL">Materiales</option><option value="REACTIVO">Reactivos</option><option value="EQUIPO">Equipos de inventario</option></select></label>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soloDisponibles} onChange={e => setSoloDisponibles(e.target.checked)} />Solo disponibles</label>
    {laboratorioId && !error && <button type="button" disabled={cargando} className="text-xs underline disabled:opacity-50" onClick={() => setIntento(i => i + 1)}>Actualizar existencias</button>}
    <div role="status" className="text-xs">
      {cargando ? 'Consultando inventario…' : error ? <p className="text-amber-700 dark:text-amber-300">{error} <button type="button" className="underline font-semibold" onClick={() => setIntento(i => i + 1)}>Reintentar</button></p>
        : !laboratorioId ? 'Selecciona una reservación para consultar su laboratorio.'
        : !catalogo.length ? 'No hay materiales ni equipos registrados en este laboratorio. Puedes solicitar un material no registrado.'
        : !filtrados.length ? 'No hay coincidencias con estos filtros. Cambia la búsqueda o desmarca Solo disponibles.'
        : `${filtrados.length} opciones coinciden con los filtros.`}
    </div>
    {materiales.map((material, indice) => {
      const clave = claveMaterial(material);
      const elegido = catalogo.find(item => item.clave === clave);
      // Conservar la opción elegida aunque cambien los filtros.
      const opciones = elegido && !filtrados.some(item => item.clave === clave) ? [elegido, ...filtrados] : filtrados;
      const totalSolicitado = materiales.filter(m => claveMaterial(m) === clave).reduce((total, m) => total + (Number(m.cantidad_solicitada) || 0), 0);
      const faltante = elegido ? Math.max(0, totalSolicitado - elegido.disponible) : 0;
      return <div key={indice} className="space-y-2 rounded-xl border border-slate-300 p-3">
        <label className="block text-xs">Material {indice + 1}<select aria-label="Insumo del catálogo" className="input-dark mt-1 w-full" value={clave} disabled={cargando} onChange={e => seleccionar(indice, e.target.value)}>
          <option value="">Solicitar material no registrado</option>
          {clave && !elegido && <option value={clave}>Selección anterior · existencia sin verificar</option>}
          {opciones.map(item => <option key={item.clave} value={item.clave}>{item.nombre}{item.codigo ? ` · ${item.codigo}` : ''} · disponible {item.disponible} {item.unidad} · {item.estado}</option>)}
        </select></label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs sm:col-span-2">Descripción<input aria-label="Descripción" className="input-dark mt-1 w-full" maxLength={180} placeholder="¿Qué necesitas para tu práctica?" readOnly={Boolean(clave)} value={material.descripcion} onChange={e => actualizar(indice, { descripcion: e.target.value })} /></label>
          <label className="text-xs">Cantidad solicitada<input aria-label="Cantidad" className="input-dark mt-1 w-full" type="number" min="0.001" step="any" value={material.cantidad_solicitada} onChange={e => actualizar(indice, { cantidad_solicitada: e.target.value })} /></label>
          <label className="text-xs">Unidad<input aria-label="Unidad" className="input-dark mt-1 w-full" maxLength={30} readOnly={Boolean(clave)} value={material.unidad} onChange={e => actualizar(indice, { unidad: e.target.value })} /></label>
        </div>
        {elegido ? <p className="text-xs" role="status">Existencia registrada: {elegido.existencia} {elegido.unidad} · disponible para solicitar: {elegido.disponible} · {elegido.estado}{elegido.caduca_en ? ` · caducidad ${elegido.caduca_en}` : ''}
          {faltante > 0 && <span className="block font-semibold text-amber-700 dark:text-amber-300">Faltan {Number(faltante.toFixed(3))} {elegido.unidad} para cubrir lo solicitado en esta práctica. El responsable deberá confirmar cómo cubrirlo.</span>}
        </p> : <p className="text-xs opacity-80">{clave ? 'No se pudo verificar la existencia de esta selección.' : 'Material no registrado: pendiente de confirmar por el responsable.'}</p>}
        <button type="button" className="rounded-lg border px-3 py-1 text-xs" onClick={() => onChange(materiales.length === 1 ? [nuevoMaterial()] : materiales.filter((_, i) => i !== indice))}>Quitar material {indice + 1}</button>
      </div>;
    })}
    <button type="button" disabled={materiales.length >= 80} className="rounded-lg border border-emerald-400 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300" onClick={() => onChange([...materiales, nuevoMaterial()])}>+ Agregar material</button>
  </section>;
}
