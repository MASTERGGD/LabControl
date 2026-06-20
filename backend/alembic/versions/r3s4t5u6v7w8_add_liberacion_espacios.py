"""add_liberacion_espacios

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-05-21

"""
from alembic import op
import sqlalchemy as sa


revision = "r3s4t5u6v7w8"
down_revision = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("solicitudes_espacio", schema=None) as batch_op:
        batch_op.add_column(sa.Column("liberado_por", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("liberado_en", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("motivo_liberacion", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("evento_prioritario", sa.Boolean(), nullable=False, server_default="false"))
        batch_op.create_foreign_key("fk_solicitud_liberado_por_usuario", "usuarios", ["liberado_por"], ["id"])


def downgrade():
    with op.batch_alter_table("solicitudes_espacio", schema=None) as batch_op:
        batch_op.drop_constraint("fk_solicitud_liberado_por_usuario", type_="foreignkey")
        batch_op.drop_column("evento_prioritario")
        batch_op.drop_column("motivo_liberacion")
        batch_op.drop_column("liberado_en")
        batch_op.drop_column("liberado_por")
