import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const ESTADOS = [
  ['PRESENTE', 'Presente', 'bg-emerald-600'],
  ['FALTA', 'Falta', 'bg-red-600'],
  ['RETARDO', 'Retardo', 'bg-amber-600'],
  ['JUSTIFICADA', 'Justificada', 'bg-blue-600'],
];

export default function ClaseAsistencia() {
  const { claseId } = useParams();
  const navigate = useNavigate();
  const [clase, setClase] = useState(null);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [modal, setModal] = useState(null);
  const [texto, setTexto] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get(`/docencia/clases/${claseId}`);
      setClase(data);
    } catch {
      setError('No se pudo cargar la clase.');
    }
  }, [claseId]);
  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = async (asistenciaId, estado) => {
    if (!['ABIERTA', 'CORRECCION'].includes(clase.estado)) return;
    setClase((actual) => ({
      ...actual,
      alumnos: actual.alumnos.map((a) => a.asistencia_id === asistenciaId ? { ...a, estado } : a),
    }));
    try {
      await api.patch(`/docencia/clases/${claseId}/asistencia/${asistenciaId}`, { estado });
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar la asistencia.');
      cargar();
    }
  };

  const cerrar = async () => {
    setCerrando(true);
    try {
      const { data } = await api.post(`/docencia/clases/${claseId}/cerrar`, {
        observacion_general: texto.trim() || null,
      });
      setClase(data);
      setModal(null);
      setTexto('');
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cerrar la clase.');
    } finally {
      setCerrando(false);
    }
  };

  const corregir = async () => {
    if (texto.trim().length < 5) {
      setError('Escribe el motivo de la corrección (mínimo 5 caracteres).');
      return;
    }
    setCerrando(true);
    try {
      const { data } = await api.post(`/docencia/clases/${claseId}/habilitar-correccion`, {
        motivo: texto.trim(),
      });
      setClase(data);
      setModal(null);
      setTexto('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo habilitar la corrección.');
    } finally {
      setCerrando(false);
    }
  };

  if (!clase) return <AdminLayout><div className="p-8 text-center text-slate-400">{error || 'Cargando lista de alumnos...'}</div></AdminLayout>;
  const r = clase.resumen;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button onClick={() => navigate('/docente/horario')} className="mb-2 text-sm text-slate-400 hover:text-white">← Mi horario</button>
            <h1 className="text-2xl font-bold text-white">{clase.carga.actividad_nombre}</h1>
            <p className="text-sm text-slate-400">{clase.carga.grupo} · {clase.carga.carrera} · {clase.carga.espacio_nombre || 'Sin salón'} · {clase.carga.hora_inicio}–{clase.carga.hora_fin}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${clase.estado === 'ABIERTA' ? 'bg-emerald-500/20 text-emerald-300' : clase.estado === 'CORRECCION' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-300'}`}>
              {clase.estado === 'ABIERTA' ? 'Clase en curso' : clase.estado === 'CORRECCION' ? 'Corrigiendo asistencia' : 'Asistencia cerrada'}
            </span>
            {['ABIERTA', 'CORRECCION'].includes(clase.estado) && <button disabled={cerrando} onClick={() => { setTexto(''); setModal('cerrar'); }} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">{clase.estado === 'CORRECCION' ? 'Guardar corrección' : 'Cerrar asistencia'}</button>}
            {clase.estado === 'CERRADA' && <button onClick={() => { setTexto(''); setModal('corregir'); }} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white">Corregir asistencia</button>}
            <button onClick={() => navigate(`/docente/seguimiento?carga=${clase.carga.id}`)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-300">Ver seguimiento</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[['Total', r.total], ['Presentes', r.presente], ['Faltas', r.falta], ['Retardos', r.retardo], ['Justificadas', r.justificada]].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="glass rounded-xl p-4"><p className="text-2xl font-bold text-white">{valor}</p><p className="text-xs text-slate-400">{etiqueta}</p></div>
          ))}
        </div>

        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        <div className="glass overflow-hidden rounded-2xl">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold text-white">Lista del grupo</h2>
            <p className="text-xs text-slate-400">Todos comienzan como presentes; marca únicamente las excepciones.</p>
          </div>
          <div className="divide-y divide-white/5">
            {clase.alumnos.map((alumno, indice) => (
              <div key={alumno.asistencia_id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-sm text-slate-400">{indice + 1}</span>
                  <div className="min-w-0"><p className="truncate font-medium text-white">{alumno.nombre}</p><p className="text-xs text-slate-500">{alumno.matricula}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  {ESTADOS.map(([valor, etiqueta, color]) => (
                    <button
                      key={valor}
                      disabled={!['ABIERTA', 'CORRECCION'].includes(clase.estado)}
                      onClick={() => cambiar(alumno.asistencia_id, valor)}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${alumno.estado === valor ? `${color} text-white` : 'bg-white/5 text-slate-400 hover:bg-white/10'} disabled:cursor-not-allowed`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {clase.alumnos.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Este grupo todavía no tiene alumnos inscritos.</p>}
          </div>
        </div>
        {modal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.72)' }}
          >
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{modal === 'corregir' ? 'Habilitar corrección' : clase.estado === 'CORRECCION' ? 'Guardar corrección' : 'Cerrar asistencia'}</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {modal === 'corregir'
                      ? 'Indica por qué necesitas modificarla. El motivo quedará registrado.'
                      : 'Confirma el cierre. Después podrás corregirla únicamente dejando un motivo.'}
                  </p>
                </div>
                <button onClick={() => setModal(null)} className="text-2xl text-slate-400 hover:text-white">×</button>
              </div>
              <label className="mt-5 block text-sm font-medium text-slate-300">
                {modal === 'corregir' ? 'Motivo de la corrección *' : 'Observación general (opcional)'}
              </label>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white outline-none focus:border-emerald-500" placeholder={modal === 'corregir' ? 'Ej. El alumno presentó su justificante después del cierre.' : 'Notas de esta sesión...'} />
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setModal(null)} className="rounded-xl bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-300">Cancelar</button>
                <button disabled={cerrando} onClick={modal === 'corregir' ? corregir : cerrar} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${modal === 'corregir' ? 'bg-amber-600' : 'bg-red-600'}`}>
                  {cerrando ? 'Guardando...' : modal === 'corregir' ? 'Habilitar corrección' : 'Confirmar cierre'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
