import { useCallback, useEffect, useState } from 'react';
import api from './useApi';

export function normalizarCategoriaLaboratorio(categoria) {
  const normalizada = String(categoria || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  return normalizada === 'AGROINDUSTRIAL' ? 'AGROINDUSTRIA' : normalizada;
}

export default function useCategoriaLaboratorio(laboratorioId) {
  const [datos, setDatos] = useState(null);
  const [revision, setRevision] = useState(0);
  const reintentar = useCallback(() => setRevision(r => r + 1), []);
  useEffect(() => {
    let vigente = true;
    if (!laboratorioId) { setDatos(null); return undefined; }
    setDatos(anterior => ({ id: laboratorioId, categoria: anterior?.id === laboratorioId ? anterior.categoria : '', estado: 'cargando' }));
    api.get(`/laboratorios/${laboratorioId}`)
      .then(({ data }) => {
        const categoria = normalizarCategoriaLaboratorio(data?.categoria);
        if (!categoria) throw new Error('Categoría no disponible');
        if (vigente) setDatos({ id: laboratorioId, categoria, estado: 'listo' });
      })
      .catch(() => {
        if (vigente) setDatos(anterior => ({ id: laboratorioId, categoria: anterior?.id === laboratorioId ? anterior.categoria : '', estado: 'error' }));
      });
    return () => { vigente = false; };
  }, [laboratorioId, revision]);
  const actual = datos?.id === laboratorioId ? datos : null;
  return { categoria: actual?.categoria || '', estado: !laboratorioId ? 'listo' : actual?.estado || 'cargando', reintentar };
}
