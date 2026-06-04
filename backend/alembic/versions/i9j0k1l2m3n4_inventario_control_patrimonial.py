"""inventario control patrimonial

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa

revision = "i9j0k1l2m3n4"
down_revision = "h8i9j0k1l2m3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "solicitudes_baja_inventario" not in tables:
        op.create_table(
            "solicitudes_baja_inventario",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("activo_id", sa.Integer(), nullable=False),
            sa.Column("estado", sa.String(), nullable=False, server_default="SOLICITADA"),
            sa.Column("motivo", sa.String(), nullable=False),
            sa.Column("diagnostico", sa.String(), nullable=True),
            sa.Column("evidencia_url", sa.String(), nullable=True),
            sa.Column("destino_final", sa.String(), nullable=True),
            sa.Column("observaciones", sa.String(), nullable=True),
            sa.Column("solicitado_por_id", sa.Integer(), nullable=False),
            sa.Column("revisado_por_id", sa.Integer(), nullable=True),
            sa.Column("validado_por_id", sa.Integer(), nullable=True),
            sa.Column("ejecutado_por_id", sa.Integer(), nullable=True),
            sa.Column("fecha_solicitud", sa.DateTime(), nullable=False),
            sa.Column("fecha_revision", sa.DateTime(), nullable=True),
            sa.Column("fecha_validacion", sa.DateTime(), nullable=True),
            sa.Column("fecha_ejecucion", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["activo_id"], ["activos.id"]),
            sa.ForeignKeyConstraint(["solicitado_por_id"], ["usuarios.id"]),
            sa.ForeignKeyConstraint(["revisado_por_id"], ["usuarios.id"]),
            sa.ForeignKeyConstraint(["validado_por_id"], ["usuarios.id"]),
            sa.ForeignKeyConstraint(["ejecutado_por_id"], ["usuarios.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_solicitudes_baja_inventario_id"), "solicitudes_baja_inventario", ["id"], unique=False)
        op.create_index(op.f("ix_solicitudes_baja_inventario_activo_id"), "solicitudes_baja_inventario", ["activo_id"], unique=False)

    if "levantamientos_inventario" not in tables:
        op.create_table(
            "levantamientos_inventario",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("nombre", sa.String(length=150), nullable=False),
            sa.Column("estado", sa.String(), nullable=False, server_default="ABIERTO"),
            sa.Column("departamento_id", sa.Integer(), nullable=True),
            sa.Column("laboratorio_id", sa.Integer(), nullable=True),
            sa.Column("fecha_inicio", sa.DateTime(), nullable=False),
            sa.Column("fecha_cierre", sa.DateTime(), nullable=True),
            sa.Column("creado_por_id", sa.Integer(), nullable=False),
            sa.Column("observaciones", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["departamento_id"], ["departamentos.id"]),
            sa.ForeignKeyConstraint(["laboratorio_id"], ["laboratorios.id"]),
            sa.ForeignKeyConstraint(["creado_por_id"], ["usuarios.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_levantamientos_inventario_id"), "levantamientos_inventario", ["id"], unique=False)

    if "revisiones_levantamiento_inventario" not in tables:
        op.create_table(
            "revisiones_levantamiento_inventario",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("levantamiento_id", sa.Integer(), nullable=False),
            sa.Column("activo_id", sa.Integer(), nullable=False),
            sa.Column("estado", sa.String(), nullable=False),
            sa.Column("ubicacion_reportada", sa.String(), nullable=True),
            sa.Column("resguardante_reportado", sa.String(), nullable=True),
            sa.Column("observaciones", sa.String(), nullable=True),
            sa.Column("evidencia_url", sa.String(), nullable=True),
            sa.Column("revisado_por_id", sa.Integer(), nullable=False),
            sa.Column("fecha_revision", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["levantamiento_id"], ["levantamientos_inventario.id"]),
            sa.ForeignKeyConstraint(["activo_id"], ["activos.id"]),
            sa.ForeignKeyConstraint(["revisado_por_id"], ["usuarios.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_revisiones_levantamiento_inventario_id"), "revisiones_levantamiento_inventario", ["id"], unique=False)
        op.create_index(op.f("ix_revisiones_levantamiento_inventario_levantamiento_id"), "revisiones_levantamiento_inventario", ["levantamiento_id"], unique=False)
        op.create_index(op.f("ix_revisiones_levantamiento_inventario_activo_id"), "revisiones_levantamiento_inventario", ["activo_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_revisiones_levantamiento_inventario_activo_id"), table_name="revisiones_levantamiento_inventario")
    op.drop_index(op.f("ix_revisiones_levantamiento_inventario_levantamiento_id"), table_name="revisiones_levantamiento_inventario")
    op.drop_index(op.f("ix_revisiones_levantamiento_inventario_id"), table_name="revisiones_levantamiento_inventario")
    op.drop_table("revisiones_levantamiento_inventario")
    op.drop_index(op.f("ix_levantamientos_inventario_id"), table_name="levantamientos_inventario")
    op.drop_table("levantamientos_inventario")
    op.drop_index(op.f("ix_solicitudes_baja_inventario_activo_id"), table_name="solicitudes_baja_inventario")
    op.drop_index(op.f("ix_solicitudes_baja_inventario_id"), table_name="solicitudes_baja_inventario")
    op.drop_table("solicitudes_baja_inventario")
