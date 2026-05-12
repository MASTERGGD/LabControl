"""add_adeudos

Revision ID: a3f9c2e81b45
Revises: 1722d0e1feba
Create Date: 2026-05-06 19:25:27.001481

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f9c2e81b45'
down_revision: Union[str, None] = '1722d0e1feba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'adeudos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('alumno_nombre', sa.String(), nullable=False),
        sa.Column('alumno_matricula', sa.String(), nullable=False),
        sa.Column('laboratorio_id', sa.Integer(), nullable=True),
        sa.Column('sesion_id', sa.Integer(), nullable=True),
        sa.Column('computadora_id', sa.Integer(), nullable=True),
        sa.Column('incidente_id', sa.Integer(), nullable=True),
        sa.Column('tipo', sa.String(), nullable=True),
        sa.Column('descripcion', sa.String(), nullable=False),
        sa.Column('cuatrimestre', sa.String(), nullable=True),
        sa.Column('estado', sa.String(), nullable=True),
        sa.Column('monto_estimado', sa.Float(), nullable=True),
        sa.Column('fecha_reporte', sa.DateTime(), nullable=True),
        sa.Column('reportado_por_id', sa.Integer(), nullable=True),
        sa.Column('fecha_resolucion', sa.DateTime(), nullable=True),
        sa.Column('resuelto_por_id', sa.Integer(), nullable=True),
        sa.Column('notas_resolucion', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['computadora_id'], ['computadoras.id'], ),
        sa.ForeignKeyConstraint(['incidente_id'], ['incidentes.id'], ),
        sa.ForeignKeyConstraint(['laboratorio_id'], ['laboratorios.id'], ),
        sa.ForeignKeyConstraint(['reportado_por_id'], ['usuarios.id'], ),
        sa.ForeignKeyConstraint(['resuelto_por_id'], ['usuarios.id'], ),
        sa.ForeignKeyConstraint(['sesion_id'], ['sesiones_clase.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_adeudos_alumno_matricula'), 'adeudos', ['alumno_matricula'], unique=False)
    op.create_index(op.f('ix_adeudos_cuatrimestre'), 'adeudos', ['cuatrimestre'], unique=False)
    op.create_index(op.f('ix_adeudos_estado'), 'adeudos', ['estado'], unique=False)
    op.create_index(op.f('ix_adeudos_id'), 'adeudos', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_adeudos_id'), table_name='adeudos')
    op.drop_index(op.f('ix_adeudos_estado'), table_name='adeudos')
    op.drop_index(op.f('ix_adeudos_cuatrimestre'), table_name='adeudos')
    op.drop_index(op.f('ix_adeudos_alumno_matricula'), table_name='adeudos')
    op.drop_table('adeudos')
