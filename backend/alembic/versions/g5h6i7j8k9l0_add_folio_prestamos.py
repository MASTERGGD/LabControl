"""add folio to prestamos

Revision ID: g5h6i7j8k9l0
Revises: f4a5b6c7d8e9
Create Date: 2026-06-14
"""

from alembic import op
import sqlalchemy as sa


revision = "g5h6i7j8k9l0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("prestamos") as batch_op:
        batch_op.add_column(sa.Column("folio", sa.String(length=40), nullable=True))
        batch_op.create_index("ix_prestamos_folio", ["folio"], unique=False)


def downgrade():
    with op.batch_alter_table("prestamos") as batch_op:
        batch_op.drop_index("ix_prestamos_folio")
        batch_op.drop_column("folio")
