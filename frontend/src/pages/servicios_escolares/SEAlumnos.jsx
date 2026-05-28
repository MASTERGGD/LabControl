import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { formatApiError } from '../../components/AutocompleteInput';

const ESTADO_FICHA = {
  PENDIENTE_CAPTURA:   { cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30',   label: 'Pendiente captura' },
  BORRADOR:            { cls: 'bg-blue-500/15   text-blue-400   border-blue-500/30',   label: 'Borrador'          },
  ENVIADA:             { cls: 'bg-amber-500/15  text-amber-400  border-amber-500/30',  label: 'Enviada'           },
  REQUIERE_CORRECCION: { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30', label: 'Req. corrección'   },
  VALIDADA:            { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Validada'       },
  RECHAZADA:           { cls: 'bg-red-500/15    text-red-400    border-red-500/30',    label: 'Rechazada'         },
};

function Badge({ estado }) {
  const e = ESTADO_FICHA[estado] || { cls: 'bg-slate-500/15 text-slate-400', label: estado };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${e.cls}`}>
      {e.label}
    </span>
  );
}

// ── Modal activar acceso ──────────────────────────────────────────────────────
function ModalActivarAcceso({ alumno, onClose, onOk }) {
  const [correo, setCorreo]   = useState(alumno.correo_institucional || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  const activar = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post(`/servicios-escolares/alumnos/${alumno.id}/activar-acceso`, {
        correo_institucional: correo.trim() || null,
      });
      setResult(data);
      onOk();
    } catch (e) {
      setError(formatApiError(e, 'Error al activar acceso'));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-1">Activar acceso SIGA</h3>
        <p className="text-slate-400 text-sm mb-4">{alumno.nombre} · {alumno.matricula}</p>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300">
              <p className="font-semibold mb-2">✓ Acceso creado</p>
              <p>Correo: <span className="font-mono">{result.email}</span></p>
              <p className="mt-2 font-semibold text-amber-300">
                Contraseña temporal (entrégala al alumno):
              </p>
              <p className="font-mono text-lg tracking-widest text-white">{result.password_temporal}</p>
              <p className="text-xs text-slate-400 mt-2">Esta contraseña solo se muestra una vez.</p>
            </div>
            <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
          </div>
        ) : (
          <>
            <label className="block text-sm text-slate-400 mb-1">Correo institucional (opcional)</label>
            <input
              type="email"
              value={correo}
              onChange={e => setCorreo(e.target.value)}
              placeholder="matricula@alumno.utecan.edu.mx"
              className="input-dark w-full mb-4"
            />
            <p className="text-xs text-slate-500 mb-4">
              Si no ingresas correo, se asigna automáticamente como {alumno.matricula}@alumno.utecan.edu.mx
            </p>
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="btn-ghost">Cancelar</button>
              <button onClick={activar} disabled={loading} className="btn-primary">
                {loading ? 'Activando…' : 'Activar acceso'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModalResetPassword({ alumno, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const resetear = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/servicios-escolares/alumnos/${alumno.id}/reset-password`);
      setResult(data);
    } catch (e) {
      setError(formatApiError(e, 'Error al restablecer contraseña'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-1">Restablecer contraseña</h3>
        <p className="text-slate-400 text-sm mb-4">{alumno.nombre} · {alumno.matricula}</p>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300">
              <p className="font-semibold mb-2">Nueva contraseña temporal</p>
              <p>Correo: <span className="font-mono">{result.email}</span></p>
              <p className="mt-2 font-semibold text-amber-300">Contraseña:</p>
              <p className="font-mono text-lg tracking-widest text-white">{result.password_temporal}</p>
              <p className="text-xs text-slate-400 mt-2">Entrégala al alumno; solo se muestra en este momento.</p>
            </div>
            <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-4">
              Se generará una nueva contraseña temporal y la cuenta quedará activa.
            </p>
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="btn-ghost">Cancelar</button>
              <button onClick={resetear} disabled={loading} className="btn-primary">
                {loading ? 'Generando...' : 'Generar contraseña'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal activar ficha ───────────────────────────────────────────────────────
function ModalActivarFicha({ alumno, onClose, onOk }) {
  const periodos = (() => {
    const hoy = new Date();
    const mes = hoy.getMonth() + 1;
    const anio = hoy.getFullYear();
    const actual = mes <= 4 ? `ENE-ABR ${anio}` : mes <= 8 ? `MAY-AGO ${anio}` : `SEP-DIC ${anio}`;
    const siguiente = mes <= 4 ? `MAY-AGO ${anio}` : mes <= 8 ? `SEP-DIC ${anio}` : `ENE-ABR ${anio + 1}`;
    return [actual, siguiente];
  })();

  const [periodo, setPeriodo] = useState(periodos[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const activar = async () => {
    setLoading(true); setError('');
    try {
      await api.post(`/servicios-escolares/alumnos/${alumno.id}/fichas?periodo=${encodeURIComponent(periodo)}`);
      onOk();
      onClose();
    } catch (e) {
      setError(formatApiError(e, 'Error al activar ficha'));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-1">Activar estudio socioeconómico</h3>
        <p className="text-slate-400 text-sm mb-4">{alumno.nombre} · {alumno.matricula}</p>

        <label className="block text-sm text-slate-400 mb-1">Periodo</label>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="input-dark w-full mb-4">
          {periodos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={activar} disabled={loading} className="btn-primary">
            {loading ? 'Activando…' : 'Activar ficha'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalCarreras({ onClose }) {
  const [carreras, setCarreras] = useState([]);
  const [form, setForm] = useState({ clave: '', nombre: '', activo: true });
  const [editando, setEditando] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/servicios-escolares/carreras?incluir_inactivas=true');
      setCarreras(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(formatApiError(e, 'Error al cargar carreras'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const limpiar = () => {
    setForm({ clave: '', nombre: '', activo: true });
    setEditando(null);
    setError('');
  };

  const guardar = async () => {
    setError('');
    const payload = {
      clave: form.clave.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      activo: !!form.activo,
    };
    if (!payload.clave || !payload.nombre) {
      setError('Clave y nombre son obligatorios');
      return;
    }
    try {
      if (editando) {
        await api.put(`/servicios-escolares/carreras/${editando.id}`, payload);
      } else {
        await api.post('/servicios-escolares/carreras', payload);
      }
      limpiar();
      cargar();
    } catch (e) {
      setError(formatApiError(e, 'Error al guardar carrera'));
    }
  };

  const editar = carrera => {
    setEditando(carrera);
    setForm({ clave: carrera.clave || '', nombre: carrera.nombre || '', activo: carrera.activo !== false });
    setError('');
  };

  const desactivar = async carrera => {
    setError('');
    try {
      await api.delete(`/servicios-escolares/carreras/${carrera.id}`);
      if (editando?.id === carrera.id) limpiar();
      cargar();
    } catch (e) {
      setError(formatApiError(e, 'Error al desactivar carrera'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-3xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">Catalogo de carreras</h3>
            <p className="text-slate-400 text-sm">Estas carreras alimentan el desplegable del estudio socioeconomico.</p>
          </div>
          <button onClick={onClose} className="btn-ghost px-3">Cerrar</button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr_auto] mb-4">
          <input value={form.clave} onChange={e => setForm(f => ({ ...f, clave: e.target.value }))} placeholder="Clave" className="input-dark" />
          <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre de la carrera" className="input-dark" />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
              Activa
            </label>
            <button onClick={guardar} className="btn-primary whitespace-nowrap">{editando ? 'Actualizar' : 'Agregar'}</button>
            {editando && <button onClick={limpiar} className="btn-ghost">Nuevo</button>}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <div className="rounded-xl border border-white/10 overflow-hidden max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-slate-500 animate-pulse">Cargando...</div>
          ) : carreras.length === 0 ? (
            <div className="p-6 text-center text-slate-500">Sin carreras registradas</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Clave</th>
                  <th className="px-4 py-3 text-left">Carrera</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {carreras.map(c => (
                  <tr key={c.id} className="border-b border-white/5">
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{c.clave}</td>
                    <td className="px-4 py-3 text-white">{c.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${c.activo ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {c.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => editar(c)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30">Editar</button>
                        {c.activo && (
                          <button onClick={() => desactivar(c)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30">Desactivar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SEAlumnos() {
  const [alumnos, setAlumnos]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [busqueda, setBusqueda]     = useState('');
  const [modalAcceso, setModalAcceso]   = useState(null);
  const [modalFicha, setModalFicha]     = useState(null);
  const [modalReset, setModalReset]     = useState(null);
  const [modalCarreras, setModalCarreras] = useState(false);

  const cargar = useCallback(async (q = busqueda) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/servicios-escolares/alumnos?q=${encodeURIComponent(q)}&limit=80`);
      setAlumnos(data.items || []);
      setTotal(data.total || 0);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [busqueda]);

  useEffect(() => { cargar(); }, []);

  const onBuscar = (e) => {
    setBusqueda(e.target.value);
    clearTimeout(window._seTimer);
    window._seTimer = setTimeout(() => cargar(e.target.value), 350);
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Alumnos</h1>
            <p className="text-slate-400 text-sm">{total} alumnos en catálogo</p>
          </div>
          <button onClick={() => setModalCarreras(true)} className="btn-primary ml-auto">
            Carreras
          </button>
        </div>

        {/* Buscador */}
        <div className="glass rounded-2xl p-4">
          <input
            type="text"
            value={busqueda}
            onChange={onBuscar}
            placeholder="🔍 Buscar por nombre o matrícula…"
            className="input-dark w-full"
          />
        </div>

        {/* Tabla */}
        <div className="glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500 animate-pulse">Cargando…</div>
          ) : alumnos.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Sin resultados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Alumno</th>
                    <th className="px-4 py-3 text-left">Carrera / Grupo</th>
                    <th className="px-4 py-3 text-left">Acceso SIGA</th>
                    <th className="px-4 py-3 text-left">Ficha</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {alumnos.map(a => (
                    <tr key={a.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{a.nombre}</p>
                        <p className="text-slate-500 text-xs font-mono">{a.matricula} · {a.periodo}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        <p>{a.carrera}</p>
                        <p className="text-slate-500">{a.cuatrimestre}° · Gpo {a.grupo}</p>
                      </td>
                      <td className="px-4 py-3">
                        {a.tiene_acceso_siga ? (
                          <span className="text-emerald-400 text-xs font-semibold">✓ Activo</span>
                        ) : (
                          <span className="text-slate-500 text-xs">Sin acceso</span>
                        )}
                        {a.correo_institucional && (
                          <p className="text-xs text-slate-600 font-mono truncate max-w-[160px]">{a.correo_institucional}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {a.ficha ? (
                          <Badge estado={a.ficha.estado} />
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {!a.tiene_acceso_siga && (
                            <button
                              onClick={() => setModalAcceso(a)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30"
                            >
                              Dar acceso
                            </button>
                          )}
                          {a.tiene_acceso_siga && (
                            <button
                              onClick={() => setModalReset(a)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30"
                            >
                              Restablecer
                            </button>
                          )}
                          {!a.ficha || ['RECHAZADA'].includes(a.ficha?.estado) ? (
                            <button
                              onClick={() => setModalFicha(a)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30"
                            >
                              Activar ficha
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modalAcceso && (
        <ModalActivarAcceso
          alumno={modalAcceso}
          onClose={() => setModalAcceso(null)}
          onOk={() => { cargar(); }}
        />
      )}
      {modalFicha && (
        <ModalActivarFicha
          alumno={modalFicha}
          onClose={() => setModalFicha(null)}
          onOk={() => cargar()}
        />
      )}
      {modalReset && (
        <ModalResetPassword
          alumno={modalReset}
          onClose={() => setModalReset(null)}
        />
      )}
      {modalCarreras && <ModalCarreras onClose={() => setModalCarreras(false)} />}
    </AdminLayout>
  );
}
