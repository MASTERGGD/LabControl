<div align="center">

# 🖥️ LabControl — UTECAN

**Sistema web integral de gestión de laboratorios tecnológicos**  
Universidad Tecnológica de Candelaria · Campeche, México

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📋 Descripción

LabControl es una plataforma full-stack diseñada para administrar de forma centralizada los laboratorios de cómputo, inventario tecnológico, reservaciones de horarios y sesiones de clase en la UTECAN. El sistema opera con arquitectura de roles (SUPER_ADMIN / LAB_ADMIN / DOCENTE), tiempo real mediante WebSockets y capacidad PWA para instalación móvil.

---

## ✨ Funcionalidades implementadas

### 🔐 Autenticación y Roles
- Login con JWT (token expira en 8 h)
- Tres roles: `SUPER_ADMIN`, `LAB_ADMIN`, `DOCENTE`
- Rutas protegidas en frontend y middleware de autorización en backend
- Seed automático del primer `SUPER_ADMIN` al iniciar

### 🏛️ Gestión de Laboratorios
- CRUD completo de laboratorios (nombre, capacidad, descripción, estado)
- Grid de PCs por laboratorio con estados: `OPERATIVO / MANTENIMIENTO / DAÑADO / BAJA`
- Vista detalle con mapa de asientos

### 👤 Gestión de Usuarios
- CRUD de usuarios con roles y asignación a laboratorio
- Importación masiva desde Excel (plantilla oficial UTECAN)
- Importación de docentes desde plantilla institucional
- Filtros por rol y estado, búsqueda con autocomplete
- Selección múltiple para desactivación masiva
- Reset de contraseña con generación automática

### 📅 Horarios y Reservaciones
- Creación de slots de horario por laboratorio y cuatrimestre
- Grid semanal interactivo con drag-select de múltiples celdas
- Sistema de reservaciones con estados: `LIBRE / RESERVADO / BLOQUEADO / EN_DISPUTA`
- Resolución de conflictos de reservación entre docentes
- Visualización por cuatrimestre académico (ENE-ABR / MAY-AGO / SEP-DIC)

### 🖥️ Sesiones de Clase
- Inicio de sesión desde reservación confirmada
- Asignación de alumnos a PCs individuales (búsqueda por matrícula o nombre)
- Reporte de incidencias por PC durante la sesión
- Mapa en tiempo real de PCs ocupadas vía **WebSocket**
- Finalización de sesión con observaciones

### 📦 Inventario de Activos
- Catálogo de activos tecnológicos con código de inventario auto-generado
- Categorías: `COMPUTADORA / IMPRESORA_3D / BRAZO_ROBOTICO / SCANNER / IOT / HERRAMIENTA / MOBILIARIO / OTRO`
- Importación masiva desde Excel con validaciones
- Filtros por laboratorio, categoría y estado
- Vista grid y tabla intercambiables

### 📤 Préstamos de Equipos
- Registro de préstamos con receptor: alumno / docente / personal / externo
- Búsqueda de activos con autocompletado
- Control de devoluciones con fecha límite y alertas de vencimiento
- Estados: `ACTIVO / VENCIDO / DEVUELTO`

### 🔧 Mantenimiento (Kanban + Preventivo + Historial)
- **Tab Kanban**: tarjetas de incidentes en columnas `Reportados → En Revisión → Reparados`
- **Tab Preventivo**: programación de mantenimientos con periodicidad (Semanal / Mensual / Trimestral / Semestral / Anual)
- **Tab Historial**: timeline de intervenciones por equipo
- Auto-detección del laboratorio del LAB_ADMIN
- Combobox de búsqueda de activos por nombre y código

### 🎓 Catálogo Académico
- Alumnos con matrícula, carrera, cuatrimestre, grupo y periodo
- Materias con código, carrera y cuatrimestre oficial
- Importación masiva desde Excel para ambas entidades
- Filtros avanzados de búsqueda

### 📊 Reportes Mensuales
- Resumen ejecutivo por laboratorio y mes/año
- Estadísticas: sesiones, horas de uso, reservaciones, incidencias, alumnos atendidos
- Top 5 docentes por horas de uso
- Top 5 PCs con más incidencias

### 🔔 Notificaciones
- Sistema de notificaciones en la campana del navbar
- Badge con contador de no leídas
- Integración con notificaciones del backend (reservaciones, mantenimiento, préstamos)

### 🎨 UI / UX
- Dark theme glassmorphism consistente en toda la app
- Componentes reutilizables: `SelectDark`, `AutocompleteInput`, `TimeGrid`, `CuatrimestreSelect`
- Cero `<select>` nativos — dropdown 100% custom con backdrop-blur y hover accent
- Modales dark con `ModalConfirmar` (sin `window.confirm`)
- Toasts de feedback (éxito / error / info)
- PWA instalable (service worker + manifest)
- Safe-area insets para móvil con notch

---

## 🏗️ Arquitectura

```
labcontrol/
├── backend/                    # FastAPI (Python 3.11)
│   ├── main.py                 # App entry-point, CORS, routers, seed
│   ├── database.py             # SQLAlchemy engine + SessionLocal
│   ├── dependencies.py         # JWT decode, require_roles()
│   ├── seed.py                 # Crea SUPER_ADMIN si no existe
│   ├── models/
│   │   ├── usuario.py          # Usuario, RolUsuario enum
│   │   ├── laboratorio.py      # Laboratorio, PC
│   │   ├── horario.py          # SlotHorario, Reservacion, EstadoReservacion
│   │   ├── sesion.py           # SesionClase, AsignacionPC, ObservacionPC
│   │   ├── inventario.py       # Activo, Prestamo, MantenimientoPreventivo, HistorialMantenimiento
│   │   ├── catalogo.py         # CatalogoAlumno, CatalogoMateria
│   │   └── notificacion.py     # Notificacion
│   ├── routers/
│   │   ├── auth.py             # POST /auth/login, GET /auth/me
│   │   ├── laboratorios.py     # CRUD labs + PCs
│   │   ├── usuarios.py         # CRUD usuarios + importar Excel
│   │   ├── horarios.py         # Slots + reservaciones + conflictos
│   │   ├── sesiones.py         # Sesiones + asignaciones + WS
│   │   ├── inventario.py       # Activos + préstamos + mantenimiento
│   │   ├── catalogo.py         # Alumnos + materias + importar
│   │   ├── reportes.py         # Reportes mensuales por laboratorio
│   │   └── notificaciones.py   # CRUD notificaciones
│   ├── services/
│   │   └── email.py            # Servicio SMTP (opcional)
│   └── ws/
│       └── mapa.py             # WebSocket ConnectionManager (mapa en tiempo real)
│
├── frontend/                   # React 18 + Tailwind CSS CDN + CRA
│   ├── public/
│   │   ├── index.html          # Tailwind CDN, CSS variables, glassmorphism
│   │   ├── manifest.json       # PWA manifest
│   │   └── sw.js               # Service Worker (cache-first)
│   └── src/
│       ├── App.jsx             # React Router v6, rutas protegidas
│       ├── context/
│       │   ├── AuthContext.jsx  # JWT en localStorage, login/logout
│       │   └── ToastContext.jsx # Sistema de toasts global
│       ├── hooks/
│       │   └── useApi.js        # Axios instance con interceptor JWT
│       ├── components/
│       │   ├── AdminLayout.jsx  # Sidebar + navbar + notificaciones
│       │   ├── SelectDark.jsx   # Dropdown custom dark (reemplaza <select> nativo)
│       │   ├── AutocompleteInput.jsx  # Input con búsqueda y dropdown
│       │   ├── CuatrimestreSelect.jsx # Selector de período académico
│       │   ├── TimeGrid.jsx     # Grid semanal de horarios reutilizable
│       │   └── NotificacionesBell.jsx # Campana con badge
│       └── pages/
│           ├── Login.jsx
│           ├── DashboardAdmin.jsx
│           ├── admin/
│           │   ├── Laboratorios.jsx
│           │   ├── LaboratorioDetalle.jsx
│           │   ├── Usuarios.jsx
│           │   ├── Horarios.jsx
│           │   ├── Reservaciones.jsx
│           │   ├── Inventario.jsx
│           │   ├── Prestamos.jsx
│           │   ├── Mantenimiento.jsx
│           │   ├── Catalogo.jsx
│           │   └── Reportes.jsx
│           └── docente/
│               ├── SesionClase.jsx
│               └── SesionActiva.jsx
│
├── docker-compose.yml          # Backend :8000 + Frontend :3000
├── .env.example                # Plantilla de configuración
└── INICIAR_LABCONTROL.bat      # Script de inicio Windows
```

---

## 🚀 Inicio rápido

### Requisitos previos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- Puertos **3000** y **8000** libres

### Levantar con Docker (recomendado)

```bash
# 1. Clonar el repositorio
git clone https://github.com/MASTERGGD/LabControl.git
cd LabControl

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tu SECRET_KEY, configuración SMTP, etc.

# 3. Levantar todo
docker-compose up --build

# 4. Abrir en el navegador
#   Frontend:        http://localhost:3000
#   API REST:        http://localhost:8000
#   Docs Swagger:    http://localhost:8000/docs
```

### Credenciales iniciales

| Campo | Valor |
|---|---|
| Email | `admin@labcontrol.mx` |
| Contraseña | `admin123` |

> ⚠️ Cambia la contraseña en tu primer inicio de sesión.

### Inicio en Windows (sin Docker)

Ejecuta `INICIAR_LABCONTROL.bat` — levanta backend y frontend en terminales separadas.

---

## ⚙️ Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores:

```env
# Base de datos
DATABASE_URL=sqlite:///./data/labcontrol.db

# JWT — usa un valor aleatorio largo en producción
SECRET_KEY=cambia-esta-clave-en-produccion-minimo-32-caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# App
APP_NAME=LabControl UTECAN
FRONTEND_URL=http://localhost:3000

# SMTP (opcional — para notificaciones por email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASSWORD=tu-app-password
```

---

## 🔑 Roles y permisos

| Rol | Descripción | Acceso |
|---|---|---|
| `SUPER_ADMIN` | Administrador global | Todo el sistema, todos los laboratorios |
| `LAB_ADMIN` | Administrador de laboratorio | Solo su laboratorio asignado |
| `DOCENTE` | Profesor | Reservaciones, sesiones de clase, reporte de incidencias |

---

## 📡 API REST — Endpoints principales

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/auth/login` | Obtener token JWT |
| `GET` | `/auth/me` | Perfil del usuario autenticado |
| `GET/POST/PUT/DELETE` | `/laboratorios` | CRUD laboratorios |
| `GET/POST/PUT/DELETE` | `/laboratorios/{id}/pcs` | CRUD PCs del laboratorio |
| `GET/POST/PUT/DELETE` | `/usuarios` | CRUD usuarios |
| `POST` | `/usuarios/importar-docentes` | Importar docentes desde Excel |
| `GET/POST/PUT/DELETE` | `/horarios/slots` | CRUD slots de horario |
| `GET/POST/PUT/DELETE` | `/horarios/reservaciones` | Gestión de reservaciones |
| `POST` | `/horarios/reservaciones/{id}/resolver-conflicto` | Resolver disputa |
| `GET/POST` | `/sesiones` | Sesiones de clase |
| `WS` | `/ws/mapa/{sesion_id}` | WebSocket mapa en tiempo real |
| `GET/POST/PUT/DELETE` | `/inventario/activos` | CRUD activos |
| `POST` | `/inventario/activos/importar` | Importar activos desde Excel |
| `GET/POST/PUT/DELETE` | `/inventario/prestamos` | Gestión de préstamos |
| `GET/POST/PUT/DELETE` | `/inventario/mantenimientos-preventivos` | Mantenimiento preventivo |
| `GET/POST/PUT/DELETE` | `/catalogo/alumnos` | CRUD catálogo de alumnos |
| `GET/POST/PUT/DELETE` | `/catalogo/materias` | CRUD catálogo de materias |
| `GET` | `/reportes/mensual` | Reporte mensual por laboratorio |
| `GET` | `/notificaciones` | Notificaciones del usuario |

Documentación interactiva completa en `http://localhost:8000/docs` (Swagger UI).

---

## 🛠️ Stack tecnológico

### Backend
| Tecnología | Versión | Uso |
|---|---|---|
| Python | 3.11 | Lenguaje base |
| FastAPI | 0.111 | Framework API REST + WebSockets |
| SQLAlchemy | 2.0 | ORM / modelos de base de datos |
| SQLite | — | Base de datos (dev) / migrable a PostgreSQL |
| python-jose | 3.3 | Generación y validación JWT |
| passlib + bcrypt | — | Hash de contraseñas |
| openpyxl + pandas | — | Importación / exportación Excel |
| python-multipart | — | Subida de archivos |

### Frontend
| Tecnología | Versión | Uso |
|---|---|---|
| React | 18.3 | UI framework |
| React Router | v6 | Enrutamiento SPA |
| Tailwind CSS | CDN | Utilidades de estilos |
| Axios | 1.7 | Cliente HTTP con interceptor JWT |
| date-fns | 3.6 | Manejo de fechas |

### Infraestructura
| Tecnología | Uso |
|---|---|
| Docker + Docker Compose | Contenerización y orquestación |
| Service Worker | PWA — cache offline |

---

## 🗄️ Modelo de datos (resumen)

```
Laboratorio ──< PC
Laboratorio ──< SlotHorario ──< Reservacion >── Usuario(DOCENTE)
Laboratorio ──< SesionClase >── Reservacion
SesionClase ──< AsignacionPC >── CatalogoAlumno
SesionClase ──< ObservacionPC >── PC
Laboratorio ──< Activo ──< HistorialMantenimiento
Activo ──< Prestamo
Activo ──< MantenimientoPreventivo
Usuario ──< Notificacion
CatalogoAlumno (matrícula, carrera, cuatrimestre, grupo)
CatalogoMateria (código, carrera, cuatrimestre oficial)
```

---

## 📱 PWA — Instalación móvil

La app es instalable como PWA en Android y iOS:

1. Abre `http://<IP-del-servidor>:3000` en el navegador del teléfono
2. Toca **"Agregar a pantalla de inicio"**
3. La app funciona como nativa con icono propio

---

## 🚢 Despliegue en producción (VPS)

```bash
# 1. Contratar VPS (recomendado: Hostinger ~$5/mes)
# 2. Instalar Docker en el servidor

# 3. Clonar y configurar
git clone https://github.com/MASTERGGD/LabControl.git
cd LabControl
cp .env.example .env
nano .env   # Cambiar SECRET_KEY, DATABASE_URL a PostgreSQL, SMTP real

# 4. Levantar
docker-compose up -d --build

# 5. (Opcional) Cloudflare Tunnel para HTTPS sin abrir puertos
```

Para cambiar a PostgreSQL en producción, solo actualiza en `.env`:
```env
DATABASE_URL=postgresql://usuario:contraseña@host:5432/labcontrol
```

---

## 📁 Estructura de archivos importantes

| Archivo | Propósito |
|---|---|
| `backend/main.py` | Entry point — registra todos los routers, configura CORS, lanza seed |
| `backend/dependencies.py` | `get_current_user()`, `require_roles()` — middleware de auth |
| `backend/models/` | Modelos SQLAlchemy — definen las tablas |
| `backend/seed.py` | Crea el SUPER_ADMIN inicial si la BD está vacía |
| `frontend/public/index.html` | Tailwind CDN, variables CSS, glassmorphism, animaciones |
| `frontend/src/hooks/useApi.js` | Axios con token JWT automático + redirect al login en 401 |
| `frontend/src/context/AuthContext.jsx` | Estado global de sesión (usuario + token en localStorage) |
| `frontend/src/components/SelectDark.jsx` | Dropdown custom — reemplaza todos los `<select>` nativos |
| `.env.example` | Plantilla de configuración — copiar a `.env` |
| `docker-compose.yml` | Orquestación de servicios (backend + frontend) |

---

## 🤝 Contribuir

1. Fork del repositorio
2. Crear rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m "feat: descripción clara del cambio"`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abrir Pull Request

### Convención de commits
```
feat:     nueva funcionalidad
fix:      corrección de bug
style:    cambios de UI/estilos sin lógica
refactor: refactorización sin cambio de comportamiento
docs:     documentación
chore:    tareas de mantenimiento (deps, config)
```

---

## 📄 Licencia

MIT © 2024 — Universidad Tecnológica de Candelaria

---

<div align="center">
  Desarrollado con ❤️ para la UTECAN · Campeche, México
</div>
