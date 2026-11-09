import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DashboardSuperAdmin from './DashboardSuperAdmin';
import api from '../hooks/useApi';

jest.mock('../components/AdminLayout', () => ({ children }) => children);
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ usuario: { nombre: 'Administrador' } }) }));
jest.mock('../hooks/useApi', () => ({ get: jest.fn() }));

test.each([
  [[{ id: 1 }, { id: 2 }], '2'],
  [[], '0'],
  [null, null],
])('muestra el conteo institucional solo con datos confirmados (%j)', async (departamentos, esperado) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  api.get.mockImplementation(async url => {
    if (url === '/departamentos?activo=true') {
      if (departamentos === null) throw new Error('Sin conexión');
      return { data: departamentos };
    }
    if (url === '/laboratorios?solo_activos=false') {
      return { data: [
        { id: 1, nombre: 'Cómputo', categoria: 'COMPUTO', total_computadoras: 63 },
        { id: 2, nombre: 'Química', categoria: 'QUIMICA', capacidad: 25 },
      ] };
    }
    if (url === '/usuarios') return { data: [] };
    throw new Error(`Solicitud inesperada: ${url}`);
  });

  try {
    await act(async () => root.render(<MemoryRouter><DashboardSuperAdmin /></MemoryRouter>));
    const label = [...container.querySelectorAll('p')].find(p => p.textContent === 'Departamentos activos');
    expect(label?.parentElement.nextElementSibling.textContent ?? null).toBe(esperado);
    expect(container.textContent).toContain('63 PCs');
    expect(container.textContent).toContain('25 puestos');
    expect(container.textContent).not.toMatch(/Equipos registrados|alertas operativas|No se pudo cargar el resumen general/);
    expect(api.get).not.toHaveBeenCalledWith('/reportes/dashboard');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
