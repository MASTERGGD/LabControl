<div align="center">

# LabControl - UTECAN

**Plataforma institucional para laboratorios, espacios, comunicados y operación académica**  
Universidad Tecnológica de Candelaria, Campeche, México

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Descripción

LabControl inició como un sistema para administrar laboratorios de cómputo, pero ha evolucionado hacia una plataforma institucional para coordinar laboratorios, salas, espacios, usuarios, sesiones de clase, inventario, reportes y comunicados oficiales. El objetivo es reducir procesos dispersos en grupos de WhatsApp, hojas sueltas o controles manuales, centralizando la operación en un sistema con roles, trazabilidad y paneles adaptados a cada tipo de usuario.

El sistema trabaja con FastAPI, React, SQLAlchemy, PostgreSQL, JWT, WebSockets y una interfaz dark consistente con modales, animaciones, sidebar agrupado y experiencia PWA.

---

## Módulos Implementados

### Autenticación y Roles
- Login con JWT.
- Rutas protegidas en frontend y backend.
- Roles actuales: `SUPER_ADMIN`, `LAB_ADMIN`, `ADMINISTRATIVO`, `DOCENTE`, `ALUMNO`.
- Cambio de contraseña desde la cuenta del usuario.
- Seed automático del primer `SUPER_ADMIN`.

### Laboratorios
- CRUD de laboratorios.
- Gestión de equipos/PC por laboratorio.
- Estados operativos de equipos.
- Vista detalle con mapa de asientos.
- Sesiones de uso libre para administradores.

### Usuarios y Departamentos
- CRUD de usuarios.
- Importación masiva desde Excel.
- Importación de docentes desde plantilla institucional.
- Asignación de usuario a laboratorio cuando aplica.
- Asignación de usuario a departamento.
- Nuevo módulo de departamentos con alta, edición, desactivación e importación por Excel.
- Rol `ADMINISTRATIVO` para usuarios de áreas institucionales.

### Horarios y Reservaciones de Laboratorio
- Creación de horarios por laboratorio y cuatrimestre.
- Vista semanal para docentes.
- Solicitud de turnos por docente.
- Sesiones de clase desde reservaciones confirmadas.
- Resolución de conflictos de reservación.
- Historial de sesiones del docente.

### Salas y Espacios Institucionales
- Registro y administración de espacios fuera del laboratorio.
- Solicitudes de sala o espacio.
- Bandeja de aprobación para administradores.
- Historial de solicitudes por usuario.
- Requerimientos y metadatos por solicitud.

### Comunicados Institucionales
- Gestión de comunicados oficiales separados del sistema de notificaciones.
- Estados: borrador, publicado y archivado.
- Categorías y prioridades.
- Destinatarios por todos los usuarios, rol, usuario específico o departamento.
- Buscador de usuarios al seleccionar destinatarios específicos.
- Departamento emisor del comunicado.
- Confirmación de lectura opcional.
- Bandeja "Mis comunicados" para usuarios.
- Contador de comunicados pendientes en el sidebar.
- Reporte de lecturas por comunicado.
- Los usuarios administrativos pueden gestionar comunicados de su departamento.

### Panel Docente
- Dashboard docente como pantalla de inicio.
- Saludo contextual.
- Sesión activa destacada.
- Próxima clase calculada con cuenta regresiva.
- Stat cards con comunicados pendientes, solicitudes de espacios y clases semanales.
- Accesos a solicitar laboratorio, solicitar sala o espacio y revisar solicitudes.
- Sidebar docente reorganizado para que las acciones sean más comprensibles.

### Sesiones de Clase
- Inicio y cierre de sesión.
- Asignación de alumnos a PCs.
- Registro de observaciones e incidencias.
- Mapa en tiempo real por WebSocket.
- Asistencia por sesión.

### Inventario, Préstamos y Mantenimiento
- Catálogo de activos tecnológicos.
- Importación masiva desde Excel.
- Préstamos de equipos con control de devolución.
- Mantenimiento preventivo.
- Historial de intervenciones.
- Tableros tipo kanban para seguimiento.

### Catálogo Académico y Seguimiento
- Catálogo de alumnos y materias.
- Consulta de persona.
- Historial de alumno.
- Adeudos.
- Reportes mensuales.
- Bitácora/auditoría del sistema.

### UI/UX
- Tema oscuro consistente.
- Sidebar agrupado y colapsable por secciones.
- Modales reutilizables.
- Toasts de éxito/error.
- Selects personalizados.
- Badges y contadores.
- Diseño responsive.
- PWA instalable.

---

## Arquitectura

```txt
labcontrol/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── dependencies.py
│   ├── permissions.py
│   ├── seed.py
│   ├── alembic/
│   │   └── versions/
│   ├── models/
│   │   ├── usuario.py
│   │   ├── departamento.py
│   │   ├── laboratorio.py
│   │   ├── horario.py
│   │   ├── sesion.py
│   │   ├── espacio.py
│   │   ├── comunicado.py
│   │   ├── inventario.py
│   │   ├── catalogo.py
│   │   ├── adeudo.py
│   │   ├── auditoria.py
│   │   └── notificacion.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── usuarios.py
│   │   ├── departamentos.py
│   │   ├── laboratorios.py
│   │   ├── horarios.py
│   │   ├── sesiones.py
│   │   ├── espacios.py
│   │   ├── comunicados.py
│   │   ├── inventario.py
│   │   ├── catalogo.py
│   │   ├── reportes.py
│   │   ├── auditoria.py
│   │   ├── adeudos.py
│   │   └── notificaciones.py
│   └── ws/
│       └── mapa.py
│
├── frontend/
│   ├── public/
│   └── src/
│       ├── App.jsx
│       ├── context/
│       ├── hooks/
│       ├── components/
│       │   ├── AdminLayout.jsx
│       │   ├── SelectDark.jsx
│       │   └── NotificacionesBell.jsx
│       └── pages/
│           ├── DashboardAdmin.jsx
│           ├── DashboardDocente.jsx
│           ├── admin/
│           │   ├── Usuarios.jsx
│           │   ├── Departamentos.jsx
│           │   ├── ComunicadosAdmin.jsx
│           │   ├── EspaciosAdmin.jsx
│           │   └── ...
│           ├── comunicados/
│           │   └── MisComunicados.jsx
│           ├── espacios/
│           │   ├── ApartarEspacio.jsx
│           │   ├── BandejaEspacios.jsx
│           │   └── MisSolicitudes.jsx
│           └── docente/
│               ├── SesionClase.jsx
│               └── SesionActiva.jsx
│
├── docker-compose.yml
├── .env.example
└── INICIAR_LABCONTROL.bat
```

---

## Inicio Rápido

### Requisitos
- Docker Desktop instalado y corriendo.
- Puertos `3000` y `8000` disponibles.

### Con Docker

```bash
git clone https://github.com/MASTERGGD/LabControl.git
cd LabControl
cp .env.example .env
docker-compose up --build
```

URLs:
- Frontend: `http://localhost:3000`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

### En Windows

También puedes ejecutar:

```bat
INICIAR_LABCONTROL.bat
```

---

## Credenciales Iniciales

| Campo | Valor |
|---|---|
| Email | `admin@labcontrol.mx` |
| Contraseña | `admin123` |

Cambia la contraseña después del primer inicio de sesión.

---

## Variables de Entorno

Copia `.env.example` a `.env` y ajusta los valores:

```env
DATABASE_URL=postgresql://usuario:password@localhost:5432/labcontrol
SECRET_KEY=cambia-esta-clave-en-produccion-minimo-32-caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
APP_NAME=LabControl UTECAN
FRONTEND_URL=http://localhost:3000

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASSWORD=tu-app-password
```

---

## Roles

| Rol | Descripción | Acceso principal |
|---|---|---|
| `SUPER_ADMIN` | Administrador global | Todo el sistema |
| `LAB_ADMIN` | Administrador de laboratorio | Laboratorios, sesiones, espacios y comunicados |
| `ADMINISTRATIVO` | Usuario de departamento | Gestión de comunicados de su departamento |
| `DOCENTE` | Profesor | Panel docente, laboratorios, espacios y comunicados propios |
| `ALUMNO` | Alumno | Reservado para crecimiento futuro |

---

## Endpoints Principales

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/auth/login` | Login |
| `GET` | `/auth/me` | Perfil autenticado |
| `GET/POST/PUT/DELETE` | `/usuarios` | Gestión de usuarios |
| `POST` | `/usuarios/bulk-excel` | Carga masiva de usuarios |
| `POST` | `/usuarios/importar-docentes` | Importar docentes |
| `GET/POST/PUT/DELETE` | `/departamentos` | Gestión de departamentos |
| `POST` | `/departamentos/importar` | Importar departamentos desde Excel |
| `GET/POST/PUT/DELETE` | `/laboratorios` | Laboratorios |
| `GET/POST/PUT/DELETE` | `/horarios` | Horarios y reservaciones |
| `GET/POST` | `/sesiones` | Sesiones de clase |
| `GET/POST/PUT/DELETE` | `/espacios` | Espacios institucionales |
| `GET/POST/PUT/DELETE` | `/comunicados` | Comunicados institucionales |
| `GET` | `/comunicados/mis-comunicados` | Comunicados del usuario |
| `GET` | `/comunicados/pendientes-count` | Contador de pendientes |
| `POST` | `/comunicados/{id}/leer` | Marcar como leído |
| `POST` | `/comunicados/{id}/confirmar` | Confirmar lectura |
| `GET` | `/comunicados/{id}/lecturas` | Reporte de lecturas |
| `GET/POST/PUT/DELETE` | `/inventario` | Activos, préstamos y mantenimiento |
| `GET/POST/PUT/DELETE` | `/catalogo` | Alumnos y materias |
| `GET` | `/reportes/mensual` | Reportes mensuales |
| `GET` | `/notificaciones` | Notificaciones |
| `WS` | `/ws/mapa/{lab_id}` | Mapa en tiempo real |

La documentación completa está disponible en Swagger: `http://localhost:8000/docs`.

---

## Modelo de Datos Resumido

```txt
Departamento ──< Usuario
Departamento ──< Comunicado
Comunicado ──< ComunicadoDestinatario
Comunicado ──< ComunicadoLectura

Laboratorio ──< Computadora
Laboratorio ──< HorarioDisponible
HorarioDisponible ──< Reservacion
Reservacion ──< SesionClase
SesionClase ──< AsignacionPC
SesionClase ──< ObservacionPC

EspacioInstitucional ──< SolicitudEspacio
SolicitudEspacio ──< RequerimientoSolicitud

Activo ──< Prestamo
Activo ──< Incidente
Activo ──< MantenimientoPreventivo

Usuario ──< Notificacion
Usuario ──< AuditLog
CatalogoAlumno
CatalogoMateria
Adeudo
```

---

## Stack Tecnológico

### Backend

| Tecnología | Uso |
|---|---|
| Python 3.11 | Lenguaje base |
| FastAPI | API REST y WebSockets |
| SQLAlchemy | ORM |
| Alembic | Migraciones |
| PostgreSQL | Base de datos principal |
| JWT | Autenticación |
| pandas/openpyxl | Importaciones Excel |

### Frontend

| Tecnología | Uso |
|---|---|
| React 18 | Interfaz |
| React Router v6 | Rutas |
| Tailwind CSS | Estilos |
| Axios | Cliente HTTP |
| date-fns | Fechas |

### Infraestructura

| Tecnología | Uso |
|---|---|
| Docker Compose | Backend + frontend |
| Service Worker | PWA |

---

## Despliegue

```bash
git clone https://github.com/MASTERGGD/LabControl.git
cd LabControl
cp .env.example .env
docker-compose up -d --build
```

Para producción, configura `DATABASE_URL`, `SECRET_KEY`, `FRONTEND_URL` y credenciales SMTP reales.

---

## Convención de Commits

```txt
feat:     nueva funcionalidad
fix:      corrección de bug
style:    cambios visuales
refactor: refactor sin cambio funcional
docs:     documentación
chore:    mantenimiento
```

---

## Licencia

MIT © Universidad Tecnológica de Candelaria

<div align="center">
  Desarrollado para la operación académica e institucional de UTECAN.
</div>
