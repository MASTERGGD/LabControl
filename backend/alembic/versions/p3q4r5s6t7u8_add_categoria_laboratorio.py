"""add_categoria_laboratorio

Revision ID: p3q4r5s6t7u8
Revises: p2q3r4s5t6u7
Create Date: 2026-06-04
"""

from alembic import op
import sqlalchemy as sa


revision = "p3q4r5s6t7u8"
down_revision = "p2q3r4s5t6u7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("laboratorios") as batch_op:
        batch_op.add_column(sa.Column("categoria", sa.String(length=80), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("laboratorios") as batch_op:
        batch_op.drop_column("categoria")
