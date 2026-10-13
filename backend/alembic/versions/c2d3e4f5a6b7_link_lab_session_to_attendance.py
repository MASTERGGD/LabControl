"""Link a lab session to its teaching attendance record."""
from alembic import op
import sqlalchemy as sa


revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("sesiones_clase") as batch_op:
        batch_op.add_column(sa.Column("clase_docente_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_sesiones_clase_clase_docente_id",
            "clases_docentes",
            ["clase_docente_id"],
            ["id"],
        )
        batch_op.create_index(
            "ix_sesiones_clase_clase_docente_id",
            ["clase_docente_id"],
        )


def downgrade():
    with op.batch_alter_table("sesiones_clase") as batch_op:
        batch_op.drop_index("ix_sesiones_clase_clase_docente_id")
        batch_op.drop_constraint(
            "fk_sesiones_clase_clase_docente_id",
            type_="foreignkey",
        )
        batch_op.drop_column("clase_docente_id")
