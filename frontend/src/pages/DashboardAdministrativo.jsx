import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

const CATEGORIAS = {
  ACADEMICO: 'Académico',
  ADMINISTRATIVO: 'Administrativo',
  EVENTOS: 'Eventos',
  MANTENIMIENTO: 'Mantenimiento',
  RRHH: 'Recursos Humanos',
  GENERAL: 'General',
  URGENTE: 'Urgente',
};

const ESTADOS = {
  BORRADOR: 'Borrador',
  PUBLICADO: 'Publicado',
  ARCHIVADO: 'Archivado',
};

function StatCard({ label, value, sub, tone = 'blue', onClick }) {
  const tones = {
    blue: 'border-blue-500/25 bg-blue-500/10 text-blue-300',
    emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    red: 'border-red-500/25 bg-red-500/10 text-red-300',
    slate: 'border-white/10 bg-white/5 text-slate-300',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:bg-white/8 ${tones[tone] || tones.blue}`}
    >
      <p className="text-3xl font-black text-white leading-none tabular-nums">{value}</p>
      <p className="text-xs font-bold uppercase tracking-widest mt-3">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </button>
  );
}

function EstadoBadge({ estado }) {
  const cfg = {
    BORRADOR: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
    PUBLICADO: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    ARCHIVADO: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full border ${cfg[estado] || cfg.BORRADOR}`}>
      {ESTADOS[estado] || estado}
    </span>
  );
}

function QuickAction({ title, description, to, primary }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className={`w-full text-left rounded-2xl border p-4 transition-all hover:-translate-y-0.5 ${
        primary
          ? 'border-blue-500/35 bg-blue-600/15 hover:bg-blue-600/20'
          : 'border-white/10 bg-white/4 hover:bg-white/7'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold">{title}</h3>
          <p className="text-sm text-slate-400 mt-1">{description}</p>
        </div>
        <svg className="w-4 h-4 text-slate-500 shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
        </svg>
      </div>
    </button>
  );
}

function fmtDate(value) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(value) {
  if (!value) return null;
  const today = new Date();
  const target = new Date(value);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86_400_000);
}

export default function DashboardAdministrativo() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [comunicados, setComunicados] = useState([]);
  const [pendientes, setPendientes] = useState(null);
  const [misEspacios, setMisEspacios] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [resComunicados, resPendientes, resEspacios] = await Promise.allSettled([
        api.get('/comunicados'),
        api.get('/comunicados/pendientes-count'),
        api.get('/espacios/mis-espacios'),
      ]);
      if (resComunicados.status === 'fulfilled') {
        setComunicados(Array.isArray(resComunicados.value.data) ? resComunicados.value.data : []);
      }
      if (resPendientes.status === 'fulfilled') {
        setPendientes(resPendientes.value.data?.pendientes ?? 0);
      }
      if (resEspacios.status === 'fulfilled') {
        setMisEspacios(Array.isArray(resEspacios.value.data) ? resEspacios.value.data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const hoyIso = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const base = {
      total: comunicados.length,
      BORRADOR: 0,
      PUBLICADO: 0,
      ARCHIVADO: 0,
      urgentes: 0,
      vencenPronto: 0,
      publicadosSemana: 0,
      categorias: {},
    };

    comunicados.forEach(c => {
      if (base[c.estado] !== undefined) base[c.estado] += 1;
      if (c.prioridad === 'URGENTE' || c.categoria === 'URGENTE') base.urgentes += 1;
      const dias = daysUntil(c.fecha_expiracion);
      if (c.estado === 'PUBLICADO' && dias !== null && dias >= 0 && dias <= 7) base.vencenPronto += 1;
      const publicado = c.fecha_publicacion ? new Date(c.fecha_publicacion) : null;
      if (c.estado === 'PUBLICADO' && publicado) {
        const diff = (new Date() - publicado) / 86_400_000;
        if (diff >= 0 && diff <= 7) base.publicadosSemana += 1;
      }
      base.categorias[c.categoria || 'GENERAL'] = (base.categorias[c.categoria || 'GENERAL'] || 0) + 1;
    });
    return base;
  }, [comunicados]);

  const borradores = comunicados
    .filter(c => c.estado === 'BORRADOR')
    .sort((a, b) => new Date(b.actualizado_en || b.creado_en || 0) - new Date(a.actualizado_en || a.creado_en || 0));

  const vencenPronto = comunicados
    .filter(c => c.estado === 'PUBLICADO')
    .map(c => ({ ...c, _dias: daysUntil(c.fecha_expiracion) }))
    .filter(c => c._dias !== null && c._dias >= 0 && c._dias <= 7)
    .sort((a, b) => a._dias - b._dias)
    .slice(0, 4);

  const recientes = [...comunicados]
    .sort((a, b) => new Date(b.actualizado_en || b.creado_en || 0) - new Date(a.actualizado_en || a.creado_en || 0))
    .slice(0, 6);

  const categoriasOrdenadas = Object.entries(stats.categorias)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const depto = usuario?.departamento_nombre || 'Tu departamento';
  const claveDepto = usuario?.departamento_clave;
  const primerNombre = usuario?.nombre?.split(' ')[0] || 'equipo';
  const cuenta = usuario?.email || 'Cuenta administrativa';

  return (
    <AdminLayout>
      <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
          <div className="flex flex-col xl:flex-row xl:items-center gap-4">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400 mb-2">
                Panel de departamento
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-white">{depto}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
                <span className="rounded-full bg-white/6 border border-white/10 px-3 py-1 text-slate-300">
                  {cuenta}
                </span>
                <span className="rounded-full bg-amber-500/12 border border-amber-500/20 px-3 py-1 text-amber-300">
                  Administrativo
                </span>
                {claveDepto && (
                  <span className="rounded-full bg-blue-500/12 border border-blue-500/20 px-3 py-1 text-blue-300">
                    {claveDepto}
                  </span>
                )}
              </div>
              <p className="text-slate-400 mt-4">
                Hola, {primerNombre}. Desde aquí puedes emitir comunicados oficiales, cuidar borradores y revisar el seguimiento editorial de tu departamento.
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/comunicados?nuevo=1')}
              className="btn-blue flex items-center gap-2 self-start xl:self-center"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Emitir comunicado
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <StatCard
            label="Emitidos"
            value={loading ? '...' : stats.total}
            sub="Comunicados del departamento"
            onClick={() => navigate('/admin/comunicados')}
          />
          <StatCard
            label="Publicados"
            value={loading ? '...' : stats.PUBLICADO}
            sub={`${stats.publicadosSemana} esta semana`}
            tone="emerald"
            onClick={() => navigate('/admin/comunicados?estado=PUBLICADO')}
          />
          <StatCard
            label="Borradores"
            value={loading ? '...' : stats.BORRADOR}
            sub={stats.BORRADOR > 0 ? 'Pendientes de publicar' : 'Sin pendientes'}
            tone={stats.BORRADOR > 0 ? 'amber' : 'slate'}
            onClick={() => navigate('/admin/comunicados?estado=BORRADOR')}
          />
          <StatCard
            label="Vencen pronto"
            value={loading ? '...' : stats.vencenPronto}
            sub="En los próximos 7 días"
            tone={stats.vencenPronto > 0 ? 'red' : 'slate'}
            onClick={() => navigate('/admin/comunicados?estado=PUBLICADO')}
          />
          <StatCard
            label="Por leer"
            value={pendientes ?? '...'}
            sub="Recibidos por tu cuenta"
            tone={pendientes > 0 ? 'amber' : 'slate'}
            onClick={() => navigate('/comunicados')}
          />
        </div>

        {(pendientes > 0 || stats.BORRADOR > 0 || stats.vencenPronto > 0) && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300 mb-3">
              Atención requerida
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {stats.BORRADOR > 0 && (
                <button onClick={() => navigate('/admin/comunicados?estado=BORRADOR')}
                  className="text-left rounded-xl bg-black/15 border border-white/8 px-4 py-3 hover:bg-white/5">
                  <p className="text-white font-semibold">{stats.BORRADOR} borrador{stats.BORRADOR !== 1 ? 'es' : ''} sin publicar</p>
                  <p className="text-sm text-slate-400 mt-1">Revisa contenido y destinatarios.</p>
                </button>
              )}
              {stats.vencenPronto > 0 && (
                <button onClick={() => navigate('/admin/comunicados?estado=PUBLICADO')}
                  className="text-left rounded-xl bg-black/15 border border-white/8 px-4 py-3 hover:bg-white/5">
                  <p className="text-white font-semibold">{stats.vencenPronto} comunicado{stats.vencenPronto !== 1 ? 's' : ''} por vencer</p>
                  <p className="text-sm text-slate-400 mt-1">Valida si debe archivarse o extenderse.</p>
                </button>
              )}
              {pendientes > 0 && (
                <button onClick={() => navigate('/comunicados')}
                  className="text-left rounded-xl bg-black/15 border border-white/8 px-4 py-3 hover:bg-white/5">
                  <p className="text-white font-semibold">{pendientes} comunicado{pendientes !== 1 ? 's' : ''} sin leer</p>
                  <p className="text-sm text-slate-400 mt-1">Revisa tu bandeja institucional.</p>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px] gap-4 2xl:gap-6">
          <div className="space-y-4 min-w-0">
            <div className="rounded-2xl border border-white/10 bg-white/4 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-white font-semibold">Estado editorial</h2>
                  <p className="text-sm text-slate-500">Borradores y publicaciones recientes</p>
                </div>
                <button onClick={() => navigate('/admin/comunicados')} className="text-sm text-blue-300 hover:text-blue-200">
                  Ver todos
                </button>
              </div>
              {loading ? (
                <div className="p-5 space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
                </div>
              ) : recientes.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-white font-semibold">Aún no hay comunicados</p>
                  <p className="text-sm text-slate-500 mt-1">Crea el primer aviso oficial del departamento.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/6">
                  {recientes.map(c => (
                    <button key={c.id} onClick={() => navigate(`/admin/comunicados?estado=${c.estado}`)}
                      className="w-full text-left px-5 py-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-white font-semibold truncate">{c.titulo}</p>
                          <p className="text-sm text-slate-500 mt-1 line-clamp-1">{c.contenido}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-600 mt-2">
                            <span>{CATEGORIAS[c.categoria] || c.categoria || 'General'}</span>
                            <span>{fmtDate(c.actualizado_en || c.creado_en)}</span>
                            {c.fecha_expiracion && <span>Vence {fmtDate(c.fecha_expiracion)}</span>}
                          </div>
                        </div>
                        <EstadoBadge estado={c.estado} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-white font-semibold">Borradores</h2>
                    <p className="text-sm text-slate-500">Pendientes de revisión</p>
                  </div>
                  <button onClick={() => navigate('/admin/comunicados?estado=BORRADOR')} className="text-sm text-blue-300 hover:text-blue-200">
                    Abrir
                  </button>
                </div>
                {borradores.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay borradores pendientes.</p>
                ) : (
                  <div className="space-y-3">
                    {borradores.slice(0, 4).map(c => (
                      <button key={c.id} onClick={() => navigate('/admin/comunicados?estado=BORRADOR')}
                        className="w-full text-left rounded-xl border border-white/8 bg-black/10 px-4 py-3 hover:bg-white/5">
                        <p className="text-sm font-semibold text-white truncate">{c.titulo}</p>
                        <p className="text-xs text-slate-500 mt-1">{fmtDate(c.actualizado_en || c.creado_en)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-white font-semibold">Vencen pronto</h2>
                    <p className="text-sm text-slate-500">Publicados próximos a expirar</p>
                  </div>
                  <button onClick={() => navigate('/admin/comunicados?estado=PUBLICADO')} className="text-sm text-blue-300 hover:text-blue-200">
                    Ver
                  </button>
                </div>
                {vencenPronto.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay comunicados por vencer esta semana.</p>
                ) : (
                  <div className="space-y-3">
                    {vencenPronto.map(c => (
                      <button key={c.id} onClick={() => navigate('/admin/comunicados?estado=PUBLICADO')}
                        className="w-full text-left rounded-xl border border-red-500/15 bg-red-500/8 px-4 py-3 hover:bg-red-500/12">
                        <p className="text-sm font-semibold text-white truncate">{c.titulo}</p>
                        <p className="text-xs text-red-300 mt-1">
                          {c._dias === 0 ? 'Vence hoy' : `Vence en ${c._dias} día${c._dias !== 1 ? 's' : ''}`}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <QuickAction
              title="Emitir comunicado"
              description="Crear un aviso oficial desde tu departamento."
              to="/admin/comunicados?nuevo=1"
              primary
            />
            <QuickAction
              title="Revisar borradores"
              description="Continuar comunicados que aún no se publican."
              to="/admin/comunicados?estado=BORRADOR"
            />
            <QuickAction
              title="Ver publicados"
              description="Dar seguimiento a avisos activos."
              to="/admin/comunicados?estado=PUBLICADO"
            />
            <QuickAction
              title="Mis comunicados recibidos"
              description="Leer avisos institucionales dirigidos a tu cuenta."
              to="/comunicados"
            />
            {misEspacios.length > 0 && (
              <>
                <QuickAction
                  title="Bandeja de espacios"
                  description={`Gestionar solicitudes de ${misEspacios.length} sala${misEspacios.length !== 1 ? 's' : ''} asignada${misEspacios.length !== 1 ? 's' : ''}.`}
                  to="/espacios/bandeja"
                  primary
                />
                <QuickAction
                  title="Solicitar sala o espacio"
                  description="Apartar un espacio institucional para una actividad."
                  to="/espacios/apartar"
                />
              </>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Categorías emitidas</p>
              {categoriasOrdenadas.length === 0 ? (
                <p className="text-sm text-slate-500 mt-3">Sin actividad registrada.</p>
              ) : (
                <div className="space-y-3 mt-4">
                  {categoriasOrdenadas.map(([cat, total]) => (
                    <button key={cat} onClick={() => navigate(`/admin/comunicados?categoria=${cat}`)}
                      className="w-full text-left">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-300">{CATEGORIAS[cat] || cat}</span>
                        <span className="text-slate-500">{total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(10, (total / Math.max(1, stats.total)) * 100)}%` }} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Firma institucional</p>
              <p className="text-white font-semibold mt-2">{depto}</p>
              <p className="text-sm text-slate-500 mt-1">
                Los comunicados se emiten automáticamente desde este departamento. Usa el campo de subárea solo si necesitas firmar como una coordinación específica.
              </p>
            </div>

            {misEspacios.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Salas asignadas</p>
                <div className="mt-4 space-y-2">
                  {misEspacios.slice(0, 4).map(esp => (
                    <button key={esp.id} onClick={() => navigate(`/espacios/bandeja?espacio_id=${esp.id}`)}
                      className="w-full text-left rounded-xl border border-white/8 bg-black/10 px-4 py-3 hover:bg-white/5">
                      <p className="text-sm font-semibold text-white">{esp.nombre}</p>
                      <p className="text-xs text-slate-500 mt-1">{esp.ubicacion || esp.tipo || 'Espacio institucional'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
