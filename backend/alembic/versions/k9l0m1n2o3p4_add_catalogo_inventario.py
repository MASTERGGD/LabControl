"""add configurable inventory catalog

Revision ID: k9l0m1n2o3p4
Revises: j8k9l0m1n2o3, p4q5r6s7t8u9
Create Date: 2026-06-19
"""

from alembic import op
import sqlalchemy as sa


revision = "k9l0m1n2o3p4"
down_revision = ("j8k9l0m1n2o3", "p4q5r6s7t8u9")
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "catalogo_inventario",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("clave", sa.String(length=50), nullable=False),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("prefijo_codigo", sa.String(length=12), nullable=True),
        sa.Column("alcance", sa.String(length=20), nullable=False, server_default="AMBOS"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("protegido", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("creado_por_id", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["creado_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tipo", "clave", name="uq_catalogo_inventario_tipo_clave"),
    )
    op.create_index("ix_catalogo_inventario_id", "catalogo_inventario", ["id"], unique=False)
    op.create_index("ix_catalogo_inventario_tipo", "catalogo_inventario", ["tipo"], unique=False)
    op.create_index("ix_catalogo_inventario_clave", "catalogo_inventario", ["clave"], unique=False)
    op.create_index(
        "ix_catalogo_inventario_tipo_activo",
        "catalogo_inventario",
        ["tipo", "activo"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_catalogo_inventario_tipo_activo", table_name="catalogo_inventario")
    op.drop_index("ix_catalogo_inventario_clave", table_name="catalogo_inventario")
    op.drop_index("ix_catalogo_inventario_tipo", table_name="catalogo_inventario")
    op.drop_index("ix_catalogo_inventario_id", table_name="catalogo_inventario")
    op.drop_table("catalogo_inventario")
