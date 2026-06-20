"""add_operacion_espacios

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-05-21

"""
from alembic import op
import sqlalchemy as sa


revision = "q2r3s4t5u6v7"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("espacios_institucionales", sa.Column("buffer_antes_minutos", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("espacios_institucionales", sa.Column("buffer_despues_minutos", sa.Integer(), nullable=False, server_default="30"))
    op.add_column("espacios_institucionales", sa.Column("estado_operativo", sa.String(length=30), nullable=False, server_default="DISPONIBLE"))
    op.add_column("espacios_institucionales", sa.Column("aviso_operativo", sa.Text(), nullable=True))

    op.create_table(
        "espacios_apoyos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("espacio_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("rol_apoyo", sa.String(length=120), nullable=True),
        sa.Column("asignado_en", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["espacio_id"], ["espacios_institucionales.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("espacio_id", "usuario_id", name="uq_espacio_apoyo"),
    )
    op.create_index("ix_espacios_apoyos_id", "espacios_apoyos", ["id"])
    op.create_index("ix_espacios_apoyos_espacio_id", "espacios_apoyos", ["espacio_id"])
    op.create_index("ix_espacios_apoyos_usuario_id", "espacios_apoyos", ["usuario_id"])

    with op.batch_alter_table("solicitudes_espacio", schema=None) as batch_op:
        batch_op.add_column(sa.Column("finalizado_por", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("finalizado_en", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("cierre_climas_apagados", sa.Boolean(), nullable=False, server_default="false"))
        batch_op.add_column(sa.Column("cierre_luces_apagadas", sa.Boolean(), nullable=False, server_default="false"))
        batch_op.add_column(sa.Column("cierre_microfonos_apagados", sa.Boolean(), nullable=False, server_default="false"))
        batch_op.add_column(sa.Column("cierre_equipo_apagado", sa.Boolean(), nullable=False, server_default="false"))
        batch_op.add_column(sa.Column("cierre_sala_cerrada", sa.Boolean(), nullable=False, server_default="false"))
        batch_op.add_column(sa.Column("cierre_sin_incidencias", sa.Boolean(), nullable=False, server_default="true"))
        batch_op.add_column(sa.Column("cierre_observaciones", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("extension_minutos_solicitados", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("extension_motivo", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("extension_estado", sa.String(length=20), nullable=False, server_default="SIN_SOLICITUD"))
        batch_op.add_column(sa.Column("extension_solicitada_en", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("extension_resuelta_por", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("extension_resuelta_en", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key("fk_solicitud_finalizado_por_usuario", "usuarios", ["finalizado_por"], ["id"])
        batch_op.create_foreign_key("fk_solicitud_extension_resuelta_por_usuario", "usuarios", ["extension_resuelta_por"], ["id"])


def downgrade():
    with op.batch_alter_table("solicitudes_espacio", schema=None) as batch_op:
        batch_op.drop_constraint("fk_solicitud_extension_resuelta_por_usuario", type_="foreignkey")
        batch_op.drop_constraint("fk_solicitud_finalizado_por_usuario", type_="foreignkey")
        for col in [
            "extension_resuelta_en", "extension_resuelta_por", "extension_solicitada_en",
            "extension_estado", "extension_motivo", "extension_minutos_solicitados",
            "cierre_observaciones", "cierre_sin_incidencias", "cierre_sala_cerrada",
            "cierre_equipo_apagado", "cierre_microfonos_apagados", "cierre_luces_apagadas",
            "cierre_climas_apagados", "finalizado_en", "finalizado_por",
        ]:
            batch_op.drop_column(col)

    op.drop_index("ix_espacios_apoyos_usuario_id", table_name="espacios_apoyos")
    op.drop_index("ix_espacios_apoyos_espacio_id", table_name="espacios_apoyos")
    op.drop_index("ix_espacios_apoyos_id", table_name="espacios_apoyos")
    op.drop_table("espacios_apoyos")

    op.drop_column("espacios_institucionales", "aviso_operativo")
    op.drop_column("espacios_institucionales", "estado_operativo")
    op.drop_column("espacios_institucionales", "buffer_despues_minutos")
    op.drop_column("espacios_institucionales", "buffer_antes_minutos")
