"""Track the lifecycle of class topics and assigned work.

Revision ID: p9q0r1s2t3u4
Revises: o4p5q6r7s8t9
"""
from alembic import op
import sqlalchemy as sa


revision = "p9q0r1s2t3u4"
down_revision = "o4p5q6r7s8t9"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("clases_docentes") as batch_op:
        batch_op.add_column(sa.Column(
            "tema_pendiente_estado", sa.String(length=20), nullable=False,
            server_default="PENDIENTE",
        ))
        batch_op.add_column(sa.Column(
            "tarea_asignada_estado", sa.String(length=20), nullable=False,
            server_default="PENDIENTE",
        ))


def downgrade():
    with op.batch_alter_table("clases_docentes") as batch_op:
        batch_op.drop_column("tarea_asignada_estado")
        batch_op.drop_column("tema_pendiente_estado")
