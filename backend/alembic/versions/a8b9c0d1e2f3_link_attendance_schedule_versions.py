"""Conserva el linaje entre versiones de una carga docente.

Revision ID: a8b9c0d1e2f3
Revises: p9q0r1s2t3u4
"""
from alembic import op
import sqlalchemy as sa


revision = "a8b9c0d1e2f3"
down_revision = "p9q0r1s2t3u4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "cargas_docentes",
        sa.Column("carga_linaje_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_cargas_docentes_carga_linaje_id",
        "cargas_docentes", ["carga_linaje_id"],
    )

    bind = op.get_bind()
    cargas = sa.table(
        "cargas_docentes",
        sa.column("id", sa.Integer()),
        sa.column("docente_id", sa.Integer()),
        sa.column("periodo_id", sa.Integer()),
        sa.column("grupo_academico_id", sa.Integer()),
        sa.column("materia_id", sa.Integer()),
        sa.column("tipo_actividad", sa.String()),
        sa.column("actividad_nombre", sa.String()),
        sa.column("dia_semana", sa.Integer()),
        sa.column("hora_inicio", sa.String()),
        sa.column("hora_fin", sa.String()),
        sa.column("activo", sa.Boolean()),
        sa.column("estado", sa.String()),
        sa.column("carga_linaje_id", sa.Integer()),
    )
    clases = sa.table(
        "clases_docentes",
        sa.column("carga_docente_id", sa.Integer()),
    )
    bind.execute(cargas.update().values(carga_linaje_id=cargas.c.id))

    activas = bind.execute(sa.select(cargas).where(
        cargas.c.activo.is_(True), cargas.c.tipo_actividad == "CLASE",
    )).mappings().all()
    cargas_con_historial = bind.execute(
        sa.select(cargas).join(
            clases, clases.c.carga_docente_id == cargas.c.id,
        ).where(
            cargas.c.activo.is_(False), cargas.c.tipo_actividad == "CLASE",
        ).distinct()
    ).mappings().all()

    def identidad(carga):
        materia = carga["materia_id"]
        actividad = (carga["actividad_nombre"] or "").strip().casefold() if not materia else None
        return (
            carga["docente_id"], carga["periodo_id"], carga["grupo_academico_id"],
            materia, actividad, carga["tipo_actividad"], carga["dia_semana"],
            carga["hora_inicio"], carga["hora_fin"],
        )

    por_identidad = {}
    for carga in activas:
        por_identidad.setdefault(identidad(carga), []).append(carga)
    for anterior in cargas_con_historial:
        candidatas = por_identidad.get(identidad(anterior), [])
        if len(candidatas) == 1:
            bind.execute(cargas.update().where(
                cargas.c.id == anterior["id"],
            ).values(carga_linaje_id=candidatas[0]["id"]))


def downgrade():
    op.drop_index("ix_cargas_docentes_carga_linaje_id", table_name="cargas_docentes")
    op.drop_column("cargas_docentes", "carga_linaje_id")
