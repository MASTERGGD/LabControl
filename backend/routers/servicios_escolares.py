"""
Router /servicios-escolares
Dos grupos de endpoints:

  A) Servicios Escolares (rol SERVICIOS_ESCOLARES o SUPER_ADMIN)
     - CRUD de alumnos con estado de ficha
     - Activar acceso SIGA (crea usuario ALUMNO)
     - Activar ficha socioecónomica por periodo
     - Listar/ver fichas, cambiar estado

  B) Alumno autenticado (rol ALUMNO)
     - Ver su ficha activa
     - Guardar borrador / enviar
"""
import datetime
import secrets
import string
import unicodedata
import threading
import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from dependencies import get_current_user, hashear_password
from models.usuario import Usuario, RolUsuario
from models.catalogo import CatalogoAlumno, CatalogoCarrera, CatalogoCarreraAlias, CatalogoMateria, PeriodoEscolar, GrupoAcademico, InscripcionAlumno
from models.tutoria import GrupoTutorado
from models.ficha_socioeconomica import FichaSocioeconomica
from models.ficha_socioeconomica import FichaSocioeconomica, EstadoFicha
from models.cierre_academico import CierreAcademicoPeriodo
from models.promocion_academica import PromocionAcademicaAlumno
from services.auditoria import registrar, Accion, Recurso
from services.user_permissions import puede_gestionar_servicios_escolares

router = APIRouter(prefix="/servicios-escolares", tags=["Servicios Escolares"])
_organizacion_lock = threading.Lock()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _require_se(db: Session, user: Usuario):
    if not puede_gestionar_servicios_escolares(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "No tienes permiso para gestionar Servicios Escolares")


def _require_alumno(user: Usuario):
    if user.rol != RolUsuario.ALUMNO:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acceso solo para alumnos")


@router.get("/catalogos/codigo-postal/{codigo}", summary="Consultar domicilio por código postal")
def consultar_codigo_postal(codigo: str, current_user: Usuario = Depends(get_current_user)):
    if not codigo.isdigit() or len(codigo) != 5:
        raise HTTPException(422, "El código postal debe contener cinco dígitos")
    try:
        request = urllib.request.Request(
            f"https://postali.app/api/v1/mx/cp/{codigo}",
            headers={"User-Agent": "SIGA-UTECAN/1.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise HTTPException(404, "Código postal no encontrado")
        raise HTTPException(503, "El catálogo postal no está disponible")
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise HTTPException(503, "El catálogo postal no está disponible; captura el domicilio manualmente")
    asentamientos = data.get("asentamientos") or []
    return {
        "codigo_postal": data.get("cp", codigo),
        "estado": data.get("estado") or "",
        "municipio": data.get("municipio") or "",
        "localidad": next((item.get("ciudad") for item in asentamientos if item.get("ciudad")), data.get("municipio") or ""),
        "colonias": sorted({item.get("nombre") for item in asentamientos if item.get("nombre")}),
    }


def _sincronizar_datos_institucionales(ficha: FichaSocioeconomica, alumno: CatalogoAlumno):
    ficha.nombre_completo = f"{alumno.apellido_paterno} {alumno.apellido_materno or ''} {alumno.nombres}".strip()
    ficha.carrera = alumno.carrera


RESOLUCIONES_PROMOCION = {"PROMOVIDO", "REPITE", "ESTADIA", "EGRESO", "BAJA_TEMPORAL", "BAJA_DEFINITIVA", "PENDIENTE"}


class ActivacionMasivaFichasIn(BaseModel):
    alumno_ids: List[int] = Field(..., min_length=1, max_length=1000)
    periodo: str = Field(..., min_length=5, max_length=30)


class ResolucionPromocionIn(BaseModel):
    periodo_destino_id: int
    resolucion: str
    cuatrimestre_destino: Optional[int] = Field(None, ge=1, le=12)
    grupo_destino: Optional[str] = Field(None, max_length=10)
    observaciones: Optional[str] = Field(None, max_length=1000)


class ResolucionPromocionMasivaIn(ResolucionPromocionIn):
    inscripcion_ids: List[int] = Field(..., min_length=1, max_length=1000)
    solo_pendientes: bool = True


class PeriodoEscolarIn(BaseModel):
    clave: str = Field(..., min_length=8, max_length=20)

    @field_validator("clave")
    @classmethod
    def validar_clave(cls, value: str):
        clave = " ".join(value.strip().upper().replace("–", "-").split())
        bloques = ("ENE-ABR ", "MAY-AGO ", "SEP-DIC ")
        bloque = next((item for item in bloques if clave.startswith(item)), None)
        if not bloque or len(clave) != len(bloque) + 4 or not clave[-4:].isdigit():
            raise ValueError("Usa el formato ENE-ABR 2026, MAY-AGO 2026 o SEP-DIC 2026")
        return clave


def _require_carreras_reader(db: Session, user: Usuario):
    if user.rol == RolUsuario.ALUMNO:
        return
    if not puede_gestionar_servicios_escolares(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes acceso al catalogo de carreras")


def _gen_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _norm_text(v: str | None) -> str:
    return " ".join((v or "").strip().split())


def _normalizar_periodo(valor: str | None) -> str:
    return "".join(ch for ch in (valor or "").upper() if ch.isalnum())


def _clave_periodo_por_fecha(fecha: datetime.date | None = None) -> str:
    fecha = fecha or datetime.date.today()
    bloque = "ENE-ABR" if fecha.month <= 4 else "MAY-AGO" if fecha.month <= 8 else "SEP-DIC"
    return f"{bloque} {fecha.year}"


def _periodo_vigente(periodos: list[PeriodoEscolar]):
    esperado = _normalizar_periodo(_clave_periodo_por_fecha())
    return next(
        (periodo for periodo in periodos if periodo.activo and _normalizar_periodo(periodo.clave) == esperado),
        None,
    ) or next((periodo for periodo in periodos if periodo.activo and periodo.es_actual), None)


def _ensure_organizacion_desde_catalogo(db: Session):
    """Convierte registros heredados en periodos, grupos e inscripciones."""
    with _organizacion_lock:
        _ensure_organizacion_bloqueada(db)


def _ensure_organizacion_bloqueada(db: Session):
    cambios = False
    for alumno in db.query(CatalogoAlumno).filter(CatalogoAlumno.activo == True).all():
        clave = _norm_text(alumno.periodo).upper()
        carrera = _norm_text(alumno.carrera)
        grupo_letra = _norm_text(alumno.grupo).upper()
        if not clave or not carrera or not grupo_letra or not alumno.cuatrimestre:
            continue
        periodo = db.query(PeriodoEscolar).filter(PeriodoEscolar.clave == clave).first()
        if not periodo:
            periodo = PeriodoEscolar(clave=clave, activo=True)
            db.add(periodo); db.flush(); cambios = True
        grupo = db.query(GrupoAcademico).filter(
            GrupoAcademico.periodo_id == periodo.id,
            GrupoAcademico.carrera == carrera,
            GrupoAcademico.cuatrimestre == alumno.cuatrimestre,
            GrupoAcademico.grupo == grupo_letra,
        ).first()
        if not grupo:
            grupo = GrupoAcademico(periodo_id=periodo.id, carrera=carrera,
                cuatrimestre=alumno.cuatrimestre, grupo=grupo_letra, activo=True)
            db.add(grupo); db.flush(); cambios = True
        existe = db.query(InscripcionAlumno).filter(
            InscripcionAlumno.alumno_id == alumno.id,
            InscripcionAlumno.grupo_academico_id == grupo.id,
        ).first()
        if not existe:
            db.add(InscripcionAlumno(alumno_id=alumno.id,
                grupo_academico_id=grupo.id, estado="ACTIVO")); cambios = True
        elif existe.estado != "ACTIVO":
            existe.estado = "ACTIVO"; cambios = True
        inscripciones_anteriores = db.query(InscripcionAlumno).filter(
            InscripcionAlumno.alumno_id == alumno.id,
            InscripcionAlumno.grupo_academico_id != grupo.id,
            InscripcionAlumno.estado == "ACTIVO",
        ).all()
        for inscripcion in inscripciones_anteriores:
            inscripcion.estado = "INACTIVO"
            cambios = True
    if cambios:
        db.commit()


def _clave_desde_nombre(nombre: str) -> str:
    limpio = unicodedata.normalize("NFKD", nombre)
    limpio = "".join(ch for ch in limpio if not unicodedata.combining(ch))
    tokens = ["".join(ch for ch in t.upper() if ch.isalnum()) for t in limpio.split()]
    tokens = [t for t in tokens if t and t not in {"DE", "DEL", "LA", "LAS", "LOS", "EN", "Y"}]
    if not tokens:
        return "CAR"
    if len(tokens) == 1:
        return tokens[0][:10]
    return "".join(t[0] for t in tokens)[:10]


def _impacto_carrera(db: Session, nombre: str) -> dict:
    return {
        "alumnos": db.query(CatalogoAlumno).filter(func.lower(CatalogoAlumno.carrera) == nombre.lower()).count(),
        "grupos": db.query(GrupoAcademico).filter(func.lower(GrupoAcademico.carrera) == nombre.lower()).count(),
        "materias": db.query(CatalogoMateria).filter(func.lower(CatalogoMateria.carrera) == nombre.lower()).count(),
        "tutoria": db.query(GrupoTutorado).filter(func.lower(GrupoTutorado.carrera) == nombre.lower()).count(),
    }


def _serializar_carrera(c: CatalogoCarrera, db: Session | None = None) -> dict:
    return {
        "id": c.id,
        "clave": c.clave,
        "nombre": c.nombre,
        "nivel": c.nivel,
        "division": c.division,
        "plan_estudios": c.plan_estudios,
        "aliases": sorted(a.nombre for a in c.aliases),
        "activo": c.activo,
        "impacto": _impacto_carrera(db, c.nombre) if db else None,
    }


def _ensure_carreras_desde_alumnos(db: Session):
    if db.query(CatalogoCarrera).count():
        return
    existentes = set()
    for (nombre_raw,) in db.query(CatalogoAlumno.carrera).distinct().all():
        nombre = _norm_text(nombre_raw)
        if not nombre or nombre.lower() in existentes:
            continue
        base = _clave_desde_nombre(nombre)
        clave = base
        i = 2
        while db.query(CatalogoCarrera).filter(CatalogoCarrera.clave == clave).first():
            clave = f"{base}{i}"
            i += 1
        db.add(CatalogoCarrera(clave=clave, nombre=nombre, activo=True))
        existentes.add(nombre.lower())
    if existentes:
        db.commit()


def _validar_carrera_activa(db: Session, nombre: str | None) -> str | None:
    nombre = _norm_text(nombre)
    if not nombre:
        return None
    _ensure_carreras_desde_alumnos(db)
    total = db.query(CatalogoCarrera).filter(CatalogoCarrera.activo == True).count()
    if not total:
        return nombre
    carrera = (
        db.query(CatalogoCarrera)
        .filter(CatalogoCarrera.activo == True, func.lower(CatalogoCarrera.nombre) == nombre.lower())
        .first()
    )
    if not carrera:
        raise HTTPException(422, "Selecciona una carrera activa del catalogo de Servicios Escolares")
    return carrera.nombre


def _serializar_alumno(a: CatalogoAlumno, ficha: Optional[FichaSocioeconomica] = None) -> dict:
    nombre = f"{a.apellido_paterno} {a.apellido_materno or ''} {a.nombres}".strip()
    return {
        "id":                   a.id,
        "matricula":            a.matricula,
        "nombre":               nombre,
        "apellido_paterno":     a.apellido_paterno,
        "apellido_materno":     a.apellido_materno,
        "nombres":              a.nombres,
        "carrera":              a.carrera,
        "cuatrimestre":         a.cuatrimestre,
        "grupo":                a.grupo,
        "periodo":              a.periodo,
        "activo":               a.activo,
        "correo_institucional": a.correo_institucional,
        "tiene_acceso_siga":    a.usuario_id is not None,
        "usuario_id":           a.usuario_id,
        "ficha": _serializar_ficha_resumen(ficha) if ficha else None,
    }


def _serializar_ficha_resumen(f: FichaSocioeconomica) -> dict:
    return {
        "id":          f.id,
        "periodo":     f.periodo,
        "estado":      f.estado.value,
        "enviada_en":  f.enviada_en.isoformat() if f.enviada_en else None,
        "validada_en": f.validada_en.isoformat() if f.validada_en else None,
        "nota_correccion": f.nota_correccion,
    }


def _serializar_ficha_completa(f: FichaSocioeconomica) -> dict:
    base = _serializar_ficha_resumen(f)
    base.update({
        "alumno_id":        f.alumno_id,
        "activado_en":      f.activado_en.isoformat() if f.activado_en else None,
        # Sección 1
        "nombre_completo":  f.nombre_completo,
        "fecha_ingreso":    f.fecha_ingreso,
        "carrera":          f.carrera,
        "sexo":             f.sexo,
        "estado_civil":     f.estado_civil,
        "lugar_nacimiento": f.lugar_nacimiento,
        "fecha_nacimiento": f.fecha_nacimiento,
        "tiene_hijos":      f.tiene_hijos,
        "num_hijos":        f.num_hijos,
        "habla_lengua":     f.habla_lengua,
        "lengua":           f.lengua,
        # Sección 2
        "telefono":                f.telefono,
        "procedencia_calle":       f.procedencia_calle,
        "procedencia_colonia":     f.procedencia_colonia,
        "procedencia_localidad":   f.procedencia_localidad,
        "procedencia_municipio":   f.procedencia_municipio,
        "procedencia_estado":      f.procedencia_estado,
        "procedencia_cp":          f.procedencia_cp,
        "residencia_calle":        f.residencia_calle,
        "residencia_colonia":      f.residencia_colonia,
        "residencia_localidad":    f.residencia_localidad,
        "residencia_municipio":    f.residencia_municipio,
        "residencia_estado":       f.residencia_estado,
        "residencia_cp":           f.residencia_cp,
        # Sección 3
        "bachillerato":            f.bachillerato,
        "bachillerato_ubicacion":  f.bachillerato_ubicacion,
        "periodo_estudios":        f.periodo_estudios,
        "promedio":                f.promedio,
        "area_bachillerato":       f.area_bachillerato,
        # Sección 4
        "depende_de":              f.depende_de,
        "responsable_nombre":      f.responsable_nombre,
        "responsable_parentesco":  f.responsable_parentesco,
        "responsable_ocupacion":   f.responsable_ocupacion,
        "responsable_estudios":    f.responsable_estudios,
        "responsable_telefono":    f.responsable_telefono,
        "ingreso_mensual":         f.ingreso_mensual,
        "gasto_mensual":           f.gasto_mensual,
        "dependientes":            f.dependientes,
        "recibe_apoyo":            f.recibe_apoyo,
        "institucion_apoyo":       f.institucion_apoyo,
        # Sección 5
        "tiene_alergia":             f.tiene_alergia,
        "alergia_cual":              f.alergia_cual,
        "alergia_medicamento":       f.alergia_medicamento,
        "enfermedad_cronica":        f.enfermedad_cronica,
        "enfermedad_cual":           f.enfermedad_cual,
        "enfermedad_medicamento":    f.enfermedad_medicamento,
        "tiene_discapacidad":        f.tiene_discapacidad,
        "discapacidad_tipo":         f.discapacidad_tipo,
        "discapacidad_medicamento":  f.discapacidad_medicamento,
        "informacion_relevante":     f.informacion_relevante,
    })
    return base


# ═══════════════════════════════════════════════════════════════════════════════
# A) SERVICIOS ESCOLARES
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Carreras ────────────────────────────────────────────────────────────────

class CarreraBody(BaseModel):
    clave: str = Field(..., min_length=1, max_length=30)
    nombre: str = Field(..., min_length=2, max_length=180)
    nivel: Optional[str] = Field(None, max_length=30)
    division: Optional[str] = Field(None, max_length=120)
    plan_estudios: Optional[str] = Field(None, max_length=80)
    aliases: list[str] = Field(default_factory=list)
    activo: bool = True
    model_config = ConfigDict(extra="ignore")


@router.get("/carreras", summary="Catalogo de carreras para Servicios Escolares y alumnos")
def listar_carreras(
    incluir_inactivas: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_carreras_reader(db, current_user)
    _ensure_carreras_desde_alumnos(db)
    q = db.query(CatalogoCarrera)
    if not incluir_inactivas:
        q = q.filter(CatalogoCarrera.activo == True)
    return [_serializar_carrera(c, db) for c in q.order_by(CatalogoCarrera.nombre).all()]


@router.post("/carreras", summary="Registrar carrera")
def crear_carrera(
    body: CarreraBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    clave = _norm_text(body.clave).upper()
    nombre = _norm_text(body.nombre)
    if not clave or not nombre:
        raise HTTPException(422, "Clave y nombre son obligatorios")
    existe = (
        db.query(CatalogoCarrera)
        .filter((func.lower(CatalogoCarrera.clave) == clave.lower()) |
                (func.lower(CatalogoCarrera.nombre) == nombre.lower()))
        .first()
    )
    if existe:
        raise HTTPException(409, "Ya existe una carrera con esa clave o nombre")
    carrera = CatalogoCarrera(
        clave=clave, nombre=nombre, activo=body.activo,
        nivel=_norm_text(body.nivel) or None,
        division=_norm_text(body.division) or None,
        plan_estudios=_norm_text(body.plan_estudios) or None,
    )
    db.add(carrera)
    db.flush()
    for alias in {_norm_text(a) for a in body.aliases if _norm_text(a)}:
        if alias.lower() != nombre.lower():
            db.add(CatalogoCarreraAlias(carrera_id=carrera.id, nombre=alias))
    db.commit()
    db.refresh(carrera)
    return _serializar_carrera(carrera, db)


@router.put("/carreras/{carrera_id}", summary="Actualizar carrera")
def actualizar_carrera(
    carrera_id: int,
    body: CarreraBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    carrera = db.query(CatalogoCarrera).get(carrera_id)
    if not carrera:
        raise HTTPException(404, "Carrera no encontrada")
    clave = _norm_text(body.clave).upper()
    nombre = _norm_text(body.nombre)
    existe = (
        db.query(CatalogoCarrera)
        .filter(CatalogoCarrera.id != carrera_id)
        .filter((func.lower(CatalogoCarrera.clave) == clave.lower()) |
                (func.lower(CatalogoCarrera.nombre) == nombre.lower()))
        .first()
    )
    if existe:
        raise HTTPException(409, "Ya existe otra carrera con esa clave o nombre")
    nombre_anterior = carrera.nombre
    carrera.clave = clave
    carrera.nombre = nombre
    carrera.nivel = _norm_text(body.nivel) or None
    carrera.division = _norm_text(body.division) or None
    carrera.plan_estudios = _norm_text(body.plan_estudios) or None
    carrera.activo = body.activo
    carrera.actualizado_en = datetime.datetime.utcnow()

    if nombre_anterior.lower() != nombre.lower():
        db.query(CatalogoAlumno).filter(func.lower(CatalogoAlumno.carrera) == nombre_anterior.lower()).update({"carrera": nombre}, synchronize_session=False)
        db.query(GrupoAcademico).filter(func.lower(GrupoAcademico.carrera) == nombre_anterior.lower()).update({"carrera": nombre}, synchronize_session=False)
        db.query(CatalogoMateria).filter(func.lower(CatalogoMateria.carrera) == nombre_anterior.lower()).update({"carrera": nombre}, synchronize_session=False)
        db.query(GrupoTutorado).filter(func.lower(GrupoTutorado.carrera) == nombre_anterior.lower()).update({"carrera": nombre}, synchronize_session=False)
        db.query(FichaSocioeconomica).filter(func.lower(FichaSocioeconomica.carrera) == nombre_anterior.lower()).update({"carrera": nombre}, synchronize_session=False)

    aliases = {_norm_text(a) for a in body.aliases if _norm_text(a)}
    if nombre_anterior.lower() != nombre.lower():
        aliases.add(nombre_anterior)
    aliases = {a for a in aliases if a.lower() != nombre.lower()}
    db.query(CatalogoCarreraAlias).filter(CatalogoCarreraAlias.carrera_id == carrera.id).delete(synchronize_session=False)
    for alias in aliases:
        ocupado = db.query(CatalogoCarreraAlias).filter(
            func.lower(CatalogoCarreraAlias.nombre) == alias.lower(),
            CatalogoCarreraAlias.carrera_id != carrera.id,
        ).first()
        if ocupado:
            raise HTTPException(409, f"El alias '{alias}' ya pertenece a otra carrera")
        db.add(CatalogoCarreraAlias(carrera_id=carrera.id, nombre=alias))
    registrar(db, accion="ACTUALIZAR_CARRERA", recurso="CARRERA", usuario=current_user,
              recurso_id=carrera.id, detalle={"nombre_anterior": nombre_anterior, "nombre_nuevo": nombre})
    db.commit()
    db.refresh(carrera)
    return _serializar_carrera(carrera, db)


@router.delete("/carreras/{carrera_id}", summary="Desactivar carrera")
def desactivar_carrera(
    carrera_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    carrera = db.query(CatalogoCarrera).get(carrera_id)
    if not carrera:
        raise HTTPException(404, "Carrera no encontrada")
    carrera.activo = False
    carrera.actualizado_en = datetime.datetime.utcnow()
    db.commit()
    return {"ok": True}

# ─── Alumnos ──────────────────────────────────────────────────────────────────

@router.get("/alumnos", summary="Listar alumnos con estado de ficha")
def listar_alumnos(
    q:       str = Query("", description="Buscar por nombre o matrícula"),
    periodo: str = Query("", description="Filtrar por periodo"),
    con_ficha: Optional[str] = Query(None, description="Estado de ficha (ENVIADA, VALIDADA…)"),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)

    q_obj = db.query(CatalogoAlumno).filter(CatalogoAlumno.activo == True)
    if q.strip():
        term = f"%{q.strip()}%"
        q_obj = q_obj.filter(
            CatalogoAlumno.nombres.ilike(term) |
            CatalogoAlumno.apellido_paterno.ilike(term) |
            CatalogoAlumno.apellido_materno.ilike(term) |
            CatalogoAlumno.matricula.ilike(term)
        )
    if periodo.strip():
        q_obj = q_obj.filter(CatalogoAlumno.periodo == periodo.strip())

    total  = q_obj.count()
    alumnos = q_obj.order_by(CatalogoAlumno.apellido_paterno).offset(skip).limit(limit).all()

    results = []
    for a in alumnos:
        # última ficha del alumno
        ficha = (
            db.query(FichaSocioeconomica)
            .filter(FichaSocioeconomica.alumno_id == a.id)
            .order_by(FichaSocioeconomica.creada_en.desc())
            .first()
        )
        if con_ficha and (ficha is None or ficha.estado.value != con_ficha):
            continue
        results.append(_serializar_alumno(a, ficha))

    return {"total": total, "items": results}


@router.get("/alumnos/{alumno_id}", summary="Detalle de alumno")
def detalle_alumno(
    alumno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    a = db.query(CatalogoAlumno).get(alumno_id)
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    fichas = (
        db.query(FichaSocioeconomica)
        .filter(FichaSocioeconomica.alumno_id == alumno_id)
        .order_by(FichaSocioeconomica.creada_en.desc())
        .all()
    )
    data = _serializar_alumno(a, fichas[0] if fichas else None)
    data["fichas"] = [_serializar_ficha_resumen(f) for f in fichas]
    return data


class PatchAlumnoBody(BaseModel):
    correo_institucional: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


@router.patch("/alumnos/{alumno_id}", summary="Actualizar correo institucional del alumno")
def actualizar_alumno(
    alumno_id: int,
    body: PatchAlumnoBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    a = db.query(CatalogoAlumno).get(alumno_id)
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    if body.correo_institucional is not None:
        a.correo_institucional = body.correo_institucional.strip() or None
        # Sincronizar con el usuario vinculado si existe
        if a.usuario_id:
            u = db.query(Usuario).get(a.usuario_id)
            if u and body.correo_institucional:
                u.email = body.correo_institucional.strip()
    db.commit()
    db.refresh(a)
    return _serializar_alumno(a)


# ─── Acceso SIGA ──────────────────────────────────────────────────────────────

class ActivarAccesoBody(BaseModel):
    correo_institucional: Optional[str] = None   # si ya lo tienen asignado
    password_temporal:    Optional[str] = None   # si None, se genera automático


@router.post("/alumnos/{alumno_id}/activar-acceso", summary="Crear cuenta SIGA para el alumno")
def activar_acceso(
    alumno_id: int,
    body: ActivarAccesoBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    a = db.query(CatalogoAlumno).get(alumno_id)
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    if a.usuario_id:
        raise HTTPException(400, "Este alumno ya tiene acceso SIGA")

    # Determinar email de login: correo institucional o matrícula@placeholder
    email = (body.correo_institucional or a.correo_institucional or
             f"{a.matricula}@alumno.utecan.edu.mx").strip()

    # Verificar que ese email no esté en uso
    if db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(409, f"El correo {email} ya está registrado en el sistema")

    nombre_completo = f"{a.apellido_paterno} {a.apellido_materno or ''} {a.nombres}".strip()
    pwd = body.password_temporal or _gen_password()

    u = Usuario(
        nombre=nombre_completo,
        email=email,
        password_hash=hashear_password(pwd),
        rol=RolUsuario.ALUMNO,
        activo=True,
        debe_cambiar_password=True,  # contraseña temporal: forzar cambio
    )
    db.add(u)
    db.flush()

    a.usuario_id = u.id
    if body.correo_institucional:
        a.correo_institucional = body.correo_institucional.strip()
    db.commit()

    registrar(db, accion=Accion.ACTIVAR_ACCESO_ALUMNO, recurso=Recurso.ALUMNO,
              usuario=current_user, recurso_id=alumno_id,
              detalle={
                  "alumno": nombre_completo,
                  "matricula": a.matricula,
                  "email_asignado": email,
              })

    return {
        "ok": True,
        "usuario_id":  u.id,
        "email":       email,
        "password_temporal": pwd,   # mostrar UNA VEZ al responsable para entregárselo al alumno
    }


@router.post("/alumnos/{alumno_id}/reset-password", summary="Restablecer contraseña SIGA del alumno")
def reset_password_alumno(
    alumno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    a = db.query(CatalogoAlumno).get(alumno_id)
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    if not a.usuario_id:
        raise HTTPException(400, "Este alumno todavia no tiene acceso SIGA")

    u = db.query(Usuario).get(a.usuario_id)
    if not u:
        raise HTTPException(404, "Usuario vinculado no encontrado")
    if u.rol != RolUsuario.ALUMNO:
        raise HTTPException(400, "La cuenta vinculada no pertenece a un alumno")

    nueva = _gen_password()
    u.password_hash = hashear_password(nueva)
    u.activo = True
    u.debe_cambiar_password = True  # contraseña temporal: forzar cambio al entrar
    db.commit()

    registrar(db, accion=Accion.RESET_PASSWORD_ALUMNO, recurso=Recurso.ALUMNO,
              usuario=current_user, recurso_id=alumno_id,
              detalle={
                  "alumno": u.nombre,
                  "matricula": a.matricula,
                  "email": u.email,
              })

    return {
        "ok": True,
        "usuario_id": u.id,
        "email": u.email,
        "password_temporal": nueva,
    }


@router.delete("/alumnos/{alumno_id}/desactivar-acceso", summary="Quitar acceso SIGA al alumno")
def desactivar_acceso(
    alumno_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    a = db.query(CatalogoAlumno).get(alumno_id)
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    if not a.usuario_id:
        raise HTTPException(400, "Este alumno no tiene cuenta SIGA")
    u = db.query(Usuario).get(a.usuario_id)
    nombre_alumno = None
    matricula_alumno = a.matricula
    if u:
        nombre_alumno = u.nombre
        u.activo = False
    db.commit()
    registrar(db, accion=Accion.DESACTIVAR_FICHA, recurso=Recurso.ALUMNO,
              usuario=current_user, recurso_id=alumno_id,
              detalle={"alumno": nombre_alumno, "matricula": matricula_alumno})
    return {"ok": True}


# ─── Fichas socioecónicas ─────────────────────────────────────────────────────

@router.post("/alumnos/{alumno_id}/fichas", summary="Activar ficha socioecónomica para el alumno")
def activar_ficha(
    alumno_id: int,
    periodo: str = Query(..., description="Período del estudio, ej. MAY-AGO 2026"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    a = db.query(CatalogoAlumno).get(alumno_id)
    if not a:
        raise HTTPException(404, "Alumno no encontrado")

    # Verificar que no exista ya una ficha activa para ese periodo
    existente = (
        db.query(FichaSocioeconomica)
        .filter(
            FichaSocioeconomica.alumno_id == alumno_id,
            FichaSocioeconomica.periodo == periodo,
        ).first()
    )
    if existente and existente.estado not in (EstadoFicha.RECHAZADA,):
        raise HTTPException(400,
            f"Ya existe una ficha {existente.estado.value} para el periodo {periodo}")

    ficha = FichaSocioeconomica(
        alumno_id=alumno_id,
        periodo=periodo,
        estado=EstadoFicha.PENDIENTE_CAPTURA,
        activado_por_id=current_user.id,
        activado_en=_now(),
    )
    _sincronizar_datos_institucionales(ficha, a)
    db.add(ficha)
    db.commit()
    db.refresh(ficha)

    nombre_alumno = f"{a.apellido_paterno} {a.apellido_materno or ''} {a.nombres}".strip()
    registrar(db, accion=Accion.ACTIVAR_FICHA, recurso=Recurso.ALUMNO,
              usuario=current_user, recurso_id=alumno_id,
              detalle={
                  "alumno": nombre_alumno,
                  "matricula": a.matricula,
                  "periodo": periodo,
                  "ficha_id": ficha.id,
              })

    return _serializar_ficha_resumen(ficha)


@router.post("/fichas/activar-masivo", summary="Activar fichas socioeconómicas para varios alumnos")
def activar_fichas_masivo(
    data: ActivacionMasivaFichasIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    ids = list(dict.fromkeys(data.alumno_ids))
    alumnos = db.query(CatalogoAlumno).filter(CatalogoAlumno.id.in_(ids)).all()
    alumnos_por_id = {alumno.id: alumno for alumno in alumnos}
    existentes = {
        ficha.alumno_id for ficha in db.query(FichaSocioeconomica).filter(
            FichaSocioeconomica.alumno_id.in_(ids),
            FichaSocioeconomica.periodo == data.periodo,
            FichaSocioeconomica.estado != EstadoFicha.RECHAZADA,
        ).all()
    }
    creadas, omitidas, errores = [], [], []
    for alumno_id in ids:
        alumno = alumnos_por_id.get(alumno_id)
        if not alumno:
            errores.append({"alumno_id": alumno_id, "motivo": "Alumno no encontrado"})
        elif not alumno.activo:
            errores.append({"alumno_id": alumno_id, "matricula": alumno.matricula, "motivo": "Alumno inactivo"})
        elif alumno_id in existentes:
            omitidas.append({"alumno_id": alumno_id, "matricula": alumno.matricula, "motivo": "Ya tiene ficha en el periodo"})
        else:
            ficha = FichaSocioeconomica(
                alumno_id=alumno_id, periodo=data.periodo,
                estado=EstadoFicha.PENDIENTE_CAPTURA,
                activado_por_id=current_user.id, activado_en=_now(),
            )
            _sincronizar_datos_institucionales(ficha, alumno)
            db.add(ficha)
            creadas.append({"alumno_id": alumno_id, "matricula": alumno.matricula})
    db.commit()
    registrar(db, accion=Accion.ACTIVAR_FICHA, recurso=Recurso.ALUMNO,
              usuario=current_user, detalle={"periodo": data.periodo, "activacion_masiva": True,
              "creadas": len(creadas), "omitidas": len(omitidas), "errores": len(errores)})
    return {"periodo": data.periodo, "creadas": creadas, "omitidas": omitidas, "errores": errores,
            "resumen": {"creadas": len(creadas), "omitidas": len(omitidas), "errores": len(errores)}}


@router.get("/fichas", summary="Listar todas las fichas (SE)")
def listar_fichas(
    estado:  Optional[str] = Query(None),
    periodo: Optional[str] = Query(None),
    q:       str = Query("", description="Buscar por nombre o matrícula del alumno"),
    skip:    int = 0,
    limit:   int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)

    q_obj = db.query(FichaSocioeconomica).join(
        CatalogoAlumno, FichaSocioeconomica.alumno_id == CatalogoAlumno.id
    )
    if estado:
        q_obj = q_obj.filter(FichaSocioeconomica.estado == estado)
    if periodo:
        q_obj = q_obj.filter(FichaSocioeconomica.periodo == periodo)
    if q.strip():
        term = f"%{q.strip()}%"
        q_obj = q_obj.filter(
            CatalogoAlumno.nombres.ilike(term) |
            CatalogoAlumno.apellido_paterno.ilike(term) |
            CatalogoAlumno.matricula.ilike(term)
        )

    total  = q_obj.count()
    fichas = q_obj.order_by(FichaSocioeconomica.enviada_en.desc().nullslast()).offset(skip).limit(limit).all()

    items = []
    for f in fichas:
        d = _serializar_ficha_resumen(f)
        a = db.query(CatalogoAlumno).get(f.alumno_id)
        if a:
            d["alumno_nombre"]   = f"{a.apellido_paterno} {a.apellido_materno or ''} {a.nombres}".strip()
            d["alumno_matricula"] = a.matricula
            d["alumno_carrera"]   = a.carrera
            d["alumno_cuatrimestre"] = a.cuatrimestre
        items.append(d)

    return {"total": total, "items": items}


@router.get("/fichas/{ficha_id}", summary="Detalle de ficha (SE)")
def detalle_ficha(
    ficha_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    f = db.query(FichaSocioeconomica).get(ficha_id)
    if not f:
        raise HTTPException(404, "Ficha no encontrada")
    a = db.query(CatalogoAlumno).get(f.alumno_id)
    data = _serializar_ficha_completa(f)
    if a:
        data["alumno_nombre"]    = f"{a.apellido_paterno} {a.apellido_materno or ''} {a.nombres}".strip()
        data["alumno_matricula"] = a.matricula
        data["alumno_carrera"]   = a.carrera
    return data


class CambiarEstadoBody(BaseModel):
    estado:          str
    nota_correccion: Optional[str] = None


@router.patch("/fichas/{ficha_id}/estado", summary="Cambiar estado de ficha (SE)")
def cambiar_estado_ficha(
    ficha_id: int,
    body: CambiarEstadoBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    f = db.query(FichaSocioeconomica).get(ficha_id)
    if not f:
        raise HTTPException(404, "Ficha no encontrada")

    # Solo se puede cambiar desde ENVIADA (o REQUIERE_CORRECCION re-enviada)
    if f.estado not in (EstadoFicha.ENVIADA, EstadoFicha.REQUIERE_CORRECCION):
        raise HTTPException(400,
            f"No se puede cambiar el estado desde {f.estado.value}")

    nuevo = body.estado.upper()
    permitidos = ("VALIDADA", "REQUIERE_CORRECCION", "RECHAZADA")
    if nuevo not in permitidos:
        raise HTTPException(400, f"Estado no permitido. Use: {', '.join(permitidos)}")

    f.estado = EstadoFicha(nuevo)
    f.revisado_por_id = current_user.id

    if nuevo == "VALIDADA":
        f.validada_en = _now()
        f.nota_correccion = None
    elif nuevo == "REQUIERE_CORRECCION":
        if not body.nota_correccion:
            raise HTTPException(400, "Debe indicar la nota de corrección para el alumno")
        f.nota_correccion = body.nota_correccion
    elif nuevo == "RECHAZADA":
        f.nota_correccion = body.nota_correccion

    db.commit()
    db.refresh(f)
    return _serializar_ficha_resumen(f)


# ─── Estadísticas rápidas para el dashboard ───────────────────────────────────

@router.get("/estadisticas", summary="Resumen rápido para el dashboard SE")
def estadisticas(
    periodo: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)

    q_alumnos = db.query(func.count(CatalogoAlumno.id)).filter(CatalogoAlumno.activo == True)
    total_alumnos = q_alumnos.scalar() or 0
    con_acceso    = db.query(func.count(CatalogoAlumno.id)).filter(
        CatalogoAlumno.activo == True, CatalogoAlumno.usuario_id.isnot(None)
    ).scalar() or 0

    q_fichas = db.query(FichaSocioeconomica)
    if periodo:
        q_fichas = q_fichas.filter(FichaSocioeconomica.periodo == periodo)

    conteos = {}
    for estado in EstadoFicha:
        conteos[estado.value] = q_fichas.filter(FichaSocioeconomica.estado == estado).count()

    return {
        "total_alumnos":   total_alumnos,
        "con_acceso_siga": con_acceso,
        "sin_acceso_siga": total_alumnos - con_acceso,
        "fichas":          conteos,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# B) ALUMNO — endpoints para el formulario propio
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/mi-ficha", summary="Ver ficha activa del alumno autenticado")
def mi_ficha(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_alumno(current_user)

    # Buscar CatalogoAlumno vinculado al usuario
    cat = db.query(CatalogoAlumno).filter(
        CatalogoAlumno.usuario_id == current_user.id
    ).first()
    if not cat:
        raise HTTPException(404, "No se encontró el perfil de alumno para esta cuenta")

    ficha = (
        db.query(FichaSocioeconomica)
        .filter(FichaSocioeconomica.alumno_id == cat.id)
        .order_by(FichaSocioeconomica.creada_en.desc())
        .first()
    )
    if not ficha:
        return {"estado": "SIN_FICHA", "alumno": {
            "nombre": current_user.nombre,
            "matricula": cat.matricula,
            "carrera": cat.carrera,
            "periodo": cat.periodo,
        }}

    _sincronizar_datos_institucionales(ficha, cat)

    data = _serializar_ficha_completa(ficha)
    data["alumno"] = {
        "nombre":    current_user.nombre,
        "matricula": cat.matricula,
        "carrera":   cat.carrera,
        "periodo":   cat.periodo,
    }
    return data


class GuardarFichaBody(BaseModel):
    enviar: bool = False   # False = guardar borrador, True = enviar
    # Sección 1
    nombre_completo:  Optional[str] = None
    fecha_ingreso:    Optional[str] = None
    carrera:          Optional[str] = None
    sexo:             Optional[str] = None
    estado_civil:     Optional[str] = None
    lugar_nacimiento: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    tiene_hijos:      Optional[bool] = None
    num_hijos:        Optional[int]  = None
    habla_lengua:     Optional[bool] = None
    lengua:           Optional[str]  = None
    # Sección 2
    telefono:               Optional[str] = None
    procedencia_calle:      Optional[str] = None
    procedencia_colonia:    Optional[str] = None
    procedencia_localidad:  Optional[str] = None
    procedencia_municipio:  Optional[str] = None
    procedencia_estado:     Optional[str] = None
    procedencia_cp:         Optional[str] = None
    residencia_calle:       Optional[str] = None
    residencia_colonia:     Optional[str] = None
    residencia_localidad:   Optional[str] = None
    residencia_municipio:   Optional[str] = None
    residencia_estado:      Optional[str] = None
    residencia_cp:          Optional[str] = None
    # Sección 3
    bachillerato:           Optional[str]   = None
    bachillerato_ubicacion: Optional[str]   = None
    periodo_estudios:       Optional[str]   = None
    promedio:               Optional[float] = None
    area_bachillerato:      Optional[str]   = None
    # Sección 4
    depende_de:             Optional[str]   = None
    responsable_nombre:     Optional[str]   = None
    responsable_parentesco: Optional[str]   = None
    responsable_ocupacion:  Optional[str]   = None
    responsable_estudios:   Optional[str]   = None
    responsable_telefono:   Optional[str]   = None
    ingreso_mensual:        Optional[float] = None
    gasto_mensual:          Optional[float] = None
    dependientes:           Optional[int]   = None
    recibe_apoyo:           Optional[bool]  = None
    institucion_apoyo:      Optional[str]   = None
    # Sección 5
    tiene_alergia:            Optional[bool] = None
    alergia_cual:             Optional[str]  = None
    alergia_medicamento:      Optional[str]  = None
    enfermedad_cronica:       Optional[bool] = None
    enfermedad_cual:          Optional[str]  = None
    enfermedad_medicamento:   Optional[str]  = None
    tiene_discapacidad:       Optional[bool] = None
    discapacidad_tipo:        Optional[str]  = None
    discapacidad_medicamento: Optional[str]  = None
    informacion_relevante:    Optional[str]  = None

    model_config = ConfigDict(extra="ignore")


@router.put("/mi-ficha", summary="Guardar borrador o enviar ficha del alumno")
def guardar_ficha(
    body: GuardarFichaBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_alumno(current_user)

    cat = db.query(CatalogoAlumno).filter(
        CatalogoAlumno.usuario_id == current_user.id
    ).first()
    if not cat:
        raise HTTPException(404, "No se encontró el perfil de alumno")

    ficha = (
        db.query(FichaSocioeconomica)
        .filter(FichaSocioeconomica.alumno_id == cat.id)
        .order_by(FichaSocioeconomica.creada_en.desc())
        .first()
    )
    if not ficha:
        raise HTTPException(404, "No tienes una ficha activa. Contacta a Servicios Escolares.")

    # Solo se puede editar si está en un estado editable
    estados_editables = (
        EstadoFicha.PENDIENTE_CAPTURA,
        EstadoFicha.BORRADOR,
        EstadoFicha.REQUIERE_CORRECCION,
    )
    if ficha.estado not in estados_editables:
        raise HTTPException(400,
            f"No puedes modificar una ficha en estado {ficha.estado.value}")

    # Nombre y carrera son datos institucionales; el alumno no puede modificarlos.
    _sincronizar_datos_institucionales(ficha, cat)
    # Aplicar únicamente los campos capturados por el alumno.
    campos = [
        "fecha_ingreso","sexo","estado_civil",
        "lugar_nacimiento","fecha_nacimiento","tiene_hijos","num_hijos",
        "habla_lengua","lengua","telefono","procedencia_calle","procedencia_colonia",
        "procedencia_localidad","procedencia_municipio","procedencia_estado","procedencia_cp",
        "residencia_calle","residencia_colonia","residencia_localidad","residencia_municipio",
        "residencia_estado","residencia_cp","bachillerato","bachillerato_ubicacion",
        "periodo_estudios","promedio","area_bachillerato","depende_de","responsable_nombre",
        "responsable_parentesco","responsable_ocupacion","responsable_estudios",
        "responsable_telefono","ingreso_mensual","gasto_mensual","dependientes",
        "recibe_apoyo","institucion_apoyo","tiene_alergia","alergia_cual",
        "alergia_medicamento","enfermedad_cronica","enfermedad_cual","enfermedad_medicamento",
        "tiene_discapacidad","discapacidad_tipo","discapacidad_medicamento","informacion_relevante",
    ]
    body_dict = body.model_dump(exclude_none=True, exclude={"enviar"})
    for campo in campos:
        if campo in body_dict:
            setattr(ficha, campo, body_dict[campo])

    if body.enviar:
        ficha.estado    = EstadoFicha.ENVIADA
        ficha.enviada_en = _now()
        ficha.nota_correccion = None
    else:
        if ficha.estado == EstadoFicha.PENDIENTE_CAPTURA:
            ficha.estado = EstadoFicha.BORRADOR

    db.commit()
    db.refresh(ficha)
    return _serializar_ficha_completa(ficha)
# ─── Organización académica ───

@router.get("/organizacion/resumen", summary="Resumen de grupos e inscripciones")
def resumen_organizacion(
    periodo: str = Query(""),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    _ensure_organizacion_desde_catalogo(db)
    grupos_q = db.query(GrupoAcademico).join(PeriodoEscolar)
    ins_q = db.query(InscripcionAlumno).join(GrupoAcademico).join(PeriodoEscolar)
    if periodo.strip():
        grupos_q = grupos_q.filter(PeriodoEscolar.clave == periodo.strip())
        ins_q = ins_q.filter(PeriodoEscolar.clave == periodo.strip())
    grupos = grupos_q.filter(GrupoAcademico.activo == True).all()
    inscritos = ins_q.filter(InscripcionAlumno.estado == "ACTIVO").count()
    return {
        "periodos": db.query(PeriodoEscolar).filter(PeriodoEscolar.activo == True).count(),
        "grupos": len(grupos),
        "inscripciones_activas": inscritos,
        "grupos_sin_alumnos": sum(1 for g in grupos if not any(i.estado == "ACTIVO" for i in g.inscripciones)),
        "alumnos_sin_grupo": db.query(CatalogoAlumno).filter(
            CatalogoAlumno.activo == True,
            ~CatalogoAlumno.id.in_(db.query(InscripcionAlumno.alumno_id).filter(InscripcionAlumno.estado == "ACTIVO"))
        ).count(),
    }


@router.get("/periodos", summary="Listar periodos escolares")
def listar_periodos_escolares(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    _ensure_organizacion_desde_catalogo(db)
    periodos = db.query(PeriodoEscolar).order_by(PeriodoEscolar.id.desc()).all()
    vigente = _periodo_vigente(periodos)
    return [{
        "id": p.id,
        "clave": p.clave,
        "activo": p.activo,
        "es_actual": bool(vigente and p.id == vigente.id),
        "es_actual_configurado": p.es_actual,
        "coincide_con_fecha": _normalizar_periodo(p.clave) == _normalizar_periodo(_clave_periodo_por_fecha()),
    } for p in periodos]


@router.post("/periodos", status_code=status.HTTP_201_CREATED, summary="Crear periodo escolar en preparación")
def crear_periodo_escolar(
    data: PeriodoEscolarIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    existente = next((p for p in db.query(PeriodoEscolar).all()
                      if _normalizar_periodo(p.clave) == _normalizar_periodo(data.clave)), None)
    if existente:
        raise HTTPException(409, "El periodo escolar ya existe")
    periodo = PeriodoEscolar(clave=data.clave, activo=True, es_actual=False)
    db.add(periodo)
    db.commit()
    db.refresh(periodo)
    return {
        "id": periodo.id,
        "clave": periodo.clave,
        "activo": periodo.activo,
        "es_actual": False,
        "es_actual_configurado": False,
        "coincide_con_fecha": _normalizar_periodo(periodo.clave) == _normalizar_periodo(_clave_periodo_por_fecha()),
        "estado": "PREPARACION",
        "mensaje": f"{periodo.clave} fue creado en preparación.",
    }


@router.patch("/periodos/{periodo_id}/establecer-actual", summary="Establecer periodo escolar actual")
def establecer_periodo_escolar_actual(
    periodo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    periodo = db.query(PeriodoEscolar).filter(
        PeriodoEscolar.id == periodo_id,
        PeriodoEscolar.activo == True,
    ).first()
    if not periodo:
        raise HTTPException(404, "Periodo escolar no encontrado")
    esperado = _clave_periodo_por_fecha()
    if _normalizar_periodo(periodo.clave) != _normalizar_periodo(esperado):
        raise HTTPException(
            409,
            f"El periodo correspondiente a la fecha actual es {esperado}. No se puede abrir otro periodo todavía.",
        )
    db.query(PeriodoEscolar).filter(
        PeriodoEscolar.id != periodo.id,
        PeriodoEscolar.es_actual == True,
    ).update({"es_actual": False}, synchronize_session=False)
    periodo.es_actual = True
    db.commit()
    return {
        "id": periodo.id,
        "clave": periodo.clave,
        "es_actual": True,
        "mensaje": f"{periodo.clave} quedó establecido como periodo actual.",
    }


@router.get("/grupos", summary="Listar grupos académicos")
def listar_grupos_academicos(
    periodo: str = Query(""),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    _ensure_organizacion_desde_catalogo(db)
    q = db.query(GrupoAcademico).join(PeriodoEscolar)
    if periodo.strip():
        q = q.filter(PeriodoEscolar.clave == periodo.strip())
    result = []
    for g in q.order_by(PeriodoEscolar.id.desc(), GrupoAcademico.carrera, GrupoAcademico.cuatrimestre, GrupoAcademico.grupo).all():
        total = sum(1 for i in g.inscripciones if i.estado == "ACTIVO")
        result.append({"id": g.id, "periodo": g.periodo.clave, "carrera": g.carrera,
            "cuatrimestre": g.cuatrimestre, "grupo": g.grupo, "turno": g.turno,
            "activo": g.activo, "total_alumnos": total})
    return result


@router.get("/grupos/{grupo_id}/alumnos", summary="Alumnos inscritos en un grupo")
def alumnos_de_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    grupo = db.query(GrupoAcademico).get(grupo_id)
    if not grupo:
        raise HTTPException(404, "Grupo no encontrado")
    return [_serializar_alumno(i.alumno) for i in grupo.inscripciones if i.estado == "ACTIVO"]


def _fila_promocion(inscripcion, promocion=None):
    alumno, grupo = inscripcion.alumno, inscripcion.grupo_academico
    resolucion = promocion.resolucion if promocion else "PENDIENTE"
    return {
        "inscripcion_id": inscripcion.id, "promocion_id": promocion.id if promocion else None,
        "alumno_id": alumno.id, "matricula": alumno.matricula,
        "alumno": f"{alumno.apellido_paterno} {alumno.apellido_materno or ''} {alumno.nombres}".strip(),
        "carrera": grupo.carrera, "grupo_origen_id": grupo.id,
        "cuatrimestre_origen": grupo.cuatrimestre, "grupo_origen": grupo.grupo,
        "origen": f"{grupo.cuatrimestre}° {grupo.grupo}",
        "resolucion": resolucion,
        "cuatrimestre_destino": promocion.cuatrimestre_destino if promocion else min(grupo.cuatrimestre + 1, 12),
        "grupo_destino": promocion.grupo_destino if promocion else grupo.grupo,
        "observaciones": promocion.observaciones if promocion else None,
        "estado": promocion.estado if promocion else "SIN_REVISAR",
    }


@router.get("/promociones", summary="Bandeja de promoción del cuatrimestre")
def listar_promociones(periodo_origen_id: int, periodo_destino_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _require_se(db, current_user)
    origen = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == periodo_origen_id).first()
    destino = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == periodo_destino_id).first()
    if not origen or not destino or origen.id == destino.id:
        raise HTTPException(422, "Selecciona periodos de origen y destino diferentes")
    cierre = db.query(CierreAcademicoPeriodo).filter(CierreAcademicoPeriodo.periodo_id == origen.id).first()
    inscripciones = (db.query(InscripcionAlumno).join(GrupoAcademico).filter(
        GrupoAcademico.periodo_id == origen.id, InscripcionAlumno.estado.in_(["ACTIVO", "CONCLUIDA"]),
    ).order_by(GrupoAcademico.carrera, GrupoAcademico.cuatrimestre, GrupoAcademico.grupo).all())
    ids = [i.id for i in inscripciones]
    promociones = {p.inscripcion_origen_id: p for p in db.query(PromocionAcademicaAlumno).filter(
        PromocionAcademicaAlumno.inscripcion_origen_id.in_(ids), PromocionAcademicaAlumno.periodo_destino_id == destino.id,
    ).all()} if ids else {}
    filas = [_fila_promocion(i, promociones.get(i.id)) for i in inscripciones]
    return {
        "periodo_origen": origen.clave, "periodo_destino": destino.clave,
        "cierre_academico": cierre.estado if cierre else "SIN_CONFIGURAR",
        "puede_aplicar": bool(cierre and cierre.estado == "CERRADO"),
        "total": len(filas), "revisados": sum(f["resolucion"] != "PENDIENTE" for f in filas),
        "aplicados": sum(f["estado"] == "APLICADA" for f in filas), "alumnos": filas,
    }


@router.put("/promociones/{inscripcion_id}", summary="Resolver promoción de un alumno")
def resolver_promocion(inscripcion_id: int, data: ResolucionPromocionIn, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _require_se(db, current_user)
    inscripcion = db.query(InscripcionAlumno).filter(InscripcionAlumno.id == inscripcion_id).first()
    destino = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == data.periodo_destino_id).first()
    resolucion = data.resolucion.upper()
    if not inscripcion or not destino: raise HTTPException(404, "Inscripción o periodo no encontrado")
    if resolucion not in RESOLUCIONES_PROMOCION: raise HTTPException(422, "Resolución no válida")
    requiere_grupo = resolucion in {"PROMOVIDO", "REPITE"}
    if requiere_grupo and (not data.cuatrimestre_destino or not data.grupo_destino):
        raise HTTPException(422, "Indica cuatrimestre y grupo de destino")
    promo = db.query(PromocionAcademicaAlumno).filter(PromocionAcademicaAlumno.inscripcion_origen_id == inscripcion.id).first()
    if promo and promo.estado == "APLICADA": raise HTTPException(409, "La promoción ya fue aplicada")
    if not promo:
        promo = PromocionAcademicaAlumno(alumno_id=inscripcion.alumno_id, inscripcion_origen_id=inscripcion.id, periodo_destino_id=destino.id)
        db.add(promo)
    promo.periodo_destino_id = destino.id; promo.resolucion = resolucion
    promo.cuatrimestre_destino = data.cuatrimestre_destino if requiere_grupo else None
    promo.grupo_destino = data.grupo_destino.strip().upper() if requiere_grupo else None
    promo.observaciones = data.observaciones; promo.estado = "RESUELTA" if resolucion != "PENDIENTE" else "PROPUESTA"
    promo.resuelto_por_id = current_user.id; promo.resuelto_en = _now()
    db.commit(); db.refresh(promo)
    return _fila_promocion(inscripcion, promo)


@router.put("/promociones", summary="Resolver promoción de varios alumnos")
def resolver_promociones_masivas(
    data: ResolucionPromocionMasivaIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(db, current_user)
    destino = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == data.periodo_destino_id).first()
    if not destino:
        raise HTTPException(404, "Periodo destino no encontrado")
    resolucion = data.resolucion.upper()
    if resolucion not in RESOLUCIONES_PROMOCION or resolucion == "PENDIENTE":
        raise HTTPException(422, "Selecciona una resolución definitiva para la operación masiva")
    requiere_grupo = resolucion in {"PROMOVIDO", "REPITE"}
    if requiere_grupo and (not data.cuatrimestre_destino or not data.grupo_destino):
        raise HTTPException(422, "Indica cuatrimestre y grupo de destino")
    ids = list(dict.fromkeys(data.inscripcion_ids))
    inscripciones = db.query(InscripcionAlumno).filter(InscripcionAlumno.id.in_(ids)).all()
    if len(inscripciones) != len(ids):
        raise HTTPException(404, "Una o más inscripciones no existen")
    grupos_origen = {i.grupo_academico_id for i in inscripciones}
    if len(grupos_origen) != 1:
        raise HTTPException(422, "La resolución masiva debe corresponder a un solo grupo de origen")
    if inscripciones[0].grupo_academico.periodo_id == destino.id:
        raise HTTPException(422, "El periodo destino debe ser diferente al periodo de origen")
    promociones = {p.inscripcion_origen_id: p for p in db.query(PromocionAcademicaAlumno).filter(
        PromocionAcademicaAlumno.inscripcion_origen_id.in_(ids),
    ).all()}
    actualizadas = omitidas = 0
    for inscripcion in inscripciones:
        promo = promociones.get(inscripcion.id)
        if promo and promo.estado == "APLICADA":
            omitidas += 1
            continue
        if data.solo_pendientes and promo and promo.resolucion != "PENDIENTE":
            omitidas += 1
            continue
        if not promo:
            promo = PromocionAcademicaAlumno(
                alumno_id=inscripcion.alumno_id,
                inscripcion_origen_id=inscripcion.id,
                periodo_destino_id=destino.id,
            )
            db.add(promo)
        promo.periodo_destino_id = destino.id
        promo.resolucion = resolucion
        promo.cuatrimestre_destino = data.cuatrimestre_destino if requiere_grupo else None
        promo.grupo_destino = data.grupo_destino.strip().upper() if requiere_grupo else None
        promo.observaciones = data.observaciones
        promo.estado = "RESUELTA"
        promo.resuelto_por_id = current_user.id
        promo.resuelto_en = _now()
        actualizadas += 1
    db.commit()
    return {
        "actualizadas": actualizadas,
        "omitidas": omitidas,
        "mensaje": f"Se guardaron {actualizadas} resoluciones; {omitidas} se conservaron sin cambios.",
    }


@router.post("/promociones/aplicar", summary="Aplicar promociones resueltas")
def aplicar_promociones(periodo_origen_id: int, periodo_destino_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _require_se(db, current_user)
    cierre = db.query(CierreAcademicoPeriodo).filter(CierreAcademicoPeriodo.periodo_id == periodo_origen_id).first()
    if not cierre or cierre.estado != "CERRADO": raise HTTPException(409, "El cierre académico del periodo de origen aún no está concluido")
    promociones = (db.query(PromocionAcademicaAlumno).join(InscripcionAlumno).join(GrupoAcademico).filter(
        GrupoAcademico.periodo_id == periodo_origen_id, PromocionAcademicaAlumno.periodo_destino_id == periodo_destino_id,
        PromocionAcademicaAlumno.estado == "RESUELTA", PromocionAcademicaAlumno.resolucion != "PENDIENTE",
    ).all())
    aplicadas = 0
    for promo in promociones:
        inscripcion, alumno = promo.inscripcion_origen, promo.alumno
        if promo.resolucion in {"PROMOVIDO", "REPITE", "ESTADIA"}:
            cuatrimestre_destino = promo.cuatrimestre_destino or inscripcion.grupo_academico.cuatrimestre
            grupo_destino = promo.grupo_destino or "ESTADIA"
            grupo = db.query(GrupoAcademico).filter(
                GrupoAcademico.periodo_id == periodo_destino_id, GrupoAcademico.carrera == inscripcion.grupo_academico.carrera,
                GrupoAcademico.cuatrimestre == cuatrimestre_destino, GrupoAcademico.grupo == grupo_destino,
            ).first()
            if not grupo:
                grupo = GrupoAcademico(periodo_id=periodo_destino_id, carrera=inscripcion.grupo_academico.carrera, cuatrimestre=cuatrimestre_destino, grupo=grupo_destino, activo=True)
                db.add(grupo); db.flush()
            nueva = db.query(InscripcionAlumno).filter(InscripcionAlumno.alumno_id == alumno.id, InscripcionAlumno.grupo_academico_id == grupo.id).first()
            if not nueva: db.add(InscripcionAlumno(alumno_id=alumno.id, grupo_academico_id=grupo.id, estado="ACTIVO"))
            else: nueva.estado = "ACTIVO"
            alumno.cuatrimestre = cuatrimestre_destino; alumno.grupo = grupo_destino
            alumno.periodo = promo.periodo_destino.clave; alumno.carrera = grupo.carrera; alumno.activo = True
        elif promo.resolucion in {"EGRESO", "BAJA_TEMPORAL", "BAJA_DEFINITIVA"}:
            alumno.activo = False
        inscripcion.estado = "CONCLUIDA"; promo.estado = "APLICADA"; promo.aplicado_en = _now(); aplicadas += 1
    db.commit()
    return {"aplicadas": aplicadas, "mensaje": f"Se aplicaron {aplicadas} resoluciones sin modificar el historial anterior."}
