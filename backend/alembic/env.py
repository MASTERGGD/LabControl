"""
Alembic env.py -- LabControl UTECAN
Lee DATABASE_URL desde variables de entorno (igual que el backend).
Soporta PostgreSQL (produccion) y SQLite (desarrollo local).
"""
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

# -- Cargar .env si existe (util al correr migraciones localmente) ------------
env_file = Path(__file__).resolve().parents[1] / ".env"
if env_file.exists():
    load_dotenv(env_file)

# -- Agregar el directorio backend al path para importar los modelos ----------
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# -- Importar Base con todos los modelos registrados --------------------------
from database import Base          # noqa: E402
from models import (               # noqa: E402
    catalogo, horario, inventario, laboratorio,
    notificacion, sesion, usuario, auditoria, adeudo, espacio, comunicado, departamento,
)

target_metadata = Base.metadata

# -- Config de Alembic --------------------------------------------------------
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Prioridad: variable de entorno > alembic.ini
database_url = os.getenv("DATABASE_URL")
if database_url:
    # SQLAlchemy 2 requiere "postgresql+psycopg2://" en vez de "postgres://"
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)
    config.set_main_option("sqlalchemy.url", database_url)


def run_migrations_offline() -> None:
    """Genera SQL sin conectarse -- util para revisar los scripts antes de aplicar."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Aplica las migraciones directamente contra la base de datos."""
    url = config.get_main_option("sqlalchemy.url", "")
    is_sqlite = url.startswith("sqlite")

    connect_args = {"check_same_thread": False} if is_sqlite else {}
    # Para PostgreSQL: timeout de conexión de 10 s para no colgar el arranque
    if not is_sqlite:
        connect_args["connect_timeout"] = 10

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            render_as_batch=is_sqlite,
        )
        with context.begin_transaction():
            # SET LOCAL aplica sólo a esta transacción — evita locks indefinidos
            # y debe ir DENTRO del bloque para no disparar autobegin antes de time
            if not is_sqlite:
                connection.execute(
                    __import__("sqlalchemy").text("SET LOCAL lock_timeout = '10s'")
                )
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
