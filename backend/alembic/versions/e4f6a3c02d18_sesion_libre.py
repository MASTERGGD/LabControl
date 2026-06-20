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
    with op.batch_alter_table('sesiones_clase', schema=None) as batch_op:
        # Agregar tipo_sesion
        batch_op.add_column(
            sa.Column('tipo_sesion', sa.String(), nullable=True, server_default='CLASE')
        )
        # Hacer materia y grupo nullable
        batch_op.alter_column('materia', existing_type=sa.String(), nullable=True)
        batch_op.alter_column('grupo',   existing_type=sa.String(), nullable=True)

def downgrade():
    with op.batch_alter_table('sesiones_clase', schema=None) as batch_op:
        batch_op.alter_column('materia', existing_type=sa.String(), nullable=False)
        batch_op.alter_column('grupo',   existing_type=sa.String(), nullable=False)
        batch_op.drop_column('tipo_sesion')
