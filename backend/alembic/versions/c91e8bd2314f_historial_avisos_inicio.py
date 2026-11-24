"""Conserva el aviso vigente y las versiones de los avisos de inicio."""
from alembic import op
import sqlalchemy as sa

revision = "c91e8bd2314f"
down_revision = "ab2d0f83c719"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "historial_avisos_inicio",
        sa.Column("revision", sa.String(36), primary_key=True),
        sa.Column("aviso_id", sa.String(36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(100), nullable=False),
        sa.Column("mensaje", sa.String(400), nullable=False),
        sa.Column("destino", sa.String(20)),
        sa.Column("audiencia", sa.String(10), nullable=False),
        sa.Column("vigente_hasta", sa.Date(), nullable=False),
        sa.Column("publicado_en", sa.DateTime(timezone=True)),
        sa.Column("publicado_por", sa.String(200)),
        sa.Column("estado_final", sa.String(20)),
        sa.Column("cerrado_en", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("aviso_id", "version", name="uq_historial_aviso_version"),
    )
    op.execute("""
        INSERT INTO historial_avisos_inicio
          (revision, aviso_id, version, titulo, mensaje, destino, audiencia, vigente_hasta)
        SELECT revision, revision, 1, titulo, mensaje, destino, audiencia, vigente_hasta
        FROM aviso_inicio_docente
    """)


def downgrade():
    op.drop_table("historial_avisos_inicio")
