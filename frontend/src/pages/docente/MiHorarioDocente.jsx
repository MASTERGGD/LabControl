import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { usePeriodo } from '../../context/PeriodoContext';

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
const TIPO_TEXTO = {
  CLASE: 'text-emerald-300',
  TUTORIA: 'text-blue-300',
  DESCARGA: 'text-violet-300',
  RECESO: 'text-amber-300',
  OTRA: 'text-slate-300',
};
const VACIO = {
  tipo_actividad: 'CLASE', actividad_nombre: '', dia_semana: 0,
  hora_inicio: '08:00', hora_fin: '09:00', grupo_academico_id: '',
  materia_id: '', grupo_tutorado_id: '', espacio_nombre: '', laboratorio_id: '', observaciones: '',
};

const minutosDeHora = (hora = '00:00') => {
  const [horas, minutos] = hora.split(':').map(Number);
  return (horas * 60) + minutos;
};

const estadoActividad = (item, minutoActual) => {
  if (item.calendario && !item.calendario.requiere_asistencia) return 'NO_LECTIVA';
  if (item.clase_estado === 'CERRADA') return 'FINALIZADA';
  if (['ABIERTA', 'CORRECCION'].includes(item.clase_estado)) return 'EN_CURSO';
  if (minutoActual < minutosDeHora(item.hora_inicio)) return 'PROXIMA';
  if (minutoActual <= minutosDeHora(item.hora_fin)) return 'ACTUAL';
  return 'PENDIENTE';
};

const puedeIniciarActividad = (item, minutoActual) => (
  Boolean(item?.clase_id)
  || (
    minutoActual >= minutosDeHora(item?.hora_inicio) - 15
    && minutoActual <= minutosDeHora(item?.hora_fin) + 15
  )
);

const textoVentanaInicio = (item) => {
  const apertura = minutosDeHora(item?.hora_inicio) - 15;
  const horas = Math.floor(apertura / 60);
  const minutos = apertura % 60;
  return `Disponible a las ${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
};

function ModalActividad({ catalogos, periodoId, actividad, preseleccion, onClose, onGuardada }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(actividad ? {
    ...VACIO, ...actividad,
    grupo_academico_id: actividad.grupo_academico_id || '',
    materia_id: actividad.materia_id || '',
    grupo_tutorado_id: actividad.grupo_tutorado_id || '',
    laboratorio_id: actividad.laboratorio_id || '',
  } : { ...VACIO, ...preseleccion });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [materiaBusqueda, setMateriaBusqueda] = useState(actividad?.actividad_nombre || '');
  const [buscadorMateriaAbierto, setBuscadorMateriaAbierto] = useState(false);
  const [disponibilidadLab, setDisponibilidadLab] = useState(null);
  const [verificandoLab, setVerificandoLab] = useState(false);
  const esClase = form.tipo_actividad === 'CLASE';
  const esTutoria = form.tipo_actividad === 'TUTORIA';
  const grupoSeleccionado = catalogos.grupos.find((g) => String(g.id) === String(form.grupo_academico_id));
  const materiaSeleccionada = catalogos.materias.find((m) => String(m.id) === String(form.materia_id));
  const asignacionGrupo = (grupoId, materiaId = form.materia_id) => (
    (catalogos.asignaciones_materias || []).find((asignacion) => (
      String(asignacion.materia_id) === String(materiaId)
      && String(asignacion.grupo_academico_id) === String(grupoId)
    ))
  );
  const normalizar = (valor) => String(valor || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es');
  const gruposCompatibles = materiaSeleccionada ? catalogos.grupos.filter((grupo) => (
    (!materiaSeleccionada.carrera || normalizar(grupo.carrera) === normalizar(materiaSeleccionada.carrera))
    && (materiaSeleccionada.cuatrimestre_oficial == null
      || Number(grupo.cuatrimestre) === Number(materiaSeleccionada.cuatrimestre_oficial))
  )) : [];
  const materiasFiltradas = catalogos.materias
    .filter((materia) => {
      const texto = `${materia.nombre} ${materia.carrera || ''}`.toLocaleLowerCase('es');
      return texto.includes(materiaBusqueda.trim().toLocaleLowerCase('es'));
    })
    .sort((a, b) => {
      const aCoincide = grupoSeleccionado?.carrera && a.carrera === grupoSeleccionado.carrera ? 0 : 1;
      const bCoincide = grupoSeleccionado?.carrera && b.carrera === grupoSeleccionado.carrera ? 0 : 1;
      return aCoincide - bCoincide || a.nombre.localeCompare(b.nombre, 'es');
    })
    .filter((materia, indice, lista) => (
      lista.findIndex((otra) => otra.nombre === materia.nombre && otra.carrera === materia.carrera) === indice
    ))
    .slice(0, 10);
  const finalesDisponibles = [...new Set(PERIODOS_UTECAN.map((periodo) => periodo.fin))]
    .filter((fin) => fin > form.hora_inicio);
  const crearPayload = () => ({
    ...form,
    periodo_id: Number(periodoId),
    grupo_academico_id: esClase && form.grupo_academico_id ? Number(form.grupo_academico_id) : null,
    materia_id: esClase && form.materia_id ? Number(form.materia_id) : null,
    grupo_tutorado_id: esTutoria && form.grupo_tutorado_id ? Number(form.grupo_tutorado_id) : null,
    laboratorio_id: form.laboratorio_id ? Number(form.laboratorio_id) : null,
  });

  const cambiar = (campo, valor) => {
    setForm((actual) => {
      if (campo === 'hora_inicio' && actual.hora_fin <= valor) {
        const siguienteFin = [...new Set(PERIODOS_UTECAN.map((periodo) => periodo.fin))].find((fin) => fin > valor);
        return { ...actual, hora_inicio: valor, hora_fin: siguienteFin || actual.hora_fin };
      }
      return { ...actual, [campo]: valor };
    });
    if (campo === 'materia_id') {
      const materia = catalogos.materias.find((m) => String(m.id) === String(valor));
      if (materia) setForm((actual) => ({ ...actual, materia_id: valor, actividad_nombre: materia.nombre }));
    }
    if (campo === 'tipo_actividad' && valor === 'TUTORIA') {
      const grupos = catalogos.grupos_tutorados || [];
      setForm((actual) => ({ ...actual, tipo_actividad: valor, grupo_academico_id: '', materia_id: '', grupo_tutorado_id: grupos.length === 1 ? grupos[0].id : '', actividad_nombre: grupos.length === 1 ? `Tutoría grupal · ${grupos[0].cuatrimestre}° ${grupos[0].grupo}` : 'Tutoría grupal' }));
    }
    if (campo === 'grupo_tutorado_id') {
      const grupo = (catalogos.grupos_tutorados || []).find((g) => String(g.id) === String(valor));
      if (grupo) setForm((actual) => ({ ...actual, grupo_tutorado_id: valor, actividad_nombre: `Tutoría grupal · ${grupo.cuatrimestre}° ${grupo.grupo}` }));
    }
    if (campo === 'laboratorio_id') {
      const lab = catalogos.laboratorios.find((l) => String(l.id) === String(valor));
      if (lab) setForm((actual) => ({ ...actual, laboratorio_id: valor, espacio_nombre: lab.nombre }));
    }
  };
  const seleccionarMateria = (materia) => {
    const compatibles = catalogos.grupos.filter((grupo) => (
      (!materia.carrera || normalizar(grupo.carrera) === normalizar(materia.carrera))
      && (materia.cuatrimestre_oficial == null
        || Number(grupo.cuatrimestre) === Number(materia.cuatrimestre_oficial))
    ));
    const disponibles = compatibles.filter((grupo) => {
      const asignacion = asignacionGrupo(grupo.id, materia.id);
      return !asignacion || asignacion.es_propia;
    });
    setForm((actual) => ({
      ...actual,
      materia_id: materia.id,
      actividad_nombre: materia.nombre,
      grupo_academico_id: disponibles.length === 1 ? disponibles[0].id : '',
    }));
    setMateriaBusqueda(materia.nombre);
    setBuscadorMateriaAbierto(false);
  };
  const duracion = (fin) => {
    const incluyeReceso = form.hora_inicio < '10:15' && fin > '09:45';
    const total = minutosDeHora(fin) - minutosDeHora(form.hora_inicio) - (incluyeReceso ? 30 : 0);
    const horas = Math.floor(total / 60);
    const minutos = total % 60;
    const tiempoClase = [horas ? `${horas} h` : '', minutos ? `${minutos} min` : ''].filter(Boolean).join(' ');
    return `${tiempoClase}${incluyeReceso ? ' de clase + receso' : ''}`;
  };

  useEffect(() => {
    if (!esClase || !form.laboratorio_id || !form.grupo_academico_id || !form.materia_id) {
      setDisponibilidadLab(null);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setVerificandoLab(true);
      try {
        const { data } = await api.post('/docencia/horario/verificar-laboratorio', crearPayload(), {
          params: actividad?.id ? { carga_id: actividad.id } : {},
        });
        setDisponibilidadLab(data);
      } catch {
        setDisponibilidadLab({ estado: 'ERROR' });
      } finally {
        setVerificandoLab(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    esClase, form.laboratorio_id, form.grupo_academico_id, form.materia_id,
    form.dia_semana, form.hora_inicio, form.hora_fin, periodoId, actividad?.id,
  ]);

  const guardar = async (evento, reservarLaboratorio = false) => {
    evento.preventDefault();
    if (esClase && !form.materia_id) {
      setError('Selecciona una materia de los resultados de búsqueda.');
      return;
    }
    setGuardando(true);
    setError('');
    const payload = crearPayload();
    try {
      const { data } = actividad
        ? await api.put(`/docencia/horario/${actividad.id}`, payload)
        : await api.post('/docencia/horario', payload);
      const cargaGuardada = data.carga;
      if (reservarLaboratorio && cargaGuardada?.id) {
        await api.post(`/docencia/horario/${cargaGuardada.id}/reservar-laboratorio`);
      }
      onGuardada(data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : detail?.mensaje || 'No se pudo guardar o reservar la actividad.');
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
              <div className="relative text-sm text-slate-300">
                <label htmlFor="materia-busqueda">Materia *</label>
                <div className="relative mt-1">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/>
                  </svg>
                  <input
                    id="materia-busqueda"
                    required
                    className="input-dark input-with-leading-icon w-full"
                    value={materiaBusqueda}
                    onFocus={() => setBuscadorMateriaAbierto(true)}
                    onBlur={() => window.setTimeout(() => setBuscadorMateriaAbierto(false), 150)}
                    onChange={(e) => {
                      setMateriaBusqueda(e.target.value);
                      setForm((actual) => ({ ...actual, materia_id: '', grupo_academico_id: '', actividad_nombre: e.target.value }));
                      setBuscadorMateriaAbierto(true);
                    }}
                    placeholder="Escribe el nombre de la materia"
                    autoComplete="off"
                  />
                </div>
                {buscadorMateriaAbierto && (
                  <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl">
                    {materiasFiltradas.length ? materiasFiltradas.map((materia) => (
                      <button key={materia.id} type="button" onMouseDown={() => seleccionarMateria(materia)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/10">
                        <span className="block font-medium text-white">{materia.nombre}</span>
                        <span className="block text-xs text-slate-400">{materia.carrera || 'Materia común'}</span>
                      </button>
                    )) : (
                      <p className="px-3 py-4 text-center text-xs text-slate-400">No se encontraron materias.</p>
                    )}
                  </div>
                )}
                {form.materia_id && (
                  <p className="mt-1.5 text-xs text-emerald-400">✓ Materia seleccionada{materiaSeleccionada?.carrera ? ` para ${materiaSeleccionada.carrera}` : ''}</p>
                )}
              </div>
              <label className="text-sm text-slate-300">Grupo *
                <select required disabled={!form.materia_id || !gruposCompatibles.length} className="input-dark mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60" value={form.grupo_academico_id} onChange={(e) => cambiar('grupo_academico_id', e.target.value)}>
                  <option value="">{!form.materia_id ? 'Selecciona primero una materia' : !gruposCompatibles.length ? 'No hay grupos compatibles' : 'Selecciona un grupo'}</option>
                  {gruposCompatibles.map((g) => {
                    const asignacion = asignacionGrupo(g.id);
                    const ocupada = asignacion && !asignacion.es_propia;
                    return <option key={g.id} value={g.id} disabled={ocupada}>{g.label} · {ocupada ? `Asignada a ${asignacion.docente}` : asignacion?.es_propia ? 'Tu materia' : `${g.total_alumnos} alumno${g.total_alumnos === 1 ? '' : 's'}`}</option>;
                  })}
                </select>
                {form.materia_id && grupoSeleccionado && gruposCompatibles.filter((g) => { const a = asignacionGrupo(g.id); return !a || a.es_propia; }).length === 1 && <span className="mt-1 block text-xs text-emerald-400">✓ Grupo disponible asignado automáticamente</span>}
                {form.materia_id && !gruposCompatibles.length && <span className="mt-1 block text-xs text-amber-400">No existe un grupo activo para la carrera y cuatrimestre de esta materia.</span>}
                {form.materia_id && gruposCompatibles.length > 0 && gruposCompatibles.every((g) => { const a = asignacionGrupo(g.id); return a && !a.es_propia; }) && <span className="mt-1 block text-xs text-amber-400">Todos los grupos compatibles ya fueron asignados a otros docentes.</span>}
              </label>
            </>
          )}
          {esTutoria && (
            <div className="sm:col-span-2">
              <label className="text-sm text-slate-300">Grupo tutorado asignado *
                <select required className="input-dark mt-1 w-full" value={form.grupo_tutorado_id} onChange={(e) => cambiar('grupo_tutorado_id', e.target.value)}>
                  <option value="">{(catalogos.grupos_tutorados || []).length ? 'Selecciona tu grupo tutorado' : 'No tienes grupos tutorados asignados'}</option>
                  {(catalogos.grupos_tutorados || []).map((grupo) => <option key={grupo.id} value={grupo.id}>{grupo.label}</option>)}
                </select>
              </label>
              {!(catalogos.grupos_tutorados || []).length && <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">Solicita al Responsable de Tutoría que te asigne un grupo antes de agregar este bloque.</p>}
              {(catalogos.grupos_tutorados || []).length === 1 && <p className="mt-1.5 text-xs text-emerald-400">✓ Tu grupo tutorado fue seleccionado automáticamente.</p>}
            </div>
          )}
          <label className={`text-sm text-slate-300 ${esClase ? 'sm:col-span-2' : ''}`}>Nombre de la actividad *
            <input required readOnly={esTutoria} className="input-dark mt-1 w-full read-only:opacity-70" value={form.actividad_nombre} onChange={(e) => cambiar('actividad_nombre', e.target.value)} placeholder={esClase ? 'Nombre de la materia' : 'Ej. Tutoría grupal'} />
          </label>
          <label className="text-sm text-slate-300">Hora de inicio
            <input required readOnly={Boolean(preseleccion)} type="time" className="input-dark mt-1 w-full read-only:opacity-70" value={form.hora_inicio} onChange={(e) => cambiar('hora_inicio', e.target.value)} />
          </label>
          <label className="text-sm text-slate-300">Hora de fin y duración
            <select required className="input-dark mt-1 w-full" value={form.hora_fin} onChange={(e) => cambiar('hora_fin', e.target.value)}>
              {finalesDisponibles.map((fin) => <option key={fin} value={fin}>{fin} · {duracion(fin)}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">Puedes extender la clase por varios periodos.</span>
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
          {form.laboratorio_id && esClase && (
            <div className="sm:col-span-2">
              <div className={`rounded-xl border p-4 ${
                disponibilidadLab?.estado === 'DISPONIBLE' ? 'border-emerald-500/30 bg-emerald-500/10'
                  : disponibilidadLab?.estado === 'RESERVADO' ? 'border-blue-500/30 bg-blue-500/10'
                    : 'border-amber-500/30 bg-amber-500/10'
              }`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {verificandoLab ? 'Verificando disponibilidad…' : ({
                        DISPONIBLE: 'Laboratorio disponible en todo el horario',
                        RESERVADO: 'Laboratorio reservado para esta clase',
                        OCUPADO: 'El laboratorio está ocupado',
                        SOLICITADO: 'Ya solicitaste uno de estos periodos',
                        BLOQUEADO: 'El laboratorio tiene un bloqueo institucional',
                        SIN_HORARIOS: 'El laboratorio no tiene horarios configurados',
                        COBERTURA_INCOMPLETA: 'No hay cobertura para todo el horario',
                        ERROR: 'No se pudo verificar la disponibilidad',
                      }[disponibilidadLab?.estado] || 'Selecciona materia y grupo para verificar')}
                    </p>
                    {disponibilidadLab?.ocupaciones?.map((ocupacion, indice) => (
                      <p key={`${ocupacion.hora}-${indice}`} className="mt-1 text-xs text-slate-400">
                        {ocupacion.hora} · {ocupacion.materia || ocupacion.motivo}
                        {ocupacion.docente ? ` · ${ocupacion.docente}` : ''}
                        {ocupacion.grupo ? ` · ${ocupacion.grupo}` : ''}
                      </p>
                    ))}
                  </div>
                  {['OCUPADO', 'SOLICITADO', 'BLOQUEADO'].includes(disponibilidadLab?.estado) && (
                    <button
                      type="button"
                      onClick={() => navigate(`/docente/laboratorio?lab=${form.laboratorio_id}&cuatrimestre=${encodeURIComponent(catalogos.periodos.find((p) => String(p.id) === String(periodoId))?.clave?.replace(' ', '-') || '')}&dia=${form.dia_semana}&inicio=${form.hora_inicio}`)}
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"
                    >
                      Ver en panel de laboratorio
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <label className="text-sm text-slate-300 sm:col-span-2">Observaciones
            <textarea className="input-dark mt-1 min-h-20 w-full" value={form.observaciones || ''} onChange={(e) => cambiar('observaciones', e.target.value)} />
          </label>
          {error && <div className="sm:col-span-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-white/5 px-5 py-2.5 text-sm text-slate-300">Cancelar</button>
          <button disabled={guardando} className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-slate-200 disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar borrador'}
          </button>
          {form.laboratorio_id && disponibilidadLab?.estado === 'DISPONIBLE' && (
            <button type="button" disabled={guardando || verificandoLab} onClick={(e) => guardar(e, true)} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              Guardar y reservar laboratorio
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default function MiHorarioDocente() {
  const navigate = useNavigate();
  const { periodo: periodoGlobal, cargando: cargandoPeriodoGlobal } = usePeriodo();
  const [catalogos, setCatalogos] = useState({ periodos: [], grupos: [], materias: [], laboratorios: [], espacios: [] });
  const [periodoId, setPeriodoId] = useState('');
  const [horario, setHorario] = useState([]);
  const [hoy, setHoy] = useState([]);
  const [recordatorios, setRecordatorios] = useState({});
  const [cierre, setCierre] = useState(null);
  const [cargaAConfirmar, setCargaAConfirmar] = useState(null);
  const [observacionesCierre, setObservacionesCierre] = useState('');
  const [confirmandoCarga, setConfirmandoCarga] = useState(false);
  const [mostrarSesionesCierre, setMostrarSesionesCierre] = useState(false);
  const [modal, setModal] = useState(null);
  const [actividadARetirar, setActividadARetirar] = useState(null);
  const [retirando, setRetirando] = useState(false);
  const [extemporaneas, setExtemporaneas] = useState([]);
  const [reposicionesPendientes, setReposicionesPendientes] = useState([]);
  const [modalExtemporanea, setModalExtemporanea] = useState(null);
  const [motivoExtemporaneo, setMotivoExtemporaneo] = useState('');
  const [resolucionPendiente, setResolucionPendiente] = useState('IMPARTIDA');
  const [programarAlDeclarar, setProgramarAlDeclarar] = useState(false);
  const [creandoExtemporanea, setCreandoExtemporanea] = useState(false);
  const [agendaAbierta, setAgendaAbierta] = useState(false);
  const [modalReposicion, setModalReposicion] = useState(null);
  const [formReposicion, setFormReposicion] = useState({ fecha_original: '', fecha: '', hora_inicio: '', hora_fin: '', motivo: '', tema: '' });
  const [guardandoReposicion, setGuardandoReposicion] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState(() => new Date());
  const [diaMovil, setDiaMovil] = useState(() => {
    const dia = (new Date().getDay() + 6) % 7;
    return dia <= 5 ? dia : 0;
  });

  const cargar = useCallback(async (idPeriodo) => {
    setCargando(true);
    try {
      const { data: cats } = await api.get('/docencia/catalogos', { params: idPeriodo ? { periodo_id: idPeriodo } : {} });
      const elegido = idPeriodo || cats.periodo_sugerido_id;
      setCatalogos(cats);
      setPeriodoId(String(elegido || ''));
      const [horarioRes, hoyRes, extemporaneasRes, reposicionesRes, cierreRes, historialRes] = await Promise.all([
        api.get('/docencia/horario', { params: elegido ? { periodo_id: elegido } : {} }),
        api.get('/docencia/hoy'),
        api.get('/docencia/capturas-extemporaneas/disponibles'),
        api.get('/docencia/reposiciones/pendientes'),
        api.get('/cierre-academico', { params: { periodo_id: elegido } }),
        api.get('/docencia/historial'),
      ]);
      setHorario(horarioRes.data);
      const periodoElegido = cats.periodos.find((p) => String(p.id) === String(elegido));
      setHoy(periodoElegido?.es_actual ? hoyRes.data : []);
      setExtemporaneas(periodoElegido?.es_actual ? extemporaneasRes.data : []);
      setReposicionesPendientes(periodoElegido?.es_actual ? reposicionesRes.data : []);
      setCierre(cierreRes.data);
      const fechaLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
      const ultimos = historialRes.data
        .filter((clase) => clase.estado === 'CERRADA' && clase.fecha < fechaLocal && (clase.bitacora?.tarea_asignada?.trim() || clase.bitacora?.tema_pendiente?.trim()))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .reduce((acc, clase) => {
          if (!acc[clase.carga.id]) acc[clase.carga.id] = clase;
          return acc;
        }, {});
      setRecordatorios(ultimos);
    } catch {
      setMensaje('No se pudo cargar el módulo docente.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!cargandoPeriodoGlobal) cargar(periodoGlobal?.id);
  }, [cargar, cargandoPeriodoGlobal, periodoGlobal?.id]);
  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(new Date()), 60000);
    return () => window.clearInterval(intervalo);
  }, []);
  const actividadEnPeriodo = (dia, periodo) => horario.find((item) => (
    item.dia_semana === dia
    && item.hora_inicio < periodo.fin
    && item.hora_fin > periodo.inicio
  ));
  const periodoSeleccionado = catalogos.periodos.find((p) => String(p.id) === String(periodoId));
  const esPeriodoActual = Boolean(periodoSeleccionado?.es_actual);
  const abrirConfirmacionCarga = (carga) => {
    setCargaAConfirmar(carga);
    setObservacionesCierre('');
    setMostrarSesionesCierre(false);
  };
  const confirmarCarga = async (e) => {
    e.preventDefault();
    if (!cargaAConfirmar || confirmandoCarga) return;
    setConfirmandoCarga(true);
    try {
      await api.post(`/cierre-academico/cargas/${cargaAConfirmar.carga_id}/confirmar`, {
        observaciones: observacionesCierre.trim() || null,
      });
      setMensaje(`${cargaAConfirmar.materia} quedó confirmada para el cierre del cuatrimestre.`);
      setCargaAConfirmar(null);
      setObservacionesCierre('');
      await cargar(periodoId);
    } catch (err) { setMensaje(err.response?.data?.detail || 'No se pudo confirmar la materia.'); }
    finally { setConfirmandoCarga(false); }
  };

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
  const eliminar = async () => {
    if (!actividadARetirar || retirando) return;
    setRetirando(true);
    try {
      await api.delete(`/docencia/horario/${actividadARetirar.id}`);
      setActividadARetirar(null);
      setMensaje('La actividad se retiró correctamente del horario.');
      cargar(periodoId);
    } catch (err) {
      setMensaje(err.response?.data?.detail || 'No se pudo retirar la actividad.');
    } finally {
      setRetirando(false);
    }
  };
  const iniciar = async (item) => {
    try {
      const clase = item.clase_id
        ? { id: item.clase_id }
        : (await api.post(`/docencia/horario/${item.id}/iniciar`)).data;
      if (item.laboratorio_id && item.estado_reserva_laboratorio === 'RESERVADO' && item.reservacion_laboratorio_id) {
        const [horaInicio, minutoInicio] = item.hora_inicio.split(':').map(Number);
        const [horaFin, minutoFin] = item.hora_fin.split(':').map(Number);
        const duracion = Math.max(15, Math.min(300, ((horaFin * 60) + minutoFin) - ((horaInicio * 60) + minutoInicio)));
        const { data: sesion } = await api.post('/sesiones', {
          laboratorio_id: item.laboratorio_id,
          reservacion_id: item.reservacion_laboratorio_id,
          fin_estimado_min: duracion,
        });
        navigate(`/docente/sesion/${sesion.id}`, { state: { claseDocenteId: clase.id } });
        return;
      }
      navigate(`/docente/clase/${clase.id}`);
    } catch (err) {
      setMensaje(err.response?.data?.detail || 'No se pudo iniciar la clase.');
    }
  };
  const abrirReposicion = (pendiente = reposicionesPendientes[0]) => {
    if (!pendiente) return;
    setModalReposicion(pendiente);
    setFormReposicion({ fecha_original: pendiente.fecha_original, fecha: '', hora_inicio: pendiente.hora_inicio, hora_fin: pendiente.hora_fin, motivo: pendiente.motivo || '', tema: pendiente.tema || '' });
  };
  const guardarReposicion = async (e) => {
    e.preventDefault();
    if (guardandoReposicion) return;
    setGuardandoReposicion(true);
    try {
      await api.post(`/docencia/horario/${modalReposicion.carga_id}/reposiciones`, formReposicion);
      setModalReposicion(null);
      setMensaje('Reposición programada como evento único; el horario oficial no fue modificado.');
      await cargar(periodoId);
    } catch (err) { setMensaje(err.response?.data?.detail || 'No se pudo programar la reposición.'); }
    finally { setGuardandoReposicion(false); }
  };
  const crearExtemporanea = async (e) => {
    e.preventDefault();
    if (!modalExtemporanea || motivoExtemporaneo.trim().length < 5) return;
    setCreandoExtemporanea(true);
    try {
      const { data } = await api.post(
        `/docencia/horario/${modalExtemporanea.carga_id}/captura-extemporanea`,
        { fecha: modalExtemporanea.fecha, motivo: motivoExtemporaneo.trim() },
      );
      setModalExtemporanea(null);
      setMotivoExtemporaneo('');
      navigate(`/docente/clase/${data.id}`);
    } catch (err) {
      setMensaje(err.response?.data?.detail || 'No se pudo abrir la captura extemporánea.');
    } finally {
      setCreandoExtemporanea(false);
    }
  };
  const resolverClasePendiente = async (e) => {
    if (resolucionPendiente === 'IMPARTIDA') return crearExtemporanea(e);
    e.preventDefault();
    if (!modalExtemporanea || motivoExtemporaneo.trim().length < 5) return;
    setCreandoExtemporanea(true);
    try {
      const { data } = await api.post(
        `/docencia/horario/${modalExtemporanea.carga_id}/no-impartida`,
        {
          fecha: modalExtemporanea.fecha,
          motivo: motivoExtemporaneo.trim(),
          programar_reposicion: programarAlDeclarar,
          fecha_reposicion: programarAlDeclarar ? formReposicion.fecha : null,
          hora_inicio: programarAlDeclarar ? formReposicion.hora_inicio : null,
          hora_fin: programarAlDeclarar ? formReposicion.hora_fin : null,
          tema: programarAlDeclarar ? formReposicion.tema || null : null,
        },
      );
      setModalExtemporanea(null);
      setMotivoExtemporaneo('');
      setResolucionPendiente('IMPARTIDA');
      setProgramarAlDeclarar(false);
      setMensaje(data.mensaje);
      await cargar(periodoId);
    } catch (err) {
      setMensaje(err.response?.data?.detail || 'No se pudo registrar lo ocurrido con la clase.');
    } finally {
      setCreandoExtemporanea(false);
    }
  };
  const minutoActual = (ahora.getHours() * 60) + ahora.getMinutes();
  const agendaHoy = hoy.map((item) => ({ ...item, estadoDia: estadoActividad(item, minutoActual) }));
  const actividadPrincipal = (
    agendaHoy.find((item) => item.estadoDia === 'EN_CURSO')
    || agendaHoy.find((item) => item.estadoDia === 'ACTUAL')
    || agendaHoy.find((item) => item.estadoDia === 'PROXIMA')
    || agendaHoy.at(-1)
  );
  const estadoPrincipal = actividadPrincipal?.estadoDia;
  const puedeIniciarPrincipal = actividadPrincipal
    ? puedeIniciarActividad(actividadPrincipal, minutoActual)
    : false;
  const tituloPrincipal = estadoPrincipal === 'EN_CURSO'
    ? 'Clase en curso'
    : estadoPrincipal === 'NO_LECTIVA'
      ? 'Actividad no exigible hoy'
    : estadoPrincipal === 'ACTUAL'
      ? 'Tu actividad actual'
      : estadoPrincipal === 'PROXIMA'
        ? 'Tu siguiente actividad'
        : 'Última actividad de hoy';
  const textoAccionClase = (item) => (
    item.clase_estado === 'CERRADA'
      ? 'Ver o corregir asistencia'
      : item.clase_id
        ? 'Continuar clase'
        : item.estado_reserva_laboratorio === 'RESERVADO'
          ? 'Registrar asistencia en laboratorio'
          : 'Registrar asistencia'
  );
  const abrirClase = async (item) => {
    if (item.es_reposicion && item.clase_estado === 'PROGRAMADA') {
      try {
        const { data } = await api.post(`/docencia/reposiciones/${item.clase_id}/iniciar`);
        navigate(`/docente/clase/${data.id}`);
      } catch (err) { setMensaje(err.response?.data?.detail || 'No se pudo iniciar la reposición.'); }
    } else if (item.clase_estado === 'CERRADA') navigate(`/docente/clase/${item.clase_id}`);
    else iniciar(item);
  };
  const esNoLectiva = (item) => item?.estadoDia === 'NO_LECTIVA';
  const recordatorioPrincipal = actividadPrincipal ? recordatorios[actividadPrincipal.id] : null;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Agenda y horario docente</h1>
            <p className="hidden text-sm text-slate-400 sm:block">Opera tus clases del día y administra por separado el horario oficial recurrente.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {esPeriodoActual && extemporaneas.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const pendiente = extemporaneas[0];
                  setModalExtemporanea(pendiente);
                  setMotivoExtemporaneo('');
                  setResolucionPendiente('IMPARTIDA');
                  setProgramarAlDeclarar(false);
                  setFormReposicion({ fecha_original: pendiente.fecha, fecha: '', hora_inicio: pendiente.hora_inicio, hora_fin: pendiente.hora_fin, motivo: '', tema: '' });
                }}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-300"
              >
                Clases pendientes ({extemporaneas.length})
              </button>
            )}
            {esPeriodoActual && reposicionesPendientes.length > 0 && <button type="button" onClick={() => abrirReposicion()} className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-300">Programar reposición ({reposicionesPendientes.length})</button>}
          </div>
        </div>

        {mensaje && <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">{mensaje}</div>}
        {cierre && cierre.estado !== 'ACTIVO' && (
          <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-300">Cierre del cuatrimestre · {cierre.estado}</p><h2 className="mt-1 font-semibold text-white">Revisa y confirma cada materia</h2><p className="mt-1 text-xs text-slate-400">{cierre.estado === 'CONFIRMACION' ? `Ventana vigente: ${cierre.confirmacion_inicio} al ${cierre.confirmacion_fin}.` : cierre.estado === 'CERRADO' ? 'El periodo está cerrado y disponible solo para consulta.' : 'Completa las clases abiertas antes de la confirmación.'}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{cierre.confirmadas}/{cierre.total_cargas} confirmadas</span></div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">{cierre.cargas.map(c => <div key={c.carga_id} className="rounded-xl border border-white/10 bg-black/10 p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold text-white">{c.materia}</p><p className="text-xs text-slate-400">{c.grupo} · {c.resumen.clases_cerradas}/{c.resumen.clases_registradas} clases cerradas</p></div><span className="text-[10px] font-bold text-amber-300">{c.estado.replaceAll('_',' ')}</span></div>{(cierre.estado === 'CONFIRMACION' || c.estado === 'REABIERTA') && c.estado !== 'CONFIRMADA_DOCENTE' && <button onClick={() => abrirConfirmacionCarga(c)} className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-white ${c.resumen.puede_confirmar ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>{c.resumen.puede_confirmar ? 'Revisar y confirmar' : c.resumen.motivo_bloqueo === 'SIN_CLASES_REGISTRADAS' ? 'Revisar: sin clases registradas' : `Revisar ${c.resumen.clases_abiertas} pendiente(s)`}</button>}{c.estado === 'REABIERTA' && <p className="mt-2 text-xs text-blue-300">Reabierta hasta {new Date(`${c.reabierta_hasta}Z`).toLocaleString('es-MX')}</p>}</div>)}</div>
          </section>
        )}
        {!esPeriodoActual && periodoSeleccionado && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Estás consultando {periodoSeleccionado.clave}. Este horario es histórico: puedes revisarlo, pero no editarlo ni iniciar clases.
          </div>
        )}
        {esPeriodoActual && !horario.length && !cargando && (
          <div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.08] px-4 py-3">
            <p className="font-semibold text-blue-200">Horario de {periodoSeleccionado?.clave} sin actividades</p>
            <p className="mt-1 text-sm text-slate-300">Configura únicamente las materias, grupos y actividades asignadas para este cuatrimestre. Los horarios de periodos anteriores permanecen disponibles solo para consulta.</p>
          </div>
        )}

        {esPeriodoActual && actividadPrincipal && (
          <section className="glass overflow-hidden rounded-2xl">
            <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-5">
              <div className="flex min-w-0 items-start gap-4">
                <div className={`hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:flex ${esNoLectiva(actividadPrincipal) ? 'bg-slate-500/15 text-slate-400' : 'bg-emerald-500/15 text-emerald-300'}`}>
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-bold uppercase tracking-wider ${esNoLectiva(actividadPrincipal) ? 'text-slate-400' : 'text-emerald-400'}`}>{tituloPrincipal}</p>
                  <h2 className="mt-1 text-lg font-bold text-white sm:truncate sm:text-xl">{actividadPrincipal.actividad_nombre}</h2>
                  <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                    {actividadPrincipal.hora_inicio}–{actividadPrincipal.hora_fin}
                    {' · '}{actividadPrincipal.grupo || actividadPrincipal.tipo_actividad}
                    {' · '}{actividadPrincipal.espacio_nombre || 'Espacio sin especificar'}
                  </p>
                  {esNoLectiva(actividadPrincipal) && (
                    <p className="mt-2 text-sm font-semibold text-slate-300">
                      {actividadPrincipal.calendario?.motivo} · No se requiere registrar clase ni asistencia.
                    </p>
                  )}
                  {!esNoLectiva(actividadPrincipal) && recordatorioPrincipal && (
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      {recordatorioPrincipal.bitacora?.tarea_asignada?.trim() && (
                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.07] px-3 py-2 text-blue-100">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-300">Trabajo asignado en la clase anterior</span>
                          <span className="mt-1 block">{recordatorioPrincipal.bitacora.tarea_asignada}</span>
                        </div>
                      )}
                      {recordatorioPrincipal.bitacora?.tema_pendiente?.trim() && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 text-amber-100">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300">Tema para retomar</span>
                          <span className="mt-1 block">{recordatorioPrincipal.bitacora.tema_pendiente}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actividadPrincipal.tipo_actividad === 'CLASE' && !esNoLectiva(actividadPrincipal) && (
                  <button
                    onClick={() => abrirClase(actividadPrincipal)}
                    disabled={!puedeIniciarPrincipal}
                    title={!puedeIniciarPrincipal ? 'La clase puede iniciarse desde 15 minutos antes de su horario.' : ''}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {puedeIniciarPrincipal ? textoAccionClase(actividadPrincipal) : textoVentanaInicio(actividadPrincipal)}
                  </button>
                )}
                {actividadPrincipal.tipo_actividad === 'TUTORIA' && actividadPrincipal.grupo_tutorado_id && (
                  <button onClick={() => navigate(`/docente/mis-tutorados?grupo=${actividadPrincipal.grupo_tutorado_id}&accion=sesion`)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Iniciar tutoría</button>
                )}
                {esNoLectiva(actividadPrincipal) && (
                  <button onClick={() => navigate('/calendario-academico')} className="rounded-xl border border-slate-500/30 bg-slate-500/10 px-4 py-2.5 text-sm font-semibold text-slate-300">
                    Ver calendario oficial
                  </button>
                )}
                <button onClick={() => setAgendaAbierta(true)} className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 sm:flex-none">
                  Ver agenda de hoy ({hoy.length})
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Configuración del cuatrimestre</p><h2 className="mt-1 text-lg font-bold text-white">Horario oficial recurrente</h2><p className="mt-1 text-sm text-slate-400">Los bloques de esta cuadrícula se repiten cada semana. Para recuperar una clase en una sola fecha usa “Programar reposición”.</p></div>
        </section>
        <section className="space-y-3 md:hidden">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {DIAS.map((dia, indice) => (
              <button
                key={dia}
                type="button"
                onClick={() => setDiaMovil(indice)}
                className={`min-w-[62px] shrink-0 rounded-xl border px-3 py-2 text-center transition ${
                  diaMovil === indice
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                    : 'border-white/10 bg-white/[0.03] text-slate-400'
                }`}
              >
                <span className="block text-[10px] font-bold uppercase">{dia.slice(0, 2)}</span>
                <span className="block text-xs">{dia}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {PERIODOS_UTECAN.map((periodo) => {
              const item = actividadEnPeriodo(diaMovil, periodo);
              const comienzaAqui = item?.hora_inicio === periodo.inicio;
              if (item && !comienzaAqui) return null;
              return (
                <Fragment key={periodo.numero}>
                  {periodo.recesoAntes && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-400">
                      Receso · 09:45–10:15
                    </div>
                  )}
                  {item ? (
                    <article className={`rounded-2xl border p-4 ${TIPO_ESTILO[item.tipo_actividad]}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-bold text-emerald-400">{item.hora_inicio}–{item.hora_fin}</p>
                          <h3 className="mt-1 font-semibold text-white">{item.actividad_nombre}</h3>
                          <p className="mt-0.5 text-xs text-slate-400">{item.grupo || item.tipo_actividad} · {item.espacio_nombre || 'Sin salón'}</p>
                          {item.laboratorio_id && <p className={`mt-1 text-xs font-semibold ${item.estado_reserva_laboratorio === 'RESERVADO' ? 'text-blue-400' : item.estado_reserva_laboratorio === 'EN_DISPUTA' ? 'text-amber-400' : 'text-red-400'}`}>{item.estado_reserva_laboratorio === 'RESERVADO' ? 'Laboratorio reservado' : item.estado_reserva_laboratorio === 'EN_DISPUTA' ? 'Laboratorio en disputa' : 'Laboratorio sin reservar'}</p>}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${item.estado === 'ACTIVO' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{item.estado}</span>
                      </div>
                      {esPeriodoActual && <div className="mt-4 grid grid-cols-2 gap-2">
                        {item.estado !== 'ACTIVO' && <button onClick={() => activar(item.id)} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white">Activar</button>}
                        <button onClick={() => setModal({ tipo: 'editar', actividad: item })} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-slate-300">Editar</button>
                        <button onClick={() => setActividadARetirar(item)} className="rounded-xl border border-red-500/20 px-3 py-2.5 text-xs font-semibold text-red-400">Retirar</button>
                      </div>}
                    </article>
                  ) : (
                    <button
                      type="button"
                      disabled={cargando || !esPeriodoActual}
                      onClick={() => setModal({ tipo: 'nuevo', preseleccion: { dia_semana: diaMovil, hora_inicio: periodo.inicio, hora_fin: periodo.fin } })}
                      className="flex w-full items-center justify-between rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/[0.04] px-4 py-4 text-left"
                    >
                      <span><b className="block font-mono text-sm text-emerald-400">{periodo.inicio}–{periodo.fin}</b><small className="text-slate-500">Horario disponible</small></span>
                      <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400">+ Asignar</span>
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
        </section>

        <div className="glass hidden overflow-x-auto rounded-2xl md:block">
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
                                {item.laboratorio_id && <p className={`mt-1 text-[10px] font-semibold ${item.estado_reserva_laboratorio === 'RESERVADO' ? 'text-blue-300' : item.estado_reserva_laboratorio === 'EN_DISPUTA' ? 'text-amber-300' : 'text-red-300'}`}>{item.estado_reserva_laboratorio === 'RESERVADO' ? 'Lab reservado' : item.estado_reserva_laboratorio === 'EN_DISPUTA' ? 'Lab en disputa' : 'Lab sin reservar'}</p>}
                                {esPeriodoActual && <div className="mt-2 flex gap-2 text-[11px]">
                                  {item.estado !== 'ACTIVO' && <button onClick={() => activar(item.id)} className="text-emerald-300">Activar</button>}
                                  <button onClick={() => setModal({ tipo: 'editar', actividad: item })} className="text-blue-300">Editar</button>
                                  <button onClick={() => setActividadARetirar(item)} className="text-red-300">Retirar</button>
                                </div>}
                              </article>
                            ) : (
                              <div className={`flex min-h-24 flex-col justify-center rounded-xl border border-dashed p-3 ${TIPO_ESTILO[item.tipo_actividad]}`}>
                                <p className={`text-[10px] font-bold uppercase tracking-wide ${TIPO_TEXTO[item.tipo_actividad]}`}>↳ Continúa</p>
                                <p className="mt-1 line-clamp-2 text-xs font-semibold text-white">{item.actividad_nombre}</p>
                                <p className="mt-1 font-mono text-[10px] text-slate-400">{periodo.inicio}–{periodo.fin}</p>
                                <p className="truncate text-[10px] text-slate-500">{item.grupo || item.tipo_actividad}</p>
                              </div>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled={cargando || !esPeriodoActual}
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
      {agendaAbierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setAgendaAbierta(false)}>
          <section onMouseDown={(e) => e.stopPropagation()} className="glass max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl">
            <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-white">Agenda de hoy</h2>
                <p className="text-sm text-slate-400">{hoy.length} {hoy.length === 1 ? 'actividad programada' : 'actividades programadas'}</p>
              </div>
              <button onClick={() => setAgendaAbierta(false)} className="text-2xl text-slate-400 hover:text-white" aria-label="Cerrar agenda">×</button>
            </header>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              <ol className="space-y-2">
                {agendaHoy.map((item) => {
                  const destacada = item.id === actividadPrincipal.id;
                  const puedeIniciarItem = puedeIniciarActividad(item, minutoActual);
                  const etiqueta = {
                    FINALIZADA: 'Finalizada',
                    EN_CURSO: 'En curso',
                    ACTUAL: 'Ahora',
                    PROXIMA: 'Próxima',
                    PENDIENTE: 'Pendiente',
                    NO_LECTIVA: item.calendario?.motivo || 'No lectiva',
                  }[item.estadoDia];
                  return (
                    <li key={item.id} className={`rounded-xl border p-4 ${esNoLectiva(item) ? 'border-slate-500/30 bg-slate-500/[0.07]' : destacada ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <div className="w-24 shrink-0">
                            <p className="font-mono text-sm font-bold text-white">{item.hora_inicio}</p>
                            <p className="font-mono text-xs text-slate-500">{item.hora_fin}</p>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-white">{item.actividad_nombre}</p>
                              {item.es_reposicion && <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300">REPOSICIÓN</span>}
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${esNoLectiva(item) ? 'bg-slate-500/20 text-slate-300' : destacada ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-slate-400'}`}>{etiqueta}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-400">{item.grupo || item.tipo_actividad} · {item.espacio_nombre || 'Sin espacio'}</p>
                            {esNoLectiva(item) && <p className="mt-1 text-xs font-medium text-slate-400">No requiere clase ni asistencia.</p>}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                          {item.tipo_actividad === 'CLASE' && !esNoLectiva(item) && (
                            <button
                              onClick={() => abrirClase(item)}
                              disabled={!puedeIniciarItem}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                            >
                              {puedeIniciarItem
                                ? textoAccionClase(item)
                                : item.estadoDia === 'PROXIMA'
                                  ? textoVentanaInicio(item)
                                  : 'Ventana de inicio finalizada'}
                            </button>
                          )}
                          {item.tipo_actividad === 'TUTORIA' && item.grupo_tutorado_id && <button onClick={() => navigate(`/docente/mis-tutorados?grupo=${item.grupo_tutorado_id}&accion=sesion`)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Iniciar tutoría</button>}
                          {esNoLectiva(item) && (
                            <button onClick={() => navigate('/calendario-academico')} className="rounded-lg border border-slate-500/30 px-3 py-2 text-xs font-semibold text-slate-300">
                              Ver calendario
                            </button>
                          )}
                          <button onClick={() => { setAgendaAbierta(false); setModal({ tipo: 'editar', actividad: item }); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">
                            Editar bloque
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        </div>
      )}
      {modalReposicion && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => !guardandoReposicion && setModalReposicion(null)}>
          <form onSubmit={guardarReposicion} onMouseDown={(e) => e.stopPropagation()} className="glass w-full max-w-lg overflow-hidden rounded-2xl border border-blue-500/20 shadow-2xl">
            <header className="flex items-start justify-between border-b border-white/10 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-300">Evento de una sola fecha</p><h2 className="mt-1 text-lg font-bold text-white">Programar reposición</h2><p className="mt-1 text-sm text-slate-400">No modifica el horario oficial recurrente.</p></div><button type="button" onClick={() => setModalReposicion(null)} className="text-2xl text-slate-400">×</button></header>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="text-sm text-slate-300 sm:col-span-2">Clase no impartida pendiente<select className="input-dark mt-1.5" value={modalReposicion.clase_id} onChange={(e) => abrirReposicion(reposicionesPendientes.find((item) => String(item.clase_id) === e.target.value))}>{reposicionesPendientes.map((item) => <option key={item.clase_id} value={item.clase_id}>{item.fecha_original} · {item.materia} · {item.grupo}</option>)}</select></label>
              <label className="text-sm text-slate-300">Fecha original no impartida<input readOnly type="date" value={formReposicion.fecha_original} className="input-dark mt-1.5 cursor-not-allowed opacity-70" /></label>
              <label className="text-sm text-slate-300">Fecha de reposición<input required type="date" min={new Date().toISOString().slice(0, 10)} value={formReposicion.fecha} onChange={(e) => setFormReposicion({ ...formReposicion, fecha: e.target.value })} className="input-dark mt-1.5" /></label>
              <label className="text-sm text-slate-300">Hora de inicio<input required type="time" value={formReposicion.hora_inicio} onChange={(e) => setFormReposicion({ ...formReposicion, hora_inicio: e.target.value })} className="input-dark mt-1.5" /></label>
              <label className="text-sm text-slate-300">Hora de fin<input required type="time" value={formReposicion.hora_fin} onChange={(e) => setFormReposicion({ ...formReposicion, hora_fin: e.target.value })} className="input-dark mt-1.5" /></label>
              <label className="text-sm text-slate-300 sm:col-span-2">Motivo *<textarea required minLength={5} rows={2} value={formReposicion.motivo} onChange={(e) => setFormReposicion({ ...formReposicion, motivo: e.target.value })} className="input-dark mt-1.5" placeholder="Explica por qué no se impartió la clase original" /></label>
              <label className="text-sm text-slate-300 sm:col-span-2">Tema a recuperar<input value={formReposicion.tema} onChange={(e) => setFormReposicion({ ...formReposicion, tema: e.target.value })} className="input-dark mt-1.5" placeholder="Tema completo, continuación o asesoría" /></label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4"><button type="button" onClick={() => setModalReposicion(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Cancelar</button><button disabled={guardandoReposicion} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{guardandoReposicion ? 'Programando…' : 'Programar una sola vez'}</button></footer>
          </form>
        </div>
      )}
      {cargaAConfirmar && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onMouseDown={() => !confirmandoCarga && setCargaAConfirmar(null)}
        >
          <form
            onSubmit={confirmarCarga}
            onMouseDown={(e) => e.stopPropagation()}
            className="glass max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-emerald-500/20 shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Cierre del cuatrimestre</p>
                <h2 className="mt-1 text-lg font-bold text-white">Confirmar información</h2>
                <p className="mt-1 text-sm text-slate-400">Verifica que la información de la materia sea definitiva.</p>
              </div>
              <button type="button" disabled={confirmandoCarga} onClick={() => setCargaAConfirmar(null)} className="text-2xl leading-none text-slate-400 hover:text-white">×</button>
            </header>
            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="font-semibold text-white">{cargaAConfirmar.materia}</p>
                <p className="mt-1 text-sm text-slate-400">{cargaAConfirmar.grupo}</p>
                {cargaAConfirmar.estado === 'REABIERTA' && <p className="mt-2 text-xs font-medium text-blue-300">Confirmarás nuevamente la información corregida.</p>}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-bold text-white">{cargaAConfirmar.resumen.clases_registradas}</p><p className="text-xs text-slate-400">Registradas</p></div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-3"><p className="text-xl font-bold text-emerald-300">{cargaAConfirmar.resumen.clases_cerradas}</p><p className="text-xs text-slate-400">Cerradas</p></div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-3"><p className="text-xl font-bold text-amber-300">{cargaAConfirmar.resumen.clases_abiertas}</p><p className="text-xs text-slate-400">Por cerrar</p></div>
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.07] p-3"><p className="text-xl font-bold text-blue-300">{cargaAConfirmar.resumen.incidencias_seguimiento}</p><p className="text-xs text-slate-400">Incidencias</p></div>
              </div>
              {(cargaAConfirmar.resumen.incidencias_seguimiento > 0 || cargaAConfirmar.resumen.reportes_tutoria_pendientes > 0) && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Revisa las excepciones antes de confirmar: {cargaAConfirmar.resumen.incidencias_seguimiento} incidencia(s) con seguimiento y {cargaAConfirmar.resumen.reportes_tutoria_pendientes} reporte(s) de tutoría pendiente(s).
                </div>
              )}
              {!cargaAConfirmar.resumen.clases_registradas && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">No puedes confirmar esta materia porque todavía no tiene clases registradas.</div>}
              <div className="rounded-xl border border-white/10">
                <button type="button" onClick={() => setMostrarSesionesCierre(!mostrarSesionesCierre)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-200 hover:bg-white/[0.04]">
                  <span>Revisar {cargaAConfirmar.resumen.clases_registradas} sesiones</span>
                  <span className="text-slate-500">{mostrarSesionesCierre ? 'Ocultar' : 'Mostrar'}</span>
                </button>
                {mostrarSesionesCierre && (
                  <div className="max-h-64 space-y-2 overflow-y-auto border-t border-white/10 p-3">
                    {[...(cargaAConfirmar.resumen.sesiones || [])].sort((a, b) => {
                      const problemaA = a.estado !== 'CERRADA' || a.incidencia_requiere_seguimiento;
                      const problemaB = b.estado !== 'CERRADA' || b.incidencia_requiere_seguimiento;
                      return Number(problemaB) - Number(problemaA) || b.fecha.localeCompare(a.fecha);
                    }).map((sesion) => (
                      <div key={sesion.id} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${sesion.estado !== 'CERRADA' || sesion.incidencia_requiere_seguimiento ? 'border-amber-500/25 bg-amber-500/[0.07]' : 'border-white/5 bg-black/10'}`}>
                        <div className="min-w-0"><p className="text-sm font-medium text-white">{new Date(`${sesion.fecha}T12:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</p><p className="truncate text-xs text-slate-500">{sesion.tema_impartido || 'Sin tema registrado'}{sesion.es_extemporanea ? ' · Extemporánea' : ''}</p></div>
                        <div className="shrink-0 text-right"><span className={`text-[10px] font-bold ${sesion.estado === 'CERRADA' ? 'text-emerald-300' : 'text-amber-300'}`}>{sesion.estado}</span>{sesion.incidencia_requiere_seguimiento && <p className="mt-1 text-[10px] text-amber-300">CON INCIDENCIA</p>}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label className="block text-sm text-slate-300">Observaciones finales <span className="text-slate-500">(opcional)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  autoFocus
                  value={observacionesCierre}
                  onChange={(e) => setObservacionesCierre(e.target.value)}
                  className="input-dark mt-1.5 resize-none"
                  placeholder="Agrega una nota final si es necesario"
                />
              </label>
              <p className="text-xs leading-5 text-slate-500">Al confirmar, la materia quedará lista para el cierre académico.</p>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" disabled={confirmandoCarga} onClick={() => setCargaAConfirmar(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50">Cancelar</button>
              <button disabled={confirmandoCarga || !cargaAConfirmar.resumen.puede_confirmar} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">{confirmandoCarga ? 'Confirmando…' : cargaAConfirmar.resumen.puede_confirmar ? 'Confirmar materia' : 'Resuelve los pendientes'}</button>
            </footer>
          </form>
        </div>
      )}
      {modalExtemporanea && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => !creandoExtemporanea && setModalExtemporanea(null)}>
          <form onSubmit={resolverClasePendiente} onMouseDown={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-amber-500/20 bg-slate-900 shadow-2xl">
            <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">Resolver clase pendiente</h2>
                <p className="mt-1 text-xs text-slate-400">Indica si la clase se impartió.</p>
              </div>
              <button type="button" disabled={creandoExtemporanea} onClick={() => setModalExtemporanea(null)} className="text-2xl text-slate-400">×</button>
            </header>
            <div className="space-y-4 p-5">
              <label className="block text-sm text-slate-300">Clase pendiente
                <select
                  value={`${modalExtemporanea.carga_id}|${modalExtemporanea.fecha}`}
                  onChange={(e) => {
                    const [cargaId, fecha] = e.target.value.split('|');
                    const pendiente = extemporaneas.find((item) => String(item.carga_id) === cargaId && item.fecha === fecha);
                    setModalExtemporanea(pendiente);
                    setFormReposicion({ fecha_original: pendiente.fecha, fecha: '', hora_inicio: pendiente.hora_inicio, hora_fin: pendiente.hora_fin, motivo: '', tema: '' });
                  }}
                  className="input-dark mt-1"
                >
                  {extemporaneas.map((item) => (
                    <option key={`${item.carga_id}-${item.fecha}`} value={`${item.carga_id}|${item.fecha}`}>
                      {item.fecha} · {item.hora_inicio} · {item.materia} · {item.grupo}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
                <p className="font-semibold text-white">{modalExtemporanea.materia}</p>
                <p className="mt-1 text-sm text-slate-300">{modalExtemporanea.fecha} · {modalExtemporanea.hora_inicio}–{modalExtemporanea.hora_fin} · {modalExtemporanea.grupo}</p>
                <p className="mt-1 text-xs text-amber-300">{resolucionPendiente === 'IMPARTIDA' ? 'La asistencia quedará identificada como captura extemporánea.' : 'La clase original quedará registrada como no impartida.'}</p>
              </div>
              <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold text-slate-200">¿La clase se impartió?</legend>
                <label className={`cursor-pointer rounded-xl border p-3 text-sm ${resolucionPendiente === 'IMPARTIDA' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-slate-300'}`}>
                  <input type="radio" className="mr-2" checked={resolucionPendiente === 'IMPARTIDA'} onChange={() => { setResolucionPendiente('IMPARTIDA'); setProgramarAlDeclarar(false); }} />
                  Sí, se impartió
                </label>
                <label className={`cursor-pointer rounded-xl border p-3 text-sm ${resolucionPendiente === 'NO_IMPARTIDA' ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-white/10 text-slate-300'}`}>
                  <input type="radio" className="mr-2" checked={resolucionPendiente === 'NO_IMPARTIDA'} onChange={() => setResolucionPendiente('NO_IMPARTIDA')} />
                  No se impartió
                </label>
              </fieldset>
              <label className="block text-sm text-slate-300">{resolucionPendiente === 'IMPARTIDA' ? 'Motivo de la captura tardía' : 'Motivo por el que no se impartió'} *
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  value={motivoExtemporaneo}
                  onChange={(e) => setMotivoExtemporaneo(e.target.value)}
                  className="input-dark mt-1"
                  placeholder={resolucionPendiente === 'IMPARTIDA' ? 'Ej. La clase sí se impartió, pero falló la conexión a internet.' : 'Ej. Suspensión eléctrica en el edificio.'}
                />
              </label>
              {resolucionPendiente === 'NO_IMPARTIDA' && <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
                <label className="flex items-start gap-3 text-sm text-slate-200">
                  <input type="checkbox" className="mt-1" checked={programarAlDeclarar} onChange={(e) => setProgramarAlDeclarar(e.target.checked)} />
                  <span><b>Programar la reposición ahora</b><span className="mt-1 block text-xs font-normal text-slate-400">Si aún no conoces la fecha, puedes dejarla pendiente y programarla después.</span></span>
                </label>
                {programarAlDeclarar && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-300 sm:col-span-2">Fecha de reposición *<input required type="date" min={new Date().toISOString().slice(0, 10)} value={formReposicion.fecha} onChange={(e) => setFormReposicion({ ...formReposicion, fecha: e.target.value })} className="input-dark mt-1" /></label>
                  <label className="text-sm text-slate-300">Inicio *<input required type="time" value={formReposicion.hora_inicio} onChange={(e) => setFormReposicion({ ...formReposicion, hora_inicio: e.target.value })} className="input-dark mt-1" /></label>
                  <label className="text-sm text-slate-300">Fin *<input required type="time" value={formReposicion.hora_fin} onChange={(e) => setFormReposicion({ ...formReposicion, hora_fin: e.target.value })} className="input-dark mt-1" /></label>
                  <label className="text-sm text-slate-300 sm:col-span-2">Tema pendiente<input maxLength={300} value={formReposicion.tema} onChange={(e) => setFormReposicion({ ...formReposicion, tema: e.target.value })} className="input-dark mt-1" /></label>
                </div>}
              </div>}
              <p className="text-xs text-slate-500">{resolucionPendiente === 'IMPARTIDA' ? 'Los alumnos iniciarán como presentes; marca las excepciones y cierra la asistencia.' : 'La sesión original quedará como NO IMPARTIDA y permanecerá en el historial.'}</p>
            </div>
            <footer className="flex gap-3 border-t border-white/10 px-5 py-4">
              <button type="button" disabled={creandoExtemporanea} onClick={() => setModalExtemporanea(null)} className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-300">Cancelar</button>
              <button disabled={creandoExtemporanea || motivoExtemporaneo.trim().length < 5} className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{creandoExtemporanea ? 'Guardando…' : resolucionPendiente === 'IMPARTIDA' ? 'Registrar asistencia' : programarAlDeclarar ? 'Registrar y programar reposición' : 'Guardar como no impartida'}</button>
            </footer>
          </form>
        </div>
      )}
      {actividadARetirar && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onMouseDown={() => !retirando && setActividadARetirar(null)}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titulo-retirar-actividad"
            onMouseDown={(e) => e.stopPropagation()}
            className="glass w-full max-w-md overflow-hidden rounded-2xl border border-red-500/20 shadow-2xl"
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-300">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.5m0 3h.01M10.3 4.2 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 id="titulo-retirar-actividad" className="text-lg font-bold text-white">Retirar actividad</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Esta actividad dejará de aparecer en tu horario docente.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="font-semibold text-white">{actividadARetirar.actividad_nombre}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {DIAS[actividadARetirar.dia_semana]} · {actividadARetirar.hora_inicio}–{actividadARetirar.hora_fin}
                  {actividadARetirar.grupo ? ` · ${actividadARetirar.grupo}` : ''}
                </p>
                {actividadARetirar.espacio_nombre && (
                  <p className="mt-1 text-xs text-slate-500">{actividadARetirar.espacio_nombre}</p>
                )}
              </div>

              {actividadARetirar.estado_reserva_laboratorio === 'RESERVADO' && (
                <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-5 text-amber-200">
                  También se liberará la reservación de laboratorio vinculada a esta actividad.
                </p>
              )}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={retirando}
                  onClick={() => setActividadARetirar(null)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  Conservar actividad
                </button>
                <button
                  type="button"
                  disabled={retirando}
                  onClick={eliminar}
                  className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {retirando ? 'Retirando…' : 'Sí, retirar actividad'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
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
