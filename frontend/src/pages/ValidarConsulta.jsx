import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE =
  process.env.REACT_APP_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

function formatearFecha(iso) {
  if (!iso) return 'Fecha no disponible';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Mexico_City',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ValidarConsulta() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    axios
      .get(`${API_BASE}/consultorio/consultas/validacion/${token}`)
      .then(res => setData(res.data))
      .catch(err => {
        setError(err.response?.data?.detail || 'No se pudo validar esta nota medica.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 flex items-center justify-center p-4">
      <section className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">SIGA UTECAN</p>
          <h1 className="text-2xl font-bold mt-1">Validacion de nota medica</h1>
          <p className="text-sm text-slate-600 mt-1">Universidad Tecnologica de Candelaria</p>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-slate-600">Validando folio...</p>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-bold text-red-900">Codigo no valido</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-bold text-emerald-950">Nota medica valida</p>
                <p className="text-sm text-emerald-800 mt-1">
                  Este folio fue emitido por el sistema institucional SIGA.
                </p>
              </div>

              <dl className="grid grid-cols-1 gap-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Folio</dt>
                  <dd className="font-mono font-bold text-slate-950 mt-1">#{data.folio}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha de emision</dt>
                  <dd className="font-semibold text-slate-900 mt-1">{formatearFecha(data.fecha_consulta)}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paciente</dt>
                  <dd className="font-semibold text-slate-900 mt-1">{data.paciente}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medico</dt>
                  <dd className="font-semibold text-slate-900 mt-1">{data.medico}</dd>
                </div>
              </dl>

              <p className="text-xs leading-relaxed text-slate-500">
                Esta pagina solo confirma la emision institucional del documento.
                No muestra diagnostico, tratamiento ni datos clinicos sensibles.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
