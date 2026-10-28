"""Add actionable follow-up requests to tutor reports."""
from alembic import op
import sqlalchemy as sa


revision = "d1e2f3g4h5i6"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "acciones_reportes_tutor",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reporte_id", sa.Integer(), nullable=False),
        sa.Column("solicitada_por_id", sa.Integer(), nullable=False),
        sa.Column("asignada_a_id", sa.Integer(), nullable=False),
        sa.Column("instruccion", sa.Text(), nullable=False),
        sa.Column("fecha_limite", sa.Date(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="PENDIENTE"),
        sa.Column("respuesta", sa.Text(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("atendido_en", sa.DateTime(), nullable=True),
        sa.Column("cancelado_en", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["reporte_id"], ["reportes_tutor.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["solicitada_por_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["asignada_a_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("reporte_id", "solicitada_por_id", "asignada_a_id", "estado"):
        op.create_index(
            f"ix_acciones_reportes_tutor_{column}",
            "acciones_reportes_tutor",
            [column],
            unique=False,
        )


def downgrade():
    for column in ("estado", "asignada_a_id", "solicitada_por_id", "reporte_id"):
        op.drop_index(f"ix_acciones_reportes_tutor_{column}", table_name="acciones_reportes_tutor")
    op.drop_table("acciones_reportes_tutor")
