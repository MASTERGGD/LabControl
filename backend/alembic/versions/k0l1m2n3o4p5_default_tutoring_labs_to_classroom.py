"""default existing tutoring laboratory loads to classroom use

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
"""
from alembic import op


revision = "k0l1m2n3o4p5"
down_revision = "j9k0l1m2n3o4"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "UPDATE cargas_docentes SET uso_laboratorio = 'SOLO_AULA' "
        "WHERE tipo_actividad = 'TUTORIA' AND laboratorio_id IS NOT NULL"
    )


def downgrade():
    op.execute(
        "UPDATE cargas_docentes SET uso_laboratorio = 'EQUIPOS' "
        "WHERE tipo_actividad = 'TUTORIA' AND laboratorio_id IS NOT NULL"
    )
