"""add catalogo carreras

Revision ID: a4b5c6d7e8f9
Revises: z3a4b5c6d7e8
Create Date: 2026-05-25 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "a4b5c6d7e8f9"
down_revision = "z3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "catalogo_carreras",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clave", sa.String(length=30), nullable=False),
        sa.Column("nombre", sa.String(length=180), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clave"),
        sa.UniqueConstraint("nombre"),
    )
    op.create_index(op.f("ix_catalogo_carreras_id"), "catalogo_carreras", ["id"], unique=False)
    op.create_index(op.f("ix_catalogo_carreras_clave"), "catalogo_carreras", ["clave"], unique=True)
    op.create_index(op.f("ix_catalogo_carreras_nombre"), "catalogo_carreras", ["nombre"], unique=True)


def downgrade():
    op.drop_index(op.f("ix_catalogo_carreras_nombre"), table_name="catalogo_carreras")
    op.drop_index(op.f("ix_catalogo_carreras_clave"), table_name="catalogo_carreras")
    op.drop_index(op.f("ix_catalogo_carreras_id"), table_name="catalogo_carreras")
    op.drop_table("catalogo_carreras")
