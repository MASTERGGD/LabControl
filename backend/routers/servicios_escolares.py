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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from dependencies import get_current_user, hashear_password
from models.usuario import Usuario, RolUsuario
from models.catalogo import CatalogoAlumno, CatalogoCarrera
from models.ficha_socioeconomica import FichaSocioeconomica, EstadoFicha
from services.auditoria import registrar, Accion, Recurso

router = APIRouter(prefix="/servicios-escolares", tags=["Servicios Escolares"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _require_se(user: Usuario):
    if user.rol not in (RolUsuario.SERVICIOS_ESCOLARES, RolUsuario.SUPER_ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Solo Servicios Escolares puede realizar esta acción")


def _require_alumno(user: Usuario):
    if user.rol != RolUsuario.ALUMNO:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acceso solo para alumnos")


def _require_carreras_reader(user: Usuario):
    if user.rol not in (RolUsuario.SERVICIOS_ESCOLARES, RolUsuario.SUPER_ADMIN, RolUsuario.ALUMNO):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes acceso al catalogo de carreras")


def _gen_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _norm_text(v: str | None) -> str:
    return " ".join((v or "").strip().split())


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


def _serializar_carrera(c: CatalogoCarrera) -> dict:
    return {
        "id": c.id,
        "clave": c.clave,
        "nombre": c.nombre,
        "activo": c.activo,
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
    activo: bool = True
    model_config = ConfigDict(extra="ignore")


@router.get("/carreras", summary="Catalogo de carreras para Servicios Escolares y alumnos")
def listar_carreras(
    incluir_inactivas: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_carreras_reader(current_user)
    _ensure_carreras_desde_alumnos(db)
    q = db.query(CatalogoCarrera)
    if not incluir_inactivas:
        q = q.filter(CatalogoCarrera.activo == True)
    return [_serializar_carrera(c) for c in q.order_by(CatalogoCarrera.nombre).all()]


@router.post("/carreras", summary="Registrar carrera")
def crear_carrera(
    body: CarreraBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(current_user)
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
    carrera = CatalogoCarrera(clave=clave, nombre=nombre, activo=body.activo)
    db.add(carrera)
    db.commit()
    db.refresh(carrera)
    return _serializar_carrera(carrera)


@router.put("/carreras/{carrera_id}", summary="Actualizar carrera")
def actualizar_carrera(
    carrera_id: int,
    body: CarreraBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(current_user)
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
    carrera.clave = clave
    carrera.nombre = nombre
    carrera.activo = body.activo
    carrera.actualizado_en = datetime.datetime.utcnow()
    db.commit()
    db.refresh(carrera)
    return _serializar_carrera(carrera)


@router.delete("/carreras/{carrera_id}", summary="Desactivar carrera")
def desactivar_carrera(
    carrera_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(current_user)
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
    _require_se(current_user)

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
    _require_se(current_user)
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
    _require_se(current_user)
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
    _require_se(current_user)
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
    )
    db.add(u)
    db.flush()

    a.usuario_id = u.id
    if body.correo_institucional:
        a.correo_institucional = body.correo_institucional.strip()
    db.commit()

    registrar(db, accion=Accion.CREAR_USUARIO, recurso=Recurso.USUARIO,
              usuario=current_user,
              detalle={"alumno_id": alumno_id, "email": email, "accion": "activar_acceso_siga"})

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
    _require_se(current_user)
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
    db.commit()

    registrar(db, accion=Accion.CAMBIAR_PASSWORD, recurso=Recurso.USUARIO,
              usuario=current_user, recurso_id=u.id,
              detalle={"alumno_id": alumno_id, "email": u.email, "accion": "reset_password_alumno"})

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
    _require_se(current_user)
    a = db.query(CatalogoAlumno).get(alumno_id)
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    if not a.usuario_id:
        raise HTTPException(400, "Este alumno no tiene cuenta SIGA")
    u = db.query(Usuario).get(a.usuario_id)
    if u:
        u.activo = False
    db.commit()
    return {"ok": True}


# ─── Fichas socioecónicas ─────────────────────────────────────────────────────

@router.post("/alumnos/{alumno_id}/fichas", summary="Activar ficha socioecónomica para el alumno")
def activar_ficha(
    alumno_id: int,
    periodo: str = Query(..., description="Período del estudio, ej. MAY-AGO 2026"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_se(current_user)
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
    db.add(ficha)
    db.commit()
    db.refresh(ficha)
    return _serializar_ficha_resumen(ficha)


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
    _require_se(current_user)

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
    _require_se(current_user)
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
    _require_se(current_user)
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
    _require_se(current_user)

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

    # Aplicar todos los campos del body
    campos = [
        "nombre_completo","fecha_ingreso","carrera","sexo","estado_civil",
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
    if "carrera" in body_dict:
        body_dict["carrera"] = _validar_carrera_activa(db, body_dict["carrera"])
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
