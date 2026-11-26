"""Conservar el reporte final, las ampliaciones y las resoluciones del cierre."""

from alembic import op
import sqlalchemy as sa

revision = "a81c73ef9402"
down_revision = "c91e8bd2314f"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cierres_academicos_periodo", sa.Column("reporte_final", sa.JSON(), nullable=True))
    op.add_column("cierres_academicos_periodo", sa.Column("historial_plazos", sa.JSON(), nullable=True))
    op.add_column("confirmaciones_carga_docente", sa.Column("cierre_administrativo", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("confirmaciones_carga_docente", "cierre_administrativo")
    op.drop_column("cierres_academicos_periodo", "historial_plazos")
    op.drop_column("cierres_academicos_periodo", "reporte_final")
