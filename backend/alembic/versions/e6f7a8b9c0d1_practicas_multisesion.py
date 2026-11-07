"""Relacionar sesiones de una práctica sin modificar registros históricos."""
from alembic import op
import sqlalchemy as sa

revision = 'e6f7a8b9c0d1'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('practicas_laboratorio') as batch:
        batch.add_column(sa.Column('practica_origen_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('plan_estado', sa.String(30), nullable=True))
        batch.add_column(sa.Column('fuera_horario', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch.create_foreign_key('fk_practica_origen', 'practicas_laboratorio', ['practica_origen_id'], ['id'])
        batch.create_index('ix_practicas_laboratorio_practica_origen_id', ['practica_origen_id'])


def downgrade():
    with op.batch_alter_table('practicas_laboratorio') as batch:
        batch.drop_index('ix_practicas_laboratorio_practica_origen_id')
        batch.drop_constraint('fk_practica_origen', type_='foreignkey')
        batch.drop_column('fuera_horario')
        batch.drop_column('plan_estado')
        batch.drop_column('practica_origen_id')
