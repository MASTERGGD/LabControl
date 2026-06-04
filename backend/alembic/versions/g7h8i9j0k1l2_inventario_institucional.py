"""inventario institucional

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa

revision = "g7h8i9j0k1l2"
down_revision = "f6g7h8i9j0k1"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "ubicaciones_inventario" not in tables:
        op.create_table(
            "ubicaciones_inventario",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("nombre", sa.String(length=150), nullable=False),
            sa.Column("tipo", sa.String(length=40), nullable=False, server_default="OFICINA"),
            sa.Column("edificio", sa.String(length=120), nullable=True),
            sa.Column("piso", sa.String(length=40), nullable=True),
            sa.Column("referencia", sa.String(length=250), nullable=True),
            sa.Column("departamento_id", sa.Integer(), nullable=True),
            sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("creado_en", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["departamento_id"], ["departamentos.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_ubicaciones_inventario_id"), "ubicaciones_inventario", ["id"], unique=False)
        op.create_index(op.f("ix_ubicaciones_inventario_nombre"), "ubicaciones_inventario", ["nombre"], unique=False)

    columns = [
        ("departamento_id", sa.Column("departamento_id", sa.Integer(), nullable=True)),
        ("ubicacion_id", sa.Column("ubicacion_id", sa.Integer(), nullable=True)),
        ("responsable_id", sa.Column("responsable_id", sa.Integer(), nullable=True)),
        ("alcance", sa.Column("alcance", sa.String(), nullable=False, server_default="LABORATORIO")),
        ("ubicacion_tipo", sa.Column("ubicacion_tipo", sa.String(), nullable=True)),
        ("ubicacion_nombre", sa.Column("ubicacion_nombre", sa.String(), nullable=True)),
    ]
    for name, column in columns:
        if not _has_column(inspector, "activos", name):
            op.add_column("activos", column)

    if bind.dialect.name != "sqlite":
        op.create_foreign_key("fk_activos_departamento_id", "activos", "departamentos", ["departamento_id"], ["id"])
        op.create_foreign_key("fk_activos_ubicacion_id", "activos", "ubicaciones_inventario", ["ubicacion_id"], ["id"])
        op.create_foreign_key("fk_activos_responsable_id", "activos", "usuarios", ["responsable_id"], ["id"])
        op.alter_column("activos", "laboratorio_id", existing_type=sa.Integer(), nullable=True)
    else:
        with op.batch_alter_table("activos") as batch_op:
            batch_op.alter_column("laboratorio_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        for fk in ("fk_activos_responsable_id", "fk_activos_ubicacion_id", "fk_activos_departamento_id"):
            try:
                op.drop_constraint(fk, "activos", type_="foreignkey")
            except Exception:
                pass
    for name in ("ubicacion_nombre", "ubicacion_tipo", "alcance", "responsable_id", "ubicacion_id", "departamento_id"):
        try:
            op.drop_column("activos", name)
        except Exception:
            pass
    try:
        op.drop_index(op.f("ix_ubicaciones_inventario_nombre"), table_name="ubicaciones_inventario")
        op.drop_index(op.f("ix_ubicaciones_inventario_id"), table_name="ubicaciones_inventario")
        op.drop_table("ubicaciones_inventario")
    except Exception:
        pass
