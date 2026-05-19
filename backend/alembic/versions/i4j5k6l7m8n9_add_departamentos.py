"""add departamentos

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa


revision = "i4j5k6l7m8n9"
down_revision = "h3i4j5k6l7m8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'ADMINISTRATIVO'")

    op.create_table(
        "departamentos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("clave", sa.String(length=30), nullable=False),
        sa.Column("descripcion", sa.String(length=300), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_departamentos_id"), "departamentos", ["id"], unique=False)
    op.create_index(op.f("ix_departamentos_nombre"), "departamentos", ["nombre"], unique=True)
    op.create_index(op.f("ix_departamentos_clave"), "departamentos", ["clave"], unique=True)

    with op.batch_alter_table("usuarios") as batch_op:
        batch_op.add_column(sa.Column("departamento_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_usuarios_departamento_id_departamentos",
            "departamentos",
            ["departamento_id"],
            ["id"],
        )

    with op.batch_alter_table("comunicados") as batch_op:
        batch_op.add_column(sa.Column("departamento_emisor_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_comunicados_departamento_emisor_id_departamentos",
            "departamentos",
            ["departamento_emisor_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("comunicados") as batch_op:
        batch_op.drop_constraint("fk_comunicados_departamento_emisor_id_departamentos", type_="foreignkey")
        batch_op.drop_column("departamento_emisor_id")

    with op.batch_alter_table("usuarios") as batch_op:
        batch_op.drop_constraint("fk_usuarios_departamento_id_departamentos", type_="foreignkey")
        batch_op.drop_column("departamento_id")

    op.drop_index(op.f("ix_departamentos_clave"), table_name="departamentos")
    op.drop_index(op.f("ix_departamentos_nombre"), table_name="departamentos")
    op.drop_index(op.f("ix_departamentos_id"), table_name="departamentos")
    op.drop_table("departamentos")
