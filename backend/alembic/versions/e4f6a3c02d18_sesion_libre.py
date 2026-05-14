"""sesion_libre: tipo_sesion + materia/grupo nullable

Revision ID: e4f6a3c02d18
Revises: c9e2f3a84d51
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'e4f6a3c02d18'
down_revision = 'd1f5a2b93e67'
branch_labels = None
depends_on = None

def upgrade():
    # Agregar tipo_sesion
    op.add_column('sesiones_clase',
        sa.Column('tipo_sesion', sa.String(), nullable=True, server_default='CLASE')
    )
    # Hacer materia y grupo nullable
    op.alter_column('sesiones_clase', 'materia', nullable=True)
    op.alter_column('sesiones_clase', 'grupo',   nullable=True)

def downgrade():
    op.alter_column('sesiones_clase', 'materia', nullable=False)
    op.alter_column('sesiones_clase', 'grupo',   nullable=False)
    op.drop_column('sesiones_clase', 'tipo_sesion')
