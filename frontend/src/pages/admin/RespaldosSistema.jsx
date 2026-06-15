import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';

const formatBytes = value => {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
};

const formatDate = value => (
  value ? new Date(value).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }) : 'Sin registros'
);

const errorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

function StatusBadge({ status }) {
  const styles = {
    ok: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    healthy: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    verified: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    degraded: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    not_verified: 'bg-slate-500/15 text-slate-500 border-slate-500/30',
    error: 'bg-red-500/15 text-red-500 border-red-500/30',
    unhealthy: 'bg-red-500/15 text-red-500 border-red-500/30',
    invalid: 'bg-red-500/15 text-red-500 border-red-500/30',
  };
  const labels = {
    ok: 'Correcto',
    healthy: 'Saludable',
    verified: 'Verificado',
    warning: 'Atencion',
    degraded: 'Degradado',
    not_verified: 'Sin verificar',
    error: 'Error',
    unhealthy: 'No saludable',
    invalid: 'Invalido',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${styles[status] || styles.not_verified}`}>
      {labels[status] || status || 'Desconocido'}
    </span>
  );
}

function HealthItem({ title, value, status, detail, icon }) {
  return (
    <div
      className="min-w-0 px-4 py-4 border rounded-lg"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--surface-2)', color: 'var(--accent-primary)' }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{title}</p>
            <p className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>{value}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>
      {detail && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{detail}</p>}
    </div>
  );
}

const IconDatabase = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6c0 1.657 3.582 3 8 3s8-1.343 8-3-3.582-3-8-3-8 1.343-8 3zm0 0v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6m-16 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6"/>
  </svg>
);

const IconFolder = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
  </svg>
);

const IconDisk = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h12l2 2v14H5V4zm3 0v6h8V4M8 17h8"/>
  </svg>
);

const IconClock = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
);

export default function RespaldosSistema() {
  const { toast } = useToast();
  const { themeKey } = useTheme();
  const isDay = themeKey === 'day';
  const [health, setHealth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [workingFile, setWorkingFile] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healthResponse, backupResponse] = await Promise.all([
        api.get('/system/health'),
        api.get('/system/backups'),
      ]);
      setHealth(healthResponse.data);
      setBackups(backupResponse.data.items || []);
    } catch (error) {
      toast(errorMessage(error, 'No se pudo consultar el estado del sistema.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      await api.post('/system/backups');
      toast('Respaldo completo generado y verificado.', 'success');
      await load();
    } catch (error) {
      toast(errorMessage(error, 'No se pudo generar el respaldo.'), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const verify = async filename => {
    setWorkingFile(filename);
    try {
      await api.post(`/system/backups/${encodeURIComponent(filename)}/verify`);
      toast('Integridad verificada correctamente.', 'success');
      await load();
    } catch (error) {
      toast(errorMessage(error, 'El respaldo no supero la verificacion.'), 'error');
    } finally {
      setWorkingFile('');
    }
  };

  const download = async filename => {
    setWorkingFile(filename);
    try {
      const response = await api.get(
        `/system/backups/${encodeURIComponent(filename)}/download`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(errorMessage(error, 'No se pudo descargar el respaldo.'), 'error');
    } finally {
      setWorkingFile('');
    }
  };

  const remove = async filename => {
    if (!window.confirm(`Eliminar definitivamente ${filename}?`)) return;
    setWorkingFile(filename);
    try {
      await api.delete(`/system/backups/${encodeURIComponent(filename)}`);
      toast('Respaldo eliminado.', 'success');
      await load();
    } catch (error) {
      toast(errorMessage(error, 'No se pudo eliminar el respaldo.'), 'error');
    } finally {
      setWorkingFile('');
    }
  };

  const checks = health?.checks || {};
  const lastBackup = health?.last_backup;
  const tableBorder = isDay ? '#E2E8F0' : 'rgba(255,255,255,0.08)';

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Respaldo y continuidad</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Estado operativo y copias completas del sistema
            </p>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--accent-primary)' }}
          >
            <svg className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {generating
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8"/>
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/>}
            </svg>
            {generating ? 'Generando...' : 'Generar respaldo'}
          </button>
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Salud del sistema</h2>
            {health && <StatusBadge status={health.status} />}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <HealthItem title="Base de datos" value={health?.database_engine?.toUpperCase() || 'Consultando'} status={checks.database?.status} detail="Conexion y consulta de prueba" icon={<IconDatabase />} />
            <HealthItem title="Almacenamiento" value={checks.storage?.status === 'ok' ? 'Disponible' : 'No disponible'} status={checks.storage?.status} detail="Directorio de datos con escritura" icon={<IconFolder />} />
            <HealthItem title="Espacio libre" value={checks.disk ? `${Number(checks.disk.free_mb || 0).toLocaleString()} MB` : 'Consultando'} status={checks.disk?.status} detail={checks.disk ? `Minimo configurado: ${checks.disk.minimum_mb} MB` : ''} icon={<IconDisk />} />
            <HealthItem title="Ultimo respaldo" value={lastBackup ? formatDate(lastBackup.created_at) : 'Aun no existe'} status={lastBackup?.integrity || 'not_verified'} detail={`${health?.backup_count || 0} respaldos disponibles`} icon={<IconClock />} />
          </div>
        </section>

        <section className="border rounded-lg overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: tableBorder }}>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Respaldos disponibles</h2>
            <button onClick={load} disabled={loading} className="p-2 rounded-lg disabled:opacity-50" style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }} title="Actualizar" aria-label="Actualizar">
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0011.5 2M18.5 9A7 7 0 007 7"/>
              </svg>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--surface-2)' }}>
                <tr>
                  {['Fecha', 'Base de datos', 'Contenido', 'Tamano', 'Integridad', 'Acciones'].map(label => (
                    <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && backups.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-14 text-center" style={{ color: 'var(--text-muted)' }}>No hay respaldos generados.</td></tr>
                )}
                {loading && backups.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-14 text-center" style={{ color: 'var(--text-muted)' }}>Consultando respaldos...</td></tr>
                )}
                {backups.map(item => {
                  const busy = workingFile === item.filename;
                  return (
                    <tr key={item.filename} className="border-t" style={{ borderColor: tableBorder }}>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text)' }}>
                        <p className="font-medium">{formatDate(item.created_at)}</p>
                        <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>{item.filename}</p>
                      </td>
                      <td className="px-4 py-3 uppercase" style={{ color: 'var(--text-muted)' }}>{item.database_engine || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{item.file_count || 0} archivos</td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{formatBytes(item.size_bytes)}</td>
                      <td className="px-4 py-3"><StatusBadge status={item.integrity} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => verify(item.filename)} disabled={busy} className="p-2 rounded-lg disabled:opacity-40" style={{ color: 'var(--accent-primary)', background: 'var(--surface-2)' }} title="Verificar integridad" aria-label="Verificar integridad">
                            <svg className={`w-4 h-4 ${busy ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5-4a11.9 11.9 0 01-8-3 11.9 11.9 0 01-8 3v3c0 5 3.4 9.2 8 10.4 4.6-1.2 8-5.4 8-10.4V6z"/></svg>
                          </button>
                          <button onClick={() => download(item.filename)} disabled={busy} className="p-2 rounded-lg disabled:opacity-40" style={{ color: 'var(--accent-primary)', background: 'var(--surface-2)' }} title="Descargar" aria-label="Descargar">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg>
                          </button>
                          <button onClick={() => remove(item.filename)} disabled={busy} className="p-2 rounded-lg text-red-500 disabled:opacity-40" style={{ background: 'var(--surface-2)' }} title="Eliminar" aria-label="Eliminar">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12m-10 0l1 13h6l1-13M9 7V4h6v3"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
