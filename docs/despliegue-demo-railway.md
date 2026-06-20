# Despliegue demo en Railway

Esta guia prepara una demo formal de SIGA / LabControl sin usar datos reales. La
intencion es mostrar el modulo de inventario y el flujo institucional con una
base PostgreSQL administrada, separando backend y frontend como servicios.

## Arquitectura recomendada para la demo

- Railway Project: `SIGA-UTECAN-DEMO`.
- Servicio `postgres`: base de datos PostgreSQL administrada por Railway.
- Servicio `backend`: FastAPI desde el directorio `backend`.
- Servicio `frontend`: React/Nginx desde el directorio `frontend`.
- Rama sugerida: `codex/demo-railway`.

Railway trabaja bien con monorepos creando un servicio por directorio. En este
repo por eso existen dos archivos:

- `backend/railway.toml`
- `frontend/railway.toml`

## Preparacion del repositorio

Antes de subir a GitHub:

```powershell
git status --short
git switch -c codex/demo-railway
git add .env.example .gitignore backend/railway.toml frontend/railway.toml backend/start.sh backend/main.py backend/middleware/security.py frontend/Dockerfile frontend/nginx.conf docs/despliegue-demo-railway.md
git commit -m "chore: preparar despliegue demo en railway"
git push -u origin codex/demo-railway
```

No subas `.env`, `frontend/.env`, bases SQLite, carpetas `data/` ni respaldos.
Ya estan ignorados por `.gitignore`.

## Variables del backend en Railway

Crear un servicio desde GitHub apuntando al root directory `backend`. Agregar:

```env
APP_ENV=production
DEBUG=False
DATABASE_URL=${{Postgres.DATABASE_URL}}
SECRET_KEY=<clave-aleatoria-larga>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

FRONTEND_URL=https://<frontend>.up.railway.app
CORS_ORIGINS=https://<frontend>.up.railway.app

RATE_LIMIT_ENABLED=true
TRUST_PROXY_HEADERS=true

SEED_ADMIN_EMAIL=admin@utecan.edu.mx
SEED_ADMIN_PASSWORD=<password-temporal-demo>

SYSTEM_DATA_DIR=data
SYSTEM_BACKUP_DIR=data/system_backups
SYSTEM_LOG_DIR=data/logs

AUDIT_RETENTION_DAYS=365
AUDIT_ARCHIVE_ENABLED=true
AUDIT_ARCHIVE_DIR=data/audit_archives
```

Notas:

- `APP_ENV=production` evita usar SQLite por accidente.
- `TRUST_PROXY_HEADERS=true` es correcto solo porque Railway actua como proxy
  confiable delante del backend.
- La contrasena seed debe cambiarse al primer inicio de sesion.
- SMTP y Telegram pueden quedar vacios para demo si no se mostraran correos.

## Variables del frontend en Railway

Crear otro servicio desde GitHub apuntando al root directory `frontend`. Agregar:

```env
REACT_APP_API_URL=https://<backend>.up.railway.app
REACT_APP_WS_URL=wss://<backend>.up.railway.app
REACT_APP_PUBLIC_APP_URL=https://<frontend>.up.railway.app
REACT_APP_IDLE_WARNING_MINUTES=40
REACT_APP_IDLE_TIMEOUT_MINUTES=45
```

Importante: React empaqueta estas variables durante el build. Si cambias la URL
del backend, redeploy/rebuild del frontend.

## Orden de despliegue

1. Crear Railway Project.
2. Crear PostgreSQL.
3. Crear backend desde GitHub con root `backend`.
4. Configurar variables del backend.
5. Desplegar backend y verificar `https://<backend>.up.railway.app/health`.
6. Crear frontend desde GitHub con root `frontend`.
7. Configurar `REACT_APP_API_URL` y `REACT_APP_WS_URL` con la URL real backend.
8. Desplegar frontend.
9. Probar login, inventario, alta de activo, revision, observacion y validacion.

## Checklist de demo

- Usar datos ficticios de departamentos, usuarios y activos.
- Confirmar que la pantalla de inventario muestre estados de validacion.
- Mostrar un activo en borrador, observado, no autorizado y validado.
- Mostrar el flujo de responsable de departamento y validador institucional.
- Mostrar la trazabilidad: auditoria, notificaciones, adeudos e incidencias.
- Tener una cuenta demo de Super Admin y otra de responsable de laboratorio.
- Tener una copia local funcionando por si falla internet.

## Riesgos y mitigacion

- Plataforma compartida: puede tener latencia variable. Mitigar con datos de demo
  acotados y PostgreSQL administrado.
- Variables frontend mal configuradas: el build queda apuntando a una URL vieja.
  Mitigar reconstruyendo frontend al cambiar variables.
- Datos sensibles: no usar datos reales ni contrasenas institucionales.
- Demo sin autorizacion final: presentarla como prototipo funcional, no como
  sistema productivo aprobado.

## Referencias oficiales

- Railway config as code: https://docs.railway.com/config-as-code/reference
- Railway monorepos: https://docs.railway.com/deployments/monorepo
