"""add acceso_consultorio to usuarios

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


revision       = "u6v7w8x9y0z1"
down_revision  = "t5u6v7w8x9y0"
branch_labels  = None
depends_on     = None


def _col_exists(table: str, column: str) -> bool:
    insp = Inspector.from_engine(op.get_bind())
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade():
    if not _col_exists("usuarios", "acceso_consultorio"):
        op.add_column(
            "usuarios",
            sa.Column("acceso_consultorio", sa.Boolean(), nullable=False,
                      server_default=sa.text("false")),
        )


def downgrade():
    if _col_exists("usuarios", "acceso_consultorio"):
        op.drop_column("usuarios", "acceso_consultorio")
