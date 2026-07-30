"""Agrega la bandeja de reportes de docentes a tutores.

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
"""
from alembic import op
import sqlalchemy as sa


revision = "y5z6a7b8c9d0"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "reportes_tutor",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("alumno_id", sa.Integer(), nullable=False),
        sa.Column("reportado_por_id", sa.Integer(), nullable=False),
        sa.Column("tutor_destinatario_id", sa.Integer(), nullable=True),
        sa.Column("grupo_tutorado_id", sa.Integer(), nullable=True),
        sa.Column("carga_docente_id", sa.Integer(), nullable=True),
        sa.Column("seguimiento_docente_id", sa.Integer(), nullable=True),
        sa.Column("categoria", sa.String(length=30), nullable=False, server_default="ACADEMICO"),
        sa.Column("prioridad", sa.String(length=15), nullable=False, server_default="MEDIA"),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("detalle", sa.Text(), nullable=True),
        sa.Column("confidencial", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("estado", sa.String(length=25), nullable=False, server_default="ENVIADO"),
        sa.Column("resultado", sa.Text(), nullable=True),
        sa.Column("canalizacion_id", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("recibido_en", sa.DateTime(), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.Column("cerrado_en", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["alumno_id"], ["catalogo_alumnos.id"]),
        sa.ForeignKeyConstraint(["reportado_por_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["tutor_destinatario_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["grupo_tutorado_id"], ["grupos_tutorados.id"]),
        sa.ForeignKeyConstraint(["carga_docente_id"], ["cargas_docentes.id"]),
        sa.ForeignKeyConstraint(["seguimiento_docente_id"], ["seguimientos_alumnos_docente.id"]),
        sa.ForeignKeyConstraint(["canalizacion_id"], ["canalizaciones.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("seguimiento_docente_id"),
    )
    for column in (
        "id", "alumno_id", "reportado_por_id", "tutor_destinatario_id",
        "grupo_tutorado_id", "carga_docente_id", "seguimiento_docente_id", "estado",
    ):
        op.create_index(f"ix_reportes_tutor_{column}", "reportes_tutor", [column], unique=False)


def downgrade():
    op.drop_table("reportes_tutor")
