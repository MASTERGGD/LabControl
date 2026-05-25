"""add_cierres_tutoria

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-05-20

Cierre formal de bimestre/cuatrimestre del proceso de Tutoría.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

revision = 'o0p1q2r3s4t5'
down_revision = 'n9o0p1q2r3s4'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = inspector.get_table_names()

    if 'cierres_tutoria' not in existing_tables:
        op.create_table(
            'cierres_tutoria',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('periodo', sa.String(20), nullable=False),
            sa.Column('bimestre', sa.Integer(), nullable=True),
            sa.Column('alcance', sa.String(20), nullable=False, server_default='BIMESTRE'),
            sa.Column('estado', sa.String(20), nullable=False, server_default='CERRADO'),
            sa.Column('total_grupos', sa.Integer(), server_default='0'),
            sa.Column('total_tutores', sa.Integer(), server_default='0'),
            sa.Column('total_tutorados', sa.Integer(), server_default='0'),
            sa.Column('total_sesiones', sa.Integer(), server_default='0'),
            sa.Column('total_asistencias', sa.Integer(), server_default='0'),
            sa.Column('total_inasistencias', sa.Integer(), server_default='0'),
            sa.Column('alumnos_riesgo_alto', sa.Integer(), server_default='0'),
            sa.Column('canalizaciones_pendientes', sa.Integer(), server_default='0'),
            sa.Column('canalizaciones_seguimiento', sa.Integer(), server_default='0'),
            sa.Column('canalizaciones_atendidas', sa.Integer(), server_default='0'),
            sa.Column('informes_borrador', sa.Integer(), server_default='0'),
            sa.Column('informes_enviados', sa.Integer(), server_default='0'),
            sa.Column('informes_recibidos', sa.Integer(), server_default='0'),
            sa.Column('grupos_sin_sesion', sa.Integer(), server_default='0'),
            sa.Column('resumen_json', sa.Text(), nullable=True),
            sa.Column('observaciones', sa.Text(), nullable=True),
            sa.Column('cerrado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
            sa.Column('cerrado_en', sa.DateTime(), nullable=False),
        )

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_cierres_tutoria_periodo
        ON cierres_tutoria (periodo)
    """)


def downgrade():
    op.drop_index('ix_cierres_tutoria_periodo', table_name='cierres_tutoria')
    op.drop_table('cierres_tutoria')
