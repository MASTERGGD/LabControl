import { useState } from 'react';
import api from '../../hooks/useApi';

const VACIO = { alcance: 'TODOS', valores: [], fecha_desde: '', fecha_hasta: '', abre: '', cierra: '', motivo: '' };

export default function VentanaExtraordinaria({ cierre, recargar }) {
  const [form, setForm] = useState(VACIO);
  const [vista, setVista] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  if (!cierre?.periodo_id || cierre.estado === 'CERRADO') return null;

  const opciones = new Map();
  for (const carga of cierre.cargas) {
    if (form.alcance === 'DOCENTE' && carga.docente_id) opciones.set(carga.docente_id, carga.docente);
    if (form.alcance === 'GRUPO' && carga.grupo_id) opciones.set(carga.grupo_id, `${carga.grupo} · ${carga.programa_educativo} (#${carga.grupo_id})`);
    if (form.alcance === 'PROGRAMA' && carga.programa_educativo) opciones.set(carga.programa_educativo, carga.programa_educativo);
  }
  const cambiar = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value, ...(name === 'alcance' ? { valores: [] } : {}) }));
    setVista(null);
    setMensaje('');
    setError('');
  };
  const cambiarDestinatario = e => {
    const { value, checked } = e.target;
    setForm(prev => ({ ...prev, valores: checked ? [...prev.valores, value] : prev.valores.filter(id => id !== value) }));
    setVista(null);
    setMensaje('');
    setError('');
  };
  const procesar = async (e, confirmar) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const { data } = await api.post('/cierre-academico/ventanas-extraordinarias', {
        ...form, periodo_id: cierre.periodo_id,
        ...(confirmar ? { vista_previa: vista.vista_previa } : {}),
      });
      if (!confirmar) setVista(data);
      else {
        setVista(null);
        setMensaje(`Ventana registrada para ${data.sesiones} sesiones de ${data.docentes} docentes.`);
        await recargar();
      }
    } catch (err) {
      setVista(null);
      const detalle = err.response?.data?.detail;
      setError(typeof detalle === 'string' ? detalle : 'Revisa las fechas y el alcance.');
    } finally {
      setGuardando(false);
    }
  };

  return <details className="glass rounded-xl p-4">
    <summary className="cursor-pointer font-semibold">Ventana extraordinaria de captura</summary>
    <p className="mt-2 text-sm text-slate-500">Habilita fechas vencidas por una causa común. Los horarios de la ventana usan la hora de Ciudad de México.</p>
    <form className="mt-3 space-y-3" onSubmit={e => procesar(e, false)}>
      <fieldset disabled={guardando} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Clases desde<input type="date" name="fecha_desde" required value={form.fecha_desde} onChange={cambiar} className="input-dark mt-1 w-full" /></label>
        <label className="text-sm">Clases hasta<input type="date" name="fecha_hasta" required min={form.fecha_desde || undefined} value={form.fecha_hasta} onChange={cambiar} className="input-dark mt-1 w-full" /></label>
        <label className="text-sm">Inicio de la ventana<input type="datetime-local" name="abre" required value={form.abre} onChange={cambiar} className="input-dark mt-1 w-full" /></label>
        <label className="text-sm">Fin de la ventana<input type="datetime-local" name="cierra" required min={form.abre || undefined} value={form.cierra} onChange={cambiar} className="input-dark mt-1 w-full" /></label>
        <label className="text-sm">Alcance
          <select name="alcance" value={form.alcance} onChange={cambiar} className="input-dark mt-1 w-full">
            <option value="TODOS">Todos los docentes del cuatrimestre</option><option value="DOCENTE">Docentes seleccionados</option>
            <option value="GRUPO">Grupos seleccionados</option><option value="PROGRAMA">Programas seleccionados</option>
          </select>
        </label>
        {form.alcance !== 'TODOS' && <fieldset className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
          <legend className="text-sm">Destinatarios ({form.valores.length})</legend>
          {[...opciones].sort((a, b) => (a[1] || '').localeCompare(b[1] || '', 'es')).map(([id, etiqueta]) =>
            <label key={id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" value={id} checked={form.valores.includes(String(id))} onChange={cambiarDestinatario} />
              {etiqueta || `#${id}`}
            </label>)}
        </fieldset>}
        <label className="text-sm sm:col-span-2">Motivo común
          <textarea name="motivo" required minLength={5} maxLength={2000} rows={2} value={form.motivo} onChange={cambiar} className="input-dark mt-1 w-full" />
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {mensaje && <p role="status" className="text-sm text-emerald-600">{mensaje}</p>}
      <button type="submit" disabled={guardando || (form.alcance !== 'TODOS' && !form.valores.length)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Ver alcance</button>
      {vista && <div className="rounded-lg border p-3">
        <p role="status" className="mb-2 text-sm">{vista.sesiones} sesiones vencidas de {vista.docentes} docentes cumplen los requisitos.</p>
        <button type="button" disabled={guardando || !vista.sesiones} onClick={e => procesar(e, true)}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirmar ventana</button>
      </div>}
    </form>
  </details>;
}
