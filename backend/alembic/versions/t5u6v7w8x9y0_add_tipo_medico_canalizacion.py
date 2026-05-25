"""add_tipo_medico_canalizacion

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-05-21

Agrega tipo_medico a canalizaciones (para que tutores puedan canalizar al médico)
y canalizado_medico_consulta_id para cerrar el ciclo cuando el médico atiende.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

revision = "t5u6v7w8x9y0"
down_revision = "s4t5u6v7w8x9"
branch_labels = None
depends_on = None


def _col_exists(inspector, table, column):
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade():
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    # tipo_medico: el tutor canaliza al consultorio médico
    if not _col_exists(inspector, "canalizaciones", "tipo_medico"):
        op.add_column("canalizaciones",
            sa.Column("tipo_medico", sa.Boolean(), nullable=True, server_default=sa.text("false")))

    # consulta_id: cuando el médico atiende, se vincula la consulta generada
    if not _col_exists(inspector, "canalizaciones", "consulta_medica_id"):
        op.add_column("canalizaciones",
            sa.Column("consulta_medica_id", sa.Integer(), nullable=True))

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_canalizaciones_tipo_medico
        ON canalizaciones (tipo_medico)
    """)


def downgrade():
    op.drop_index("ix_canalizaciones_tipo_medico", table_name="canalizaciones")
    op.drop_column("canalizaciones", "consulta_medica_id")
    op.drop_column("canalizaciones", "tipo_medico")
