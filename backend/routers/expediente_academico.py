"""Expediente Académico Integral — consolidación institucional del alumno."""
import datetime
from collections import defaultdict
import math
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.catalogo import CatalogoAlumno, GrupoAcademico, InscripcionAlumno
from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico
from models.docencia import (
    AsistenciaDocente, CargaDocente, ClaseDocente, SeguimientoAlumnoDocente,
)
from models.tutoria import (
    AsignacionTutoria, Canalizacion, GrupoTutorado, RegistroSesionAlumno,
    ReporteTutor, SesionTutoria,
)
from models.usuario import RolUsuario, Usuario
from models.promocion_academica import PromocionAcademicaAlumno
from services.user_permissions import (
    puede_consultar_expediente,
)
from services.tutoria_sync import sincronizar_grupos_tutoria
from services.auditoria import Accion, Recurso, registrar


router = APIRouter(prefix="/expediente-academico", tags=["Expediente Académico"])
ESTADOS_ASISTENCIA = ("PRESENTE", "FALTA", "RETARDO", "JUSTIFICADA")
ESTADOS_ABIERTOS = {"PENDIENTE", "ENVIADO", "RECIBIDO", "EN_SEGUIMIENTO", "SIN_TUTOR"}
MX_TIMEZONE = ZoneInfo("America/Mexico_City")

# Umbrales institucionales centralizados para que todas las vistas apliquen
# exactamente las mismas reglas de negocio.
UMBRAL_ASISTENCIA_RIESGO = 80.0
UMBRAL_ASISTENCIA_ATENCION = 90.0
UMBRAL_PROMEDIO_RIESGO = 7.0
UMBRAL_PROMEDIO_ATENCION = 8.0
UMBRAL_RACHA_RIESGO = 3
UMBRAL_RACHA_ATENCION = 2
UMBRAL_MATERIAS_ALTAS_ROJO = 2
MINIMO_CLASES_SEMAFORO = 3
MINIMO_REGISTROS_TENDENCIA = 5


class EliminarAcuerdoPruebaInput(BaseModel):
    motivo: str = Field(..., min_length=8, max_length=300)


def _iso_utc(fecha: datetime.datetime | None) -> str | None:
    """Los DateTime persistidos son UTC sin tzinfo; la API debe declararlos como UTC."""
    if fecha is None:
        return None
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=datetime.timezone.utc)
    return fecha.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def _fecha_hora_clase_mx(fecha: datetime.date, hora: str | None) -> str:
    """Combina la fecha académica con la hora oficial y conserva la zona de México."""
    if not hora:
        return fecha.isoformat()
    try:
        hora_local = datetime.time.fromisoformat(hora)
    except ValueError:
        return fecha.isoformat()
    return datetime.datetime.combine(fecha, hora_local, tzinfo=MX_TIMEZONE).isoformat()


def _nombre_alumno(alumno: CatalogoAlumno) -> str:
    return " ".join(filter(None, [
        alumno.apellido_paterno, alumno.apellido_materno, alumno.nombres,
    ])).strip()


def _clave_materia(carga: CargaDocente) -> str:
    return (
        f"materia:{carga.materia_id}" if carga.materia_id
        else f"actividad:{carga.actividad_nombre.strip().upper()}:{carga.docente_id}"
    )


def _estado_materia(
    porcentaje: float | None, promedio: float | None,
    clases_registradas: int = MINIMO_CLASES_SEMAFORO,
    evidencias_registradas: int = 0,
) -> str:
    if clases_registradas == 0 and evidencias_registradas == 0:
        return "SIN_DATOS"
    if clases_registradas < MINIMO_CLASES_SEMAFORO and evidencias_registradas == 0:
        return "BASE_INSUFICIENT"
    if ((porcentaje is not None and porcentaje < UMBRAL_ASISTENCIA_RIESGO)
            or (promedio is not None and promedio < UMBRAL_PROMEDIO_RIESGO)):
        return "RIESGO_ALTO"
    if ((porcentaje is not None and porcentaje < UMBRAL_ASISTENCIA_ATENCION)
            or (promedio is not None and promedio < UMBRAL_PROMEDIO_ATENCION)):
        return "RIESGO_MEDIO"
    if porcentaje is not None or promedio is not None:
        return "REGULAR"
    return "SIN_DATOS"


def _momento_clase(clase: ClaseDocente, carga: CargaDocente | None):
    hora = carga.hora_inicio if carga else None
    try:
        hora_clase = datetime.time.fromisoformat(hora) if hora else datetime.time.min
    except ValueError:
        hora_clase = datetime.time.min
    return datetime.datetime.combine(clase.fecha, hora_clase), clase.id


def _racha_reciente_por_materia(
    asistencias: list[AsistenciaDocente],
    clase_por_id: dict[int, ClaseDocente],
    carga_por_id: dict[int, CargaDocente],
) -> dict:
    """Obtiene la mayor racha vigente de FALTA, separada por materia."""
    por_materia = defaultdict(list)
    nombres = {}
    for asistencia in asistencias:
        clase = clase_por_id.get(asistencia.clase_docente_id)
        carga = carga_por_id.get(clase.carga_docente_id) if clase else None
        if not clase or not carga:
            continue
        clave = _clave_materia(carga)
        nombres[clave] = carga.actividad_nombre
        por_materia[clave].append((asistencia, clase, carga))

    rachas = []
    for clave, registros in por_materia.items():
        registros.sort(
            key=lambda item: _momento_clase(item[1], item[2]), reverse=True,
        )
        cantidad = 0
        fechas = []
        for asistencia, clase, _carga in registros:
            if asistencia.estado != "FALTA":
                break
            cantidad += 1
            fechas.append(clase.fecha)
        if cantidad:
            rachas.append({
                "materia_clave": clave,
                "materia": nombres[clave],
                "cantidad": cantidad,
                "desde": min(fechas).isoformat(),
                "hasta": max(fechas).isoformat(),
            })
    if not rachas:
        return {
            "cantidad": 0, "materia": None, "materia_clave": None,
            "desde": None, "hasta": None,
            "registros_analizados": len(asistencias),
        }
    resultado = max(rachas, key=lambda item: (item["cantidad"], item["hasta"]))
    resultado["registros_analizados"] = len(asistencias)
    return resultado


def _clasificar_panorama(
    porcentaje: float | None,
    promedio: float | None,
    racha: dict,
    acuerdos_pendientes: int,
    reportes_abiertos: int,
    registros_asistencia: int = 0,
) -> tuple[str, list[str]]:
    razones_riesgo = []
    razones_atencion = []
    if porcentaje is not None and porcentaje < UMBRAL_ASISTENCIA_RIESGO:
        razones_riesgo.append(f"Asistencia de {porcentaje}% (menor a {UMBRAL_ASISTENCIA_RIESGO:g}%)")
    elif porcentaje is not None and porcentaje < UMBRAL_ASISTENCIA_ATENCION:
        razones_atencion.append(f"Asistencia de {porcentaje}% (menor a {UMBRAL_ASISTENCIA_ATENCION:g}%)")
    if promedio is not None and promedio < UMBRAL_PROMEDIO_RIESGO:
        razones_riesgo.append(f"Promedio de evidencias de {promedio} (menor a {UMBRAL_PROMEDIO_RIESGO:g})")
    elif promedio is not None and promedio < UMBRAL_PROMEDIO_ATENCION:
        razones_atencion.append(f"Promedio de evidencias de {promedio} (menor a {UMBRAL_PROMEDIO_ATENCION:g})")
    if racha["cantidad"] >= UMBRAL_RACHA_RIESGO:
        razones_riesgo.append(f"{racha['cantidad']} faltas consecutivas en {racha['materia']}")
    elif racha["cantidad"] >= UMBRAL_RACHA_ATENCION:
        razones_atencion.append(f"{racha['cantidad']} faltas consecutivas en {racha['materia']}")
    if acuerdos_pendientes:
        razones_atencion.append(f"{acuerdos_pendientes} acuerdo(s) pendiente(s)")
    if reportes_abiertos:
        razones_atencion.append(f"{reportes_abiertos} reporte(s) abierto(s)")

    # Los acuerdos y reportes conservan su valor preventivo desde el primer
    # registro. Los porcentajes académicos necesitan una base mínima para no
    # convertir una sola clase en un semáforo definitivo.
    if registros_asistencia < MINIMO_CLASES_SEMAFORO and not acuerdos_pendientes and not reportes_abiertos:
        if registros_asistencia == 0 and promedio is None:
            return "SIN_DATOS", ["Sin asistencias ni evidencias registradas"]
        return "BASE_INSUFICIENT", [
            f"Base preliminar: {registros_asistencia} de {MINIMO_CLASES_SEMAFORO} clases mínimas"
        ]

    if razones_riesgo:
        return "RIESGO", razones_riesgo + razones_atencion
    if razones_atencion:
        return "ATENCION", razones_atencion
    if porcentaje is None and promedio is None:
        return "SIN_DATOS", ["Sin asistencias ni evidencias registradas"]
    return "REGULAR", ["Sin indicadores preventivos en los registros disponibles"]


def _alerta_inmediata(racha: dict) -> dict:
    if racha.get("registros_analizados", 0) < MINIMO_CLASES_SEMAFORO:
        nivel = "GRIS"
        razones = [f"Base preliminar: {racha.get('registros_analizados', 0)} de {MINIMO_CLASES_SEMAFORO} clases mínimas"]
    elif racha["cantidad"] >= UMBRAL_RACHA_RIESGO:
        nivel = "ROJO"
        razones = [f"{racha['cantidad']} faltas consecutivas en {racha['materia']}"]
    elif racha["cantidad"] >= UMBRAL_RACHA_ATENCION:
        nivel = "AMARILLO"
        razones = [f"{racha['cantidad']} faltas consecutivas en {racha['materia']}"]
    else:
        nivel = "VERDE"
        razones = ["Sin rachas recientes de faltas por materia"]
    return {"nivel": nivel, "razones": razones, "racha": racha}


def _resumen_asistencia_ventana(
    asistencias: list[AsistenciaDocente],
    clase_por_id: dict[int, ClaseDocente],
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
) -> dict:
    registros = [
        asistencia for asistencia in asistencias
        if (clase := clase_por_id.get(asistencia.clase_docente_id))
        and fecha_inicio <= clase.fecha <= fecha_fin
    ]
    conteos = {estado.lower(): 0 for estado in ESTADOS_ASISTENCIA}
    for asistencia in registros:
        if asistencia.estado in ESTADOS_ASISTENCIA:
            conteos[asistencia.estado.lower()] += 1
    asistio = conteos["presente"] + conteos["retardo"] + conteos["justificada"]
    porcentaje = round(asistio * 100 / len(registros), 1) if registros else None
    return {
        "desde": fecha_inicio.isoformat(),
        "hasta": fecha_fin.isoformat(),
        "registros": len(registros),
        "porcentaje": porcentaje,
        **conteos,
    }


def _tendencias_asistencia(
    asistencias: list[AsistenciaDocente],
    clases: list[ClaseDocente],
    asistencia_global: float | None,
) -> dict:
    if not clases:
        return {
            "fecha_referencia": None,
            "ultimos_7_dias": None,
            "ultimos_30_dias": None,
            "variacion_7_dias_vs_global": None,
            "variacion_30_dias_vs_global": None,
        }
    fecha_referencia = max(clase.fecha for clase in clases)
    clase_por_id = {clase.id: clase for clase in clases}
    ultimos_7 = _resumen_asistencia_ventana(
        asistencias, clase_por_id,
        fecha_referencia - datetime.timedelta(days=6), fecha_referencia,
    )
    ultimos_30 = _resumen_asistencia_ventana(
        asistencias, clase_por_id,
        fecha_referencia - datetime.timedelta(days=29), fecha_referencia,
    )
    def variacion(periodo):
        if periodo["porcentaje"] is None or asistencia_global is None:
            return None
        return round(periodo["porcentaje"] - asistencia_global, 1)
    return {
        "fecha_referencia": fecha_referencia.isoformat(),
        "ultimos_7_dias": ultimos_7,
        "ultimos_30_dias": ultimos_30,
        "variacion_7_dias_vs_global": variacion(ultimos_7),
        "variacion_30_dias_vs_global": variacion(ultimos_30),
    }


def _calidad_datos(
    materias: list[dict],
    clases: list[ClaseDocente],
    asistencias: list[AsistenciaDocente],
) -> dict:
    materias_sin_asistencia = [
        materia["materia"] for materia in materias
        if materia["asistencias_registradas"] == 0
    ]
    materias_sin_evidencias = [
        materia["materia"] for materia in materias
        if materia["evaluaciones_registradas"] == 0
    ]
    actualizaciones_asistencia = [
        asistencia.actualizado_en for asistencia in asistencias
        if asistencia.actualizado_en
    ]
    advertencias = []
    if not clases:
        advertencias.append("No hay clases registradas para el grupo actual")
    if materias_sin_asistencia:
        advertencias.append(
            f"{len(materias_sin_asistencia)} materia(s) sin asistencias capturadas"
        )
    if materias_sin_evidencias:
        advertencias.append(
            f"{len(materias_sin_evidencias)} materia(s) sin evidencias registradas"
        )
    if not advertencias:
        advertencias.append("Sin advertencias de captura en el periodo actual")
    return {
        "calculado_en": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "ultima_clase": max((clase.fecha for clase in clases), default=None).isoformat() if clases else None,
        "ultima_actualizacion_asistencia": _iso_utc(max(actualizaciones_asistencia)) if actualizaciones_asistencia else None,
        "materias_sin_asistencia": materias_sin_asistencia,
        "materias_sin_evidencias": materias_sin_evidencias,
        "advertencias": advertencias,
    }


def _cumplimiento_sesiones(
    db: Session,
    periodo_id: int | None,
    cargas: list[CargaDocente],
    clases: list[ClaseDocente],
    fecha_corte: datetime.date | None = None,
) -> dict:
    """Compara ocurrencias lectivas del horario con clases registradas.

    El cálculo requiere un calendario publicado con hitos oficiales de inicio y
    fin. Suspensiones o recesos prevalecen sobre cualquier evento lectivo.
    """
    base = {
        "disponible": False,
        "estado": "SIN_CALENDARIO",
        "porcentaje": None,
        "sesiones_esperadas": 0,
        "sesiones_registradas": 0,
        "sesiones_sin_registro": 0,
        "sesiones_adicionales": 0,
        "fecha_inicio": None,
        "fecha_corte": None,
        "fecha_fin_oficial": None,
        "mensaje": "Se requiere un calendario académico publicado con fechas oficiales de inicio y fin",
    }
    if not periodo_id or not cargas:
        return base
    calendario = db.query(CalendarioAcademico).filter(
        CalendarioAcademico.periodo_id == periodo_id,
        CalendarioAcademico.estado == "PUBLICADO",
    ).first()
    if not calendario:
        return base
    eventos = db.query(EventoCalendarioAcademico).filter(
        EventoCalendarioAcademico.calendario_id == calendario.id,
        EventoCalendarioAcademico.activo == True,
    ).all()
    inicios = [
        evento.fecha_inicio for evento in eventos
        if evento.tipo == "INICIO_CUATRIMESTRE"
    ]
    finales = [
        evento.fecha_fin for evento in eventos
        if evento.tipo in {"FIN_ACTIVIDADES_ACADEMICAS", "FIN_CUATRIMESTRE"}
    ]
    if not inicios or not finales:
        return {
            **base,
            "estado": "CALENDARIO_INCOMPLETO",
            "mensaje": "El calendario publicado no define inicio y fin oficiales del periodo",
        }
    fecha_inicio = min(inicios)
    fecha_fin_oficial = max(finales)
    hoy_mx = datetime.datetime.now(MX_TIMEZONE).date()
    corte = min(fecha_corte or hoy_mx, fecha_fin_oficial)
    if corte < fecha_inicio:
        return {
            **base,
            "estado": "PERIODO_NO_INICIADO",
            "fecha_inicio": fecha_inicio.isoformat(),
            "fecha_corte": corte.isoformat(),
            "fecha_fin_oficial": fecha_fin_oficial.isoformat(),
            "mensaje": "El periodo académico todavía no inicia",
        }

    def requiere_asistencia(fecha):
        aplicables = [
            evento for evento in eventos
            if evento.fecha_inicio <= fecha <= evento.fecha_fin
        ]
        restrictivos = [
            evento for evento in aplicables
            if not evento.requiere_asistencia or not evento.permite_iniciar_clase
        ]
        if restrictivos:
            return False
        return True

    esperadas = set()
    for carga in cargas:
        fecha = fecha_inicio
        while fecha <= corte:
            if fecha.weekday() == carga.dia_semana and requiere_asistencia(fecha):
                esperadas.add((carga.id, fecha))
            fecha += datetime.timedelta(days=1)
    registradas = {(clase.carga_docente_id, clase.fecha) for clase in clases}
    registradas_esperadas = esperadas & registradas
    adicionales = registradas - esperadas
    total_esperadas = len(esperadas)
    total_registradas = len(registradas_esperadas)
    porcentaje = round(total_registradas * 100 / total_esperadas, 1) if total_esperadas else None
    return {
        "disponible": True,
        "estado": "CALCULADO",
        "porcentaje": porcentaje,
        "sesiones_esperadas": total_esperadas,
        "sesiones_registradas": total_registradas,
        "sesiones_sin_registro": max(0, total_esperadas - total_registradas),
        "sesiones_adicionales": len(adicionales),
        "fecha_inicio": fecha_inicio.isoformat(),
        "fecha_corte": corte.isoformat(),
        "fecha_fin_oficial": fecha_fin_oficial.isoformat(),
        "mensaje": "Sesiones registradas respecto de las sesiones lectivas esperadas según horario y calendario oficial",
    }


def _acceso_institucional(db: Session, usuario: Usuario) -> bool:
    return puede_consultar_expediente(db, usuario)


def _ids_alumnos_accesibles(db: Session, usuario: Usuario):
    """IDs visibles: únicamente tutorados para DOCENTE; acceso global institucional."""
    if _acceso_institucional(db, usuario):
        return None
    if usuario.rol == RolUsuario.DOCENTE:
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
        return tutorados
    raise HTTPException(403, "No tienes autorización para consultar el expediente académico")


def _obtener_alumno_autorizado(db: Session, alumno_id: int, usuario: Usuario) -> CatalogoAlumno:
    alumno = db.query(CatalogoAlumno).filter(CatalogoAlumno.id == alumno_id).first()
    if not alumno:
        raise HTTPException(404, "Alumno no encontrado")
    ids = _ids_alumnos_accesibles(db, usuario)
    if ids is not None and alumno.id not in ids:
        raise HTTPException(403, "No tienes acceso al expediente de este alumno")
    return alumno


@router.delete("/acuerdos/{acuerdo_id}", summary="Eliminar un acuerdo capturado durante pruebas")
def eliminar_acuerdo_prueba(
    acuerdo_id: int,
    data: EliminarAcuerdoPruebaInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Depuración excepcional y auditada; no es una operación cotidiana del expediente."""
    if not _acceso_institucional(db, current_user):
        raise HTTPException(403, "Solo un responsable institucional puede depurar acuerdos de prueba")
    acuerdo = db.query(SeguimientoAlumnoDocente).filter(
        SeguimientoAlumnoDocente.id == acuerdo_id,
        SeguimientoAlumnoDocente.tipo == "ACUERDO",
    ).first()
    if not acuerdo:
        raise HTTPException(404, "Acuerdo no encontrado")
    if db.query(ReporteTutor).filter(ReporteTutor.seguimiento_docente_id == acuerdo.id).first():
        raise HTTPException(409, "El acuerdo está vinculado a un reporte de Tutoría y no puede eliminarse")

    detalle_auditoria = {
        "motivo": data.motivo.strip(),
        "alumno_id": acuerdo.alumno_id,
        "docente_id": acuerdo.docente_id,
        "carga_docente_id": acuerdo.carga_docente_id,
        "titulo": acuerdo.titulo,
        "detalle": acuerdo.detalle,
        "estado": acuerdo.estado,
        "creado_en": acuerdo.creado_en.isoformat(),
    }
    db.delete(acuerdo)
    db.commit()
    registrar(
        db, accion=Accion.ELIMINAR_ACUERDO_PRUEBA, recurso=Recurso.ACUERDO,
        usuario=current_user, recurso_id=acuerdo_id, detalle=detalle_auditoria,
        request=request,
    )
    return {"ok": True, "mensaje": "Acuerdo de prueba eliminado; la acción quedó en auditoría"}


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
        clave = _clave_materia(carga)
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
        estado = _estado_materia(porcentaje, promedio, len(clases), len(calificaciones))
        racha = _racha_reciente_por_materia(
            asistencias,
            {clase.id: clase for clase in clases},
            {carga.id: carga for carga in cargas if carga.id in carga_ids},
        )

        materias.append({
            **item,
            "clases_registradas": len(clases),
            "asistencias_registradas": total,
            **conteos,
            "porcentaje_asistencia": porcentaje,
            "promedio_evidencias": promedio,
            "evaluaciones_registradas": len(calificaciones),
            "acuerdos_pendientes": sum(1 for r in acuerdos if r.estado == "PENDIENTE"),
            "faltas_consecutivas": racha["cantidad"],
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
    total_evaluaciones = sum(m["evaluaciones_registradas"] for m in materias)
    base_suficiente = total_regs >= MINIMO_CLASES_SEMAFORO or total_evaluaciones > 0

    if base_suficiente and asistencia_global is not None and asistencia_global < UMBRAL_ASISTENCIA_RIESGO:
        razones.append(f"Asistencia global crítica de {asistencia_global}%")
    if riesgos_altos:
        razones.append(f"{riesgos_altos} materia(s) en riesgo alto")
    if riesgos_medios:
        razones.append(f"{riesgos_medios} materia(s) en riesgo medio")
    if acuerdos_vencidos:
        razones.append(f"{acuerdos_vencidos} acuerdo(s) vencido(s)")
    if reportes_altos:
        razones.append(f"{reportes_altos} reporte(s) de prioridad alta abierto(s)")
    elif reportes_abiertos:
        razones.append(f"{reportes_abiertos} reporte(s) abierto(s)")
    if (base_suficiente and asistencia_global is not None
            and UMBRAL_ASISTENCIA_RIESGO <= asistencia_global < UMBRAL_ASISTENCIA_ATENCION):
        razones.append(f"Asistencia global preventiva de {asistencia_global}%")

    if riesgos_altos >= UMBRAL_MATERIAS_ALTAS_ROJO or reportes_altos or (
        base_suficiente and asistencia_global is not None and asistencia_global < UMBRAL_ASISTENCIA_RIESGO
    ):
        nivel = "ROJO"
    elif riesgos_altos or riesgos_medios or acuerdos_vencidos or reportes_abiertos or (
        base_suficiente and asistencia_global is not None and asistencia_global < UMBRAL_ASISTENCIA_ATENCION
    ):
        nivel = "AMARILLO"
        if not razones:
            razones.append("Existen indicadores académicos que requieren observación")
    elif not base_suficiente:
        nivel = "GRIS"
        razones.append(f"Base preliminar: {total_regs} de {MINIMO_CLASES_SEMAFORO} clases mínimas y sin evidencias")
    else:
        nivel = "VERDE"
        razones.append("Sin indicadores críticos en los registros disponibles")
    return nivel, razones, asistencia_global


def _calcular_patron_asistencia(
    cargas: list[CargaDocente],
    clases: list[ClaseDocente],
    asistencias: list[AsistenciaDocente],
    excluir_justificadas: bool = False,
):
    carga_por_id = {carga.id: carga for carga in cargas}
    clase_por_id = {clase.id: clase for clase in clases}
    registros = []
    for asistencia in asistencias:
        if excluir_justificadas and asistencia.estado == "JUSTIFICADA":
            continue
        clase = clase_por_id.get(asistencia.clase_docente_id)
        carga = carga_por_id.get(clase.carga_docente_id) if clase else None
        if not clase or not carga:
            continue
        registros.append({
            "fecha": clase.fecha,
            "dia_semana": clase.fecha.weekday(),
            "hora_inicio": carga.hora_inicio,
            "hora_fin": carga.hora_fin,
            "materia": carga.actividad_nombre,
            "estado": asistencia.estado,
        })

    bloques = defaultdict(list)
    dias_semana = defaultdict(list)
    fechas = defaultdict(list)
    for registro in registros:
        bloques[(registro["hora_inicio"], registro["hora_fin"])].append(registro)
        dias_semana[registro["dia_semana"]].append(registro)
        fechas[registro["fecha"]].append(registro)

    def resumir(items):
        conteos = {estado.lower(): 0 for estado in ESTADOS_ASISTENCIA}
        for item in items:
            conteos[item["estado"].lower()] += 1
        total = len(items)
        asistio = conteos["presente"] + conteos["retardo"] + conteos["justificada"]
        return {
            "total": total,
            **conteos,
            "porcentaje_asistencia": round(asistio * 100 / total, 1) if total else None,
        }

    resumen_bloques = [
        {
            "hora_inicio": hora_inicio,
            "hora_fin": hora_fin,
            **resumir(items),
        }
        for (hora_inicio, hora_fin), items in sorted(bloques.items())
    ]
    nombres_dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    mapa = []
    for dia_num in sorted(dias_semana):
        items_dia = dias_semana[dia_num]
        celdas = []
        for (hora_inicio, hora_fin), items_bloque in sorted(bloques.items()):
            coincidentes = [
                item for item in items_dia
                if item["hora_inicio"] == hora_inicio and item["hora_fin"] == hora_fin
            ]
            celdas.append({
                "hora_inicio": hora_inicio,
                "hora_fin": hora_fin,
                **resumir(coincidentes),
            })
        mapa.append({
            "dia_num": dia_num,
            "dia": nombres_dias[dia_num],
            "bloques": celdas,
        })

    ausencias_parciales = []
    ausencias_completas = 0
    primera_hora_ausente_luego_asistio = 0
    for fecha, items in sorted(fechas.items(), reverse=True):
        ordenados = sorted(items, key=lambda item: item["hora_inicio"])
        tiene_falta = any(item["estado"] == "FALTA" for item in ordenados)
        tiene_asistencia = any(
            item["estado"] in {"PRESENTE", "RETARDO", "JUSTIFICADA"}
            for item in ordenados
        )
        if tiene_falta and tiene_asistencia:
            if ordenados[0]["estado"] == "FALTA" and any(
                item["estado"] in {"PRESENTE", "RETARDO", "JUSTIFICADA"}
                for item in ordenados[1:]
            ):
                primera_hora_ausente_luego_asistio += 1
            ausencias_parciales.append({
                "fecha": fecha.isoformat(),
                "primera_hora_ausente": ordenados[0]["estado"] == "FALTA",
                "registros": [{
                    "hora_inicio": item["hora_inicio"],
                    "hora_fin": item["hora_fin"],
                    "materia": item["materia"],
                    "estado": item["estado"],
                } for item in ordenados],
            })
        elif tiene_falta and not tiene_asistencia:
            ausencias_completas += 1

    horas = sorted({registro["hora_inicio"] for registro in registros})
    horas_tempranas = set(horas[:2])
    faltas = [registro for registro in registros if registro["estado"] == "FALTA"]
    faltas_tempranas = sum(
        1 for registro in faltas if registro["hora_inicio"] in horas_tempranas
    )
    concentracion = round(faltas_tempranas * 100 / len(faltas), 1) if faltas else 0
    if len(registros) >= 20 and len(faltas) >= 3:
        confianza = "ALTA"
    elif len(registros) >= 8 and len(faltas) >= 2:
        confianza = "MEDIA"
    else:
        confianza = "BAJA"

    if primera_hora_ausente_luego_asistio >= 2:
        hallazgo = (
            f"En {primera_hora_ausente_luego_asistio} días faltó a su primera clase "
            "registrada y asistió a clases posteriores."
        )
    elif faltas and concentracion >= 60:
        hallazgo = f"El {concentracion}% de sus faltas se concentra en los dos primeros horarios."
    elif faltas:
        hallazgo = "No se observa una concentración horaria suficientemente clara."
    else:
        hallazgo = "No hay faltas en los registros analizados."
    if confianza == "BAJA":
        hallazgo += " Aún hay pocos registros para establecer una tendencia."

    return {
        "resumen": {
            "registros_analizados": len(registros),
            "faltas": len(faltas),
            "faltas_tempranas": faltas_tempranas,
            "porcentaje_faltas_tempranas": concentracion,
            "dias_ausencia_parcial": len(ausencias_parciales),
            "dias_ausencia_completa": ausencias_completas,
            "primera_hora_ausente_luego_asistio": primera_hora_ausente_luego_asistio,
            "confianza": confianza,
            "hallazgo": hallazgo,
        },
        "bloques": resumen_bloques,
        "mapa_semanal": mapa,
        "ausencias_parciales": ausencias_parciales[:20],
    }


def _grupos_accesibles(db: Session, usuario: Usuario):
    ids = _ids_alumnos_accesibles(db, usuario)
    consulta = (
        db.query(GrupoAcademico)
        .join(
            InscripcionAlumno,
            InscripcionAlumno.grupo_academico_id == GrupoAcademico.id,
        )
        .filter(
            GrupoAcademico.activo == True,
            InscripcionAlumno.estado == "ACTIVO",
        )
    )
    if ids is not None:
        if not ids:
            return []
        consulta = consulta.filter(InscripcionAlumno.alumno_id.in_(ids))
    return consulta.distinct().order_by(
        GrupoAcademico.periodo_id.desc(), GrupoAcademico.carrera,
        GrupoAcademico.cuatrimestre, GrupoAcademico.grupo,
    ).all()


@router.get("/panorama/grupos", summary="Grupos accesibles para seguimiento académico")
def panorama_grupos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    ids_accesibles = _ids_alumnos_accesibles(db, current_user)
    grupos = _grupos_accesibles(db, current_user)
    resultado = []
    for grupo in grupos:
        alumnos_query = db.query(InscripcionAlumno.alumno_id).filter(
            InscripcionAlumno.grupo_academico_id == grupo.id,
            InscripcionAlumno.estado == "ACTIVO",
        )
        if ids_accesibles is not None:
            alumnos_query = alumnos_query.filter(
                InscripcionAlumno.alumno_id.in_(ids_accesibles),
            )
        total = alumnos_query.distinct().count()
        materias = db.query(CargaDocente.id).filter(
            CargaDocente.grupo_academico_id == grupo.id,
            CargaDocente.tipo_actividad == "CLASE",
            CargaDocente.activo == True,
        ).count()
        periodo = grupo.periodo.clave if grupo.periodo else None
        resultado.append({
            "id": grupo.id,
            "carrera": grupo.carrera,
            "cuatrimestre": grupo.cuatrimestre,
            "grupo": grupo.grupo,
            "turno": grupo.turno,
            "periodo": periodo,
            "total_alumnos": total,
            "materias": materias,
        })
    return resultado


@router.get(
    "/panorama/grupos/{grupo_id}/alumnos",
    summary="Indicadores y alumnos paginados de un grupo",
)
def panorama_alumnos_grupo(
    grupo_id: int,
    materia_clave: Optional[str] = Query(default=None, max_length=250),
    q: str = Query(default="", max_length=100),
    estado: str = Query(default="TODOS", pattern="^(TODOS|RIESGO|ATENCION|REGULAR|BASE_INSUFICIENT|SIN_DATOS)$"),
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=25, ge=10, le=100),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    grupos_permitidos = {grupo.id for grupo in _grupos_accesibles(db, current_user)}
    if grupo_id not in grupos_permitidos:
        raise HTTPException(403, "No tienes acceso académico a este grupo")
    grupo = db.query(GrupoAcademico).filter(GrupoAcademico.id == grupo_id).first()

    ids_accesibles = _ids_alumnos_accesibles(db, current_user)
    consulta_alumnos = (
        db.query(CatalogoAlumno)
        .join(
            InscripcionAlumno,
            InscripcionAlumno.alumno_id == CatalogoAlumno.id,
        )
        .filter(
            InscripcionAlumno.grupo_academico_id == grupo_id,
            InscripcionAlumno.estado == "ACTIVO",
            CatalogoAlumno.activo == True,
        )
    )
    if ids_accesibles is not None:
        consulta_alumnos = consulta_alumnos.filter(
            CatalogoAlumno.id.in_(ids_accesibles),
        )
    alumnos = consulta_alumnos.distinct().all()
    alumno_ids = [alumno.id for alumno in alumnos]

    todas_cargas = db.query(CargaDocente).filter(
        CargaDocente.grupo_academico_id == grupo_id,
        CargaDocente.tipo_actividad == "CLASE",
        CargaDocente.activo == True,
    ).all()
    materias_disponibles = []
    for clave in dict.fromkeys(_clave_materia(carga) for carga in todas_cargas):
        cargas_materia = [carga for carga in todas_cargas if _clave_materia(carga) == clave]
        docentes = sorted({carga.docente.nombre for carga in cargas_materia if carga.docente})
        materias_disponibles.append({
            "clave": clave,
            "nombre": cargas_materia[0].actividad_nombre,
            "docentes": docentes,
            "cargas": len(cargas_materia),
        })
    materias_disponibles.sort(key=lambda materia: materia["nombre"].lower())
    if materia_clave and materia_clave not in {materia["clave"] for materia in materias_disponibles}:
        raise HTTPException(422, "La materia seleccionada no pertenece al grupo")
    cargas = [
        carga for carga in todas_cargas
        if not materia_clave or _clave_materia(carga) == materia_clave
    ]
    carga_ids = [carga.id for carga in cargas]
    clases = (
        db.query(ClaseDocente).filter(
            ClaseDocente.carga_docente_id.in_(carga_ids),
        ).all() if carga_ids else []
    )
    cumplimiento_sesiones = _cumplimiento_sesiones(
        db, grupo.periodo_id, cargas, clases,
    )
    clase_ids = [clase.id for clase in clases]
    clase_por_id = {clase.id: clase for clase in clases}
    carga_por_id = {carga.id: carga for carga in cargas}
    asistencias = (
        db.query(AsistenciaDocente).filter(
            AsistenciaDocente.clase_docente_id.in_(clase_ids),
            AsistenciaDocente.alumno_id.in_(alumno_ids),
        ).all() if clase_ids and alumno_ids else []
    )
    seguimientos = (
        db.query(SeguimientoAlumnoDocente).filter(
            SeguimientoAlumnoDocente.carga_docente_id.in_(carga_ids),
            SeguimientoAlumnoDocente.alumno_id.in_(alumno_ids),
        ).all() if carga_ids and alumno_ids else []
    )
    reportes = (
        db.query(ReporteTutor).filter(
            ReporteTutor.alumno_id.in_(alumno_ids),
        ).all() if alumno_ids and not materia_clave else []
    )

    asistencia_por_alumno = defaultdict(list)
    for asistencia in asistencias:
        asistencia_por_alumno[asistencia.alumno_id].append(asistencia)
    seguimiento_por_alumno = defaultdict(list)
    for registro in seguimientos:
        seguimiento_por_alumno[registro.alumno_id].append(registro)
    reportes_por_alumno = defaultdict(list)
    for reporte in reportes:
        reportes_por_alumno[reporte.alumno_id].append(reporte)

    filas = []
    for alumno in alumnos:
        registros_asistencia = asistencia_por_alumno[alumno.id]
        conteos = {estado_asistencia.lower(): 0 for estado_asistencia in ESTADOS_ASISTENCIA}
        for asistencia in registros_asistencia:
            if asistencia.estado in ESTADOS_ASISTENCIA:
                conteos[asistencia.estado.lower()] += 1
        total_asistencia = len(registros_asistencia)
        asistio = conteos["presente"] + conteos["retardo"] + conteos["justificada"]
        porcentaje = round(asistio * 100 / total_asistencia, 1) if total_asistencia else None

        racha = _racha_reciente_por_materia(
            registros_asistencia, clase_por_id, carga_por_id,
        )

        registros = seguimiento_por_alumno[alumno.id]
        calificaciones = [
            registro.calificacion for registro in registros
            if registro.tipo == "CALIFICACION" and registro.calificacion is not None
        ]
        promedio = (
            round(sum(calificaciones) / len(calificaciones), 1)
            if calificaciones else None
        )
        acuerdos_pendientes = sum(
            1 for registro in registros
            if registro.tipo == "ACUERDO" and registro.estado == "PENDIENTE"
        )
        reportes_abiertos = sum(
            1 for reporte in reportes_por_alumno[alumno.id]
            if reporte.estado in ESTADOS_ABIERTOS
        )
        semaforo, razones_estado = _clasificar_panorama(
            porcentaje, promedio, racha, acuerdos_pendientes, reportes_abiertos,
            total_asistencia,
        )
        filas.append({
            "id": alumno.id,
            "matricula": alumno.matricula,
            "nombre": _nombre_alumno(alumno),
            "asistencia": porcentaje,
            "promedio_evidencias": promedio,
            "faltas": conteos["falta"],
            "retardos": conteos["retardo"],
            "justificadas": conteos["justificada"],
            "faltas_consecutivas": racha["cantidad"],
            "racha_faltas": racha,
            "acuerdos_pendientes": acuerdos_pendientes,
            "reportes_abiertos": reportes_abiertos,
            "estado": semaforo,
            "razones_estado": razones_estado,
        })

    todas_filas = filas
    termino = q.strip().lower()
    if termino:
        filas = [
            fila for fila in filas
            if termino in fila["nombre"].lower() or termino in fila["matricula"].lower()
        ]
    if estado != "TODOS":
        filas = [fila for fila in filas if fila["estado"] == estado]
    prioridad = {"RIESGO": 0, "ATENCION": 1, "BASE_INSUFICIENT": 2, "SIN_DATOS": 3, "REGULAR": 4}
    filas.sort(key=lambda fila: (prioridad[fila["estado"]], fila["nombre"]))

    total_filtrado = len(filas)
    inicio = (pagina - 1) * limite
    paginadas = filas[inicio:inicio + limite]
    total_registros = len(asistencias)
    asistencia_global = (
        round(
            sum(
                1 for asistencia in asistencias
                if asistencia.estado in {"PRESENTE", "RETARDO", "JUSTIFICADA"}
            ) * 100 / total_registros,
            1,
        ) if total_registros else None
    )
    promedios = [
        fila["promedio_evidencias"] for fila in todas_filas
        if fila["promedio_evidencias"] is not None
    ]
    return {
        "grupo": {
            "id": grupo.id, "carrera": grupo.carrera,
            "cuatrimestre": grupo.cuatrimestre, "grupo": grupo.grupo,
            "turno": grupo.turno,
            "periodo": grupo.periodo.clave if grupo.periodo else None,
        },
        "materias": materias_disponibles,
        "materia_seleccionada": next(
            (materia for materia in materias_disponibles if materia["clave"] == materia_clave),
            None,
        ),
        "alcance": "MATERIA" if materia_clave else "GRUPO",
        "resumen": {
            "total_alumnos": len(alumnos),
            "asistencia_global": asistencia_global,
            "promedio_evidencias": (
                round(sum(promedios) / len(promedios), 1) if promedios else None
            ),
            "alumnos_riesgo": sum(1 for fila in todas_filas if fila["estado"] == "RIESGO"),
            "alumnos_atencion": sum(1 for fila in todas_filas if fila["estado"] == "ATENCION"),
            "sin_datos": sum(1 for fila in todas_filas if fila["estado"] == "SIN_DATOS"),
            "base_insuficiente": sum(1 for fila in todas_filas if fila["estado"] == "BASE_INSUFICIENT"),
            "faltas_totales": sum(fila["faltas"] for fila in todas_filas),
            "acuerdos_pendientes": sum(fila["acuerdos_pendientes"] for fila in todas_filas),
            "reportes_abiertos": sum(fila["reportes_abiertos"] for fila in todas_filas),
            "materias": len({
                carga.materia_id or carga.actividad_nombre.strip().upper()
                for carga in cargas
            }),
            "clases_registradas": len(clases),
            "cobertura_asistencia": (
                round(total_registros * 100 / (len(alumnos) * len(clases)), 1)
                if alumnos and clases else 0
            ),
            "cobertura_asistencia_detalle": {
                "registros_capturados": total_registros,
                "registros_esperados": len(alumnos) * len(clases),
                "alumnos": len(alumnos),
                "clases_registradas": len(clases),
                "descripcion": "Completitud del pase de lista sobre las clases registradas",
            },
            "cumplimiento_sesiones": cumplimiento_sesiones,
            "minimo_clases_semaforo": MINIMO_CLASES_SEMAFORO,
        },
        "alumnos": paginadas,
        "paginacion": {
            "pagina": pagina,
            "limite": limite,
            "total": total_filtrado,
            "paginas": max(1, math.ceil(total_filtrado / limite)),
        },
    }


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


@router.get(
    "/alumnos/{alumno_id}/timeline",
    summary="Línea de tiempo académica paginada",
)
def timeline_alumno(
    alumno_id: int,
    tipo: str = Query(
        default="TODOS",
        pattern="^(TODOS|ASISTENCIA|EVALUACION|ACUERDO|REPORTE|TUTORIA)$",
    ),
    materia_clave: Optional[str] = Query(default=None, max_length=120),
    fecha_inicio: Optional[datetime.date] = None,
    fecha_fin: Optional[datetime.date] = None,
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=20, ge=10, le=50),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if fecha_inicio and fecha_fin and fecha_fin < fecha_inicio:
        raise HTTPException(422, "La fecha final debe ser igual o posterior a la inicial")
    alumno = _obtener_alumno_autorizado(db, alumno_id, current_user)
    _grupo, cargas = _grupo_y_cargas(db, alumno)
    cargas_por_id = {carga.id: carga for carga in cargas}
    if materia_clave:
        cargas_por_id = {
            carga_id: carga for carga_id, carga in cargas_por_id.items()
            if _clave_materia(carga) == materia_clave
        }
    carga_ids = list(cargas_por_id)
    offset = (pagina - 1) * limite
    max_por_fuente = pagina * limite + 1
    eventos = []
    inicio_dt = datetime.datetime.combine(fecha_inicio, datetime.time.min) if fecha_inicio else None
    fin_dt = datetime.datetime.combine(fecha_fin, datetime.time.max) if fecha_fin else None

    if tipo in {"TODOS", "ASISTENCIA"} and carga_ids:
        consulta = (
            db.query(AsistenciaDocente, ClaseDocente)
            .join(ClaseDocente, ClaseDocente.id == AsistenciaDocente.clase_docente_id)
            .filter(
                AsistenciaDocente.alumno_id == alumno.id,
                ClaseDocente.carga_docente_id.in_(carga_ids),
                AsistenciaDocente.estado.in_({"FALTA", "RETARDO", "JUSTIFICADA"}),
            )
        )
        if fecha_inicio:
            consulta = consulta.filter(ClaseDocente.fecha >= fecha_inicio)
        if fecha_fin:
            consulta = consulta.filter(ClaseDocente.fecha <= fecha_fin)
        for asistencia, clase in consulta.order_by(
            ClaseDocente.fecha.desc(), ClaseDocente.id.desc(),
        ).limit(max_por_fuente).all():
            carga = cargas_por_id[clase.carga_docente_id]
            eventos.append({
                "id": f"asistencia:{asistencia.id}",
                "tipo": "ASISTENCIA",
                "fecha": _fecha_hora_clase_mx(clase.fecha, carga.hora_inicio),
                "titulo": asistencia.estado.title(),
                "descripcion": carga.actividad_nombre,
                "estado": asistencia.estado,
                "materia": carga.actividad_nombre,
                "materia_clave": _clave_materia(carga),
            })

    if tipo in {"TODOS", "EVALUACION", "ACUERDO"} and (carga_ids or not materia_clave):
        tipos_seguimiento = []
        if tipo in {"TODOS", "EVALUACION"}:
            tipos_seguimiento.append("CALIFICACION")
        if tipo in {"TODOS", "ACUERDO"}:
            tipos_seguimiento.append("ACUERDO")
        consulta = db.query(SeguimientoAlumnoDocente).filter(
            SeguimientoAlumnoDocente.alumno_id == alumno.id,
            SeguimientoAlumnoDocente.tipo.in_(tipos_seguimiento),
        )
        if materia_clave:
            consulta = consulta.filter(SeguimientoAlumnoDocente.carga_docente_id.in_(carga_ids))
        if inicio_dt:
            consulta = consulta.filter(SeguimientoAlumnoDocente.creado_en >= inicio_dt)
        if fin_dt:
            consulta = consulta.filter(SeguimientoAlumnoDocente.creado_en <= fin_dt)
        for registro in consulta.order_by(
            SeguimientoAlumnoDocente.creado_en.desc(),
            SeguimientoAlumnoDocente.id.desc(),
        ).limit(max_por_fuente).all():
            carga = cargas_por_id.get(registro.carga_docente_id) or registro.carga
            es_evaluacion = registro.tipo == "CALIFICACION"
            eventos.append({
                "id": f"{'evaluacion' if es_evaluacion else 'acuerdo'}:{registro.id}",
                "tipo": "EVALUACION" if es_evaluacion else "ACUERDO",
                "fecha": _iso_utc(registro.creado_en),
                "titulo": (
                    f"{carga.actividad_nombre}: {registro.titulo}"
                    if es_evaluacion else registro.titulo
                ),
                "descripcion": (
                    f"Calificación informativa: {registro.calificacion}"
                    if es_evaluacion else registro.detalle
                ),
                "estado": None if es_evaluacion else registro.estado,
                "materia": carga.actividad_nombre,
                "materia_clave": _clave_materia(carga),
            })

    if not materia_clave and tipo in {"TODOS", "REPORTE"}:
        consulta = db.query(ReporteTutor).filter(ReporteTutor.alumno_id == alumno.id)
        if inicio_dt:
            consulta = consulta.filter(ReporteTutor.creado_en >= inicio_dt)
        if fin_dt:
            consulta = consulta.filter(ReporteTutor.creado_en <= fin_dt)
        for reporte in consulta.order_by(
            ReporteTutor.creado_en.desc(), ReporteTutor.id.desc(),
        ).limit(max_por_fuente).all():
            eventos.append({
                "id": f"reporte:{reporte.id}", "tipo": "REPORTE",
                "fecha": _iso_utc(reporte.creado_en), "titulo": reporte.titulo,
                "descripcion": reporte.detalle, "estado": reporte.estado,
                "materia": None, "materia_clave": None,
            })

    if not materia_clave and tipo in {"TODOS", "TUTORIA"}:
        consulta = (
            db.query(RegistroSesionAlumno, SesionTutoria)
            .join(SesionTutoria, SesionTutoria.id == RegistroSesionAlumno.sesion_id)
            .filter(RegistroSesionAlumno.alumno_id == alumno.id)
        )
        if fecha_inicio:
            consulta = consulta.filter(SesionTutoria.fecha >= fecha_inicio)
        if fecha_fin:
            consulta = consulta.filter(SesionTutoria.fecha <= fecha_fin)
        for registro, sesion in consulta.order_by(
            SesionTutoria.fecha.desc(), SesionTutoria.id.desc(),
        ).limit(max_por_fuente).all():
            eventos.append({
                "id": f"tutoria:{sesion.id}:{registro.id}", "tipo": "TUTORIA",
                "fecha": sesion.fecha.isoformat(),
                "titulo": f"Sesión de tutoría {sesion.tipo_sesion.lower()}",
                "descripcion": registro.tema or registro.comentarios,
                "estado": "ASISTIÓ" if registro.asistio else "NO ASISTIÓ",
                "materia": None, "materia_clave": None,
            })

    eventos.sort(key=lambda evento: evento["fecha"] or "", reverse=True)
    visibles = eventos[offset:offset + limite]
    return {
        "items": visibles,
        "paginacion": {
            "pagina": pagina,
            "limite": limite,
            "hay_mas": len(eventos) > offset + limite,
        },
        "filtros": {
            "tipo": tipo, "materia_clave": materia_clave,
            "fecha_inicio": fecha_inicio.isoformat() if fecha_inicio else None,
            "fecha_fin": fecha_fin.isoformat() if fecha_fin else None,
        },
    }


@router.get("/alumnos/{alumno_id}", summary="Expediente académico integral del alumno")
def expediente_alumno(
    alumno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    sincronizar_grupos_tutoria(db)
    db.commit()
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
    carga_ids = [carga.id for carga in cargas]
    clases_patron = []
    asistencias_patron = []
    if carga_ids:
        clases_patron = db.query(ClaseDocente).filter(
            ClaseDocente.carga_docente_id.in_(carga_ids),
        ).all()
        ids_clases_patron = [clase.id for clase in clases_patron]
        asistencias_patron = (
            db.query(AsistenciaDocente).filter(
                AsistenciaDocente.alumno_id == alumno.id,
                AsistenciaDocente.clase_docente_id.in_(ids_clases_patron),
            ).all() if ids_clases_patron else []
        )
    racha_reciente = _racha_reciente_por_materia(
        asistencias_patron,
        {clase.id: clase for clase in clases_patron},
        {carga.id: carga for carga in cargas},
    )
    alerta_inmediata = _alerta_inmediata(racha_reciente)
    tendencias_asistencia = _tendencias_asistencia(
        asistencias_patron, clases_patron, asistencia_global,
    )
    tendencias_asistencia["calculable"] = len(asistencias_patron) >= MINIMO_REGISTROS_TENDENCIA
    tendencias_asistencia["registros_total"] = len(asistencias_patron)
    tendencias_asistencia["minimo_registros"] = MINIMO_REGISTROS_TENDENCIA
    calidad_datos = _calidad_datos(
        materias, clases_patron, asistencias_patron,
    )
    total_evaluaciones = sum(m["evaluaciones_registradas"] for m in materias)
    promedios = [m["promedio_evidencias"] for m in materias if m["promedio_evidencias"] is not None]
    inscripciones_historial = (db.query(InscripcionAlumno).join(GrupoAcademico).filter(
        InscripcionAlumno.alumno_id == alumno.id,
    ).order_by(GrupoAcademico.periodo_id, GrupoAcademico.cuatrimestre).all())
    promociones_historial = {p.inscripcion_origen_id: p for p in db.query(PromocionAcademicaAlumno).filter(
        PromocionAcademicaAlumno.alumno_id == alumno.id,
    ).all()}
    trayectoria = []
    for inscripcion_h in inscripciones_historial:
        grupo_h = inscripcion_h.grupo_academico
        promo_h = promociones_historial.get(inscripcion_h.id)
        trayectoria.append({
            "inscripcion_id": inscripcion_h.id, "periodo_id": grupo_h.periodo_id,
            "periodo": grupo_h.periodo.clave, "carrera": grupo_h.carrera,
            "cuatrimestre": grupo_h.cuatrimestre, "grupo": grupo_h.grupo,
            "estado_inscripcion": inscripcion_h.estado,
            "resolucion": promo_h.resolucion if promo_h else None,
            "estado_promocion": promo_h.estado if promo_h else None,
            "periodo_destino": promo_h.periodo_destino.clave if promo_h else None,
            "observaciones": promo_h.observaciones if promo_h else None,
        })
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
            "base_suficiente": len(asistencias_patron) >= MINIMO_CLASES_SEMAFORO or total_evaluaciones > 0,
            "clases_con_asistencia": len(asistencias_patron),
            "minimo_clases_semaforo": MINIMO_CLASES_SEMAFORO,
            "alerta_inmediata": alerta_inmediata,
            "tendencias_asistencia": tendencias_asistencia,
            "calidad_datos": calidad_datos,
            "umbrales": {
                "asistencia_riesgo": UMBRAL_ASISTENCIA_RIESGO,
                "asistencia_atencion": UMBRAL_ASISTENCIA_ATENCION,
                "promedio_riesgo": UMBRAL_PROMEDIO_RIESGO,
                "promedio_atencion": UMBRAL_PROMEDIO_ATENCION,
                "racha_riesgo": UMBRAL_RACHA_RIESGO,
                "racha_atencion": UMBRAL_RACHA_ATENCION,
                "materias_riesgo_alto_para_rojo": UMBRAL_MATERIAS_ALTAS_ROJO,
            },
        },
        "materias": materias,
        "patrones_asistencia": {
            "incluyendo_justificadas": _calcular_patron_asistencia(
                cargas, clases_patron, asistencias_patron,
            ),
            "excluyendo_justificadas": _calcular_patron_asistencia(
                cargas, clases_patron, asistencias_patron,
                excluir_justificadas=True,
            ),
        },
        "acuerdos": [{
            "id": a.id, "titulo": a.titulo, "detalle": a.detalle,
            "estado": a.estado,
            "fecha_revision": a.fecha_revision.isoformat() if a.fecha_revision else None,
            "resultado": a.resultado_atencion,
            # La carga del propio acuerdo conserva su contexto aunque el horario
            # pertenezca a otro periodo o ya se encuentre archivado.
            "tipo_contexto": "MATERIA" if a.carga and a.carga.tipo_actividad == "CLASE" else "GENERAL",
            "materia": a.carga.actividad_nombre if a.carga and a.carga.tipo_actividad == "CLASE" else None,
            "grupo": (
                f"{a.carga.grupo_academico.cuatrimestre}° {a.carga.grupo_academico.grupo}"
                if a.carga and a.carga.grupo_academico else None
            ),
            "periodo": a.carga.periodo.clave if a.carga and a.carga.periodo else None,
            "docente_id": a.docente_id,
            "docente": a.docente.nombre if a.docente else None,
            "creado_en": a.creado_en.isoformat(),
            "atendido_en": a.atendido_en.isoformat() if a.atendido_en else None,
        } for a in acuerdos],
        "timeline_paginada": True,
        "trayectoria_academica": trayectoria,
        "nota_calificaciones": (
            "Las calificaciones mostradas son evidencias registradas por docentes. "
            "Todavía no representan calificaciones oficiales bimestrales."
        ),
    }
