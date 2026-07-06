"""add familia to inventory catalog

Revision ID: k9l0m1n2o3p5
Revises: k9l0m1n2o3p4
Create Date: 2026-07-03
"""

from alembic import op
import sqlalchemy as sa


revision = "k9l0m1n2o3p5"
down_revision = "k9l0m1n2o3p4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("catalogo_inventario", sa.Column("familia", sa.String(length=80), nullable=True))


def downgrade():
    op.drop_column("catalogo_inventario", "familia")
