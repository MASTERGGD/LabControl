import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import PWAInstallBanner from './components/PWAInstallBanner';
import { ROUTE_PERMISSIONS } from './config/permissions';

// Páginas
import Login from './pages/Login';
import DashboardAdmin from './pages/DashboardAdmin';
import DashboardDocente from './pages/DashboardDocente';
import Laboratorios from './pages/admin/Laboratorios';
import LaboratorioDetalle from './pages/admin/LaboratorioDetalle';
import Usuarios from './pages/admin/Usuarios';
import Departamentos from './pages/admin/Departamentos';
import Horarios from './pages/admin/Horarios';
import Reservaciones from './pages/admin/Reservaciones';
import Inventario from './pages/admin/Inventario';
import Prestamos from './pages/admin/Prestamos';
import Mantenimiento from './pages/admin/Mantenimiento';
import Catalogo from './pages/admin/Catalogo';
import Reportes from './pages/admin/Reportes';
import AsistenciaSesion from './pages/admin/AsistenciaSesion';
import HistorialAlumno from './pages/admin/HistorialAlumno';
import Auditoria from './pages/admin/Auditoria';
import Adeudos from './pages/admin/Adeudos';
import ConsultaPersona from './pages/admin/ConsultaPersona';
import SesionClase from './pages/docente/SesionClase';
import SesionActiva from './pages/docente/SesionActiva';
import MiHistorial from './pages/docente/MiHistorial';
import EspaciosAdmin from './pages/admin/EspaciosAdmin';
import ApartarEspacio from './pages/espacios/ApartarEspacio';
import BandejaEspacios from './pages/espacios/BandejaEspacios';
import MisSolicitudes from './pages/espacios/MisSolicitudes';
import ComunicadosAdmin from './pages/admin/ComunicadosAdmin';
import MisComunicados from './pages/comunicados/MisComunicados';

// ─── Ruta protegida por rol ────────────────────────────────────────────────────
// Usa ROUTE_PERMISSIONS de src/config/permissions.js como fuente de verdad.
// También acepta rolesPermitidos explícito para casos especiales.

function RutaProtegida({ children, rolesPermitidos, path }) {
  const { usuario } = useAuth();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  // Determinar roles permitidos: parámetro explícito > ROUTE_PERMISSIONS > libre
  const allowed = rolesPermitidos ?? (path ? ROUTE_PERMISSIONS[path] : null);

  if (allowed && !allowed.includes(usuario.rol)) {
    // Redirigir a su propio dashboard si intenta acceder a un área no permitida
    return <Navigate to={RUTAS_POR_ROL[usuario.rol] || '/login'} replace />;
  }

  return children;
}

// ─── Mapa de rutas por rol ─────────────────────────────────────────────────────

const RUTAS_POR_ROL = {
  SUPER_ADMIN: '/admin',
  LAB_ADMIN:   '/lab',
  ADMINISTRATIVO: '/admin/comunicados',
  DOCENTE:     '/docente',
  ALUMNO:      '/alumno',
};

// ─── Redireccionador automático post-login ────────────────────────────────────

function RootRedirect() {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  return <Navigate to={RUTAS_POR_ROL[usuario.rol] || '/login'} replace />;
}

// ─── App ───────────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<Login />} />

      {/* SUPER_ADMIN y LAB_ADMIN comparten dashboard de admin */}
      <Route
        path="/admin"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
            <DashboardAdmin />
          </RutaProtegida>
        }
      />
      <Route
        path="/lab"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
            <DashboardAdmin />
          </RutaProtegida>
        }
      />

      {/* Admin: Laboratorios */}
      <Route
        path="/admin/laboratorios"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
            <Laboratorios />
          </RutaProtegida>
        }
      />
      <Route
        path="/admin/laboratorios/:labId"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
            <LaboratorioDetalle />
          </RutaProtegida>
        }
      />

      {/* Admin: Usuarios */}
      <Route
        path="/admin/usuarios"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
            <Usuarios />
          </RutaProtegida>
        }
      />
      <Route
        path="/admin/departamentos"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
            <Departamentos />
          </RutaProtegida>
        }
      />

      {/* Admin: Horarios y Reservaciones */}
      <Route path="/admin/horarios" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN']}>
          <Horarios />
        </RutaProtegida>
      }/>
      <Route path="/admin/reservaciones" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','DOCENTE']}>
          <Reservaciones />
        </RutaProtegida>
      }/>

      {/* Admin: Inventario y Préstamos */}
      <Route path="/admin/inventario" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
          <Inventario />
        </RutaProtegida>
      }/>
      <Route path="/admin/prestamos" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
          <Prestamos />
        </RutaProtegida>
      }/>
      <Route path="/admin/mantenimiento" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
          <Mantenimiento />
        </RutaProtegida>
      }/>
      <Route path="/admin/catalogo" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
          <Catalogo />
        </RutaProtegida>
      }/>
      <Route path="/admin/reportes" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
          <Reportes />
        </RutaProtegida>
      }/>
      <Route path="/admin/historial-alumno" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
          <HistorialAlumno />
        </RutaProtegida>
      }/>
      <Route path="/admin/auditoria" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
          <Auditoria />
        </RutaProtegida>
      }/>
      <Route path="/admin/adeudos" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN']}>
          <Adeudos />
        </RutaProtegida>
      }/>
      <Route path="/admin/consulta-persona" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN']}>
          <ConsultaPersona />
        </RutaProtegida>
      }/>

      {/* Espacios Institucionales */}
      <Route path="/admin/espacios" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
          <EspaciosAdmin />
        </RutaProtegida>
      }/>
      <Route path="/espacios/apartar" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','DOCENTE']}>
          <ApartarEspacio />
        </RutaProtegida>
      }/>
      <Route path="/espacios/bandeja" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','DOCENTE']}>
          <BandejaEspacios />
        </RutaProtegida>
      }/>
      <Route path="/espacios/mis-solicitudes" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','DOCENTE']}>
          <MisSolicitudes />
        </RutaProtegida>
      }/>

      {/* Comunicados Institucionales */}
      <Route path="/comunicados" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO','DOCENTE']}>
          <MisComunicados />
        </RutaProtegida>
      }/>
      <Route path="/admin/comunicados" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO']}>
          <ComunicadosAdmin />
        </RutaProtegida>
      }/>

      {/* Asistencia de sesión — SUPER_ADMIN, LAB_ADMIN y DOCENTE */}
      <Route path="/admin/sesion/:sesionId/asistencia" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN', 'DOCENTE']}>
          <AsistenciaSesion />
        </RutaProtegida>
      }/>

      {/* Sesión activa — accesible para todos los roles autenticados */}
      <Route path="/admin/sesion/:sesionId" element={
        <RutaProtegida path="/admin/sesion/:sesionId">
          <SesionActiva />
        </RutaProtegida>
      }/>

      {/* Docente */}
      <Route path="/docente" element={
        <RutaProtegida rolesPermitidos={['DOCENTE']}>
          <DashboardDocente />
        </RutaProtegida>
      }/>
      <Route path="/docente/horario" element={
        <RutaProtegida rolesPermitidos={['DOCENTE']}>
          <SesionClase />
        </RutaProtegida>
      }/>
      <Route path="/docente/sesion/:sesionId" element={
        <RutaProtegida rolesPermitidos={['DOCENTE','SUPER_ADMIN','LAB_ADMIN']}>
          <SesionActiva />
        </RutaProtegida>
      }/>

      {/* Asistencia accesible para docente */}
      <Route path="/docente/sesion/:sesionId/asistencia" element={
        <RutaProtegida rolesPermitidos={['DOCENTE','SUPER_ADMIN','LAB_ADMIN']}>
          <AsistenciaSesion />
        </RutaProtegida>
      }/>

      {/* Reservaciones también accesibles para docente desde su panel */}
      <Route path="/docente/reservaciones" element={
        <RutaProtegida rolesPermitidos={['DOCENTE']}>
          <Reservaciones />
        </RutaProtegida>
      }/>

      {/* Historial del docente */}
      <Route path="/docente/historial" element={
        <RutaProtegida rolesPermitidos={['DOCENTE']}>
          <MiHistorial />
        </RutaProtegida>
      }/>

      {/* Raíz → redirección inteligente */}
      <Route path="/" element={<RootRedirect />} />

      {/* 404 → login */}
      <Route path="*" element={<Navigate to="/login" replace />} />

    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
            <PWAInstallBanner />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
