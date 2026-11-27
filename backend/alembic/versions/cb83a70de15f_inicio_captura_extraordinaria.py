"""Inicio programado de la captura extraordinaria."""

from alembic import op
import sqlalchemy as sa

revision = "cb83a70de15f"
down_revision = "b82d74fe9513"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("revisiones_sesion_vencida", sa.Column("autorizada_desde", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("revisiones_sesion_vencida", "autorizada_desde")
