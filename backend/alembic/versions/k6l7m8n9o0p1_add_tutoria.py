"""add_tutoria

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-05-19

Módulo de Tutoría (P-DC-02 v08):
  - grupos_tutorados
  - asignaciones_tutoria
  - perfiles_socioeconomicos
  - sesiones_tutoria
  - registros_sesion_alumno
  - canalizaciones
  - informes_bimestrales
  - detalles_informe_bimestral
"""
from alembic import op
import sqlalchemy as sa

revision = 'k6l7m8n9o0p1'
down_revision = 'j5k6l7m8n9o0'
branch_labels = None
depends_on = None


def upgrade():
    # ── grupos_tutorados ──────────────────────────────────────────────────────
    op.create_table(
        'grupos_tutorados',
        sa.Column('id',           sa.Integer(), primary_key=True),
        sa.Column('tutor_id',     sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('carrera',      sa.String(120), nullable=False),
        sa.Column('cuatrimestre', sa.Integer(), nullable=False),
        sa.Column('grupo',        sa.String(10), nullable=False),
        sa.Column('periodo',      sa.String(20), nullable=False),
        sa.Column('activo',       sa.Boolean(), default=True),
        sa.Column('creado_en',    sa.DateTime()),
        sa.Column('creado_por',   sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
    )
    op.create_index('ix_grupos_tutorados_tutor_id', 'grupos_tutorados', ['tutor_id'])

    # ── asignaciones_tutoria ──────────────────────────────────────────────────
    op.create_table(
        'asignaciones_tutoria',
        sa.Column('id',                sa.Integer(), primary_key=True),
        sa.Column('grupo_tutorado_id', sa.Integer(), sa.ForeignKey('grupos_tutorados.id'), nullable=False),
        sa.Column('alumno_id',         sa.Integer(), sa.ForeignKey('catalogo_alumnos.id'), nullable=False),
        sa.Column('activo',            sa.Boolean(), default=True),
        sa.Column('asignado_en',       sa.DateTime()),
    )
    op.create_index('ix_asignaciones_tutoria_grupo', 'asignaciones_tutoria', ['grupo_tutorado_id'])
    op.create_index('ix_asignaciones_tutoria_alumno', 'asignaciones_tutoria', ['alumno_id'])

    # ── perfiles_socioeconomicos ──────────────────────────────────────────────
    op.create_table(
        'perfiles_socioeconomicos',
        sa.Column('id',                       sa.Integer(), primary_key=True),
        sa.Column('alumno_id',                sa.Integer(), sa.ForeignKey('catalogo_alumnos.id'), nullable=False, unique=True),
        sa.Column('periodo_estudio',          sa.String(20)),
        sa.Column('escuela_procedencia',      sa.String(200)),
        sa.Column('promedio_bachillerato',    sa.Float()),
        sa.Column('area_bachillerato',        sa.String(50)),
        sa.Column('habla_lengua_indigena',    sa.Boolean(), default=False),
        sa.Column('lengua_indigena',          sa.String(80)),
        sa.Column('tiene_hijos',              sa.Boolean(), default=False),
        sa.Column('num_hijos',                sa.Integer(), default=0),
        sa.Column('trabaja',                  sa.Boolean(), default=False),
        sa.Column('empresa',                  sa.String(200)),
        sa.Column('ingreso_familiar_mensual', sa.Float()),
        sa.Column('recibe_apoyo_institucional', sa.Boolean(), default=False),
        sa.Column('institucion_apoyo',        sa.String(200)),
        sa.Column('tiene_alergia',            sa.Boolean(), default=False),
        sa.Column('medicamento_alergia',      sa.String(200)),
        sa.Column('tiene_enfermedad_cronica', sa.Boolean(), default=False),
        sa.Column('diabetes',                 sa.Boolean(), default=False),
        sa.Column('hipertension',             sa.Boolean(), default=False),
        sa.Column('hemofilia',                sa.Boolean(), default=False),
        sa.Column('problemas_cardiacos',      sa.Boolean(), default=False),
        sa.Column('otra_enfermedad',          sa.String(200)),
        sa.Column('medicamento_enfermedad',   sa.String(200)),
        sa.Column('tiene_discapacidad',       sa.Boolean(), default=False),
        sa.Column('discapacidad_motriz',      sa.Boolean(), default=False),
        sa.Column('discapacidad_intelectual', sa.Boolean(), default=False),
        sa.Column('discapacidad_multiple',    sa.Boolean(), default=False),
        sa.Column('discapacidad_auditiva',    sa.Boolean(), default=False),
        sa.Column('discapacidad_visual',      sa.Boolean(), default=False),
        sa.Column('discapacidad_psicosocial', sa.Boolean(), default=False),
        sa.Column('otra_discapacidad',        sa.String(200)),
        sa.Column('medicamento_discapacidad', sa.String(200)),
        sa.Column('informacion_relevante',    sa.Text()),
        sa.Column('importado_en',             sa.DateTime()),
        sa.Column('actualizado_en',           sa.DateTime()),
    )

    # ── sesiones_tutoria ──────────────────────────────────────────────────────
    op.create_table(
        'sesiones_tutoria',
        sa.Column('id',                      sa.Integer(), primary_key=True),
        sa.Column('grupo_tutorado_id',       sa.Integer(), sa.ForeignKey('grupos_tutorados.id'), nullable=False),
        sa.Column('tutor_id',                sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('fecha',                   sa.Date(), nullable=False),
        sa.Column('tipo_sesion',             sa.String(20), default='GRUPAL'),
        sa.Column('observaciones_generales', sa.Text()),
        sa.Column('creado_en',               sa.DateTime()),
    )
    op.create_index('ix_sesiones_tutoria_grupo', 'sesiones_tutoria', ['grupo_tutorado_id'])
    op.create_index('ix_sesiones_tutoria_tutor', 'sesiones_tutoria', ['tutor_id'])

    # ── registros_sesion_alumno ───────────────────────────────────────────────
    op.create_table(
        'registros_sesion_alumno',
        sa.Column('id',                    sa.Integer(), primary_key=True),
        sa.Column('sesion_id',             sa.Integer(), sa.ForeignKey('sesiones_tutoria.id'), nullable=False),
        sa.Column('alumno_id',             sa.Integer(), sa.ForeignKey('catalogo_alumnos.id'), nullable=False),
        sa.Column('asistio',               sa.Boolean(), default=True),
        sa.Column('tipo_academico',        sa.Boolean(), default=False),
        sa.Column('tipo_personal',         sa.Boolean(), default=False),
        sa.Column('tipo_otro',             sa.Boolean(), default=False),
        sa.Column('requiere_canalizacion', sa.Boolean(), default=False),
        sa.Column('tema',                  sa.Text()),
        sa.Column('acciones_preventivas',  sa.Text()),
        sa.Column('comentarios',           sa.Text()),
    )
    op.create_index('ix_registros_sesion_sesion', 'registros_sesion_alumno', ['sesion_id'])

    # ── canalizaciones ────────────────────────────────────────────────────────
    op.create_table(
        'canalizaciones',
        sa.Column('id',                   sa.Integer(), primary_key=True),
        sa.Column('tutor_id',             sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('alumno_id',            sa.Integer(), sa.ForeignKey('catalogo_alumnos.id'), nullable=False),
        sa.Column('grupo_tutorado_id',    sa.Integer(), sa.ForeignKey('grupos_tutorados.id'), nullable=True),
        sa.Column('sesion_id',            sa.Integer(), sa.ForeignKey('sesiones_tutoria.id'), nullable=True),
        sa.Column('fecha_solicitud',      sa.DateTime()),
        sa.Column('tipo_psicologico',     sa.Boolean(), default=False),
        sa.Column('tipo_pedagogico',      sa.Boolean(), default=False),
        sa.Column('tipo_personal',        sa.Boolean(), default=False),
        sa.Column('modalidad',            sa.String(20), default='INDIVIDUAL'),
        sa.Column('motivo',               sa.Text(), nullable=False),
        sa.Column('estado',               sa.String(30), default='PENDIENTE'),
        sa.Column('area_atencion',        sa.String(100)),
        sa.Column('tipo_servicio',        sa.String(100)),
        sa.Column('fecha_atencion',       sa.Date()),
        sa.Column('descripcion_atencion', sa.Text()),
        sa.Column('atendido_por',         sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('atendido_en',          sa.DateTime()),
    )
    op.create_index('ix_canalizaciones_tutor',  'canalizaciones', ['tutor_id'])
    op.create_index('ix_canalizaciones_alumno', 'canalizaciones', ['alumno_id'])

    # ── informes_bimestrales ──────────────────────────────────────────────────
    op.create_table(
        'informes_bimestrales',
        sa.Column('id',                     sa.Integer(), primary_key=True),
        sa.Column('tutor_id',               sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('grupo_tutorado_id',      sa.Integer(), sa.ForeignKey('grupos_tutorados.id'), nullable=False),
        sa.Column('periodo',                sa.String(20), nullable=False),
        sa.Column('bimestre',               sa.Integer(), nullable=False),
        sa.Column('matricula_inicial',      sa.Integer(), default=0),
        sa.Column('matricula_final',        sa.Integer(), default=0),
        sa.Column('sesiones_mes1',          sa.Integer(), default=0),
        sa.Column('sesiones_mes2',          sa.Integer(), default=0),
        sa.Column('sesiones_mes3',          sa.Integer(), default=0),
        sa.Column('sesiones_mes4',          sa.Integer(), default=0),
        sa.Column('principal_problematica', sa.Text()),
        sa.Column('sugerencias',            sa.Text()),
        sa.Column('estado',                 sa.String(20), default='BORRADOR'),
        sa.Column('creado_en',              sa.DateTime()),
        sa.Column('enviado_en',             sa.DateTime()),
        sa.Column('recibido_en',            sa.DateTime()),
    )
    op.create_index('ix_informes_bimestrales_tutor', 'informes_bimestrales', ['tutor_id'])

    # ── detalles_informe_bimestral ────────────────────────────────────────────
    op.create_table(
        'detalles_informe_bimestral',
        sa.Column('id',              sa.Integer(), primary_key=True),
        sa.Column('informe_id',      sa.Integer(), sa.ForeignKey('informes_bimestrales.id'), nullable=False),
        sa.Column('alumno_id',       sa.Integer(), sa.ForeignKey('catalogo_alumnos.id'), nullable=False),
        sa.Column('bimestre',        sa.Integer(), nullable=False),
        sa.Column('categoria',       sa.String(40), nullable=False),
        sa.Column('detalle',         sa.Text()),
        sa.Column('porcentaje',      sa.Float()),
        sa.Column('meses_embarazo',  sa.Integer()),
        sa.Column('num_hijos',       sa.Integer()),
        sa.Column('realizo_tramite', sa.Boolean()),
    )
    op.create_index('ix_detalles_informe_id', 'detalles_informe_bimestral', ['informe_id'])


def downgrade():
    op.drop_table('detalles_informe_bimestral')
    op.drop_table('informes_bimestrales')
    op.drop_table('canalizaciones')
    op.drop_table('registros_sesion_alumno')
    op.drop_table('sesiones_tutoria')
    op.drop_table('perfiles_socioeconomicos')
    op.drop_table('asignaciones_tutoria')
    op.drop_table('grupos_tutorados')
