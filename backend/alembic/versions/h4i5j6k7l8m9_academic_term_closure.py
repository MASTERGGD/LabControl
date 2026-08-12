"""Agrega cierre académico y confirmación docente por carga.

Revision ID: h4i5j6k7l8m9
Revises: g3h4i5j6k7l8
"""
from alembic import op
import sqlalchemy as sa

revision = "h4i5j6k7l8m9"
down_revision = "g3h4i5j6k7l8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cierres_academicos_periodo",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("periodo_id", sa.Integer(), nullable=False),
        sa.Column("estado", sa.String(25), nullable=False, server_default="ACTIVO"),
        sa.Column("confirmacion_inicio", sa.Date(), nullable=True), sa.Column("confirmacion_fin", sa.Date(), nullable=True),
        sa.Column("observaciones", sa.Text(), nullable=True), sa.Column("configurado_por_id", sa.Integer(), nullable=False),
        sa.Column("cerrado_por_id", sa.Integer(), nullable=True), sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False), sa.Column("cerrado_en", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_escolares.id"]),
        sa.ForeignKeyConstraint(["configurado_por_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["cerrado_por_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("periodo_id", name="uq_cierre_academico_periodo"),
    )
    op.create_index("ix_cierres_academicos_periodo_id", "cierres_academicos_periodo", ["id"])
    op.create_index("ix_cierres_academicos_periodo_periodo_id", "cierres_academicos_periodo", ["periodo_id"])
    op.create_index("ix_cierres_academicos_periodo_estado", "cierres_academicos_periodo", ["estado"])
    op.create_table(
        "confirmaciones_carga_docente",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("cierre_id", sa.Integer(), nullable=False),
        sa.Column("carga_docente_id", sa.Integer(), nullable=False), sa.Column("docente_id", sa.Integer(), nullable=False),
        sa.Column("estado", sa.String(25), nullable=False, server_default="PENDIENTE_REVISION"),
        sa.Column("observaciones", sa.Text(), nullable=True), sa.Column("resumen_json", sa.JSON(), nullable=True),
        sa.Column("confirmado_en", sa.DateTime(), nullable=True), sa.Column("reabierta_hasta", sa.DateTime(), nullable=True),
        sa.Column("motivo_reapertura", sa.Text(), nullable=True), sa.Column("reabierta_por_id", sa.Integer(), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["cierre_id"], ["cierres_academicos_periodo.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["carga_docente_id"], ["cargas_docentes.id"]),
        sa.ForeignKeyConstraint(["docente_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["reabierta_por_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("cierre_id", "carga_docente_id", name="uq_confirmacion_cierre_carga"),
    )
    for column in ("id", "cierre_id", "carga_docente_id", "docente_id", "estado"):
        op.create_index(f"ix_confirmaciones_carga_docente_{column}", "confirmaciones_carga_docente", [column])


def downgrade():
    op.drop_table("confirmaciones_carga_docente")
    op.drop_table("cierres_academicos_periodo")
