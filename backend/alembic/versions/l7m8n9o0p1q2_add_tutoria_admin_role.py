"""add_tutoria_admin_role

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-05-19
"""
from alembic import op

revision = 'l7m8n9o0p1q2'
down_revision = 'k6l7m8n9o0p1'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'TUTORIA_ADMIN'")


def downgrade():
    # PostgreSQL no permite eliminar valores de un ENUM sin recrear el tipo.
    pass
