import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const PERIODOS_UTECAN = [
  { numero: 1, inicio: '08:00', fin: '09:00' },
  { numero: 2, inicio: '09:00', fin: '09:45' },
  { numero: 3, inicio: '10:15', fin: '11:00', recesoAntes: true },
  { numero: 4, inicio: '11:00', fin: '12:00' },
  { numero: 5, inicio: '12:00', fin: '13:00' },
  { numero: 6, inicio: '13:00', fin: '14:00' },
  { numero: 7, inicio: '14:00', fin: '15:00' },
  { numero: 8, inicio: '15:00', fin: '16:00' },
];
const TIPOS = [
  ['CLASE', 'Clase'],
  ['TUTORIA', 'Tutoría'],
  ['DESCARGA', 'Descarga académica'],
  ['RECESO', 'Receso'],
  ['OTRA', 'Otra actividad'],
];
const TIPO_ESTILO = {
  CLASE: 'border-emerald-500/40 bg-emerald-500/10',
  TUTORIA: 'border-blue-500/40 bg-blue-500/10',
  DESCARGA: 'border-violet-500/40 bg-violet-500/10',
  RECESO: 'border-amber-500/40 bg-amber-500/10',
  OTRA: 'border-slate-500/40 bg-slate-500/10',
};
const VACIO = {
  tipo_actividad: 'CLASE', actividad_nombre: '', dia_semana: 0,
  hora_inicio: '08:00', hora_fin: '09:00', grupo_academico_id: '',
  materia_id: '', espacio_nombre: '', laboratorio_id: '', observaciones: '',
};

function ModalActividad({ catalogos, periodoId, actividad, preseleccion, onClose, onGuardada }) {
  const [form, setForm] = useState(actividad ? {
    ...VACIO, ...actividad,
    grupo_academico_id: actividad.grupo_academico_id || '',
    materia_id: actividad.materia_id || '',
    laboratorio_id: actividad.laboratorio_id || '',
  } : { ...VACIO, ...preseleccion });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const esClase = form.tipo_actividad === 'CLASE';

  const cambiar = (campo, valor) => {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    if (campo === 'materia_id') {
      const materia = catalogos.materias.find((m) => String(m.id) === String(valor));
      if (materia) setForm((actual) => ({ ...actual, materia_id: valor, actividad_nombre: materia.nombre }));
    }
    if (campo === 'laboratorio_id') {
      const lab = catalogos.laboratorios.find((l) => String(l.id) === String(valor));
      if (lab) setForm((actual) => ({ ...actual, laboratorio_id: valor, espacio_nombre: lab.nombre }));
    }
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    setGuardando(true);
    setError('');
    const payload = {
      ...form,
      periodo_id: Number(periodoId),
      grupo_academico_id: esClase && form.grupo_academico_id ? Number(form.grupo_academico_id) : null,
      materia_id: esClase && form.materia_id ? Number(form.materia_id) : null,
      laboratorio_id: form.laboratorio_id ? Number(form.laboratorio_id) : null,
    };
    try {
      const { data } = actividad
        ? await api.put(`/docencia/horario/${actividad.id}`, payload)
        : await api.post('/docencia/horario', payload);
      onGuardada(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar la actividad.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <form onSubmit={guardar} onMouseDown={(e) => e.stopPropagation()} className="glass w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">{actividad ? 'Editar actividad' : 'Agregar actividad'}</h2>
            <p className="text-xs text-slate-400">Captura el bloque tal como aparece en tu horario oficial.</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-slate-400">×</button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Tipo de actividad
            <select className="input-dark mt-1 w-full" value={form.tipo_actividad} onChange={(e) => cambiar('tipo_actividad', e.target.value)}>
              {TIPOS.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Día
            <select disabled={Boolean(preseleccion)} className="input-dark mt-1 w-full disabled:opacity-70" value={form.dia_semana} onChange={(e) => cambiar('dia_semana', Number(e.target.value))}>
              {DIAS.map((dia, indice) => <option key={dia} value={indice}>{dia}</option>)}
            </select>
          </label>
          {esClase && (
            <>
              <label className="text-sm text-slate-300">Materia
                <select className="input-dark mt-1 w-full" value={form.materia_id} onChange={(e) => cambiar('materia_id', e.target.value)}>
                  <option value="">Selecciona una materia</option>
                  {catalogos.materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">Grupo *
                <select required className="input-dark mt-1 w-full" value={form.grupo_academico_id} onChange={(e) => cambiar('grupo_academico_id', e.target.value)}>
                  <option value="">Selecciona un grupo</option>
                  {catalogos.grupos.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
            </>
          )}
          <label className={`text-sm text-slate-300 ${esClase ? 'sm:col-span-2' : ''}`}>Nombre de la actividad *
            <input required className="input-dark mt-1 w-full" value={form.actividad_nombre} onChange={(e) => cambiar('actividad_nombre', e.target.value)} placeholder={esClase ? 'Nombre de la materia' : 'Ej. Tutoría grupal'} />
          </label>
          <label className="text-sm text-slate-300">Hora de inicio
            <input required readOnly={Boolean(preseleccion)} type="time" className="input-dark mt-1 w-full read-only:opacity-70" value={form.hora_inicio} onChange={(e) => cambiar('hora_inicio', e.target.value)} />
          </label>
          <label className="text-sm text-slate-300">Hora de fin
            <input required readOnly={Boolean(preseleccion)} type="time" className="input-dark mt-1 w-full read-only:opacity-70" value={form.hora_fin} onChange={(e) => cambiar('hora_fin', e.target.value)} />
          </label>
          <label className="text-sm text-slate-300">Laboratorio registrado
            <select className="input-dark mt-1 w-full" value={form.laboratorio_id} onChange={(e) => cambiar('laboratorio_id', e.target.value)}>
              <option value="">No es laboratorio</option>
              {catalogos.laboratorios.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Salón o espacio
            <input className="input-dark mt-1 w-full" value={form.espacio_nombre} onChange={(e) => cambiar('espacio_nombre', e.target.value)} placeholder="Ej. S3, Aula 2" list="espacios-docencia" />
            <datalist id="espacios-docencia">{catalogos.espacios.map((e) => <option key={e.id} value={e.nombre} />)}</datalist>
          </label>
          <label className="text-sm text-slate-300 sm:col-span-2">Observaciones
            <textarea className="input-dark mt-1 min-h-20 w-full" value={form.observaciones || ''} onChange={(e) => cambiar('observaciones', e.target.value)} />
          </label>
          {error && <div className="sm:col-span-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-white/5 px-5 py-2.5 text-sm text-slate-300">Cancelar</button>
          <button disabled={guardando} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar borrador'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MiHorarioDocente() {
  const navigate = useNavigate();
  const [catalogos, setCatalogos] = useState({ periodos: [], grupos: [], materias: [], laboratorios: [], espacios: [] });
  const [periodoId, setPeriodoId] = useState('');
  const [horario, setHorario] = useState([]);
  const [hoy, setHoy] = useState([]);
  const [modal, setModal] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (idPeriodo) => {
    setCargando(true);
    try {
      const { data: cats } = await api.get('/docencia/catalogos', { params: idPeriodo ? { periodo_id: idPeriodo } : {} });
      const elegido = idPeriodo || cats.periodo_sugerido_id;
      setCatalogos(cats);
      setPeriodoId(String(elegido || ''));
      const [horarioRes, hoyRes] = await Promise.all([
        api.get('/docencia/horario', { params: elegido ? { periodo_id: elegido } : {} }),
        api.get('/docencia/hoy'),
      ]);
      setHorario(horarioRes.data);
      setHoy(hoyRes.data);
    } catch {
      setMensaje('No se pudo cargar el módulo docente.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  const actividadEnPeriodo = (dia, periodo) => horario.find((item) => (
    item.dia_semana === dia
    && item.hora_inicio < periodo.fin
    && item.hora_fin > periodo.inicio
  ));

  const guardada = ({ advertencias = [] }) => {
    setModal(null);
    setMensaje(advertencias.length ? `Guardado. Revisa: ${advertencias.join(' ')}` : 'Actividad guardada como borrador.');
    cargar(periodoId);
  };
  const activar = async (id) => {
    try {
      const { data } = await api.post(`/docencia/horario/${id}/activar`);
      setMensaje(data.advertencias?.length ? `Activado con advertencias: ${data.advertencias.join(' ')}` : 'Bloque activado correctamente.');
      cargar(periodoId);
    } catch (err) {
      setMensaje(err.response?.data?.detail || 'No se pudo activar el bloque.');
    }
  };
  const eliminar = async (id) => {
    if (!window.confirm('¿Retirar esta actividad de tu horario?')) return;
    await api.delete(`/docencia/horario/${id}`);
    cargar(periodoId);
  };
  const iniciar = async (id) => {
    try {
      const { data } = await api.post(`/docencia/horario/${id}/iniciar`);
      navigate(`/docente/clase/${data.id}`);
    } catch (err) {
      setMensaje(err.response?.data?.detail || 'No se pudo iniciar la clase.');
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Mi horario docente</h1>
            <p className="text-sm text-slate-400">Captura en SIGA el horario oficial entregado por tu Dirección de División.</p>
          </div>
          <div className="flex gap-2">
            <select className="input-dark" value={periodoId} onChange={(e) => cargar(e.target.value)}>
              {catalogos.periodos.map((p) => <option key={p.id} value={p.id}>{p.clave}</option>)}
            </select>
            <button onClick={() => setModal({ tipo: 'nuevo' })} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">+ Agregar bloque</button>
          </div>
        </div>

        {mensaje && <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">{mensaje}</div>}

        {hoy.length > 0 && (
          <section className="glass rounded-2xl p-4">
            <h2 className="mb-3 font-semibold text-white">Clases y actividades de hoy</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {hoy.map((item) => (
                <div key={item.id} className={`rounded-xl border p-4 ${TIPO_ESTILO[item.tipo_actividad]}`}>
                  <div className="flex justify-between gap-3">
                    <div><p className="font-semibold text-white">{item.actividad_nombre}</p><p className="text-xs text-slate-400">{item.hora_inicio}–{item.hora_fin} · {item.grupo || item.tipo_actividad}</p></div>
                    {item.tipo_actividad === 'CLASE' && (
                      <button onClick={() => item.clase_id ? navigate(`/docente/clase/${item.clase_id}`) : iniciar(item.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                        {item.clase_estado === 'CERRADA' ? 'Ver resumen' : item.clase_id ? 'Continuar' : 'Iniciar clase'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="glass overflow-x-auto rounded-2xl">
          <table className="min-w-[1100px] w-full table-fixed">
            <thead>
              <tr className="border-b border-white/10">
                <th className="w-28 p-4 text-left text-xs font-bold text-slate-400">HORA</th>
                {DIAS.map((dia) => <th key={dia} className="border-l border-white/10 p-4 text-center text-sm font-bold text-slate-300">{dia.toUpperCase()}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERIODOS_UTECAN.map((periodo) => (
                <Fragment key={periodo.numero}>
                  {periodo.recesoAntes && (
                    <tr className="border-y border-white/10 bg-amber-500/5">
                      <td />
                      <td colSpan={6} className="p-2 text-center text-xs font-medium tracking-widest text-amber-300">☕ RECESO · 09:45–10:15</td>
                    </tr>
                  )}
                  <tr className="border-b border-white/10">
                    <td className="p-4 align-top">
                      <p className="font-mono text-sm font-bold text-white">{periodo.inicio}</p>
                      <p className="font-mono text-xs text-slate-500">{periodo.fin}</p>
                    </td>
                    {DIAS.map((dia, diaIndice) => {
                      const item = actividadEnPeriodo(diaIndice, periodo);
                      const comienzaAqui = item?.hora_inicio === periodo.inicio;
                      return (
                        <td key={`${dia}-${periodo.numero}`} className="border-l border-white/10 p-2 align-top">
                          {item ? (
                            comienzaAqui ? (
                              <article className={`min-h-24 rounded-xl border p-3 ${TIPO_ESTILO[item.tipo_actividad]}`}>
                                <div className="flex items-start justify-between gap-1">
                                  <span className="text-xs font-bold text-emerald-300">{item.hora_inicio}–{item.hora_fin}</span>
                                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${item.estado === 'ACTIVO' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{item.estado}</span>
                                </div>
                                <p className="mt-1 text-sm font-semibold text-white">{item.actividad_nombre}</p>
                                <p className="text-xs text-slate-400">{item.grupo || item.tipo_actividad}</p>
                                <p className="truncate text-xs text-slate-500">{item.espacio_nombre || 'Sin salón'}</p>
                                <div className="mt-2 flex gap-2 text-[11px]">
                                  {item.estado !== 'ACTIVO' && <button onClick={() => activar(item.id)} className="text-emerald-300">Activar</button>}
                                  <button onClick={() => setModal({ tipo: 'editar', actividad: item })} className="text-blue-300">Editar</button>
                                  <button onClick={() => eliminar(item.id)} className="text-red-300">Retirar</button>
                                </div>
                              </article>
                            ) : (
                              <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-white/10 text-[11px] text-slate-600">Continuación</div>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled={cargando}
                              onClick={() => setModal({ tipo: 'nuevo', preseleccion: { dia_semana: diaIndice, hora_inicio: periodo.inicio, hora_fin: periodo.fin } })}
                              className="group flex min-h-24 w-full flex-col items-start rounded-xl border border-dashed border-emerald-500/20 p-3 text-left transition hover:border-emerald-400/60 hover:bg-emerald-500/10"
                            >
                              <span className="font-mono text-xs text-emerald-400">{periodo.inicio}–{periodo.fin}</span>
                              <span className="mt-auto text-xs text-slate-600 group-hover:text-emerald-300">+ Agregar actividad</span>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <ModalActividad
          catalogos={catalogos}
          periodoId={periodoId}
          actividad={modal.tipo === 'editar' ? modal.actividad : null}
          preseleccion={modal.preseleccion}
          onClose={() => setModal(null)}
          onGuardada={guardada}
        />
      )}
    </AdminLayout>
  );
}
