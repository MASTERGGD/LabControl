"""add institutional laboratory activities and non-teaching-day authorization

Revision ID: p7q8r9s0t1u2
Revises: o1p2q3r4s5t6
"""

from alembic import op
import sqlalchemy as sa

revision = "p7q8r9s0t1u2"
down_revision = "o1p2q3r4s5t6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reservaciones", sa.Column("tipo_actividad", sa.String(30), nullable=False, server_default="CLASE"))
    op.add_column("reservaciones", sa.Column("fecha_actividad", sa.Date(), nullable=True))
    op.add_column("reservaciones", sa.Column("autorizada_dia_no_lectivo", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("reservaciones", sa.Column("autorizado_por_id", sa.Integer(), nullable=True))
    op.add_column("reservaciones", sa.Column("autorizado_en", sa.DateTime(), nullable=True))
    op.add_column("reservaciones", sa.Column("motivo_autorizacion", sa.String(300), nullable=True))
    op.create_foreign_key("fk_reservaciones_autorizado_por", "reservaciones", "usuarios", ["autorizado_por_id"], ["id"])


def downgrade():
    op.drop_constraint("fk_reservaciones_autorizado_por", "reservaciones", type_="foreignkey")
    for columna in ("motivo_autorizacion", "autorizado_en", "autorizado_por_id", "autorizada_dia_no_lectivo", "fecha_actividad", "tipo_actividad"):
        op.drop_column("reservaciones", columna)
