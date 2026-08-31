import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../hooks/useApi';
import { useAuth } from './AuthContext';

const PeriodoContext = createContext(null);
const PERIODO_ID_KEY = 'siga_periodo_id';
const PERIODO_CLAVE_KEY = 'siga_periodo_clave';
const PERIODO_HISTORICO_KEY = 'siga_periodo_historico';

function guardarPeriodo(periodo) {
  if (!periodo) return;
  sessionStorage.setItem(PERIODO_ID_KEY, String(periodo.id));
  sessionStorage.setItem(PERIODO_CLAVE_KEY, periodo.clave);
  sessionStorage.setItem(PERIODO_HISTORICO_KEY, periodo.es_actual ? '0' : '1');
}

export function PeriodoProvider({ children }) {
  const { usuario } = useAuth();
  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!usuario) {
      setPeriodos([]);
      setPeriodo(null);
      return;
    }

    setCargando(true);
    api.get('/calendario-academico/periodos', { params: { sin_contexto_periodo: true } })
      .then(({ data }) => {
        const disponibles = Array.isArray(data) ? data : [];
        const guardado = sessionStorage.getItem(PERIODO_ID_KEY);
        const seleccionado = disponibles.find(item => String(item.id) === guardado)
          || disponibles.find(item => item.es_actual)
          || disponibles[0]
          || null;
        setPeriodos(disponibles);
        setPeriodo(seleccionado);
        guardarPeriodo(seleccionado);
      })
      .catch(() => {
        setPeriodos([]);
        setPeriodo(null);
      })
      .finally(() => setCargando(false));
  }, [usuario?.id]);

  const actualizarPeriodo = useCallback((cambios) => {
    setPeriodos(actuales => actuales.map(item => item.id === cambios.id ? { ...item, ...cambios } : item));
    setPeriodo(actual => {
      if (actual?.id !== cambios.id) return actual;
      const siguiente = { ...actual, ...cambios };
      guardarPeriodo(siguiente);
      return siguiente;
    });
  }, []);

  const seleccionarPeriodo = useCallback((periodoId) => {
    const siguiente = periodos.find(item => String(item.id) === String(periodoId));
    if (!siguiente || siguiente.id === periodo?.id) return;
    guardarPeriodo(siguiente);
    setPeriodo(siguiente);
    window.dispatchEvent(new CustomEvent('siga:periodo-cambiado', { detail: siguiente }));
    window.location.reload();
  }, [periodo?.id, periodos]);

  const value = useMemo(() => ({
    periodos,
    periodo,
    periodoActual: periodos.find(item => item.es_actual) || null,
    esHistorico: Boolean(periodo && !periodo.es_actual),
    esPreparacion: periodo?.estado_periodo === 'PREPARACION',
    esCerrado: periodo?.estado_periodo === 'CERRADO',
    cargando,
    seleccionarPeriodo,
    actualizarPeriodo,
  }), [cargando, periodo, periodos, seleccionarPeriodo, actualizarPeriodo]);

  return <PeriodoContext.Provider value={value}>{children}</PeriodoContext.Provider>;
}

export function usePeriodo() {
  const context = useContext(PeriodoContext);
  if (!context) throw new Error('usePeriodo debe usarse dentro de PeriodoProvider');
  return context;
}
