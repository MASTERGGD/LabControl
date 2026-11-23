"""Aviso institucional en el inicio docente."""
from alembic import op
import sqlalchemy as sa

revision = "da08d4151ba2"
down_revision = "91b8ac4e72f0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "aviso_inicio_docente",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("revision", sa.String(36), nullable=False),
        sa.Column("titulo", sa.String(100), nullable=False),
        sa.Column("mensaje", sa.String(400), nullable=False),
        sa.Column("destino", sa.String(20), nullable=True),
        sa.Column("vigente_hasta", sa.Date(), nullable=False),
    )


def downgrade():
    op.drop_table("aviso_inicio_docente")
