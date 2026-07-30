"""Agrega justificaciones múltiples de asistencia docente.

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
"""
from alembic import op
import sqlalchemy as sa


revision = "z6a7b8c9d0e1"
down_revision = "y5z6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "justificaciones_asistencia_docente",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("docente_id", sa.Integer(), nullable=False),
        sa.Column("carga_docente_id", sa.Integer(), nullable=False),
        sa.Column("alumno_id", sa.Integer(), nullable=False),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_fin", sa.Date(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("folio", sa.String(length=100), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["docente_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["carga_docente_id"], ["cargas_docentes.id"]),
        sa.ForeignKeyConstraint(["alumno_id"], ["catalogo_alumnos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_justificaciones_asistencia_docente_docente_id",
        "justificaciones_asistencia_docente", ["docente_id"],
    )
    op.create_index(
        "ix_justificaciones_asistencia_docente_carga_docente_id",
        "justificaciones_asistencia_docente", ["carga_docente_id"],
    )
    op.create_index(
        "ix_justificaciones_asistencia_docente_alumno_id",
        "justificaciones_asistencia_docente", ["alumno_id"],
    )
    op.create_table(
        "detalles_justificacion_asistencia",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("justificacion_id", sa.Integer(), nullable=False),
        sa.Column("asistencia_id", sa.Integer(), nullable=False),
        sa.Column("estado_anterior", sa.String(length=20), nullable=False),
        sa.Column(
            "estado_nuevo", sa.String(length=20), nullable=False,
            server_default="JUSTIFICADA",
        ),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["justificacion_id"], ["justificaciones_asistencia_docente.id"],
        ),
        sa.ForeignKeyConstraint(["asistencia_id"], ["asistencias_docentes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "justificacion_id", "asistencia_id",
            name="uq_detalle_justificacion_asistencia",
        ),
    )
    op.create_index(
        "ix_detalles_justificacion_asistencia_justificacion_id",
        "detalles_justificacion_asistencia", ["justificacion_id"],
    )
    op.create_index(
        "ix_detalles_justificacion_asistencia_asistencia_id",
        "detalles_justificacion_asistencia", ["asistencia_id"],
    )


def downgrade():
    op.drop_table("detalles_justificacion_asistencia")
    op.drop_table("justificaciones_asistencia_docente")
