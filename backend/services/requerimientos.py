"""Operaciones de ciclo de vida para requerimientos ligados a reservaciones."""

import datetime
import json

from models.horario import RequerimientoClase


ESTADO_REQUERIMIENTO_CANCELADO = "CANCELADO_RESERVACION"
MOTIVO_CANCELACION_RESERVACION = "La reservación fue cancelada; los recursos pendientes ya no se atenderán."


def cancelar_requerimientos_pendientes(db, reservacion_id: int, usuario_id: int | None = None) -> int:
    """Cierra los recursos aún pendientes y conserva el requerimiento en historial."""
    requerimientos = db.query(RequerimientoClase).filter(
        RequerimientoClase.reservacion_id == reservacion_id,
    ).all()
    ahora = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

    for requerimiento in requerimientos:
        try:
            items_estado = json.loads(requerimiento.items_estado) if requerimiento.items_estado else []
        except (TypeError, ValueError):
            items_estado = []
        tiene_pendientes = requerimiento.estado in {"PENDIENTE", "RESUELTO_PARCIAL"} or any(
            isinstance(item, dict) and item.get("estado", "PENDIENTE") == "PENDIENTE"
            for item in items_estado
        )
        if not tiene_pendientes:
            continue
        requerimiento.items_estado = json.dumps([
            {
                **item,
                "estado": ESTADO_REQUERIMIENTO_CANCELADO,
                "nota_admin": MOTIVO_CANCELACION_RESERVACION,
            } if isinstance(item, dict) and item.get("estado", "PENDIENTE") == "PENDIENTE" else item
            for item in items_estado
        ], ensure_ascii=False)
        requerimiento.estado = ESTADO_REQUERIMIENTO_CANCELADO
        requerimiento.nota_admin = MOTIVO_CANCELACION_RESERVACION
        requerimiento.resuelto_en = ahora
        if usuario_id is not None:
            requerimiento.resuelto_por_id = usuario_id

    return len(requerimientos)
