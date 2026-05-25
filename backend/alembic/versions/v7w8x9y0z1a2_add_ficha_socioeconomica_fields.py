"""add ficha socioeconomica fields

Revision ID: v7w8x9y0z1a2
Revises: u6v7w8x9y0z1
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


revision = "v7w8x9y0z1a2"
down_revision = "u6v7w8x9y0z1"
branch_labels = None
depends_on = None


def _col_exists(table: str, column: str) -> bool:
    insp = Inspector.from_engine(op.get_bind())
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade():
    columns = [
        ("sexo", sa.String(length=30)),
        ("estado_civil", sa.String(length=80)),
        ("lugar_nacimiento", sa.String(length=160)),
        ("domicilio_procedencia", sa.String(length=250)),
        ("domicilio_residencia", sa.String(length=250)),
        ("telefono", sa.String(length=60)),
    ]
    for name, col_type in columns:
        if not _col_exists("perfiles_socioeconomicos", name):
            op.add_column("perfiles_socioeconomicos", sa.Column(name, col_type, nullable=True))


def downgrade():
    for name in [
        "telefono",
        "domicilio_residencia",
        "domicilio_procedencia",
        "lugar_nacimiento",
        "estado_civil",
        "sexo",
    ]:
        if _col_exists("perfiles_socioeconomicos", name):
            op.drop_column("perfiles_socioeconomicos", name)
