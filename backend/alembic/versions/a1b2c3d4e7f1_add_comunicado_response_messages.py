"""add_comunicado_response_messages

Revision ID: a1b2c3d4e7f1
Revises: a1b2c3d4e6f0
Create Date: 2026-05-27
"""

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e7f1"
down_revision = "a1b2c3d4e6f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comunicado_respuesta_mensajes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("respuesta_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("comentario", sa.Text(), nullable=False),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["respuesta_id"], ["comunicado_respuestas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_comunicado_respuesta_mensajes_id"), "comunicado_respuesta_mensajes", ["id"], unique=False)
    op.create_index(op.f("ix_comunicado_respuesta_mensajes_respuesta_id"), "comunicado_respuesta_mensajes", ["respuesta_id"], unique=False)
    op.create_index(op.f("ix_comunicado_respuesta_mensajes_usuario_id"), "comunicado_respuesta_mensajes", ["usuario_id"], unique=False)

    op.execute(
        """
        INSERT INTO comunicado_respuesta_mensajes (respuesta_id, usuario_id, comentario, creado_en)
        SELECT id, usuario_id, comentario, creado_en
        FROM comunicado_respuestas
        WHERE comentario IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_comunicado_respuesta_mensajes_usuario_id"), table_name="comunicado_respuesta_mensajes")
    op.drop_index(op.f("ix_comunicado_respuesta_mensajes_respuesta_id"), table_name="comunicado_respuesta_mensajes")
    op.drop_index(op.f("ix_comunicado_respuesta_mensajes_id"), table_name="comunicado_respuesta_mensajes")
    op.drop_table("comunicado_respuesta_mensajes")
