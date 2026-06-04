"""inventario patrimonial v1.3

Revision ID: p2q3r4s5t6u7
Revises: i9j0k1l2m3n4
Create Date: 2026-06-03

Cambios:
  - solicitudes_baja_inventario: +autorizado_por_id, +fecha_autorizacion, +migrado_version
  - activos: renombra resguardo_nombre -> resguardante_externo_nombre

Estrategia de datos existentes:
  - Bajas procesadas sin autorizador: migrado_version='v1.2' (no se inventa el dato)
  - resguardo_nombre se copia a resguardante_externo_nombre; si hay match con usuario
    por nombre/email se vincula responsable_id y se limpia el texto libre.
"""
from alembic import op
import sqlalchemy as sa

revision = 'p2q3r4s5t6u7'
down_revision = 'i9j0k1l2m3n4'
branch_labels = None
depends_on = None


def upgrade():
    # solicitudes_baja_inventario
    with op.batch_alter_table("solicitudes_baja_inventario") as batch_op:
        batch_op.add_column(sa.Column("autorizado_por_id",  sa.Integer(),  nullable=True))
        batch_op.add_column(sa.Column("fecha_autorizacion", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("migrado_version",    sa.String(20), nullable=True))
        batch_op.create_foreign_key(
            "fk_baja_autorizado_por", "usuarios",
            ["autorizado_por_id"], ["id"],
        )

    op.execute("""
        UPDATE solicitudes_baja_inventario
        SET migrado_version = 'v1.2'
        WHERE estado IN (
            'AUTORIZADA','EJECUTADA','RECHAZADA','EN_REVISION','VALIDADA_FISICAMENTE'
        )
    """)

    # activos: nueva columna
    with op.batch_alter_table("activos") as batch_op:
        batch_op.add_column(
            sa.Column("resguardante_externo_nombre", sa.String(), nullable=True)
        )

    # Migrar texto del campo viejo al nuevo
    op.execute("""
        UPDATE activos
        SET resguardante_externo_nombre = resguardo_nombre
        WHERE resguardo_nombre IS NOT NULL AND resguardo_nombre != ''
    """)

    # Intentar resolver FK: si existe usuario con ese nombre, vincular responsable_id
    op.execute("""
        UPDATE activos
        SET responsable_id = u.id,
            resguardante_externo_nombre = NULL
        FROM usuarios u
        WHERE activos.responsable_id IS NULL
          AND activos.resguardante_externo_nombre IS NOT NULL
          AND (
            lower(u.nombre) = lower(activos.resguardante_externo_nombre)
            OR lower(u.email) = lower(activos.resguardante_externo_nombre)
          )
    """)

    # Eliminar columna vieja
    with op.batch_alter_table("activos") as batch_op:
        batch_op.drop_column("resguardo_nombre")


def downgrade():
    # Restaurar columna vieja en activos
    with op.batch_alter_table("activos") as batch_op:
        batch_op.add_column(sa.Column("resguardo_nombre", sa.String(), nullable=True))

    op.execute("""
        UPDATE activos
        SET resguardo_nombre = resguardante_externo_nombre
        WHERE resguardante_externo_nombre IS NOT NULL
    """)

    with op.batch_alter_table("activos") as batch_op:
        batch_op.drop_column("resguardante_externo_nombre")

    # Revertir columnas de baja
    with op.batch_alter_table("solicitudes_baja_inventario") as batch_op:
        batch_op.drop_constraint("fk_baja_autorizado_por", type_="foreignkey")
        batch_op.drop_column("autorizado_por_id")
        batch_op.drop_column("fecha_autorizacion")
        batch_op.drop_column("migrado_version")
