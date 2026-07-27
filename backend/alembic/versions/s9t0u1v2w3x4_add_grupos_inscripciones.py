"""add periodos, grupos e inscripciones escolares"""
from alembic import op
import sqlalchemy as sa

revision = "s9t0u1v2w3x4"
down_revision = "r8s9t0u1v2w3"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("periodos_escolares",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clave", sa.String(20), nullable=False, unique=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("es_actual", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("creado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_periodos_escolares_clave", "periodos_escolares", ["clave"], unique=True)
    op.create_table("grupos_academicos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("periodo_id", sa.Integer(), sa.ForeignKey("periodos_escolares.id"), nullable=False),
        sa.Column("carrera", sa.String(180), nullable=False),
        sa.Column("cuatrimestre", sa.Integer(), nullable=False),
        sa.Column("grupo", sa.String(10), nullable=False),
        sa.Column("turno", sa.String(20), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("periodo_id", "carrera", "cuatrimestre", "grupo", name="uq_grupo_academico"))
    op.create_index("ix_grupos_academicos_periodo_id", "grupos_academicos", ["periodo_id"])
    op.create_index("ix_grupos_academicos_carrera", "grupos_academicos", ["carrera"])
    op.create_table("inscripciones_alumnos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alumno_id", sa.Integer(), sa.ForeignKey("catalogo_alumnos.id"), nullable=False),
        sa.Column("grupo_academico_id", sa.Integer(), sa.ForeignKey("grupos_academicos.id"), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default="ACTIVO"),
        sa.Column("inscrito_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("alumno_id", "grupo_academico_id", name="uq_inscripcion_alumno_grupo"))
    op.create_index("ix_inscripciones_alumnos_alumno_id", "inscripciones_alumnos", ["alumno_id"])
    op.create_index("ix_inscripciones_alumnos_grupo_id", "inscripciones_alumnos", ["grupo_academico_id"])

def downgrade():
    op.drop_table("inscripciones_alumnos")
    op.drop_table("grupos_academicos")
    op.drop_table("periodos_escolares")
