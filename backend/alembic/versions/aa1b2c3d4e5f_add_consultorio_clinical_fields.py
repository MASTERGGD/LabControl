"""add consultorio clinical fields

Revision ID: aa1b2c3d4e5f
Revises: z3a4b5c6d7e8, b5c6d7e8f9g0
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa


revision = "aa1b2c3d4e5f"
down_revision = ("z3a4b5c6d7e8", "b5c6d7e8f9g0")
branch_labels = None
depends_on = None


def _has_column(inspector, table_name, column_name):
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "pacientes" in inspector.get_table_names():
        for name, col_type in [
            ("alergias", sa.Text()),
            ("antecedentes_medicos", sa.Text()),
            ("medicamentos_actuales", sa.Text()),
        ]:
            if not _has_column(inspector, "pacientes", name):
                op.add_column("pacientes", sa.Column(name, col_type, nullable=True))

    if "consultas_medicas" in inspector.get_table_names():
        if not _has_column(inspector, "consultas_medicas", "frecuencia_respiratoria"):
            op.add_column("consultas_medicas", sa.Column("frecuencia_respiratoria", sa.Integer(), nullable=True))
        if not _has_column(inspector, "consultas_medicas", "seguimiento_estado"):
            op.add_column(
                "consultas_medicas",
                sa.Column("seguimiento_estado", sa.String(length=20), nullable=False, server_default="PENDIENTE"),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "consultas_medicas" in inspector.get_table_names():
        for name in ["seguimiento_estado", "frecuencia_respiratoria"]:
            if _has_column(inspector, "consultas_medicas", name):
                op.drop_column("consultas_medicas", name)

    if "pacientes" in inspector.get_table_names():
        for name in ["medicamentos_actuales", "antecedentes_medicos", "alergias"]:
            if _has_column(inspector, "pacientes", name):
                op.drop_column("pacientes", name)
