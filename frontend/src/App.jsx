import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import PWAInstallBanner from './components/PWAInstallBanner';
import { ROUTE_PERMISSIONS } from './config/permissions';

// Páginas
import Login from './pages/Login';
import CambiarPasswordObligatorio from './pages/CambiarPasswordObligatorio';
import DashboardAdmin from './pages/DashboardAdmin';
import DashboardSuperAdmin from './pages/DashboardSuperAdmin';
import DashboardDocente from './pages/DashboardDocente';
import DashboardAdministrativo from './pages/DashboardAdministrativo';
import DashboardServiciosEscolares from './pages/DashboardServiciosEscolares';
import Laboratorios from './pages/admin/Laboratorios';
import LaboratorioDetalle from './pages/admin/LaboratorioDetalle';
import Usuarios from './pages/admin/Usuarios';
import Departamentos from './pages/admin/Departamentos';
import Horarios from './pages/admin/Horarios';
import Reservaciones from './pages/admin/Reservaciones';
import Inventario from './pages/admin/Inventario';
import InventarioBajas from './pages/admin/InventarioBajas';
import InventarioLevantamientos from './pages/admin/InventarioLevantamientos';
import Prestamos from './pages/admin/Prestamos';
import Mantenimiento from './pages/admin/Mantenimiento';
import Catalogo from './pages/admin/Catalogo';
import Reportes from './pages/admin/Reportes';
import AsistenciaSesion from './pages/admin/AsistenciaSesion';
import HistorialAlumno from './pages/admin/HistorialAlumno';
import Auditoria from './pages/admin/Auditoria';
import RespaldosSistema from './pages/admin/RespaldosSistema';
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
import TutoriaAdmin from './pages/admin/TutoriaAdmin';
import MisTutorados from './pages/docente/MisTutorados';
import ConsultorioMedico from './pages/medico/ConsultorioMedico';
import AlumnoEstudioSocioeconomico from './pages/alumno/AlumnoEstudioSocioeconomico';
import SEAlumnos from './pages/servicios_escolares/SEAlumnos';
import SEFichas from './pages/servicios_escolares/SEFichas';
import AutoAsignacion from './pages/AutoAsignacion';
import ValidarConsulta from './pages/ValidarConsulta';

// ─── Ruta protegida por rol ────────────────────────────────────────────────────
// Usa ROUTE_PERMISSIONS de src/config/permissions.js como fuente de verdad.
// También acepta rolesPermitidos explícito para casos especiales.

function RutaProtegida({ children, rolesPermitidos, permisosPermitidos, path }) {
  const { usuario } = useAuth();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  // Cambio de contraseña obligatorio pendiente: bloquear toda la app.
  // (El backend también lo bloquea; esto evita pantallas rotas.)
  if (usuario.debe_cambiar_password) {
    return <Navigate to="/cambiar-password" replace />;
  }

  // Determinar roles permitidos: parámetro explícito > ROUTE_PERMISSIONS > libre
  const allowed = rolesPermitidos ?? (path ? ROUTE_PERMISSIONS[path] : null);

  const permisos = Array.isArray(permisosPermitidos) ? permisosPermitidos : (permisosPermitidos ? [permisosPermitidos] : []);
  const tienePermiso = permisos.length > 0 && permisos.some(p => usuario.permisos?.includes(p));

  if (allowed && !allowed.includes(usuario.rol) && !tienePermiso) {
    // Excepción: usuarios con acceso_consultorio pueden entrar al consultorio
    if (usuario.acceso_consultorio && allowed.includes('MEDICO')) {
      return children;
    }
    // Redirigir a su propio dashboard si intenta acceder a un área no permitida
    return <Navigate to={RUTAS_POR_ROL[usuario.rol] || '/login'} replace />;
  }

  return children;
}

// ─── Mapa de rutas por rol ─────────────────────────────────────────────────────

const RUTAS_POR_ROL = {
  SUPER_ADMIN: '/admin',
  LAB_ADMIN:   '/lab',
  RESPONSABLE_LAB: '/admin/inventario',
  ADMINISTRATIVO: '/administrativo',
  SERVICIOS_ESCOLARES: '/servicios-escolares',
  TUTORIA_ADMIN: '/admin/tutoria',
  MEDICO:      '/medico/consultorio',
  DOCENTE:     '/docente',
  ALUMNO:      '/alumno/estudio-socioeconomico',
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
      <Route path="/autoasignacion/:token" element={<AutoAsignacion />} />
      <Route path="/validar/consulta/:token" element={<ValidarConsulta />} />

      {/* Cambio de contraseña obligatorio (requiere sesión, sin rol) */}
      <Route path="/cambiar-password" element={<CambiarPasswordObligatorio />} />

      {/* SUPER_ADMIN: dashboard general de plataforma */}
      <Route
        path="/admin"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO','TUTORIA_ADMIN','SERVICIOS_ESCOLARES']}>
            <DashboardSuperAdmin />
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
      <Route
        path="/administrativo"
        element={
          <RutaProtegida rolesPermitidos={['ADMINISTRATIVO']}>
            <DashboardAdministrativo />
          </RutaProtegida>
        }
      />
      <Route
        path="/servicios-escolares"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'SERVICIOS_ESCOLARES']}>
            <DashboardServiciosEscolares />
          </RutaProtegida>
        }
      />
      <Route path="/servicios-escolares/alumnos" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','SERVICIOS_ESCOLARES']}>
          <SEAlumnos />
        </RutaProtegida>
      }/>
      <Route path="/servicios-escolares/estudios-socioeconomicos" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','SERVICIOS_ESCOLARES']}>
          <SEFichas />
        </RutaProtegida>
      }/>

      {/* Admin: Laboratorios */}
      <Route
        path="/admin/laboratorios"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB']}>
            <Laboratorios />
          </RutaProtegida>
        }
      />
      <Route
        path="/admin/laboratorios/:labId"
        element={
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB']}>
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
          <RutaProtegida rolesPermitidos={['SUPER_ADMIN','ADMINISTRATIVO']}>
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
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB', 'ADMINISTRATIVO']} permisosPermitidos={['inventario:write', 'inventario:validar']}>
          <Inventario />
        </RutaProtegida>
      }/>
      <Route path="/admin/inventario/bajas" element={<Navigate to="/admin/inventario?tab=bajas" replace />}/>
      <Route path="/admin/inventario/levantamientos" element={<Navigate to="/admin/inventario?tab=levantamientos" replace />}/>
      <Route path="/admin/prestamos" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB']}>
          <Prestamos />
        </RutaProtegida>
      }/>
      <Route path="/admin/mantenimiento" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN', 'RESPONSABLE_LAB', 'ADMINISTRATIVO']}>
          <Mantenimiento />
        </RutaProtegida>
      }/>
      <Route path="/admin/catalogo" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
          <Catalogo />
        </RutaProtegida>
      }/>
      <Route path="/admin/reportes" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN', 'LAB_ADMIN']}>
          <Reportes />
        </RutaProtegida>
      }/>
      <Route path="/admin/historial-alumno" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
          <HistorialAlumno />
        </RutaProtegida>
      }/>
      <Route path="/admin/auditoria" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
          <Auditoria />
        </RutaProtegida>
      }/>
      <Route path="/admin/respaldos" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
          <RespaldosSistema />
        </RutaProtegida>
      }/>
      <Route path="/admin/adeudos" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
          <Adeudos />
        </RutaProtegida>
      }/>
      <Route path="/admin/consulta-persona" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN']}>
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
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO','DOCENTE']}>
          <ApartarEspacio />
        </RutaProtegida>
      }/>
      <Route path="/espacios/bandeja" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO','DOCENTE']}>
          <BandejaEspacios />
        </RutaProtegida>
      }/>
      <Route path="/espacios/mis-solicitudes" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','ADMINISTRATIVO','DOCENTE']}>
          <MisSolicitudes />
        </RutaProtegida>
      }/>

      {/* Comunicados Institucionales */}
      <Route path="/comunicados" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','RESPONSABLE_LAB','ADMINISTRATIVO','TUTORIA_ADMIN','DOCENTE']}>
          <MisComunicados />
        </RutaProtegida>
      }/>
      <Route path="/admin/comunicados" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','LAB_ADMIN','TUTORIA_ADMIN']} permisosPermitidos="comunicados:write">
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

      {/* Tutoría — panel docente */}
      <Route path="/docente/mis-tutorados" element={
        <RutaProtegida rolesPermitidos={['DOCENTE']}>
          <MisTutorados />
        </RutaProtegida>
      }/>

      {/* Tutoría — panel responsable */}
      <Route path="/admin/tutoria" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','TUTORIA_ADMIN']}>
          <TutoriaAdmin />
        </RutaProtegida>
      }/>
      <Route path="/admin/tutoria/estudio-socioeconomico" element={
        <RutaProtegida rolesPermitidos={['SUPER_ADMIN','SERVICIOS_ESCOLARES']}>
          <Navigate to="/servicios-escolares/estudios-socioeconomicos" replace />
        </RutaProtegida>
      }/>

      {/* Alumno — estudio socioeconomico */}
      <Route path="/alumno" element={
        <RutaProtegida rolesPermitidos={['ALUMNO']}>
          <AlumnoEstudioSocioeconomico />
        </RutaProtegida>
      }/>
      <Route path="/alumno/estudio-socioeconomico" element={
        <RutaProtegida rolesPermitidos={['ALUMNO']}>
          <AlumnoEstudioSocioeconomico />
        </RutaProtegida>
      }/>

      {/* Consultorio Médico */}
      <Route path="/medico/consultorio" element={
        <RutaProtegida rolesPermitidos={['MEDICO','SUPER_ADMIN']}>
          <ConsultorioMedico />
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
