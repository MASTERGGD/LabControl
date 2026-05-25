import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/AdminLayout';
import api from '../hooks/useApi';

const ACCESOS = [
  { titulo: 'Laboratorios', texto: 'Alta, capacidad y equipos', ruta: '/admin/laboratorios', color: '#2563eb' },
  { titulo: 'Usuarios', texto: 'Roles y accesos del sistema', ruta: '/admin/usuarios', color: '#7c3aed' },
  { titulo: 'Departamentos', texto: 'Estructura institucional', ruta: '/admin/departamentos', color: '#0891b2' },
  { titulo: 'Comunicados', texto: 'Mensajes institucionales', ruta: '/admin/comunicados', color: '#059669' },
  { titulo: 'Espacios', texto: 'Salas y areas compartidas', ruta: '/admin/espacios', color: '#d97706' },
  { titulo: 'Auditoria', texto: 'Bitacora de actividad', ruta: '/admin/auditoria', color: '#dc2626' },
];

function CardKpi({ label, value, sub, color = '#3b82f6' }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'rgba(15,23,42,0.62)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500" style={{ margin: 0 }}>{label}</p>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}66` }} />
      </div>
      <p className="text-3xl font-black text-white mt-4" style={{ marginBottom: 0 }}>{value}</p>
      {sub && <p className="text-sm text-slate-400 mt-1" style={{ marginBottom: 0 }}>{sub}</p>}
    </div>
  );
}

function AccesoCard({ item, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-4 transition-all hover:-translate-y-0.5"
      style={{
        background: 'rgba(30,41,59,0.52)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${item.color}70`;
        e.currentTarget.style.boxShadow = `0 0 20px ${item.color}24`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div className="w-9 h-9 rounded-lg mb-4" style={{ background: item.color }} />
      <p className="text-sm font-bold text-white" style={{ margin: 0 }}>{item.titulo}</p>
      <p className="text-xs text-slate-500 mt-1" style={{ marginBottom: 0 }}>{item.texto}</p>
    </button>
  );
}

export default function DashboardSuperAdmin() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [labs, setLabs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [operacion, setOperacion] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    Promise.all([
      api.get('/laboratorios?solo_activos=false'),
      api.get('/usuarios'),
      api.get('/reportes/dashboard'),
    ])
      .then(([labsRes, usuariosRes, dashboardRes]) => {
        if (!activo) return;
        setLabs(Array.isArray(labsRes.data) ? labsRes.data : []);
        setUsuarios(Array.isArray(usuariosRes.data) ? usuariosRes.data : []);
        setOperacion(dashboardRes.data || null);
        setError('');
      })
      .catch(() => {
        if (activo) setError('No se pudo cargar el resumen general.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => { activo = false; };
  }, []);

  const resumen = useMemo(() => {
    const activos = usuarios.filter(u => u.activo !== false);
    const porRol = usuarios.reduce((acc, u) => {
      acc[u.rol] = (acc[u.rol] || 0) + 1;
      return acc;
    }, {});
    return {
      labsActivos: labs.filter(l => l.activo !== false).length,
      labsInactivos: labs.filter(l => l.activo === false).length,
      usuariosActivos: activos.length,
      usuariosInactivos: usuarios.length - activos.length,
      adminsLab: porRol.LAB_ADMIN || 0,
      docentes: porRol.DOCENTE || 0,
      administrativos: porRol.ADMINISTRATIVO || 0,
    };
  }, [labs, usuarios]);

  const totalPcs = labs.reduce((sum, lab) => sum + (lab.total_computadoras || 0), 0);
  const alertas = operacion?.alertas?.total ?? 0;
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.18em]" style={{ margin: 0 }}>
              Administracion general
            </p>
            <h1 className="text-2xl font-bold text-white mt-2" style={{ marginBottom: 0 }}>
              Bienvenido, {usuario?.nombre?.split(' ')[0]}
            </h1>
            <p className="text-sm text-slate-400 capitalize mt-1" style={{ marginBottom: 0 }}>{fecha}</p>
          </div>
          <button onClick={() => navigate('/lab')} className="btn-ghost">
            Ver dashboard de laboratorios
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <CardKpi label="Laboratorios activos" value={cargando ? '...' : resumen.labsActivos} sub={`${resumen.labsInactivos} inactivos`} color="#2563eb" />
          <CardKpi label="Usuarios activos" value={cargando ? '...' : resumen.usuariosActivos} sub={`${resumen.usuariosInactivos} inactivos`} color="#7c3aed" />
          <CardKpi label="Administradores lab" value={cargando ? '...' : resumen.adminsLab} sub="Responsables asignados" color="#a855f7" />
          <CardKpi label="Docentes" value={cargando ? '...' : resumen.docentes} sub="Con acceso academico" color="#10b981" />
          <CardKpi label="Equipos registrados" value={cargando ? '...' : totalPcs} sub={`${alertas} alertas operativas`} color={alertas > 0 ? '#ef4444' : '#38bdf8'} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <section className="xl:col-span-2 rounded-xl p-5" style={{ background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white" style={{ margin: 0 }}>Accesos administrativos</h2>
                <p className="text-sm text-slate-500 mt-1" style={{ marginBottom: 0 }}>Gestion global de plataforma, usuarios y modulos institucionales.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ACCESOS.map(item => (
                <AccesoCard key={item.titulo} item={item} onClick={() => navigate(item.ruta)} />
              ))}
            </div>
          </section>

          <section className="rounded-xl p-5" style={{ background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-lg font-bold text-white" style={{ margin: 0 }}>Mapa rapido de laboratorios</h2>
            <div className="mt-4 space-y-3">
              {labs.slice(0, 6).map(lab => (
                <button key={lab.id} onClick={() => navigate(`/admin/laboratorios/${lab.id}`)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate" style={{ margin: 0 }}>{lab.nombre}</p>
                    <p className="text-xs text-slate-500 truncate" style={{ margin: 0 }}>{lab.ubicacion || 'Sin ubicacion'}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-300 shrink-0">{lab.total_computadoras || 0} PCs</span>
                </button>
              ))}
              {!cargando && labs.length === 0 && (
                <p className="text-sm text-slate-500">No hay laboratorios registrados.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
