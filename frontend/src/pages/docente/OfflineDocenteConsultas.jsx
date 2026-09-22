import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../context/AuthContext';
import { formatNombre } from '../../utils/presentacion';
import { getOfflineSnapshot, listOfflineOperations, listOfflineSnapshots, OFFLINE_EVENT } from '../../utils/offlineStore';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TITULOS = { horario: 'Mi horario docente', historial: 'Historial de clases', seguimiento: 'Seguimiento de grupos' };
const fecha = value => value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'sin fecha';
const claseClave = clase => `${clase.carga?.id}|${clase.fecha}`;

export function fusionarHistorialDescargado(historial = [], snapshots = [], pendientes = []) {
  const locales = snapshots.map(item => item.data?.clase).filter(clase => clase?.es_local);
  const clavesPendientes = new Set(pendientes.filter(item => item.kind === 'OFFLINE_CLASS').map(item => `${item.data?.carga_id}|${item.data?.fecha}`));
  const porClave = new Map(historial.map(clase => [claseClave(clase), { ...clase, pendienteLocal: false }]));
  locales.forEach(clase => porClave.set(claseClave(clase), { ...clase, pendienteLocal: clavesPendientes.has(claseClave(clase)) || clase.estado !== 'CERRADA' }));
  return [...porClave.values()].sort((a, b) => `${b.fecha} ${b.carga?.hora_inicio || ''}`.localeCompare(`${a.fecha} ${a.carga?.hora_inicio || ''}`));
}

export default function OfflineDocenteConsultas({ tipo }) {
  const { usuario } = useAuth();
  const [datos, setDatos] = useState(null);
  const [locales, setLocales] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      try {
        const [paquete, snapshots, cola] = await Promise.all([
          getOfflineSnapshot(`paquete-docente:${usuario?.id}`),
          listOfflineSnapshots(`clase:${usuario?.id}:`),
          listOfflineOperations(usuario?.id),
        ]);
        if (activo) {
          setDatos(paquete?.data || null);
          setLocales(snapshots);
          setPendientes(cola);
        }
      } catch (_) {
        if (activo) setDatos(null);
      } finally {
        if (activo) setCargando(false);
      }
    };
    cargar();
    window.addEventListener(OFFLINE_EVENT, cargar);
    return () => { activo = false; window.removeEventListener(OFFLINE_EVENT, cargar); };
  }, [usuario?.id]);

  const horario = useMemo(() => [...(datos?.horario || [])].sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio)), [datos]);
  const historial = useMemo(() => fusionarHistorialDescargado(datos?.historial || [], locales, pendientes), [datos, locales, pendientes]);
  const seguimientos = datos?.seguimientos || {};
  const grupos = Object.entries(seguimientos);
  const grupoActivo = seguimientos[seleccion] || grupos[0]?.[1];
  const clasesFiltradas = historial.filter(clase => `${clase.carga?.actividad_nombre || ''} ${clase.carga?.grupo || ''} ${clase.fecha}`.toLocaleLowerCase('es-MX').includes(busqueda.toLocaleLowerCase('es-MX')));

  return <AdminLayout><main className="offline-consulta mx-auto w-full max-w-6xl space-y-4 pb-8 text-slate-100">
    <div><h1 className="text-2xl font-bold text-white">{TITULOS[tipo]}</h1><p className="text-sm text-slate-400">Consulta sin conexión · solo lectura</p></div>
    {cargando ? <p className="rounded-xl border border-slate-700 p-5">Abriendo datos descargados…</p> : !datos ? <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-5 text-amber-100">No hay datos descargados para esta cuenta. Al recuperar internet, inicia sesión y pulsa “Actualizar datos” en Inicio docente.</div> : <>
      <div className="offline-cutoff rounded-xl border border-sky-500/40 bg-sky-950/30 p-4 text-sm text-sky-100">Datos descargados el {fecha(datos.generado_en)}. Los cambios institucionales posteriores no aparecen aquí; las clases guardadas en este dispositivo se distinguen como locales. Para sincronizar, inicia sesión con internet.</div>
      {tipo === 'horario' && <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
        <div className="border-b border-slate-700 p-4"><h2 className="font-semibold">Horario del periodo {datos.operacion?.periodo?.clave || ''}</h2><p className="text-xs text-slate-400">La disponibilidad de laboratorios y cambios de horario no se actualizan sin conexión.</p></div>
        {!horario.length ? <p className="p-5 text-slate-300">No hay actividades descargadas.</p> : horario.map(item => <div key={item.id} className="grid gap-1 border-b border-slate-700/60 px-4 py-3 last:border-0 sm:grid-cols-[7rem_8rem_1fr_6rem]">
          <span className="font-semibold">{DIAS[item.dia_semana] || 'Día'}</span><span className="text-slate-300">{item.hora_inicio}–{item.hora_fin}</span><span>{item.actividad_nombre}<small className="block text-slate-400">{item.carrera || item.tipo_actividad} · {item.espacio_nombre || 'Sin espacio'}</small></span><span className="text-slate-300">{item.grupo || '—'}</span>
        </div>)}
      </section>}
      {tipo === 'historial' && <section className="rounded-xl border border-slate-700 bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 p-4"><div><h2 className="font-semibold">Clases recientes ({historial.length})</h2><p className="text-xs text-slate-400">Se descargan hasta 80 registros recientes. Las capturas locales pendientes se muestran aparte de los registros del servidor.</p></div><input aria-label="Buscar clases" placeholder="Buscar materia, grupo o fecha" value={busqueda} onChange={event => setBusqueda(event.target.value)} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white" /></div>
        {!clasesFiltradas.length ? <p className="p-5 text-slate-300">No hay clases para mostrar.</p> : clasesFiltradas.map(clase => <div key={claseClave(clase)} className="border-b border-slate-700/60 p-4 last:border-0"><div className="flex flex-wrap justify-between gap-2"><div><strong>{clase.carga?.actividad_nombre || 'Clase'}</strong><p className="text-sm text-slate-300">{clase.fecha} · {clase.carga?.hora_inicio || '—'} · {clase.carga?.grupo || 'Sin grupo'}</p></div><span className={clase.pendienteLocal ? 'text-amber-300' : 'text-emerald-300'}>{clase.pendienteLocal ? clase.estado === 'CERRADA' ? 'Guardada aquí · pendiente de sincronizar' : 'En captura local' : clase.estado}</span></div><p className="mt-2 text-xs text-slate-400">{clase.resumen ? `${clase.resumen.presente || 0} presentes · ${clase.resumen.falta || 0} faltas · ${clase.resumen.retardo || 0} retardos` : 'Sin resumen de asistencia'}{clase.bitacora?.tema_impartido ? ` · Tema: ${clase.bitacora.tema_impartido}` : ''}</p></div>)}
      </section>}
      {tipo === 'seguimiento' && <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
        <div className="border-b border-slate-700 p-4"><h2 className="font-semibold">Seguimiento al corte descargado</h2><p className="text-xs text-slate-400">Los indicadores no incluyen clases locales pendientes de sincronizar; no se pueden registrar ni justificar seguimientos sin conexión.</p>{pendientes.some(item => item.kind === 'OFFLINE_CLASS') && <p className="mt-2 text-xs font-semibold text-amber-300">Hay clases locales pendientes. Los porcentajes cambiarán después de sincronizar.</p>}</div>
        {!grupos.length ? <p className="p-5 text-slate-300">Este paquete no contiene seguimiento. Actualiza los datos cuando tengas internet.</p> : <><div className="p-4"><label className="text-sm">Materia y grupo <select value={seleccion || grupos[0][0]} onChange={event => setSeleccion(event.target.value)} className="mt-1 block w-full max-w-lg rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white">{grupos.map(([id, valor]) => <option key={id} value={id}>{valor.carga?.actividad_nombre} · {valor.carga?.grupo}</option>)}</select></label><p className="mt-3 text-sm text-slate-300">{grupoActivo?.total_alumnos || 0} alumnos · {grupoActivo?.total_clases || 0} clases registradas · {grupoActivo?.alumnos_en_alerta || 0} con indicador</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-800 text-xs uppercase text-slate-300"><tr><th className="p-3">Alumno</th><th>Asistencia observada</th><th>Faltas</th><th>Retardos</th><th>Indicador</th></tr></thead><tbody>{(grupoActivo?.alumnos || []).map(alumno => <tr key={alumno.alumno_id} className="border-t border-slate-700/60"><td className="p-3">{formatNombre(alumno.nombre)}<small className="block text-slate-400">{alumno.matricula}</small></td><td>{alumno.porcentaje_asistencia == null ? 'Sin registros' : `${alumno.porcentaje_asistencia}% · ${grupoActivo.total_clases} clases`}</td><td>{alumno.falta}</td><td>{alumno.retardo}</td><td className={alumno.alerta ? 'text-amber-300' : 'text-slate-400'}>{alumno.alerta ? alumno.alertas?.map(alerta => alerta.mensaje).join('; ') || 'Requiere atención' : '—'}</td></tr>)}</tbody></table></div></>}
      </section>}
    </>}
  </main></AdminLayout>;
}
