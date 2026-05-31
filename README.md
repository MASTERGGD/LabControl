# S I G A - UTECAN

Sistema Integral de Gestión Académica para la Universidad Tecnológica de Candelaria.

SIGA centraliza laboratorios, espacios, comunicados, tutorías, estudios socioeconómicos, consultorio médico, catálogos y reportes en una sola plataforma institucional con tema claro/oscuro y roles diferenciados.

## Estado del Proyecto

En desarrollo activo. Stack principal:

- **Backend:** FastAPI · SQLAlchemy · Alembic · JWT · PostgreSQL
- **Frontend:** React 18 · React Router · Tailwind CSS · PWA
- **Infraestructura:** Docker Compose (db + backend + frontend)

## Módulos Principales

| Módulo | Descripción |
|---|---|
| Autenticación | JWT, roles, cambio de contraseña, acceso especial a consultorio |
| Usuarios y departamentos | CRUD, roles, asignación a departamentos |
| Laboratorios | PCs, sesiones, horarios, reservaciones, inventario, préstamos, mantenimiento |
| Espacios institucionales | Salas, solicitudes, bandeja de aprobación, liberación, responsables |
| Comunicados | Destinatarios por rol/depto/usuario, adjuntos, retroalimentación, lecturas, respaldos |
| Servicios Escolares | Alumnos, catálogo de carreras, activación de fichas socioeconómicas |
| Estudio socioeconómico | Captura por alumno, validación, correcciones, historial |
| Tutoría | Grupos, sesiones F-DC-07, canalizaciones F-DC-08, informe F-DC-09 |
| Consultorio médico | Consultas, incapacidades, estadísticas, PDF institucional |
| Catálogos académicos | Materias, carreras, consulta de persona, historial de alumno, adeudos |
| Reportes y auditoría | Reportes por laboratorio, exportación Excel, auditoría de acciones |
| Notificaciones | Campana en tiempo real, pendientes de comunicados |

## Roles

| Rol | Acceso principal |
|---|---|
| `SUPER_ADMIN` | Administración global |
| `LAB_ADMIN` | Laboratorios, sesiones, espacios, operación |
| `ADMINISTRATIVO` | Operación de área/departamento y comunicados |
| `DOCENTE` | Panel docente, sesiones, tutorados, espacios |
| `SERVICIOS_ESCOLARES` | Alumnos, carreras, estudios socioeconómicos |
| `TUTORIA_ADMIN` | Gestión y seguimiento de tutoría |
| `MEDICO` | Consultorio médico |
| `ALUMNO` | Tablero personal y estudio socioeconómico |

## Cambios Recientes (mayo 2026)

### UI/UX — Refactoring visual completo

Se aplicó un ciclo completo de mejoras de diseño en todas las vistas del sistema:

- **Tema claro y oscuro** — Cada componente detecta `themeKey` mediante `useTheme()` y aplica colores adaptativos. Todos los textos, bordes, fondos e iconos reaccionan al tema activo.
- **Contraste y accesibilidad** — Textos secundarios elevados a `#9CA3AF`/`#D1D5DB` en oscuro y `#4B5563`/`#6B7280` en claro para cumplir estándares WCAG.
- **Efecto fantasma en métricas** — Contadores en `0` se muestran en gris atenuado; se activan en color solo cuando tienen datos reales.
- **Jerarquía de botones** — Acciones primarias en verde esmeralda sólido (`#10b981`), secundarias en ghost con borde, destructivas solo en rojo al hover.
- **Title Case global** — Nombres de personas, carreras, comunicados y alumnos formateados automáticamente (`toTitleCase`) en todos los módulos.
- **Dropdown custom `SelectDark`** — Reemplaza `<select>` nativos en formularios clave (canalizaciones, modalidades) con soporte de `sublabel` para mostrar matrícula atenuada junto al nombre.
- **Filtros en fila horizontal** — Los selectores de categoría/prioridad/periodo en ComunicadosAdmin y MisComunicados reorganizados con `flex` para no apilar verticalmente.
- **Badges de estado** — Estado de documentos (BORRADOR/ENVIADO/RECIBIDO) convertidos a píldoras con borde y fondo semitransparente acorde al estado.
- **Pestañas sin emojis cuadrados** — Barra de pestañas de MisTutorados limpiada; badges numéricos compactos solo cuando hay pendientes.
- **Modal "Reportar problema del aula"** — Categorías con selección esmeralda, botón primario verde institucional, alineación de ícono de advertencia.
- **Catálogo de carreras** — Botón "Agregar" con verde sólido, "Desactivar" como ghost con activación roja al hover, nombres en Title Case.
- **Formulario Registro de Sesión F-DC-07** — Nombres en Title Case, matrícula en `#9CA3AF`, inputs con borde visible, "Requiere canalización" condicional.

### Bitácora de auditoría — cobertura ampliada

Se extendió el sistema de auditoría para cubrir acciones institucionales críticas que antes no dejaban rastro:

- **Servicios Escolares** — activar acceso SIGA a alumno, restablecer contraseña, activar/desactivar ficha socioeconómica (con nombre y matrícula del alumno en el detalle).
- **Tutoría** — registrar sesión F-DC-07, crear canalización F-DC-08, enviar informe F-DC-09 (con grupo, periodo y tipos).
- **Departamentos** — crear, editar y desactivar departamentos (con nombre y clave).
- **Reportes** — exportar Excel de reporte mensual de laboratorio (con nombre del laboratorio, mes, año y nombre de archivo).
- **Usuarios** — editar usuario ahora incluye `usuario_afectado` y `email_afectado` en el detalle JSON, eliminando la necesidad de buscar quién es el ID afectado.
- **Frontend** — modal de detalle de bitácora muestra automáticamente `Afectado`, `Alumno` y `Grupo` cuando el registro los incluye.
- **Constantes** — 10 nuevas acciones y 3 nuevos recursos (`DEPARTAMENTO`, `TUTORIA`, `REPORTE`) en `services/auditoria.py`.

### Paginación de comunicados

- **Backend** — `GET /comunicados` ahora acepta `page` y `page_size` (default 10, máx 100) y devuelve `{ items, total, page, page_size, pages }` en lugar del array plano.
- **Frontend** — barra de paginación con rango `Mostrando X–Y de Z comunicados`, selector `10 | 25 | 50 por página` y controles `‹ 1 2 … N ›`.
- Al cambiar cualquier filtro se resetea automáticamente a página 1. Al cambiar de página se conservan todos los filtros activos.

### Corrección de zona horaria en bitácora

- Los timestamps del router de auditoría se serializaban sin sufijo `Z`, haciendo que el browser los interpretara como hora local en lugar de UTC. Corregido con `isoformat() + "Z"`: la bitácora ahora muestra la hora local correcta de México.

### Backend

- Soporte a filtros avanzados en comunicados (seguimiento, destinatario, periodo académico).
- Mejoras en routers de espacios, tutorías, consultorio y departamentos.
- Nuevas migraciones Alembic para apoyo de departamento en espacios.
- Correcciones en cálculo de métricas de sesiones y lecturas.
- Placeholder de `input-dark` elevado de opacidad 50% a `#9CA3AF` — aplica globalmente a todos los formularios del sistema.

### Corrección de bugs

- `isDay is not defined` en `AdminLayout` — variable añadida al componente principal.
- Formato de fechas con `T` en actualizaciones (`replace('T', ' ')` centralizado en `formatFecha`).
- Plural automático `1 alumno` / `N alumnos` en modal de grupo tutorado.
- Error ESLint por comentarios `eslint-disable-line react-hooks/exhaustive-deps` con regla no instalada — comentarios eliminados.

## Arquitectura

```
labcontrol/
  backend/
    main.py
    database.py
    dependencies.py
    permissions.py
    alembic/versions/
    assets/tutoria/
    models/
      usuario.py · catalogo.py · comunicado.py · consultorio.py
      ficha_socioeconomica.py · tutoria.py · espacio.py
      horario.py · sesion.py · adeudo.py · departamento.py
    routers/
      auth.py · usuarios.py · catalogo.py · comunicados.py
      consultorio.py · servicios_escolares.py · tutoria.py
      espacios.py · horarios.py · sesiones.py
      inventario.py · adeudos.py · reportes.py

  frontend/src/
    components/
      AdminLayout.jsx     ← layout global con isDay
      SelectDark.jsx      ← dropdown custom con sublabel
      ThemeSwitcher.jsx
      NotificacionesBell.jsx
    context/
      ThemeContext.jsx · AuthContext.jsx · ToastContext.jsx
    pages/
      admin/              ← ComunicadosAdmin, TutoriaAdmin, Usuarios…
      alumno/
      comunicados/        ← MisComunicados
      docente/            ← MisTutorados, SesionActiva, SesionClase
      espacios/
      medico/             ← ConsultorioMedico
      servicios_escolares/ ← SEAlumnos

  docker-compose.yml
  README.md
```

## Inicio Rápido con Docker

```powershell
docker compose up -d --build
```

- Frontend: `http://localhost:3000`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

## Desarrollo Local sin Docker

```powershell
# Backend
cd backend
$env:DATABASE_URL="sqlite:///../data/labcontrol.db"
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm install && npm start
```

## Migraciones

```powershell
cd backend
alembic upgrade head
```

## Variables de Entorno

```env
DATABASE_URL=postgresql://labcontrol:labcontrol@db:5432/labcontrol
SECRET_KEY=cambia-esta-clave-en-produccion-minimo-32-caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
APP_NAME=S I G A - UTECAN
APP_ENV=development
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
COMUNICADOS_MAX_ADJUNTO_MB=5
COMUNICADOS_MAX_TOTAL_ADJUNTOS_MB=15
COMUNICADOS_MAX_ADJUNTOS=5
```

## Seguridad y Producción

- `SECRET_KEY` obligatoria en `APP_ENV=production`.
- CORS restringido a dominios autorizados en producción.
- Adjuntos validados por cantidad, peso, MIME y firma real.
- Cabeceras de seguridad HTTP via middleware.
- `/health` y `/health/db` para monitoreo.

**Checklist antes de deploy:**

```
[ ] APP_ENV=production
[ ] SECRET_KEY fuerte y fuera de Git
[ ] FRONTEND_URL con dominio HTTPS
[ ] CORS_ORIGINS solo dominios autorizados
[ ] DATABASE_URL apuntando a PostgreSQL de producción
[ ] Backups de base de datos y adjuntos probados
[ ] HTTPS activo
[ ] Migraciones Alembic probadas en staging
[ ] Password de admin cambiada
[ ] Logs sin tokens ni datos sensibles
```

## Convención de Commits

```
feat:     nueva funcionalidad
fix:      corrección de bug
style:    cambios visuales / UI
refactor: refactor sin cambio funcional
docs:     documentación
chore:    mantenimiento
```

## Licencia

Uso institucional — Universidad Tecnológica de Candelaria (UTECAN).
