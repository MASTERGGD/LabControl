"""add departamento to solicitudes_espacio

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "solicitudes_espacio",
        sa.Column("departamento_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_solicitudes_espacio_departamento_id",
        "solicitudes_espacio",
        ["departamento_id"],
    )
    op.create_foreign_key(
        "fk_solicitudes_espacio_departamento_id",
        "solicitudes_espacio",
        "departamentos",
        ["departamento_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_solicitudes_espacio_departamento_id",
        "solicitudes_espacio",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_solicitudes_espacio_departamento_id",
        table_name="solicitudes_espacio",
    )
    op.drop_column("solicitudes_espacio", "departamento_id")
