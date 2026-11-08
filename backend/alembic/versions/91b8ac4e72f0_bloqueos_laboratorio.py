"""Bloqueos por fechas y horas de laboratorio, sin alterar el horario semanal."""
from alembic import op
import sqlalchemy as sa

revision = '91b8ac4e72f0'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('bloqueos_laboratorio',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('laboratorio_id', sa.Integer(), sa.ForeignKey('laboratorios.id'), nullable=False),
        sa.Column('desde', sa.Date(), nullable=False), sa.Column('hasta', sa.Date(), nullable=False),
        sa.Column('hora_inicio', sa.String(5), nullable=False), sa.Column('hora_fin', sa.String(5), nullable=False),
        sa.Column('motivo', sa.String(300), nullable=False),
        sa.Column('creado_por_id', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('creado_en', sa.DateTime(), nullable=False),
        sa.Column('activo', sa.Boolean(), nullable=False),
        sa.Column('desactivado_por_id', sa.Integer(), sa.ForeignKey('usuarios.id')),
        sa.Column('desactivado_en', sa.DateTime()))
    op.create_index('ix_bloqueos_laboratorio_laboratorio_id', 'bloqueos_laboratorio', ['laboratorio_id'])


def downgrade():
    op.drop_index('ix_bloqueos_laboratorio_laboratorio_id', table_name='bloqueos_laboratorio')
    op.drop_table('bloqueos_laboratorio')
