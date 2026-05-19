import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';

const EMPTY = { nombre: '', clave: '', descripcion: '', activo: true };

function ModalDepartamento({ departamento, onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(departamento || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        nombre: form.nombre.trim(),
        clave: form.clave.trim() || null,
        descripcion: form.descripcion?.trim() || null,
        activo: !!form.activo,
      };
      if (departamento) {
        await api.put(`/departamentos/${departamento.id}`, payload);
        toast('Departamento actualizado', 'success');
      } else {
        await api.post('/departamentos', payload);
        toast('Departamento creado', 'success');
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar departamento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-lg shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">{departamento ? 'Editar departamento' : 'Nuevo departamento'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre *</label>
            <input className="input-dark" required value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Dirección Académica" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Clave</label>
            <input className="input-dark" value={form.clave || ''}
              onChange={e => setForm({ ...form, clave: e.target.value })}
              placeholder="Ej: DIR-ACADEMICA" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Descripción</label>
            <textarea className="input-dark resize-none" rows={3} value={form.descripcion || ''}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Responsabilidad o alcance del departamento" />
          </div>
          {departamento && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" className="accent-blue-500" checked={form.activo}
                onChange={e => setForm({ ...form, activo: e.target.checked })} />
              Departamento activo
            </label>
          )}
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-blue disabled:opacity-50">
              {saving ? 'Guardando...' : departamento ? 'Guardar cambios' : 'Crear departamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalImportar({ onClose, onImported }) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    try {
      const data = new FormData();
      data.append('archivo', file);
      const res = await api.post('/departamentos/importar', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast(`Departamentos: ${res.data.resumen.creados} creados, ${res.data.resumen.actualizados} actualizados`, 'success');
      onImported();
    } catch (err) {
      toast(err.response?.data?.detail || 'No se pudo importar el archivo', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="glass w-full max-w-md p-6 space-y-4 shadow-glass animate-fadeUp">
        <div>
          <h3 className="font-semibold text-white">Importar departamentos</h3>
          <p className="text-sm text-slate-400 mt-1">Columnas: nombre, clave, descripcion, activo.</p>
        </div>
        <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white" />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancelar</button>
          <button type="submit" disabled={!file || loading} className="btn-blue disabled:opacity-50">
            {loading ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Departamentos() {
  const { toast } = useToast();
  const [departamentos, setDepartamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(null);
  const [importar, setImportar] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/departamentos');
      setDepartamentos(Array.isArray(data) ? data : []);
    } catch {
      toast('No se pudieron cargar los departamentos', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const desactivar = async dep => {
    try {
      await api.delete(`/departamentos/${dep.id}`);
      toast('Departamento desactivado', 'success');
      cargar();
    } catch (err) {
      toast(err.response?.data?.detail || 'No se pudo desactivar', 'error');
    }
  };

  const visibles = departamentos.filter(dep => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return [dep.nombre, dep.clave, dep.descripcion].filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q));
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Departamentos</h1>
            <p className="text-slate-400 text-sm mt-0.5">Áreas emisoras, responsables administrativos y segmentación institucional.</p>
          </div>
          <button onClick={() => setImportar(true)} className="btn-ghost flex items-center gap-2 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
            </svg>
            Importar
          </button>
          <button onClick={() => setModal('crear')} className="btn-blue flex items-center gap-2 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Nuevo departamento
          </button>
        </div>

        <div className="flex items-center gap-3">
          <input className="input-dark max-w-sm" value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar departamento o clave" />
          <span className="text-sm text-slate-500">{visibles.length} resultado{visibles.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="glass rounded-2xl h-32 animate-pulse" />
        ) : visibles.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <p className="text-white font-semibold">Sin departamentos</p>
            <p className="text-slate-400 text-sm mt-1">Crea o importa las áreas institucionales.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibles.map(dep => (
              <div key={dep.id} className="glass rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-blue-300 font-semibold tracking-wide">{dep.clave}</p>
                    <h3 className="text-white font-semibold truncate mt-1">{dep.nombre}</h3>
                    <p className="text-sm text-slate-400 mt-2 line-clamp-2">{dep.descripcion || 'Sin descripción'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                    dep.activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'
                  }`}>
                    {dep.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setModal(dep)} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-slate-300 hover:bg-white/10">
                    Editar
                  </button>
                  {dep.activo && (
                    <button onClick={() => desactivar(dep)} className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-300 hover:bg-red-500/20">
                      Desactivar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <ModalDepartamento
          departamento={modal === 'crear' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}
      {importar && (
        <ModalImportar
          onClose={() => setImportar(false)}
          onImported={() => { setImportar(false); cargar(); }}
        />
      )}
    </AdminLayout>
  );
}
