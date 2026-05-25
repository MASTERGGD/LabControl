"""add_comunicado_adjuntos_respuestas

Revision ID: z3a4b5c6d7e8
Revises: y2z3a4b5c6d7
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa


revision = "z3a4b5c6d7e8"
down_revision = "y2z3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("comunicados") as batch_op:
        batch_op.add_column(sa.Column("requiere_retroalimentacion", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("fecha_limite_respuesta", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("fijado", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        "comunicado_adjuntos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("comunicado_id", sa.Integer(), nullable=False),
        sa.Column("nombre_original", sa.String(length=255), nullable=False),
        sa.Column("nombre_archivo", sa.String(length=255), nullable=False),
        sa.Column("ruta_archivo", sa.String(length=500), nullable=False),
        sa.Column("tipo_mime", sa.String(length=100), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("subido_por_id", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["comunicado_id"], ["comunicados.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subido_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_comunicado_adjuntos_id"), "comunicado_adjuntos", ["id"], unique=False)
    op.create_index(op.f("ix_comunicado_adjuntos_comunicado_id"), "comunicado_adjuntos", ["comunicado_id"], unique=False)
    op.create_index(op.f("ix_comunicado_adjuntos_sha256"), "comunicado_adjuntos", ["sha256"], unique=False)

    op.create_table(
        "comunicado_respuestas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("comunicado_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("comentario", sa.Text(), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="RESPONDIDO"),
        sa.Column("revisado_por_id", sa.Integer(), nullable=True),
        sa.Column("revisado_en", sa.DateTime(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["comunicado_id"], ["comunicados.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["revisado_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("comunicado_id", "usuario_id", name="uq_comunicado_respuesta_usuario"),
    )
    op.create_index(op.f("ix_comunicado_respuestas_id"), "comunicado_respuestas", ["id"], unique=False)
    op.create_index(op.f("ix_comunicado_respuestas_comunicado_id"), "comunicado_respuestas", ["comunicado_id"], unique=False)
    op.create_index(op.f("ix_comunicado_respuestas_usuario_id"), "comunicado_respuestas", ["usuario_id"], unique=False)

    op.create_table(
        "comunicado_respuesta_adjuntos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("respuesta_id", sa.Integer(), nullable=False),
        sa.Column("nombre_original", sa.String(length=255), nullable=False),
        sa.Column("nombre_archivo", sa.String(length=255), nullable=False),
        sa.Column("ruta_archivo", sa.String(length=500), nullable=False),
        sa.Column("tipo_mime", sa.String(length=100), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["respuesta_id"], ["comunicado_respuestas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_comunicado_respuesta_adjuntos_id"), "comunicado_respuesta_adjuntos", ["id"], unique=False)
    op.create_index(op.f("ix_comunicado_respuesta_adjuntos_respuesta_id"), "comunicado_respuesta_adjuntos", ["respuesta_id"], unique=False)
    op.create_index(op.f("ix_comunicado_respuesta_adjuntos_sha256"), "comunicado_respuesta_adjuntos", ["sha256"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_comunicado_respuesta_adjuntos_sha256"), table_name="comunicado_respuesta_adjuntos")
    op.drop_index(op.f("ix_comunicado_respuesta_adjuntos_respuesta_id"), table_name="comunicado_respuesta_adjuntos")
    op.drop_index(op.f("ix_comunicado_respuesta_adjuntos_id"), table_name="comunicado_respuesta_adjuntos")
    op.drop_table("comunicado_respuesta_adjuntos")

    op.drop_index(op.f("ix_comunicado_respuestas_usuario_id"), table_name="comunicado_respuestas")
    op.drop_index(op.f("ix_comunicado_respuestas_comunicado_id"), table_name="comunicado_respuestas")
    op.drop_index(op.f("ix_comunicado_respuestas_id"), table_name="comunicado_respuestas")
    op.drop_table("comunicado_respuestas")

    op.drop_index(op.f("ix_comunicado_adjuntos_sha256"), table_name="comunicado_adjuntos")
    op.drop_index(op.f("ix_comunicado_adjuntos_comunicado_id"), table_name="comunicado_adjuntos")
    op.drop_index(op.f("ix_comunicado_adjuntos_id"), table_name="comunicado_adjuntos")
    op.drop_table("comunicado_adjuntos")

    with op.batch_alter_table("comunicados") as batch_op:
        batch_op.drop_column("fijado")
        batch_op.drop_column("fecha_limite_respuesta")
        batch_op.drop_column("requiere_retroalimentacion")
