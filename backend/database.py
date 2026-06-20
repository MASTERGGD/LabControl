"""
database.py -- Configuracion del motor de base de datos

Soporta:
  - PostgreSQL  (produccion / Railway)  --> DATABASE_URL=postgresql+psycopg2://...
  - SQLite      (desarrollo local)      --> DATABASE_URL=sqlite:///./data/labcontrol.db

El motor se selecciona automaticamente segun DATABASE_URL.
Las migraciones de esquema se gestionan con Alembic (no con create_all).
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# -- URL de conexion ----------------------------------------------------------
_raw_url = os.getenv("DATABASE_URL", "sqlite:///./data/labcontrol.db")

# Railway (y configs antiguas) usan "postgres://"; SQLAlchemy 2 requiere
# "postgresql+psycopg2://"
if _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql+psycopg2://", 1)

DATABASE_URL = _raw_url

# -- Argumentos especificos por motor -----------------------------------------
_is_sqlite    = DATABASE_URL.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

_app_env = os.getenv("APP_ENV", "development").lower()
if _app_env in ("production", "prod") and _is_sqlite:
    raise RuntimeError(
        "SQLite no esta permitido en produccion. Configura DATABASE_URL con una "
        "base PostgreSQL administrada antes de arrancar SIGA."
    )

# -- Engine -------------------------------------------------------------------
# pool_pre_ping=True: verifica la conexion antes de usarla (evita errores tras
# una reconexion o reinicio del servidor de base de datos)
engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,
)

# -- Sesion -------------------------------------------------------------------
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# -- Base declarativa ---------------------------------------------------------
Base = declarative_base()


# -- Dependencia FastAPI ------------------------------------------------------
def get_db():
    """Inyecta una sesion de BD en cada request y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
