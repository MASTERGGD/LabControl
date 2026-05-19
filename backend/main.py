from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base, SessionLocal
import models
from models import cumplimiento  # noqa: F401  — registra EventoCumplimiento en Base.metadata
import os

# Alembic -- migraciones de esquema
import pathlib
from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command

# Middleware de seguridad
from middleware.security import SecurityHeadersMiddleware

# Routers
from routers import auth as auth_router
from routers import laboratorios as laboratorios_router
from routers import usuarios as usuarios_router
from routers import horarios as horarios_router
from routers import sesiones as sesiones_router
from routers import inventario as inventario_router
from routers import catalogo as catalogo_router
from routers import reportes as reportes_router
from routers import notificaciones as notificaciones_router
from routers import rbac as rbac_router
from routers import asistencia as asistencia_router
from routers import historial as historial_router
from routers import auditoria as auditoria_router
from routers import adeudos as adeudos_router
from routers import espacios as espacios_router
from routers import comunicados as comunicados_router
from routers import departamentos as departamentos_router

from ws.mapa import websocket_mapa

# Seeder
from seed import run_seed


# --- Lifespan (startup / shutdown) -------------------------------------------

# Ultima revision conocida -- actualizar cada vez que se agregue una migracion nueva
_ALEMBIC_HEAD = "i4j5k6l7m8n9"


def _current_db_version() -> str | None:
    """Lee la version Alembic actual usando psycopg2 con timeout corto."""
    db_url = os.environ.get("DATABASE_URL", "")
    if "postgresql" not in db_url:
        return None
    try:
        import psycopg2
        pg_url = db_url.replace("postgresql+psycopg2://", "postgresql://", 1)
        conn = psycopg2.connect(pg_url, connect_timeout=5)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT version_num FROM alembic_version LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row[0] if row else None
    except Exception as e:
        print(f"Alembic: no se pudo leer version ({e})")
        return None


def _run_migrations():
    """
    Aplica migraciones pendientes con Alembic.
    Si la BD ya esta en la version head, lo salta sin tocar nada.
    """
    current = _current_db_version()
    if current == _ALEMBIC_HEAD:
        print(f"Alembic: ya en version {_ALEMBIC_HEAD} -- sin cambios.")
        return

    _base = pathlib.Path(__file__).parent.resolve()
    alembic_cfg = AlembicConfig(str(_base / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(_base / "alembic"))
    try:
        alembic_command.upgrade(alembic_cfg, "head")
        print("Alembic: migraciones aplicadas correctamente")
    except Exception as e:
        print(f"Alembic: error al migrar: {e}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()
    yield


# --- App ---------------------------------------------------------------------

app = FastAPI(
    title="LabControl UTECAN",
    description="Sistema de gestion multi-laboratorio",
    version="1.0.0",
    lifespan=lifespan,
)

_APP_ENV      = os.getenv("APP_ENV", "development")
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

if _APP_ENV == "production":
    _CORS_ORIGINS = list({o for o in ["http://localhost:3000", _FRONTEND_URL] if o})
    _CORS_ALL     = False
else:
    _CORS_ORIGINS = ["*"]
    _CORS_ALL     = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=not _CORS_ALL,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"] if _CORS_ALL else ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)

app.add_middleware(SecurityHeadersMiddleware)

# --- Routers -----------------------------------------------------------------

app.include_router(auth_router.router)
app.include_router(laboratorios_router.router)
app.include_router(usuarios_router.router)
app.include_router(horarios_router.router)
app.include_router(sesiones_router.router)
app.include_router(inventario_router.router)
app.include_router(catalogo_router.router)
app.include_router(reportes_router.router)
app.include_router(notificaciones_router.router)
app.include_router(rbac_router.router)
app.include_router(asistencia_router.router)
app.include_router(historial_router.router)
app.include_router(auditoria_router.router)
app.include_router(adeudos_router.router)
app.include_router(espacios_router.router)
app.include_router(comunicados_router.router)
app.include_router(departamentos_router.router)

app.add_api_websocket_route("/ws/mapa/{lab_id}", websocket_mapa)

# --- Endpoints base ----------------------------------------------------------

@app.get("/", tags=["Sistema"])
def root():
    return {"sistema": "LabControl UTECAN", "version": "1.0.0", "estado": "ok"}

@app.get("/health", tags=["Sistema"])
def health():
    return {"status": "healthy"}
