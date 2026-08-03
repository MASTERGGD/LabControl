"""Amplia el catalogo institucional de carreras.

Revision ID: d0e1f2g3h4i5
Revises: c9d0e1f2g3h4
"""
from alembic import op
import sqlalchemy as sa

revision = "d0e1f2g3h4i5"
down_revision = "c9d0e1f2g3h4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("catalogo_carreras", sa.Column("nivel", sa.String(30), nullable=True))
    op.add_column("catalogo_carreras", sa.Column("division", sa.String(120), nullable=True))
    op.add_column("catalogo_carreras", sa.Column("plan_estudios", sa.String(80), nullable=True))
    op.create_table(
        "catalogo_carreras_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("carrera_id", sa.Integer(), sa.ForeignKey("catalogo_carreras.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nombre", sa.String(180), nullable=False, unique=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_catalogo_carreras_aliases_carrera", "catalogo_carreras_aliases", ["carrera_id"])
    op.create_index("ix_catalogo_carreras_aliases_nombre", "catalogo_carreras_aliases", ["nombre"], unique=True)


def downgrade():
    op.drop_index("ix_catalogo_carreras_aliases_nombre", table_name="catalogo_carreras_aliases")
    op.drop_index("ix_catalogo_carreras_aliases_carrera", table_name="catalogo_carreras_aliases")
    op.drop_table("catalogo_carreras_aliases")
    op.drop_column("catalogo_carreras", "plan_estudios")
    op.drop_column("catalogo_carreras", "division")
    op.drop_column("catalogo_carreras", "nivel")
