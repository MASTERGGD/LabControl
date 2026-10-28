"""Track tutor referral follow-up actions and review dates."""
from alembic import op
import sqlalchemy as sa


revision = "e2f3g4h5i6j7"
down_revision = "d1e2f3g4h5i6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("canalizaciones", sa.Column("tipo_destino", sa.String(length=20), nullable=True))
    op.add_column("canalizaciones", sa.Column("institucion_destino", sa.String(length=180), nullable=True))
    op.add_column("canalizaciones", sa.Column("plan_seguimiento", sa.Text(), nullable=True))
    op.add_column("canalizaciones", sa.Column("proxima_revision", sa.Date(), nullable=True))
    op.create_table(
        "seguimientos_canalizacion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("canalizacion_id", sa.Integer(), nullable=False),
        sa.Column("registrado_por_id", sa.Integer(), nullable=False),
        sa.Column("fecha_registro", sa.Date(), nullable=False),
        sa.Column("area_atencion", sa.String(length=100), nullable=False),
        sa.Column("tipo_servicio", sa.String(length=100), nullable=False),
        sa.Column("resumen", sa.Text(), nullable=False),
        sa.Column("tipo_destino", sa.String(length=20), nullable=False, server_default="INTERNO"),
        sa.Column("institucion_destino", sa.String(length=180), nullable=True),
        sa.Column("plan_seguimiento", sa.Text(), nullable=True),
        sa.Column("proxima_revision", sa.Date(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["canalizacion_id"], ["canalizaciones.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["registrado_por_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_seguimientos_canalizacion_id", "seguimientos_canalizacion", ["canalizacion_id"])
    op.create_index("ix_seguimientos_canalizacion_registrado_por_id", "seguimientos_canalizacion", ["registrado_por_id"])


def downgrade():
    op.drop_index("ix_seguimientos_canalizacion_registrado_por_id", table_name="seguimientos_canalizacion")
    op.drop_index("ix_seguimientos_canalizacion_id", table_name="seguimientos_canalizacion")
    op.drop_table("seguimientos_canalizacion")
    op.drop_column("canalizaciones", "proxima_revision")
    op.drop_column("canalizaciones", "plan_seguimiento")
    op.drop_column("canalizaciones", "institucion_destino")
    op.drop_column("canalizaciones", "tipo_destino")
