"""add report supervision trace

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
"""

from alembic import op
import sqlalchemy as sa


revision = "n3o4p5q6r7s8"
down_revision = "m2n3o4p5q6r7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reportes_tutor", sa.Column("prioridad_confirmada", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("reportes_tutor", sa.Column("ultimo_recordatorio_en", sa.DateTime(), nullable=True))
    op.add_column("reportes_tutor", sa.Column("ultimo_recordatorio_por_id", sa.Integer(), nullable=True))
    op.add_column("reportes_tutor", sa.Column("reasignado_en", sa.DateTime(), nullable=True))
    op.add_column("reportes_tutor", sa.Column("reasignado_por_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_reporte_recordatorio_usuario", "reportes_tutor", "usuarios", ["ultimo_recordatorio_por_id"], ["id"])
    op.create_foreign_key("fk_reporte_reasignacion_usuario", "reportes_tutor", "usuarios", ["reasignado_por_id"], ["id"])


def downgrade():
    op.drop_constraint("fk_reporte_reasignacion_usuario", "reportes_tutor", type_="foreignkey")
    op.drop_constraint("fk_reporte_recordatorio_usuario", "reportes_tutor", type_="foreignkey")
    op.drop_column("reportes_tutor", "reasignado_por_id")
    op.drop_column("reportes_tutor", "reasignado_en")
    op.drop_column("reportes_tutor", "ultimo_recordatorio_por_id")
    op.drop_column("reportes_tutor", "ultimo_recordatorio_en")
    op.drop_column("reportes_tutor", "prioridad_confirmada")
