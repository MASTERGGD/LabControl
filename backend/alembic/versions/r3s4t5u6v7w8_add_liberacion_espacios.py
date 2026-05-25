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
    op.add_column("solicitudes_espacio", sa.Column("liberado_por", sa.Integer(), nullable=True))
    op.add_column("solicitudes_espacio", sa.Column("liberado_en", sa.DateTime(), nullable=True))
    op.add_column("solicitudes_espacio", sa.Column("motivo_liberacion", sa.Text(), nullable=True))
    op.add_column("solicitudes_espacio", sa.Column("evento_prioritario", sa.Boolean(), nullable=False, server_default="false"))
    op.create_foreign_key("fk_solicitud_liberado_por_usuario", "solicitudes_espacio", "usuarios", ["liberado_por"], ["id"])


def downgrade():
    op.drop_constraint("fk_solicitud_liberado_por_usuario", "solicitudes_espacio", type_="foreignkey")
    op.drop_column("solicitudes_espacio", "evento_prioritario")
    op.drop_column("solicitudes_espacio", "motivo_liberacion")
    op.drop_column("solicitudes_espacio", "liberado_en")
    op.drop_column("solicitudes_espacio", "liberado_por")
