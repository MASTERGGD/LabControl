"""Agrega trazabilidad para captura extemporánea de asistencia docente.

Revision ID: a7b8c9d0e1f2
Revises: z6a7b8c9d0e1
"""
from alembic import op
import sqlalchemy as sa


revision = "a7b8c9d0e1f2"
down_revision = "z6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "clases_docentes",
        sa.Column("es_extemporanea", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "clases_docentes",
        sa.Column("motivo_extemporaneo", sa.Text(), nullable=True),
    )
    op.add_column(
        "clases_docentes",
        sa.Column("capturada_extemporanea_en", sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_column("clases_docentes", "capturada_extemporanea_en")
    op.drop_column("clases_docentes", "motivo_extemporaneo")
    op.drop_column("clases_docentes", "es_extemporanea")
