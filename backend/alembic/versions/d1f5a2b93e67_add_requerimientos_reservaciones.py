"""add_requerimientos_clase

Revision ID: d1f5a2b93e67
Revises: c9e2f3a84d51
Create Date: 2026-05-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'd1f5a2b93e67'
down_revision = 'c9e2f3a84d51'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'requerimientos_clase',
        sa.Column('id',               sa.Integer(),  nullable=False),
        sa.Column('reservacion_id',   sa.Integer(),  nullable=False),
        sa.Column('items',            sa.String(),   nullable=True),
        sa.Column('descripcion',      sa.String(),   nullable=True),
        sa.Column('tiene_instalador', sa.Boolean(),  nullable=True),
        sa.Column('urgente',          sa.Boolean(),  nullable=True),
        sa.Column('dias_anticipacion',sa.Integer(),  nullable=True),
        sa.Column('estado',           sa.String(),   nullable=True),
        sa.Column('nota_admin',       sa.String(),   nullable=True),
        sa.Column('creado_en',        sa.DateTime(), nullable=True),
        sa.Column('resuelto_en',      sa.DateTime(), nullable=True),
        sa.Column('resuelto_por_id',  sa.Integer(),  nullable=True),
        sa.ForeignKeyConstraint(['reservacion_id'], ['reservaciones.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resuelto_por_id'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_requerimientos_clase_id', 'requerimientos_clase', ['id'])


def downgrade():
    op.drop_index('ix_requerimientos_clase_id', table_name='requerimientos_clase')
    op.drop_table('requerimientos_clase')
