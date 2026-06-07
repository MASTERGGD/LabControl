"""add_responsable_lab_role

Revision ID: bc175fff2ddd
Revises: p4q5r6s7t8u9
Create Date: 2026-06-04 23:29:53.891445

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bc175fff2ddd'
down_revision: Union[str, None] = 'p4q5r6s7t8u9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'RESPONSABLE_LAB'")


def downgrade() -> None:
    pass  # PostgreSQL no permite eliminar valores de un enum fácilmente
