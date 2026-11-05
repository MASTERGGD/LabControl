# Changelog — LabControl UTECAN

Historial de desarrollo del sistema. Sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [0c3ff7c] — Flujo de clase y laboratorio — 2026-11-05

### Problema y decisión
Desde el horario se podía cerrar la asistencia y después iniciar el laboratorio desde Reservaciones. Se coordinan ambos registros conservando sus responsabilidades y la asistencia existente.

### Cambios
- Reservaciones crea o reutiliza la clase académica del día y la vincula explícitamente a la sesión de laboratorio. Bloquea iniciar otra sesión si la clase está cerrada, no impartida o en corrección, incluso si el cliente omite el identificador académico o solicita uso libre.
- El horario consulta el estado actual de una clase existente. Para uso de equipos, una reservación faltante produce un aviso en lugar de omitir silenciosamente el laboratorio. La modalidad explícita `SOLO_AULA` mantiene su recorrido académico.
- El cierre docente desde el laboratorio permite revisar equipos y registrar observaciones, y continúa a asistencia y tema. La confirmación académica cierra ambos registros. El cierre directo del laboratorio vinculado se bloquea mientras la asistencia siga abierta.
- Si la clase ya estaba finalizada, Reservaciones dirige a su registro con una explicación, sin iniciar equipos ni modificar asistencias anteriores.
- Se incorporan esta bitácora, una guía de continuidad y una instrucción de lectura para futuras sesiones de trabajo.

### Validación y publicación
Validación final: 7 pruebas nuevas de integración backend aprobadas, 25 suites y 93 pruebas frontend aprobadas, compilación frontend aprobada. La comprobación ampliada de sesiones y docencia tuvo 29 aprobadas y cuatro fallos ya presentes en los registros de la versión original (periodos, historial y fecha de una capacitación); no se presentan como corregidos. No requiere migración de esquema ni modificación de registros históricos.

Publicado el 5 de noviembre de 2026 y verificado a las 20:17 UTC. Railway confirmó SUCCESS para backend (`977ee23e-9ba9-4a71-a52e-f2ed5a0a3293`) y frontend (`05f4dc8b-9547-4a7e-aa4c-59a008301d13`), ambos del commit `0c3ff7c`. Acceso web y API con HTTP 200, salud healthy y seis archivos preservados con SHA-256 coincidente. No se alteraron asistencias reales para comprobar producción: el flujo funcional se validó con datos de prueba aislados.

Alcance: el recorrido integrado de una reservación académica pertenece al docente titular de la carga; no se añadió delegación de captura de asistencia a suplentes. Las sesiones independientes conservan su cierre de laboratorio. La inspección de equipos y las observaciones de entrega se mantienen; la operación institucional de registro sin equipos utiliza la modalidad `SOLO_AULA` configurada en el horario.

## [554e994] — Asistencia online y copia offline — 2026-11-05

Se corrigió un aviso falso de falta de conexión cuando la lista llegaba del servidor pero fallaba su copia cifrada por estar bloqueada. Un fallo opcional de caché ya no duplica cambios de asistencia confirmados. Validación: 11 pruebas dirigidas y compilación aprobadas; despliegues frontend y backend verificados, API saludable y seis archivos preservados comprobados por SHA-256. Publicado.

## [25cff5a] — Remediación de seguridad y persistencia — 2026-11-05

Sesiones persistentes y revocables, controles de acceso a laboratorios y WebSocket, límites de cargas e importaciones, cifrado offline, QR local, cabeceras CSP/HSTS y actualización de dependencias. Frontend migrado a Vite. Archivos preservados antes de configurar el volumen persistente y verificados después del despliegue.

Validación registrada: 48 pruebas finales de seguridad/autenticación aprobadas y 85 pruebas del frontend aprobadas durante la remediación; 12 fallos generales del backend confirmados también en la versión original. Auditoría npm: cero avisos críticos, altos o moderados y cinco bajos de herramientas de pruebas. Publicado y verificado; las sesiones antiguas requirieron nuevo acceso. Esta entrada resume trabajo ya realizado y no constituye una auditoría exhaustiva.

## [1.0.0] — Mayo 2026

Primera versión completa del sistema. Todos los módulos core implementados.

### Módulo 1 — Autenticación y Roles
- `POST /auth/login` — devuelve JWT (8h de expiración)
- `GET /auth/me` — perfil del usuario autenticado
- Middleware `require_roles()` para protección de endpoints
- `AuthContext.jsx` — estado global de sesión con `useAuth()` hook
- `useApi.js` — Axios con interceptor JWT automático y redirect en 401
- Seed automático del primer `SUPER_ADMIN` al iniciar la app
- Página `Login.jsx` con redirección por rol

### Módulo 2 — Gestión de Laboratorios
- CRUD completo: laboratorios + PCs individuales
- Estados de PC: `OPERATIVO / MANTENIMIENTO / DAÑADO / BAJA`
- `LaboratorioDetalle.jsx` — grid visual de asientos por laboratorio
- `AdminLayout.jsx` — sidebar con navegación lateral por módulo

### Módulo 3 — Gestión de Usuarios
- CRUD usuarios con roles (`SUPER_ADMIN / LAB_ADMIN / DOCENTE`)
- Asignación de laboratorio al LAB_ADMIN
- Importación masiva desde Excel (plantilla oficial UTECAN)
- Importación de docentes desde plantilla institucional
- Búsqueda con `AutocompleteInput` + filtros por rol y estado
- Selección múltiple + desactivación masiva con confirmación
- Reset de contraseña con generación automática

### Módulo 4 — Horarios y Reservaciones
- Slots de horario por laboratorio + cuatrimestre académico
- Grid semanal con **drag-select** de múltiples celdas
- Estados: `LIBRE / RESERVADO / BLOQUEADO / EN_DISPUTA`
- Resolución de conflictos entre docentes
- Períodos académicos: ENE-ABR / MAY-AGO / SEP-DIC
- `TimeGrid.jsx` — componente grid reutilizable (Horarios + Reservaciones)
- Celdas EN_DISPUTA: `animate-pulse` + rayas diagonales para accesibilidad daltónica

### Módulo 5 — Sesiones de Clase
- Inicio de sesión desde reservación confirmada
- Asignación de alumnos a PCs por matrícula o nombre (búsqueda en tiempo real)
- Reporte de incidencias por PC durante la sesión activa
- Mapa de PCs en tiempo real con **WebSocket** (`/ws/mapa/{sesion_id}`)
- `ConnectionManager` en `ws/mapa.py` — broadcast a todos los clientes de la sesión
- Finalización de sesión con observaciones y cierre de asignaciones

### Módulo 6 — Inventario de Activos
- Activos tecnológicos con código auto-generado (`INV-YYYY-NNNN`)
- 8 categorías: COMPUTADORA / IMPRESORA_3D / BRAZO_ROBOTICO / SCANNER / IOT / HERRAMIENTA / MOBILIARIO / OTRO
- Importación masiva Excel con validaciones de formato
- Vista grid y tabla intercambiable
- Filtros: laboratorio, categoría, estado

### Módulo 7 — Préstamos de Equipos
- Registro con tipo receptor: alumno / docente / personal / externo
- Búsqueda de activos con autocompletado por nombre y código
- Devoluciones con fecha límite y alertas de vencimiento
- Estados: `ACTIVO / VENCIDO / DEVUELTO`

### Módulo 8 — Mantenimiento
- **Tab Kanban**: tarjetas de incidentes en 3 columnas (Reportados → En Revisión → Reparados)
- **Tab Preventivo**: programación con periodicidad Semanal / Mensual / Trimestral / Semestral / Anual
- **Tab Historial**: timeline de intervenciones por equipo
- Auto-detección de laboratorio para LAB_ADMIN
- Modelos nuevos: `MantenimientoPreventivo`, `HistorialMantenimiento`

### Módulo 9 — Catálogo Académico
- `CatalogoAlumno`: matrícula, carrera, cuatrimestre, grupo, periodo
- `CatalogoMateria`: código, nombre, carrera, cuatrimestre oficial
- Importación masiva Excel para ambas entidades
- Base de datos de alumnos para búsqueda en sesiones de clase

### Módulo 10 — Reportes Mensuales
- Resumen ejecutivo por laboratorio + mes + año
- KPIs: sesiones totales, horas de uso, reservaciones, incidencias, alumnos atendidos
- Top 5 docentes por horas de uso
- Top 5 PCs con más incidencias reportadas

### Módulo 11 — Notificaciones
- Modelo `Notificacion` con campos: titulo, mensaje, tipo, leida, fecha
- `NotificacionesBell.jsx` — campana en navbar con badge contador (polling 30s)
- Integración automática en: creación de reservaciones, préstamos vencidos, mantenimiento
- Servicio SMTP opcional (`services/email.py`) configurable vía `.env`

### UI — Dark Glassmorphism Theme (refactor completo)
- CSS variables globales definidas en `frontend/public/index.html`:
  `--bg`, `--surface`, `--surface-2`, `--border`, `--blue`, `--emerald`, `--glass-bg`
- Clases utilitarias globales: `.glass`, `.glass-sm`, `.glass-dark`, `.input-dark`,
  `.btn-blue`, `.btn-emerald`, `.btn-ghost`, `.nav-active`, `.nav-item`
- **`SelectDark.jsx`** — dropdown 100% custom en React:
  - Fondo: `rgba(15,23,42,0.97)` + `backdrop-filter: blur(12px)`
  - Sin borde negro del OS — usa `rgba(255,255,255,0.10)`
  - Hover: `rgba(59,130,246,0.18)` + borde izquierdo 2px `#3b82f6`
  - Texto: `text-slate-300` → `text-white` en hover
  - Navegación por teclado: ArrowUp/Down/Enter/Escape
  - Checkmark SVG en opción seleccionada activa
  - Click-outside detectado con `useRef` + `mousedown` listener
  - Reemplaza **todos** los `<select>` nativos en la aplicación
- **`ModalConfirmar`** — componente de confirmación dark (elimina `window.confirm()`):
  - `fixed inset-0 bg-black/70 backdrop-blur-sm` + `.glass rounded-2xl`
  - Botón Aceptar con degradado rojo: `linear-gradient(135deg,#ef4444,#dc2626)`
- `ToastContext.jsx` — sistema de toasts global (éxito / error / info)
- Animaciones: `fadeUp`, `slideInRight`, `slideInUp`, `spin`, `pulse`, `disputaPulse`
- Scrollbar personalizada (5px, `#334155`)
- Safe-area insets para móvil con notch

### PWA
- `manifest.json` — nombre, íconos, colores
- `sw.js` — Service Worker cache-first
- Íconos: 16, 32, 192, 512px + apple-touch-icon 180px
- Safe-area insets: `env(safe-area-inset-bottom/left/right)`

### Scripts de Windows
- `INICIAR_LABCONTROL.bat` — levanta backend + frontend en terminales separadas
- `DETENER_LABCONTROL.bat` — mata los procesos
- `AGREGAR_AL_INICIO_WINDOWS.bat` / `QUITAR_DEL_INICIO_WINDOWS.bat` — autostart

### Infraestructura
- `docker-compose.yml` — backend `:8000` + frontend `:3000`
- `.env.example` — plantilla completa de configuración
- `.gitignore` — Python, venv, .env, *.db, node_modules, build, logs, IDE, OS

---

## Próximas versiones (backlog)

### [1.1.0] — Pendiente
- [ ] Portal del Alumno (ver asignación de PC activa)
- [ ] Notificaciones push via n8n + Telegram Bot
- [ ] Exportar reportes a PDF

### [1.2.0] — Pendiente
- [ ] Solicitud de laboratorio alternativo (inter-laboratorio)
- [ ] Dashboard docente con historial personal
- [ ] Calendario global de todos los labs

### [2.0.0] — Futuro
- [ ] PostgreSQL en producción
- [ ] CI/CD con GitHub Actions
- [ ] Login de alumnos para ver asignación activa
- [ ] Modo oscuro/claro toggle
