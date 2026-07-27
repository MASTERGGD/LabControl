import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';

const normalizarPeriodo = (valor = '') => valor.toUpperCase().replace(/[^A-Z0-9]/g, '');

const periodoEsperado = () => {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const bloque = mes <= 4 ? 'ENE-ABR' : mes <= 8 ? 'MAY-AGO' : 'SEP-DIC';
  return `${bloque} ${hoy.getFullYear()}`;
};

export default function SEGrupos() {
  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [resumen, setResumen] = useState({});
  const [detalle, setDetalle] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;

    api.get('/servicios-escolares/periodos')
      .then(({ data }) => {
        if (!vigente) return;
        setPeriodos(data);
        const esperado = normalizarPeriodo(periodoEsperado());
        const seleccionado = data.find((p) => p.es_actual)
          || data.find((p) => normalizarPeriodo(p.clave) === esperado)
          || data.find((p) => normalizarPeriodo(p.clave) !== 'ACTUAL')
          || data[0];
        setPeriodo(seleccionado?.clave || '');
        if (!seleccionado) setCargando(false);
      })
      .catch(() => {
        if (!vigente) return;
        setError('No se pudieron cargar los periodos. Intenta nuevamente.');
        setCargando(false);
      });

    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    if (!periodo) return undefined;
    let vigente = true;
    const qs = `?periodo=${encodeURIComponent(periodo)}`;
    setError('');
    setCargando(true);

    Promise.all([
      api.get(`/servicios-escolares/grupos${qs}`),
      api.get(`/servicios-escolares/organizacion/resumen${qs}`),
    ])
      .then(([respuestaGrupos, respuestaResumen]) => {
        if (!vigente) return;
        setGrupos(respuestaGrupos.data);
        setResumen(respuestaResumen.data);
      })
      .catch(() => {
        if (!vigente) return;
        setError('No se pudieron cargar los grupos. Intenta nuevamente.');
        setGrupos([]);
        setResumen({});
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => { vigente = false; };
  }, [periodo]);

  const abrir = async (grupo) => {
    try {
      const { data } = await api.get(`/servicios-escolares/grupos/${grupo.id}/alumnos`);
      setDetalle(grupo);
      setAlumnos(data);
    } catch {
      setError('No se pudieron cargar los alumnos del grupo.');
    }
  };

  const indicadores = [
    ['Grupos', resumen.grupos],
    ['Inscripciones', resumen.inscripciones_activas],
    ['Grupos vacíos', resumen.grupos_sin_alumnos],
    ['Sin grupo', resumen.alumnos_sin_grupo],
  ];

  return (
    <AdminLayout>
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Grupos e inscripciones</h1>
            <p className="text-sm text-slate-400">Organización académica generada desde la carga de alumnos.</p>
          </div>
          <select
            className="input-dark"
            value={periodo || ''}
            disabled={periodo === null}
            onChange={(evento) => setPeriodo(evento.target.value)}
          >
            {periodo === null && <option value="">Cargando periodos...</option>}
            {periodos.map((p) => <option key={p.id} value={p.clave}>{p.clave}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {indicadores.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="glass rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{cargando ? '—' : (valor ?? 0)}</p>
              <p className="text-xs text-slate-400">{etiqueta}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="p-3 text-left">Grupo</th>
                  <th className="p-3 text-left">Carrera</th>
                  <th className="p-3 text-left">Periodo</th>
                  <th className="p-3 text-right">Alumnos</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">Cargando grupos del periodo...</td>
                  </tr>
                )}
                {!cargando && grupos.length === 0 && !error && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">No hay grupos registrados en este periodo.</td>
                  </tr>
                )}
                {!cargando && grupos.map((grupo) => (
                  <tr
                    key={grupo.id}
                    onClick={() => abrir(grupo)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                  >
                    <td className="p-3 font-semibold text-white">{grupo.cuatrimestre}° {grupo.grupo}</td>
                    <td className="p-3 text-slate-300">{grupo.carrera}</td>
                    <td className="p-3 text-slate-400">{grupo.periodo}</td>
                    <td className="p-3 text-right text-emerald-400">{grupo.total_alumnos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {detalle && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDetalle(null)}>
            <div className="glass w-full max-w-2xl max-h-[80vh] overflow-auto p-5" onClick={(evento) => evento.stopPropagation()}>
              <div className="flex justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{detalle.cuatrimestre}° {detalle.grupo}</h2>
                  <p className="text-sm text-slate-400">{detalle.carrera} · {alumnos.length} alumnos</p>
                </div>
                <button type="button" onClick={() => setDetalle(null)} className="text-slate-400">✕</button>
              </div>
              <div className="mt-4 divide-y divide-white/5">
                {alumnos.map((alumno) => (
                  <div key={alumno.id} className="py-2">
                    <p className="text-white">{alumno.nombre}</p>
                    <p className="text-xs text-slate-500">{alumno.matricula}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
