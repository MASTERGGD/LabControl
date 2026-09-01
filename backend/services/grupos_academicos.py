import re


BLOQUES = ("ENE", "MAY", "SEP")


def generacion_grupo(grupo) -> str:
    """Devuelve una cohorte estable incluso para grupos creados antes de la migración."""
    if getattr(grupo, "generacion", None):
        return grupo.generacion
    periodo = getattr(getattr(grupo, "periodo", None), "clave", "") or ""
    carrera = getattr(grupo, "carrera_catalogo", None)
    prefijo = getattr(carrera, "clave", None) or _siglas(getattr(grupo, "carrera", ""))
    return calcular_generacion(prefijo, periodo, getattr(grupo, "cuatrimestre", 1))


def calcular_generacion(prefijo: str, periodo: str, cuatrimestre: int = 1) -> str:
    match = re.search(r"(ENE|MAY|SEP)[- ]?(?:ABR|AGO|DIC)\s*[- ]?\s*(\d{4})", (periodo or "").upper())
    prefijo = re.sub(r"[^A-Z0-9]", "", (prefijo or "GEN").upper())[:12] or "GEN"
    if not match:
        return prefijo
    bloque = BLOQUES.index(match.group(1))
    indice = int(match.group(2)) * 3 + bloque - max(int(cuatrimestre or 1) - 1, 0)
    anio, bloque_ingreso = divmod(indice, 3)
    return f"{prefijo}-{BLOQUES[bloque_ingreso]}{anio}"


def _siglas(nombre: str) -> str:
    omitidas = {"EN", "DE", "DEL", "LA", "EL", "Y", "E"}
    palabras = re.findall(r"[A-Z0-9]+", (nombre or "").upper())
    siglas = "".join(p if len(p) <= 4 else p[0] for p in palabras if p not in omitidas)
    return siglas[:12] or "GEN"
