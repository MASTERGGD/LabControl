"""unique computers per laboratory

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-06-12 00:00:00.000000

"""
from collections import defaultdict
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalizar_codigo(codigo: str | None) -> str:
    return re.sub(r"-+", "-", (codigo or "").strip().upper())


def upgrade() -> None:
    bind = op.get_bind()
    filas = bind.execute(
        sa.text(
            "SELECT id, laboratorio_id, numero, codigo "
            "FROM computadoras ORDER BY laboratorio_id, id"
        )
    ).mappings().all()

    por_laboratorio = defaultdict(list)
    for fila in filas:
        por_laboratorio[fila["laboratorio_id"]].append(fila)

    for computadoras in por_laboratorio.values():
        usados_numeros: set[int] = set()
        usados_codigos: set[str] = set()
        siguiente = max(
            (int(pc["numero"] or 0) for pc in computadoras),
            default=0,
        ) + 1

        for pc in computadoras:
            numero = int(pc["numero"] or 0)
            codigo = _normalizar_codigo(pc["codigo"])

            if numero < 1 or numero in usados_numeros:
                while siguiente in usados_numeros:
                    siguiente += 1
                numero = siguiente
                siguiente += 1

            if not codigo or codigo in usados_codigos:
                codigo = f"PC-{numero:02d}"
                while codigo in usados_codigos:
                    while siguiente in usados_numeros:
                        siguiente += 1
                    numero = siguiente
                    siguiente += 1
                    codigo = f"PC-{numero:02d}"

            usados_numeros.add(numero)
            usados_codigos.add(codigo)
            bind.execute(
                sa.text(
                    "UPDATE computadoras "
                    "SET numero = :numero, codigo = :codigo "
                    "WHERE id = :id"
                ),
                {"numero": numero, "codigo": codigo, "id": pc["id"]},
            )

    with op.batch_alter_table("computadoras") as batch_op:
        batch_op.create_unique_constraint(
            "uq_computadora_lab_numero",
            ["laboratorio_id", "numero"],
        )
        batch_op.create_unique_constraint(
            "uq_computadora_lab_codigo",
            ["laboratorio_id", "codigo"],
        )


def downgrade() -> None:
    with op.batch_alter_table("computadoras") as batch_op:
        batch_op.drop_constraint(
            "uq_computadora_lab_codigo",
            type_="unique",
        )
        batch_op.drop_constraint(
            "uq_computadora_lab_numero",
            type_="unique",
        )
