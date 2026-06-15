"""add immutable incident follow-up history

Revision ID: i7j8k9l0m1n2
Revises: h6i7j8k9l0m1
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa


revision = "i7j8k9l0m1n2"
down_revision = "h6i7j8k9l0m1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "incidente_seguimientos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("incidente_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("tipo", sa.String(length=30), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("estado_anterior", sa.String(length=30), nullable=True),
        sa.Column("estado_nuevo", sa.String(length=30), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["incidente_id"], ["incidentes.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_incidente_seguimientos_incidente_id",
        "incidente_seguimientos",
        ["incidente_id"],
        unique=False,
    )
    op.create_index(
        "ix_incidente_seguimientos_usuario_id",
        "incidente_seguimientos",
        ["usuario_id"],
        unique=False,
    )

    op.execute(
        sa.text(
            """
            INSERT INTO incidente_seguimientos
                (incidente_id, usuario_id, tipo, texto, estado_anterior, estado_nuevo, creado_en)
            SELECT
                id, NULL, 'NOTA_LEGACY', notas_seguimiento, NULL, NULL,
                COALESCE(fecha_resolucion, fecha_reporte, CURRENT_TIMESTAMP)
            FROM incidentes
            WHERE notas_seguimiento IS NOT NULL
              AND TRIM(notas_seguimiento) <> ''
            """
        )
    )


def downgrade():
    op.drop_index(
        "ix_incidente_seguimientos_usuario_id",
        table_name="incidente_seguimientos",
    )
    op.drop_index(
        "ix_incidente_seguimientos_incidente_id",
        table_name="incidente_seguimientos",
    )
    op.drop_table("incidente_seguimientos")
