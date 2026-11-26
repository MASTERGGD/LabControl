import re

from fastapi import HTTPException

from models.catalogo import PeriodoEscolar
from models.cierre_academico import CierreAcademicoPeriodo


def exigir_cierre_periodo(db, periodo):
    if not db.query(CierreAcademicoPeriodo.id).filter_by(periodo_id=periodo.id, estado="CERRADO").first():
        raise HTTPException(409, f"División de Carrera debe cerrar definitivamente {periodo.clave} antes de continuar")


def exigir_cierre_anterior(db, clave, *, exigir_anterior=False):
    normalizada = "".join(ch for ch in clave.upper() if ch.isalnum())
    bloque = re.fullmatch(r"(ENEABR|MAYAGO|SEPDIC)([0-9]{4})", normalizada)
    if not bloque:
        return
    actual, year = bloque.groups()
    prev, year = {
        "ENEABR": ("SEP-DIC", int(year) - 1),
        "MAYAGO": ("ENE-ABR", int(year)),
        "SEPDIC": ("MAY-AGO", int(year)),
    }[actual]
    anterior = f"{prev} {year:04d}"
    clave_anterior = anterior.replace("-", "").replace(" ", "")
    periodos = db.query(PeriodoEscolar).all()
    origen = next((
        periodo for periodo in periodos
        if "".join(ch for ch in periodo.clave.upper() if ch.isalnum()) == clave_anterior
    ), None)
    if origen:
        exigir_cierre_periodo(db, origen)
    elif exigir_anterior and periodos:
        raise HTTPException(409, f"Debe existir y estar cerrado el periodo anterior ({anterior})")
