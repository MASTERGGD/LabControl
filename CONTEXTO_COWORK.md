# LabControl UTECAN — Contexto del Proyecto (v1.0 — Mayo 2026)

> Este archivo es la fuente de verdad del proyecto para sesiones de Claude / Cowork.
> Actualízalo cuando se agreguen módulos o cambie la arquitectura.

---

## ¿Qué es este proyecto?

Plataforma web multi-laboratorio para la **Universidad Tecnológica de Candelaria (UTECAN)**,
Candelaria, Campeche, México. Gestiona 4 laboratorios de cómputo con control de horarios,
sesiones de clase, inventario de equipos, préstamos, mantenimiento y reportes institucionales.

**Repositorio:** https://github.com/MASTERGGD/LabControl  
**Estado:** v1.0 funcional — todos los módulos core implementados

---

## Responsable del proyecto

**Mtro. Gilberto García Delgado (Profe Gil)**  
Docente y asesor técnico de UTECAN  
Perfil técnico: Python, FastAPI, n8n, Docker, Telegram bots, SQL Server, VirtualBox

---

## Stack tecnológico (FINAL)

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Backend | FastAPI 0.111 + Python 3.11 | ORM SQLAlchemy 2.0 |
| Base de datos | SQLite (dev) | Solo cambiar DATABASE_URL para PostgreSQL |
| Auth | JWT (python-jose) + bcrypt | Token 8h, roles en payload |
| WebSockets | FastAPI WebSockets nativos | Mapa de PCs en tiempo real |
| Frontend | React 18.3 + CRA | React Router v6 |
| Estilos | Tailwind CSS CDN + CSS vars globales | Dark glassmorphism theme |
| HTTP client | Axios 1.7 | Interceptor JWT automático |
| Deploy | Docker + Docker Compose | backend :8000, frontend :3000 |
| Acceso externo | Cloudflare Tunnel | Starlink/CGNAT en UTECAN |
| Notif. email | SMTP (opcional) | Configurable en .env |

---

## Roles del sistema

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| `SUPER_ADMIN` | Administrador global institucional | Todo: todos los labs, todos los usuarios |
| `LAB_ADMIN` | Administrador de un laboratorio específico | Solo su laboratorio asignado |
| `DOCENTE` | Profesor | Reservaciones, sesiones, reporte incidencias |
| `ALUMNO` | Fase futura — no implementado en v1.0 | — |

---

## Módulos implementados (v1.2 — Mayo 2026 — ESTADO REAL)

### ✅ Auth
- POST `/auth/login` → JWT (8h)
- GET `/auth/me` → perfil actual
- `require_roles()` decorator en todos los endpoints protegidos
- Seed automático: crea SUPER_ADMIN si BD vacía

### ✅ Laboratorios
- CRUD completo de laboratorios
- Grid de PCs por laboratorio (estados: OPERATIVO / MANTENIMIENTO / DAÑADO / BAJA)
- `LaboratorioDetalle.jsx` — mapa visual de asientos

### ✅ Usuarios
- CRUD con roles y asignación a laboratorio
- Importación masiva Excel (plantilla oficial UTECAN)
- Importación docentes desde plantilla institucional
- Selección múltiple + desactivación masiva con `ModalConfirmar`
- Reset de contraseña automático
- Filtros: rol, estado; búsqueda con `AutocompleteInput`

### ✅ Horarios y Reservaciones
- Slots de horario por lab + cuatrimestre
- Grid semanal con **drag-select** de múltiples celdas
- Estados: `LIBRE / RESERVADO / BLOQUEADO / EN_DISPUTA`
- Resolución de conflictos entre docentes
- Períodos: ENE-ABR / MAY-AGO / SEP-DIC
- Componente compartido `TimeGrid.jsx`
- Celdas EN_DISPUTA con animación `animate-pulse` + rayas diagonales (accesibilidad daltónica)

### ✅ Sesiones de Clase
- Inicio de sesión desde reservación confirmada
- Asignación de alumnos a PCs por matrícula o nombre
- Reporte de incidencias por PC durante sesión
- Mapa en tiempo real vía **WebSocket** (`/ws/mapa/{sesion_id}`)
- Finalización con observaciones

### ✅ Inventario
- Activos tecnológicos con código auto-generado (`INV-YYYY-NNNN`)
- Categorías: COMPUTADORA / IMPRESORA_3D / BRAZO_ROBOTICO / SCANNER / IOT / HERRAMIENTA / MOBILIARIO / OTRO
- Importación masiva Excel con validaciones
- Vista grid y tabla intercambiable
- Filtros: laboratorio, categoría, estado

### ✅ Préstamos
- Receptor: alumno / docente / personal / externo
- Búsqueda de activos con autocompletado
- Devoluciones + alertas de vencimiento
- Estados: ACTIVO / VENCIDO / DEVUELTO

### ✅ Mantenimiento (3 pestañas)
- **Kanban**: Reportados → En Revisión → Reparados
- **Preventivo**: periodicidad Semanal/Mensual/Trimestral/Semestral/Anual
- **Historial**: timeline de intervenciones por equipo
- LAB_ADMIN ve solo su laboratorio automáticamente

### ✅ Catálogo Académico
- Alumnos: matrícula, carrera, cuatrimestre, grupo, periodo
- Materias: código, carrera, cuatrimestre oficial
- Importación masiva Excel para ambas entidades

### ✅ Reportes Mensuales
- Resumen por laboratorio + mes/año
- Estadísticas: sesiones, horas uso, reservaciones, incidencias, alumnos
- Top 5 docentes por horas; Top 5 PCs con más incidencias

### ✅ Notificaciones
- Campana en navbar con badge de no leídas
- Integrada en reservaciones, mantenimiento, préstamos
- SMTP opcional para notificaciones por email

### ✅ UI / UX — Dark Glassmorphism Theme
- CSS variables globales en `index.html`: `--bg`, `--surface`, `--border`, `--blue`, `--emerald`
- Clases globales: `.glass`, `.glass-sm`, `.glass-dark`, `.input-dark`, `.btn-blue`, `.btn-emerald`, `.btn-ghost`
- **`SelectDark.jsx`** — dropdown 100% custom (elimina todos los `<select>` nativos):
  - Fondo: `rgba(15,23,42,0.97)` + `backdrop-filter: blur(12px)`
  - Borde: `rgba(255,255,255,0.10)` — sin borde negro sólido del OS
  - Hover: `bg-blue-600/20` + borde izquierdo 2px azul sólido
  - Teclado: ArrowUp/Down/Enter/Escape
  - Checkmark SVG en opción seleccionada
- **`ModalConfirmar`** — diálogos de confirmación dark (sin `window.confirm`)
- `AutocompleteInput.jsx` — input con dropdown de búsqueda
- `CuatrimestreSelect.jsx` — selector de período académico (wraps SelectDark)
- `NotificacionesBell.jsx` — campana con polling cada 30s
- Toast system via `ToastContext.jsx`
- PWA: service worker cache-first + manifest + safe-area insets

---

## Estructura de archivos clave

```
labcontrol/
├── backend/
│   ├── main.py           ← entry point, CORS, routers, seed
│   ├── database.py       ← SQLAlchemy engine + SessionLocal
│   ├── dependencies.py   ← get_current_user(), require_roles()
│   ├── seed.py           ← SUPER_ADMIN inicial
│   ├── models/
│   │   ├── usuario.py    ← Usuario, RolUsuario(SUPER_ADMIN/LAB_ADMIN/DOCENTE)
│   │   ├── laboratorio.py← Laboratorio, PC, EstadoPC
│   │   ├── horario.py    ← SlotHorario, Reservacion, EstadoReservacion
│   │   ├── sesion.py     ← SesionClase, AsignacionPC, ObservacionPC
│   │   ├── inventario.py ← Activo, Prestamo, MantenimientoPreventivo, HistorialMantenimiento
│   │   ├── catalogo.py   ← CatalogoAlumno, CatalogoMateria
│   │   └── notificacion.py← Notificacion
│   ├── routers/
│   │   ├── auth.py
│   │   ├── laboratorios.py
│   │   ├── usuarios.py   ← incluye importar-docentes
│   │   ├── horarios.py   ← slots + reservaciones + resolver-conflicto
│   │   ├── sesiones.py   ← sesiones + asignaciones + WS
│   │   ├── inventario.py ← activos + préstamos + mantenimiento
│   │   ├── catalogo.py
│   │   ├── reportes.py
│   │   └── notificaciones.py
│   ├── services/
│   │   └── email.py      ← SMTP opcional
│   └── ws/
│       └── mapa.py       ← WebSocket ConnectionManager
│
├── frontend/src/
│   ├── App.jsx           ← React Router v6, rutas protegidas por rol
│   ├── context/
│   │   ├── AuthContext.jsx  ← JWT localStorage, login/logout, useAuth()
│   │   └── ToastContext.jsx ← useToast() global
│   ├── hooks/
│   │   ├── useApi.js     ← Axios + interceptor JWT + redirect 401
│   │   ├── useWebSocket.js
│   │   └── usePWAInstall.js
│   ├── components/
│   │   ├── AdminLayout.jsx      ← sidebar + navbar + campana
│   │   ├── SelectDark.jsx       ← ⭐ dropdown custom — reemplaza TODOS los <select>
│   │   ├── AutocompleteInput.jsx← búsqueda con dropdown
│   │   ├── CuatrimestreSelect.jsx← período académico (wraps SelectDark)
│   │   ├── TimeGrid.jsx         ← grid semanal compartido (Horarios + Reservaciones)
│   │   └── NotificacionesBell.jsx
│   └── pages/
│       ├── Login.jsx
│       ├── DashboardAdmin.jsx
│       ├── DashboardDocente.jsx
│       ├── admin/
│       │   ├── Laboratorios.jsx
│       │   ├── LaboratorioDetalle.jsx
│       │   ├── Usuarios.jsx
│       │   ├── Horarios.jsx
│       │   ├── Reservaciones.jsx
│       │   ├── Inventario.jsx
│       │   ├── Prestamos.jsx
│       │   ├── Mantenimiento.jsx ← 3 tabs: Kanban + Preventivo + Historial
│       │   ├── Catalogo.jsx
│       │   └── Reportes.jsx
│       └── docente/
│           ├── SesionClase.jsx   ← lista de reservaciones del docente
│           └── SesionActiva.jsx  ← mapa PCs + WebSocket + asignaciones
│
├── frontend/public/
│   ├── index.html    ← Tailwind CDN + CSS vars globales + glassmorphism
│   ├── manifest.json ← PWA
│   └── sw.js         ← Service Worker cache-first
│
├── docker-compose.yml
├── .env.example
├── INICIAR_LABCONTROL.bat   ← inicio rápido Windows (sin Docker)
└── README.md                ← documentación completa del proyecto
```

---

## Infraestructura actual (producción)

- **Servidor**: PC de escritorio en laboratorio UTECAN (Windows)
- **Internet**: Starlink con IP dinámica + CGNAT
- **Acceso externo**: Cloudflare Tunnel (gratis, sin abrir puertos)
- **Migración futura**: VPS Hostinger ~$5/mes — mismo `docker-compose.yml`, solo `.env`

---

## Decisiones de diseño importantes

1. **SQLAlchemy ORM** — cambiar SQLite → PostgreSQL = solo cambiar `DATABASE_URL` en `.env`
2. **Docker desde el inicio** — migración a VPS = `git pull && docker-compose up -d`
3. **Alumnos sin login (v1.0)** — el docente busca por nombre/matrícula al asignar PC
4. **`SelectDark.jsx` reemplaza TODOS los `<select>` nativos** — el OS no permite styling de dropdown options; la solución es un componente React completamente custom con `<button>` + `<ul>` flotante
5. **`ModalConfirmar` reemplaza `window.confirm()`** — dark glassmorphism, sin diálogos del navegador
6. **Tailwind CDN (no build)** — se evitó webpack/Vite para simplificar el deploy; Tailwind corre directo en browser
7. **CSS variables en `index.html`** — estilos base disponibles globalmente sin imports
8. **WebSocket nativo FastAPI** — sin Socket.IO, sin dependencias extra
9. **Notificaciones SMTP opcionales** — el sistema funciona sin email; SMTP se activa con vars de entorno

---

## Patrones de código frecuentes

### Endpoint protegido backend
```python
@router.get("/recurso")
def listar(db: Session = Depends(get_db), current: Usuario = Depends(require_roles(["SUPER_ADMIN", "LAB_ADMIN"]))):
    ...
```

### Uso de SelectDark en formulario
```jsx
import SelectDark from '../../components/SelectDark';

// Simple (onChange recibe el value directamente)
<SelectDark value={filtro} onChange={setFiltro} options={[{value:'A', label:'Opción A'}]} />

// En formulario con handleChange
<SelectDark
  value={form.campo}
  onChange={v => handleChange({ target: { name: 'campo', value: v } })}
  options={opciones}
/>
```

### ModalConfirmar (patrón)
```jsx
const [confirmModal, setConfirmModal] = useState(false);

// Disparar
<button onClick={() => setConfirmModal(true)}>Eliminar</button>

// Render
{confirmModal && (
  <ModalConfirmar
    mensaje="¿Eliminar elemento?"
    detalle="Esta acción no se puede deshacer."
    labelAceptar="Eliminar"
    onAceptar={() => { eliminar(); setConfirmModal(false); }}
    onCancelar={() => setConfirmModal(false)}
  />
)}
```

### useApi (Axios con JWT)
```jsx
import useApi from '../../hooks/useApi';
const api = useApi();

const data = await api.get('/laboratorios');
await api.post('/laboratorios', payload);
```

---

## Módulos post-v1.0 (construidos en sesiones Cowork — Mayo 2026)

### ✅ Auditoría (AuditLog)
- `models/auditoria.py` → tabla `audit_logs`: usuario, accion, entidad, entidad_id, detalle, ip, timestamp
- `services/auditoria.py` → `registrar_accion()` integrado en todos los routers existentes
- `routers/auditoria.py` → GET `/auditoria/acciones` con filtros: usuario, accion, entidad, fechas
- `pages/admin/Auditoria.jsx` → tabla paginada con filtros; solo SUPER_ADMIN
- Migración Alembic: `1722d0e1feba_add_audit_logs.py`

### ✅ Adeudos / Responsabilidades
- `models/adeudo.py` → modelo unificado: persona_tipo (ALUMNO/DOCENTE/PERSONAL/EXTERNO), nombre, matricula/num_empleado, concepto (PRESTAMO/INCIDENTE/OTRO), monto, estado (PENDIENTE/PAGADO/CANCELADO), fecha_limite
- `routers/adeudos.py` → CRUD + búsqueda por nombre/matrícula
- Auto-adeudo: cuando un préstamo vence, se crea adeudo automáticamente en `routers/inventario.py`
- `pages/admin/Adeudos.jsx` → tabla con filtros de estado y persona
- `pages/admin/ConsultaPersona.jsx` → vista unificada de responsabilidades de una persona (préstamos + adeudos + incidentes)
- Migraciones: `a3f9c2e81b45` y `b7d4e1f92c38_adeudos_unified_persona`

### ✅ Recepción de Sesión (cierre con revisión)
- `models/sesion.py` → campos nuevos: `recepcion_confirmada` (bool), `momento_recepcion` (datetime)
- Endpoint `POST /sesiones/{id}/confirmar-recepcion` → revisa PCs, genera adeudos si hay daños, cierra sesión
- `SesionActiva.jsx` → fase final de revisión: lista PCs asignadas, botón "Confirmar recepción sin daños" o "Reportar incidente al cerrar"
- Estado incidente `CERRADO_SIN_ADEUDO` cuando todo OK en recepción
- Migración: `c9e2f3a84d51_recepcion_sesion.py` (esta es la migración HEAD actual)

### ✅ Dashboard Accionable (alertas en tiempo real)
- `GET /reportes/dashboard` ahora incluye bloque `"alertas"`:
  - incidentes_pendientes (sin asignar)
  - prestamos_vencidos (con detalle de activo y receptor)
  - adeudos_criticos (>7 días sin resolver)
  - total de alertas sumado
- `DashboardAdmin.jsx` → componente `PanelAlertas` que aparece entre header y stats cuando `alertas.total > 0`
  - 3 columnas: Incidentes / Préstamos / Adeudos
  - Botón de acción directo en cada alerta (navega al módulo correspondiente)
  - Solo visible cuando hay alertas activas

### ✅ Reportes Comparativos (Análisis de Tendencia)
- `GET /reportes/comparativo?laboratorio_id=X` → compara cuatrimestre actual vs anterior:
  - tendencia día a día (actual vs anterior)
  - horas_pico: matriz días×horas (0-6 × 7-21) con conteo de sesiones
  - top_docentes: ranking por horas de uso
  - computadoras_criticas: PCs con más incidentes recurrentes (usa `pc.codigo`, NO `pc.nombre`)
  - resumen: sesiones, alumnos, horas totales de ambos períodos
- Helpers: `_cuatrimestre_actual()`, `_cuatrimestre_anterior()`, `_rango_cuatrimestre()`, `_nombre_cuatrimestre()`
- Sistema cuatrimestral UTECAN: ENE-ABR (1), MAY-AGO (2), SEP-DIC (3)
- `pages/admin/Reportes.jsx` → 2 tabs:
  - **Tab "Mensual"**: reportes mensuales originales
  - **Tab "Análisis"**: comparativo con SVG de tendencia, heatmap CSS Grid de horas pico, ranking docentes, tabla PCs críticas, KPIs comparativos

### ✅ Fixes y mejoras de UX (sesiones recientes)
- `NotificacionesBell.jsx`: z-index 2147483647 + `transform: translateZ(0)` + `willChange: transform` → fix panel detrás de botones (bug Chrome compositing layer con backdrop-filter)
- `AdminLayout.jsx`: Dashboard como primer ítem de navegación con `end={true}` en NavLink (fix NavLink activo en todas las rutas)
- Importación de alumnos: upsert busca por matrícula sola (fix duplicados)
- `GET /catalogo/periodo-actual` → detecta período académico vigente automáticamente
- `SesionActiva.jsx`: muestra "🖥️ Sesión Libre" cuando `tipo_sesion === 'LIBRE'`

---

## Infraestructura actual

- **Servidor**: PC de escritorio en laboratorio UTECAN (Windows 11)
- **Internet**: Starlink con IP dinámica + CGNAT
- **Acceso externo**: Cloudflare Tunnel (gratis, sin abrir puertos)
- **Docker**: `docker-compose.yml` → backend:8000 + frontend:3000 + postgres:5432
- **BD**: PostgreSQL (Docker) con Alembic. HEAD actual: `c9e2f3a84d51`
- **Inicio rápido**: `INICIAR_LABCONTROL.bat` (usa `%~dp0` — seguro para mover carpeta)
- **Migración futura**: VPS Hostinger ~$5/mes — mismo `docker-compose.yml`, solo `.env`

---

## Patrones de código clave

### Backend — endpoint protegido
```python
@router.get("/recurso")
def listar(db: Session = Depends(get_db), current: Usuario = Depends(require_roles(["SUPER_ADMIN", "LAB_ADMIN"]))):
    ...
```

### Backend — registrar auditoría
```python
from services.auditoria import registrar_accion
registrar_accion(db, usuario_id=current.id, accion="CREAR", entidad="Activo", entidad_id=nuevo.id, detalle="...", ip=request.client.host)
```

### Frontend — SelectDark
```jsx
import SelectDark from '../../components/SelectDark';
<SelectDark value={form.campo} onChange={v => handleChange({ target: { name: 'campo', value: v } })} options={opciones} />
```

### Frontend — ModalConfirmar
```jsx
{confirmModal && (
  <ModalConfirmar mensaje="¿Eliminar?" detalle="No se puede deshacer."
    labelAceptar="Eliminar"
    onAceptar={() => { eliminar(); setConfirmModal(false); }}
    onCancelar={() => setConfirmModal(false)} />
)}
```

### Frontend — useApi (Axios + JWT)
```jsx
import useApi from '../../hooks/useApi';
const api = useApi();
const data = await api.get('/laboratorios');
await api.post('/laboratorios', payload);
```

---

## Lo que falta para v2.0 (ideas pendientes)

- [ ] **Control de Tutorías** — módulo nuevo (próxima sesión): formatos Word semanales, canalización, reporte general
- [ ] Portal del Alumno — ver asignación de PC activa
- [ ] Notificaciones push vía n8n + Telegram Bot
- [ ] Reporte exportable a PDF/Excel
- [ ] Solicitud de laboratorio alternativo (inter-laboratorio)
- [ ] Dashboard docente con historial personal
- [ ] Calendario global de todos los labs (vista institución)
- [ ] Modo oscuro/claro toggle (actualmente siempre dark)
- [ ] CI/CD con GitHub Actions
