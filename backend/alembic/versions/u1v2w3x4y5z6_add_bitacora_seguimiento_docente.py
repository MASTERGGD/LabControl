"""add class logbook and student teacher follow-up

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
"""
from alembic import op
import sqlalchemy as sa


revision = "u1v2w3x4y5z6"
down_revision = "t0u1v2w3x4y5"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("clases_docentes") as batch_op:
        batch_op.add_column(sa.Column("tema_impartido", sa.String(length=300), nullable=True))
        batch_op.add_column(sa.Column("avance_planeacion", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("actividades_realizadas", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("tarea_asignada", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("incidencias", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("tema_pendiente", sa.Text(), nullable=True))

    op.create_table(
        "seguimientos_alumnos_docente",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("docente_id", sa.Integer(), nullable=False),
        sa.Column("carga_docente_id", sa.Integer(), nullable=False),
        sa.Column("alumno_id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=25), nullable=False),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("detalle", sa.Text(), nullable=True),
        sa.Column("calificacion", sa.Float(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="REGISTRADO"),
        sa.Column("creado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["alumno_id"], ["catalogo_alumnos.id"]),
        sa.ForeignKeyConstraint(["carga_docente_id"], ["cargas_docentes.id"]),
        sa.ForeignKeyConstraint(["docente_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_seguimientos_alumnos_docente_docente_id", "seguimientos_alumnos_docente", ["docente_id"])
    op.create_index("ix_seguimientos_alumnos_docente_carga_id", "seguimientos_alumnos_docente", ["carga_docente_id"])
    op.create_index("ix_seguimientos_alumnos_docente_alumno_id", "seguimientos_alumnos_docente", ["alumno_id"])


def downgrade():
    op.drop_table("seguimientos_alumnos_docente")
    with op.batch_alter_table("clases_docentes") as batch_op:
        batch_op.drop_column("tema_pendiente")
        batch_op.drop_column("incidencias")
        batch_op.drop_column("tarea_asignada")
        batch_op.drop_column("actividades_realizadas")
        batch_op.drop_column("avance_planeacion")
        batch_op.drop_column("tema_impartido")
