"""add external requester to solicitudes_espacio

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "solicitudes_espacio",
        sa.Column("solicitante_externo_nombre", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("solicitudes_espacio", "solicitante_externo_nombre")
