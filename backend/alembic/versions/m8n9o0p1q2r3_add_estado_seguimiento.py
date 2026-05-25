"""add_estado_seguimiento_tutoria

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-05-20

Agrega estado institucional de seguimiento por alumno tutorado:
  - estado_seguimiento       VARCHAR(30)  DEFAULT 'SIN_SEGUIMIENTO'
  - estado_observaciones     TEXT
  - estado_actualizado_en    TIMESTAMP
"""
import sqlalchemy as sa
from alembic import op

revision = 'm8n9o0p1q2r3'
down_revision = 'l7m8n9o0p1q2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('asignaciones_tutoria',
        sa.Column('estado_seguimiento', sa.String(30), nullable=False, server_default='SIN_SEGUIMIENTO'))
    op.add_column('asignaciones_tutoria',
        sa.Column('estado_observaciones', sa.Text(), nullable=True))
    op.add_column('asignaciones_tutoria',
        sa.Column('estado_actualizado_en', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('asignaciones_tutoria', 'estado_actualizado_en')
    op.drop_column('asignaciones_tutoria', 'estado_observaciones')
    op.drop_column('asignaciones_tutoria', 'estado_seguimiento')
