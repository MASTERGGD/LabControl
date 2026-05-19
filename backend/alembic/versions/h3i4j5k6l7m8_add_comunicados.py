"""add_comunicados

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa

revision      = 'h3i4j5k6l7m8'
down_revision = 'g2h3i4j5k6l7'
branch_labels = None
depends_on    = None


def upgrade():
    # ── comunicados ───────────────────────────────────────────────────────────
    op.create_table(
        'comunicados',
        sa.Column('id',                    sa.Integer(),    nullable=False),
        sa.Column('titulo',                sa.String(200),  nullable=False),
        sa.Column('contenido',             sa.Text(),       nullable=False),
        sa.Column('categoria',             sa.String(30),   nullable=False, server_default="'GENERAL'"),
        sa.Column('prioridad',             sa.String(20),   nullable=False, server_default="'INFORMATIVO'"),
        sa.Column('estado',                sa.String(20),   nullable=False, server_default="'BORRADOR'"),
        sa.Column('requiere_confirmacion', sa.Boolean(),    nullable=False, server_default='false'),
        sa.Column('area_emisora',          sa.String(200),  nullable=True),
        sa.Column('fecha_publicacion',     sa.DateTime(),   nullable=True),
        sa.Column('fecha_expiracion',      sa.DateTime(),   nullable=True),
        sa.Column('autor_id',              sa.Integer(),    nullable=True),
        sa.Column('creado_en',             sa.DateTime(),   nullable=False),
        sa.Column('actualizado_en',        sa.DateTime(),   nullable=False),
        sa.ForeignKeyConstraint(['autor_id'], ['usuarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_comunicados_id',     'comunicados', ['id'])
    op.create_index('ix_comunicados_estado', 'comunicados', ['estado'])

    # ── comunicado_destinatarios ──────────────────────────────────────────────
    op.create_table(
        'comunicado_destinatarios',
        sa.Column('id',                sa.Integer(),    nullable=False),
        sa.Column('comunicado_id',     sa.Integer(),    nullable=False),
        sa.Column('tipo_destinatario', sa.String(20),   nullable=False),
        sa.Column('destinatario_ref',  sa.String(100),  nullable=True),
        sa.ForeignKeyConstraint(['comunicado_id'], ['comunicados.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('comunicado_id', 'tipo_destinatario', 'destinatario_ref',
                            name='uq_comunicado_destinatario'),
    )
    op.create_index('ix_comunicado_destinatarios_id',            'comunicado_destinatarios', ['id'])
    op.create_index('ix_comunicado_destinatarios_comunicado_id', 'comunicado_destinatarios', ['comunicado_id'])

    # ── comunicado_lecturas ───────────────────────────────────────────────────
    op.create_table(
        'comunicado_lecturas',
        sa.Column('id',            sa.Integer(),  nullable=False),
        sa.Column('comunicado_id', sa.Integer(),  nullable=False),
        sa.Column('usuario_id',    sa.Integer(),  nullable=False),
        sa.Column('leido_en',      sa.DateTime(), nullable=True),
        sa.Column('confirmado_en', sa.DateTime(), nullable=True),
        sa.Column('creado_en',     sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['comunicado_id'], ['comunicados.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'],    ['usuarios.id'],    ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('comunicado_id', 'usuario_id', name='uq_comunicado_lectura'),
    )
    op.create_index('ix_comunicado_lecturas_id',            'comunicado_lecturas', ['id'])
    op.create_index('ix_comunicado_lecturas_comunicado_id', 'comunicado_lecturas', ['comunicado_id'])
    op.create_index('ix_comunicado_lecturas_usuario_id',    'comunicado_lecturas', ['usuario_id'])


def downgrade():
    op.drop_table('comunicado_lecturas')
    op.drop_table('comunicado_destinatarios')
    op.drop_table('comunicados')
