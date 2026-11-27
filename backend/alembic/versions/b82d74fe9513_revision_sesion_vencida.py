"""Revisi?n y autorizaci?n de captura por sesi?n vencida."""

from alembic import op
import sqlalchemy as sa

revision = "b82d74fe9513"
down_revision = "a81c73ef9402"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "revisiones_sesion_vencida",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("carga_id", sa.Integer(), sa.ForeignKey("cargas_docentes.id"), nullable=False),
        sa.Column("docente_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("estado", sa.String(30), nullable=False),
        sa.Column("autorizada_hasta", sa.DateTime(), nullable=True),
        sa.Column("clase_id", sa.Integer(), sa.ForeignKey("clases_docentes.id", ondelete="SET NULL")),
        sa.Column("historial", sa.JSON(), nullable=False),
        sa.UniqueConstraint("carga_id", "fecha", name="uq_revision_sesion_vencida"),
    )
    op.create_index("ix_revisiones_sesion_vencida_carga_id", "revisiones_sesion_vencida", ["carga_id"])


def downgrade():
    op.drop_table("revisiones_sesion_vencida")
