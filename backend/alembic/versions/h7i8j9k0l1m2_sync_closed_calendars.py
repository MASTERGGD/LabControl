"""Archive calendars belonging to already closed academic terms."""
from alembic import op
import sqlalchemy as sa
import datetime

revision = "h7i8j9k0l1m2"
down_revision = "g6h7i8j9k0l1"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    metadata = sa.MetaData()
    calendars = sa.Table("calendarios_academicos", metadata, autoload_with=connection)
    closures = sa.Table("cierres_academicos_periodo", metadata, autoload_with=connection)
    history = sa.Table("historial_calendario_academico", metadata, autoload_with=connection)
    rows = connection.execute(sa.select(
        calendars.c.id, calendars.c.estado, calendars.c.version,
        closures.c.cerrado_en, closures.c.cerrado_por_id, closures.c.configurado_por_id,
    ).join(closures, calendars.c.periodo_id == closures.c.periodo_id).where(
        closures.c.estado == "CERRADO", calendars.c.estado != "CERRADO",
    )).mappings().all()
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    for row in rows:
        connection.execute(calendars.update().where(calendars.c.id == row["id"]).values(
            estado="CERRADO", version=row["version"] + 1,
            cerrado_en=row["cerrado_en"] or now, actualizado_en=now,
        ))
        connection.execute(history.insert().values(
            calendario_id=row["id"], accion="SINCRONIZAR_CIERRE",
            motivo="Sincronización automática con el cierre académico previamente autorizado",
            datos_anteriores={"estado": row["estado"]}, datos_nuevos={"estado": "CERRADO"},
            usuario_id=row["cerrado_por_id"] or row["configurado_por_id"], creado_en=now,
        ))


def downgrade():
    # A rollback of application code must never reopen an academically closed term.
    pass
