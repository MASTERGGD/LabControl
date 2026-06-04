"""espacios_apoyo_departamento

Revision ID: dd4e5f6g7h8i
Revises: cc3d4e5f6g7h
Create Date: 2026-05-28

Cambia espacios_apoyos para que referencie departamentos
en lugar de usuarios individuales.
"""
from alembic import op
import sqlalchemy as sa

revision = 'dd4e5f6g7h8i'
down_revision = 'cc3d4e5f6g7h'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Vaciar registros existentes (pocos o ninguno en dev)
    op.execute("DELETE FROM espacios_apoyos")

    with op.batch_alter_table('espacios_apoyos') as batch_op:
        # Quitar constraint y columna antigua
        try:
            batch_op.drop_constraint('uq_espacio_apoyo', type_='unique')
        except Exception:
            pass
        try:
            batch_op.drop_column('usuario_id')
        except Exception:
            pass
        try:
            batch_op.drop_column('rol_apoyo')
        except Exception:
            pass

        # Nueva columna FK a departamentos
        batch_op.add_column(
            sa.Column('departamento_id', sa.Integer(), nullable=False,
                      server_default='0')
        )
        batch_op.create_foreign_key(
            'fk_espacio_apoyo_depto',
            'departamentos',
            ['departamento_id'], ['id'],
            ondelete='CASCADE',
        )
        batch_op.create_unique_constraint(
            'uq_espacio_apoyo_depto',
            ['espacio_id', 'departamento_id'],
        )
        # Quitar server_default temporal
        batch_op.alter_column('departamento_id', server_default=None)


def downgrade() -> None:
    op.execute("DELETE FROM espacios_apoyos")
    with op.batch_alter_table('espacios_apoyos') as batch_op:
        try:
            batch_op.drop_constraint('uq_espacio_apoyo_depto', type_='unique')
            batch_op.drop_constraint('fk_espacio_apoyo_depto', type_='foreignkey')
        except Exception:
            pass
        batch_op.drop_column('departamento_id')
        batch_op.add_column(
            sa.Column('usuario_id', sa.Integer(), nullable=False,
                      server_default='0')
        )
        batch_op.add_column(
            sa.Column('rol_apoyo', sa.String(120), nullable=True)
        )
        batch_op.create_foreign_key(
            'fk_espacio_apoyo_usuario',
            'usuarios',
            ['usuario_id'], ['id'],
            ondelete='CASCADE',
        )
        batch_op.create_unique_constraint(
            'uq_espacio_apoyo',
            ['espacio_id', 'usuario_id'],
        )
        batch_op.alter_column('usuario_id', server_default=None)
