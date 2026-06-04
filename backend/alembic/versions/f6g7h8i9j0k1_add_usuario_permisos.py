"""add usuario permisos

Revision ID: f6g7h8i9j0k1
Revises: ee5f6g7h8i9j
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = "f6g7h8i9j0k1"
down_revision = "ee5f6g7h8i9j"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "usuario_permisos" in inspector.get_table_names():
        return
    op.create_table(
        "usuario_permisos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("permiso", sa.String(length=80), nullable=False),
        sa.Column("departamento_id", sa.Integer(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("otorgado_por_id", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["departamento_id"], ["departamentos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["otorgado_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("usuario_id", "permiso", "departamento_id", name="uq_usuario_permiso_departamento"),
    )
    op.create_index(op.f("ix_usuario_permisos_id"), "usuario_permisos", ["id"], unique=False)
    op.create_index(op.f("ix_usuario_permisos_usuario_id"), "usuario_permisos", ["usuario_id"], unique=False)
    op.create_index(op.f("ix_usuario_permisos_permiso"), "usuario_permisos", ["permiso"], unique=False)
    op.create_index(op.f("ix_usuario_permisos_departamento_id"), "usuario_permisos", ["departamento_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "usuario_permisos" not in inspector.get_table_names():
        return
    op.drop_index(op.f("ix_usuario_permisos_departamento_id"), table_name="usuario_permisos")
    op.drop_index(op.f("ix_usuario_permisos_permiso"), table_name="usuario_permisos")
    op.drop_index(op.f("ix_usuario_permisos_usuario_id"), table_name="usuario_permisos")
    op.drop_index(op.f("ix_usuario_permisos_id"), table_name="usuario_permisos")
    op.drop_table("usuario_permisos")
