"""add agreement deadline

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
"""

from alembic import op
import sqlalchemy as sa

revision = "m9n0o1p2q3r4"
down_revision = "l8m9n0o1p2q3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("seguimientos_alumnos_docente", sa.Column("fecha_limite", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("seguimientos_alumnos_docente", "fecha_limite")
