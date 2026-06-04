"""merge comunicados email responses into main

Revision ID: bb2c3d4e5f6g
Revises: aa1b2c3d4e5f, a1b2c3d4e7f1
Create Date: 2026-05-28

Merge de dos ramas divergentes:
  - aa1b2c3d4e5f  (campos clínicos consultorio)
  - a1b2c3d4e7f1  (mensajes de respuesta y email en comunicados)
"""
from alembic import op

revision = "bb2c3d4e5f6g"
down_revision = ("aa1b2c3d4e5f", "a1b2c3d4e7f1")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
