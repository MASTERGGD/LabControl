"""add_consultorio

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-05-21

Módulo de Consultorio Médico:
  - pacientes (ALUMNO | ADMINISTRATIVO)
  - consultas_medicas
  - canalizaciones_medicas
  - rol MEDICO en enum usuarios.rol
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

revision = "s4t5u6v7w8x9"
down_revision = "r3s4t5u6v7w8"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = inspector.get_table_names()

    # ── Agregar valor MEDICO al enum rol (solo PostgreSQL) ─────────────────────
    dialect = bind.dialect.name
    if dialect == "postgresql":
        bind.execute(sa.text(
            "ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'MEDICO'"
        ))

    # ── pacientes ──────────────────────────────────────────────────────────────
    if "pacientes" not in existing_tables:
        op.create_table(
            "pacientes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("tipo", sa.String(20), nullable=False, server_default="ALUMNO"),
            sa.Column("alumno_id", sa.Integer(),
                      sa.ForeignKey("catalogo_alumnos.id"), nullable=True),
            sa.Column("nombre", sa.String(200), nullable=False),
            sa.Column("matricula_o_emp", sa.String(30), nullable=True),
            sa.Column("fecha_nacimiento", sa.Date(), nullable=True),
            sa.Column("sexo", sa.String(10), nullable=True),
            sa.Column("carrera", sa.String(120), nullable=True),
            sa.Column("cuatrimestre", sa.Integer(), nullable=True),
            sa.Column("departamento", sa.String(120), nullable=True),
            sa.Column("activo", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("creado_en", sa.DateTime(), nullable=False),
        )

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_pacientes_alumno_id
        ON pacientes (alumno_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_pacientes_tipo
        ON pacientes (tipo)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_pacientes_nombre
        ON pacientes (nombre)
    """)

    # ── consultas_medicas ──────────────────────────────────────────────────────
    if "consultas_medicas" not in existing_tables:
        op.create_table(
            "consultas_medicas",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("paciente_id", sa.Integer(),
                      sa.ForeignKey("pacientes.id"), nullable=False),
            sa.Column("fecha_consulta", sa.DateTime(), nullable=False),
            # Signos vitales
            sa.Column("temperatura", sa.Float(), nullable=True),
            sa.Column("presion_arterial", sa.String(20), nullable=True),
            sa.Column("peso", sa.Float(), nullable=True),
            sa.Column("talla", sa.Float(), nullable=True),
            sa.Column("frecuencia_cardiaca", sa.Integer(), nullable=True),
            sa.Column("saturacion_oxigeno", sa.Float(), nullable=True),
            # Clínica
            sa.Column("motivo_consulta", sa.Text(), nullable=False),
            sa.Column("diagnostico", sa.Text(), nullable=False),
            sa.Column("medicamentos", sa.Text(), nullable=True),
            sa.Column("indicaciones", sa.Text(), nullable=True),
            # Incapacidad
            sa.Column("genera_incapacidad", sa.Boolean(), server_default=sa.text("false")),
            sa.Column("dias_incapacidad", sa.Integer(), nullable=True),
            sa.Column("fecha_inicio_incapacidad", sa.Date(), nullable=True),
            # Seguimiento
            sa.Column("requiere_seguimiento", sa.Boolean(), server_default=sa.text("false")),
            sa.Column("fecha_seguimiento", sa.Date(), nullable=True),
            sa.Column("seguimiento_notas", sa.Text(), nullable=True),
            # Origen
            sa.Column("origen", sa.String(30), nullable=False, server_default="ESPONTANEA"),
            sa.Column("canalizacion_tutoria_id", sa.Integer(), nullable=True),
            # Auditoría
            sa.Column("atendido_por", sa.Integer(),
                      sa.ForeignKey("usuarios.id"), nullable=False),
            sa.Column("creado_en", sa.DateTime(), nullable=False),
        )

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_consultas_medicas_paciente_id
        ON consultas_medicas (paciente_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_consultas_medicas_fecha_consulta
        ON consultas_medicas (fecha_consulta)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_consultas_medicas_atendido_por
        ON consultas_medicas (atendido_por)
    """)

    # ── canalizaciones_medicas ─────────────────────────────────────────────────
    if "canalizaciones_medicas" not in existing_tables:
        op.create_table(
            "canalizaciones_medicas",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("consulta_id", sa.Integer(),
                      sa.ForeignKey("consultas_medicas.id"), nullable=False),
            sa.Column("paciente_id", sa.Integer(),
                      sa.ForeignKey("pacientes.id"), nullable=False),
            sa.Column("destino", sa.String(20), nullable=False),
            sa.Column("motivo", sa.Text(), nullable=True),
            sa.Column("estado", sa.String(20), nullable=False, server_default="PENDIENTE"),
            sa.Column("fecha_canaliza", sa.DateTime(), nullable=False),
            sa.Column("fecha_atencion", sa.DateTime(), nullable=True),
            sa.Column("notas_seguimiento", sa.Text(), nullable=True),
            sa.Column("creado_por", sa.Integer(),
                      sa.ForeignKey("usuarios.id"), nullable=False),
        )

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_canalizaciones_medicas_consulta_id
        ON canalizaciones_medicas (consulta_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_canalizaciones_medicas_paciente_id
        ON canalizaciones_medicas (paciente_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_canalizaciones_medicas_estado
        ON canalizaciones_medicas (estado)
    """)


def downgrade():
    op.drop_index("ix_canalizaciones_medicas_estado",
                  table_name="canalizaciones_medicas")
    op.drop_index("ix_canalizaciones_medicas_paciente_id",
                  table_name="canalizaciones_medicas")
    op.drop_index("ix_canalizaciones_medicas_consulta_id",
                  table_name="canalizaciones_medicas")
    op.drop_table("canalizaciones_medicas")

    op.drop_index("ix_consultas_medicas_atendido_por",
                  table_name="consultas_medicas")
    op.drop_index("ix_consultas_medicas_fecha_consulta",
                  table_name="consultas_medicas")
    op.drop_index("ix_consultas_medicas_paciente_id",
                  table_name="consultas_medicas")
    op.drop_table("consultas_medicas")

    op.drop_index("ix_pacientes_nombre", table_name="pacientes")
    op.drop_index("ix_pacientes_tipo", table_name="pacientes")
    op.drop_index("ix_pacientes_alumno_id", table_name="pacientes")
    op.drop_table("pacientes")
