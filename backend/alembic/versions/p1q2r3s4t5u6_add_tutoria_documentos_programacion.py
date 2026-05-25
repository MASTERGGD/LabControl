"""add_tutoria_documentos_programacion

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2026-05-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector
import datetime

revision = "p1q2r3s4t5u6"
down_revision = "o0p1q2r3s4t5"
branch_labels = None
depends_on = None


def _col_exists(inspector, table, column):
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade():
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing_tables = inspector.get_table_names()

    # ── Columnas de código de documento en tablas existentes ──────────────────
    for table, codigo in (
        ("sesiones_tutoria", "F-DC-07"),
        ("canalizaciones", "F-DC-08"),
        ("informes_bimestrales", "F-DC-09"),
    ):
        if not _col_exists(inspector, table, "documento_codigo"):
            op.add_column(table, sa.Column("documento_codigo", sa.String(20),
                                           nullable=True, server_default=codigo))
        if not _col_exists(inspector, table, "documento_version"):
            op.add_column(table, sa.Column("documento_version", sa.String(10),
                                           nullable=True, server_default="08"))
        if not _col_exists(inspector, table, "documento_efectivo"):
            op.add_column(table, sa.Column("documento_efectivo", sa.Date(), nullable=True))

    # ── documentos_controlados_tutoria ────────────────────────────────────────
    if 'documentos_controlados_tutoria' not in existing_tables:
        op.create_table(
            "documentos_controlados_tutoria",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("codigo", sa.String(20), nullable=False),
            sa.Column("nombre", sa.String(160), nullable=False),
            sa.Column("version", sa.String(10), nullable=False),
            sa.Column("fecha_efectivo", sa.Date(), nullable=True),
            sa.Column("proceso", sa.String(80), server_default="Tutoria"),
            sa.Column("vigente", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("observaciones", sa.Text(), nullable=True),
            sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        )

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_documentos_controlados_tutoria_codigo
        ON documentos_controlados_tutoria (codigo)
    """)

    # ── programaciones_sesion_tutoria ─────────────────────────────────────────
    if 'programaciones_sesion_tutoria' not in existing_tables:
        op.create_table(
            "programaciones_sesion_tutoria",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("grupo_tutorado_id", sa.Integer(),
                      sa.ForeignKey("grupos_tutorados.id"), nullable=False),
            sa.Column("tutor_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
            sa.Column("fecha_programada", sa.Date(), nullable=False),
            sa.Column("tipo_sesion", sa.String(20), server_default="GRUPAL"),
            sa.Column("objetivo", sa.Text(), nullable=True),
            sa.Column("estado", sa.String(20), server_default="PROGRAMADA"),
            sa.Column("sesion_id", sa.Integer(), sa.ForeignKey("sesiones_tutoria.id"),
                      nullable=True),
            sa.Column("creado_por", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
            sa.Column("creado_en", sa.DateTime(), nullable=False),
        )

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_programaciones_sesion_tutoria_grupo_tutorado_id
        ON programaciones_sesion_tutoria (grupo_tutorado_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_programaciones_sesion_tutoria_tutor_id
        ON programaciones_sesion_tutoria (tutor_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_programaciones_sesion_tutoria_fecha_programada
        ON programaciones_sesion_tutoria (fecha_programada)
    """)

    # ── Seed de documentos controlados (solo si la tabla estaba vacía) ────────
    result = bind.execute(
        sa.text("SELECT COUNT(*) FROM documentos_controlados_tutoria")
    )
    count = result.scalar()
    if count == 0:
        now = datetime.datetime.utcnow()
        bind.execute(sa.text("""
            INSERT INTO documentos_controlados_tutoria
                (codigo, nombre, version, fecha_efectivo, proceso, vigente, actualizado_en)
            VALUES
                ('F-DC-07', 'Control de Tutoria', '08', NULL, 'Tutoria', TRUE, :now),
                ('F-DC-08', 'Canalizacion', '08', NULL, 'Tutoria', TRUE, :now),
                ('F-DC-09', 'Informe Bimestral de Tutoria', '08', NULL, 'Tutoria', TRUE, :now)
        """), {"now": now})


def downgrade():
    op.drop_index("ix_programaciones_sesion_tutoria_fecha_programada",
                  table_name="programaciones_sesion_tutoria")
    op.drop_index("ix_programaciones_sesion_tutoria_tutor_id",
                  table_name="programaciones_sesion_tutoria")
    op.drop_index("ix_programaciones_sesion_tutoria_grupo_tutorado_id",
                  table_name="programaciones_sesion_tutoria")
    op.drop_table("programaciones_sesion_tutoria")
    op.drop_index("ix_documentos_controlados_tutoria_codigo",
                  table_name="documentos_controlados_tutoria")
    op.drop_table("documentos_controlados_tutoria")
    for table in ("informes_bimestrales", "canalizaciones", "sesiones_tutoria"):
        op.drop_column(table, "documento_efectivo")
        op.drop_column(table, "documento_version")
        op.drop_column(table, "documento_codigo")
