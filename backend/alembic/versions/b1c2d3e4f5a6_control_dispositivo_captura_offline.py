"""Controla el dispositivo autorizado para capturar asistencias offline."""
from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5a6"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "dispositivos_captura_offline",
        sa.Column("docente_id", sa.Integer(), nullable=False),
        sa.Column("dispositivo_id", sa.String(length=80), nullable=False),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["docente_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("docente_id"),
    )


def downgrade():
    op.drop_table("dispositivos_captura_offline")
