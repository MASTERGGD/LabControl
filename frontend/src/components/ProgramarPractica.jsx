import React, { useEffect, useState } from 'react';
import api from '../hooks/useApi';
import { getApiErrorMessage } from '../utils/apiError';
import { todayISOInMexico } from '../utils/timezone';
import { proponerSesiones } from '../utils/programarPractica';
import MaterialesPracticaSelector from './MaterialesPracticaSelector';
const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const campo = 'input-dark w-full';
const boton = 'rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40';
const maxSesiones = 30;

function sesionIndividual(fecha, horario) {
  return {
    fecha,
    hora_inicio: horario?.hora_inicio || '08:00',
    hora_fin: horario?.hora_fin || '09:00',
    carga_id: null,
    fuera_horario: true,
  };
}

export default function ProgramarPractica({ origen, onGuardado, onClose, laboratorioInicialId, slotInicial }) {
  const [cargas, setCargas] = useState([]);
  const [labs, setLabs] = useState([]);
  const [cargaError, setCargaError] = useState(false);
  const [labsError, setLabsError] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [revision, setRevision] = useState(0);
  const [proposito, setProposito] = useState(origen?.proposito || '');
  const [incluyePractica, setIncluyePractica] = useState(origen?.incluye_practica ?? false);
  const [participantes, setParticipantes] = useState(origen?.participantes || '');
  const [cargaId, setCargaId] = useState('');
  const [labId, setLabId] = useState(String(origen?.laboratorio_id || laboratorioInicialId || ''));
  const [titulo, setTitulo] = useState(origen?.titulo || '');
  const [objetivo, setObjetivo] = useState(origen?.objetivo || '');
  const [cantidad, setCantidad] = useState(slotInicial?.fecha ? 1 : 3);
  const [inicio, setInicio] = useState(slotInicial?.fecha || todayISOInMexico());
  const [diasElegidos, setDiasElegidos] = useState([]);
  const [fechas, setSesiones] = useState(() => origen?.proposito === 'INDIVIDUAL'
    ? [sesionIndividual(todayISOInMexico(), slotInicial)]
    : []);
  const [materiales, setMateriales] = useState([]);
  const [error, setError] = useState('');
  const [conflictos, setConflictos] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [validado, setValidado] = useState(false);
  const academica = proposito === 'ACADEMICA';

  useEffect(() => {
    let vigente = true;
    setCargando(true); setCargaError(false); setLabsError(false);
    Promise.allSettled([api.get('/docencia/horario'), api.get('/laboratorios?solo_activos=true')]).then(([c, l]) => {
      if (!vigente) return;
      if (c.status === 'fulfilled' && Array.isArray(c.value.data)) {
        const clases = c.value.data.filter(x => x.tipo_actividad === 'CLASE' && x.grupo_academico_id && x.estado === 'ACTIVO');
        setCargas(clases);
        if (origen) {
          const carga = clases.find(x => x.id === origen.carga_docente_id);
          if (carga) { setCargaId(String(carga.id)); setDiasElegidos([carga.dia_semana]); }
        }
      } else { setCargas([]); setCargaError(true); }
      if (l.status === 'fulfilled' && Array.isArray(l.value.data)) setLabs(l.value.data.filter(l => ['QUIMICA','AGROINDUSTRIA'].includes(l.categoria?.toUpperCase())));
      else { setLabs([]); setLabsError(true); }
      setCargando(false);
    });
    return () => { vigente = false; };
  }, [origen, revision]);

  const carga = cargas.find(c => String(c.id) === cargaId);
  const mismaMateria = cargas.filter(c => c.grupo_academico_id === carga?.grupo_academico_id && c.materia_id === carga?.materia_id && c.actividad_nombre === carga?.actividad_nombre);
  const lab = labs.find(l => String(l.id) === labId);
  const permitePractica = ['QUIMICA', 'AGROINDUSTRIA'].includes(lab?.categoria?.toUpperCase());
  const cambiar = fn => { fn(); setValidado(false); setConflictos([]); setError(''); };
  const cambiarFechas = fn => cambiar(() => { fn(); setSesiones([]); });
  const total = Number(cantidad);
  const cantidadValida = Number.isInteger(total) && total >= 1 && total <= maxSesiones;
  const fechasCompletas = fechas.length > 0 && fechas.every(s => s.fecha && s.hora_inicio && s.hora_fin > s.hora_inicio);
  const editar = (i, cambios) => cambiar(() => setSesiones(fechas.map((s, j) => i === j ? { ...s, ...cambios } : s)));
  const elegirProposito = valor => cambiar(() => {
    setProposito(valor);
    setSesiones(valor === 'INDIVIDUAL' ? [sesionIndividual(slotInicial?.fecha || todayISOInMexico(), slotInicial)] : []);
    setCargaId(''); setDiasElegidos([]); setMateriales([]); setIncluyePractica(false);
    setCantidad(slotInicial?.fecha ? 1 : 3);
  });
  const elegirCarga = id => cambiar(() => {
    const elegida = cargas.find(c => String(c.id) === id);
    const bloques = elegida ? cargas.filter(c => c.grupo_academico_id === elegida.grupo_academico_id
      && c.materia_id === elegida.materia_id && c.actividad_nombre === elegida.actividad_nombre) : [];
    setCargaId(id);
    setDiasElegidos([...new Set(bloques.map(c => c.dia_semana))]);
    if (elegida && slotInicial?.fecha) {
      const coincide = bloques.find(c => c.dia_semana === slotInicial.dia_semana
        && c.hora_inicio === slotInicial.hora_inicio && c.hora_fin === slotInicial.hora_fin);
      setSesiones([{
        ...sesionIndividual(slotInicial.fecha, slotInicial),
        carga_id: (coincide || elegida).id,
        fuera_horario: !coincide,
      }]);
    } else {
      setSesiones([]);
    }
  });
  const payload = () => ({
    laboratorio_id: Number(labId), titulo, objetivo, proposito, incluye_practica: incluyePractica, participantes: academica ? null : participantes || null,
    practica_origen_id: origen?.practica_origen_id || origen?.id || null, sesiones: fechas,
    materiales: incluyePractica ? materiales.filter(m => m.descripcion?.trim()).map(m => ({ descripcion: m.descripcion, insumo_id: m.insumo_id ? Number(m.insumo_id) : null, cantidad_solicitada: Number(m.cantidad_solicitada), unidad: m.unidad || 'PIEZA', nota: m.nota || null })) : [],
  });
  const enviar = async confirmar => {
    if (!fechasCompletas || (academica && !carga) || !lab || titulo.trim().length < 2 || (!academica && objetivo.trim().length < 4)) {
      setError('Completa el propósito, los datos de la actividad y sus fechas antes de verificar.'); return;
    }
    setOcupado(true); setError(''); setConflictos([]);
    try {
      const { data } = await api.post(`/practicas-laboratorio/programacion${confirmar ? '' : '/validar'}`, payload());
      if (confirmar) { window.dispatchEvent(new Event('labcontrol:practicas-updated')); onGuardado?.(data); onClose(); }
      else { setValidado(data.disponible); setConflictos(data.conflictos || []); }
    } catch (e) {
      setValidado(false); setError(e.response ? getApiErrorMessage(e) : 'No se pudo conectar con SIGA. Tus datos siguen aquí; reintenta la verificación.');
      setConflictos(e.response?.data?.detail?.conflictos || []);
    } finally { setOcupado(false); }
  };
  const puedeCapturar = !cargando && !labsError && proposito && (!academica || (!cargaError && carga));

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="programar-practica-titulo" className="glass max-h-[92vh] w-full max-w-3xl overflow-auto p-6 text-slate-300">
      <div className="flex items-start justify-between gap-3"><div><h2 id="programar-practica-titulo" className="text-xl font-bold text-white">{origen ? 'Agregar sesiones de continuación' : 'Solicitar laboratorio'}</h2><p className="mt-1 text-sm">Elige para qué necesitas el laboratorio. Puedes reservar una o varias fechas.</p></div><button className={boton} disabled={ocupado} onClick={onClose} aria-label="Cerrar solicitud">Cerrar</button></div>
      <fieldset disabled={ocupado} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Propósito de la reservación">
          {[['ACADEMICA', 'Para una clase o práctica académica', 'Se vincula con materia y grupo de tu carga docente.'], ['INDIVIDUAL', 'Investigación o trabajo individual', 'Registra objetivo y participantes sin generar asistencia académica.']].map(([valor, nombre, ayuda]) => <label key={valor} className={`cursor-pointer rounded-xl border p-3 ${proposito === valor ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/15'}`}><input type="radio" name="proposito" value={valor} disabled={Boolean(origen)} checked={proposito === valor} onChange={() => elegirProposito(valor)}/> <b className="text-sm">{nombre}</b><span className="mt-1 block text-xs">{ayuda}</span></label>)}
        </div>
        {cargando && <p role="status">Consultando laboratorios y carga docente…</p>}
        {!cargando && labsError && <div role="alert"><p>No se pudieron consultar los laboratorios. No significa que no haya laboratorios disponibles.</p><button className={boton} onClick={() => setRevision(r => r + 1)}>Reintentar consulta</button></div>}
        {!cargando && academica && (cargaError ? <div role="alert"><p>No se pudo consultar tu carga docente. Reintenta antes de programar una clase.</p><button className={boton} onClick={() => setRevision(r => r + 1)}>Reintentar carga docente</button></div> : !cargas.length ? <div role="status" className="rounded-xl border border-amber-400 p-4"><p>No tienes materias activas con grupo en tu carga docente. Configura tu horario para solicitar una clase o práctica académica.</p><a className="mt-2 inline-block font-semibold underline" href="/docente/horario">Configurar mi horario docente</a><p className="mt-2 text-xs">Si necesitas el espacio para un estudio propio, elige Investigación o trabajo individual.</p></div> : <label className="block">Materia y grupo<select aria-label="Materia y grupo" className={campo} value={cargaId} onChange={e => elegirCarga(e.target.value)}><option value="">Seleccionar materia</option>{cargas.filter((c, i, a) => a.findIndex(x => x.grupo_academico_id === c.grupo_academico_id && x.materia_id === c.materia_id && x.actividad_nombre === c.actividad_nombre) === i || (origen && c.id === origen.carga_docente_id)).map(c => <option key={c.id} value={c.id}>{c.actividad_nombre} · {c.grupo} · {c.carrera}</option>)}</select></label>)}
        {puedeCapturar && <>
          <label className="block">Laboratorio<select aria-label="Laboratorio de la práctica" className={campo} disabled={Boolean(origen)} value={labId} onChange={e => cambiar(() => { setLabId(e.target.value); setMateriales([]); if (!['QUIMICA', 'AGROINDUSTRIA'].includes(labs.find(l => String(l.id) === e.target.value)?.categoria?.toUpperCase())) setIncluyePractica(false); })}><option value="">Seleccionar laboratorio</option>{labs.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></label>
          <label className="block">Nombre de la actividad<input aria-label="Título de la práctica" className={campo} disabled={Boolean(origen)} maxLength={180} value={titulo} onChange={e => cambiar(() => setTitulo(e.target.value))}/></label>
          {!origen && <label className="block">Objetivo{!academica ? ' del estudio o trabajo (obligatorio)' : ''}<textarea aria-label="Objetivo de la actividad" className={campo} value={objetivo} onChange={e => cambiar(() => setObjetivo(e.target.value))}/></label>}
          {!academica && <label className="block">Participantes (opcional)<textarea aria-label="Participantes" className={campo} maxLength={1000} disabled={Boolean(origen)} value={participantes} onChange={e => cambiar(() => setParticipantes(e.target.value))}/><span className="text-xs">Si trabajas individualmente puedes dejarlo vacío. Este registro no es una lista académica de alumnos.</span></label>}
          <label className="block"><input type="checkbox" disabled={Boolean(origen) || !permitePractica} checked={incluyePractica} onChange={e => cambiar(() => { setIncluyePractica(e.target.checked); setMateriales([]); })}/> Incluye práctica con materiales y seguimiento</label>
          <p className="text-xs">{incluyePractica ? 'Cada fecha requerirá preparación y entrega de materiales por el responsable.' : 'Se solicita el espacio y se registra una bitácora por sesión, sin solicitud de materiales.'}</p>
          {academica ? <>
            <div className="grid gap-3 sm:grid-cols-2"><label>Buscar fechas desde<input aria-label="Fecha inicial" className={campo} type="date" min={todayISOInMexico()} value={inicio} onChange={e => cambiarFechas(() => setInicio(e.target.value))}/></label><label>Total de sesiones<input aria-label="Número de sesiones" className={campo} type="number" min={1} max={maxSesiones} value={cantidad} onChange={e => cambiarFechas(() => setCantidad(e.target.value))}/><span className="text-xs">La primera sesión cuenta dentro del total.</span></label></div>
            <div><p>Días de la materia que quieres utilizar</p><div className="flex flex-wrap gap-3">{[...new Set(mismaMateria.map(c => c.dia_semana))].sort().map(d => <label key={d}><input type="checkbox" checked={diasElegidos.includes(d)} onChange={() => cambiarFechas(() => setDiasElegidos(a => a.includes(d) ? a.filter(x => x !== d) : [...a, d]))}/> {dias[d]}</label>)}</div></div>
            <button className={boton} disabled={!inicio || !diasElegidos.length || !cantidadValida} onClick={() => cambiar(() => setSesiones(proponerSesiones(mismaMateria.filter(c => diasElegidos.includes(c.dia_semana)), inicio, Number(cantidad))))}>Proponer fechas de mi horario</button>
          </> : <p className="text-sm">Elige la fecha y el horario de cada sesión. Al agregar otra, se copian las horas de la anterior y puedes cambiarlas.</p>}
          {!!fechas.length && <div className="space-y-3">
            <h3 className="font-semibold text-white">{fechas.length === 1 ? '1 sesión prevista' : `${fechas.length} sesiones previstas`}</h3>
            {fechas.map((s, i) => <div key={i} className="rounded-xl border border-white/15 p-3">
              <p className="text-sm font-semibold">Sesión {i + 1}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label>Fecha<input aria-label={`Fecha sesión ${i + 1}`} className={campo} type="date" min={todayISOInMexico()} value={s.fecha} onChange={e => editar(i, { fecha: e.target.value })}/></label>
                <label>Hora de inicio<input aria-label={`Inicio sesión ${i + 1}`} className={campo} type="time" disabled={academica && !s.fuera_horario} value={s.hora_inicio} onChange={e => editar(i, { hora_inicio: e.target.value })}/></label>
                <label>Hora de fin<input aria-label={`Fin sesión ${i + 1}`} className={campo} type="time" disabled={academica && !s.fuera_horario} value={s.hora_fin} onChange={e => editar(i, { hora_fin: e.target.value })}/></label>
              </div>
              {academica && <label className="mt-2 block text-sm"><input type="checkbox" checked={s.fuera_horario} onChange={e => editar(i, { fuera_horario: e.target.checked })}/> Programar esta sesión fuera de mi horario habitual</label>}
              {!academica && fechas.length > 1 && <button className={`${boton} mt-2`} aria-label={`Quitar sesión ${i + 1}`} onClick={() => cambiar(() => setSesiones(fechas.filter((_, j) => j !== i)))}>Quitar sesión</button>}
            </div>)}
          </div>}
          {!academica && <button className={boton} disabled={fechas.length >= maxSesiones || !fechasCompletas} onClick={() => cambiar(() => setSesiones([...fechas, sesionIndividual('', fechas.at(-1))]))}>Agregar otra sesión</button>}
          {!!fechas.length && !fechasCompletas && <p className="text-xs">Completa la fecha y las horas de cada sesión. La hora de fin debe ser posterior a la de inicio.</p>}
          {incluyePractica && !origen && <div><p className="font-semibold">Materiales por sesión</p><p className="text-xs">Se solicitarán estas cantidades en cada fecha.</p><MaterialesPracticaSelector laboratorioId={labId} materiales={materiales} onChange={m => cambiar(() => setMateriales(m))}/></div>}
          {!!conflictos.length && <div role="alert" className="rounded-xl border border-amber-500 p-3">No se confirmó ninguna sesión.{conflictos.map((c, i) => <p key={i}>Sesión {c.sesion} · {c.fecha}: {c.mensaje}</p>)}</div>}
          {validado && <p role="status" className="text-emerald-400">{fechas.length === 1 ? "La sesión está disponible." : `Las ${fechas.length} sesiones están disponibles.`} Al confirmar se volverá a revisar la disponibilidad.</p>}
          <button className="btn-blue px-4 py-2" disabled={!fechasCompletas || ocupado || !lab} onClick={() => enviar(validado)}>{ocupado ? 'Comprobando…' : validado ? `Confirmar ${fechas.length} ${fechas.length === 1 ? "sesión" : "sesiones"}` : 'Verificar disponibilidad'}</button>
        </>}
      </fieldset>
      {error && <p className="mt-3 text-red-400" role="alert">{error}</p>}
    </section>
  </div>;
}
