import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { DESTINOS_AVISO, TarjetaAvisoInicio } from '../../components/AvisoInicioDocente';
import api from '../../hooks/useApi';
import { getApiErrorMessage } from '../../utils/apiError';
import { todayISOInMexico } from '../../utils/timezone';

const VACIO = { titulo: '', mensaje: '', destino: '', audiencia: 'DOCENTES', vigente_hasta: '' };
const ESTADOS = {
  ACTIVO: 'Activo', VENCIDO: 'Vencido', RETIRADO: 'Retirado',
  REEMPLAZADO: 'Reemplazado', VERSION_ANTERIOR: 'Versión anterior',
};
const audienciaTexto = audiencia => audiencia === 'TODOS' ? 'Todos los perfiles' : 'Solo docentes';
const formatoVigencia = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' });
const formatoPublicacion = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });
const vigenciaTexto = fecha => formatoVigencia.format(new Date(`${fecha}T12:00:00Z`));
const camposFormulario = aviso => ({
  titulo: aviso.titulo, mensaje: aviso.mensaje, destino: aviso.destino || '',
  audiencia: aviso.audiencia, vigente_hasta: aviso.vigente_hasta,
});

function HistorialAvisos({ actualizacion, onBorrador, ocupado }) {
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setResultado(null);
    setError('');
    api.get('/aviso-inicio/admin/historial', { params: { pagina }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResultado(data); })
      .catch(err => { if (!controller.signal.aborted) setError(getApiErrorMessage(err, 'No se pudo cargar el historial.')); });
    return () => controller.abort();
  }, [pagina, actualizacion]);

  return <section className="space-y-3" aria-labelledby="historial-avisos">
    <h2 id="historial-avisos" className="text-lg font-semibold text-white">Historial de avisos</h2>
    {error ? <p role="alert" className="text-sm text-red-400">{error}</p>
      : !resultado ? <p role="status" className="text-sm text-slate-400">Cargando historial…</p>
        : !resultado.avisos.length && <p className="text-sm text-slate-400">Todavía no hay avisos en el historial.</p>}
    {resultado?.avisos.map(({ id, versiones }) => {
      const [actual] = versiones;
      return <details key={id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">
          {actual.titulo} · {ESTADOS[actual.estado]}
          <span className="mt-1 block text-xs font-normal text-slate-400">
            {audienciaTexto(actual.audiencia)} · Publicación {actual.publicado_en ? formatoPublicacion.format(new Date(actual.publicado_en)) : 'sin fecha registrada'} · Vigencia hasta {vigenciaTexto(actual.vigente_hasta)}
          </span>
        </summary>
        <div className="mt-3 divide-y divide-white/10">
          {versiones.map(version => <article key={version.revision} className="space-y-1 py-3 text-sm">
            <h3 className="font-semibold text-slate-200">Versión {version.version} · {ESTADOS[version.estado]}</h3>
            <p className="text-xs text-slate-400">
              {version.publicado_por || 'Autor sin registrar'} · {version.publicado_en ? formatoPublicacion.format(new Date(version.publicado_en)) : 'Fecha sin registrar'}
            </p>
            <p className="text-xs text-slate-400">{audienciaTexto(version.audiencia)} · Vigencia hasta {vigenciaTexto(version.vigente_hasta)}</p>
            {version.cerrado_en && <p className="text-xs text-slate-400">Dejó de mostrarse el {formatoPublicacion.format(new Date(version.cerrado_en))}</p>}
            <p className="font-medium text-slate-200">{version.titulo}</p>
            <p className="whitespace-pre-wrap break-words text-slate-300">{version.mensaje}</p>
            {version.destino && <p className="text-xs text-slate-400">Enlace para docentes · {DESTINOS_AVISO[version.destino]?.etiqueta}</p>}
            <button type="button" disabled={ocupado} onClick={() => onBorrador(version)} className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-50">Usar como borrador</button>
          </article>)}
        </div>
      </details>;
    })}
    {(pagina > 1 || resultado?.hay_mas) && <nav aria-label="Páginas del historial" className="flex items-center gap-3 text-xs text-slate-400">
      <button type="button" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)} className="rounded border border-white/15 px-3 py-1 disabled:opacity-40">Anterior</button>
      <span>Página {pagina}</span>
      <button type="button" disabled={!resultado?.hay_mas} onClick={() => setPagina(pagina + 1)} className="rounded border border-white/15 px-3 py-1 disabled:opacity-40">Siguiente</button>
    </nav>}
  </section>;
}

export default function AvisoInicioAdmin() {
  const [aviso, setAviso] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [editor, setEditor] = useState(null);
  const [actualizacion, setActualizacion] = useState(0);
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
  const abrirEditor = (origen, edicion = false) => {
    setError('');
    setMensaje('');
    setForm(origen ? { ...camposFormulario(origen), vigente_hasta: edicion ? origen.vigente_hasta : '' } : VACIO);
    setEditor({ revisionEdicion: edicion ? origen.revision : null });
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
        revision_actual: aviso?.revision ?? null, revision_edicion: editor.revisionEdicion,
      });
      setAviso(data);
      setEditor(null);
      setActualizacion(n => n + 1);
      setMensaje('Aviso publicado en el inicio de los perfiles seleccionados.');
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
      setEditor(null);
      setActualizacion(n => n + 1);
      setMensaje('Aviso retirado.');
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
          <h1 className="text-2xl font-bold text-white">Aviso de inicio</h1>
          <p className="mt-1 text-sm text-slate-400">Publica un recordatorio temporal en el inicio de los perfiles seleccionados.</p>
        </header>
        {cargando && <p role="status" className="text-sm text-slate-400">Cargando aviso…</p>}
        {error && <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-400">{error}</p>}
        {mensaje && <p role="status" className="rounded-xl border border-emerald-400/30 p-3 text-sm text-emerald-400">{mensaje}</p>}
        {disponible && vigente && <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Aviso activo</h2>
            <p className="text-xs text-slate-400">{audienciaTexto(aviso.audiencia)} · Vigente hasta {vigenciaTexto(aviso.vigente_hasta)}</p>
          </div>
          <TarjetaAvisoInicio aviso={aviso} />
          {aviso.destino && <p className="text-xs text-slate-400">El enlace se muestra únicamente en el perfil docente.</p>}
          {!editor && <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => abrirEditor(aviso, true)} disabled={ocupado} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Editar aviso</button>
            <button type="button" onClick={() => abrirEditor()} disabled={ocupado} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-300 disabled:opacity-50">Nuevo aviso</button>
            <button type="button" onClick={retirar} disabled={ocupado} className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-50">Retirar aviso</button>
          </div>}
        </section>}
        {disponible && !vigente && !editor && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
          <p className="text-sm text-slate-400">No hay un aviso activo.</p>
          <button type="button" onClick={() => abrirEditor()} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Nuevo aviso</button>
        </div>}
        {disponible && editor && (
          <form onSubmit={publicar} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold text-white">{editor.revisionEdicion ? 'Editar aviso' : 'Nuevo aviso'}</h2>
            {vigente && !editor.revisionEdicion && <p className="text-sm text-slate-400">Cuando publiques este aviso, sustituirá el aviso activo.</p>}
            <label className="block text-sm text-slate-300">Mostrar a
              <select name="audiencia" className="input-dark mt-1" value={form.audiencia} onChange={cambiar}>
                <option value="DOCENTES">Solo docentes</option>
                <option value="TODOS">Todos los perfiles</option>
              </select>
            </label>
            <label className="block text-sm text-slate-300">Título
              <input autoFocus required name="titulo" maxLength={100} className="input-dark mt-1" value={form.titulo} onChange={cambiar} placeholder="Próximo cierre del cuatrimestre" />
            </label>
            <label className="block text-sm text-slate-300">Mensaje
              <textarea required name="mensaje" rows={4} maxLength={400} className="input-dark mt-1" value={form.mensaje} onChange={cambiar} placeholder="Revisa el avance de tus grupos y las clases registradas." />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">Mostrar hasta
                <input required type="date" name="vigente_hasta" min={hoy} className="input-dark mt-1" value={form.vigente_hasta} onChange={cambiar} />
                <span className="mt-1 block text-xs text-slate-400">Incluye el día indicado, hora de Ciudad de México.</span>
              </label>
              <label className="block text-sm text-slate-300">Enlace para docentes (opcional)
                <select name="destino" className="input-dark mt-1" value={form.destino} onChange={cambiar}>
                  <option value="">Sin enlace</option>
                  {Object.entries(DESTINOS_AVISO).map(([clave, opcion]) => <option key={clave} value={clave}>{opcion.etiqueta}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={ocupado} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{editor.revisionEdicion ? 'Guardar cambios' : 'Publicar aviso'}</button>
              <button type="button" disabled={ocupado} onClick={() => setEditor(null)} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-300 disabled:opacity-50">Cancelar</button>
            </div>
          </form>
        )}
        {disponible && <HistorialAvisos actualizacion={actualizacion} onBorrador={abrirEditor} ocupado={ocupado || Boolean(editor)} />}
      </div>
    </AdminLayout>
  );
}
