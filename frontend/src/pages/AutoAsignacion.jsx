import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE =
  process.env.REACT_APP_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

function mensajeErrorCarga(err) {
  const status = err.response?.status;
  const detail = err.response?.data?.detail;
  if (status === 404 && (!detail || detail === 'Not Found')) {
    return 'No se encontro el servicio de autoasignacion. Reinicia el backend para cargar la nueva ruta y verifica que el enlace no use localhost desde otro equipo.';
  }
  if (!err.response) {
    return 'No se pudo conectar con el servidor. Si estas en un celular, usa la IP de la computadora servidor, no localhost.';
  }
  return detail || 'El enlace no esta disponible';
}

export default function AutoAsignacion() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [matricula, setMatricula] = useState('');
  const [pcId, setPcId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(null);

  const pcs = useMemo(
    () => [...(data?.pcs_disponibles || [])].sort((a, b) => (a.numero || 0) - (b.numero || 0)),
    [data]
  );

  useEffect(() => {
    setLoading(true);
    axios
      .get(`${API_BASE}/sesiones/autoasignacion/${token}`)
      .then(res => setData(res.data))
      .catch(err => setError(mensajeErrorCarga(err)))
      .finally(() => setLoading(false));
  }, [token]);

  const registrar = async (e) => {
    e.preventDefault();
    setError('');
    setOk(null);

    if (!matricula.trim() || !pcId) {
      setError('Ingresa tu matricula y selecciona la PC donde estas sentado.');
      return;
    }

    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/sesiones/autoasignacion/${token}`, {
        matricula: matricula.trim(),
        computadora_id: Number(pcId),
      });
      setOk(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo completar el registro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">LabControl</p>
          <h1 className="text-xl font-bold mt-1">Autoasignacion de PC</h1>
          {data && (
            <p className="text-sm text-slate-600 mt-1">
              {data.laboratorio_nombre} - {data.tipo_sesion === 'LIBRE' ? 'Uso libre' : data.materia}
            </p>
          )}
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-slate-600">Cargando sesion...</p>
          ) : ok ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-bold text-emerald-900">Registro completado</p>
              <p className="text-sm text-emerald-800 mt-1">
                {ok.alumno_nombre} quedo asignado a {ok.pc_codigo}.
              </p>
            </div>
          ) : (
            <form onSubmit={registrar} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                  {error}
                </div>
              )}

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Escribe tu matricula y elige la PC donde estas sentado. Solo aparecen PCs disponibles.
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Matricula</label>
                <input
                  value={matricula}
                  onChange={e => setMatricula(e.target.value.toUpperCase())}
                  placeholder="Ej: UTC250134"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  PC donde estas sentado
                </label>
                <select
                  value={pcId}
                  onChange={e => setPcId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">Selecciona tu PC</option>
                  {pcs.map(pc => (
                    <option key={pc.pc_id} value={pc.pc_id}>
                      {pc.codigo}{pc.fila ? ` - Fila ${pc.fila}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={saving || pcs.length === 0}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white py-3 font-bold"
              >
                {saving ? 'Registrando...' : 'Registrarme'}
              </button>

              {pcs.length === 0 && (
                <p className="text-xs text-red-700 text-center font-semibold">
                  No hay PCs disponibles para autoasignacion en este momento.
                </p>
              )}
              <p className="text-xs text-slate-500 text-center">
                Si elegiste una PC equivocada, avisa al docente para corregirla.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
