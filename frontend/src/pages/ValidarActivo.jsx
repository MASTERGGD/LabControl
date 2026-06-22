import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicJson } from '../utils/publicApiBase';

function etiqueta(valor) {
  return valor ? String(valor).replace(/_/g, ' ') : 'Sin dato';
}

function fecha(iso) {
  if (!iso) return 'Sin registro';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'long',
      timeZone: 'America/Mexico_City',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ValidarActivo() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getPublicJson(`/inventario/activos/validacion/${token}`)
      .then(res => setData(res))
      .catch(err => setError(err.response?.data?.detail || 'No se pudo validar este activo.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 flex items-center justify-center p-4">
      <section className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">SIGA UTECAN</p>
          <h1 className="text-2xl font-bold mt-1">Validacion de activo</h1>
          <p className="text-sm text-slate-600 mt-1">Inventario institucional</p>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-slate-600">Validando activo...</p>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-bold text-red-900">QR no valido</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-bold text-emerald-950">Activo registrado en SIGA</p>
                <p className="text-sm text-emerald-800 mt-1">
                  Esta etiqueta corresponde a un bien del inventario institucional.
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activo</p>
                <h2 className="text-2xl font-bold text-slate-950 mt-1">{data.nombre || 'Activo sin nombre'}</h2>
                <p className="font-mono text-sm text-slate-600 mt-1">{data.codigo_inventario}</p>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {[
                  ['Numero oficial', data.numero_oficial],
                  ['Categoria', etiqueta(data.categoria)],
                  ['Estado', etiqueta(data.estado)],
                  ['Validacion', etiqueta(data.estado_admin)],
                  ['Marca / modelo', [data.marca, data.modelo].filter(Boolean).join(' / ')],
                  ['Serie', data.numero_serie],
                  ['Departamento', data.departamento],
                  ['Laboratorio', data.laboratorio],
                  ['Ubicacion', data.ubicacion],
                  ['Resguardante', data.resguardante],
                  ['Fecha de alta', fecha(data.fecha_alta)],
                  ['Ultima revision', fecha(data.ultima_revision)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="font-semibold text-slate-900 mt-1">{value || 'Sin dato'}</dd>
                  </div>
                ))}
              </dl>

              <p className="text-xs leading-relaxed text-slate-500">
                Esta pagina confirma la existencia del activo en SIGA. Para movimientos, resguardos,
                bajas o mantenimiento se requiere ingresar con una cuenta autorizada.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
