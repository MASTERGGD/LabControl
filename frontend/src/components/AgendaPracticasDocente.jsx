import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../hooks/useApi';
import ProgramarPractica from './ProgramarPractica';
import { todayISOInMexico } from '../utils/timezone';
import { getApiErrorMessage } from '../utils/apiError';

const ACTIVAS = ['SOLICITADA', 'PREPARADA', 'EN_CURSO'];
const titulo = p => `${p.proposito === 'INDIVIDUAL' ? 'Investigación / uso individual' : p.materia} · ${p.titulo}`;
const fecha = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', { day:'numeric', month:'short' });
const estado = p => p.estado === 'PREPARADA' && p.incluye_practica === false ? 'Reservada' : p.estado === 'SOLICITADA' ? 'Preparación pendiente' : p.estado === 'EN_CURSO' ? 'En curso' : 'Materiales preparados';

export default function AgendaPracticasDocente({ historial = false, periodoId, soloExtra = false, enHorarioDocente = false }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(!historial);
  const [abierto, setAbierto] = useState(false);
  const [revision, setRevision] = useState(0);
  const [mensaje, setMensaje] = useState('');
  const avisoTimer = useRef(null);
  const contextoAnterior = useRef(null);

  useEffect(() => {
    if (historial) return undefined;
    let vigente = true, solicitud = 0;
    const contexto = String(periodoId || '');
    if (contextoAnterior.current !== contexto) { setItems([]); contextoAnterior.current = contexto; }
    setCargando(true); setError('');
    const cargar = async () => {
      const actual = ++solicitud;
      try {
        const { data } = await api.get(`/practicas-laboratorio/agenda-docente?historial=false${periodoId ? `&periodo_id=${periodoId}` : ''}`);
        if (!Array.isArray(data)) throw new Error('Respuesta de agenda inválida');
        if (vigente && actual === solicitud) { setItems(data); setError(''); }
      } catch (e) {
        if (vigente && actual === solicitud) setError(e.response ? getApiErrorMessage(e, 'No se pudo consultar tu agenda de laboratorio.') : 'No se pudo conectar con la agenda de laboratorio. Reintenta la consulta.');
      } finally { if (vigente && actual === solicitud) setCargando(false); }
    };
    cargar();
    const timer = setInterval(cargar, 60000);
    window.addEventListener('focus', cargar);
    return () => { vigente = false; clearInterval(timer); window.removeEventListener('focus', cargar); };
  }, [historial, periodoId, revision]);

  useEffect(() => {
    const actualizar = () => setRevision(r => r + 1);
    const cancelada = () => {
      actualizar(); setMensaje('Actividad cancelada. El horario quedó disponible.');
      clearTimeout(avisoTimer.current);
      avisoTimer.current = setTimeout(() => setMensaje(''), 6000);
    };
    window.addEventListener('labcontrol:practicas-updated', actualizar);
    window.addEventListener('labcontrol:reserva-cancelada', cancelada);
    return () => { clearTimeout(avisoTimer.current); window.removeEventListener('labcontrol:practicas-updated', actualizar); window.removeEventListener('labcontrol:reserva-cancelada', cancelada); };
  }, []);

  const hoy = todayISOInMexico();
  const activas = items.filter(p => ACTIVAS.includes(p.estado) && (p.fecha >= hoy || p.estado === 'EN_CURSO'));
  const futuras = activas.filter(p => !soloExtra || p.fuera_horario || p.fecha !== hoy || !p.carga_id);
  futuras.sort((a,b) => Number(b.estado === 'EN_CURSO') - Number(a.estado === 'EN_CURSO') || a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));
  const visibles = futuras.slice(0, 3);
  const deHoy = visibles.filter(p => p.fecha === hoy || p.estado === 'EN_CURSO');
  const proximas = visibles.filter(p => p.fecha !== hoy && p.estado !== 'EN_CURSO');
  const pendientes = [...new Map(items.filter(p => p.estado === 'CERRADA' && p.plan_estado === 'PENDIENTE_CONTINUACION').map(p => [p.practica_origen_id || p.id, p])).values()];
  const irCompleta = () => navigate('/docente/practicas-laboratorio?vista=ACTIVAS');
  const irHistorial = () => navigate('/docente/practicas-laboratorio?vista=HISTORIAL');

  const fila = p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-2 last:border-0">
    <div className="min-w-0"><p className="text-sm font-semibold text-white">{titulo(p)}</p><p className="text-xs text-slate-400">{fecha(p.fecha)} · {p.hora_inicio}–{p.hora_fin} · {p.laboratorio} · {estado(p)}</p></div>
    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => navigate(p.practica_url)}>{p.estado === 'EN_CURSO' ? 'Continuar sesión' : p.practica_puede_iniciar ? 'Iniciar sesión' : 'Ver actividad'}</button>
  </li>;

  if (historial) return <nav className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm" aria-label="Historial de laboratorio"><span className="text-slate-400">Las actividades finalizadas y canceladas se conservan para consulta.</span><button className="btn-ghost px-3 py-1.5" onClick={irHistorial}>Ver historial de laboratorio</button></nav>;

  if (enHorarioDocente && !visibles.length && !pendientes.length && !error && !mensaje) return null;

  return <section className="rounded-xl border border-white/10 px-4 py-3" aria-label="Agenda de prácticas">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-white">Mi agenda de laboratorio</h2>
      {!enHorarioDocente && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={irHistorial}>Ver historial</button>
          <button className="btn-blue px-3 py-1.5 text-xs" onClick={() => setAbierto(true)}>Solicitar laboratorio</button>
        </div>
      )}
    </div>
    {mensaje && <p role="status" className="mt-2 text-sm text-emerald-500">{mensaje}</p>}
    {error && <div role="alert" className="mt-2 text-sm text-amber-500"><p>{error}</p><button className="mt-1 underline" onClick={() => setRevision(r => r + 1)}>Reintentar agenda</button></div>}
    {cargando && <p role="status" className="mt-2 text-sm text-slate-400">Consultando próximas actividades…</p>}
    {!enHorarioDocente && !error && !cargando && !futuras.length && <p className="mt-1 text-sm text-slate-400">{soloExtra && activas.length ? 'Las actividades de hoy están en tu jornada docente.' : 'No tienes sesiones de laboratorio próximas.'}</p>}
    {!!deHoy.length && <div className="mt-2"><h3 className="text-xs font-semibold text-emerald-500">Hoy y en curso</h3><ul>{deHoy.map(fila)}</ul></div>}
    {!!proximas.length && <div className="mt-2"><h3 className="text-xs font-semibold text-slate-400">Próximas</h3><ul>{proximas.map(fila)}</ul></div>}
    {!error && !cargando && !!activas.length && <button className="mt-2 text-xs font-semibold text-blue-500 underline" onClick={irCompleta}>Ver agenda completa · {activas.length} {activas.length === 1 ? 'activa' : 'activas'}</button>}
    {!!pendientes.length && <details className="mt-2 border-t border-white/10 pt-2"><summary className="cursor-pointer text-xs font-semibold text-amber-500">Decisiones pendientes · {pendientes.length} {pendientes.length === 1 ? 'práctica' : 'prácticas'} por continuar o finalizar</summary><ul className="mt-2 max-h-60 space-y-2 overflow-auto">{pendientes.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{titulo(p)}</span><button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => navigate(p.practica_url)}>Decidir continuación o cierre</button></li>)}</ul></details>}
    {!enHorarioDocente && abierto && <ProgramarPractica onClose={() => setAbierto(false)} onGuardado={() => setRevision(r => r + 1)}/>}
  </section>;
}
