"""Tabulador y recibos del control interno de caja."""
from alembic import op
import sqlalchemy as sa

revision = "f19b4d820c35"
down_revision = "cb83a70de15f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cobranza_conceptos", sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("departamento_id", sa.Integer, sa.ForeignKey("departamentos.id"), nullable=False),
        sa.Column("nombre", sa.String(150), nullable=False),
        sa.Column("importe_centavos", sa.Integer, nullable=False),
        sa.Column("activo", sa.Boolean, nullable=False),
    )
    op.create_table(
        "cobranza_pagos", sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("departamento_id", sa.Integer, sa.ForeignKey("departamentos.id"), nullable=False),
        sa.Column("operacion", sa.String(36), nullable=False),
        sa.Column("alumno_id", sa.Integer, sa.ForeignKey("catalogo_alumnos.id", ondelete="SET NULL")),
        sa.Column("concepto_id", sa.Integer, sa.ForeignKey("cobranza_conceptos.id"), nullable=False),
        sa.Column("cajero_id", sa.Integer, sa.ForeignKey("usuarios.id", ondelete="SET NULL")),
        sa.Column("matricula", sa.String(30), nullable=False),
        sa.Column("alumno", sa.String(300), nullable=False),
        sa.Column("periodo", sa.String(20), nullable=False),
        sa.Column("concepto", sa.String(150), nullable=False),
        sa.Column("cajero", sa.String(200), nullable=False),
        sa.Column("importe_centavos", sa.Integer, nullable=False),
        sa.Column("recibido_centavos", sa.Integer, nullable=False),
        sa.Column("medio", sa.String(20), nullable=False),
        sa.Column("referencia", sa.String(120)),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("departamento_id", "operacion", name="uq_cobranza_operacion"),
    )


def downgrade():
    op.drop_table("cobranza_pagos")
    op.drop_table("cobranza_conceptos")
