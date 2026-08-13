"""link missed classes to makeups

Revision ID: n0o1p2q3r4s5
Revises: m9n0o1p2q3r4
"""

from alembic import op
import sqlalchemy as sa

revision = "n0o1p2q3r4s5"
down_revision = "m9n0o1p2q3r4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("clases_docentes", sa.Column("motivo_no_impartida", sa.Text(), nullable=True))
    op.add_column("clases_docentes", sa.Column("declarada_no_impartida_en", sa.DateTime(), nullable=True))
    op.add_column("clases_docentes", sa.Column("clase_origen_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_clases_docentes_clase_origen", "clases_docentes", "clases_docentes",
        ["clase_origen_id"], ["id"],
    )
    op.create_index("ix_clases_docentes_clase_origen_id", "clases_docentes", ["clase_origen_id"])


def downgrade():
    op.drop_index("ix_clases_docentes_clase_origen_id", table_name="clases_docentes")
    op.drop_constraint("fk_clases_docentes_clase_origen", "clases_docentes", type_="foreignkey")
    op.drop_column("clases_docentes", "clase_origen_id")
    op.drop_column("clases_docentes", "declarada_no_impartida_en")
    op.drop_column("clases_docentes", "motivo_no_impartida")
