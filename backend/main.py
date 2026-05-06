from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base, SessionLocal
import models
import os

# Alembic -- migraciones de esquema
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

from ws.mapa import websocket_mapa

# Seeder
from seed import run_seed


# --- Lifespan (startup / shutdown) -------------------------------------------

def _run_migrations():
    """
    Aplica todas las migraciones pendientes con Alembic al iniciar el servidor.
    Equivalente a ejecutar: alembic upgrade head
    Funciona tanto con PostgreSQL como con SQLite.
    """
    alembic_cfg = AlembicConfig("/app/alembic.ini")
    alembic_cfg.set_main_option("script_location", "/app/alembic")
    try:
        alembic_command.upgrade(alembic_cfg, "head")
        print("Alembic: migraciones aplicadas correctamente")
    except Exception as e:
        print(f"Alembic: {e}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Aplicar migraciones de esquema (crea tablas nuevas, agrega columnas, etc.)
    _run_migrations()
    # 2. Ejecutar seeder inicial (crea SUPER_ADMIN si no existe)
    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()
    yield  # -- App corriendo --


# --- App ---------------------------------------------------------------------

app = FastAPI(
    title="LabControl UTECAN",
    description="Sistema de gestion multi-laboratorio -- Universidad Tecnologica de Candelaria",
    version="1.0.0",
    lifespan=lifespan,
)

# -- CORS ---------------------------------------------------------------------
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    _FRONTEND_URL,
]
_CORS_ORIGINS = list({o for o in _CORS_ORIGINS if o})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin",
                   "X-Requested-With"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)

# -- Security Headers ---------------------------------------------------------
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

# WebSocket -- mapa de PCs en tiempo real
app.add_api_websocket_route("/ws/mapa/{lab_id}", websocket_mapa)


# --- Endpoints base ----------------------------------------------------------

@app.get("/", tags=["Sistema"])
def root():
    return {"sistema": "LabControl UTECAN", "version": "1.0.0", "estado": "ok"}

@app.get("/health", tags=["Sistema"])
def health():
    return {"status": "healthy"}
