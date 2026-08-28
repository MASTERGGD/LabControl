"""add additional user roles

Revision ID: e4f5g6h7i8j9
Revises: d3e4f5g6h7i8
"""
from alembic import op
import sqlalchemy as sa


revision = "e4f5g6h7i8j9"
down_revision = "d3e4f5g6h7i8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("usuarios", sa.Column("roles_adicionales", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("usuarios", "roles_adicionales")
