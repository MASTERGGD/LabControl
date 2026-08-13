"""Vincula bloques de tutoría con grupos formalmente asignados."""
from alembic import op
import sqlalchemy as sa


revision = "l8m9n0o1p2q3"
down_revision = "k7l8m9n0o1p2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cargas_docentes", sa.Column("grupo_tutorado_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_cargas_docentes_grupo_tutorado", "cargas_docentes", "grupos_tutorados", ["grupo_tutorado_id"], ["id"])
    op.create_index("ix_cargas_docentes_grupo_tutorado_id", "cargas_docentes", ["grupo_tutorado_id"])


def downgrade():
    op.drop_index("ix_cargas_docentes_grupo_tutorado_id", table_name="cargas_docentes")
    op.drop_constraint("fk_cargas_docentes_grupo_tutorado", "cargas_docentes", type_="foreignkey")
    op.drop_column("cargas_docentes", "grupo_tutorado_id")
