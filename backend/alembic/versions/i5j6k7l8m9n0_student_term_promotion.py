"""Agrega promoción académica por Servicios Escolares."""
from alembic import op
import sqlalchemy as sa

revision = "i5j6k7l8m9n0"
down_revision = "h4i5j6k7l8m9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "promociones_academicas_alumno",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alumno_id", sa.Integer(), nullable=False), sa.Column("inscripcion_origen_id", sa.Integer(), nullable=False),
        sa.Column("periodo_destino_id", sa.Integer(), nullable=False), sa.Column("resolucion", sa.String(25), nullable=False, server_default="PENDIENTE"),
        sa.Column("cuatrimestre_destino", sa.Integer()), sa.Column("grupo_destino", sa.String(10)), sa.Column("observaciones", sa.Text()),
        sa.Column("estado", sa.String(20), nullable=False, server_default="PROPUESTA"), sa.Column("resuelto_por_id", sa.Integer()),
        sa.Column("resuelto_en", sa.DateTime()), sa.Column("aplicado_en", sa.DateTime()),
        sa.Column("creado_en", sa.DateTime(), nullable=False), sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["alumno_id"], ["catalogo_alumnos.id"]), sa.ForeignKeyConstraint(["inscripcion_origen_id"], ["inscripciones_alumnos.id"]),
        sa.ForeignKeyConstraint(["periodo_destino_id"], ["periodos_escolares.id"]), sa.ForeignKeyConstraint(["resuelto_por_id"], ["usuarios.id"]),
        sa.UniqueConstraint("inscripcion_origen_id", name="uq_promocion_inscripcion_origen"),
    )
    for col in ("alumno_id", "inscripcion_origen_id", "periodo_destino_id", "resolucion", "estado"):
        op.create_index(f"ix_promociones_academicas_alumno_{col}", "promociones_academicas_alumno", [col])


def downgrade():
    op.drop_table("promociones_academicas_alumno")
