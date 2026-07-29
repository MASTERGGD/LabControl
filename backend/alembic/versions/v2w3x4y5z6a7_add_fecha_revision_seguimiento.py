"""add review date to teacher student follow-up

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
"""
from alembic import op
import sqlalchemy as sa


revision = "v2w3x4y5z6a7"
down_revision = "u1v2w3x4y5z6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("seguimientos_alumnos_docente") as batch_op:
        batch_op.add_column(sa.Column("fecha_revision", sa.Date(), nullable=True))


def downgrade():
    with op.batch_alter_table("seguimientos_alumnos_docente") as batch_op:
        batch_op.drop_column("fecha_revision")
