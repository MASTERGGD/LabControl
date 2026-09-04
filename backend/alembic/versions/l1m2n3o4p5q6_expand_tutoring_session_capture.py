"""expand tutoring session capture

Revision ID: l1m2n3o4p5q6
Revises: k0l1m2n3o4p5
"""
from alembic import op
import sqlalchemy as sa


revision = "l1m2n3o4p5q6"
down_revision = "k0l1m2n3o4p5"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("sesiones_tutoria") as batch_op:
        batch_op.add_column(sa.Column("hora_inicio", sa.Time(), nullable=True))
        batch_op.add_column(sa.Column("duracion_minutos", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("lugar", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("categoria", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("categoria_otro", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("tema", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("acciones_preventivas", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("creado_por", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("actualizado_en", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            "fk_sesiones_tutoria_creado_por_usuarios",
            "usuarios", ["creado_por"], ["id"],
        )


def downgrade():
    with op.batch_alter_table("sesiones_tutoria") as batch_op:
        batch_op.drop_constraint("fk_sesiones_tutoria_creado_por_usuarios", type_="foreignkey")
        for column in (
            "actualizado_en", "creado_por", "acciones_preventivas", "tema",
            "categoria_otro", "categoria", "lugar", "duracion_minutos", "hora_inicio",
        ):
            batch_op.drop_column(column)
