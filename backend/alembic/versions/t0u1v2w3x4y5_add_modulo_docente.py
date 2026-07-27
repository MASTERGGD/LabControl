"""add modulo docente y asistencias"""
from alembic import op
import sqlalchemy as sa

revision = "t0u1v2w3x4y5"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cargas_docentes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("docente_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("periodo_id", sa.Integer(), sa.ForeignKey("periodos_escolares.id"), nullable=False),
        sa.Column("grupo_academico_id", sa.Integer(), sa.ForeignKey("grupos_academicos.id"), nullable=True),
        sa.Column("materia_id", sa.Integer(), sa.ForeignKey("catalogo_materias.id"), nullable=True),
        sa.Column("tipo_actividad", sa.String(20), nullable=False, server_default="CLASE"),
        sa.Column("actividad_nombre", sa.String(200), nullable=False),
        sa.Column("dia_semana", sa.Integer(), nullable=False),
        sa.Column("hora_inicio", sa.String(5), nullable=False),
        sa.Column("hora_fin", sa.String(5), nullable=False),
        sa.Column("espacio_nombre", sa.String(180), nullable=True),
        sa.Column("laboratorio_id", sa.Integer(), sa.ForeignKey("laboratorios.id"), nullable=True),
        sa.Column("estado", sa.String(25), nullable=False, server_default="BORRADOR"),
        sa.Column("observaciones", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_cargas_docentes_docente_id", "cargas_docentes", ["docente_id"])
    op.create_index("ix_cargas_docentes_periodo_id", "cargas_docentes", ["periodo_id"])
    op.create_index("ix_cargas_docentes_grupo_id", "cargas_docentes", ["grupo_academico_id"])
    op.create_table(
        "clases_docentes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("carga_docente_id", sa.Integer(), sa.ForeignKey("cargas_docentes.id"), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default="ABIERTA"),
        sa.Column("inicio", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("fin", sa.DateTime(), nullable=True),
        sa.Column("observacion_general", sa.Text(), nullable=True),
        sa.UniqueConstraint("carga_docente_id", "fecha", name="uq_clase_carga_fecha"),
    )
    op.create_index("ix_clases_docentes_carga_id", "clases_docentes", ["carga_docente_id"])
    op.create_index("ix_clases_docentes_fecha", "clases_docentes", ["fecha"])
    op.create_table(
        "asistencias_docentes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clase_docente_id", sa.Integer(), sa.ForeignKey("clases_docentes.id"), nullable=False),
        sa.Column("alumno_id", sa.Integer(), sa.ForeignKey("catalogo_alumnos.id"), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default="PRESENTE"),
        sa.Column("observacion", sa.Text(), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("clase_docente_id", "alumno_id", name="uq_asistencia_clase_alumno"),
    )
    op.create_index("ix_asistencias_docentes_clase_id", "asistencias_docentes", ["clase_docente_id"])
    op.create_index("ix_asistencias_docentes_alumno_id", "asistencias_docentes", ["alumno_id"])


def downgrade():
    op.drop_table("asistencias_docentes")
    op.drop_table("clases_docentes")
    op.drop_table("cargas_docentes")
