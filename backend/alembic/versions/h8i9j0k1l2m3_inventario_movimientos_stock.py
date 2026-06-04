"""inventario movimientos stock

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa

revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    columns = [
        ("tipo_inventario", sa.Column("tipo_inventario", sa.String(), nullable=False, server_default="ACTIVO")),
        ("estado_admin", sa.Column("estado_admin", sa.String(), nullable=False, server_default="VALIDADO")),
        ("cantidad", sa.Column("cantidad", sa.Float(), nullable=False, server_default="1")),
        ("unidad_medida", sa.Column("unidad_medida", sa.String(), nullable=False, server_default="PIEZA")),
        ("stock_minimo", sa.Column("stock_minimo", sa.Float(), nullable=True)),
    ]
    for name, column in columns:
        if not _has_column(inspector, "activos", name):
            op.add_column("activos", column)

    if "movimientos_inventario" not in tables:
        op.create_table(
            "movimientos_inventario",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("activo_id", sa.Integer(), nullable=False),
            sa.Column("tipo", sa.String(), nullable=False),
            sa.Column("estado", sa.String(), nullable=False, server_default="SOLICITADO"),
            sa.Column("departamento_origen_id", sa.Integer(), nullable=True),
            sa.Column("departamento_destino_id", sa.Integer(), nullable=True),
            sa.Column("ubicacion_origen_id", sa.Integer(), nullable=True),
            sa.Column("ubicacion_destino_id", sa.Integer(), nullable=True),
            sa.Column("resguardante_origen_id", sa.Integer(), nullable=True),
            sa.Column("resguardante_destino_id", sa.Integer(), nullable=True),
            sa.Column("ubicacion_origen_nombre", sa.String(), nullable=True),
            sa.Column("ubicacion_destino_nombre", sa.String(), nullable=True),
            sa.Column("resguardante_origen_nombre", sa.String(), nullable=True),
            sa.Column("resguardante_destino_nombre", sa.String(), nullable=True),
            sa.Column("cantidad", sa.Float(), nullable=True),
            sa.Column("solicitado_por_id", sa.Integer(), nullable=False),
            sa.Column("autorizado_por_id", sa.Integer(), nullable=True),
            sa.Column("entregado_por_id", sa.Integer(), nullable=True),
            sa.Column("recibido_por_id", sa.Integer(), nullable=True),
            sa.Column("fecha_solicitud", sa.DateTime(), nullable=False),
            sa.Column("fecha_autorizacion", sa.DateTime(), nullable=True),
            sa.Column("fecha_entrega", sa.DateTime(), nullable=True),
            sa.Column("fecha_recepcion", sa.DateTime(), nullable=True),
            sa.Column("observaciones", sa.String(), nullable=True),
            sa.Column("evidencia_url", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["activo_id"], ["activos.id"]),
            sa.ForeignKeyConstraint(["departamento_origen_id"], ["departamentos.id"]),
            sa.ForeignKeyConstraint(["departamento_destino_id"], ["departamentos.id"]),
            sa.ForeignKeyConstraint(["ubicacion_origen_id"], ["ubicaciones_inventario.id"]),
            sa.ForeignKeyConstraint(["ubicacion_destino_id"], ["ubicaciones_inventario.id"]),
            sa.ForeignKeyConstraint(["resguardante_origen_id"], ["usuarios.id"]),
            sa.ForeignKeyConstraint(["resguardante_destino_id"], ["usuarios.id"]),
            sa.ForeignKeyConstraint(["solicitado_por_id"], ["usuarios.id"]),
            sa.ForeignKeyConstraint(["autorizado_por_id"], ["usuarios.id"]),
            sa.ForeignKeyConstraint(["entregado_por_id"], ["usuarios.id"]),
            sa.ForeignKeyConstraint(["recibido_por_id"], ["usuarios.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_movimientos_inventario_id"), "movimientos_inventario", ["id"], unique=False)
        op.create_index(op.f("ix_movimientos_inventario_activo_id"), "movimientos_inventario", ["activo_id"], unique=False)


def downgrade() -> None:
    try:
        op.drop_index(op.f("ix_movimientos_inventario_activo_id"), table_name="movimientos_inventario")
        op.drop_index(op.f("ix_movimientos_inventario_id"), table_name="movimientos_inventario")
        op.drop_table("movimientos_inventario")
    except Exception:
        pass
    for name in ("stock_minimo", "unidad_medida", "cantidad", "estado_admin", "tipo_inventario"):
        try:
            op.drop_column("activos", name)
        except Exception:
            pass
