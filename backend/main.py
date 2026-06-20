from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base, SessionLocal, DATABASE_URL
from sqlalchemy import inspect, text
import models
from models import cumplimiento  # noqa: F401  — registra EventoCumplimiento en Base.metadata
import os

# Alembic -- migraciones de esquema
import pathlib
from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command

# Middleware de seguridad
from middleware.security import SecurityHeadersMiddleware
from middleware.error_handling import ErrorHandlingMiddleware
from services.rate_limit import RateLimitMiddleware
from services.system_health import get_system_health

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
from routers import tutoria as tutoria_router
from routers import consultorio as consultorio_router
from routers import servicios_escolares as servicios_escolares_router
from routers import system as system_router

from ws.mapa import websocket_mapa

# Seeder
from seed import run_seed


# --- Lifespan (startup / shutdown) -------------------------------------------

# Ultima revision conocida -- actualizar cada vez que se agregue una migracion nueva
_ALEMBIC_HEAD = "k9l0m1n2o3p4"


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
    alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    try:
        alembic_command.upgrade(alembic_cfg, "head")
        print("Alembic: migraciones aplicadas correctamente")
    except Exception as e:
        print(f"Alembic: error al migrar: {e}")
        raise


def _ensure_dev_sqlite_schema():
    """
    Reparacion ligera para bases SQLite locales creadas antes de Alembic.
    Crea tablas y columnas faltantes; no elimina ni sobrescribe datos existentes.
    """
    if not DATABASE_URL.startswith("sqlite"):
        return
    inspector = inspect(engine)

    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            table.create(bind=engine)

    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            existing = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                conn.execute(text(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}'
                ))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if DATABASE_URL.startswith("sqlite"):
        _ensure_dev_sqlite_schema()
    else:
        _run_migrations()
    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()
    yield


# --- App ---------------------------------------------------------------------

app = FastAPI(
    title="SIGA UTECAN",
    description="Sistema de gestion multi-laboratorio",
    version="1.0.0",
    lifespan=lifespan,
)

_APP_ENV      = os.getenv("APP_ENV", "development").lower()
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
_CORS_ENV     = os.getenv("CORS_ORIGINS", "")

if _APP_ENV in ("production", "prod"):
    _CORS_ORIGINS = [o.strip() for o in _CORS_ENV.split(",") if o.strip()]
    if not _CORS_ORIGINS and _FRONTEND_URL:
        _CORS_ORIGINS = [_FRONTEND_URL]
    if not _CORS_ORIGINS:
        raise RuntimeError("CORS_ORIGINS o FRONTEND_URL debe configurarse en produccion.")
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
    expose_headers=["Content-Disposition", "X-Request-ID"],
    max_age=600,
)

app.add_middleware(ErrorHandlingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

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
app.include_router(tutoria_router.router)
app.include_router(consultorio_router.router)
app.include_router(servicios_escolares_router.router)
app.include_router(system_router.router)

app.add_api_websocket_route("/ws/mapa/{lab_id}", websocket_mapa)

# --- Endpoints base ----------------------------------------------------------

@app.get("/", tags=["Sistema"])
def root():
    return {"sistema": "SIGA UTECAN", "version": "1.0.0", "estado": "ok"}

@app.get("/health", tags=["Sistema"])
def health(response: Response):
    result = get_system_health()
    if result["status"] == "unhealthy":
        response.status_code = 503
    return result

@app.get("/health/db", tags=["Sistema"])
def health_db():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "ok"}
    finally:
        db.close()
