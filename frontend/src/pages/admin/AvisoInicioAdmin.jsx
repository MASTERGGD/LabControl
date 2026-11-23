import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { DESTINOS_AVISO } from '../../components/AvisoInicioDocente';
import api from '../../hooks/useApi';
import { getApiErrorMessage } from '../../utils/apiError';
import { todayISOInMexico } from '../../utils/timezone';

const VACIO = { titulo: '', mensaje: '', destino: '', vigente_hasta: '' };

export default function AvisoInicioAdmin() {
  const [aviso, setAviso] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [cargando, setCargando] = useState(true);
  const [disponible, setDisponible] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const hoy = todayISOInMexico();
  const vigente = aviso && aviso.vigente_hasta >= hoy;

  useEffect(() => {
    const controller = new AbortController();
    api.get('/aviso-inicio/admin', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setAviso(data);
      setForm(data ? {
        titulo: data.titulo, mensaje: data.mensaje, destino: data.destino || '', vigente_hasta: data.vigente_hasta,
      } : VACIO);
      setDisponible(true);
    }).catch(err => {
      if (!controller.signal.aborted) setError(getApiErrorMessage(err, 'No se pudo cargar el aviso.'));
    }).finally(() => {
      if (!controller.signal.aborted) setCargando(false);
    });
    return () => controller.abort();
  }, []);

  const cambiar = event => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };
  const publicar = async event => {
    event.preventDefault();
    if (ocupado || !form.titulo.trim() || !form.mensaje.trim() || !form.vigente_hasta || form.vigente_hasta < hoy) return;
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      const { data } = await api.put('/aviso-inicio/admin', {
        ...form, titulo: form.titulo.trim(), mensaje: form.mensaje.trim(), destino: form.destino || null,
      });
      setAviso(data);
      setMensaje('Aviso publicado en el inicio docente.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo publicar el aviso.'));
    } finally {
      setOcupado(false);
    }
  };
  const retirar = async () => {
    if (ocupado || !aviso) return;
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await api.delete(`/aviso-inicio/admin/${aviso.revision}`);
      setAviso(null);
      setMensaje('Aviso retirado del inicio docente.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo retirar el aviso.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-white">Aviso de inicio docente</h1>
          <p className="mt-1 text-sm text-slate-400">Publica un recordatorio temporal en la esquina inferior derecha del inicio docente.</p>
        </header>
        {cargando && <p role="status" className="text-sm text-slate-400">Cargando aviso…</p>}
        {error && <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-400">{error}</p>}
        {mensaje && <p role="status" className="rounded-xl border border-emerald-400/30 p-3 text-sm text-emerald-400">{mensaje}</p>}
        {disponible && (
          <form onSubmit={publicar} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-medium text-slate-300">{vigente ? 'Hay un aviso publicado.' : aviso ? 'El último aviso venció.' : 'Sin aviso publicado.'}</p>
            <label className="block text-sm text-slate-300">Título
              <input required name="titulo" maxLength={100} className="input-dark mt-1" value={form.titulo} onChange={cambiar} placeholder="Próximo cierre del cuatrimestre" />
            </label>
            <label className="block text-sm text-slate-300">Mensaje
              <textarea required name="mensaje" rows={4} maxLength={400} className="input-dark mt-1" value={form.mensaje} onChange={cambiar} placeholder="Revisa el avance de tus grupos y las clases registradas." />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">Mostrar hasta
                <input required type="date" name="vigente_hasta" min={hoy} className="input-dark mt-1" value={form.vigente_hasta} onChange={cambiar} />
                <span className="mt-1 block text-xs text-slate-400">Incluye el día indicado, hora de Ciudad de México.</span>
              </label>
              <label className="block text-sm text-slate-300">Enlace del aviso (opcional)
                <select name="destino" className="input-dark mt-1" value={form.destino} onChange={cambiar}>
                  <option value="">Sin enlace</option>
                  {Object.entries(DESTINOS_AVISO).map(([clave, opcion]) => <option key={clave} value={clave}>{opcion.etiqueta}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={ocupado} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{vigente ? 'Actualizar aviso' : 'Publicar aviso'}</button>
              {aviso && <button type="button" disabled={ocupado} onClick={retirar} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-300 disabled:opacity-50">Retirar aviso</button>}
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
