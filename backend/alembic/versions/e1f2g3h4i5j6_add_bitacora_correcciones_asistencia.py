"""Agrega bitácora estructurada de correcciones de asistencia docente.

Revision ID: e1f2g3h4i5j6
Revises: d0e1f2g3h4i5
"""
from alembic import op
import sqlalchemy as sa


revision = "e1f2g3h4i5j6"
down_revision = "d0e1f2g3h4i5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "correcciones_asistencia_docente",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clase_docente_id", sa.Integer(), nullable=False),
        sa.Column("asistencia_id", sa.Integer(), nullable=True),
        sa.Column("alumno_id", sa.Integer(), nullable=True),
        sa.Column("docente_id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("estado_anterior", sa.String(length=20), nullable=True),
        sa.Column("estado_nuevo", sa.String(length=20), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["clase_docente_id"], ["clases_docentes.id"]),
        sa.ForeignKeyConstraint(["asistencia_id"], ["asistencias_docentes.id"]),
        sa.ForeignKeyConstraint(["alumno_id"], ["catalogo_alumnos.id"]),
        sa.ForeignKeyConstraint(["docente_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for columna in ("clase_docente_id", "asistencia_id", "alumno_id", "docente_id"):
        op.create_index(
            f"ix_correcciones_asistencia_docente_{columna}",
            "correcciones_asistencia_docente", [columna], unique=False,
        )


def downgrade():
    op.drop_table("correcciones_asistencia_docente")
