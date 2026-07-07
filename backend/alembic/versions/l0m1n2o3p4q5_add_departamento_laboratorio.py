"""add departamento to laboratorios

Revision ID: l0m1n2o3p4q5
Revises: k9l0m1n2o3p4
Create Date: 2026-07-06
"""

from alembic import op
import sqlalchemy as sa


revision = "l0m1n2o3p4q5"
down_revision = "k9l0m1n2o3p4"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("laboratorios") as batch_op:
        batch_op.add_column(sa.Column("departamento_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_laboratorios_departamento_id_departamentos",
            "departamentos",
            ["departamento_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_laboratorios_departamento_id", ["departamento_id"])


def downgrade():
    with op.batch_alter_table("laboratorios") as batch_op:
        batch_op.drop_index("ix_laboratorios_departamento_id")
        batch_op.drop_constraint("fk_laboratorios_departamento_id_departamentos", type_="foreignkey")
        batch_op.drop_column("departamento_id")
