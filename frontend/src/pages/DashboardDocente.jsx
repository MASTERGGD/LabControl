import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function DashboardDocente() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen text-white">
      <header className="glass-sm border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="font-bold text-lg">LabControl</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{usuario?.nombre}</span>
          <span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded-full font-medium">
            DOCENTE
          </span>
          <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-white transition-colors">
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="p-8">
        <h1 className="text-2xl font-bold mb-2">Panel Docente</h1>
        <p className="text-slate-400 mb-8">Bienvenido, {usuario?.nombre}.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          {[
            { titulo: 'Mis Reservaciones', desc: 'Ver y gestionar horarios asignados', icono: '📅' },
            { titulo: 'Iniciar Sesión de Clase', desc: 'Abrir lab y asignar PCs a alumnos', icono: '▶️' },
            { titulo: 'Mapa de PCs', desc: 'Vista en tiempo real del laboratorio', icono: '🗺️' },
            { titulo: 'Historial', desc: 'Sesiones anteriores y observaciones', icono: '📋' },
          ].map((m) => (
            <div key={m.titulo} className="glass p-5 border border-gray-700">
              <div className="text-3xl mb-3">{m.icono}</div>
              <h3 className="font-semibold text-white">{m.titulo}</h3>
              <p className="text-sm text-slate-400 mt-1">{m.desc}</p>
              <span className="inline-block mt-3 text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full">
                En desarrollo
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
