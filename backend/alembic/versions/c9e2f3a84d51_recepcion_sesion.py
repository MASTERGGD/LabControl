"""recepcion_sesion — campos de revisión de recepción en sesiones_clase y observaciones_pc

Revision ID: c9e2f3a84d51
Revises: b7d4e1f92c38
Create Date: 2026-05-06
"""
from alembic import op
import sqlalchemy as sa

revision = 'c9e2f3a84d51'
down_revision = 'b7d4e1f92c38'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("sesiones_clase") as batch:
        batch.add_column(sa.Column("recepcion_confirmada", sa.Boolean(), nullable=True, server_default="false"))
        batch.add_column(sa.Column("recepcion_fin", sa.DateTime(), nullable=True))

    with op.batch_alter_table("observaciones_pc") as batch:
        batch.add_column(sa.Column("momento", sa.String(), nullable=True, server_default="DURANTE_SESION"))


def downgrade():
    with op.batch_alter_table("sesiones_clase") as batch:
        batch.drop_column("recepcion_confirmada")
        batch.drop_column("recepcion_fin")

    with op.batch_alter_table("observaciones_pc") as batch:
        batch.drop_column("momento")
