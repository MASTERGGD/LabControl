import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Laboratorios from './Laboratorios';
import api from '../../hooks/useApi';

jest.mock('../../components/AdminLayout', () => ({ children }) => children);
jest.mock('../../hooks/useApi', () => ({ get: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ usuario: { rol: 'SUPER_ADMIN' } }) }));

test('separa el estado de los laboratorios de las métricas de equipos y capacidad', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const labs = [
    { id: 1, nombre: 'Lab Cómputo', categoria: 'COMPUTO', activo: true, capacidad: 23, total_computadoras: 23, computadoras_activas: 20 },
    { id: 2, nombre: 'Lab Química', categoria: 'QUIMICA', activo: false, capacidad: 25, total_computadoras: 2, computadoras_activas: 2 },
  ];
  api.get.mockImplementation(async url => ({ data: url.startsWith('/laboratorios') ? labs : [] }));

  try {
    await act(async () => root.render(<MemoryRouter><Laboratorios /></MemoryRouter>));
    const summary = () => [...container.querySelectorAll('.glass-sm p')].map(p => p.textContent);
    expect(summary()).toEqual(['2', 'Laboratorios registrados', '1', 'Activos', '1', 'Inactivos']);
    const [computo, quimica] = container.querySelectorAll('section');
    expect(computo.textContent).toContain('20 de 23 PCs activas');
    expect(computo.textContent).toContain('Activo');
    expect(quimica.textContent).toContain('Capacidad registrada: 25 personas/puestos');
    expect(quimica.textContent).toContain('Inactivo');
    expect(quimica.textContent).not.toContain('PCs activas');
    expect(container.textContent).not.toMatch(/Disponibilidad|Disponible|Ocupado/);

    await act(async () => container.querySelector('input[type="checkbox"]').click());
    expect(summary()).toEqual(['2', 'Laboratorios registrados', '1', 'Activos', '1', 'Inactivos']);
    expect(container.textContent).toContain('1 de 2 laboratorios');
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(api.get.mock.calls.filter(([url]) => url.startsWith('/laboratorios'))).toEqual([
      ['/laboratorios?solo_activos=false'],
    ]);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
