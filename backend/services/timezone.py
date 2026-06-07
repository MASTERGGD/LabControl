from __future__ import annotations

import datetime
from zoneinfo import ZoneInfo

MEXICO_TZ = ZoneInfo("America/Mexico_City")
UTC = datetime.timezone.utc

_MESES_ES = (
    "",
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


def now_mx() -> datetime.datetime:
    return datetime.datetime.now(MEXICO_TZ)


def today_mx() -> datetime.date:
    return now_mx().date()


def as_mx(value: datetime.datetime | datetime.date | None) -> datetime.datetime | datetime.date | None:
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(MEXICO_TZ)
    return value


def format_fecha_larga_mx(value: datetime.datetime | datetime.date | None) -> str:
    local = as_mx(value)
    if not local:
        return "—"
    return f"{local.day:02d} de {_MESES_ES[local.month]} de {local.year}"


def format_fecha_corta_mx(value: datetime.datetime | datetime.date | None) -> str:
    local = as_mx(value)
    if not local:
        return "—"
    return f"{local.day:02d}/{local.month:02d}/{local.year}"
