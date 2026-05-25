from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from services.auditoria import registrar, Accion, Recurso
import openpyxl, io, unicodedata
from typing import Optional, List
from database import get_db
from models.inventario import Activo, Prestamo, Incidente, MantenimientoPreventivo
from models.laboratorio import Laboratorio
from models.usuario import Usuario, RolUsuario
from models.adeudo import Adeudo
from dependencies import get_current_user, require_roles
from rls import assert_lab_write, assert_resource_access
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

router = APIRouter(prefix="/inventario", tags=["Inventario y Préstamos"])

CATEGORIAS = ["COMPUTADORA", "IMPRESORA_3D", "BRAZO_ROBOTICO", "SCANNER", "IOT", "HERRAMIENTA", "MOBILIARIO", "OTRO"]
ESTADOS_ACTIVO = ["OPERATIVO", "MANTENIMIENTO", "DAÑADO", "BAJA"]
ESTADOS_PRESTAMO = ["ACTIVO", "DEVUELTO", "VENCIDO"]
CONDICIONES = ["EXCELENTE", "BUENO", "REGULAR", "DAÑADO"]

# Códigos cortos por categoría para armar el número de inventario
TIPO_CODIGO = {
    "COMPUTADORA":    "PC",
    "IMPRESORA_3D":   "IMP",
    "BRAZO_ROBOTICO": "ROB",
    "SCANNER":        "SCN",
    "IOT":            "IOT",
    "HERRAMIENTA":    "HER",
    "MOBILIARIO":     "MOB",
    "OTRO":           "OTR",
}


# ─── Schemas ───────────────────────────────────────────────────────────────────

class ActivoCreate(BaseModel):
    laboratorio_id: int
    # Opcional: si no se envía, el sistema genera el código automáticamente
    codigo_inventario: Optional[str] = Field(None, min_length=2, max_length=50)
    nombre: str                      = Field(..., min_length=2, max_length=100)
    categoria: str                   = Field(..., description=f"Una de: {CATEGORIAS}")
    area: Optional[str]              = None   # Prefijo de área, p.ej. "LTI", "LINF"
    marca: Optional[str]             = None
    modelo: Optional[str]            = None
    numero_serie: Optional[str]      = None
    valor: Optional[float]           = Field(None, ge=0)
    estado: str                      = "OPERATIVO"
    especificaciones: Optional[str]  = None
    observaciones: Optional[str]     = None
    resguardo_nombre: Optional[str]  = None

class ActivoUpdate(BaseModel):
    nombre: Optional[str]           = Field(None, min_length=2, max_length=100)
    categoria: Optional[str]        = None
    area: Optional[str]             = None
    marca: Optional[str]            = None
    modelo: Optional[str]           = None
    numero_serie: Optional[str]     = None
    valor: Optional[float]          = Field(None, ge=0)
    estado: Optional[str]           = None
    especificaciones: Optional[str] = None
    observaciones: Optional[str]    = None
    resguardo_nombre: Optional[str] = None
    activo: Optional[bool]          = None

class PrestamoCreate(BaseModel):
    activo_id: int
    receptor_nombre: str              = Field(..., min_length=2, max_length=100)
    receptor_matricula: Optional[str] = None
    receptor_tipo: str                = Field(default="ALUMNO")
    proposito: Optional[str]          = None
    fecha_devolucion_esperada: Optional[str] = None   # ISO date string YYYY-MM-DD
    notas: Optional[str]              = None

class PrestamoDevolver(BaseModel):
    condicion_devolucion: str         = Field(..., description="BUENO, REGULAR, MALO, DAÑADO")
    notas_devolucion: Optional[str]   = None

class IncidenteCreate(BaseModel):
    activo_id:       Optional[int]   = None
    computadora_id:  Optional[int]   = None
    laboratorio_id:  Optional[int]   = None
    origen:          str             = Field(default="MANUAL")   # PRESTAMO | SESION | MANUAL
    origen_id:       Optional[int]   = None
    tipo:            str             = Field(default="DAÑO")     # DAÑO | MANTENIMIENTO | PERDIDA | OTRO
    descripcion:     Optional[str]   = None
    prioridad:       str             = Field(default="MEDIA")    # ALTA | MEDIA | BAJA

class IncidenteUpdate(BaseModel):
    estado:            Optional[str]   = None   # PENDIENTE | EN_REVISION | REPARADO | DADO_DE_BAJA
    prioridad:         Optional[str]   = None
    notas_seguimiento: Optional[str]   = None
    costo_reparacion:  Optional[float] = None
    descripcion:       Optional[str]   = None


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _normalizar(texto: str) -> str:
    """Quita acentos y convierte a mayúsculas para comparaciones flexibles."""
    txt = texto.upper().strip()
    return "".join(
        c for c in unicodedata.normalize("NFD", txt)
        if unicodedata.category(c) != "Mn"
    )


def _buscar_lab(nombre_excel: str, labs_dict: dict, db, current_user):
    """
    Busca un laboratorio con tolerancia a acentos y diferencias parciales.
    labs_dict: {nombre_normalizado: objeto Laboratorio}
    Retorna el lab o None.
    """
    clave = _normalizar(nombre_excel)
    if not clave:
        return None
    # 1. Coincidencia exacta (sin acentos)
    if clave in labs_dict:
        return labs_dict[clave]
    # 2. El nombre del Excel está contenido en el nombre del lab o viceversa
    for key, lab in labs_dict.items():
        if clave in key or key in clave:
            return lab
    # 3. Coincidencia por palabras clave (al menos la mitad de palabras coinciden)
    palabras = set(clave.split())
    for key, lab in labs_dict.items():
        palabras_lab = set(key.split())
        comunes = palabras & palabras_lab
        if len(comunes) >= max(1, len(palabras) // 2):
            return lab
    # 4. Fallback LAB_ADMIN
    from models.usuario import RolUsuario as _R
    if current_user.rol == _R.LAB_ADMIN and current_user.laboratorio_id:
        return db.query(Laboratorio).filter(Laboratorio.id == current_user.laboratorio_id).first()
    return None


def _generar_codigo(db: Session, categoria: str, area: str = None) -> str:
    """Genera el siguiente número de inventario libre en formato UTC-[ÁREA]-[TIPO]-[SEQ]."""
    tipo      = TIPO_CODIGO.get(categoria.upper(), "OTR")
    area_code = (area or "UTC").upper().strip().replace(" ", "")[:10]
    prefix    = f"UTC-{area_code}-{tipo}-"
    existentes = db.query(Activo.codigo_inventario).filter(
        Activo.codigo_inventario.like(f"{prefix}%")
    ).all()
    max_seq = 0
    for (code,) in existentes:
        try:
            seq = int(code[len(prefix):])
            max_seq = max(max_seq, seq)
        except (ValueError, IndexError):
            pass
    return f"{prefix}{(max_seq + 1):03d}"


def _actualizar_estado_prestamos(db: Session):
    """Marca como VENCIDO cualquier préstamo activo con fecha de retorno pasada."""
    ahora = _utcnow()
    vencidos = db.query(Prestamo).filter(
        Prestamo.estado == "ACTIVO",
        Prestamo.fecha_retorno_esperada < ahora,
    ).all()
    for p in vencidos:
        p.estado = "VENCIDO"
    if vencidos:
        db.commit()

def _serializar_activo(a: Activo, db: Session) -> dict:
    lab = db.query(Laboratorio).filter(Laboratorio.id == a.laboratorio_id).first()
    prestamo_activo = db.query(Prestamo).filter(
        Prestamo.activo_id == a.id,
        Prestamo.estado.in_(["ACTIVO", "VENCIDO"])
    ).first()
    return {
        "id": a.id,
        "laboratorio_id": a.laboratorio_id,
        "laboratorio_nombre": lab.nombre if lab else None,
        "codigo_inventario": a.codigo_inventario,
        "nombre": a.nombre,
        "categoria": a.categoria,
        "marca": a.marca,
        "modelo": a.modelo,
        "numero_serie": a.numero_serie,
        "fecha_adquisicion": a.fecha_adquisicion.isoformat() if a.fecha_adquisicion else None,
        "valor": a.valor,
        "estado": a.estado,
        "especificaciones": a.especificaciones,
        "observaciones": a.observaciones,
        "area": a.area,
        "resguardo_nombre": a.resguardo_nombre,
        "activo": a.activo,
        "prestado": prestamo_activo is not None,
        "prestamo_estado": prestamo_activo.estado if prestamo_activo else None,
    }

def _serializar_prestamo(p: Prestamo, db: Session) -> dict:
    activo   = db.query(Activo).filter(Activo.id == p.activo_id).first()
    lab      = db.query(Laboratorio).filter(Laboratorio.id == activo.laboratorio_id).first() if activo else None
    ahora    = _utcnow()
    dias_vencido = None
    if p.estado == "VENCIDO" and p.fecha_retorno_esperada:
        dias_vencido = (ahora - p.fecha_retorno_esperada).days

    # Decodificar datos extras guardados en observaciones_salida como JSON simple
    receptor_tipo = "ALUMNO"
    proposito     = None
    if p.observaciones_salida and p.observaciones_salida.startswith("__meta__"):
        try:
            import json
            meta = json.loads(p.observaciones_salida[8:])
            receptor_tipo = meta.get("receptor_tipo", "ALUMNO")
            proposito     = meta.get("proposito")
        except Exception:
            proposito = p.observaciones_salida

    return {
        "id": p.id,
        "activo_id": p.activo_id,
        "activo_nombre": activo.nombre if activo else None,
        "activo_codigo": activo.codigo_inventario if activo else None,
        "activo_categoria": activo.categoria if activo else None,
        "activo_lab": lab.nombre if lab else None,
        "laboratorio_id": activo.laboratorio_id if activo else None,
        # Nombres compatibles con el frontend
        "receptor_nombre": p.solicitante_nombre,
        "receptor_matricula": p.solicitante_id_escolar,
        "receptor_tipo": receptor_tipo,
        "proposito": proposito,
        "fecha_prestamo": p.fecha_salida.isoformat() if p.fecha_salida else None,
        "fecha_devolucion_esperada": p.fecha_retorno_esperada.isoformat() if p.fecha_retorno_esperada else None,
        "fecha_devolucion_real": p.fecha_retorno_real.isoformat() if p.fecha_retorno_real else None,
        "estado": p.estado,
        "condicion_devolucion": p.condicion_retorno,
        "dias_vencido": dias_vencido,
    }


def _meta_prestamo(p: Prestamo) -> dict:
    """Extrae metadatos legibles guardados en observaciones_salida."""
    if not p.observaciones_salida:
        return {"receptor_tipo": "ALUMNO", "proposito": None, "descripcion": None}
    if not p.observaciones_salida.startswith("__meta__"):
        return {
            "receptor_tipo": "ALUMNO",
            "proposito": None,
            "descripcion": p.observaciones_salida,
        }
    try:
        import json
        meta = json.loads(p.observaciones_salida[8:])
        return {
            "receptor_tipo": meta.get("receptor_tipo", "ALUMNO"),
            "proposito": meta.get("proposito"),
            "descripcion": None,
        }
    except Exception:
        return {"receptor_tipo": "ALUMNO", "proposito": None, "descripcion": None}


def _serializar_incidente(i: Incidente, db: Session) -> dict:
    from models.laboratorio import Computadora
    from models.sesion import AsignacionPC
    activo    = db.query(Activo).filter(Activo.id == i.activo_id).first() if i.activo_id else None
    lab       = db.query(Laboratorio).filter(Laboratorio.id == i.laboratorio_id).first() if i.laboratorio_id else None
    # Para computadoras, intentar obtener datos básicos
    pc_info   = None
    if i.computadora_id:
        try:
            pc = db.query(Computadora).filter(Computadora.id == i.computadora_id).first()
            if pc:
                pc_info = {"codigo": pc.codigo, "fila": getattr(pc, "fila", None)}
                if not lab:
                    lab = db.query(Laboratorio).filter(Laboratorio.id == pc.laboratorio_id).first()
        except Exception:
            pass

    reporter  = db.query(Usuario).filter(Usuario.id == i.reportado_por_id).first() if i.reportado_por_id else None

    # ── Alumno responsable ────────────────────────────────────────────────────
    # SESION     → alumno que tenía la PC en ESA sesión (testigo directo, certeza ALTA)
    # RECEPCION  → alumno de la sesión ANTERIOR a la que recibió el daño (certeza MEDIA)
    alumno_responsable = None
    certeza            = None
    if i.origen == "SESION" and i.origen_id and i.computadora_id:
        certeza = "ALTA"
        try:
            asig = db.query(AsignacionPC).filter(
                AsignacionPC.sesion_id      == i.origen_id,
                AsignacionPC.computadora_id == i.computadora_id,
            ).order_by(AsignacionPC.hora_asignacion.desc()).first()
            if asig:
                alumno_responsable = {
                    "nombre":    asig.alumno_nombre,
                    "matricula": asig.alumno_matricula,
                }
        except Exception:
            pass
    elif i.origen == "RECEPCION" and i.computadora_id:
        certeza = "MEDIA"
        try:
            # Buscar la última AsignacionPC de sesiones DISTINTAS a la actual
            asig = db.query(AsignacionPC).filter(
                AsignacionPC.computadora_id == i.computadora_id,
                AsignacionPC.sesion_id      != (i.origen_id or 0),
            ).order_by(AsignacionPC.hora_asignacion.desc()).first()
            if asig:
                from models.sesion import SesionClase as SC
                sesion_ant = db.query(SC).filter(SC.id == asig.sesion_id).first()
                alumno_responsable = {
                    "nombre":          asig.alumno_nombre,
                    "matricula":       asig.alumno_matricula,
                    "sesion_anterior": {
                        "id":     sesion_ant.id           if sesion_ant else None,
                        "codigo": sesion_ant.codigo_sesion if sesion_ant else None,
                        "materia": sesion_ant.materia      if sesion_ant else None,
                        "inicio": sesion_ant.inicio.isoformat() if sesion_ant and sesion_ant.inicio else None,
                    },
                }
        except Exception:
            pass

    # ── Adeudo vinculado a este incidente ────────────────────────────────────
    adeudo_vinculado = db.query(Adeudo).filter(Adeudo.incidente_id == i.id).first()

    return {
        "id":               i.id,
        "activo_id":        i.activo_id,
        "activo_nombre":    activo.nombre if activo else None,
        "activo_codigo":    activo.codigo_inventario if activo else None,
        "activo_categoria": activo.categoria if activo else None,
        "computadora_id":   i.computadora_id,
        "pc_codigo":        pc_info["codigo"] if pc_info else None,
        "laboratorio_id":   i.laboratorio_id or (lab.id if lab else None),
        "laboratorio_nombre": lab.nombre if lab else None,
        "origen":           i.origen,
        "origen_id":        i.origen_id,
        "tipo":             i.tipo,
        "descripcion":      i.descripcion,
        "reportado_por":    reporter.nombre if reporter else None,
        "fecha_reporte":    i.fecha_reporte.isoformat() if i.fecha_reporte else None,
        "estado":           i.estado,
        "prioridad":        i.prioridad,
        "notas_seguimiento": i.notas_seguimiento,
        "fecha_resolucion": i.fecha_resolucion.isoformat() if i.fecha_resolucion else None,
        "costo_reparacion": i.costo_reparacion,
        "alumno_responsable": alumno_responsable,
        "certeza":            certeza,
        # Adeudo vinculado (si existe)
        "adeudo_id":          adeudo_vinculado.id     if adeudo_vinculado else None,
        "adeudo_estado":      adeudo_vinculado.estado if adeudo_vinculado else None,
        "adeudo_persona":     adeudo_vinculado.persona_nombre if adeudo_vinculado else None,
    }


# ─── Activos ───────────────────────────────────────────────────────────────────

@router.get("/activos", summary="Listar activos")
def listar_activos(
    laboratorio_id: Optional[int] = None,
    categoria: Optional[str]      = None,
    estado: Optional[str]         = None,
    solo_activos: bool             = True,
    solo_disponibles: bool         = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _actualizar_estado_prestamos(db)
    q = db.query(Activo)
    if solo_activos:
        q = q.filter(Activo.activo == True)
    if laboratorio_id:
        q = q.filter(Activo.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(Activo.laboratorio_id == current_user.laboratorio_id)
    if categoria:
        q = q.filter(Activo.categoria == categoria.upper())
    if estado:
        q = q.filter(Activo.estado == estado.upper())

    activos = q.order_by(Activo.categoria, Activo.nombre).all()
    result  = [_serializar_activo(a, db) for a in activos]

    if solo_disponibles:
        result = [a for a in result if not a["prestado"]]
    return result


@router.post("/activos", status_code=status.HTTP_201_CREATED, summary="Registrar activo")
def crear_activo(
    request: Request,
    data: ActivoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    # RLS: LAB_ADMIN solo puede crear activos en su propio laboratorio
    assert_lab_write(data.laboratorio_id, current_user)

    if data.categoria.upper() not in CATEGORIAS:
        raise HTTPException(status_code=422, detail=f"Categoría inválida. Use: {CATEGORIAS}")
    if not db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id, Laboratorio.activo == True).first():
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")

    # Auto-generar código si no se proporcionó
    codigo = data.codigo_inventario or _generar_codigo(db, data.categoria, data.area)

    if db.query(Activo).filter(Activo.codigo_inventario == codigo).first():
        raise HTTPException(status_code=409, detail=f"Ya existe un activo con código '{codigo}'")

    payload = data.model_dump(exclude={"codigo_inventario"})
    payload["categoria"] = payload["categoria"].upper()
    a = Activo(**payload, codigo_inventario=codigo, fecha_adquisicion=_utcnow())
    db.add(a)
    db.commit()
    db.refresh(a)
    registrar(db, accion=Accion.CREAR_ACTIVO, recurso=Recurso.ACTIVO,
              usuario=current_user, recurso_id=a.id,
              detalle={"codigo": a.codigo_inventario, "nombre": a.nombre, "categoria": a.categoria},
              request=request)
    return _serializar_activo(a, db)


@router.get("/activos/{activo_id}", summary="Detalle de activo")
def obtener_activo(
    activo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    a = db.query(Activo).filter(Activo.id == activo_id).first()
    # RLS: LAB_ADMIN no puede ver activos de otros laboratorios (devuelve 404)
    assert_resource_access(a, current_user)
    historial = db.query(Prestamo).filter(
        Prestamo.activo_id == activo_id
    ).order_by(Prestamo.fecha_salida.desc()).limit(10).all()
    detalle = _serializar_activo(a, db)
    detalle["historial_prestamos"] = [_serializar_prestamo(p, db) for p in historial]
    return detalle


@router.put("/activos/{activo_id}", summary="Editar activo")
def editar_activo(
    request: Request,
    activo_id: int,
    data: ActivoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    a = db.query(Activo).filter(Activo.id == activo_id).first()
    # RLS: LAB_ADMIN solo puede editar activos de su laboratorio
    assert_resource_access(a, current_user)
    campos = data.model_dump(exclude_none=True)
    if "categoria" in campos:
        campos["categoria"] = campos["categoria"].upper()
    for campo, valor in campos.items():
        setattr(a, campo, valor)
    db.commit()
    db.refresh(a)
    registrar(db, accion=Accion.EDITAR_ACTIVO, recurso=Recurso.ACTIVO,
              usuario=current_user, recurso_id=a.id,
              detalle={"campos": list(campos.keys())},
              request=request)
    return _serializar_activo(a, db)


@router.delete("/activos/{activo_id}", summary="Dar de baja activo")
def dar_baja_activo(
    request: Request,
    activo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    a = db.query(Activo).filter(Activo.id == activo_id).first()
    # RLS: LAB_ADMIN solo puede dar de baja activos de su laboratorio
    assert_resource_access(a, current_user)
    prestamo_activo = db.query(Prestamo).filter(
        Prestamo.activo_id == activo_id,
        Prestamo.estado.in_(["ACTIVO", "VENCIDO"])
    ).first()
    if prestamo_activo:
        raise HTTPException(status_code=409, detail="No se puede dar de baja: el activo tiene un préstamo activo")
    a.activo = False
    a.estado = "BAJA"
    db.commit()
    registrar(db, accion=Accion.ELIMINAR_ACTIVO, recurso=Recurso.ACTIVO,
              usuario=current_user, recurso_id=a.id,
              detalle={"nombre": a.nombre, "codigo": a.codigo_inventario},
              request=request)
    return {"mensaje": f"Activo '{a.nombre}' dado de baja"}


# ─── Préstamos ─────────────────────────────────────────────────────────────────

@router.get("/prestamos", summary="Listar préstamos")
def listar_prestamos(
    estado: Optional[str]         = None,
    laboratorio_id: Optional[int] = None,
    activo_id: Optional[int]      = None,
    vencidos_solo: bool            = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _actualizar_estado_prestamos(db)
    q = db.query(Prestamo)
    if estado:
        q = q.filter(Prestamo.estado == estado.upper())
    if vencidos_solo:
        q = q.filter(Prestamo.estado == "VENCIDO")
    if activo_id:
        q = q.filter(Prestamo.activo_id == activo_id)
    if laboratorio_id:
        activo_ids = [a.id for a in db.query(Activo).filter(Activo.laboratorio_id == laboratorio_id).all()]
        q = q.filter(Prestamo.activo_id.in_(activo_ids))
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        activo_ids = [a.id for a in db.query(Activo).filter(Activo.laboratorio_id == current_user.laboratorio_id).all()]
        q = q.filter(Prestamo.activo_id.in_(activo_ids))

    prestamos = q.order_by(Prestamo.fecha_salida.desc()).all()
    return [_serializar_prestamo(p, db) for p in prestamos]


@router.get("/prestamos/vencidos", summary="Préstamos vencidos (alertas)")
def prestamos_vencidos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _actualizar_estado_prestamos(db)
    q = db.query(Prestamo).filter(Prestamo.estado == "VENCIDO")
    if current_user.rol == RolUsuario.LAB_ADMIN:
        activo_ids = [a.id for a in db.query(Activo).filter(Activo.laboratorio_id == current_user.laboratorio_id).all()]
        q = q.filter(Prestamo.activo_id.in_(activo_ids))
    return [_serializar_prestamo(p, db) for p in q.order_by(Prestamo.fecha_retorno_esperada).all()]


@router.post("/prestamos", status_code=status.HTTP_201_CREATED, summary="Registrar préstamo")
def crear_prestamo(
    request: Request,
    data: PrestamoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    if current_user.rol == RolUsuario.ALUMNO:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    _actualizar_estado_prestamos(db)

    activo = db.query(Activo).filter(Activo.id == data.activo_id, Activo.activo == True).first()
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado o dado de baja")

    # RLS: LAB_ADMIN solo puede prestar activos de su propio laboratorio
    assert_resource_access(activo, current_user)
    if activo.estado not in ("OPERATIVO",):
        raise HTTPException(status_code=400, detail=f"El activo está en estado '{activo.estado}', no se puede prestar")

    prestamo_activo = db.query(Prestamo).filter(
        Prestamo.activo_id == data.activo_id,
        Prestamo.estado.in_(["ACTIVO", "VENCIDO"])
    ).first()
    if prestamo_activo:
        raise HTTPException(status_code=409, detail="Este activo ya tiene un préstamo activo sin devolver")

    # Parsear fecha de devolución esperada
    fecha_retorno = None
    if data.fecha_devolucion_esperada:
        try:
            # Parsear solo la fecha (YYYY-MM-DD) y ponerla al final del día
            # para evitar falsos positivos por diferencia UTC vs hora local
            fecha_date = datetime.date.fromisoformat(data.fecha_devolucion_esperada[:10])
        except ValueError:
            raise HTTPException(status_code=422, detail="Formato de fecha inválido, use YYYY-MM-DD")
        # Rechazar solo si la fecha es estrictamente anterior a hoy
        if fecha_date < datetime.date.today():
            raise HTTPException(status_code=422, detail="La fecha de devolución no puede ser en el pasado")
        # Guardar como datetime al final del día
        fecha_retorno = datetime.datetime.combine(fecha_date, datetime.time(23, 59, 59))
    else:
        # Por defecto 7 días
        fecha_retorno = _utcnow() + datetime.timedelta(days=7)

    # Guardar receptor_tipo y proposito en observaciones_salida como metadato JSON
    import json
    meta = json.dumps({"receptor_tipo": data.receptor_tipo, "proposito": data.proposito})
    obs_salida = f"__meta__{meta}"

    p = Prestamo(
        activo_id=data.activo_id,
        solicitante_nombre=data.receptor_nombre,
        solicitante_id_escolar=data.receptor_matricula or "",
        autorizado_por=current_user.id,
        fecha_salida=_utcnow(),
        fecha_retorno_esperada=fecha_retorno,
        estado="ACTIVO",
        condicion_salida="BUENO",
        observaciones_salida=obs_salida,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    registrar(db, accion=Accion.CREAR_PRESTAMO, recurso=Recurso.PRESTAMO,
              usuario=current_user, recurso_id=p.id,
              detalle={"activo_id": p.activo_id, "receptor": p.solicitante_nombre},
              request=request)
    return _serializar_prestamo(p, db)


@router.post("/prestamos/{prestamo_id}/devolver", summary="Registrar devolución")
def devolver_prestamo(
    request: Request,
    prestamo_id: int,
    data: PrestamoDevolver,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    p = db.query(Prestamo).filter(Prestamo.id == prestamo_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Préstamo no encontrado")
    if p.estado == "DEVUELTO":
        raise HTTPException(status_code=400, detail="Este préstamo ya fue devuelto")

    p.estado                = "DEVUELTO"
    p.fecha_retorno_real    = _utcnow()
    p.condicion_retorno     = data.condicion_devolucion
    p.observaciones_retorno = data.notas_devolucion

    # ── Auto-crear incidente y actualizar estado del activo si regresa dañado ──
    activo = db.query(Activo).filter(Activo.id == p.activo_id).first()
    if data.condicion_devolucion in ("MALO", "DAÑADO") and activo:
        nuevo_estado = "DAÑADO" if data.condicion_devolucion == "DAÑADO" else "MANTENIMIENTO"
        activo.estado = nuevo_estado

        incidente = Incidente(
            activo_id        = activo.id,
            laboratorio_id   = activo.laboratorio_id,
            origen           = "PRESTAMO",
            origen_id        = p.id,
            tipo             = "DAÑO" if data.condicion_devolucion == "DAÑADO" else "MANTENIMIENTO",
            descripcion      = data.notas_devolucion or f"Equipo devuelto en condición {data.condicion_devolucion} por {p.solicitante_nombre}",
            reportado_por_id = current_user.id,
            prioridad        = "ALTA" if data.condicion_devolucion == "DAÑADO" else "MEDIA",
            estado           = "PENDIENTE",
        )
        db.add(incidente)

        # ── Auto-crear adeudo por daño al equipo ──────────────────────────────
        # Obtener tipo de persona desde metadato guardado en observaciones_salida
        import json as _json
        obs_salida = p.observaciones_salida or ""
        try:
            meta = _json.loads(obs_salida[8:] if obs_salida.startswith("__meta__") else (obs_salida or "{}"))
            persona_tipo = meta.get("receptor_tipo", "ALUMNO")
        except Exception:
            persona_tipo = "ALUMNO"

        nombre_equipo = f"{activo.nombre} (cód. {activo.codigo_inventario})" if activo else "Equipo"
        adeudo_danio = Adeudo(
            persona_nombre        = p.solicitante_nombre,
            persona_identificador = p.solicitante_id_escolar or "",
            persona_tipo          = persona_tipo,
            origen_tipo           = "PRESTAMO",
            tipo                  = "DAÑO",
            descripcion           = (
                f"Equipo devuelto dañado — Préstamo #{p.id}. "
                f"{nombre_equipo}. "
                f"Condición al devolver: {data.condicion_devolucion}. "
                + (f"Nota: {data.notas_devolucion}" if data.notas_devolucion else "")
            ),
            prestamo_id           = p.id,
            laboratorio_id        = activo.laboratorio_id if activo else None,
            estado                = "PENDIENTE",
            reportado_por_id      = current_user.id,
            fecha_reporte         = _utcnow(),
        )
        db.add(adeudo_danio)

        # Notificar a admins del laboratorio
        try:
            from routers.notificaciones import crear_notificacion
            admins = db.query(Usuario).filter(
                Usuario.activo == True,
                Usuario.rol.in_(["SUPER_ADMIN", "LAB_ADMIN"]),
            ).all()
            for admin in admins:
                if admin.rol == "SUPER_ADMIN" or admin.laboratorio_id == activo.laboratorio_id:
                    crear_notificacion(
                        db, admin.id,
                        "PRESTAMO_VENCIDO",
                        f"⚠️ Equipo devuelto dañado — {p.solicitante_nombre}",
                        f"{nombre_equipo} devuelto en condición {data.condicion_devolucion}. "
                        f"Se generó adeudo automáticamente.",
                    )
        except Exception:
            pass

    # ── Auto-resolver adeudo por vencimiento si existía (el equipo fue devuelto) ──
    adeudo_vinculado = db.query(Adeudo).filter(
        Adeudo.prestamo_id == prestamo_id,
        Adeudo.tipo.in_(["PRESTAMO_VENCIDO", "PRESTAMO_NO_DEVUELTO"]),
        Adeudo.estado.in_(["PENDIENTE", "EN_REVISION"]),
    ).first()
    if adeudo_vinculado:
        adeudo_vinculado.estado           = "RESUELTO"
        adeudo_vinculado.fecha_resolucion = _utcnow()
        adeudo_vinculado.resuelto_por_id  = current_user.id
        adeudo_vinculado.notas_resolucion = (
            f"Préstamo devuelto el {_utcnow().strftime('%d/%m/%Y')} "
            f"en condición {data.condicion_devolucion}. "
            + (data.notas_devolucion or "")
        )

    db.commit()
    db.refresh(p)
    registrar(db, accion=Accion.DEVOLVER_PRESTAMO, recurso=Recurso.PRESTAMO,
              usuario=current_user, recurso_id=p.id,
              detalle={"activo_id": p.activo_id, "condicion": data.condicion_devolucion},
              request=request)
    return _serializar_prestamo(p, db)


# --- Incidentes ────────────────────────────────────────────────────────────────

@router.get("/incidentes", summary="Listar incidentes de mantenimiento")
def listar_incidentes(
    estado:         Optional[str] = None,
    prioridad:      Optional[str] = None,
    laboratorio_id: Optional[int] = None,
    tipo:           Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(Incidente)
    if estado:
        q = q.filter(Incidente.estado == estado.upper())
    if prioridad:
        q = q.filter(Incidente.prioridad == prioridad.upper())
    if tipo:
        q = q.filter(Incidente.tipo == tipo.upper())
    if laboratorio_id:
        q = q.filter(Incidente.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(Incidente.laboratorio_id == current_user.laboratorio_id)

    incidentes = q.order_by(Incidente.fecha_reporte.desc()).all()
    return [_serializar_incidente(i, db) for i in incidentes]


@router.post("/incidentes", status_code=status.HTTP_201_CREATED, summary="Crear incidente manualmente")
def crear_incidente(
    request: Request,
    data: IncidenteCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    if current_user.rol == RolUsuario.ALUMNO:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    # Si viene activo_id, extraer laboratorio_id automáticamente
    lab_id = data.laboratorio_id
    if data.activo_id and not lab_id:
        activo = db.query(Activo).filter(Activo.id == data.activo_id).first()
        if activo:
            lab_id = activo.laboratorio_id

    # Si viene computadora_id, extraer laboratorio_id automáticamente
    if data.computadora_id and not lab_id:
        from models.laboratorio import Computadora
        pc = db.query(Computadora).filter(Computadora.id == data.computadora_id).first()
        if pc:
            lab_id = pc.laboratorio_id

    i = Incidente(
        activo_id        = data.activo_id,
        computadora_id   = data.computadora_id,
        laboratorio_id   = lab_id,
        origen           = data.origen.upper(),
        origen_id        = data.origen_id,
        tipo             = data.tipo.upper(),
        descripcion      = data.descripcion,
        reportado_por_id = current_user.id,
        prioridad        = data.prioridad.upper(),
        estado           = "PENDIENTE",
    )
    db.add(i)

    # Si el incidente es sobre un activo de inventario → actualizar su estado
    if data.activo_id and data.tipo.upper() in ("DAÑO", "MANTENIMIENTO"):
        activo = db.query(Activo).filter(Activo.id == data.activo_id).first()
        if activo:
            activo.estado = "DAÑADO" if data.tipo.upper() == "DAÑO" else "MANTENIMIENTO"

    # ── Si es una PC de cómputo → ponerla en MANTENIMIENTO inmediatamente ──
    # Esto la bloquea en el mapa de sesiones hasta que el admin la repare
    if data.computadora_id and data.tipo.upper() in ("DAÑO", "MANTENIMIENTO", "OTRO"):
        from models.laboratorio import Computadora
        pc = db.query(Computadora).filter(Computadora.id == data.computadora_id).first()
        if pc:
            pc.estado = "MANTENIMIENTO"

    db.commit()
    db.refresh(i)
    registrar(db, accion=Accion.CREAR_MANTENIMIENTO, recurso=Recurso.INCIDENTE,
              usuario=current_user, recurso_id=i.id,
              detalle={"tipo": i.tipo, "prioridad": i.prioridad,
                       "laboratorio_id": i.laboratorio_id, "origen": i.origen,
                       "activo_id": i.activo_id, "computadora_id": i.computadora_id},
              request=request)
    return _serializar_incidente(i, db)


@router.put("/incidentes/{incidente_id}", summary="Actualizar estado/seguimiento del incidente")
def actualizar_incidente(
    request: Request,
    incidente_id: int,
    data: IncidenteUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    if current_user.rol == RolUsuario.ALUMNO:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    i = db.query(Incidente).filter(Incidente.id == incidente_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Incidente no encontrado")

    campos = data.model_dump(exclude_none=True)
    estado_anterior = i.estado

    # ── Bloquear reabrir un incidente que ya generó un adeudo ────────────────
    nuevo_estado = campos.get("estado", "").upper() if "estado" in campos else ""
    if nuevo_estado in ("PENDIENTE", "EN_REVISION"):
        adeudo_vinculado = db.query(Adeudo).filter(Adeudo.incidente_id == incidente_id).first()
        if adeudo_vinculado and adeudo_vinculado.estado not in ("RESUELTO", "CANCELADO"):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Este incidente tiene un adeudo vinculado en estado '{adeudo_vinculado.estado}' "
                    f"(ID #{adeudo_vinculado.id}). No se puede reabrir hasta que el adeudo sea "
                    f"resuelto o cancelado. Si necesitas revisar el equipo, crea un nuevo incidente de inspección."
                )
            )

    for campo, valor in campos.items():
        if isinstance(valor, str):
            valor = valor.upper() if campo in ("estado", "prioridad") else valor
        setattr(i, campo, valor)

    # Si se marca como REPARADO → registrar fecha y reactivar el equipo
    if "estado" in campos and campos["estado"].upper() == "REPARADO":
        i.fecha_resolucion = _utcnow()
        # Activo de inventario → vuelve a OPERATIVO
        if i.activo_id:
            activo = db.query(Activo).filter(Activo.id == i.activo_id).first()
            if activo:
                activo.estado = "OPERATIVO"
        # PC de cómputo → vuelve a OPERATIVO (disponible en mapa de sesiones)
        if i.computadora_id:
            from models.laboratorio import Computadora
            pc = db.query(Computadora).filter(Computadora.id == i.computadora_id).first()
            if pc:
                pc.estado = "OPERATIVO"

    # Si se cierra sin adeudo → solo registrar fecha de resolución
    if "estado" in campos and campos["estado"].upper() == "CERRADO_SIN_ADEUDO":
        i.fecha_resolucion = _utcnow()

    # Si se marca como DADO_DE_BAJA → dar de baja el equipo
    if "estado" in campos and campos["estado"].upper() == "DADO_DE_BAJA":
        i.fecha_resolucion = _utcnow()
        # Activo de inventario → baja definitiva
        if i.activo_id:
            activo = db.query(Activo).filter(Activo.id == i.activo_id).first()
            if activo:
                activo.estado = "BAJA"
                activo.activo = False
        # PC de cómputo → estado BAJA (no aparece en mapa)
        if i.computadora_id:
            from models.laboratorio import Computadora
            pc = db.query(Computadora).filter(Computadora.id == i.computadora_id).first()
            if pc:
                pc.estado = "BAJA"
                pc.activa = False

    db.commit()
    db.refresh(i)
    # Audit log when closing/resolving
    if "estado" in campos and campos["estado"].upper() in ("REPARADO", "CERRADO_SIN_ADEUDO", "DADO_DE_BAJA"):
        registrar(db, accion=Accion.CERRAR_MANTENIMIENTO, recurso=Recurso.INCIDENTE,
                  usuario=current_user, recurso_id=i.id,
                  detalle={"estado_anterior": estado_anterior, "estado_nuevo": i.estado,
                           "laboratorio_id": i.laboratorio_id},
                  request=request)
    return _serializar_incidente(i, db)


@router.get("/incidentes/estadisticas", summary="Resumen de incidentes")
def estadisticas_incidentes(
    laboratorio_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(Incidente)
    if laboratorio_id:
        q = q.filter(Incidente.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(Incidente.laboratorio_id == current_user.laboratorio_id)

    todos = q.all()
    return {
        "total":       len(todos),
        "pendientes":  sum(1 for i in todos if i.estado == "PENDIENTE"),
        "en_revision": sum(1 for i in todos if i.estado == "EN_REVISION"),
        "reparados":   sum(1 for i in todos if i.estado == "REPARADO"),
        "dados_de_baja": sum(1 for i in todos if i.estado == "DADO_DE_BAJA"),
        "alta_prioridad": sum(1 for i in todos if i.prioridad == "ALTA" and i.estado not in ("REPARADO", "DADO_DE_BAJA")),
    }


@router.get("/categorias", summary="Categorías disponibles")
def listar_categorias(_: Usuario = Depends(get_current_user)):
    return {"categorias": CATEGORIAS, "estados": ESTADOS_ACTIVO, "condiciones": CONDICIONES}


@router.get("/labs-nombres", summary="Nombres exactos de laboratorios activos")
def labs_nombres(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user)
):
    """Devuelve los nombres tal como están registrados, para usarlos en la plantilla."""
    labs = db.query(Laboratorio).filter(Laboratorio.activo == True).order_by(Laboratorio.nombre).all()
    return [{"id": l.id, "nombre": l.nombre} for l in labs]


@router.get("/estadisticas", summary="Resumen del inventario")
def estadisticas(
    laboratorio_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _actualizar_estado_prestamos(db)
    q_a = db.query(Activo).filter(Activo.activo == True)
    q_p = db.query(Prestamo)

    if laboratorio_id:
        q_a = q_a.filter(Activo.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        q_a = q_a.filter(Activo.laboratorio_id == current_user.laboratorio_id)

    activos = q_a.all()
    ids = [a.id for a in activos]
    prestamos = db.query(Prestamo).filter(Prestamo.activo_id.in_(ids)).all() if ids else []

    por_categoria = {}
    for a in activos:
        por_categoria[a.categoria] = por_categoria.get(a.categoria, 0) + 1

    return {
        "total_activos": len(activos),
        "operativos": sum(1 for a in activos if a.estado == "OPERATIVO"),
        "en_mantenimiento": sum(1 for a in activos if a.estado == "MANTENIMIENTO"),
        "dañados": sum(1 for a in activos if a.estado == "DAÑADO"),
        "prestamos_totales":  len(prestamos),
        "prestamos_activos":  sum(1 for p in prestamos if p.estado == "ACTIVO"),
        "prestamos_vencidos": sum(1 for p in prestamos if p.estado == "VENCIDO"),
        "prestamos_devueltos": sum(1 for p in prestamos if p.estado == "DEVUELTO"),
        "por_categoria": por_categoria,
    }


# ─── Importación masiva desde Plantilla_Inventario_UTC.xlsx ────────────────────
#
# Columnas de la plantilla simplificada (0-indexed):
#   A(0)=# (fila)   B(1)=NOMBRE*   C(2)=LABORATORIO*   D(3)=CATEGORÍA*
#   E(4)=ÁREA        F(5)=MARCA      G(6)=MODELO          H(7)=NUM_SERIE
#   I(8)=ESPECIFICACIONES   J(9)=VALOR   K(10)=ESTADO
#   L(11)=RESGUARDO   M(12)=OBSERVACIONES
#
# El sistema genera el número de inventario automáticamente (UTC-[ÁREA]-[TIPO]-[SEQ])

_admin_roles = require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN)

@router.post("/activos/importar", summary="Importar activos desde Plantilla_Inventario_UTC.xlsx")
async def importar_activos(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_admin_roles),
):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Solo se aceptan archivos .xlsx o .xls")

    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    except Exception:
        raise HTTPException(400, "Archivo Excel inválido o dañado")

    ws = wb["Inventario"] if "Inventario" in wb.sheetnames else wb.active

    def _v(row, idx):
        v = row[idx] if idx < len(row) else None
        return str(v).strip() if v is not None else ""

    # Cache de laboratorios (nombre normalizado sin acentos → objeto)
    labs_list = db.query(Laboratorio).filter(Laboratorio.activo == True).all()
    labs = {_normalizar(lab.nombre): lab for lab in labs_list}

    creados = 0
    actualizados = 0
    errores = []

    for row_idx, row in enumerate(ws.iter_rows(min_row=6, values_only=True), start=6):
        # Fila completamente vacía → fin del listado
        if all(v is None for v in row):
            break
        # Fila de ejemplo (primera celda es "→")
        if str(row[0] or "").strip() == "→":
            continue

        nombre     = _v(row, 1)
        lab_nombre = _v(row, 2).upper()
        categoria  = _v(row, 3).upper() or "OTRO"
        area       = _v(row, 4) or None          # prefijo opcional (ej. "LTI")
        marca      = _v(row, 5) or None
        modelo     = _v(row, 6) or None
        num_serie  = _v(row, 7) or None
        specs      = _v(row, 8) or None
        valor_raw  = row[9]  if 9  < len(row) else None
        estado     = _v(row, 10).upper() or "OPERATIVO"
        resguardo  = _v(row, 11) or None
        obs        = _v(row, 12) or None

        fila_errs = []
        if not nombre:
            fila_errs.append("Nombre/descripción requerido (columna B)")

        # Normalizar categoría
        if categoria not in CATEGORIAS:
            categoria = "OTRO"

        # Normalizar estado
        if estado not in ESTADOS_ACTIVO:
            estado = "OPERATIVO"

        # Parsear valor monetario
        try:
            valor = float(valor_raw) if valor_raw is not None else None
        except (ValueError, TypeError):
            valor = None

        # Buscar laboratorio con tolerancia a acentos y coincidencias parciales
        lab = _buscar_lab(_v(row, 2), labs, db, current_user)
        if not lab:
            nombres_disponibles = ", ".join(f"'{l.nombre}'" for l in labs_list)
            fila_errs.append(
                f"Laboratorio '{_v(row, 2)}' no encontrado. "
                f"Nombres disponibles: {nombres_disponibles}"
            )

        if fila_errs:
            errores.append({"fila": row_idx, "codigo": "—", "nombre": nombre or "—", "errores": fila_errs})
            continue

        # Generar número de inventario automáticamente
        codigo = _generar_codigo(db, categoria, area)

        db.add(Activo(
            codigo_inventario = codigo,
            nombre            = nombre,
            laboratorio_id    = lab.id,
            categoria         = categoria,
            area              = area,
            marca             = marca,
            modelo            = modelo,
            numero_serie      = num_serie,
            especificaciones  = specs,
            valor             = valor,
            estado            = estado,
            resguardo_nombre  = resguardo,
            observaciones     = obs,
        ))
        # Flush para que _generar_codigo en la siguiente fila vea este código
        db.flush()
        creados += 1

    db.commit()
    return {
        "creados":       creados,
        "actualizados":  0,           # La importación siempre crea (no actualiza, el código es nuevo)
        "total_errores": len(errores),
        "errores":       errores,
    }


# ══════════════════════════════════════════════════════════════════════════════
# MANTENIMIENTO PREVENTIVO
# ══════════════════════════════════════════════════════════════════════════════

TIPOS_MANT = ["LIMPIEZA_FISICA","REVISION_SOFTWARE","ACTUALIZACION","REVISION_HARDWARE",
              "FORMATEO","RESPALDO","INSPECCION","OTRO"]
PERIODOS   = ["SEMANAL","MENSUAL","TRIMESTRAL","SEMESTRAL","ANUAL","UNICO"]
ESTADOS_MP = ["PENDIENTE","EN_PROCESO","COMPLETADO","OMITIDO"]

class MantPrevCreate(BaseModel):
    activo_id:        Optional[int]  = None
    computadora_id:   Optional[int]  = None
    laboratorio_id:   Optional[int]  = None
    tipo:             str
    periodicidad:     str             = "TRIMESTRAL"
    fecha_programada: str             # ISO string
    fecha_limite:     Optional[str]   = None
    descripcion:      Optional[str]   = None
    checklist:        Optional[str]   = None   # JSON string

class MantPrevUpdate(BaseModel):
    estado:           Optional[str]  = None
    fecha_inicio:     Optional[str]  = None
    fecha_completado: Optional[str]  = None
    notas_result:     Optional[str]  = None
    costo:            Optional[float]= None
    duracion_min:     Optional[int]  = None
    checklist:        Optional[str]  = None
    descripcion:      Optional[str]  = None
    fecha_programada: Optional[str]  = None
    fecha_limite:     Optional[str]  = None


def _serializar_mp(mp: MantenimientoPreventivo, db: Session) -> dict:
    activo_nombre = None
    if mp.activo_id:
        a = db.query(Activo).filter(Activo.id == mp.activo_id).first()
        if a:
            activo_nombre = f"{a.nombre} ({a.codigo_inventario})"
    from models.laboratorio import Computadora
    pc_codigo = None
    if mp.computadora_id:
        pc = db.query(Computadora).filter(Computadora.id == mp.computadora_id).first()
        if pc:
            pc_codigo = pc.codigo
    completado_por = None
    if mp.completado_por_id:
        u = db.query(Usuario).filter(Usuario.id == mp.completado_por_id).first()
        if u:
            completado_por = u.nombre
    lab_nombre = None
    if mp.laboratorio_id:
        l = db.query(Laboratorio).filter(Laboratorio.id == mp.laboratorio_id).first()
        if l:
            lab_nombre = l.nombre
    return {
        "id":               mp.id,
        "activo_id":        mp.activo_id,
        "activo_nombre":    activo_nombre,
        "computadora_id":   mp.computadora_id,
        "pc_codigo":        pc_codigo,
        "laboratorio_id":   mp.laboratorio_id,
        "laboratorio_nombre": lab_nombre,
        "tipo":             mp.tipo,
        "periodicidad":     mp.periodicidad,
        "fecha_programada": mp.fecha_programada.isoformat() if mp.fecha_programada else None,
        "fecha_limite":     mp.fecha_limite.isoformat() if mp.fecha_limite else None,
        "estado":           mp.estado,
        "fecha_inicio":     mp.fecha_inicio.isoformat() if mp.fecha_inicio else None,
        "fecha_completado": mp.fecha_completado.isoformat() if mp.fecha_completado else None,
        "completado_por":   completado_por,
        "descripcion":      mp.descripcion,
        "checklist":        mp.checklist,
        "notas_result":     mp.notas_result,
        "costo":            mp.costo,
        "duracion_min":     mp.duracion_min,
        "fecha_creacion":   mp.fecha_creacion.isoformat() if mp.fecha_creacion else None,
    }


@router.get("/mantenimientos-preventivos", summary="Listar mantenimientos preventivos")
def listar_mantenimientos(
    laboratorio_id: Optional[int] = None,
    estado:         Optional[str] = None,
    activo_id:      Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(MantenimientoPreventivo)
    if laboratorio_id:
        q = q.filter(MantenimientoPreventivo.laboratorio_id == laboratorio_id)
    elif current_user.rol == RolUsuario.LAB_ADMIN and current_user.laboratorio_id:
        q = q.filter(MantenimientoPreventivo.laboratorio_id == current_user.laboratorio_id)
    if estado:
        q = q.filter(MantenimientoPreventivo.estado == estado.upper())
    if activo_id:
        q = q.filter(MantenimientoPreventivo.activo_id == activo_id)
    items = q.order_by(MantenimientoPreventivo.fecha_programada).all()
    return [_serializar_mp(m, db) for m in items]


@router.post("/mantenimientos-preventivos", summary="Programar mantenimiento preventivo")
def crear_mantenimiento(
    data: MantPrevCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    mp = MantenimientoPreventivo(
        activo_id        = data.activo_id,
        computadora_id   = data.computadora_id,
        laboratorio_id   = data.laboratorio_id,
        tipo             = data.tipo.upper(),
        periodicidad     = data.periodicidad.upper(),
        fecha_programada = datetime.datetime.fromisoformat(data.fecha_programada),
        fecha_limite     = datetime.datetime.fromisoformat(data.fecha_limite) if data.fecha_limite else None,
        descripcion      = data.descripcion,
        checklist        = data.checklist,
        estado           = "PENDIENTE",
    )
    db.add(mp)
    db.commit()
    db.refresh(mp)
    return _serializar_mp(mp, db)


@router.put("/mantenimientos-preventivos/{mp_id}", summary="Actualizar mantenimiento preventivo")
def actualizar_mantenimiento(
    mp_id: int,
    data: MantPrevUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    mp = db.query(MantenimientoPreventivo).filter(MantenimientoPreventivo.id == mp_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="Mantenimiento no encontrado")

    if data.estado:
        mp.estado = data.estado.upper()
        if data.estado.upper() == "COMPLETADO":
            mp.completado_por_id = current_user.id
            mp.fecha_completado  = _utcnow()
            # Auto-generar el siguiente según periodicidad
            delta_map = {
                "SEMANAL":    datetime.timedelta(weeks=1),
                "MENSUAL":    datetime.timedelta(days=30),
                "TRIMESTRAL": datetime.timedelta(days=90),
                "SEMESTRAL":  datetime.timedelta(days=180),
                "ANUAL":      datetime.timedelta(days=365),
            }
            delta = delta_map.get(mp.periodicidad)
            if delta:
                siguiente = MantenimientoPreventivo(
                    activo_id        = mp.activo_id,
                    computadora_id   = mp.computadora_id,
                    laboratorio_id   = mp.laboratorio_id,
                    tipo             = mp.tipo,
                    periodicidad     = mp.periodicidad,
                    fecha_programada = mp.fecha_completado + delta,
                    fecha_limite     = (mp.fecha_completado + delta + datetime.timedelta(days=14)),
                    descripcion      = mp.descripcion,
                    checklist        = mp.checklist,
                    estado           = "PENDIENTE",
                )
                db.add(siguiente)

    if data.fecha_inicio:
        mp.fecha_inicio = datetime.datetime.fromisoformat(data.fecha_inicio)
    if data.notas_result is not None:
        mp.notas_result = data.notas_result
    if data.costo is not None:
        mp.costo = data.costo
    if data.duracion_min is not None:
        mp.duracion_min = data.duracion_min
    if data.checklist is not None:
        mp.checklist = data.checklist
    if data.descripcion is not None:
        mp.descripcion = data.descripcion
    if data.fecha_programada:
        mp.fecha_programada = datetime.datetime.fromisoformat(data.fecha_programada)
    if data.fecha_limite:
        mp.fecha_limite = datetime.datetime.fromisoformat(data.fecha_limite)

    db.commit()
    db.refresh(mp)
    return _serializar_mp(mp, db)


@router.delete("/mantenimientos-preventivos/{mp_id}", summary="Eliminar mantenimiento preventivo")
def eliminar_mantenimiento(
    mp_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    mp = db.query(MantenimientoPreventivo).filter(MantenimientoPreventivo.id == mp_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="No encontrado")
    db.delete(mp)
    db.commit()
    return {"ok": True}


# ── Historial unificado por activo ────────────────────────────────────────────

@router.get("/activos/{activo_id}/historial", summary="Historial completo de un activo")
def historial_activo(
    activo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    activo = db.query(Activo).filter(Activo.id == activo_id).first()
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")

    eventos = []

    # ── Incidentes ─────────────────────────────────────────────────────────
    for i in db.query(Incidente).filter(Incidente.activo_id == activo_id).all():
        rep_nombre = None
        if i.reportado_por_id:
            u = db.query(Usuario).filter(Usuario.id == i.reportado_por_id).first()
            if u: rep_nombre = u.nombre
        eventos.append({
            "tipo_evento":  "INCIDENTE",
            "fecha":        i.fecha_reporte.isoformat() if i.fecha_reporte else None,
            "fecha_fin":    i.fecha_resolucion.isoformat() if i.fecha_resolucion else None,
            "titulo":       f"{i.tipo.capitalize()} — {i.estado}",
            "descripcion":  i.descripcion,
            "estado":       i.estado,
            "prioridad":    i.prioridad,
            "notas":        i.notas_seguimiento,
            "costo":        i.costo_reparacion,
            "usuario":      rep_nombre,
            "id_ref":       i.id,
        })

    # ── Préstamos ──────────────────────────────────────────────────────────
    for p in db.query(Prestamo).filter(Prestamo.activo_id == activo_id).all():
        meta_prestamo = _meta_prestamo(p)
        eventos.append({
            "tipo_evento":  "PRESTAMO",
            "fecha":        p.fecha_salida.isoformat() if p.fecha_salida else None,
            "fecha_fin":    p.fecha_retorno_real.isoformat() if p.fecha_retorno_real else None,
            "titulo":       f"Prestamo - {p.solicitante_nombre}",
            "descripcion":  meta_prestamo["descripcion"],
            "receptor_tipo": meta_prestamo["receptor_tipo"],
            "proposito":    meta_prestamo["proposito"],
            "estado":       p.estado,
            "condicion_salida":  p.condicion_salida,
            "condicion_retorno": p.condicion_retorno,
            "notas":        p.observaciones_retorno,
            "usuario":      p.solicitante_nombre,
            "id_ref":       p.id,
        })

    # Mantenimientos preventivos
    for mp in db.query(MantenimientoPreventivo).filter(MantenimientoPreventivo.activo_id == activo_id).all():
        comp_nombre = None
        if mp.completado_por_id:
            u = db.query(Usuario).filter(Usuario.id == mp.completado_por_id).first()
            if u: comp_nombre = u.nombre
        eventos.append({
            "tipo_evento":  "MANTENIMIENTO_PREVENTIVO",
            "fecha":        mp.fecha_programada.isoformat() if mp.fecha_programada else None,
            "fecha_fin":    mp.fecha_completado.isoformat() if mp.fecha_completado else None,
            "titulo":       "Preventivo - " + mp.tipo.replace("_", " ").title(),
            "descripcion":  mp.descripcion,
            "estado":       mp.estado,
            "notas":        mp.notas_result,
            "costo":        mp.costo,
            "duracion_min": mp.duracion_min,
            "usuario":      comp_nombre,
            "id_ref":       mp.id,
        })

    eventos.sort(key=lambda e: e["fecha"] or "", reverse=True)
    return {
        "activo_id": activo_id,
        "activo": {
            "id": activo.id,
            "nombre": activo.nombre,
            "codigo": activo.codigo_inventario,
            "codigo_inventario": activo.codigo_inventario,
            "categoria": activo.categoria,
            "marca": activo.marca,
            "modelo": activo.modelo,
            "estado": activo.estado,
            "resguardo_nombre": activo.resguardo_nombre,
            "laboratorio_id": activo.laboratorio_id,
        },
        "total_eventos": len(eventos),
        "eventos": eventos,
    }
