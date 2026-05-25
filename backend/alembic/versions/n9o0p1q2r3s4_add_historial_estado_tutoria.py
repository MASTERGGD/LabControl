"""add_historial_estado_tutoria

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-05-20

Bitácora de cambios del estado institucional de seguimiento por alumno tutorado.
Cada cambio de estado queda registrado con: quién, de qué estado, a qué estado,
cuándo y con qué observación.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

revision = 'n9o0p1q2r3s4'
down_revision = 'm8n9o0p1q2r3'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = inspector.get_table_names()

    if 'historial_estado_tutoria' not in existing_tables:
        op.create_table(
            'historial_estado_tutoria',
            sa.Column('id',              sa.Integer(),    primary_key=True),
            sa.Column('asignacion_id',   sa.Integer(),    sa.ForeignKey('asignaciones_tutoria.id'), nullable=False),
            sa.Column('estado_anterior', sa.String(30),   nullable=True),
            sa.Column('estado_nuevo',    sa.String(30),   nullable=False),
            sa.Column('observacion',     sa.Text(),       nullable=True),
            sa.Column('usuario_id',      sa.Integer(),    sa.ForeignKey('usuarios.id'), nullable=False),
            sa.Column('creado_en',       sa.DateTime(),   nullable=False),
        )

    # Crear el índice solo si no existe (idempotente)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_historial_estado_tutoria_asignacion_id
        ON historial_estado_tutoria (asignacion_id)
    """)


def downgrade():
    op.drop_index('ix_historial_estado_tutoria_asignacion_id',
                  table_name='historial_estado_tutoria')
    op.drop_table('historial_estado_tutoria')
