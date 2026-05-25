"""add fichas_socioeconomicas and alumno access fields

Revision ID: x1y2z3a4b5c6
Revises: w8x9y0z1a2b3
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


revision      = "x1y2z3a4b5c6"
down_revision = "w8x9y0z1a2b3"
branch_labels = None
depends_on    = None


def _col_exists(table: str, col: str) -> bool:
    insp = Inspector.from_engine(op.get_bind())
    return any(c["name"] == col for c in insp.get_columns(table))


def _table_exists(table: str) -> bool:
    insp = Inspector.from_engine(op.get_bind())
    return table in insp.get_table_names()


def _enum_exists(name: str) -> bool:
    bind = op.get_bind()
    row = bind.execute(
        sa.text("SELECT 1 FROM pg_type WHERE typname = :n"),
        {"n": name},
    ).fetchone()
    return row is not None


def upgrade():
    bind = op.get_bind()

    # ── 1. Columnas nuevas en catalogo_alumnos ────────────────────────────
    if not _col_exists("catalogo_alumnos", "correo_institucional"):
        op.add_column("catalogo_alumnos",
            sa.Column("correo_institucional", sa.String(120), nullable=True))

    if not _col_exists("catalogo_alumnos", "usuario_id"):
        op.add_column("catalogo_alumnos",
            sa.Column("usuario_id", sa.Integer(), nullable=True))
        # FK separada para evitar errores de sintaxis en op.add_column
        bind.execute(sa.text(
            "ALTER TABLE catalogo_alumnos "
            "ADD CONSTRAINT fk_catalogo_alumno_usuario "
            "FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL"
        ))

    # ── 2. Enum estadoficha (solo si no existe) ───────────────────────────
    if not _enum_exists("estadoficha"):
        bind.execute(sa.text(
            "CREATE TYPE estadoficha AS ENUM ("
            "'PENDIENTE_CAPTURA','BORRADOR','ENVIADA',"
            "'REQUIERE_CORRECCION','VALIDADA','RECHAZADA')"
        ))

    # ── 3. Tabla fichas_socioeconomicas (SQL directo — evita bug create_type)
    if not _table_exists("fichas_socioeconomicas"):
        bind.execute(sa.text("""
            CREATE TABLE fichas_socioeconomicas (
                id                      SERIAL PRIMARY KEY,
                alumno_id               INTEGER NOT NULL
                                        REFERENCES catalogo_alumnos(id),
                periodo                 VARCHAR(20)  NOT NULL,
                estado                  estadoficha  NOT NULL
                                        DEFAULT 'PENDIENTE_CAPTURA',

                activado_por_id         INTEGER REFERENCES usuarios(id),
                activado_en             TIMESTAMP,
                enviada_en              TIMESTAMP,
                validada_en             TIMESTAMP,
                revisado_por_id         INTEGER REFERENCES usuarios(id),
                nota_correccion         TEXT,

                nombre_completo         VARCHAR(200),
                fecha_ingreso           VARCHAR(20),
                carrera                 VARCHAR(120),
                sexo                    VARCHAR(40),
                estado_civil            VARCHAR(60),
                lugar_nacimiento        VARCHAR(160),
                fecha_nacimiento        VARCHAR(20),
                tiene_hijos             BOOLEAN NOT NULL DEFAULT FALSE,
                num_hijos               INTEGER NOT NULL DEFAULT 0,
                habla_lengua            BOOLEAN NOT NULL DEFAULT FALSE,
                lengua                  VARCHAR(100),

                telefono                VARCHAR(30),
                procedencia_calle       VARCHAR(200),
                procedencia_colonia     VARCHAR(100),
                procedencia_localidad   VARCHAR(100),
                procedencia_municipio   VARCHAR(100),
                procedencia_estado      VARCHAR(60),
                procedencia_cp          VARCHAR(10),
                residencia_calle        VARCHAR(200),
                residencia_colonia      VARCHAR(100),
                residencia_localidad    VARCHAR(100),
                residencia_municipio    VARCHAR(100),
                residencia_estado       VARCHAR(60),
                residencia_cp           VARCHAR(10),

                bachillerato            VARCHAR(200),
                bachillerato_ubicacion  VARCHAR(200),
                periodo_estudios        VARCHAR(60),
                promedio                FLOAT,
                area_bachillerato       VARCHAR(80),

                depende_de              VARCHAR(60),
                responsable_nombre      VARCHAR(200),
                responsable_parentesco  VARCHAR(80),
                responsable_ocupacion   VARCHAR(120),
                responsable_estudios    VARCHAR(80),
                responsable_telefono    VARCHAR(30),
                ingreso_mensual         FLOAT,
                gasto_mensual           FLOAT,
                dependientes            INTEGER,
                recibe_apoyo            BOOLEAN NOT NULL DEFAULT FALSE,
                institucion_apoyo       VARCHAR(200),

                tiene_alergia           BOOLEAN NOT NULL DEFAULT FALSE,
                alergia_cual            VARCHAR(200),
                alergia_medicamento     VARCHAR(200),
                enfermedad_cronica      BOOLEAN NOT NULL DEFAULT FALSE,
                enfermedad_cual         VARCHAR(200),
                enfermedad_medicamento  VARCHAR(200),
                tiene_discapacidad      BOOLEAN NOT NULL DEFAULT FALSE,
                discapacidad_tipo       VARCHAR(200),
                discapacidad_medicamento VARCHAR(200),
                informacion_relevante   TEXT,

                creada_en               TIMESTAMP NOT NULL DEFAULT NOW(),
                actualizada_en          TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        bind.execute(sa.text(
            "CREATE INDEX ix_fichas_alumno_periodo "
            "ON fichas_socioeconomicas(alumno_id, periodo)"
        ))


def downgrade():
    bind = op.get_bind()

    if _table_exists("fichas_socioeconomicas"):
        op.drop_table("fichas_socioeconomicas")

    if _enum_exists("estadoficha"):
        bind.execute(sa.text("DROP TYPE estadoficha"))

    for col in ("usuario_id", "correo_institucional"):
        if _col_exists("catalogo_alumnos", col):
            op.drop_column("catalogo_alumnos", col)
