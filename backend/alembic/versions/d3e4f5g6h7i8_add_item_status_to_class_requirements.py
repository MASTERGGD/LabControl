"""add item status to class requirements

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
"""
from alembic import op
import sqlalchemy as sa


revision = "d3e4f5g6h7i8"
down_revision = "c2d3e4f5g6h7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("requerimientos_clase", sa.Column("items_estado", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("requerimientos_clase", "items_estado")
