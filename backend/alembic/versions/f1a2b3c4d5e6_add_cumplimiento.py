"""add_cumplimiento

Revision ID: f1a2b3c4d5e6
Revises: e4f6a3c02d18
Create Date: 2026-05-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e4f6a3c02d18'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'eventos_cumplimiento',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reservacion_id', sa.Integer(), sa.ForeignKey('reservaciones.id'), nullable=False),
        sa.Column('sesion_id', sa.Integer(), sa.ForeignKey('sesiones_clase.id'), nullable=True),
        sa.Column('tipo', sa.String(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('motivo', sa.String(), nullable=True),
        sa.Column('registrado_por_id', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('creado_en', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_eventos_cumplimiento_id', 'eventos_cumplimiento', ['id'])
    op.create_index('ix_eventos_cumplimiento_reservacion_id', 'eventos_cumplimiento', ['reservacion_id'])
    op.create_index('ix_eventos_cumplimiento_fecha', 'eventos_cumplimiento', ['fecha'])


def downgrade():
    op.drop_index('ix_eventos_cumplimiento_fecha', 'eventos_cumplimiento')
    op.drop_index('ix_eventos_cumplimiento_reservacion_id', 'eventos_cumplimiento')
    op.drop_index('ix_eventos_cumplimiento_id', 'eventos_cumplimiento')
    op.drop_table('eventos_cumplimiento')
