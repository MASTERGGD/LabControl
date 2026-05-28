"""add_comunicado_email_notifications

Revision ID: a1b2c3d4e6f0
Revises: z3a4b5c6d7e8
Create Date: 2026-05-27
"""

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e6f0"
down_revision = "z3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("comunicados") as batch_op:
        batch_op.add_column(sa.Column("notificar_email", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("email_enviados", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("email_fallidos", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("email_ultimo_envio", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("comunicados") as batch_op:
        batch_op.drop_column("email_ultimo_envio")
        batch_op.drop_column("email_fallidos")
        batch_op.drop_column("email_enviados")
        batch_op.drop_column("notificar_email")
