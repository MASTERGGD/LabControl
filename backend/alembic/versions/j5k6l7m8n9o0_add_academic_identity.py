"""add academic identity to sesiones and reservaciones

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = 'j5k6l7m8n9o0'
down_revision = 'i4j5k6l7m8n9'
branch_labels = None
depends_on = None


def upgrade():
    # sesiones_clase: agregar carrera y cuatrimestre (identidad académica de la materia)
    op.add_column('sesiones_clase',
        sa.Column('carrera', sa.String(length=120), nullable=True))
    op.add_column('sesiones_clase',
        sa.Column('cuatrimestre', sa.String(length=20), nullable=True))

    # reservaciones: agregar carrera y cuatrimestre_materia
    # (cuatrimestre ya existe como período "ENE-ABR-2025"; el nuevo es el número 1-12)
    op.add_column('reservaciones',
        sa.Column('carrera', sa.String(length=120), nullable=True))
    op.add_column('reservaciones',
        sa.Column('cuatrimestre_materia', sa.String(length=20), nullable=True))


def downgrade():
    op.drop_column('reservaciones', 'cuatrimestre_materia')
    op.drop_column('reservaciones', 'carrera')
    op.drop_column('sesiones_clase', 'cuatrimestre')
    op.drop_column('sesiones_clase', 'carrera')
