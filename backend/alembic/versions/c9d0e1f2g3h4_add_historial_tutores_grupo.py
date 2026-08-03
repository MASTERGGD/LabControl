"""Agrega ciclo de vida e historial de tutores por grupo.

Revision ID: c9d0e1f2g3h4
Revises: b8c9d0e1f2g3
"""
from alembic import op
import sqlalchemy as sa

revision = "c9d0e1f2g3h4"
down_revision = "b8c9d0e1f2g3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("grupos_tutorados", sa.Column("estado", sa.String(20), nullable=False, server_default="ACTIVO"))
    op.add_column("grupos_tutorados", sa.Column("cerrado_en", sa.DateTime(), nullable=True))
    op.create_table(
        "historial_tutores_grupo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("grupo_tutorado_id", sa.Integer(), sa.ForeignKey("grupos_tutorados.id"), nullable=False),
        sa.Column("tutor_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("asignado_desde", sa.DateTime(), nullable=False),
        sa.Column("asignado_hasta", sa.DateTime(), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("asignado_por", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
    )
    op.create_index("ix_historial_tutores_grupo_grupo", "historial_tutores_grupo", ["grupo_tutorado_id"])
    op.create_index("ix_historial_tutores_grupo_tutor", "historial_tutores_grupo", ["tutor_id"])
    op.execute("""
        INSERT INTO historial_tutores_grupo
            (grupo_tutorado_id, tutor_id, asignado_desde, asignado_por)
        SELECT id, tutor_id, COALESCE(creado_en, CURRENT_TIMESTAMP), creado_por
        FROM grupos_tutorados WHERE tutor_id IS NOT NULL
    """)


def downgrade():
    op.drop_index("ix_historial_tutores_grupo_tutor", table_name="historial_tutores_grupo")
    op.drop_index("ix_historial_tutores_grupo_grupo", table_name="historial_tutores_grupo")
    op.drop_table("historial_tutores_grupo")
    op.drop_column("grupos_tutorados", "cerrado_en")
    op.drop_column("grupos_tutorados", "estado")
