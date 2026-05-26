# S I G A - UTECAN

Sistema Integral de Gestion Academica para la Universidad Tecnologica de Candelaria.

SIGA-UTECAN centraliza procesos academicos, administrativos y de seguimiento institucional: laboratorios, espacios, comunicados, tutorias, estudios socioeconomicos, consultorio medico, catalogos y reportes.

## Estado Actual

El proyecto esta en desarrollo activo. La aplicacion funciona con:

- Backend FastAPI con SQLAlchemy, Alembic, JWT y PostgreSQL.
- Frontend React 18 con React Router, Tailwind CSS y experiencia PWA.
- Docker Compose para levantar base de datos, backend y frontend.
- Roles diferenciados para administracion, docentes, servicios escolares, tutorias, medico, administrativos y alumnos.

## Cambios Recientes Importantes

### Identidad institucional

- Renombrado visual de `LabControl - UTECAN` a `S I G A - UTECAN`.
- Actualizacion de `title`, manifest PWA y metadatos del navegador.
- Favicon e iconos PWA reemplazados por el logo institucional.
- Logo del sidebar y encabezado movil actualizado con la identidad UTECAN.

### Comunicados

- Comunicados con destinatarios por todos, rol, departamento o usuarios especificos.
- Categorias controladas por contexto institucional para evitar usos fuera de procedimiento.
- Retroalimentacion opcional para comunicados.
- Adjuntos para comunicados.
- Lecturas, confirmaciones y seguimiento de pendientes.
- Panel de respaldos para generar paquetes ZIP con historial.
- Soporte para importar respaldos y consultar comunicados archivados.

### Servicios Escolares y alumnos

- Rol `SERVICIOS_ESCOLARES`.
- Panel especifico para Servicios Escolares.
- Registro y administracion de alumnos.
- Activacion del estudio socioeconomico para alumnos.
- Acceso de alumno al tablero para responder su estudio.
- Catalogo de carreras con nombre y clave.
- Integracion de carrera del alumno desde su ficha academica.

### Estudio socioeconomico

- Flujo para que Servicios Escolares active el estudio.
- Vista de alumno para capturar informacion socioeconomica.
- Correcciones de validacion en campos numericos.
- Manejo de errores de API para evitar renderizar objetos crudos en React.
- Campos ampliados de ficha socioeconomica.

### Tutoria

- Rol `TUTORIA_ADMIN`.
- Panel de tutoria.
- Mis tutorados para docentes.
- Historial y seguimiento de estados de tutoria.
- Documentos y programacion de tutorias.
- Formato con logo institucional para documentos relacionados.

### Consultorio medico

- Rol `MEDICO`.
- Modulo de consultorio medico.
- Registro de consultas para alumnos y personal.
- Peso y talla en consulta.
- Incapacidad con fecha de inicio y calculo de fecha final segun dias indicados.
- Historial medico basado en snapshots de consulta para que los datos historicos no cambien aunque cambie la ficha del paciente.
- Estadisticas por mes, cuatrimestre y anio.
- Impresion/PDF de consulta con logo institucional.
- Busqueda mejorada de pacientes ya atendidos usando historial de consultas y datos snapshot.

### Espacios institucionales

- Gestion de salas y espacios.
- Solicitud de espacios por usuarios autorizados.
- Bandeja de aprobacion.
- Liberacion de espacios.
- Responsables y permisos por operacion.

### Catalogos y operacion academica

- Catalogo de alumnos.
- Catalogo de materias.
- Catalogo de carreras.
- Consulta de persona.
- Historial de alumno.
- Adeudos.
- Identidad academica en reservaciones y sesiones.

## Modulos Principales

- Autenticacion y roles.
- Usuarios y departamentos.
- Laboratorios.
- Horarios y reservaciones.
- Sesiones de clase.
- Inventario, prestamos y mantenimiento.
- Espacios institucionales.
- Comunicados institucionales.
- Servicios Escolares.
- Estudio socioeconomico.
- Tutoria.
- Consultorio medico.
- Catalogos academicos.
- Reportes y auditoria.
- Notificaciones.

## Roles

| Rol | Uso principal |
|---|---|
| `SUPER_ADMIN` | Administracion global del sistema |
| `LAB_ADMIN` | Gestion de laboratorios, sesiones, espacios y operacion |
| `ADMINISTRATIVO` | Operacion de area/departamento y comunicados |
| `DOCENTE` | Panel docente, sesiones, tutorados, espacios y comunicados |
| `SERVICIOS_ESCOLARES` | Alumnos, carreras y estudios socioeconomicos |
| `TUTORIA_ADMIN` | Gestion y seguimiento de tutoria |
| `MEDICO` | Consultorio medico |
| `ALUMNO` | Tablero del alumno y estudio socioeconomico |

## Arquitectura

```txt
labcontrol/
  backend/
    main.py
    database.py
    dependencies.py
    permissions.py
    alembic/
      versions/
    assets/
      tutoria/
    models/
      usuario.py
      catalogo.py
      comunicado.py
      consultorio.py
      ficha_socioeconomica.py
      tutoria.py
      espacio.py
      horario.py
      sesion.py
      adeudo.py
    routers/
      auth.py
      usuarios.py
      catalogo.py
      comunicados.py
      consultorio.py
      servicios_escolares.py
      tutoria.py
      espacios.py
      horarios.py
      sesiones.py
      inventario.py
      adeudos.py

  frontend/
    public/
      icons/
      index.html
      manifest.json
    src/
      App.jsx
      components/
      context/
      hooks/
      pages/
        admin/
        alumno/
        comunicados/
        docente/
        espacios/
        medico/
        servicios_escolares/

  docker-compose.yml
  README.md
```

## Inicio Rapido con Docker

Requisitos:

- Docker Desktop instalado y corriendo.
- Puertos `3000`, `8000` y `5432` disponibles.

Levantar el sistema:

```powershell
docker compose up -d --build
```

Ver logs del backend:

```powershell
docker compose logs -f backend
```

URLs:

- Frontend: `http://localhost:3000`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

## Desarrollo Local sin Docker

Backend:

```powershell
cd backend
$env:DATABASE_URL="sqlite:///../data/labcontrol.db"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm start
```

Nota: para desarrollo completo se recomienda Docker, porque PostgreSQL y migraciones quedan alineadas con el entorno real del proyecto.

## Migraciones

Con Docker, el backend ejecuta Alembic al iniciar.

Manual:

```powershell
cd backend
alembic upgrade head
```

Si una base SQLite local ya tenia tablas creadas antes de usar Alembic, puede requerir marcar la version actual o usar Docker/PostgreSQL para evitar conflictos de esquema.

## Variables de Entorno

Ejemplo:

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

## Seguridad y Produccion

Controles iniciales ya integrados:

- `SECRET_KEY` es obligatoria cuando `APP_ENV=production`.
- CORS en produccion usa `CORS_ORIGINS` o `FRONTEND_URL`; no agrega `localhost` automaticamente.
- `/health` verifica disponibilidad del backend.
- `/health/db` verifica conexion a base de datos.
- Docker Compose incluye healthcheck del backend.
- Adjuntos de comunicados limitados por cantidad, peso, MIME y firma real del archivo.
- Adjuntos permitidos: PDF, JPG, PNG y WEBP.
- Cabeceras de seguridad HTTP mediante middleware.

Checklist antes de subir a servidor:

```txt
[ ] APP_ENV=production
[ ] SECRET_KEY fuerte, unica y fuera de Git
[ ] FRONTEND_URL con dominio real HTTPS
[ ] CORS_ORIGINS solo con dominios autorizados
[ ] DATABASE_URL apuntando a PostgreSQL de produccion
[ ] Backup de base de datos probado
[ ] Backup de adjuntos y respaldos probado
[ ] HTTPS activo
[ ] Migraciones Alembic probadas en staging
[ ] Usuario admin con password cambiada
[ ] Permisos por rol revisados en backend
[ ] Logs sin tokens, passwords ni datos sensibles
```

## Verificacion

Comandos usados durante los ultimos cambios:

```powershell
cd frontend
npm run build
```

Tambien se recomienda validar backend y migraciones:

```powershell
python -m compileall backend
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

## Notas de Git

Antes de guardar cambios:

```powershell
git status --short
git diff --stat
```

Commit sugerido para este bloque de trabajo:

```powershell
git add README.md backend frontend docker-compose.yml
git commit -m "feat: consolidate SIGA institutional modules"
```

No se recomienda agregar carpetas temporales como `.codex_tmp/`.

## Convencion de Commits

```txt
feat:     nueva funcionalidad
fix:      correccion de bug
style:    cambios visuales
refactor: refactor sin cambio funcional
docs:     documentacion
chore:    mantenimiento
```

## Licencia

Uso institucional para la Universidad Tecnologica de Candelaria.
