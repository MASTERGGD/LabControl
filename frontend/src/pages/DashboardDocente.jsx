import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

const ACCESOS = [
  {
    titulo: 'Mi horario',
    desc: 'Consulta tus clases, inicia sesiones y solicita laboratorios disponibles.',
    path: '/docente/horario',
    color: 'from-blue-600/25 to-blue-500/5 border-blue-500/20 text-blue-300',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    titulo: 'Solicitar sala o espacio',
    desc: 'Pide sala audiovisual, rectoria u otro espacio institucional.',
    path: '/espacios/apartar',
    color: 'from-emerald-600/25 to-emerald-500/5 border-emerald-500/20 text-emerald-300',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
      </svg>
    ),
  },
  {
    titulo: 'Mis solicitudes',
    desc: 'Revisa el estado de tus solicitudes de salas y espacios.',
    path: '/espacios/mis-solicitudes',
    color: 'from-violet-600/25 to-violet-500/5 border-violet-500/20 text-violet-300',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2m-3 7h3m-3 4h3" />
      </svg>
    ),
  },
  {
    titulo: 'Comunicados',
    desc: 'Lee avisos institucionales y confirma lectura cuando sea necesario.',
    path: '/comunicados',
    color: 'from-amber-600/25 to-amber-500/5 border-amber-500/20 text-amber-300',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
];

export default function DashboardDocente() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [pendientes, setPendientes] = useState(0);
  const [sesionActiva, setSesionActiva] = useState(null);

  useEffect(() => {
    api.get('/comunicados/pendientes-count')
      .then(res => setPendientes(res.data?.pendientes ?? 0))
      .catch(() => {});
    api.get('/sesiones/activas')
      .then(res => setSesionActiva(res.data?.[0] || null))
      .catch(() => {});
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-white">Inicio docente</h1>
          <p className="text-slate-400 text-sm mt-1">Hola, {usuario?.nombre}. Tienes tus herramientas principales a la mano.</p>
        </div>

        {(pendientes > 0 || sesionActiva) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {pendientes > 0 && (
              <button
                onClick={() => navigate('/comunicados')}
                className="text-left rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 hover:bg-amber-500/15 transition-colors"
              >
                <p className="text-xs uppercase tracking-wider text-amber-300/80 font-semibold">Atencion requerida</p>
                <p className="text-white font-semibold mt-1">{pendientes} comunicado{pendientes === 1 ? '' : 's'} pendiente{pendientes === 1 ? '' : 's'}</p>
                <p className="text-sm text-slate-400 mt-1">Revisa los avisos institucionales dirigidos a ti.</p>
              </button>
            )}
            {sesionActiva && (
              <button
                onClick={() => navigate(`/docente/sesion/${sesionActiva.id}`)}
                className="text-left rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 hover:bg-emerald-500/15 transition-colors"
              >
                <p className="text-xs uppercase tracking-wider text-emerald-300/80 font-semibold">Sesion activa</p>
                <p className="text-white font-semibold mt-1">{sesionActiva.materia}</p>
                <p className="text-sm text-slate-400 mt-1">{sesionActiva.grupo} / {sesionActiva.laboratorio_nombre}</p>
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ACCESOS.map(acceso => (
            <button
              key={acceso.path}
              onClick={() => navigate(acceso.path)}
              className={`text-left rounded-2xl border bg-gradient-to-br ${acceso.color} p-5 hover:bg-white/5 transition-all hover:-translate-y-0.5`}
            >
              <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center mb-4">
                {acceso.icon}
              </div>
              <h2 className="text-white font-semibold">{acceso.titulo}</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">{acceso.desc}</p>
            </button>
          ))}
        </div>

        <section className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-white font-semibold">Flujo recomendado</h2>
              <p className="text-sm text-slate-400 mt-1">Usa el menu lateral para moverte entre laboratorios, salas y comunicados sin regresar al calendario.</p>
            </div>
            <button onClick={() => navigate('/docente/horario')} className="btn-blue">
              Ver mi horario
            </button>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
