"""add class note collective justification request

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
"""

from alembic import op
import sqlalchemy as sa


revision = "m2n3o4p5q6r7"
down_revision = "l1m2n3o4p5q6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "clases_docentes",
        sa.Column(
            "incidencia_solicita_justificacion",
            sa.Boolean(), nullable=False, server_default=sa.false(),
        ),
    )


def downgrade():
    op.drop_column("clases_docentes", "incidencia_solicita_justificacion")
