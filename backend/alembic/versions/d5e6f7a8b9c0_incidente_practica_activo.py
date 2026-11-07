"""Agregar referencia de equipo a incidentes de práctica conservando registros."""
from alembic import op
import sqlalchemy as sa

revision = 'd5e6f7a8b9c0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('incidentes_practica') as batch:
        batch.add_column(sa.Column('activo_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_incidentes_practica_activo_id', 'activos', ['activo_id'], ['id'])


def downgrade():
    with op.batch_alter_table('incidentes_practica') as batch:
        batch.drop_constraint('fk_incidentes_practica_activo_id', type_='foreignkey')
        batch.drop_column('activo_id')
