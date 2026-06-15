"""link computadoras with inventory assets

Revision ID: h6i7j8k9l0m1
Revises: g5h6i7j8k9l0
Create Date: 2026-06-14
"""

from alembic import op
import sqlalchemy as sa


revision = "h6i7j8k9l0m1"
down_revision = "g5h6i7j8k9l0"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("computadoras") as batch_op:
        batch_op.add_column(sa.Column("activo_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_computadoras_activo_id",
            "activos",
            ["activo_id"],
            ["id"],
        )
        batch_op.create_index("ix_computadoras_activo_id", ["activo_id"], unique=True)

    op.create_table(
        "historial_asignaciones_activo_pc",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("computadora_id", sa.Integer(), nullable=False),
        sa.Column("activo_id", sa.Integer(), nullable=False),
        sa.Column("asignado_por_id", sa.Integer(), nullable=True),
        sa.Column("fecha_inicio", sa.DateTime(), nullable=False),
        sa.Column("fecha_fin", sa.DateTime(), nullable=True),
        sa.Column("motivo", sa.String(length=250), nullable=True),
        sa.ForeignKeyConstraint(["activo_id"], ["activos.id"]),
        sa.ForeignKeyConstraint(["asignado_por_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["computadora_id"], ["computadoras.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_historial_asignaciones_activo_pc_computadora_id",
        "historial_asignaciones_activo_pc",
        ["computadora_id"],
        unique=False,
    )
    op.create_index(
        "ix_historial_asignaciones_activo_pc_activo_id",
        "historial_asignaciones_activo_pc",
        ["activo_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(
        "ix_historial_asignaciones_activo_pc_activo_id",
        table_name="historial_asignaciones_activo_pc",
    )
    op.drop_index(
        "ix_historial_asignaciones_activo_pc_computadora_id",
        table_name="historial_asignaciones_activo_pc",
    )
    op.drop_table("historial_asignaciones_activo_pc")

    with op.batch_alter_table("computadoras") as batch_op:
        batch_op.drop_index("ix_computadoras_activo_id")
        batch_op.drop_constraint("fk_computadoras_activo_id", type_="foreignkey")
        batch_op.drop_column("activo_id")
