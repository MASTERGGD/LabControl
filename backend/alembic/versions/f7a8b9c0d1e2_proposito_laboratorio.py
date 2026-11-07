"""Distinguir uso académico e individual sin reclasificar registros anteriores."""
from alembic import op
import sqlalchemy as sa
revision = 'f7a8b9c0d1e2'
down_revision = 'e6f7a8b9c0d1'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('practicas_laboratorio') as batch:
        batch.add_column(sa.Column('proposito', sa.String(20), nullable=True))
        batch.add_column(sa.Column('incluye_practica', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column('participantes', sa.Text(), nullable=True))

def downgrade():
    with op.batch_alter_table('practicas_laboratorio') as batch:
        batch.drop_column('participantes')
        batch.drop_column('incluye_practica')
        batch.drop_column('proposito')
