"""adeudos_unified_persona

Revision ID: b7d4e1f92c38
Revises: a3f9c2e81b45
Create Date: 2026-05-06 12:00:00.000000

Rediseño del modelo Adeudo:
  - alumno_nombre     → persona_nombre
  - alumno_matricula  → persona_identificador
  + persona_tipo      (ALUMNO|DOCENTE|OTRO)
  + origen_tipo       (MANUAL|PRESTAMO|INCIDENTE_PRESENCIADO|REVISION_ENTRADA)
  + prestamo_id       FK a prestamos
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b7d4e1f92c38'
down_revision: Union[str, None] = 'a3f9c2e81b45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch_alter_table funciona en SQLite y PostgreSQL
    with op.batch_alter_table('adeudos', schema=None) as batch_op:
        # Renombrar columnas existentes
        batch_op.alter_column('alumno_nombre',    new_column_name='persona_nombre')
        batch_op.alter_column('alumno_matricula', new_column_name='persona_identificador')

        # Nuevas columnas
        batch_op.add_column(sa.Column('persona_tipo',  sa.String(), nullable=True, server_default='ALUMNO'))
        batch_op.add_column(sa.Column('origen_tipo',   sa.String(), nullable=True, server_default='MANUAL'))
        batch_op.add_column(sa.Column('prestamo_id',   sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_adeudos_prestamo_id', 'prestamos', ['prestamo_id'], ['id']
        )
    # Crear indices fuera del batch evita que SQLite intente reconstruirlos
    # contra el nombre viejo de la columna durante migraciones desde cero.
    op.create_index('ix_adeudos_persona_identificador', 'adeudos', ['persona_identificador'])
    op.create_index('ix_adeudos_persona_tipo',          'adeudos', ['persona_tipo'])


def downgrade() -> None:
    op.drop_index('ix_adeudos_persona_tipo', table_name='adeudos')
    op.drop_index('ix_adeudos_persona_identificador', table_name='adeudos')
    with op.batch_alter_table('adeudos', schema=None) as batch_op:
        batch_op.drop_constraint('fk_adeudos_prestamo_id', type_='foreignkey')
        batch_op.drop_column('prestamo_id')
        batch_op.drop_column('origen_tipo')
        batch_op.drop_column('persona_tipo')
        batch_op.alter_column('persona_identificador', new_column_name='alumno_matricula')
        batch_op.alter_column('persona_nombre',        new_column_name='alumno_nombre')
