"""Vinculación de Tutoría con los grupos e inscripciones académicas oficiales."""
import datetime

from sqlalchemy.orm import Session

from models.catalogo import GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.tutoria import AsignacionTutoria, GrupoTutorado


def _norm(value) -> str:
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def _orden_periodo(clave):
    limpio = _norm(clave)
    for prefijo, bloque in (("ENEABR", 1), ("MAYAGO", 2), ("SEPDIC", 3)):
        resto = limpio.removeprefix(prefijo)
        if limpio.startswith(prefijo) and resto.isdigit():
            return int(resto), bloque
    return None


def sincronizar_grupos_tutoria(db: Session) -> list[GrupoTutorado]:
    """Crea la ficha tutorial de cada grupo académico y refleja sus inscripciones."""
    academicos = (
        db.query(GrupoAcademico, PeriodoEscolar)
        .join(PeriodoEscolar, PeriodoEscolar.id == GrupoAcademico.periodo_id)
        .filter(GrupoAcademico.activo == True, PeriodoEscolar.activo == True)
        .all()
    )
    actual = next((periodo for _, periodo in academicos if periodo.es_actual), None)
    orden_actual = _orden_periodo(actual.clave) if actual else None
    for academico, periodo in academicos:
        grupo = db.query(GrupoTutorado).filter(
            GrupoTutorado.grupo_academico_id == academico.id
        ).first()
        if not grupo:
            candidatos = db.query(GrupoTutorado).filter(
                GrupoTutorado.grupo_academico_id.is_(None),
                GrupoTutorado.cuatrimestre == academico.cuatrimestre,
            ).all()
            grupo = next((g for g in candidatos if
                _norm(g.periodo) == _norm(periodo.clave)
                and _norm(g.carrera) == _norm(academico.carrera)
                and _norm(g.grupo) == _norm(academico.grupo)), None)
        estaba_archivado = bool(grupo and grupo.estado == "ARCHIVADO")
        if grupo:
            grupo.grupo_academico_id = academico.id
            grupo.carrera = academico.carrera
            grupo.cuatrimestre = academico.cuatrimestre
            grupo.grupo = academico.grupo
            grupo.periodo = periodo.clave
        else:
            grupo = GrupoTutorado(
                grupo_academico_id=academico.id, tutor_id=None,
                carrera=academico.carrera, cuatrimestre=academico.cuatrimestre,
                grupo=academico.grupo, periodo=periodo.clave, activo=True,
                creado_en=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
            )
            db.add(grupo)
            db.flush()

        inscripciones = db.query(InscripcionAlumno).filter(
            InscripcionAlumno.grupo_academico_id == academico.id,
            InscripcionAlumno.estado == "ACTIVO",
        ).all()
        alumnos_activos = {i.alumno_id for i in inscripciones}
        orden = _orden_periodo(periodo.clave)
        if not alumnos_activos:
            # Un grupo oficial vacio sigue visible para que Tutoria pueda
            # archivarlo. Si ya fue archivado, no debe reaparecer en cada sync.
            grupo.estado = "ARCHIVADO" if estaba_archivado else "NO_VINCULADO"
            grupo.activo = not estaba_archivado
        elif periodo.es_actual:
            grupo.estado, grupo.activo = "ACTIVO", True
            grupo.cerrado_en = None
        elif orden and orden_actual and orden < orden_actual:
            grupo.estado, grupo.activo = "CERRADO", False
            grupo.cerrado_en = grupo.cerrado_en or datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        else:
            grupo.estado, grupo.activo = "PREPARACION", True
            grupo.cerrado_en = None

        asignaciones = db.query(AsignacionTutoria).filter(
            AsignacionTutoria.grupo_tutorado_id == grupo.id
        ).all()
        por_alumno = {a.alumno_id: a for a in asignaciones}
        for alumno_id in alumnos_activos:
            if alumno_id in por_alumno:
                por_alumno[alumno_id].activo = True
            else:
                db.add(AsignacionTutoria(
                    grupo_tutorado_id=grupo.id, alumno_id=alumno_id, activo=True,
                    asignado_en=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
                ))
        for asignacion in asignaciones:
            if asignacion.alumno_id not in alumnos_activos:
                asignacion.activo = False
    for grupo in db.query(GrupoTutorado).filter(
        GrupoTutorado.grupo_academico_id.is_(None), GrupoTutorado.activo == True,
    ).all():
        grupo.estado = "NO_VINCULADO"
    db.flush()
    return db.query(GrupoTutorado).all()


def grupo_tutoria_para_academico(db: Session, grupo_academico_id: int | None):
    if not grupo_academico_id:
        return None
    sincronizar_grupos_tutoria(db)
    return db.query(GrupoTutorado).filter(
        GrupoTutorado.grupo_academico_id == grupo_academico_id,
        GrupoTutorado.activo == True,
    ).first()
