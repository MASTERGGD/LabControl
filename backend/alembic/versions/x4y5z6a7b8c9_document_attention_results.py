"""document attention results

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
"""

from alembic import op
import sqlalchemy as sa


revision = "x4y5z6a7b8c9"
down_revision = "w3x4y5z6a7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("seguimientos_alumnos_docente", sa.Column("resultado_atencion", sa.Text(), nullable=True))
    op.add_column("seguimientos_alumnos_docente", sa.Column("atendido_en", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("seguimientos_alumnos_docente", "atendido_en")
    op.drop_column("seguimientos_alumnos_docente", "resultado_atencion")
