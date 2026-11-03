"""Crea flujo docente de prácticas y control de consumibles por laboratorio."""
from alembic import op
import sqlalchemy as sa


revision = "b3c4d5e6f7a8"
down_revision = "e2f3g4h5i6j7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "insumos_laboratorio",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("laboratorio_id", sa.Integer(), sa.ForeignKey("laboratorios.id"), nullable=False),
        sa.Column("nombre", sa.String(length=180), nullable=False),
        sa.Column("categoria", sa.String(length=40), nullable=False, server_default="CONSUMIBLE"),
        sa.Column("unidad", sa.String(length=30), nullable=False, server_default="PIEZA"),
        sa.Column("cantidad_disponible", sa.Float(), nullable=False, server_default="0"),
        sa.Column("stock_minimo", sa.Float(), nullable=False, server_default="0"),
        sa.Column("codigo_cas", sa.String(length=40), nullable=True),
        sa.Column("lote", sa.String(length=100), nullable=True),
        sa.Column("caduca_en", sa.Date(), nullable=True),
        sa.Column("ubicacion_almacen", sa.String(length=160), nullable=True),
        sa.Column("ficha_seguridad_url", sa.String(length=500), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_insumos_laboratorio_laboratorio_id", "insumos_laboratorio", ["laboratorio_id"])
    op.create_table(
        "plantillas_practica_laboratorio",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("laboratorio_id", sa.Integer(), sa.ForeignKey("laboratorios.id"), nullable=False),
        sa.Column("materia", sa.String(length=120), nullable=True),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("objetivo", sa.Text(), nullable=True),
        sa.Column("procedimiento", sa.Text(), nullable=True),
        sa.Column("notas_seguridad", sa.Text(), nullable=True),
        sa.Column("creada_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creada_en", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_plantillas_practica_laboratorio_laboratorio_id", "plantillas_practica_laboratorio", ["laboratorio_id"])
    op.create_table(
        "materiales_plantilla_practica",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plantilla_id", sa.Integer(), sa.ForeignKey("plantillas_practica_laboratorio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("insumo_id", sa.Integer(), sa.ForeignKey("insumos_laboratorio.id"), nullable=True),
        sa.Column("descripcion", sa.String(length=180), nullable=False),
        sa.Column("cantidad_base", sa.Float(), nullable=False),
        sa.Column("unidad", sa.String(length=30), nullable=False, server_default="PIEZA"),
    )
    op.create_index("ix_materiales_plantilla_practica_plantilla_id", "materiales_plantilla_practica", ["plantilla_id"])
    op.create_table(
        "practicas_laboratorio",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reservacion_id", sa.Integer(), sa.ForeignKey("reservaciones.id"), nullable=False),
        sa.Column("fecha_sesion", sa.Date(), nullable=False),
        sa.Column("plantilla_id", sa.Integer(), sa.ForeignKey("plantillas_practica_laboratorio.id"), nullable=True),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("objetivo", sa.Text(), nullable=True),
        sa.Column("procedimiento", sa.Text(), nullable=True),
        sa.Column("notas_seguridad", sa.Text(), nullable=True),
        sa.Column("estado", sa.String(length=24), nullable=False, server_default="SOLICITADA"),
        sa.Column("resultados", sa.Text(), nullable=True),
        sa.Column("conclusiones", sa.Text(), nullable=True),
        sa.Column("observaciones_docente", sa.Text(), nullable=True),
        sa.Column("iniciada_en", sa.DateTime(), nullable=True),
        sa.Column("cerrada_en", sa.DateTime(), nullable=True),
        sa.Column("creada_en", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("reservacion_id", "fecha_sesion", name="uq_practica_reservacion_fecha"),
    )
    op.create_index("ix_practicas_laboratorio_reservacion_id", "practicas_laboratorio", ["reservacion_id"])
    op.create_index("ix_practicas_laboratorio_fecha_sesion", "practicas_laboratorio", ["fecha_sesion"])
    op.create_table(
        "movimientos_insumo_laboratorio",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("insumo_id", sa.Integer(), sa.ForeignKey("insumos_laboratorio.id"), nullable=False),
        sa.Column("practica_id", sa.Integer(), sa.ForeignKey("practicas_laboratorio.id"), nullable=True),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("cantidad", sa.Float(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("observaciones", sa.Text(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_movimientos_insumo_laboratorio_insumo_id", "movimientos_insumo_laboratorio", ["insumo_id"])
    op.create_index("ix_movimientos_insumo_laboratorio_practica_id", "movimientos_insumo_laboratorio", ["practica_id"])
    op.create_table(
        "materiales_practica",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("practica_id", sa.Integer(), sa.ForeignKey("practicas_laboratorio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activo_id", sa.Integer(), sa.ForeignKey("activos.id"), nullable=True),
        sa.Column("insumo_id", sa.Integer(), sa.ForeignKey("insumos_laboratorio.id"), nullable=True),
        sa.Column("descripcion", sa.String(length=180), nullable=False),
        sa.Column("cantidad_solicitada", sa.Float(), nullable=False),
        sa.Column("cantidad_entregada", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cantidad_consumida", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cantidad_merma", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cantidad_devuelta", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unidad", sa.String(length=30), nullable=False, server_default="PIEZA"),
        sa.Column("nota", sa.Text(), nullable=True),
    )
    op.create_index("ix_materiales_practica_practica_id", "materiales_practica", ["practica_id"])
    op.create_table(
        "asistencias_practica",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("practica_id", sa.Integer(), sa.ForeignKey("practicas_laboratorio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alumno_id", sa.Integer(), sa.ForeignKey("catalogo_alumnos.id"), nullable=False),
        sa.Column("matricula", sa.String(length=40), nullable=False),
        sa.Column("alumno_nombre", sa.String(length=180), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="PRESENTE"),
        sa.Column("observacion", sa.String(length=300), nullable=True),
        sa.Column("registrado_en", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("practica_id", "alumno_id", name="uq_asistencia_practica_alumno"),
    )
    op.create_index("ix_asistencias_practica_practica_id", "asistencias_practica", ["practica_id"])
    op.create_table(
        "incidentes_practica",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("practica_id", sa.Integer(), sa.ForeignKey("practicas_laboratorio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reportado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("tipo", sa.String(length=30), nullable=False),
        sa.Column("severidad", sa.String(length=20), nullable=False, server_default="BAJA"),
        sa.Column("estado", sa.String(length=24), nullable=False, server_default="REPORTADO"),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column("acciones", sa.Text(), nullable=True),
        sa.Column("requiere_seguimiento", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_incidentes_practica_practica_id", "incidentes_practica", ["practica_id"])
    op.create_table(
        "residuos_practica",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("practica_id", sa.Integer(), sa.ForeignKey("practicas_laboratorio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reportado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("descripcion", sa.String(length=300), nullable=False),
        sa.Column("clasificacion", sa.String(length=30), nullable=False),
        sa.Column("cantidad", sa.Float(), nullable=False),
        sa.Column("unidad", sa.String(length=30), nullable=False),
        sa.Column("destino", sa.Text(), nullable=True),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_residuos_practica_practica_id", "residuos_practica", ["practica_id"])


def downgrade():
    op.drop_table("residuos_practica")
    op.drop_table("incidentes_practica")
    op.drop_table("asistencias_practica")
    op.drop_table("materiales_practica")
    op.drop_table("movimientos_insumo_laboratorio")
    op.drop_table("practicas_laboratorio")
    op.drop_table("materiales_plantilla_practica")
    op.drop_table("plantillas_practica_laboratorio")
    op.drop_table("insumos_laboratorio")
