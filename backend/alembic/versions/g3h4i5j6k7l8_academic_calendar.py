"""Agrega calendario académico oficial por periodo.

Revision ID: g3h4i5j6k7l8
Revises: f2g3h4i5j6k7
"""
from alembic import op
import sqlalchemy as sa


revision = "g3h4i5j6k7l8"
down_revision = "f2g3h4i5j6k7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "calendarios_academicos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("periodo_id", sa.Integer(), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="BORRADOR"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("observaciones", sa.Text(), nullable=True),
        sa.Column("creado_por_id", sa.Integer(), nullable=False),
        sa.Column("publicado_por_id", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.Column("publicado_en", sa.DateTime(), nullable=True),
        sa.Column("cerrado_en", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_escolares.id"]),
        sa.ForeignKeyConstraint(["creado_por_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["publicado_por_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("periodo_id", name="uq_calendario_academico_periodo"),
    )
    op.create_index("ix_calendarios_academicos_id", "calendarios_academicos", ["id"])
    op.create_index("ix_calendarios_academicos_periodo_id", "calendarios_academicos", ["periodo_id"])
    op.create_index("ix_calendarios_academicos_estado", "calendarios_academicos", ["estado"])
    op.create_table(
        "eventos_calendario_academico",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("calendario_id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_fin", sa.Date(), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=20), nullable=True),
        sa.Column("requiere_asistencia", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("permite_iniciar_clase", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("genera_alertas", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_por_id", sa.Integer(), nullable=False),
        sa.Column("actualizado_por_id", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["calendario_id"], ["calendarios_academicos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["creado_por_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["actualizado_por_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("id", "calendario_id", "tipo", "fecha_inicio", "fecha_fin"):
        op.create_index(f"ix_eventos_calendario_academico_{column}", "eventos_calendario_academico", [column])
    op.create_table(
        "historial_calendario_academico",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("calendario_id", sa.Integer(), nullable=False),
        sa.Column("evento_id", sa.Integer(), nullable=True),
        sa.Column("accion", sa.String(length=30), nullable=False),
        sa.Column("motivo", sa.String(length=500), nullable=True),
        sa.Column("datos_anteriores", sa.JSON(), nullable=True),
        sa.Column("datos_nuevos", sa.JSON(), nullable=True),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["calendario_id"], ["calendarios_academicos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("id", "calendario_id", "evento_id", "accion", "usuario_id"):
        op.create_index(f"ix_historial_calendario_academico_{column}", "historial_calendario_academico", [column])


def downgrade():
    op.drop_table("historial_calendario_academico")
    op.drop_table("eventos_calendario_academico")
    op.drop_table("calendarios_academicos")
