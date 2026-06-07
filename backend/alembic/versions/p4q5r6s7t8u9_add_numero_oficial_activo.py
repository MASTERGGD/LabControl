"""add_numero_oficial_activo

Revision ID: p4q5r6s7t8u9
Revises: p3q4r5s6t7u8
Create Date: 2026-06-04
"""

from alembic import op
import sqlalchemy as sa


revision = "p4q5r6s7t8u9"
down_revision = "p3q4r5s6t7u8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("activos") as batch_op:
        batch_op.add_column(sa.Column("numero_oficial", sa.String(length=80), nullable=True))
        batch_op.create_unique_constraint("uq_activos_numero_oficial", ["numero_oficial"])


def downgrade() -> None:
    with op.batch_alter_table("activos") as batch_op:
        batch_op.drop_constraint("uq_activos_numero_oficial", type_="unique")
        batch_op.drop_column("numero_oficial")
