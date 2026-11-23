import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../hooks/useApi';

export const DESTINOS_AVISO = {
  seguimiento: { ruta: '/docente/seguimiento', etiqueta: 'Revisar seguimiento de grupos' },
  horario: { ruta: '/docente/horario', etiqueta: 'Abrir Mi horario docente' },
  historial: { ruta: '/docente/historial-clases', etiqueta: 'Revisar historial de clases' },
};

export default function AvisoInicioDocente({ usuarioId }) {
  const [aviso, setAviso] = useState(null);
  const clave = `siga:aviso-inicio:${usuarioId}`;

  useEffect(() => {
    let controller;
    let vencimiento;
    const actualizar = async () => {
      controller?.abort();
      const consulta = new AbortController();
      controller = consulta;
      try {
        const { data } = await api.get('/aviso-inicio/activo', { signal: consulta.signal });
        if (consulta.signal.aborted) return;
        const restante = Date.parse(data?.expira_en) - Date.now();
        clearTimeout(vencimiento);
        setAviso(data?.revision && restante > 0 ? data : null);
        if (restante > 0 && restante <= 2_147_483_647) {
          vencimiento = setTimeout(() => setAviso(null), restante);
        }
      } catch {
        // Un fallo del aviso no debe interrumpir el inicio docente.
      }
    };
    actualizar();
    const intervalo = setInterval(actualizar, 60_000);
    window.addEventListener('focus', actualizar);
    return () => {
      controller?.abort();
      clearTimeout(vencimiento);
      clearInterval(intervalo);
      window.removeEventListener('focus', actualizar);
    };
  }, [usuarioId]);

  const [descartado, setDescartado] = useState(() => {
    try {
      return localStorage.getItem(clave);
    } catch {
      return null;
    }
  });
  if (!aviso || aviso.revision === descartado || Date.parse(aviso.expira_en) <= Date.now()) return null;

  const descartar = () => {
    setDescartado(aviso.revision);
    try {
      localStorage.setItem(clave, aviso.revision);
    } catch {
      // El aviso conserva el descarte en esta visita si no se permite almacenar.
    }
  };
  const destino = DESTINOS_AVISO[aviso.destino];
  return (
    <section aria-label="Aviso institucional" className="max-h-[45vh] overflow-y-auto rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950 shadow-2xl">
      <div className="flex items-start gap-3">
        <svg aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 3v4m8-4v4M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        </svg>
        <div className="min-w-0 flex-1 break-words">
          <div role="status">
            <p className="text-sm font-semibold">{aviso.titulo}</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-sky-900">{aviso.mensaje}</p>
          </div>
          {destino && <Link to={destino.ruta} onClick={descartar} className="mt-2 inline-block text-xs font-semibold text-sky-800 underline underline-offset-2">{destino.etiqueta}</Link>}
        </div>
        <button type="button" aria-label="Cerrar aviso institucional" onClick={descartar} className="shrink-0 rounded-lg px-2 py-0.5 hover:bg-sky-100">×</button>
      </div>
    </section>
  );
}
