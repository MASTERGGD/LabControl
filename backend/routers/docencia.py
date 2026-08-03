import datetime
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.usuario import Usuario, RolUsuario
from models.catalogo import (
    CatalogoAlumno, CatalogoMateria, GrupoAcademico, InscripcionAlumno, PeriodoEscolar,
)
from models.laboratorio import Laboratorio
from models.espacio import EspacioInstitucional
from models.horario import BloqueoSlot, HorarioDisponible, Reservacion, SolicitudConflicto
from models.docencia import (
    AsistenciaDocente, CargaDocente, ClaseDocente,
    DetalleJustificacionAsistencia, JustificacionAsistenciaDocente,
    SeguimientoAlumnoDocente,
)
from models.tutoria import AsignacionTutoria, Canalizacion, GrupoTutorado, ReporteTutor
from routers.notificaciones import crear_notificacion
from services.tutoria_sync import grupo_tutoria_para_academico


router = APIRouter(prefix="/docencia", tags=["Módulo docente"])
MX = ZoneInfo("America/Mexico_City")
TIPOS = {"CLASE", "TUTORIA", "DESCARGA", "RECESO", "OTRA"}
ESTADOS_ASISTENCIA = {"PRESENTE", "FALTA", "RETARDO", "JUSTIFICADA"}


def _ahora_mx():
    return datetime.datetime.now(MX)


def _solo_docente(user: Usuario):
    if user.rol not in {RolUsuario.DOCENTE, RolUsuario.SUPER_ADMIN}:
        raise HTTPException(403, "Acceso exclusivo del personal docente")


class CargaInput(BaseModel):
    periodo_id: int
    grupo_academico_id: Optional[int] = None
    materia_id: Optional[int] = None
    tipo_actividad: str = "CLASE"
    actividad_nombre: str = Field(..., min_length=2, max_length=200)
    dia_semana: int = Field(..., ge=0, le=5)
    hora_inicio: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    hora_fin: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    espacio_nombre: Optional[str] = Field(None, max_length=180)
    laboratorio_id: Optional[int] = None
    observaciones: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode="after")
    def validar(self):
        self.tipo_actividad = self.tipo_actividad.upper()
        if self.tipo_actividad not in TIPOS:
            raise ValueError("Tipo de actividad no válido")
        if self.hora_inicio >= self.hora_fin:
            raise ValueError("La hora final debe ser posterior a la inicial")
        if self.tipo_actividad == "CLASE" and not self.grupo_academico_id:
            raise ValueError("Las clases deben tener un grupo")
        return self


class CopiarHorarioInput(BaseModel):
    periodo_origen_id: int
    periodo_destino_id: int


class CapturaExtemporaneaInput(BaseModel):
    fecha: datetime.date
    motivo: str = Field(..., min_length=5, max_length=500)


class AsistenciaInput(BaseModel):
    estado: str
    observacion: Optional[str] = Field(None, max_length=500)


class CierreInput(BaseModel):
    observacion_general: Optional[str] = Field(None, max_length=1000)
    tema_impartido: Optional[str] = Field(None, max_length=300)
    avance_planeacion: Optional[int] = Field(None, ge=0, le=100)
    actividades_realizadas: Optional[str] = Field(None, max_length=2000)
    tarea_asignada: Optional[str] = Field(None, max_length=1500)
    incidencias: Optional[str] = Field(None, max_length=1500)
    tema_pendiente: Optional[str] = Field(None, max_length=1000)


class CorreccionInput(BaseModel):
    motivo: str = Field(..., min_length=5, max_length=500)


class JustificacionMultipleInput(BaseModel):
    fecha_inicio: datetime.date
    fecha_fin: datetime.date
    asistencia_ids: list[int] = Field(..., min_length=1, max_length=100)
    motivo: str = Field(..., min_length=5, max_length=1000)
    folio: Optional[str] = Field(None, max_length=100)

    @model_validator(mode="after")
    def validar(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final debe ser igual o posterior a la inicial")
        if len(set(self.asistencia_ids)) != len(self.asistencia_ids):
            raise ValueError("Hay faltas repetidas en la selección")
        self.motivo = self.motivo.strip()
        self.folio = self.folio.strip() if self.folio else None
        return self


class SeguimientoInput(BaseModel):
    tipo: str
    titulo: str = Field(..., min_length=2, max_length=180)
    detalle: Optional[str] = Field(None, max_length=2000)
    calificacion: Optional[float] = Field(None, ge=0, le=10)
    estado: str = Field("REGISTRADO", max_length=20)
    fecha_revision: Optional[datetime.date] = None
    categoria_reporte: str = Field("ACADEMICO", max_length=30)
    prioridad_reporte: str = Field("MEDIA", max_length=15)
    confidencial: bool = False

    @model_validator(mode="after")
    def validar(self):
        self.tipo = self.tipo.upper()
        self.estado = self.estado.upper()
        if self.tipo not in {"OBSERVACION", "ACUERDO", "CALIFICACION", "TUTORIA"}:
            raise ValueError("Tipo de seguimiento no válido")
        if self.tipo == "CALIFICACION" and self.calificacion is None:
            raise ValueError("La calificación es obligatoria")
        self.categoria_reporte = self.categoria_reporte.upper()
        self.prioridad_reporte = self.prioridad_reporte.upper()
        if self.categoria_reporte not in {"ACADEMICO", "ASISTENCIA", "CONDUCTA", "PERSONAL", "OTRO"}:
            raise ValueError("Categoría de reporte no válida")
        if self.prioridad_reporte not in {"BAJA", "MEDIA", "ALTA"}:
            raise ValueError("Prioridad de reporte no válida")
        return self


class EstadoSeguimientoInput(BaseModel):
    estado: str
    resultado_atencion: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def validar(self):
        self.estado = self.estado.upper()
        if self.estado not in {"PENDIENTE", "ATENDIDO", "CERRADO"}:
            raise ValueError("Estado de seguimiento no válido")
        if self.estado in {"ATENDIDO", "CERRADO"} and not (self.resultado_atencion or "").strip():
            raise ValueError("El resultado de la atención es obligatorio")
        return self


class AlertaTempranaInput(BaseModel):
    senal: str
    nivel: str = "ATENCION"
    comentario: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode="after")
    def validar(self):
        self.senal = self.senal.upper()
        self.nivel = self.nivel.upper()
        senales = {
            "INASISTENCIA", "BAJO_DESEMPENO", "CAMBIO_CONDUCTA",
            "FALTA_PARTICIPACION", "SITUACION_PERSONAL", "OTRO",
        }
        if self.senal not in senales:
            raise ValueError("Señal de alerta no válida")
        if self.nivel not in {"OBSERVACION", "ATENCION", "URGENTE"}:
            raise ValueError("Nivel de alerta no válido")
        self.comentario = self.comentario.strip() if self.comentario else None
        if (self.senal == "OTRO" or self.nivel == "URGENTE") and not self.comentario:
            raise ValueError("Describe brevemente la situación")
        return self


def _docente_objetivo(user: Usuario) -> int:
    return user.id


def _periodo_actual(db: Session):
    periodos = db.query(PeriodoEscolar).filter(
        PeriodoEscolar.activo == True,
    ).order_by(PeriodoEscolar.id.desc()).all()
    hoy = _ahora_mx()
    bloque = "ENE-ABR" if hoy.month <= 4 else "MAY-AGO" if hoy.month <= 8 else "SEP-DIC"
    esperado = _normalizar_periodo(f"{bloque} {hoy.year}")
    por_fecha = next(
        (periodo for periodo in periodos if _normalizar_periodo(periodo.clave) == esperado),
        None,
    )
    return por_fecha or next((periodo for periodo in periodos if periodo.es_actual), None)


def _validar_periodo_actual(db: Session, periodo_id: int):
    periodo = _periodo_actual(db)
    if not periodo:
        raise HTTPException(
            409,
            "No hay un periodo escolar actual configurado. Solicita a Servicios Escolares que active el cuatrimestre.",
        )
    if periodo.id != periodo_id:
        raise HTTPException(
            409,
            f"{periodo.clave} es el periodo actual. El periodo seleccionado permanece disponible solo para consulta.",
        )
    return periodo


def _validar_carga_actual(db: Session, carga: CargaDocente):
    return _validar_periodo_actual(db, carga.periodo_id)


def _normalizar_periodo(clave: str | None) -> str:
    return "-".join((clave or "").strip().upper().replace("_", "-").split()).replace("--", "-")


def _slots_para_carga(db: Session, data: CargaInput):
    if not data.laboratorio_id:
        return [], "SIN_LABORATORIO"
    periodo = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == data.periodo_id).first()
    candidatos = db.query(HorarioDisponible).filter(
        HorarioDisponible.laboratorio_id == data.laboratorio_id,
        HorarioDisponible.dia_semana == data.dia_semana,
        HorarioDisponible.activo == True,
    ).order_by(HorarioDisponible.hora_inicio).all()
    candidatos = [
        h for h in candidatos
        if _normalizar_periodo(h.cuatrimestre) == _normalizar_periodo(periodo.clave if periodo else "")
        and h.hora_inicio < data.hora_fin and h.hora_fin > data.hora_inicio
    ]
    if not candidatos:
        return [], "SIN_HORARIOS"
    cursor = data.hora_inicio
    seleccionados = []
    for slot in candidatos:
        if slot.hora_fin <= cursor:
            continue
        if slot.hora_inicio > cursor:
            if not (cursor == "09:45" and slot.hora_inicio == "10:15"):
                return candidatos, "COBERTURA_INCOMPLETA"
        seleccionados.append(slot)
        cursor = max(cursor, slot.hora_fin)
        if cursor >= data.hora_fin:
            break
    if cursor < data.hora_fin:
        return seleccionados, "COBERTURA_INCOMPLETA"
    return seleccionados, None


def _estado_laboratorio(db: Session, data: CargaInput, current_user: Usuario, carga_id: int | None = None):
    slots, problema = _slots_para_carga(db, data)
    lab = db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id).first() if data.laboratorio_id else None
    respuesta = {
        "estado": problema or "DISPONIBLE",
        "laboratorio_id": data.laboratorio_id,
        "laboratorio_nombre": lab.nombre if lab else None,
        "slots": [],
        "ocupaciones": [],
    }
    if problema:
        return respuesta
    todos_vinculados = True
    for slot in slots:
        bloqueo = db.query(BloqueoSlot).filter(
            BloqueoSlot.horario_id == slot.id, BloqueoSlot.activo == True,
        ).first()
        reserva = db.query(Reservacion).filter(
            Reservacion.horario_id == slot.id,
            Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA", "EN_CURSO"]),
        ).first()
        respuesta["slots"].append({"id": slot.id, "hora_inicio": slot.hora_inicio, "hora_fin": slot.hora_fin})
        if bloqueo:
            respuesta["estado"] = "BLOQUEADO"
            respuesta["ocupaciones"].append({"hora": f"{slot.hora_inicio}–{slot.hora_fin}", "motivo": bloqueo.motivo})
            todos_vinculados = False
        elif reserva and not (carga_id and reserva.carga_docente_id == carga_id):
            docente = db.query(Usuario).filter(Usuario.id == reserva.docente_id).first()
            mi_solicitud = db.query(SolicitudConflicto).filter(
                SolicitudConflicto.reservacion_id == reserva.id,
                SolicitudConflicto.solicitante_id == current_user.id,
                SolicitudConflicto.estado == "PENDIENTE",
            ).first()
            respuesta["estado"] = "SOLICITADO" if mi_solicitud else "OCUPADO"
            respuesta["ocupaciones"].append({
                "hora": f"{slot.hora_inicio}–{slot.hora_fin}",
                "reservacion_id": reserva.id,
                "docente": docente.nombre if docente else "Docente",
                "materia": reserva.materia,
                "grupo": reserva.grupo,
            })
            todos_vinculados = False
        elif not reserva or not (carga_id and reserva.carga_docente_id == carga_id):
            todos_vinculados = False
    if todos_vinculados and slots:
        respuesta["estado"] = "RESERVADO"
    return respuesta


def _cancelar_reservas_carga(db: Session, carga_id: int):
    reservas = db.query(Reservacion).filter(
        Reservacion.carga_docente_id == carga_id,
        Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA"]),
    ).all()
    for reserva in reservas:
        reserva.estado = "CANCELADA"


def _traslapa(inicio_a, fin_a, inicio_b, fin_b):
    return inicio_a < fin_b and fin_a > inicio_b


def _advertencias(db: Session, carga: CargaDocente, excluir_id=None):
    avisos = []
    q = db.query(CargaDocente).filter(
        CargaDocente.activo == True,
        CargaDocente.periodo_id == carga.periodo_id,
        CargaDocente.dia_semana == carga.dia_semana,
    )
    if excluir_id:
        q = q.filter(CargaDocente.id != excluir_id)
    for otra in q.all():
        if not _traslapa(carga.hora_inicio, carga.hora_fin, otra.hora_inicio, otra.hora_fin):
            continue
        if otra.docente_id == carga.docente_id:
            raise HTTPException(
                409,
                f"Ya tienes otra actividad de {otra.hora_inicio} a {otra.hora_fin}. "
                "Revisa el horario oficial antes de continuar.",
            )
        if carga.grupo_academico_id and otra.grupo_academico_id == carga.grupo_academico_id:
            avisos.append("El grupo aparece en otra actividad a la misma hora.")
        if carga.espacio_nombre and otra.espacio_nombre and (
            carga.espacio_nombre.strip().upper() == otra.espacio_nombre.strip().upper()
        ):
            avisos.append("El salón o espacio aparece ocupado a la misma hora.")
    return list(dict.fromkeys(avisos))


def _normalizar_identidad(valor):
    return " ".join(str(valor or "").strip().upper().split())


def _validar_identidad_academica(db: Session, data: CargaInput):
    if data.tipo_actividad != "CLASE":
        return
    grupo = db.query(GrupoAcademico).filter(
        GrupoAcademico.id == data.grupo_academico_id,
        GrupoAcademico.periodo_id == data.periodo_id,
        GrupoAcademico.activo == True,
    ).first()
    materia = db.query(CatalogoMateria).filter(
        CatalogoMateria.id == data.materia_id,
        CatalogoMateria.activo == True,
    ).first()
    if not grupo:
        raise HTTPException(422, "El grupo no pertenece al periodo seleccionado o ya no está activo")
    if not materia:
        raise HTTPException(422, "Selecciona una materia activa del catálogo académico")
    if materia.carrera and _normalizar_identidad(materia.carrera) != _normalizar_identidad(grupo.carrera):
        raise HTTPException(422, "La materia y el grupo pertenecen a carreras diferentes")
    if materia.cuatrimestre_oficial is not None and materia.cuatrimestre_oficial != grupo.cuatrimestre:
        raise HTTPException(422, "La materia y el grupo pertenecen a cuatrimestres diferentes")
    periodo = db.get(PeriodoEscolar, data.periodo_id)
    if materia.periodo and periodo and _normalizar_periodo(materia.periodo) != _normalizar_periodo(periodo.clave):
        raise HTTPException(422, "La materia no corresponde al periodo académico seleccionado")


def _serializar_carga(c: CargaDocente, db: Session):
    grupo = c.grupo_academico
    lab = c.laboratorio
    reservas_lab = db.query(Reservacion).filter(
        Reservacion.carga_docente_id == c.id,
        Reservacion.estado.in_(["PROGRAMADA", "EN_DISPUTA", "EN_CURSO"]),
    ).all()
    estado_reserva_lab = (
        "EN_DISPUTA" if any(r.estado == "EN_DISPUTA" for r in reservas_lab)
        else "RESERVADO" if reservas_lab else "SIN_RESERVACION"
    )
    return {
        "id": c.id,
        "periodo_id": c.periodo_id,
        "periodo": c.periodo.clave if c.periodo else None,
        "grupo_academico_id": c.grupo_academico_id,
        "grupo": (
            f"{grupo.cuatrimestre}° {grupo.grupo}" if grupo else None
        ),
        "carrera": grupo.carrera if grupo else None,
        "materia_id": c.materia_id,
        "actividad_nombre": c.actividad_nombre,
        "tipo_actividad": c.tipo_actividad,
        "dia_semana": c.dia_semana,
        "hora_inicio": c.hora_inicio,
        "hora_fin": c.hora_fin,
        "espacio_nombre": lab.nombre if lab else c.espacio_nombre,
        "laboratorio_id": c.laboratorio_id,
        "estado_reserva_laboratorio": estado_reserva_lab if c.laboratorio_id else None,
        "estado": c.estado,
        "observaciones": c.observaciones,
        "puede_iniciar_hoy": (
            c.tipo_actividad == "CLASE"
            and c.estado == "ACTIVO"
            and c.dia_semana == _ahora_mx().weekday()
        ),
    }


def _serializar_clase(clase: ClaseDocente):
    carga = clase.carga
    asistencias = clase.asistencias
    conteos = {estado: 0 for estado in ESTADOS_ASISTENCIA}
    for asistencia in asistencias:
        conteos[asistencia.estado] = conteos.get(asistencia.estado, 0) + 1
    return {
        "id": clase.id,
        "fecha": clase.fecha.isoformat(),
        "estado": clase.estado,
        "inicio": clase.inicio.isoformat() if clase.inicio else None,
        "fin": clase.fin.isoformat() if clase.fin else None,
        "observacion_general": clase.observacion_general,
        "es_extemporanea": clase.es_extemporanea,
        "motivo_extemporaneo": clase.motivo_extemporaneo,
        "capturada_extemporanea_en": (
            clase.capturada_extemporanea_en.isoformat()
            if clase.capturada_extemporanea_en else None
        ),
        "bitacora": {
            "tema_impartido": clase.tema_impartido,
            "avance_planeacion": clase.avance_planeacion,
            "actividades_realizadas": clase.actividades_realizadas,
            "tarea_asignada": clase.tarea_asignada,
            "incidencias": clase.incidencias,
            "tema_pendiente": clase.tema_pendiente,
        },
        "carga": {
            "id": carga.id,
            "periodo_id": carga.periodo_id,
            "periodo": carga.periodo.clave if carga.periodo else None,
            "actividad_nombre": carga.actividad_nombre,
            "grupo": (
                f"{carga.grupo_academico.cuatrimestre}° {carga.grupo_academico.grupo}"
                if carga.grupo_academico else None
            ),
            "carrera": carga.grupo_academico.carrera if carga.grupo_academico else None,
            "espacio_nombre": carga.laboratorio.nombre if carga.laboratorio else carga.espacio_nombre,
            "hora_inicio": carga.hora_inicio,
            "hora_fin": carga.hora_fin,
        },
        "resumen": {"total": len(asistencias), **{k.lower(): v for k, v in conteos.items()}},
        "alumnos": [
            {
                "asistencia_id": a.id,
                "alumno_id": a.alumno_id,
                "matricula": a.alumno.matricula,
                "nombre": (
                    f"{a.alumno.apellido_paterno} {a.alumno.apellido_materno} "
                    f"{a.alumno.nombres}"
                ).strip(),
                "estado": a.estado,
                "observacion": a.observacion,
            }
            for a in sorted(asistencias, key=lambda x: (x.alumno.apellido_paterno, x.alumno.nombres))
        ],
    }


def _fecha_programada_carga(carga: CargaDocente, fecha: datetime.date):
    hora = datetime.time.fromisoformat(carga.hora_inicio)
    return datetime.datetime.combine(fecha, hora, tzinfo=MX)


def _validar_ventana_extemporanea(carga: CargaDocente, fecha: datetime.date):
    ahora = _ahora_mx()
    programada = _fecha_programada_carga(carga, fecha)
    if carga.dia_semana != fecha.weekday():
        raise HTTPException(422, "La fecha no corresponde al día programado de esta clase")
    if programada > ahora:
        raise HTTPException(409, "La clase todavía no ha ocurrido")
    if ahora - programada > datetime.timedelta(hours=48):
        raise HTTPException(409, "El plazo de 48 horas para capturar esta asistencia ya venció")
    return programada


@router.get("/catalogos")
def catalogos_docente(
    periodo_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    periodos = db.query(PeriodoEscolar).filter(PeriodoEscolar.activo == True).order_by(
        PeriodoEscolar.id.desc()
    ).all()
    actual = _periodo_actual(db)
    elegido = periodo_id or (actual.id if actual else None)
    if not elegido and periodos:
        hoy = _ahora_mx()
        bloque = "ENE-ABR" if hoy.month <= 4 else "MAY-AGO" if hoy.month <= 8 else "SEP-DIC"
        esperado = f"{bloque}{hoy.year}"
        elegido = next(
            (p.id for p in periodos if "".join(ch for ch in p.clave.upper() if ch.isalnum()) == esperado),
            periodos[0].id,
        )
    grupos_q = db.query(GrupoAcademico).filter(GrupoAcademico.activo == True)
    materias_q = db.query(CatalogoMateria).filter(CatalogoMateria.activo == True)
    if elegido:
        grupos_q = grupos_q.filter(GrupoAcademico.periodo_id == elegido)
        periodo = db.query(PeriodoEscolar).get(elegido)
        if periodo:
            materias_q = materias_q.filter(
                (CatalogoMateria.periodo == periodo.clave) | (CatalogoMateria.periodo == None)
            )
    grupos = grupos_q.order_by(
        GrupoAcademico.carrera, GrupoAcademico.cuatrimestre, GrupoAcademico.grupo
    ).all()
    return {
        "periodo_sugerido_id": elegido,
        "periodos": [{
            "id": p.id,
            "clave": p.clave,
            "es_actual": bool(actual and p.id == actual.id),
            "es_actual_configurado": p.es_actual,
        } for p in periodos],
        "grupos": [{
            "id": g.id, "carrera": g.carrera, "cuatrimestre": g.cuatrimestre,
            "grupo": g.grupo, "label": f"{g.cuatrimestre}° {g.grupo} · {g.carrera}",
            "total_alumnos": sum(1 for i in g.inscripciones if i.estado == "ACTIVO"),
        } for g in grupos],
        "materias": [{
            "id": m.id, "nombre": m.nombre, "carrera": m.carrera,
            "cuatrimestre_oficial": m.cuatrimestre_oficial,
        } for m in materias_q.all()],
        "laboratorios": [{"id": l.id, "nombre": l.nombre} for l in db.query(Laboratorio).filter(Laboratorio.activo == True).all()],
        "espacios": [{"id": e.id, "nombre": e.nombre} for e in db.query(EspacioInstitucional).filter(EspacioInstitucional.activo == True).all()],
    }


@router.get("/horario")
def mi_horario(
    periodo_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    q = db.query(CargaDocente).filter(
        CargaDocente.docente_id == _docente_objetivo(current_user),
        CargaDocente.activo == True,
    )
    elegido = periodo_id
    if not elegido:
        actual = _periodo_actual(db)
        elegido = actual.id if actual else None
    if elegido:
        q = q.filter(CargaDocente.periodo_id == elegido)
    else:
        return []
    return [_serializar_carga(c, db) for c in q.order_by(
        CargaDocente.dia_semana, CargaDocente.hora_inicio
    ).all()]


@router.post("/horario")
def crear_carga(
    data: CargaInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    _validar_periodo_actual(db, data.periodo_id)
    _validar_identidad_academica(db, data)
    carga = CargaDocente(docente_id=current_user.id, estado="BORRADOR", **data.model_dump())
    db.add(carga)
    db.flush()
    avisos = _advertencias(db, carga, carga.id)
    db.commit()
    db.refresh(carga)
    return {"carga": _serializar_carga(carga, db), "advertencias": avisos}


@router.put("/horario/{carga_id}")
def actualizar_carga(
    carga_id: int,
    data: CargaInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id, CargaDocente.docente_id == current_user.id
    ).first()
    if not carga:
        raise HTTPException(404, "Actividad no encontrada")
    _validar_carga_actual(db, carga)
    _validar_periodo_actual(db, data.periodo_id)
    _validar_identidad_academica(db, data)
    cambia_laboratorio = any(
        getattr(carga, campo) != getattr(data, campo)
        for campo in ("laboratorio_id", "dia_semana", "hora_inicio", "hora_fin", "periodo_id")
    )
    if cambia_laboratorio:
        _cancelar_reservas_carga(db, carga.id)
    for campo, valor in data.model_dump().items():
        setattr(carga, campo, valor)
    carga.estado = "BORRADOR"
    avisos = _advertencias(db, carga, carga.id)
    db.commit()
    db.refresh(carga)
    return {"carga": _serializar_carga(carga, db), "advertencias": avisos}


@router.post("/horario/{carga_id}/activar")
def activar_carga(
    carga_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id, CargaDocente.docente_id == current_user.id,
        CargaDocente.activo == True,
    ).first()
    if not carga:
        raise HTTPException(404, "Actividad no encontrada")
    _validar_carga_actual(db, carga)
    avisos = _advertencias(db, carga, carga.id)
    carga.estado = "ACTIVO"
    db.commit()
    return {"carga": _serializar_carga(carga, db), "advertencias": avisos}


@router.delete("/horario/{carga_id}")
def eliminar_carga(
    carga_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id, CargaDocente.docente_id == current_user.id
    ).first()
    if not carga:
        raise HTTPException(404, "Actividad no encontrada")
    _validar_carga_actual(db, carga)
    _cancelar_reservas_carga(db, carga.id)
    carga.activo = False
    db.commit()
    return {"mensaje": "Actividad retirada del horario"}


@router.post("/horario/copiar-periodo")
def copiar_horario_periodo(
    data: CopiarHorarioInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    if data.periodo_origen_id == data.periodo_destino_id:
        raise HTTPException(422, "El periodo de origen y destino deben ser diferentes")
    destino = _validar_periodo_actual(db, data.periodo_destino_id)
    origen = db.query(PeriodoEscolar).filter(
        PeriodoEscolar.id == data.periodo_origen_id,
        PeriodoEscolar.activo == True,
    ).first()
    if not origen:
        raise HTTPException(404, "Periodo de origen no encontrado")
    existentes = db.query(CargaDocente.id).filter(
        CargaDocente.docente_id == current_user.id,
        CargaDocente.periodo_id == destino.id,
        CargaDocente.activo == True,
    ).first()
    if existentes:
        raise HTTPException(
            409,
            "El periodo actual ya tiene actividades. La copia se detuvo para evitar duplicados.",
        )
    cargas_origen = db.query(CargaDocente).filter(
        CargaDocente.docente_id == current_user.id,
        CargaDocente.periodo_id == origen.id,
        CargaDocente.activo == True,
    ).order_by(CargaDocente.dia_semana, CargaDocente.hora_inicio).all()
    if not cargas_origen:
        raise HTTPException(404, "No hay actividades en el periodo de origen")
    nuevas = []
    for anterior in cargas_origen:
        es_clase = anterior.tipo_actividad == "CLASE"
        nueva = CargaDocente(
            docente_id=current_user.id,
            periodo_id=destino.id,
            grupo_academico_id=None if es_clase else anterior.grupo_academico_id,
            materia_id=None if es_clase else anterior.materia_id,
            tipo_actividad=anterior.tipo_actividad,
            actividad_nombre=anterior.actividad_nombre,
            dia_semana=anterior.dia_semana,
            hora_inicio=anterior.hora_inicio,
            hora_fin=anterior.hora_fin,
            espacio_nombre=anterior.espacio_nombre,
            laboratorio_id=None,
            estado="BORRADOR",
            observaciones=(
                f"Copiado de {origen.clave}. Revalidar grupo, materia y espacio."
                if es_clase else f"Copiado de {origen.clave}. Revalidar espacio."
            ),
        )
        db.add(nueva)
        nuevas.append(nueva)
    db.commit()
    for nueva in nuevas:
        db.refresh(nueva)
    return {
        "mensaje": f"Se copiaron {len(nuevas)} actividades como borradores.",
        "total": len(nuevas),
        "cargas": [_serializar_carga(carga, db) for carga in nuevas],
    }


@router.post("/horario/verificar-laboratorio")
def verificar_laboratorio_carga(
    data: CargaInput,
    carga_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    if carga_id:
        propia = db.query(CargaDocente.id).filter(
            CargaDocente.id == carga_id, CargaDocente.docente_id == current_user.id,
        ).first()
        if not propia:
            raise HTTPException(404, "Actividad no encontrada")
    return _estado_laboratorio(db, data, current_user, carga_id)


@router.get("/horario/{carga_id}/estado-laboratorio")
def estado_laboratorio_carga(
    carga_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id, CargaDocente.docente_id == current_user.id,
    ).first()
    if not carga:
        raise HTTPException(404, "Actividad no encontrada")
    data = CargaInput.model_validate({
        campo: getattr(carga, campo) for campo in CargaInput.model_fields
    })
    return _estado_laboratorio(db, data, current_user, carga.id)


@router.post("/horario/{carga_id}/reservar-laboratorio")
def reservar_laboratorio_carga(
    carga_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id,
        CargaDocente.docente_id == current_user.id,
        CargaDocente.activo == True,
        CargaDocente.tipo_actividad == "CLASE",
    ).first()
    if not carga or not carga.laboratorio_id or not carga.grupo_academico:
        raise HTTPException(422, "La clase debe tener laboratorio, materia y grupo")
    _validar_carga_actual(db, carga)
    data = CargaInput.model_validate({
        campo: getattr(carga, campo) for campo in CargaInput.model_fields
    })
    disponibilidad = _estado_laboratorio(db, data, current_user, carga.id)
    if disponibilidad["estado"] == "RESERVADO":
        return disponibilidad
    if disponibilidad["estado"] != "DISPONIBLE":
        raise HTTPException(409, {
            "mensaje": "El laboratorio no está disponible en todo el horario.",
            "disponibilidad": disponibilidad,
        })
    for slot in disponibilidad["slots"]:
        db.add(Reservacion(
            horario_id=slot["id"],
            laboratorio_id=carga.laboratorio_id,
            docente_id=current_user.id,
            carga_docente_id=carga.id,
            materia=carga.actividad_nombre,
            carrera=carga.grupo_academico.carrera,
            cuatrimestre=carga.periodo.clave,
            cuatrimestre_materia=str(carga.grupo_academico.cuatrimestre),
            grupo=f"{carga.grupo_academico.cuatrimestre}° {carga.grupo_academico.grupo}",
            estado="PROGRAMADA",
            creado_por=current_user.id,
            observaciones="Reservación vinculada desde Mi horario docente",
        ))
    db.commit()
    disponibilidad["estado"] = "RESERVADO"
    return disponibilidad


@router.get("/capturas-extemporaneas/disponibles")
def capturas_extemporaneas_disponibles(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    actual = _periodo_actual(db)
    if not actual:
        return []
    ahora = _ahora_mx()
    cargas = db.query(CargaDocente).filter(
        CargaDocente.docente_id == current_user.id,
        CargaDocente.periodo_id == actual.id,
        CargaDocente.activo == True,
        CargaDocente.estado == "ACTIVO",
        CargaDocente.tipo_actividad == "CLASE",
        CargaDocente.grupo_academico_id.isnot(None),
    ).all()
    opciones = []
    for dias_atras in range(0, 3):
        fecha = ahora.date() - datetime.timedelta(days=dias_atras)
        for carga in cargas:
            if carga.dia_semana != fecha.weekday():
                continue
            programada = _fecha_programada_carga(carga, fecha)
            if programada > ahora or ahora - programada > datetime.timedelta(hours=48):
                continue
            existe = db.query(ClaseDocente.id).filter(
                ClaseDocente.carga_docente_id == carga.id,
                ClaseDocente.fecha == fecha,
            ).first()
            if existe:
                continue
            opciones.append({
                "carga_id": carga.id,
                "fecha": fecha.isoformat(),
                "materia": carga.actividad_nombre,
                "grupo": (
                    f"{carga.grupo_academico.cuatrimestre}° {carga.grupo_academico.grupo}"
                    if carga.grupo_academico else None
                ),
                "carrera": carga.grupo_academico.carrera if carga.grupo_academico else None,
                "hora_inicio": carga.hora_inicio,
                "hora_fin": carga.hora_fin,
                "vence_en": (programada + datetime.timedelta(hours=48)).isoformat(),
            })
    opciones.sort(key=lambda item: (item["fecha"], item["hora_inicio"]), reverse=True)
    return opciones


@router.post("/horario/{carga_id}/captura-extemporanea")
def crear_captura_extemporanea(
    carga_id: int,
    data: CapturaExtemporaneaInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id,
        CargaDocente.docente_id == current_user.id,
        CargaDocente.activo == True,
        CargaDocente.estado == "ACTIVO",
        CargaDocente.tipo_actividad == "CLASE",
    ).first()
    if not carga or not carga.grupo_academico_id:
        raise HTTPException(404, "Clase programada no encontrada")
    _validar_carga_actual(db, carga)
    _validar_ventana_extemporanea(carga, data.fecha)
    existente = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id == carga.id,
        ClaseDocente.fecha == data.fecha,
    ).first()
    if existente:
        raise HTTPException(409, "Esta clase ya tiene un registro de asistencia")
    clase = ClaseDocente(
        carga_docente_id=carga.id,
        fecha=data.fecha,
        estado="ABIERTA",
        es_extemporanea=True,
        motivo_extemporaneo=data.motivo.strip(),
        capturada_extemporanea_en=datetime.datetime.utcnow(),
    )
    db.add(clase)
    db.flush()
    inscripciones = db.query(InscripcionAlumno).filter(
        InscripcionAlumno.grupo_academico_id == carga.grupo_academico_id,
        InscripcionAlumno.estado == "ACTIVO",
    ).all()
    for inscripcion in inscripciones:
        db.add(AsistenciaDocente(
            clase_docente_id=clase.id,
            alumno_id=inscripcion.alumno_id,
            estado="PRESENTE",
        ))
    db.commit()
    db.refresh(clase)
    return _serializar_clase(clase)


@router.get("/hoy")
def clases_de_hoy(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    hoy = _ahora_mx()
    actual = _periodo_actual(db)
    if not actual:
        return []
    cargas = db.query(CargaDocente).filter(
        CargaDocente.docente_id == current_user.id,
        CargaDocente.activo == True,
        CargaDocente.estado == "ACTIVO",
        CargaDocente.dia_semana == hoy.weekday(),
        CargaDocente.periodo_id == actual.id,
    ).order_by(CargaDocente.hora_inicio).all()
    resultado = []
    for carga in cargas:
        clase = db.query(ClaseDocente).filter(
            ClaseDocente.carga_docente_id == carga.id,
            ClaseDocente.fecha == hoy.date(),
        ).first()
        item = _serializar_carga(carga, db)
        item["clase_id"] = clase.id if clase else None
        item["clase_estado"] = clase.estado if clase else None
        resultado.append(item)
    return resultado


@router.post("/horario/{carga_id}/iniciar")
def iniciar_clase(
    carga_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    hoy = _ahora_mx()
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id,
        CargaDocente.docente_id == current_user.id,
        CargaDocente.activo == True,
    ).first()
    if not carga:
        raise HTTPException(404, "Actividad no encontrada")
    _validar_carga_actual(db, carga)
    if carga.tipo_actividad != "CLASE" or not carga.grupo_academico_id:
        raise HTTPException(400, "Solo una clase con grupo puede generar asistencia")
    if carga.estado != "ACTIVO":
        raise HTTPException(409, "Activa primero este bloque del horario")
    if carga.dia_semana != hoy.weekday():
        raise HTTPException(409, "Esta clase no corresponde al día de hoy")
    existente = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id == carga.id, ClaseDocente.fecha == hoy.date()
    ).first()
    if existente:
        return _serializar_clase(existente)
    clase = ClaseDocente(carga_docente_id=carga.id, fecha=hoy.date(), estado="ABIERTA")
    db.add(clase)
    db.flush()
    inscripciones = db.query(InscripcionAlumno).filter(
        InscripcionAlumno.grupo_academico_id == carga.grupo_academico_id,
        InscripcionAlumno.estado == "ACTIVO",
    ).all()
    for inscripcion in inscripciones:
        db.add(AsistenciaDocente(
            clase_docente_id=clase.id,
            alumno_id=inscripcion.alumno_id,
            estado="PRESENTE",
        ))
    db.commit()
    db.refresh(clase)
    return _serializar_clase(clase)


@router.get("/clases/{clase_id}")
def detalle_clase(
    clase_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    clase = db.query(ClaseDocente).join(CargaDocente).filter(
        ClaseDocente.id == clase_id,
        CargaDocente.docente_id == current_user.id,
    ).first()
    if not clase:
        raise HTTPException(404, "Clase no encontrada")
    return _serializar_clase(clase)


@router.patch("/clases/{clase_id}/asistencia/{asistencia_id}")
def cambiar_asistencia(
    clase_id: int,
    asistencia_id: int,
    data: AsistenciaInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    estado = data.estado.upper()
    if estado not in ESTADOS_ASISTENCIA:
        raise HTTPException(422, "Estado de asistencia no válido")
    asistencia = db.query(AsistenciaDocente).join(ClaseDocente).join(CargaDocente).filter(
        AsistenciaDocente.id == asistencia_id,
        AsistenciaDocente.clase_docente_id == clase_id,
        CargaDocente.docente_id == current_user.id,
    ).first()
    if not asistencia:
        raise HTTPException(404, "Registro de asistencia no encontrado")
    _validar_carga_actual(db, asistencia.clase.carga)
    if asistencia.clase.estado not in {"ABIERTA", "CORRECCION"}:
        raise HTTPException(409, "La asistencia de esta clase ya está cerrada")
    asistencia.estado = estado
    asistencia.observacion = data.observacion
    db.commit()
    return {"id": asistencia.id, "estado": asistencia.estado, "observacion": asistencia.observacion}


@router.post("/clases/{clase_id}/cerrar")
def cerrar_clase(
    clase_id: int,
    data: CierreInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    clase = db.query(ClaseDocente).join(CargaDocente).filter(
        ClaseDocente.id == clase_id,
        CargaDocente.docente_id == current_user.id,
    ).first()
    if not clase:
        raise HTTPException(404, "Clase no encontrada")
    _validar_carga_actual(db, clase.carga)
    if clase.estado not in {"ABIERTA", "CORRECCION"}:
        raise HTTPException(409, "La asistencia ya está cerrada")
    clase.estado = "CERRADA"
    clase.fin = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    if data.observacion_general:
        clase.observacion_general = data.observacion_general
    for campo in (
        "tema_impartido", "avance_planeacion", "actividades_realizadas",
        "tarea_asignada", "incidencias", "tema_pendiente",
    ):
        valor = getattr(data, campo)
        if valor is not None:
            setattr(clase, campo, valor)
    db.commit()
    return _serializar_clase(clase)


@router.post("/clases/{clase_id}/habilitar-correccion")
def habilitar_correccion(
    clase_id: int,
    data: CorreccionInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    clase = db.query(ClaseDocente).join(CargaDocente).filter(
        ClaseDocente.id == clase_id,
        CargaDocente.docente_id == current_user.id,
    ).first()
    if not clase:
        raise HTTPException(404, "Clase no encontrada")
    _validar_carga_actual(db, clase.carga)
    if clase.estado != "CERRADA":
        raise HTTPException(409, "Solo se puede corregir una asistencia cerrada")
    marca = _ahora_mx().strftime("%d/%m/%Y %H:%M")
    registro = f"[Corrección {marca}] {data.motivo.strip()}"
    clase.observacion_general = "\n".join(
        parte for parte in [clase.observacion_general, registro] if parte
    )
    clase.estado = "CORRECCION"
    db.commit()
    return _serializar_clase(clase)


@router.get("/seguimiento/{carga_id}")
def seguimiento_grupo(
    carga_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id,
        CargaDocente.docente_id == current_user.id,
        CargaDocente.activo == True,
        CargaDocente.tipo_actividad == "CLASE",
    ).first()
    if not carga or not carga.grupo_academico_id:
        raise HTTPException(404, "Carga docente con grupo no encontrada")
    clases = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id == carga.id,
    ).order_by(ClaseDocente.fecha.desc()).all()
    inscripciones = db.query(InscripcionAlumno).filter(
        InscripcionAlumno.grupo_academico_id == carga.grupo_academico_id,
        InscripcionAlumno.estado == "ACTIVO",
    ).all()
    registros = db.query(SeguimientoAlumnoDocente).filter(
        SeguimientoAlumnoDocente.carga_docente_id == carga.id,
        SeguimientoAlumnoDocente.docente_id == current_user.id,
    ).order_by(SeguimientoAlumnoDocente.creado_en.desc()).all()
    registros_por_alumno = {}
    for registro in registros:
        registros_por_alumno.setdefault(registro.alumno_id, []).append(registro)
    alumnos = {
        i.alumno_id: {
            "alumno_id": i.alumno_id,
            "matricula": i.alumno.matricula,
            "nombre": (
                f"{i.alumno.apellido_paterno} {i.alumno.apellido_materno} {i.alumno.nombres}"
            ).strip(),
            "presente": 0, "falta": 0, "retardo": 0, "justificada": 0,
        }
        for i in inscripciones
    }
    for clase in clases:
        for asistencia in clase.asistencias:
            fila = alumnos.get(asistencia.alumno_id)
            if fila:
                clave = asistencia.estado.lower()
                fila[clave] = fila.get(clave, 0) + 1
    total_clases = len(clases)
    filas = []
    for fila in alumnos.values():
        asistio = fila["presente"] + fila["retardo"] + fila["justificada"]
        fila["porcentaje_asistencia"] = round(
            (asistio / total_clases * 100) if total_clases else 0, 1
        )
        estados_recientes = []
        for clase in clases:
            asistencia = next((a for a in clase.asistencias if a.alumno_id == fila["alumno_id"]), None)
            if asistencia:
                estados_recientes.append(asistencia.estado)
        faltas_consecutivas = 0
        for estado in estados_recientes:
            if estado != "FALTA":
                break
            faltas_consecutivas += 1
        regs_alumno = registros_por_alumno.get(fila["alumno_id"], [])
        calificaciones = [r.calificacion for r in reversed(regs_alumno) if r.tipo == "CALIFICACION" and r.calificacion is not None]
        descenso = (
            len(calificaciones) >= 4
            and (sum(calificaciones[-2:]) / 2) <= (sum(calificaciones[-4:-2]) / 2) - 1
        )
        alertas = []
        if faltas_consecutivas >= 2:
            alertas.append({"tipo": "FALTAS_CONSECUTIVAS", "nivel": "ALTO" if faltas_consecutivas >= 3 else "MEDIO", "mensaje": f"{faltas_consecutivas} faltas consecutivas", "accion": "Contactar al alumno y documentar el motivo."})
        riesgo_proyectado = total_clases >= 4 and ((asistio / (total_clases + 1)) * 100) < 80
        if total_clases and (fila["porcentaje_asistencia"] < 80 or riesgo_proyectado):
            alertas.append({"tipo": "RIESGO_INASISTENCIA", "nivel": "ALTO", "mensaje": "En riesgo por límite de inasistencias", "accion": "Revisar justificantes y canalizar a tutoría si corresponde."})
        if calificaciones and (calificaciones[-1] < 7 or descenso):
            alertas.append({"tipo": "DESEMPENO", "nivel": "MEDIO", "mensaje": "Descenso o desempeño académico bajo", "accion": "Acordar una actividad de recuperación y fecha de revisión."})
        requiere_tutoria = any(r.tipo == "TUTORIA" and r.estado not in {"ATENDIDO", "CERRADO"} for r in regs_alumno)
        if requiere_tutoria:
            alertas.append({"tipo": "TUTORIA", "nivel": "MEDIO", "mensaje": "Seguimiento de tutoría pendiente", "accion": "Confirmar atención y registrar el acuerdo alcanzado."})
        fila["faltas_consecutivas"] = faltas_consecutivas
        fila["alertas"] = alertas
        fila["alerta"] = bool(alertas)
        fila["ultima_calificacion"] = calificaciones[-1] if calificaciones else None
        filas.append(fila)
    filas.sort(key=lambda x: x["nombre"])
    promedio = round(
        sum(f["porcentaje_asistencia"] for f in filas) / len(filas), 1
    ) if filas else 0
    return {
        "carga": _serializar_carga(carga, db),
        "total_clases": total_clases,
        "total_alumnos": len(filas),
        "promedio_asistencia": promedio,
        "alumnos_en_alerta": sum(1 for f in filas if f["alerta"]),
        "clases_sin_cerrar": [
            {"id": c.id, "fecha": c.fecha.isoformat(), "estado": c.estado}
            for c in clases if c.estado != "CERRADA"
        ],
        "alumnos": filas,
        "clases": [_serializar_clase(c) for c in clases[:12]],
    }


def _carga_y_alumno_docente(db: Session, carga_id: int, alumno_id: int, docente_id: int):
    carga = db.query(CargaDocente).filter(
        CargaDocente.id == carga_id,
        CargaDocente.docente_id == docente_id,
        CargaDocente.activo == True,
        CargaDocente.tipo_actividad == "CLASE",
    ).first()
    if not carga:
        raise HTTPException(404, "Alumno no encontrado en este grupo")
    inscripcion = db.query(InscripcionAlumno).filter(
        InscripcionAlumno.grupo_academico_id == carga.grupo_academico_id,
        InscripcionAlumno.alumno_id == alumno_id,
        InscripcionAlumno.estado == "ACTIVO",
    ).first()
    if not inscripcion:
        raise HTTPException(404, "Alumno no encontrado en este grupo")
    return carga, inscripcion.alumno


def _contexto_alumno_docente(db: Session, carga: CargaDocente, alumno: CatalogoAlumno, docente_id: int):
    cargas_grupo = db.query(CargaDocente).filter(
        CargaDocente.grupo_academico_id == carga.grupo_academico_id,
        CargaDocente.periodo_id == carga.periodo_id,
        CargaDocente.activo == True,
        CargaDocente.tipo_actividad == "CLASE",
    ).all()
    carga_ids = [item.id for item in cargas_grupo]
    clases = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id.in_(carga_ids),
    ).all() if carga_ids else []
    clase_ids = [clase.id for clase in clases]
    asistencias = db.query(AsistenciaDocente).filter(
        AsistenciaDocente.alumno_id == alumno.id,
        AsistenciaDocente.clase_docente_id.in_(clase_ids),
    ).all() if clase_ids else []
    asistio = sum(1 for item in asistencias if item.estado in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
    porcentaje_global = (asistio / len(asistencias) * 100) if asistencias else 100
    calificacion_baja = db.query(SeguimientoAlumnoDocente.id).filter(
        SeguimientoAlumnoDocente.alumno_id == alumno.id,
        SeguimientoAlumnoDocente.carga_docente_id.in_(carga_ids),
        SeguimientoAlumnoDocente.tipo == "CALIFICACION",
        SeguimientoAlumnoDocente.calificacion < 7,
    ).first() if carga_ids else None
    riesgo_global = bool(
        (len(asistencias) >= 4 and porcentaje_global < 80)
        or calificacion_baja
    )
    canalizacion_activa = db.query(Canalizacion.id).filter(
        Canalizacion.alumno_id == alumno.id,
        Canalizacion.estado.in_(["PENDIENTE", "EN_SEGUIMIENTO"]),
    ).first() is not None
    reporte_activo = db.query(ReporteTutor.id).filter(
        ReporteTutor.alumno_id == alumno.id,
        ReporteTutor.estado.in_(["ENVIADO", "RECIBIDO", "EN_SEGUIMIENTO", "CANALIZADO", "SIN_TUTOR"]),
    ).first() is not None
    desde = datetime.datetime.utcnow() - datetime.timedelta(days=7)
    alerta_reciente = db.query(ReporteTutor).filter(
        ReporteTutor.alumno_id == alumno.id,
        ReporteTutor.reportado_por_id == docente_id,
        ReporteTutor.carga_docente_id == carga.id,
        ReporteTutor.creado_en >= desde,
        ReporteTutor.estado.notin_(["CERRADO", "ATENDIDO", "CANCELADO"]),
    ).order_by(ReporteTutor.creado_en.desc()).first()
    asignacion = db.query(AsignacionTutoria).filter(
        AsignacionTutoria.alumno_id == alumno.id,
        AsignacionTutoria.activo == True,
    ).order_by(AsignacionTutoria.asignado_en.desc()).first()
    grupo_tutorado = db.query(GrupoTutorado).filter(
        GrupoTutorado.id == asignacion.grupo_tutorado_id,
        GrupoTutorado.activo == True,
    ).first() if asignacion else None
    tutor = db.query(Usuario).filter(
        Usuario.id == grupo_tutorado.tutor_id,
        Usuario.activo == True,
    ).first() if grupo_tutorado else None
    return {
        "alumno_id": alumno.id,
        "riesgo_global": riesgo_global,
        "canalizacion_activa": canalizacion_activa,
        "seguimiento_activo": reporte_activo,
        "tutor_asignado": tutor.nombre if tutor else None,
        "alerta_reciente": ({
            "id": alerta_reciente.id,
            "estado": alerta_reciente.estado,
            "categoria": alerta_reciente.categoria,
            "creado_en": alerta_reciente.creado_en.isoformat(),
        } if alerta_reciente else None),
    }


@router.get("/seguimiento/{carga_id}/alumnos/{alumno_id}/contexto")
def contexto_alumno_docente(
    carga_id: int,
    alumno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga, alumno = _carga_y_alumno_docente(db, carga_id, alumno_id, current_user.id)
    return _contexto_alumno_docente(db, carga, alumno, current_user.id)


@router.get("/clases/{clase_id}/contexto-alumnos")
def contexto_alumnos_clase(
    clase_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    clase = db.query(ClaseDocente).join(CargaDocente).filter(
        ClaseDocente.id == clase_id,
        CargaDocente.docente_id == current_user.id,
    ).first()
    if not clase:
        raise HTTPException(404, "Clase no encontrada")
    return {
        str(asistencia.alumno_id): _contexto_alumno_docente(
            db, clase.carga, asistencia.alumno, current_user.id,
        )
        for asistencia in clase.asistencias
    }


@router.post("/seguimiento/{carga_id}/alumnos/{alumno_id}/alerta-temprana")
def crear_alerta_temprana(
    carga_id: int,
    alumno_id: int,
    data: AlertaTempranaInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga, alumno = _carga_y_alumno_docente(db, carga_id, alumno_id, current_user.id)
    _validar_carga_actual(db, carga)
    categorias = {
        "INASISTENCIA": ("ASISTENCIA", "Alerta por inasistencia"),
        "BAJO_DESEMPENO": ("ACADEMICO", "Alerta por bajo desempeño"),
        "CAMBIO_CONDUCTA": ("CONDUCTA", "Alerta por cambio de conducta"),
        "FALTA_PARTICIPACION": ("ACADEMICO", "Alerta por falta de participación"),
        "SITUACION_PERSONAL": ("PERSONAL", "Posible situación personal"),
        "OTRO": ("OTRO", "Señal de atención observada"),
    }
    categoria, titulo = categorias[data.senal]
    desde = datetime.datetime.utcnow() - datetime.timedelta(days=7)
    duplicado = db.query(ReporteTutor).filter(
        ReporteTutor.alumno_id == alumno.id,
        ReporteTutor.reportado_por_id == current_user.id,
        ReporteTutor.carga_docente_id == carga.id,
        ReporteTutor.categoria == categoria,
        ReporteTutor.creado_en >= desde,
        ReporteTutor.estado.notin_(["CERRADO", "ATENDIDO", "CANCELADO"]),
    ).first()
    if duplicado:
        raise HTTPException(409, "Ya enviaste una alerta similar durante los últimos 7 días. Puedes revisar su estado en la ficha del alumno.")
    grupo_tutorado = grupo_tutoria_para_academico(db, carga.grupo_academico_id)
    tutor = db.query(Usuario).filter(
        Usuario.id == grupo_tutorado.tutor_id,
        Usuario.activo == True,
    ).first() if grupo_tutorado else None
    prioridad = {"OBSERVACION": "BAJA", "ATENCION": "MEDIA", "URGENTE": "ALTA"}[data.nivel]
    detalle = data.comentario or f"Señal registrada desde {carga.actividad_nombre}."
    registro = SeguimientoAlumnoDocente(
        docente_id=current_user.id,
        carga_docente_id=carga.id,
        alumno_id=alumno.id,
        tipo="TUTORIA",
        titulo=titulo,
        detalle=detalle,
        estado="PENDIENTE",
        fecha_revision=(_ahora_mx() + datetime.timedelta(days=7)).date(),
    )
    db.add(registro)
    db.flush()
    reporte = ReporteTutor(
        alumno_id=alumno.id,
        reportado_por_id=current_user.id,
        tutor_destinatario_id=tutor.id if tutor else None,
        grupo_tutorado_id=grupo_tutorado.id if grupo_tutorado else None,
        carga_docente_id=carga.id,
        seguimiento_docente_id=registro.id,
        categoria=categoria,
        prioridad=prioridad,
        titulo=titulo,
        detalle=detalle,
        confidencial=data.senal in {"SITUACION_PERSONAL", "OTRO"},
        estado="ENVIADO" if tutor else "SIN_TUTOR",
    )
    db.add(reporte)
    db.flush()
    alumno_nombre = f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip()
    destinatarios = [tutor] if tutor else db.query(Usuario).filter(
        Usuario.rol.in_([RolUsuario.TUTORIA_ADMIN, RolUsuario.SUPER_ADMIN]),
        Usuario.activo == True,
    ).all()
    for destinatario in destinatarios:
        crear_notificacion(
            db, destinatario.id, "tutoria_alerta_temprana",
            "Nueva alerta temprana",
            f"{current_user.nombre} registró una señal de atención para {alumno_nombre}.",
            "/docente/mis-tutorados?tab=reportes" if tutor else "/admin/tutoria?tab=reportes-tutor",
            enviar_email=False,
        )
    db.commit()
    return {
        "id": reporte.id,
        "estado": reporte.estado,
        "destinatario": tutor.nombre if tutor else "Responsable de Tutoría",
        "mensaje": f"Alerta enviada a {tutor.nombre}" if tutor else "Alerta enviada al Responsable de Tutoría",
    }


@router.get("/seguimiento/{carga_id}/alumnos/{alumno_id}/faltas")
def faltas_justificables(
    carga_id: int,
    alumno_id: int,
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga, alumno = _carga_y_alumno_docente(
        db, carga_id, alumno_id, current_user.id,
    )
    _validar_carga_actual(db, carga)
    if fecha_fin < fecha_inicio:
        raise HTTPException(422, "La fecha final debe ser igual o posterior a la inicial")
    faltas = (
        db.query(AsistenciaDocente, ClaseDocente)
        .join(ClaseDocente, ClaseDocente.id == AsistenciaDocente.clase_docente_id)
        .filter(
            ClaseDocente.carga_docente_id == carga.id,
            ClaseDocente.fecha.between(fecha_inicio, fecha_fin),
            AsistenciaDocente.alumno_id == alumno.id,
            AsistenciaDocente.estado == "FALTA",
        )
        .order_by(ClaseDocente.fecha.asc())
        .all()
    )
    return {
        "alumno": {
            "id": alumno.id,
            "matricula": alumno.matricula,
            "nombre": (
                f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}"
            ).strip(),
        },
        "materia": carga.actividad_nombre,
        "faltas": [
            {
                "asistencia_id": asistencia.id,
                "clase_id": clase.id,
                "fecha": clase.fecha.isoformat(),
                "horario": f"{carga.hora_inicio}–{carga.hora_fin}",
                "estado": asistencia.estado,
            }
            for asistencia, clase in faltas
        ],
    }


@router.post("/seguimiento/{carga_id}/alumnos/{alumno_id}/justificar-faltas")
def justificar_faltas_multiples(
    carga_id: int,
    alumno_id: int,
    data: JustificacionMultipleInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga, alumno = _carga_y_alumno_docente(
        db, carga_id, alumno_id, current_user.id,
    )
    _validar_carga_actual(db, carga)
    registros = (
        db.query(AsistenciaDocente, ClaseDocente)
        .join(ClaseDocente, ClaseDocente.id == AsistenciaDocente.clase_docente_id)
        .filter(
            AsistenciaDocente.id.in_(data.asistencia_ids),
            AsistenciaDocente.alumno_id == alumno.id,
            ClaseDocente.carga_docente_id == carga.id,
            ClaseDocente.fecha.between(data.fecha_inicio, data.fecha_fin),
        )
        .all()
    )
    if len(registros) != len(data.asistencia_ids):
        raise HTTPException(
            422, "Una o más asistencias no pertenecen al alumno, materia o periodo indicado",
        )
    no_justificables = [
        asistencia.id for asistencia, _ in registros
        if asistencia.estado != "FALTA"
    ]
    if no_justificables:
        raise HTTPException(
            409, "Solo se pueden justificar registros que actualmente sean faltas",
        )

    justificacion = JustificacionAsistenciaDocente(
        docente_id=current_user.id,
        carga_docente_id=carga.id,
        alumno_id=alumno.id,
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin,
        motivo=data.motivo,
        folio=data.folio,
    )
    db.add(justificacion)
    db.flush()
    marca = _ahora_mx().strftime("%d/%m/%Y %H:%M")
    referencia = f" · Folio {data.folio}" if data.folio else ""
    nota = f"[Justificada {marca}{referencia}] {data.motivo}"
    for asistencia, _ in registros:
        db.add(DetalleJustificacionAsistencia(
            justificacion_id=justificacion.id,
            asistencia_id=asistencia.id,
            estado_anterior=asistencia.estado,
            estado_nuevo="JUSTIFICADA",
        ))
        asistencia.estado = "JUSTIFICADA"
        asistencia.observacion = "\n".join(
            parte for parte in [asistencia.observacion, nota] if parte
        )
    db.commit()
    return {
        "id": justificacion.id,
        "alumno_id": alumno.id,
        "faltas_justificadas": len(registros),
        "fecha_inicio": data.fecha_inicio.isoformat(),
        "fecha_fin": data.fecha_fin.isoformat(),
        "motivo": data.motivo,
        "folio": data.folio,
    }


@router.get("/seguimiento/{carga_id}/alumnos/{alumno_id}")
def ficha_alumno_docente(
    carga_id: int,
    alumno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga, alumno = _carga_y_alumno_docente(db, carga_id, alumno_id, current_user.id)
    clases = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id == carga.id,
    ).order_by(ClaseDocente.fecha.desc()).all()
    asistencias = []
    conteos = {estado.lower(): 0 for estado in ESTADOS_ASISTENCIA}
    for clase in clases:
        asistencia = next((a for a in clase.asistencias if a.alumno_id == alumno.id), None)
        if asistencia:
            conteos[asistencia.estado.lower()] += 1
            asistencias.append({
                "fecha": clase.fecha.isoformat(),
                "estado": asistencia.estado,
                "observacion": asistencia.observacion,
            })
    registros = db.query(SeguimientoAlumnoDocente).filter(
        SeguimientoAlumnoDocente.carga_docente_id == carga.id,
        SeguimientoAlumnoDocente.alumno_id == alumno.id,
        SeguimientoAlumnoDocente.docente_id == current_user.id,
    ).order_by(SeguimientoAlumnoDocente.creado_en.desc()).all()
    total = len(asistencias)
    asistio = conteos["presente"] + conteos["retardo"] + conteos["justificada"]
    seguimiento = seguimiento_grupo(carga_id, db, current_user)
    alertas = next(
        (fila["alertas"] for fila in seguimiento["alumnos"] if fila["alumno_id"] == alumno.id),
        [],
    )
    return {
        "alumno": {
            "id": alumno.id, "matricula": alumno.matricula,
            "nombre": f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip(),
            "carrera": alumno.carrera, "cuatrimestre": alumno.cuatrimestre, "grupo": alumno.grupo,
        },
        "carga": _serializar_carga(carga, db),
        "resumen": {**conteos, "total": total, "porcentaje_asistencia": round((asistio / total * 100) if total else 0, 1)},
        "alertas": alertas,
        "asistencias": asistencias,
        "registros": [{
            "id": r.id, "tipo": r.tipo, "titulo": r.titulo, "detalle": r.detalle,
            "calificacion": r.calificacion, "estado": r.estado,
            "fecha_revision": r.fecha_revision.isoformat() if r.fecha_revision else None,
            "resultado_atencion": r.resultado_atencion,
            "atendido_en": r.atendido_en.isoformat() if r.atendido_en else None,
            "creado_en": r.creado_en.isoformat(),
        } for r in registros],
    }


@router.post("/seguimiento/{carga_id}/alumnos/{alumno_id}/registros")
def registrar_seguimiento_alumno(
    carga_id: int,
    alumno_id: int,
    data: SeguimientoInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    carga, alumno = _carga_y_alumno_docente(db, carga_id, alumno_id, current_user.id)
    _validar_carga_actual(db, carga)
    registro = SeguimientoAlumnoDocente(
        docente_id=current_user.id, carga_docente_id=carga.id, alumno_id=alumno.id,
        tipo=data.tipo, titulo=data.titulo.strip(), detalle=data.detalle,
        calificacion=data.calificacion, estado=data.estado, fecha_revision=data.fecha_revision,
    )
    db.add(registro)
    db.flush()

    reporte = None
    tutor = None
    if data.tipo == "TUTORIA":
        grupo_tutorado = grupo_tutoria_para_academico(db, carga.grupo_academico_id)
        tutor = (
            db.query(Usuario).filter(Usuario.id == grupo_tutorado.tutor_id, Usuario.activo == True).first()
            if grupo_tutorado else None
        )
        reporte = ReporteTutor(
            alumno_id=alumno.id,
            reportado_por_id=current_user.id,
            tutor_destinatario_id=tutor.id if tutor else None,
            grupo_tutorado_id=grupo_tutorado.id if grupo_tutorado else None,
            carga_docente_id=carga.id,
            seguimiento_docente_id=registro.id,
            categoria=data.categoria_reporte,
            prioridad=data.prioridad_reporte,
            titulo=data.titulo.strip(),
            detalle=data.detalle,
            confidencial=data.confidencial,
            estado="ENVIADO" if tutor else "SIN_TUTOR",
        )
        db.add(reporte)
        db.flush()

        alumno_nombre = f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip()
        if tutor:
            crear_notificacion(
                db, tutor.id, "tutoria_reporte",
                "Nuevo reporte de un docente",
                f"{current_user.nombre} reportó un caso de {alumno_nombre}: {data.titulo.strip()}.",
                "/docente/mis-tutorados?tab=reportes", enviar_email=False,
            )
        else:
            responsables = db.query(Usuario).filter(
                Usuario.rol.in_([RolUsuario.TUTORIA_ADMIN, RolUsuario.SUPER_ADMIN]),
                Usuario.activo == True,
            ).all()
            for responsable in responsables:
                crear_notificacion(
                    db, responsable.id, "tutoria_reporte_sin_tutor",
                    "Reporte sin tutor asignado",
                    f"{alumno_nombre} tiene un reporte pendiente, pero no cuenta con tutor activo.",
                    "/admin/tutoria?tab=reportes-tutor", enviar_email=False,
                )
    db.commit()
    db.refresh(registro)
    return {
        "id": registro.id,
        "reporte_tutor_id": reporte.id if reporte else None,
        "destinatario": tutor.nombre if tutor else ("Responsable de Tutoría" if reporte else None),
        "estado_envio": reporte.estado if reporte else None,
        "mensaje": (
            f"Reporte enviado a {tutor.nombre}" if reporte and tutor
            else "Reporte enviado al Responsable de Tutoría para asignación" if reporte
            else "Seguimiento registrado"
        ),
    }


@router.patch("/seguimiento/registros/{registro_id}")
def actualizar_estado_seguimiento(
    registro_id: int,
    data: EstadoSeguimientoInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    registro = db.query(SeguimientoAlumnoDocente).filter(
        SeguimientoAlumnoDocente.id == registro_id,
        SeguimientoAlumnoDocente.docente_id == current_user.id,
    ).first()
    if not registro:
        raise HTTPException(404, "Registro de seguimiento no encontrado")
    _validar_carga_actual(db, registro.carga)
    if registro.tipo == "TUTORIA":
        raise HTTPException(409, "El reporte debe ser atendido por el tutor destinatario")
    if registro.tipo != "ACUERDO":
        raise HTTPException(409, "Este registro no maneja estado")
    registro.estado = data.estado
    registro.resultado_atencion = data.resultado_atencion.strip() if data.resultado_atencion else None
    registro.atendido_en = datetime.datetime.utcnow() if data.estado in {"ATENDIDO", "CERRADO"} else None
    db.commit()
    return {"id": registro.id, "estado": registro.estado}


@router.get("/historial")
def historial_clases(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    clases = db.query(ClaseDocente).join(CargaDocente).filter(
        CargaDocente.docente_id == current_user.id
    ).order_by(ClaseDocente.fecha.desc(), ClaseDocente.inicio.desc()).limit(500).all()
    return [_serializar_clase(clase) for clase in clases]


@router.get("/dashboard", summary="Resumen operativo del panel docente")
def dashboard_docente(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    ahora = _ahora_mx()
    hoy = ahora.date()
    actual = _periodo_actual(db)
    if not actual:
        return {
            "periodo": None,
            "resumen": {
                "clases_hoy": 0, "clases_cerradas": 0, "asistencias_pendientes": 0,
                "grupos_activos": 0, "alumnos_atencion": 0, "acuerdos_pendientes": 0,
            },
            "jornada": [], "grupos": [], "alumnos_prioritarios": [],
        }
    cargas = db.query(CargaDocente).filter(
        CargaDocente.docente_id == current_user.id,
        CargaDocente.activo == True,
        CargaDocente.tipo_actividad == "CLASE",
        CargaDocente.estado == "ACTIVO",
        CargaDocente.periodo_id == actual.id,
    ).order_by(CargaDocente.hora_inicio).all()
    clases = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id.in_([carga.id for carga in cargas]),
    ).all() if cargas else []
    clase_por_carga_fecha = {
        (clase.carga_docente_id, clase.fecha): clase for clase in clases
    }

    jornada = []
    for carga in cargas:
        if carga.dia_semana != hoy.weekday():
            continue
        clase = clase_por_carga_fecha.get((carga.id, hoy))
        hora_fin = datetime.datetime.combine(
            hoy, datetime.time.fromisoformat(carga.hora_fin),
            tzinfo=MX,
        )
        if clase:
            estado = {
                "ABIERTA": "EN_CURSO",
                "CORRECCION": "CORRECCION",
                "CERRADA": "CERRADA",
            }.get(clase.estado, clase.estado)
        elif ahora > hora_fin:
            estado = "SIN_REGISTRO"
        else:
            estado = "PROGRAMADA"
        jornada.append({
            "carga_id": carga.id,
            "clase_id": clase.id if clase else None,
            "materia": carga.actividad_nombre,
            "grupo": (
                f"{carga.grupo_academico.cuatrimestre}° {carga.grupo_academico.grupo}"
                if carga.grupo_academico else "Sin grupo"
            ),
            "carrera": carga.grupo_academico.carrera if carga.grupo_academico else None,
            "espacio": (
                carga.laboratorio.nombre if carga.laboratorio
                else carga.espacio_nombre or "Sin espacio"
            ),
            "hora_inicio": carga.hora_inicio,
            "hora_fin": carga.hora_fin,
            "estado": estado,
            "resumen": _serializar_clase(clase)["resumen"] if clase else None,
        })

    grupos = []
    alumnos_prioritarios = []
    acuerdos_pendientes = 0
    for carga in cargas:
        if not carga.grupo_academico_id:
            continue
        seguimiento = seguimiento_grupo(carga.id, db, current_user)
        pendientes_carga = db.query(SeguimientoAlumnoDocente.id).filter(
            SeguimientoAlumnoDocente.carga_docente_id == carga.id,
            SeguimientoAlumnoDocente.docente_id == current_user.id,
            SeguimientoAlumnoDocente.tipo == "ACUERDO",
            SeguimientoAlumnoDocente.estado == "PENDIENTE",
        ).count()
        acuerdos_pendientes += pendientes_carga
        grupos.append({
            "carga_id": carga.id,
            "materia": carga.actividad_nombre,
            "grupo": seguimiento["carga"]["grupo"],
            "carrera": seguimiento["carga"]["carrera"],
            "total_alumnos": seguimiento["total_alumnos"],
            "total_clases": seguimiento["total_clases"],
            "asistencia_promedio": seguimiento["promedio_asistencia"],
            "alumnos_alerta": seguimiento["alumnos_en_alerta"],
            "acuerdos_pendientes": pendientes_carga,
            "ultima_clase": max(
                (clase.fecha for clase in clases if clase.carga_docente_id == carga.id),
                default=None,
            ),
        })
        for alumno in seguimiento["alumnos"]:
            if not alumno["alertas"]:
                continue
            alumnos_prioritarios.append({
                "alumno_id": alumno["alumno_id"],
                "carga_id": carga.id,
                "nombre": alumno["nombre"],
                "matricula": alumno["matricula"],
                "materia": carga.actividad_nombre,
                "grupo": seguimiento["carga"]["grupo"],
                "asistencia": alumno["porcentaje_asistencia"],
                "faltas": alumno["falta"],
                "faltas_consecutivas": alumno["faltas_consecutivas"],
                "motivos": [alerta["mensaje"] for alerta in alumno["alertas"]],
                "prioridad": (
                    "ALTA" if any(alerta["nivel"] == "ALTO" for alerta in alumno["alertas"])
                    else "MEDIA"
                ),
            })
    alumnos_prioritarios.sort(key=lambda item: (
        0 if item["prioridad"] == "ALTA" else 1,
        item["asistencia"],
        item["nombre"],
    ))
    pendientes_asistencia = sum(
        1 for item in jornada
        if item["estado"] in {"EN_CURSO", "CORRECCION", "SIN_REGISTRO"}
    )
    return {
        "fecha": hoy.isoformat(),
        "periodo": {"id": actual.id, "clave": actual.clave},
        "resumen": {
            "clases_hoy": len(jornada),
            "clases_cerradas": sum(1 for item in jornada if item["estado"] == "CERRADA"),
            "asistencias_pendientes": pendientes_asistencia,
            "grupos_activos": len(grupos),
            "alumnos_atencion": len(alumnos_prioritarios),
            "acuerdos_pendientes": acuerdos_pendientes,
        },
        "jornada": jornada,
        "grupos": grupos,
        "alumnos_prioritarios": alumnos_prioritarios[:8],
    }
