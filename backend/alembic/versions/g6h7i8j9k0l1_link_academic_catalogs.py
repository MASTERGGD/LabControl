"""link students, subjects and groups to the official career catalog

Revision ID: g6h7i8j9k0l1
Revises: f5g6h7i8j9k0
"""
from alembic import op
import sqlalchemy as sa


revision = "g6h7i8j9k0l1"
down_revision = "f5g6h7i8j9k0"
branch_labels = None
depends_on = None


def upgrade():
    for tabla in ("catalogo_alumnos", "catalogo_materias", "grupos_academicos"):
        op.add_column(tabla, sa.Column("carrera_id", sa.Integer(), nullable=True))
        op.create_index(f"ix_{tabla}_carrera_id", tabla, ["carrera_id"])
        op.create_foreign_key(f"fk_{tabla}_carrera", tabla, "catalogo_carreras", ["carrera_id"], ["id"])
    op.add_column("grupos_academicos", sa.Column("capacidad", sa.Integer(), nullable=True))
    # Vincular nombres oficiales existentes. Los alias se resuelven desde la
    # aplicación porque sus nombres viven en una tabla independiente.
    op.execute("""
        UPDATE catalogo_alumnos a SET carrera_id = c.id
        FROM catalogo_carreras c WHERE LOWER(a.carrera) = LOWER(c.nombre)
    """)
    op.execute("""
        UPDATE catalogo_materias m SET carrera_id = c.id
        FROM catalogo_carreras c WHERE LOWER(m.carrera) = LOWER(c.nombre)
    """)
    op.execute("""
        UPDATE grupos_academicos g SET carrera_id = c.id
        FROM catalogo_carreras c WHERE LOWER(g.carrera) = LOWER(c.nombre)
    """)


def downgrade():
    op.drop_column("grupos_academicos", "capacidad")
    for tabla in ("grupos_academicos", "catalogo_materias", "catalogo_alumnos"):
        op.drop_constraint(f"fk_{tabla}_carrera", tabla, type_="foreignkey")
        op.drop_index(f"ix_{tabla}_carrera_id", table_name=tabla)
        op.drop_column(tabla, "carrera_id")
