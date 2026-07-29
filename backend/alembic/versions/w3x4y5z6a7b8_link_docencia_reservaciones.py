"""link teacher schedule blocks to lab reservations

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
"""
from alembic import op
import sqlalchemy as sa


revision = "w3x4y5z6a7b8"
down_revision = "v2w3x4y5z6a7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("reservaciones") as batch_op:
        batch_op.add_column(sa.Column("carga_docente_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_reservaciones_carga_docente_id",
            "cargas_docentes",
            ["carga_docente_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_reservaciones_carga_docente_id", ["carga_docente_id"])


def downgrade():
    with op.batch_alter_table("reservaciones") as batch_op:
        batch_op.drop_index("ix_reservaciones_carga_docente_id")
        batch_op.drop_constraint("fk_reservaciones_carga_docente_id", type_="foreignkey")
        batch_op.drop_column("carga_docente_id")
