"""link recurring laboratory reservations to school terms

Revision ID: o1p2q3r4s5t6
Revises: n0o1p2q3r4s5
"""

from alembic import op
import sqlalchemy as sa

revision = "o1p2q3r4s5t6"
down_revision = "n0o1p2q3r4s5"
branch_labels = None
depends_on = None


def _normalizar(valor):
    return "".join(ch for ch in (valor or "").upper() if ch.isalnum())


def upgrade():
    op.add_column("reservaciones", sa.Column("periodo_id", sa.Integer(), nullable=True))
    op.create_index("ix_reservaciones_periodo_id", "reservaciones", ["periodo_id"])
    op.create_foreign_key(
        "fk_reservaciones_periodo", "reservaciones", "periodos_escolares",
        ["periodo_id"], ["id"],
    )
    conexion = op.get_bind()
    periodos = conexion.execute(sa.text("SELECT id, clave FROM periodos_escolares")).mappings().all()
    por_clave = {_normalizar(p["clave"]): p["id"] for p in periodos}
    reservas = conexion.execute(sa.text("SELECT id, cuatrimestre FROM reservaciones")).mappings().all()
    for reserva in reservas:
        periodo_id = por_clave.get(_normalizar(reserva["cuatrimestre"]))
        if periodo_id:
            conexion.execute(
                sa.text("UPDATE reservaciones SET periodo_id = :periodo_id WHERE id = :id"),
                {"periodo_id": periodo_id, "id": reserva["id"]},
            )


def downgrade():
    op.drop_constraint("fk_reservaciones_periodo", "reservaciones", type_="foreignkey")
    op.drop_index("ix_reservaciones_periodo_id", table_name="reservaciones")
    op.drop_column("reservaciones", "periodo_id")
