"""Agrega reposiciones de clase de una sola fecha."""
from alembic import op
import sqlalchemy as sa


revision = "k7l8m9n0o1p2"
down_revision = "j6k7l8m9n0o1"
branch_labels = None
depends_on = None


def upgrade():
    for nombre, tipo in (
        ("es_reposicion", sa.Boolean()), ("fecha_original", sa.Date()),
        ("hora_inicio_reposicion", sa.String(5)), ("hora_fin_reposicion", sa.String(5)),
        ("motivo_reposicion", sa.Text()), ("estado_reposicion", sa.String(20)),
        ("cancelada_en", sa.DateTime()),
    ):
        op.add_column("clases_docentes", sa.Column(
            nombre, tipo, nullable=False if nombre == "es_reposicion" else True,
            server_default=sa.false() if nombre == "es_reposicion" else None,
        ))
    op.create_index("ix_clases_docentes_reposicion", "clases_docentes", ["es_reposicion", "fecha"])


def downgrade():
    op.drop_index("ix_clases_docentes_reposicion", table_name="clases_docentes")
    for nombre in ("cancelada_en", "estado_reposicion", "motivo_reposicion", "hora_fin_reposicion", "hora_inicio_reposicion", "fecha_original", "es_reposicion"):
        op.drop_column("clases_docentes", nombre)
