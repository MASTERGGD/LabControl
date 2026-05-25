"""add_comunicado_respaldos

Revision ID: y2z3a4b5c6d7
Revises: x1y2z3a4b5c6
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa


revision = "y2z3a4b5c6d7"
down_revision = "x1y2z3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comunicado_respaldos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre_archivo", sa.String(length=255), nullable=False),
        sa.Column("ruta_archivo", sa.String(length=500), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_comunicados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fecha_inicio", sa.DateTime(), nullable=True),
        sa.Column("fecha_fin", sa.DateTime(), nullable=True),
        sa.Column("criterios", sa.Text(), nullable=True),
        sa.Column("creado_por_id", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["creado_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_comunicado_respaldos_id"), "comunicado_respaldos", ["id"], unique=False)
    op.create_index(op.f("ix_comunicado_respaldos_sha256"), "comunicado_respaldos", ["sha256"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_comunicado_respaldos_sha256"), table_name="comunicado_respaldos")
    op.drop_index(op.f("ix_comunicado_respaldos_id"), table_name="comunicado_respaldos")
    op.drop_table("comunicado_respaldos")
