"""Clasifica incidencias registradas al finalizar una clase.

Revision ID: f2g3h4i5j6k7
Revises: e1f2g3h4i5j6
"""
from alembic import op
import sqlalchemy as sa


revision = "f2g3h4i5j6k7"
down_revision = "e1f2g3h4i5j6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "clases_docentes",
        sa.Column("incidencia_tipo", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "clases_docentes",
        sa.Column(
            "incidencia_requiere_seguimiento", sa.Boolean(),
            server_default=sa.false(), nullable=False,
        ),
    )
    with op.batch_alter_table("reportes_tutor") as batch_op:
        batch_op.alter_column("alumno_id", existing_type=sa.Integer(), nullable=True)
        batch_op.add_column(sa.Column("clase_docente_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_reportes_tutor_clase_docente_id", "clases_docentes",
            ["clase_docente_id"], ["id"],
        )
        batch_op.create_unique_constraint(
            "uq_reportes_tutor_clase_docente_id", ["clase_docente_id"],
        )
        batch_op.create_index(
            "ix_reportes_tutor_clase_docente_id", ["clase_docente_id"], unique=True,
        )


def downgrade():
    with op.batch_alter_table("reportes_tutor") as batch_op:
        batch_op.drop_index("ix_reportes_tutor_clase_docente_id")
        batch_op.drop_constraint("uq_reportes_tutor_clase_docente_id", type_="unique")
        batch_op.drop_constraint("fk_reportes_tutor_clase_docente_id", type_="foreignkey")
        batch_op.drop_column("clase_docente_id")
        batch_op.alter_column("alumno_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("clases_docentes", "incidencia_requiere_seguimiento")
    op.drop_column("clases_docentes", "incidencia_tipo")
