"""add_espacios_institucionales

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa

revision = 'g2h3i4j5k6l7'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    # ── espacios_institucionales ──────────────────────────────────────────────
    op.create_table(
        'espacios_institucionales',
        sa.Column('id',          sa.Integer(),    nullable=False),
        sa.Column('nombre',      sa.String(120),  nullable=False),
        sa.Column('tipo',        sa.String(20),   nullable=False),
        sa.Column('ubicacion',   sa.String(200),  nullable=True),
        sa.Column('capacidad',   sa.Integer(),    nullable=True),
        sa.Column('descripcion', sa.Text(),       nullable=True),
        sa.Column('activo',      sa.Boolean(),    nullable=False, server_default='true'),
        sa.Column('hora_inicio_permitida', sa.String(5), nullable=False, server_default="'08:00'"),
        sa.Column('hora_fin_permitida',    sa.String(5), nullable=False, server_default="'20:00'"),
        sa.Column('requiere_aprobacion',   sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('creado_en',   sa.DateTime(),   nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nombre', name='uq_espacio_nombre'),
    )
    op.create_index('ix_espacios_institucionales_id', 'espacios_institucionales', ['id'])

    # ── espacios_responsables ─────────────────────────────────────────────────
    op.create_table(
        'espacios_responsables',
        sa.Column('id',          sa.Integer(),  nullable=False),
        sa.Column('espacio_id',  sa.Integer(),  nullable=False),
        sa.Column('usuario_id',  sa.Integer(),  nullable=False),
        sa.Column('asignado_en', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['espacio_id'], ['espacios_institucionales.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'],                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('espacio_id', 'usuario_id', name='uq_espacio_responsable'),
    )
    op.create_index('ix_espacios_responsables_espacio_id', 'espacios_responsables', ['espacio_id'])
    op.create_index('ix_espacios_responsables_usuario_id', 'espacios_responsables', ['usuario_id'])

    # ── solicitudes_espacio ───────────────────────────────────────────────────
    op.create_table(
        'solicitudes_espacio',
        sa.Column('id',                 sa.Integer(),    nullable=False),
        sa.Column('espacio_id',         sa.Integer(),    nullable=False),
        sa.Column('solicitante_id',     sa.Integer(),    nullable=True),
        sa.Column('solicitante_nombre', sa.String(200),  nullable=False),
        sa.Column('area_solicitante',   sa.String(200),  nullable=True),
        sa.Column('fecha',              sa.Date(),       nullable=False),
        sa.Column('hora_inicio',        sa.String(5),    nullable=False),
        sa.Column('hora_fin',           sa.String(5),    nullable=False),
        sa.Column('motivo',             sa.Text(),       nullable=False),
        sa.Column('numero_asistentes',  sa.Integer(),    nullable=True),
        sa.Column('observaciones',      sa.Text(),       nullable=True),
        sa.Column('estado',             sa.String(20),   nullable=False, server_default="'PENDIENTE'"),
        sa.Column('motivo_rechazo',     sa.Text(),       nullable=True),
        sa.Column('creado_en',          sa.DateTime(),   nullable=True),
        sa.Column('aprobado_por',       sa.Integer(),    nullable=True),
        sa.Column('aprobado_en',        sa.DateTime(),   nullable=True),
        sa.Column('cancelado_por',      sa.Integer(),    nullable=True),
        sa.Column('cancelado_en',       sa.DateTime(),   nullable=True),
        sa.ForeignKeyConstraint(['espacio_id'],     ['espacios_institucionales.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['solicitante_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['aprobado_por'],   ['usuarios.id']),
        sa.ForeignKeyConstraint(['cancelado_por'],  ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_solicitudes_espacio_id',         'solicitudes_espacio', ['id'])
    op.create_index('ix_solicitudes_espacio_espacio_id', 'solicitudes_espacio', ['espacio_id'])
    op.create_index('ix_solicitudes_espacio_fecha',      'solicitudes_espacio', ['fecha'])
    op.create_index('ix_solicitudes_espacio_estado',     'solicitudes_espacio', ['estado'])
    op.create_index('ix_solicitudes_espacio_sol_id',     'solicitudes_espacio', ['solicitante_id'])

    # ── requerimientos_solicitud ──────────────────────────────────────────────
    op.create_table(
        'requerimientos_solicitud',
        sa.Column('id',           sa.Integer(), nullable=False),
        sa.Column('solicitud_id', sa.Integer(), nullable=False),
        sa.Column('tipo',         sa.String(30), nullable=False),
        sa.Column('descripcion',  sa.Text(),    nullable=True),
        sa.Column('cantidad',     sa.Integer(), nullable=True, server_default='1'),
        sa.Column('requerido',    sa.Boolean(), nullable=True, server_default='true'),
        sa.ForeignKeyConstraint(['solicitud_id'], ['solicitudes_espacio.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_requerimientos_solicitud_id',           'requerimientos_solicitud', ['id'])
    op.create_index('ix_requerimientos_solicitud_solicitud_id', 'requerimientos_solicitud', ['solicitud_id'])


def downgrade():
    op.drop_table('requerimientos_solicitud')
    op.drop_table('solicitudes_espacio')
    op.drop_table('espacios_responsables')
    op.drop_table('espacios_institucionales')
