"""add uso laboratorio to cargas docentes

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
"""
from alembic import op
import sqlalchemy as sa


revision = "j9k0l1m2n3o4"
down_revision = "i8j9k0l1m2n3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "cargas_docentes",
        sa.Column("uso_laboratorio", sa.String(length=20), nullable=False, server_default="EQUIPOS"),
    )


def downgrade():
    op.drop_column("cargas_docentes", "uso_laboratorio")
