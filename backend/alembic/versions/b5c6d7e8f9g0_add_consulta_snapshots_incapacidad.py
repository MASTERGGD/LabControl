"""add consulta snapshots incapacidad

Revision ID: b5c6d7e8f9g0
Revises: a4b5c6d7e8f9
Create Date: 2026-05-25 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "b5c6d7e8f9g0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name, column_name):
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table = "consultas_medicas"
    if table not in inspector.get_table_names():
        return

    columns = [
        ("fecha_fin_incapacidad", sa.Date()),
        ("paciente_nombre_snapshot", sa.String(length=200)),
        ("paciente_tipo_snapshot", sa.String(length=20)),
        ("paciente_matricula_snapshot", sa.String(length=30)),
        ("paciente_sexo_snapshot", sa.String(length=10)),
        ("paciente_carrera_snapshot", sa.String(length=120)),
        ("paciente_cuatrimestre_snapshot", sa.Integer()),
        ("paciente_departamento_snapshot", sa.String(length=120)),
    ]
    for name, col_type in columns:
        if not _has_column(inspector, table, name):
            op.add_column(table, sa.Column(name, col_type, nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table = "consultas_medicas"
    if table not in inspector.get_table_names():
        return
    for name in [
        "paciente_departamento_snapshot",
        "paciente_cuatrimestre_snapshot",
        "paciente_carrera_snapshot",
        "paciente_sexo_snapshot",
        "paciente_matricula_snapshot",
        "paciente_tipo_snapshot",
        "paciente_nombre_snapshot",
        "fecha_fin_incapacidad",
    ]:
        if _has_column(inspector, table, name):
            op.drop_column(table, name)
