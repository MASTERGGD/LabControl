"""Vincula grupos tutorados con grupos académicos oficiales.

Revision ID: b8c9d0e1f2g3
Revises: a7b8c9d0e1f2
"""
from alembic import op
import sqlalchemy as sa

revision = "b8c9d0e1f2g3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("grupos_tutorados", sa.Column("grupo_academico_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_grupos_tutorados_grupo_academico", "grupos_tutorados", "grupos_academicos",
        ["grupo_academico_id"], ["id"],
    )
    op.create_index("ix_grupos_tutorados_grupo_academico_id", "grupos_tutorados", ["grupo_academico_id"], unique=True)
    op.alter_column("grupos_tutorados", "tutor_id", existing_type=sa.Integer(), nullable=True)


def downgrade():
    op.execute("DELETE FROM grupos_tutorados WHERE tutor_id IS NULL")
    op.alter_column("grupos_tutorados", "tutor_id", existing_type=sa.Integer(), nullable=False)
    op.drop_index("ix_grupos_tutorados_grupo_academico_id", table_name="grupos_tutorados")
    op.drop_constraint("fk_grupos_tutorados_grupo_academico", "grupos_tutorados", type_="foreignkey")
    op.drop_column("grupos_tutorados", "grupo_academico_id")
