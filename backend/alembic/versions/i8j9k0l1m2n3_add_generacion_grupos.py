"""add generacion to grupos academicos

Revision ID: i8j9k0l1m2n3
Revises: h7i8j9k0l1m2
"""
from alembic import op
import sqlalchemy as sa
import re


revision = "i8j9k0l1m2n3"
down_revision = "h7i8j9k0l1m2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("grupos_academicos", sa.Column("generacion", sa.String(length=40), nullable=True))
    op.create_index("ix_grupos_academicos_generacion", "grupos_academicos", ["generacion"], unique=False)
    conexion = op.get_bind()
    filas = conexion.execute(sa.text("""
        SELECT g.id, g.carrera, g.cuatrimestre, p.clave AS periodo, c.clave AS carrera_clave
        FROM grupos_academicos g
        JOIN periodos_escolares p ON p.id = g.periodo_id
        LEFT JOIN catalogo_carreras c ON c.id = g.carrera_id
    """)).mappings()
    bloques = ("ENE", "MAY", "SEP")
    omitidas = {"EN", "DE", "DEL", "LA", "EL", "Y", "E"}
    for fila in filas:
        prefijo = fila["carrera_clave"]
        if not prefijo:
            palabras = re.findall(r"[A-Z0-9]+", (fila["carrera"] or "").upper())
            prefijo = "".join(p if len(p) <= 4 else p[0] for p in palabras if p not in omitidas)[:12] or "GEN"
        match = re.search(r"(ENE|MAY|SEP)[- ]?(?:ABR|AGO|DIC)\s*[- ]?\s*(\d{4})", (fila["periodo"] or "").upper())
        if match:
            indice = int(match.group(2)) * 3 + bloques.index(match.group(1)) - max(int(fila["cuatrimestre"] or 1) - 1, 0)
            anio, bloque = divmod(indice, 3)
            generacion = f"{re.sub(r'[^A-Z0-9]', '', prefijo.upper())[:12]}-{bloques[bloque]}{anio}"
        else:
            generacion = re.sub(r"[^A-Z0-9]", "", prefijo.upper())[:12] or "GEN"
        conexion.execute(sa.text("UPDATE grupos_academicos SET generacion = :generacion WHERE id = :id"), {"generacion": generacion, "id": fila["id"]})


def downgrade():
    op.drop_index("ix_grupos_academicos_generacion", table_name="grupos_academicos")
    op.drop_column("grupos_academicos", "generacion")
