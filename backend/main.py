from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base, SessionLocal
import models
import os

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
from ws.mapa import websocket_mapa

# Seeder
from seed import run_seed


# ─── Lifespan (startup / shutdown) ────────────────────────────────────────────

def _migraciones_sqlite():
    """Aplica columnas nuevas que create_all no agrega a tablas existentes."""
    with engine.connect() as conn:
        # overtime_min en sesiones_clase
        try:
            conn.execute(__import__('sqlalchemy').text(
                "ALTER TABLE sesiones_clase ADD COLUMN overtime_min INTEGER DEFAULT 0"
            ))
            conn.commit()
        except Exception:
            pass  # columna ya existe
        # resguardo_nombre y area en activos
        for col_sql in [
            "ALTER TABLE activos ADD COLUMN resguardo_nombre VARCHAR",
            "ALTER TABLE activos ADD COLUMN area VARCHAR",
        ]:
            try:
                conn.execute(__import__('sqlalchemy').text(col_sql))
                conn.commit()
            except Exception:
                pass
        # tabla notificaciones (si no existía se crea con create_all, pero por si acaso)
        try:
            conn.execute(__import__('sqlalchemy').text("""
                CREATE TABLE IF NOT EXISTS notificaciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
                    tipo VARCHAR NOT NULL,
                    titulo VARCHAR NOT NULL,
                    mensaje VARCHAR NOT NULL,
                    leida BOOLEAN NOT NULL DEFAULT 0,
                    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    url VARCHAR
                )
            """))
            conn.commit()
        except Exception:
            pass
        # tabla mantenimientos_preventivos
        try:
            conn.execute(__import__('sqlalchemy').text("""
                CREATE TABLE IF NOT EXISTS mantenimientos_preventivos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    activo_id INTEGER REFERENCES activos(id),
                    computadora_id INTEGER REFERENCES computadoras(id),
                    laboratorio_id INTEGER REFERENCES laboratorios(id),
                    tipo VARCHAR NOT NULL,
                    periodicidad VARCHAR DEFAULT 'TRIMESTRAL',
                    fecha_programada DATETIME NOT NULL,
                    fecha_limite DATETIME,
                    estado VARCHAR DEFAULT 'PENDIENTE',
                    fecha_inicio DATETIME,
                    fecha_completado DATETIME,
                    completado_por_id INTEGER REFERENCES usuarios(id),
                    descripcion VARCHAR,
                    checklist VARCHAR,
                    notas_result VARCHAR,
                    costo FLOAT,
                    duracion_min INTEGER,
                    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
        except Exception:
            pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear tablas si no existen
    Base.metadata.create_all(bind=engine)
    # Migraciones manuales para columnas nuevas en tablas existentes
    _migraciones_sqlite()
    # Ejecutar seeder inicial
    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()
    yield  # App corriendo
    # (shutdown logic aquí si se necesita)


# ─── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="LabControl UTECAN",
    description="Sistema de gestión multi-laboratorio — Universidad Tecnológica de Candelaria",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# En desarrollo permite localhost:3000. En producción leer de FRONTEND_URL.
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    _FRONTEND_URL,
]
# Eliminar duplicados y strings vacíos
_CORS_ORIGINS = list({o for o in _CORS_ORIGINS if o})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin",
                   "X-Requested-With"],
    expose_headers=["Content-Disposition"],  # para descargas de Excel
    max_age=600,  # preflight cache 10 min
)

# ── Security Headers ───────────────────────────────────────────────────────────
app.add_middleware(SecurityHeadersMiddleware)


# ─── Routers ───────────────────────────────────────────────────────────────────

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

# WebSocket — mapa de PCs en tiempo real
app.add_api_websocket_route("/ws/mapa/{lab_id}", websocket_mapa)


# ─── Endpoints base ────────────────────────────────────────────────────────────

@app.get("/", tags=["Sistema"])
def root():
    return {"sistema": "LabControl UTECAN", "version": "1.0.0", "estado": "ok"}

@app.get("/health", tags=["Sistema"])
def health():
    return {"status": "healthy"}
