"""Agrupa los bloques horarios que forman una misma clase.

Revision ID: z7a8b9c0d1e2
Revises: z6a7b8c9d0e1, b3c4d5e6f7a8
"""
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "z7a8b9c0d1e2"
down_revision = ("z6a7b8c9d0e1", "b3c4d5e6f7a8")
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reservaciones", sa.Column("bloque_reserva_id", sa.String(length=36), nullable=True))
    op.create_index("ix_reservaciones_bloque_reserva_id", "reservaciones", ["bloque_reserva_id"])

    bind = op.get_bind()
    reservaciones = sa.table(
        "reservaciones",
        sa.column("id", sa.Integer()),
        sa.column("horario_id", sa.Integer()),
        sa.column("bloque_reserva_id", sa.String(length=36)),
        sa.column("laboratorio_id", sa.Integer()),
        sa.column("docente_id", sa.Integer()),
        sa.column("periodo_id", sa.Integer()),
        sa.column("materia", sa.String()),
        sa.column("carrera", sa.String()),
        sa.column("cuatrimestre", sa.String()),
        sa.column("cuatrimestre_materia", sa.String()),
        sa.column("grupo", sa.String()),
        sa.column("tipo_actividad", sa.String()),
        sa.column("fecha_actividad", sa.Date()),
        sa.column("estado", sa.String()),
    )
    horarios = sa.table(
        "horarios_disponibles",
        sa.column("id", sa.Integer()),
        sa.column("dia_semana", sa.Integer()),
        sa.column("hora_inicio", sa.String()),
        sa.column("hora_fin", sa.String()),
    )
    rows = bind.execute(
        sa.select(
            reservaciones.c.id,
            reservaciones.c.laboratorio_id,
            reservaciones.c.docente_id,
            reservaciones.c.periodo_id,
            reservaciones.c.materia,
            reservaciones.c.carrera,
            reservaciones.c.cuatrimestre,
            reservaciones.c.cuatrimestre_materia,
            reservaciones.c.grupo,
            reservaciones.c.tipo_actividad,
            reservaciones.c.fecha_actividad,
            reservaciones.c.estado,
            horarios.c.dia_semana,
            horarios.c.hora_inicio,
            horarios.c.hora_fin,
        ).select_from(reservaciones.join(horarios, reservaciones.c.horario_id == horarios.c.id))
    ).mappings().all()

    identity_fields = (
        "laboratorio_id", "docente_id", "periodo_id", "materia", "carrera",
        "cuatrimestre", "cuatrimestre_materia", "grupo", "tipo_actividad",
        "fecha_actividad", "estado", "dia_semana",
    )
    candidates = {}
    for row in rows:
        key = tuple(row[field] for field in identity_fields)
        candidates.setdefault(key, []).append(row)

    for group in candidates.values():
        ordered = sorted(group, key=lambda row: (row["hora_inicio"], row["id"]))
        contiguous = []
        for row in ordered:
            if contiguous and contiguous[-1]["hora_fin"] != row["hora_inicio"]:
                if len(contiguous) > 1:
                    block_id = str(uuid4())
                    bind.execute(
                        reservaciones.update()
                        .where(reservaciones.c.id.in_([item["id"] for item in contiguous]))
                        .values(bloque_reserva_id=block_id)
                    )
                contiguous = []
            contiguous.append(row)
        if len(contiguous) > 1:
            block_id = str(uuid4())
            bind.execute(
                reservaciones.update()
                .where(reservaciones.c.id.in_([item["id"] for item in contiguous]))
                .values(bloque_reserva_id=block_id)
            )


def downgrade():
    op.drop_index("ix_reservaciones_bloque_reserva_id", table_name="reservaciones")
    op.drop_column("reservaciones", "bloque_reserva_id")
