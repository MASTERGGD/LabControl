"""Reinicio controlado de datos academicos de la etapa piloto de SIGA.

El comando es deliberadamente seguro:
  * sin argumentos solo muestra el alcance (dry-run);
  * antes de modificar PostgreSQL crea un respaldo TERM verificado;
  * exige una frase de confirmacion exacta;
  * conserva usuarios, periodos, calendario oficial, inventario, espacios,
    laboratorios, auditoria, expedientes medicos y adeudos.

Uso en el contenedor de produccion:
  python tools/reset_academic_pilot.py
  python tools/reset_academic_pilot.py --execute --confirm REINICIAR-ACADEMICO
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

from sqlalchemy import func, inspect, text


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import models  # noqa: E402,F401  Carga toda la metadata declarativa.
from database import Base, SessionLocal, engine  # noqa: E402
from services.system_backup import create_backup  # noqa: E402


CONFIRMATION = "REINICIAR-ACADEMICO"

# Raices que pertenecen a la carga piloto. Sus tablas dependientes se calculan
# desde las FK para no olvidar datos agregados por migraciones posteriores.
RESET_ROOTS = {
    "catalogo_alumnos",
    "catalogo_materias",
    "catalogo_carreras",
    "grupos_academicos",
    "grupos_tutorados",
    "cargas_docentes",
    "reservaciones",
    "sesiones_clase",
}

# Estos expedientes se conservan. Antes del TRUNCATE se rompe solamente su FK
# nullable hacia el dato academico que va a desaparecer.
PRESERVED_BOUNDARIES = {"pacientes", "adeudos"}
DETACH_SQL = (
    "UPDATE pacientes SET alumno_id = NULL WHERE alumno_id IS NOT NULL",
    "UPDATE adeudos SET sesion_id = NULL WHERE sesion_id IS NOT NULL",
)


def _existing_tables() -> set[str]:
    return set(inspect(engine).get_table_names())


def _reset_tables(existing: set[str]) -> set[str]:
    selected = RESET_ROOTS & existing
    queue = deque(selected)
    while queue:
        parent = queue.popleft()
        for table in Base.metadata.tables.values():
            if table.name not in existing or table.name in selected:
                continue
            if table.name in PRESERVED_BOUNDARIES:
                continue
            if any(fk.column.table.name == parent for fk in table.foreign_keys):
                selected.add(table.name)
                queue.append(table.name)
    return selected


def _unsafe_external_references(selected: set[str], existing: set[str]) -> list[str]:
    allowed = {("pacientes", "alumno_id"), ("adeudos", "sesion_id")}
    problems: list[str] = []
    for table in Base.metadata.tables.values():
        if table.name not in existing or table.name in selected:
            continue
        for fk in table.foreign_keys:
            if fk.column.table.name not in selected:
                continue
            if (table.name, fk.parent.name) not in allowed:
                problems.append(
                    f"{table.name}.{fk.parent.name} -> "
                    f"{fk.column.table.name}.{fk.column.name}"
                )
    return sorted(problems)


def _counts(db, tables: set[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for name in sorted(tables):
        table = Base.metadata.tables[name]
        result[name] = int(db.execute(func.count().select().select_from(table)).scalar_one())
    return result


def _delete_order(selected: set[str]) -> list[str]:
    """Ordena hijas antes que padres para respetar las FK sin usar CASCADE."""
    ordered = [
        table.name
        for table in reversed(Base.metadata.sorted_tables)
        if table.name in selected
    ]
    missing = selected - set(ordered)
    if missing:
        raise RuntimeError(f"No se pudo ordenar el borrado de: {sorted(missing)}")
    return ordered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Ejecuta el reinicio")
    parser.add_argument("--confirm", default="", help="Frase de confirmacion")
    args = parser.parse_args()

    existing = _existing_tables()
    selected = _reset_tables(existing)
    missing = sorted(RESET_ROOTS - existing)
    unsafe = _unsafe_external_references(selected, existing)

    db = SessionLocal()
    try:
        before = _counts(db, selected)
    finally:
        db.close()

    report = {
        "mode": "execute" if args.execute else "dry-run",
        "database": engine.dialect.name,
        "tables": before,
        "total_rows": sum(before.values()),
        "preserved": sorted(PRESERVED_BOUNDARIES),
        "missing_roots": missing,
        "unsafe_external_references": unsafe,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if unsafe:
        print("ABORTADO: existen referencias externas no contempladas.", file=sys.stderr)
        return 2
    if not args.execute:
        print(f"Simulacion terminada. Para ejecutar usa --execute --confirm {CONFIRMATION}")
        return 0
    if args.confirm != CONFIRMATION:
        print("ABORTADO: frase de confirmacion incorrecta.", file=sys.stderr)
        return 2
    if engine.dialect.name != "postgresql":
        print("ABORTADO: el reinicio real solo esta habilitado para PostgreSQL.", file=sys.stderr)
        return 2

    backup = create_backup("TERM", source="ACADEMIC_RESET")
    print(json.dumps({"backup_verified": backup}, ensure_ascii=False, default=str, indent=2))

    db = SessionLocal()
    try:
        with db.begin():
            for statement in DETACH_SQL:
                db.execute(text(statement))
            # TRUNCATE comprueba las FK a nivel de esquema y rechaza incluso
            # una referencia nullable ya desligada (pacientes/adeudos). DELETE
            # sí respeta el NULL aplicado arriba y permite preservar esas tablas.
            for name in _delete_order(selected):
                db.execute(Base.metadata.tables[name].delete())
        after = _counts(db, selected)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    if any(after.values()):
        raise RuntimeError(f"Validacion fallida: quedaron filas despues del reinicio: {after}")
    print(json.dumps({"ok": True, "deleted_rows": sum(before.values()), "after": after}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
