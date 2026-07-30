"""Expediente Académico Integral — consolidación institucional del alumno."""
import datetime
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.catalogo import CatalogoAlumno, GrupoAcademico, InscripcionAlumno
from models.docencia import (
    AsistenciaDocente, CargaDocente, ClaseDocente, SeguimientoAlumnoDocente,
)
from models.tutoria import (
    AsignacionTutoria, Canalizacion, GrupoTutorado, RegistroSesionAlumno,
    ReporteTutor, SesionTutoria,
)
from models.usuario import RolUsuario, Usuario
from services.user_permissions import (
    puede_gestionar_materias, puede_gestionar_servicios_escolares,
)


router = APIRouter(prefix="/expediente-academico", tags=["Expediente Académico"])
ESTADOS_ASISTENCIA = ("PRESENTE", "FALTA", "RETARDO", "JUSTIFICADA")
ESTADOS_ABIERTOS = {"PENDIENTE", "ENVIADO", "RECIBIDO", "EN_SEGUIMIENTO", "SIN_TUTOR"}


def _nombre_alumno(alumno: CatalogoAlumno) -> str:
    return " ".join(filter(None, [
        alumno.apellido_paterno, alumno.apellido_materno, alumno.nombres,
    ])).strip()


def _acceso_institucional(db: Session, usuario: Usuario) -> bool:
    return (
        usuario.rol in {RolUsuario.SUPER_ADMIN, RolUsuario.TUTORIA_ADMIN}
        or puede_gestionar_servicios_escolares(db, usuario)
        or puede_gestionar_materias(db, usuario)
    )


def _ids_alumnos_accesibles(db: Session, usuario: Usuario):
    """Subconsulta práctica de IDs visibles para docentes, tutores y alumnos."""
    if _acceso_institucional(db, usuario):
        return None
    if usuario.rol == RolUsuario.ALUMNO:
        return {
            row[0] for row in db.query(CatalogoAlumno.id).filter(
                CatalogoAlumno.usuario_id == usuario.id
            ).all()
        }
    if usuario.rol == RolUsuario.DOCENTE:
        impartidos = {
            row[0] for row in (
                db.query(InscripcionAlumno.alumno_id)
                .join(GrupoAcademico, GrupoAcademico.id == InscripcionAlumno.grupo_academico_id)
                .join(CargaDocente, CargaDocente.grupo_academico_id == GrupoAcademico.id)
                .filter(
                    CargaDocente.docente_id == usuario.id,
                    CargaDocente.activo == True,
                    InscripcionAlumno.estado == "ACTIVO",
                ).distinct().all()
            )
        }
        tutorados = {
            row[0] for row in (
                db.query(AsignacionTutoria.alumno_id)
                .join(GrupoTutorado, GrupoTutorado.id == AsignacionTutoria.grupo_tutorado_id)
                .filter(
                    GrupoTutorado.tutor_id == usuario.id,
                    GrupoTutorado.activo == True,
                    AsignacionTutoria.activo == True,
                ).distinct().all()
            )
        }
        return impartidos | tutorados
    return set()


def _obtener_alumno_autorizado(db: Session, alumno_id: int, usuario: Usuario) -> CatalogoAlumno:
    alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == alumno_id).first()
    if not alumno:
        raise HTTPException(404, "Alumno no encontrado")
    ids = _ids_alumnos_accesibles(db, usuario)
    if ids is not None and alumno.id not in ids:
        raise HTTPException(403, "No tienes acceso al expediente de este alumno")
    return alumno


def _grupo_y_cargas(db: Session, alumno: CatalogoAlumno):
    inscripcion = (
        db.query(InscripcionAlumno)
        .join(GrupoAcademico, GrupoAcademico.id == InscripcionAlumno.grupo_academico_id)
        .filter(
            InscripcionAlumno.alumno_id == alumno.id,
            InscripcionAlumno.estado == "ACTIVO",
        )
        .order_by(InscripcionAlumno.inscrito_en.desc())
        .first()
    )
    grupo = (
        db.query(GrupoAcademico).filter(GrupoAcademico.id == inscripcion.grupo_academico_id).first()
        if inscripcion else None
    )
    cargas = (
        db.query(CargaDocente).filter(
            CargaDocente.grupo_academico_id == grupo.id,
            CargaDocente.activo == True,
            CargaDocente.tipo_actividad == "CLASE",
        ).order_by(CargaDocente.actividad_nombre, CargaDocente.dia_semana).all()
        if grupo else []
    )
    return grupo, cargas


def _agrupar_materias(db: Session, alumno: CatalogoAlumno, cargas: list[CargaDocente]):
    grupos = {}
    for carga in cargas:
        clave = (
            f"materia:{carga.materia_id}" if carga.materia_id
            else f"actividad:{carga.actividad_nombre.strip().upper()}:{carga.docente_id}"
        )
        if clave not in grupos:
            docente = db.query(Usuario).filter(Usuario.id == carga.docente_id).first()
            grupos[clave] = {
                "clave": clave,
                "materia_id": carga.materia_id,
                "materia": carga.actividad_nombre,
                "docente_id": carga.docente_id,
                "docente": docente.nombre if docente else None,
                "carga_ids": [],
                "horarios": [],
            }
        grupos[clave]["carga_ids"].append(carga.id)
        grupos[clave]["horarios"].append({
            "dia_semana": carga.dia_semana,
            "hora_inicio": carga.hora_inicio,
            "hora_fin": carga.hora_fin,
        })

    materias = []
    for item in grupos.values():
        carga_ids = item["carga_ids"]
        clases = db.query(ClaseDocente).filter(ClaseDocente.carga_docente_id.in_(carga_ids)).all()
        clase_ids = [c.id for c in clases]
        asistencias = (
            db.query(AsistenciaDocente).filter(
                AsistenciaDocente.clase_docente_id.in_(clase_ids),
                AsistenciaDocente.alumno_id == alumno.id,
            ).all() if clase_ids else []
        )
        conteos = {estado.lower(): 0 for estado in ESTADOS_ASISTENCIA}
        for asistencia in asistencias:
            if asistencia.estado in ESTADOS_ASISTENCIA:
                conteos[asistencia.estado.lower()] += 1
        total = len(asistencias)
        asistio = conteos["presente"] + conteos["retardo"] + conteos["justificada"]
        porcentaje = round(asistio * 100 / total, 1) if total else None

        registros = db.query(SeguimientoAlumnoDocente).filter(
            SeguimientoAlumnoDocente.carga_docente_id.in_(carga_ids),
            SeguimientoAlumnoDocente.alumno_id == alumno.id,
        ).order_by(SeguimientoAlumnoDocente.creado_en.desc()).all()
        calificaciones = [r for r in registros if r.tipo == "CALIFICACION" and r.calificacion is not None]
        promedio = (
            round(sum(r.calificacion for r in calificaciones) / len(calificaciones), 1)
            if calificaciones else None
        )
        acuerdos = [r for r in registros if r.tipo == "ACUERDO"]
        estado = "SIN_DATOS"
        if (porcentaje is not None and porcentaje < 80) or (promedio is not None and promedio < 7):
            estado = "RIESGO_ALTO"
        elif (porcentaje is not None and porcentaje < 90) or (promedio is not None and promedio < 8):
            estado = "RIESGO_MEDIO"
        elif porcentaje is not None or promedio is not None:
            estado = "REGULAR"

        materias.append({
            **item,
            "clases_registradas": len(clases),
            "asistencias_registradas": total,
            **conteos,
            "porcentaje_asistencia": porcentaje,
            "promedio_evidencias": promedio,
            "evaluaciones_registradas": len(calificaciones),
            "acuerdos_pendientes": sum(1 for r in acuerdos if r.estado == "PENDIENTE"),
            "estado": estado,
            "evaluaciones": [{
                "id": r.id, "titulo": r.titulo, "detalle": r.detalle,
                "calificacion": r.calificacion, "fecha": r.creado_en.isoformat(),
            } for r in calificaciones],
        })
    return materias


def _semaforo(materias, acuerdos, reportes):
    razones = []
    asistencia_global = None
    total_regs = sum(m["asistencias_registradas"] for m in materias)
    total_asistio = sum(
        m["presente"] + m["retardo"] + m["justificada"] for m in materias
    )
    if total_regs:
        asistencia_global = round(total_asistio * 100 / total_regs, 1)
    riesgos_altos = sum(1 for m in materias if m["estado"] == "RIESGO_ALTO")
    riesgos_medios = sum(1 for m in materias if m["estado"] == "RIESGO_MEDIO")
    acuerdos_vencidos = sum(
        1 for a in acuerdos
        if a.estado == "PENDIENTE" and a.fecha_revision and a.fecha_revision < datetime.date.today()
    )
    reportes_abiertos = sum(1 for r in reportes if r.estado in ESTADOS_ABIERTOS)
    reportes_altos = sum(
        1 for r in reportes if r.estado in ESTADOS_ABIERTOS and r.prioridad == "ALTA"
    )

    if asistencia_global is not None and asistencia_global < 80:
        razones.append(f"Asistencia global crítica de {asistencia_global}%")
    if riesgos_altos:
        razones.append(f"{riesgos_altos} materia(s) en riesgo alto")
    if acuerdos_vencidos:
        razones.append(f"{acuerdos_vencidos} acuerdo(s) vencido(s)")
    if reportes_altos:
        razones.append(f"{reportes_altos} reporte(s) de prioridad alta abierto(s)")

    if riesgos_altos >= 2 or reportes_altos or (asistencia_global is not None and asistencia_global < 80):
        nivel = "ROJO"
    elif riesgos_altos or riesgos_medios or acuerdos_vencidos or reportes_abiertos or (
        asistencia_global is not None and asistencia_global < 90
    ):
        nivel = "AMARILLO"
        if not razones:
            razones.append("Existen indicadores académicos que requieren observación")
    elif total_regs == 0 and not any(m["evaluaciones_registradas"] for m in materias):
        nivel = "GRIS"
        razones.append("Todavía no hay información académica suficiente")
    else:
        nivel = "VERDE"
        razones.append("Sin indicadores críticos en los registros disponibles")
    return nivel, razones, asistencia_global


@router.get("/alumnos", summary="Buscar alumnos accesibles para expediente")
def buscar_alumnos(
    q: str = Query(default="", max_length=100),
    carrera: Optional[str] = None,
    grupo: Optional[str] = None,
    periodo: Optional[str] = None,
    limite: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    consulta = db.query(CatalogoAlumno).filter(CatalogoAlumno.activo == True)
    ids = _ids_alumnos_accesibles(db, current_user)
    if ids is not None:
        if not ids:
            return []
        consulta = consulta.filter(CatalogoAlumno.id.in_(ids))
    termino = q.strip()
    if termino:
        patron = f"%{termino}%"
        consulta = consulta.filter(or_(
            CatalogoAlumno.matricula.ilike(patron),
            CatalogoAlumno.nombres.ilike(patron),
            CatalogoAlumno.apellido_paterno.ilike(patron),
            CatalogoAlumno.apellido_materno.ilike(patron),
        ))
    if carrera:
        consulta = consulta.filter(CatalogoAlumno.carrera == carrera)
    if grupo:
        consulta = consulta.filter(CatalogoAlumno.grupo == grupo)
    if periodo:
        consulta = consulta.filter(CatalogoAlumno.periodo == periodo)
    alumnos = consulta.order_by(
        CatalogoAlumno.apellido_paterno, CatalogoAlumno.apellido_materno,
        CatalogoAlumno.nombres,
    ).limit(limite).all()
    return [{
        "id": a.id, "matricula": a.matricula, "nombre": _nombre_alumno(a),
        "carrera": a.carrera, "cuatrimestre": a.cuatrimestre,
        "grupo": a.grupo, "periodo": a.periodo,
    } for a in alumnos]


@router.get("/alumnos/{alumno_id}", summary="Expediente académico integral del alumno")
def expediente_alumno(
    alumno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    alumno = _obtener_alumno_autorizado(db, alumno_id, current_user)
    grupo, cargas = _grupo_y_cargas(db, alumno)
    materias = _agrupar_materias(db, alumno, cargas)

    acuerdos = db.query(SeguimientoAlumnoDocente).filter(
        SeguimientoAlumnoDocente.alumno_id == alumno.id,
        SeguimientoAlumnoDocente.tipo == "ACUERDO",
    ).order_by(SeguimientoAlumnoDocente.creado_en.desc()).all()
    reportes = db.query(ReporteTutor).filter(
        ReporteTutor.alumno_id == alumno.id
    ).order_by(ReporteTutor.creado_en.desc()).all()
    canalizaciones = db.query(Canalizacion).filter(
        Canalizacion.alumno_id == alumno.id
    ).order_by(Canalizacion.fecha_solicitud.desc()).all()

    asignacion = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.alumno_id == alumno.id,
        AsignacionTutoria.activo == True,
    ).order_by(AsignacionTutoria.asignado_en.desc()).first()
    grupo_tutorado = (
        db.query(GrupoTutorado).filter(GrupoTutorado.id == asignacion.grupo_tutorado_id).first()
        if asignacion else None
    )
    tutor = (
        db.query(Usuario).filter(Usuario.id == grupo_tutorado.tutor_id).first()
        if grupo_tutorado else None
    )
    sesiones = []
    if grupo_tutorado:
        registros_sesion = (
            db.query(RegistroSesionAlumno, SesionTutoria)
            .join(SesionTutoria, SesionTutoria.id == RegistroSesionAlumno.sesion_id)
            .filter(
                RegistroSesionAlumno.alumno_id == alumno.id,
                SesionTutoria.grupo_tutorado_id == grupo_tutorado.id,
            ).order_by(SesionTutoria.fecha.desc()).all()
        )
        sesiones = [{
            "id": sesion.id, "fecha": sesion.fecha.isoformat(),
            "tipo": sesion.tipo_sesion, "asistio": registro.asistio,
            "tema": registro.tema, "comentarios": registro.comentarios,
            "requiere_canalizacion": registro.requiere_canalizacion,
        } for registro, sesion in registros_sesion]

    nivel, razones, asistencia_global = _semaforo(materias, acuerdos, reportes)
    timeline = []
    carga_materia = {
        carga.id: carga.actividad_nombre for carga in cargas
    }
    carga_ids = list(carga_materia)
    if carga_ids:
        excepciones = (
            db.query(AsistenciaDocente, ClaseDocente)
            .join(ClaseDocente, ClaseDocente.id == AsistenciaDocente.clase_docente_id)
            .filter(
                AsistenciaDocente.alumno_id == alumno.id,
                AsistenciaDocente.estado.in_(["FALTA", "RETARDO", "JUSTIFICADA"]),
                ClaseDocente.carga_docente_id.in_(carga_ids),
            ).all()
        )
        for asistencia, clase in excepciones:
            timeline.append({
                "tipo": "ASISTENCIA", "fecha": clase.fecha.isoformat(),
                "titulo": asistencia.estado.title(),
                "descripcion": carga_materia.get(clase.carga_docente_id),
                "estado": asistencia.estado,
            })
    for materia in materias:
        for evaluacion in materia["evaluaciones"]:
            timeline.append({
                "tipo": "EVALUACION", "fecha": evaluacion["fecha"],
                "titulo": f"{materia['materia']}: {evaluacion['titulo']}",
                "descripcion": f"Calificación informativa: {evaluacion['calificacion']}",
                "estado": None,
            })
    for acuerdo in acuerdos:
        timeline.append({
            "tipo": "ACUERDO", "fecha": acuerdo.creado_en.isoformat(),
            "titulo": acuerdo.titulo, "descripcion": acuerdo.detalle,
            "estado": acuerdo.estado,
        })
    for reporte in reportes:
        timeline.append({
            "tipo": "REPORTE", "fecha": reporte.creado_en.isoformat(),
            "titulo": reporte.titulo, "descripcion": reporte.detalle,
            "estado": reporte.estado,
        })
    for sesion in sesiones:
        timeline.append({
            "tipo": "TUTORIA", "fecha": sesion["fecha"],
            "titulo": f"Sesión de tutoría {sesion['tipo'].lower()}",
            "descripcion": sesion["tema"] or sesion["comentarios"],
            "estado": "ASISTIÓ" if sesion["asistio"] else "NO ASISTIÓ",
        })
    timeline.sort(key=lambda e: e["fecha"] or "", reverse=True)

    total_evaluaciones = sum(m["evaluaciones_registradas"] for m in materias)
    promedios = [m["promedio_evidencias"] for m in materias if m["promedio_evidencias"] is not None]
    return {
        "alumno": {
            "id": alumno.id, "matricula": alumno.matricula,
            "nombre": _nombre_alumno(alumno), "carrera": alumno.carrera,
            "cuatrimestre": alumno.cuatrimestre, "grupo": alumno.grupo,
            "periodo": alumno.periodo,
        },
        "grupo_academico": {
            "id": grupo.id, "carrera": grupo.carrera, "cuatrimestre": grupo.cuatrimestre,
            "grupo": grupo.grupo, "turno": grupo.turno,
        } if grupo else None,
        "tutoria": {
            "grupo_tutorado_id": grupo_tutorado.id if grupo_tutorado else None,
            "tutor_id": tutor.id if tutor else None,
            "tutor_nombre": tutor.nombre if tutor else None,
            "estado_seguimiento": asignacion.estado_seguimiento if asignacion else None,
            "sesiones": sesiones,
            "reportes": [{
                "id": r.id, "titulo": r.titulo, "categoria": r.categoria,
                "prioridad": r.prioridad, "estado": r.estado,
                "creado_en": r.creado_en.isoformat(), "resultado": r.resultado,
                "canalizacion_id": r.canalizacion_id,
            } for r in reportes],
            "canalizaciones": [{
                "id": c.id, "estado": c.estado, "motivo": c.motivo,
                "fecha_solicitud": c.fecha_solicitud.isoformat(),
                "area_atencion": c.area_atencion,
            } for c in canalizaciones],
        },
        "resumen": {
            "materias_inscritas": len(materias),
            "asistencia_global": asistencia_global,
            "promedio_evidencias": round(sum(promedios) / len(promedios), 1) if promedios else None,
            "evaluaciones_registradas": total_evaluaciones,
            "materias_riesgo": sum(1 for m in materias if m["estado"] in {"RIESGO_ALTO", "RIESGO_MEDIO"}),
            "acuerdos_pendientes": sum(1 for a in acuerdos if a.estado == "PENDIENTE"),
            "reportes_abiertos": sum(1 for r in reportes if r.estado in ESTADOS_ABIERTOS),
            "canalizaciones_activas": sum(1 for c in canalizaciones if c.estado in {"PENDIENTE", "EN_SEGUIMIENTO"}),
            "semaforo": nivel, "razones_semaforo": razones,
        },
        "materias": materias,
        "acuerdos": [{
            "id": a.id, "titulo": a.titulo, "detalle": a.detalle,
            "estado": a.estado,
            "fecha_revision": a.fecha_revision.isoformat() if a.fecha_revision else None,
            "resultado": a.resultado_atencion,
            "materia": carga_materia.get(a.carga_docente_id),
            "creado_en": a.creado_en.isoformat(),
        } for a in acuerdos],
        "timeline": timeline[:100],
        "nota_calificaciones": (
            "Las calificaciones mostradas son evidencias registradas por docentes. "
            "Todavía no representan calificaciones oficiales bimestrales."
        ),
    }
