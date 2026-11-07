import { useEffect, useState } from 'react';
import api from './useApi';

export default function useAccesoPracticas(usuario, offlineAccess, ruta) {
  const [acceso, setAcceso] = useState(null);
  const id = usuario?.id;
  const rol = usuario?.rol;
  useEffect(() => {
    let vigente = true;
    let consulta = 0;
    setAcceso(previo => previo?.id === id && rol === 'DOCENTE' && !offlineAccess ? previo : null);
    if (!id || rol !== 'DOCENTE' || offlineAccess) return undefined;
    const actualizar = async () => {
      const actual = ++consulta;
      try {
        const { data } = await api.get('/practicas-laboratorio/acceso-docente', { params: { sin_contexto_periodo: true } });
        if (vigente && actual === consulta) setAcceso({ id, permitido: data?.tiene_practicas === true });
      } catch {
        // Un fallo transitorio no borra un acceso ya confirmado para esta cuenta.
      }
    };
    actualizar();
    window.addEventListener('focus', actualizar);
    window.addEventListener('labcontrol:practicas-updated', actualizar);
    return () => {
      vigente = false;
      window.removeEventListener('focus', actualizar);
      window.removeEventListener('labcontrol:practicas-updated', actualizar);
    };
  }, [id, rol, offlineAccess, ruta]);
  return !offlineAccess && rol === 'DOCENTE' && acceso?.id === id && acceso.permitido;
}
