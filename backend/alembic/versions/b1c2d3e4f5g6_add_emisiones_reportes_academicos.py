"""Agrega emisiones persistentes para reportes académicos.

Revision ID: b1c2d3e4f5g6
Revises: a7b8c9d0e1f2
"""
from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5g6"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "emisiones_reportes_academicos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("folio", sa.String(length=60), nullable=True),
        sa.Column("periodo_id", sa.Integer(), sa.ForeignKey("periodos_escolares.id"), nullable=False),
        sa.Column("generado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("alcance", sa.Text(), nullable=False),
        sa.Column("fecha_desde", sa.String(length=10), nullable=False),
        sa.Column("fecha_hasta", sa.String(length=10), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("generado_en", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("folio", name="uq_emisiones_reportes_academicos_folio"),
        sa.UniqueConstraint("content_hash", name="uq_emision_reporte_academico_contenido"),
    )
    op.create_index("ix_emisiones_reportes_academicos_folio", "emisiones_reportes_academicos", ["folio"])
    op.create_index("ix_emisiones_reportes_academicos_periodo_id", "emisiones_reportes_academicos", ["periodo_id"])
    op.create_index("ix_emisiones_reportes_academicos_generado_por_id", "emisiones_reportes_academicos", ["generado_por_id"])
    op.create_index("ix_emisiones_reportes_academicos_content_hash", "emisiones_reportes_academicos", ["content_hash"])


def downgrade():
    op.drop_table("emisiones_reportes_academicos")
