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
    CatalogoMateria, GrupoAcademico, InscripcionAlumno, PeriodoEscolar,
)
from models.laboratorio import Laboratorio
from models.espacio import EspacioInstitucional
from models.docencia import CargaDocente, ClaseDocente, AsistenciaDocente


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


class AsistenciaInput(BaseModel):
    estado: str
    observacion: Optional[str] = Field(None, max_length=500)


class CierreInput(BaseModel):
    observacion_general: Optional[str] = Field(None, max_length=1000)


def _docente_objetivo(user: Usuario) -> int:
    return user.id


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


def _serializar_carga(c: CargaDocente, db: Session):
    grupo = c.grupo_academico
    lab = c.laboratorio
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
        "carga": {
            "id": carga.id,
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
    elegido = periodo_id or next((p.id for p in periodos if p.es_actual), None)
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
        "periodos": [{"id": p.id, "clave": p.clave, "es_actual": p.es_actual} for p in periodos],
        "grupos": [{
            "id": g.id, "carrera": g.carrera, "cuatrimestre": g.cuatrimestre,
            "grupo": g.grupo, "label": f"{g.cuatrimestre}° {g.grupo} · {g.carrera}",
        } for g in grupos],
        "materias": [{"id": m.id, "nombre": m.nombre, "carrera": m.carrera} for m in materias_q.all()],
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
    if periodo_id:
        q = q.filter(CargaDocente.periodo_id == periodo_id)
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
    carga.activo = False
    db.commit()
    return {"mensaje": "Actividad retirada del horario"}


@router.get("/hoy")
def clases_de_hoy(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _solo_docente(current_user)
    hoy = _ahora_mx()
    cargas = db.query(CargaDocente).filter(
        CargaDocente.docente_id == current_user.id,
        CargaDocente.activo == True,
        CargaDocente.estado == "ACTIVO",
        CargaDocente.dia_semana == hoy.weekday(),
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
    if asistencia.clase.estado != "ABIERTA":
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
    clase.estado = "CERRADA"
    clase.fin = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    clase.observacion_general = data.observacion_general
    db.commit()
    return _serializar_clase(clase)


@router.get("/historial")
def historial_clases(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    clases = db.query(ClaseDocente).join(CargaDocente).filter(
        CargaDocente.docente_id == current_user.id
    ).order_by(ClaseDocente.fecha.desc(), ClaseDocente.inicio.desc()).limit(100).all()
    return [_serializar_clase(clase) for clase in clases]
