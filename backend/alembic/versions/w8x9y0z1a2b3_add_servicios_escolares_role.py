"""add servicios escolares role

Revision ID: w8x9y0z1a2b3
Revises: v7w8x9y0z1a2
Create Date: 2026-05-22
"""
from alembic import op

revision = "w8x9y0z1a2b3"
down_revision = "v7w8x9y0z1a2"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'SERVICIOS_ESCOLARES'")


def downgrade():
    # PostgreSQL no permite eliminar valores de un ENUM sin recrear el tipo.
    pass
