"""add program continuities and promotion destination career

Revision ID: f5g6h7i8j9k0
Revises: e4f5g6h7i8j9
"""
from alembic import op
import sqlalchemy as sa


revision = "f5g6h7i8j9k0"
down_revision = "e4f5g6h7i8j9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("promociones_academicas_alumno", sa.Column("carrera_destino_id", sa.Integer(), nullable=True))
    op.create_index("ix_promociones_academicas_alumno_carrera_destino_id", "promociones_academicas_alumno", ["carrera_destino_id"])
    op.create_foreign_key(
        "fk_promocion_carrera_destino", "promociones_academicas_alumno", "catalogo_carreras",
        ["carrera_destino_id"], ["id"],
    )
    op.create_table(
        "continuidades_programas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("carrera_origen_id", sa.Integer(), nullable=False),
        sa.Column("carrera_destino_id", sa.Integer(), nullable=False),
        sa.Column("cuatrimestre_origen", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("cuatrimestre_destino", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_por_id", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["carrera_origen_id"], ["catalogo_carreras.id"]),
        sa.ForeignKeyConstraint(["carrera_destino_id"], ["catalogo_carreras.id"]),
        sa.ForeignKeyConstraint(["creado_por_id"], ["usuarios.id"]),
        sa.UniqueConstraint("carrera_origen_id", "carrera_destino_id", name="uq_continuidad_programas"),
    )
    op.create_index("ix_continuidades_programas_carrera_origen_id", "continuidades_programas", ["carrera_origen_id"])
    op.create_index("ix_continuidades_programas_carrera_destino_id", "continuidades_programas", ["carrera_destino_id"])


def downgrade():
    op.drop_table("continuidades_programas")
    op.drop_constraint("fk_promocion_carrera_destino", "promociones_academicas_alumno", type_="foreignkey")
    op.drop_index("ix_promociones_academicas_alumno_carrera_destino_id", table_name="promociones_academicas_alumno")
    op.drop_column("promociones_academicas_alumno", "carrera_destino_id")
