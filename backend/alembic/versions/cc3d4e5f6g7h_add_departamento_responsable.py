"""add departamento responsable

Revision ID: cc3d4e5f6g7h
Revises: bb2c3d4e5f6g
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "cc3d4e5f6g7h"
down_revision = "bb2c3d4e5f6g"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("departamentos")}
    if "responsable_id" not in cols:
        op.add_column(
            "departamentos",
            sa.Column("responsable_id", sa.Integer(),
                      sa.ForeignKey("usuarios.id", name="fk_departamentos_responsable_id", ondelete="SET NULL"), nullable=True),
        )
        op.create_index(
            "ix_departamentos_responsable_id",
            "departamentos", ["responsable_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("departamentos")}
    if "responsable_id" in cols:
        op.drop_index("ix_departamentos_responsable_id", table_name="departamentos")
        op.drop_column("departamentos", "responsable_id")
