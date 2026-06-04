from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from services.auditoria import registrar, Accion, Recurso
import openpyxl, io, unicodedata
from typing import Optional, List
from database import get_db
from models.departamento import Departamento
from models.inventario import (
    Activo, Prestamo, Incidente, MantenimientoPreventivo, UbicacionInventario,
    MovimientoInventario, SolicitudBajaInventario, LevantamientoInventario,
    RevisionLevantamientoInventario,
)
from models.laboratorio import Laboratorio
from models.usuario import Usuario, RolUsuario
from models.adeudo import Adeudo
from dependencies import get_current_user, require_roles
from rls import assert_lab_write, assert_resource_access
import datetime


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

router = APIRouter(prefix="/inventario", tags=["Inventario y Préstamos"])

CATEGORIAS = [
    "COMPUTADORA", "IMPRESORA_3D", "BRAZO_ROBOTICO", "SCANNER", "IOT",
    "HERRAMIENTA", "MOBILIARIO", "AUDIOVISUAL", "REDES", "MEDICO",
    "OFICINA", "VEHICULO", "OTRO",
]
ESTADOS_ACTIVO = ["OPERATIVO", "MANTENIMIENTO", "DAÑADO", "BAJA"]
ALCANCES_ACTIVO = ["LABORATORIO", "INSTITUCIONAL"]
TIPOS_INVENTARIO = ["ACTIVO"]
ESTADOS_ADMIN_ACTIVO = ["BORRADOR", "EN_REVISION", "OBSERVADO", "VALIDADO", "RECHAZADO", "BAJA_SOLICITADA", "BAJA_EJECUTADA"]
ESTADOS_BAJA = ["SOLICITADA", "EN_REVISION", "VALIDADA_FISICAMENTE", "AUTORIZADA", "RECHAZADA", "EJECUTADA", "CANCELADA"]
ESTADOS_LEVANTAMIENTO = ["ABIERTO", "CERRADO", "CANCELADO"]
ESTADOS_REVISION_LEVANTAMIENTO = ["LOCALIZADO", "NO_LOCALIZADO", "OTRA_UBICACION", "DANADO", "PROPUESTO_BAJA", "DATOS_INCOMPLETOS"]
UNIDADES_MEDIDA = ["PIEZA", "CAJA", "PAQUETE", "JUEGO", "METRO", "LITRO", "KILO", "SERVICIO", "OTRO"]
TIPOS_UBICACION = ["EDIFICIO", "OFICINA", "AULA", "LABORATORIO", "ALMACEN", "BIBLIOTECA", "CONSULTORIO", "TALLER", "EXTERIOR", "OTRO"]
TIPOS_MOVIMIENTO = ["TRANSFERENCIA_DEPARTAMENTO", "CAMBIO_UBICACION", "CAMBIO_RESGUARDANTE", "PRESTAMO_TEMPORAL", "RETORNO", "BAJA", "MANTENIMIENTO", "AJUSTE_INVENTARIO"]
ESTADOS_MOVIMIENTO = ["SOLICITADO", "AUTORIZADO", "RECHAZADO", "ENTREGADO", "RECIBIDO", "CANCELADO"]
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
    "AUDIOVISUAL":    "AUD",
    "REDES":          "RED",
    "MEDICO":         "MED",
    "OFICINA":        "OFI",
    "VEHICULO":       "VEH",
    "OTRO":           "OTR",
}


# ─── Schemas ───────────────────────────────────────────────────────────────────

class ActivoCreate(BaseModel):
    laboratorio_id: Optional[int] = None
    departamento_id: Optional[int] = None
    ubicacion_id: Optional[int] = None
    responsable_id: Optional[int] = None
    alcance: str = Field(default="LABORATORIO", description=f"Uno de: {ALCANCES_ACTIVO}")
    tipo_inventario: str = Field(default="ACTIVO", description=f"Uno de: {TIPOS_INVENTARIO}")
    estado_admin: str = Field(default="VALIDADO", description=f"Uno de: {ESTADOS_ADMIN_ACTIVO}")
    # Opcional: si no se envía, el sistema genera el código automáticamente
    codigo_inventario: Optional[str] = Field(None, min_length=2, max_length=50)
    nombre: str                      = Field(..., min_length=2, max_length=100)
    categoria: str                   = Field(..., description=f"Una de: {CATEGORIAS}")
    area: Optional[str]              = None   # Prefijo de área, p.ej. "LTI", "LINF"
    marca: Optional[str]             = None
    modelo: Optional[str]            = None
    numero_serie: Optional[str]      = None
    valor: Optional[float]           = Field(None, ge=0)
    # Patrimonial: siempre cantidad=1, PIEZA, sin stock mínimo
    cantidad: float                          = Field(default=1.0, ge=1.0, le=1.0)
    unidad_medida: str                       = Field(default="PIEZA", pattern="^PIEZA$")
    stock_minimo: Optional[float]            = Field(None, ge=0)
    estado: str                              = "OPERATIVO"
    especificaciones: Optional[str]          = None
    observaciones: Optional[str]             = None
    resguardante_externo_nombre: Optional[str] = None   # cuando no es usuario del sistema
    ubicacion_tipo: Optional[str]            = None
    ubicacion_nombre: Optional[str]          = None

class ActivoUpdate(BaseModel):
    laboratorio_id: Optional[int]            = None
    departamento_id: Optional[int]           = None
    ubicacion_id: Optional[int]              = None
    responsable_id: Optional[int]            = None
    alcance: Optional[str]                   = None
    tipo_inventario: Optional[str]           = None
    estado_admin: Optional[str]              = None
    nombre: Optional[str]                    = Field(None, min_length=2, max_length=100)
    categoria: Optional[str]                 = None
    area: Optional[str]                      = None
    marca: Optional[str]                     = None
    modelo: Optional[str]                    = None
    numero_serie: Optional[str]              = None
    valor: Optional[float]                   = Field(None, ge=0)
    # cantidad y unidad_medida no se exponen en edición — siempre son 1/PIEZA
    estado: Optional[str]                    = None
    especificaciones: Optional[str]          = None
    observaciones: Optional[str]             = None
    resguardante_externo_nombre: Optional[str] = None
    ubicacion_tipo: Optional[str]            = None
    ubicacion_nombre: Optional[str]          = None
    activo: Optional[bool]                   = None


class UbicacionInventarioIn(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=150)
    tipo: str = Field(default="OFICINA")
    edificio: Optional[str] = Field(None, max_length=120)
    piso: Optional[str] = Field(None, max_length=40)
    referencia: Optional[str] = Field(None, max_length=250)
    departamento_id: Optional[int] = None
    activo: bool = True


class MovimientoInventarioCreate(BaseModel):
    tipo: str = Field(..., description=f"Uno de: {TIPOS_MOVIMIENTO}")
    departamento_destino_id: Optional[int] = None
    ubicacion_destino_id: Optional[int] = None
    resguardante_destino_id: Optional[int] = None
    ubicacion_destino_nombre: Optional[str] = None
    resguardante_destino_nombre: Optional[str] = None
    cantidad: Optional[float] = Field(None, gt=0)
    observaciones: Optional[str] = None


class MovimientoInventarioEstado(BaseModel):
    observaciones: Optional[str] = None


class SolicitudBajaCreate(BaseModel):
    motivo: str = Field(..., min_length=4)
    diagnostico: Optional[str] = None
    evidencia_url: Optional[str] = None
    destino_final: Optional[str] = None
    observaciones: Optional[str] = None


class SolicitudBajaAccion(BaseModel):
    observaciones: Optional[str] = None
    destino_final: Optional[str] = None


class LevantamientoCreate(BaseModel):
    nombre: str = Field(..., min_length=3, max_length=150)
    departamento_id: Optional[int] = None
    laboratorio_id: Optional[int] = None
    observaciones: Optional[str] = None


class RevisionLevantamientoIn(BaseModel):
    activo_id: int
    estado: str = Field(..., description=f"Uno de: {ESTADOS_REVISION_LEVANTAMIENTO}")
    ubicacion_reportada: Optional[str] = None
    resguardante_reportado: Optional[str] = None
    observaciones: Optional[str] = None
    evidencia_url: Optional[str] = None

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
    lab = db.query(Laboratorio).filter(Laboratorio.id == a.laboratorio_id).first() if a.laboratorio_id else None
    dep = db.query(Departamento).filter(Departamento.id == a.departamento_id).first() if a.departamento_id else None
    ubicacion = db.query(UbicacionInventario).filter(UbicacionInventario.id == a.ubicacion_id).first() if a.ubicacion_id else None
    responsable = db.query(Usuario).filter(Usuario.id == a.responsable_id).first() if a.responsable_id else None
    prestamo_activo = db.query(Prestamo).filter(
        Prestamo.activo_id == a.id,
        Prestamo.estado.in_(["ACTIVO", "VENCIDO"])
    ).first()
    ubicacion_label = None
    if ubicacion:
        ubicacion_label = " / ".join([p for p in [ubicacion.edificio, ubicacion.nombre] if p])
    elif a.ubicacion_nombre:
        ubicacion_label = a.ubicacion_nombre
    return {
        "id": a.id,
        "alcance": a.alcance or ("LABORATORIO" if a.laboratorio_id else "INSTITUCIONAL"),
        "tipo_inventario": a.tipo_inventario or "ACTIVO",
        "estado_admin": a.estado_admin or "VALIDADO",
        "laboratorio_id": a.laboratorio_id,
        "laboratorio_nombre": lab.nombre if lab else None,
        "departamento_id": a.departamento_id,
        "departamento_nombre": dep.nombre if dep else None,
        "departamento_clave": dep.clave if dep else None,
        "ubicacion_id": a.ubicacion_id,
        "ubicacion_tipo": a.ubicacion_tipo or (ubicacion.tipo if ubicacion else None),
        "ubicacion_nombre": a.ubicacion_nombre,
        "ubicacion_label": ubicacion_label,
        "responsable_id": a.responsable_id,
        "responsable_nombre": responsable.nombre if responsable else None,
        "codigo_inventario": a.codigo_inventario,
        "nombre": a.nombre,
        "categoria": a.categoria,
        "marca": a.marca,
        "modelo": a.modelo,
        "numero_serie": a.numero_serie,
        "fecha_adquisicion": a.fecha_adquisicion.isoformat() if a.fecha_adquisicion else None,
        "valor": a.valor,
        "cantidad": a.cantidad,
        "unidad_medida": a.unidad_medida,
        "stock_minimo": a.stock_minimo,
        "estado": a.estado,
        "especificaciones": a.especificaciones,
        "observaciones": a.observaciones,
        "area": a.area,
        "resguardante_externo_nombre": a.resguardante_externo_nombre,
        "activo": a.activo,
        "prestado": prestamo_activo is not None,
        "prestamo_estado": prestamo_activo.estado if prestamo_activo else None,
    }


def _serializar_ubicacion(u: UbicacionInventario, db: Session) -> dict:
    dep = db.query(Departamento).filter(Departamento.id == u.departamento_id).first() if u.departamento_id else None
    return {
        "id": u.id,
        "nombre": u.nombre,
        "tipo": u.tipo,
        "edificio": u.edificio,
        "piso": u.piso,
        "referencia": u.referencia,
        "departamento_id": u.departamento_id,
        "departamento_nombre": dep.nombre if dep else None,
        "activo": u.activo,
        "creado_en": u.creado_en.isoformat() if u.creado_en else None,
        "label": " / ".join([p for p in [u.edificio, u.nombre] if p]),
    }


def _serializar_movimiento(m: MovimientoInventario, db: Session) -> dict:
    activo = db.query(Activo).filter(Activo.id == m.activo_id).first()
    dep_o = db.query(Departamento).filter(Departamento.id == m.departamento_origen_id).first() if m.departamento_origen_id else None
    dep_d = db.query(Departamento).filter(Departamento.id == m.departamento_destino_id).first() if m.departamento_destino_id else None
    ubi_o = db.query(UbicacionInventario).filter(UbicacionInventario.id == m.ubicacion_origen_id).first() if m.ubicacion_origen_id else None
    ubi_d = db.query(UbicacionInventario).filter(UbicacionInventario.id == m.ubicacion_destino_id).first() if m.ubicacion_destino_id else None
    solicitado = db.query(Usuario).filter(Usuario.id == m.solicitado_por_id).first() if m.solicitado_por_id else None
    autorizado = db.query(Usuario).filter(Usuario.id == m.autorizado_por_id).first() if m.autorizado_por_id else None
    entregado = db.query(Usuario).filter(Usuario.id == m.entregado_por_id).first() if m.entregado_por_id else None
    recibido = db.query(Usuario).filter(Usuario.id == m.recibido_por_id).first() if m.recibido_por_id else None
    return {
        "id": m.id,
        "activo_id": m.activo_id,
        "activo_nombre": activo.nombre if activo else None,
        "activo_codigo": activo.codigo_inventario if activo else None,
        "tipo": m.tipo,
        "estado": m.estado,
        "departamento_origen_id": m.departamento_origen_id,
        "departamento_origen_nombre": dep_o.nombre if dep_o else None,
        "departamento_destino_id": m.departamento_destino_id,
        "departamento_destino_nombre": dep_d.nombre if dep_d else None,
        "ubicacion_origen_id": m.ubicacion_origen_id,
        "ubicacion_origen_nombre": m.ubicacion_origen_nombre or (ubi_o.nombre if ubi_o else None),
        "ubicacion_destino_id": m.ubicacion_destino_id,
        "ubicacion_destino_nombre": m.ubicacion_destino_nombre or (ubi_d.nombre if ubi_d else None),
        "resguardante_origen_id": m.resguardante_origen_id,
        "resguardante_origen_nombre": m.resguardante_origen_nombre,
        "resguardante_destino_id": m.resguardante_destino_id,
        "resguardante_destino_nombre": m.resguardante_destino_nombre,
        "cantidad": m.cantidad,
        "solicitado_por": solicitado.nombre if solicitado else None,
        "autorizado_por": autorizado.nombre if autorizado else None,
        "entregado_por": entregado.nombre if entregado else None,
        "recibido_por": recibido.nombre if recibido else None,
        "fecha_solicitud": m.fecha_solicitud.isoformat() if m.fecha_solicitud else None,
        "fecha_autorizacion": m.fecha_autorizacion.isoformat() if m.fecha_autorizacion else None,
        "fecha_entrega": m.fecha_entrega.isoformat() if m.fecha_entrega else None,
        "fecha_recepcion": m.fecha_recepcion.isoformat() if m.fecha_recepcion else None,
        "observaciones": m.observaciones,
        "evidencia_url": m.evidencia_url,
    }


def _serializar_solicitud_baja(s: SolicitudBajaInventario, db: Session) -> dict:
    activo     = db.query(Activo).filter(Activo.id == s.activo_id).first()
    solicitado = db.query(Usuario).filter(Usuario.id == s.solicitado_por_id).first()  if s.solicitado_por_id  else None
    revisado   = db.query(Usuario).filter(Usuario.id == s.revisado_por_id).first()    if s.revisado_por_id    else None
    validado   = db.query(Usuario).filter(Usuario.id == s.validado_por_id).first()    if s.validado_por_id    else None
    autorizado = db.query(Usuario).filter(Usuario.id == s.autorizado_por_id).first()  if s.autorizado_por_id  else None
    ejecutado  = db.query(Usuario).filter(Usuario.id == s.ejecutado_por_id).first()   if s.ejecutado_por_id   else None

    # Cuando no hay autorizador y el registro es anterior a v1.3, mostrar etiqueta informativa
    autorizado_label = (
        autorizado.nombre if autorizado
        else ("Previo a trazabilidad v1.3" if s.migrado_version else None)
    )
    return {
        "id": s.id,
        "activo_id": s.activo_id,
        "activo_nombre": activo.nombre if activo else None,
        "activo_codigo": activo.codigo_inventario if activo else None,
        "estado": s.estado,
        "motivo": s.motivo,
        "diagnostico": s.diagnostico,
        "evidencia_url": s.evidencia_url,
        "destino_final": s.destino_final,
        "observaciones": s.observaciones,
        "solicitado_por": solicitado.nombre if solicitado else None,
        "revisado_por": revisado.nombre if revisado else None,
        "validado_por": validado.nombre if validado else None,
        "autorizado_por": autorizado_label,
        "ejecutado_por": ejecutado.nombre if ejecutado else None,
        "fecha_solicitud":    s.fecha_solicitud.isoformat()    + "Z" if s.fecha_solicitud    else None,
        "fecha_revision":     s.fecha_revision.isoformat()     + "Z" if s.fecha_revision     else None,
        "fecha_validacion":   s.fecha_validacion.isoformat()   + "Z" if s.fecha_validacion   else None,
        "fecha_autorizacion": s.fecha_autorizacion.isoformat() + "Z" if s.fecha_autorizacion else None,
        "fecha_ejecucion":    s.fecha_ejecucion.isoformat()    + "Z" if s.fecha_ejecucion    else None,
        "migrado_version": s.migrado_version,
    }


def _serializar_levantamiento(l: LevantamientoInventario, db: Session) -> dict:
    dep = db.query(Departamento).filter(Departamento.id == l.departamento_id).first() if l.departamento_id else None
    lab = db.query(Laboratorio).filter(Laboratorio.id == l.laboratorio_id).first() if l.laboratorio_id else None
    creado = db.query(Usuario).filter(Usuario.id == l.creado_por_id).first() if l.creado_por_id else None
    revisiones = db.query(RevisionLevantamientoInventario).filter(RevisionLevantamientoInventario.levantamiento_id == l.id).all()
    return {
        "id": l.id,
        "nombre": l.nombre,
        "estado": l.estado,
        "departamento_id": l.departamento_id,
        "departamento_nombre": dep.nombre if dep else None,
        "laboratorio_id": l.laboratorio_id,
        "laboratorio_nombre": lab.nombre if lab else None,
        "creado_por": creado.nombre if creado else None,
        "fecha_inicio": l.fecha_inicio.isoformat() if l.fecha_inicio else None,
        "fecha_cierre": l.fecha_cierre.isoformat() if l.fecha_cierre else None,
        "observaciones": l.observaciones,
        "revisados": len(revisiones),
        "no_localizados": sum(1 for r in revisiones if r.estado == "NO_LOCALIZADO"),
        "propuestos_baja": sum(1 for r in revisiones if r.estado == "PROPUESTO_BAJA"),
    }


def _serializar_revision(r: RevisionLevantamientoInventario, db: Session) -> dict:
    activo = db.query(Activo).filter(Activo.id == r.activo_id).first()
    usuario = db.query(Usuario).filter(Usuario.id == r.revisado_por_id).first() if r.revisado_por_id else None
    return {
        "id": r.id,
        "levantamiento_id": r.levantamiento_id,
        "activo_id": r.activo_id,
        "activo_nombre": activo.nombre if activo else None,
        "activo_codigo": activo.codigo_inventario if activo else None,
        "estado": r.estado,
        "ubicacion_reportada": r.ubicacion_reportada,
        "resguardante_reportado": r.resguardante_reportado,
        "observaciones": r.observaciones,
        "evidencia_url": r.evidencia_url,
        "revisado_por": usuario.nombre if usuario else None,
        "fecha_revision": r.fecha_revision.isoformat() if r.fecha_revision else None,
    }


def _validar_destinos_movimiento(data: MovimientoInventarioCreate, db: Session):
    if data.tipo.upper() not in TIPOS_MOVIMIENTO:
        raise HTTPException(status_code=422, detail=f"Tipo de movimiento invalido. Use: {TIPOS_MOVIMIENTO}")
    if data.departamento_destino_id and not db.query(Departamento).filter(Departamento.id == data.departamento_destino_id).first():
        raise HTTPException(status_code=404, detail="Departamento destino no encontrado")
    if data.ubicacion_destino_id and not db.query(UbicacionInventario).filter(UbicacionInventario.id == data.ubicacion_destino_id, UbicacionInventario.activo == True).first():
        raise HTTPException(status_code=404, detail="Ubicacion destino no encontrada")
    if data.resguardante_destino_id and not db.query(Usuario).filter(Usuario.id == data.resguardante_destino_id, Usuario.activo == True).first():
        raise HTTPException(status_code=404, detail="Resguardante destino no encontrado")


def _aplicar_movimiento_recibido(activo: Activo, mov: MovimientoInventario):
    tipo = (mov.tipo or "").upper()
    if tipo == "BAJA":
        activo.estado_admin = "BAJA_SOLICITADA"
        activo.estado = "BAJA"
        activo.activo = False
        return
    if tipo == "MANTENIMIENTO":
        activo.estado = "MANTENIMIENTO"
        return
    if tipo in ("TRANSFERENCIA_DEPARTAMENTO", "CAMBIO_UBICACION", "CAMBIO_RESGUARDANTE", "PRESTAMO_TEMPORAL", "RETORNO", "AJUSTE_INVENTARIO"):
        if mov.departamento_destino_id is not None:
            activo.departamento_id = mov.departamento_destino_id
        if mov.ubicacion_destino_id is not None:
            activo.ubicacion_id = mov.ubicacion_destino_id
            activo.ubicacion_nombre = None
        elif mov.ubicacion_destino_nombre:
            activo.ubicacion_id = None
            activo.ubicacion_nombre = mov.ubicacion_destino_nombre
        if mov.resguardante_destino_id is not None:
            # Resguardante con cuenta SIGA: usar FK, limpiar texto libre
            activo.responsable_id = mov.resguardante_destino_id
            activo.resguardante_externo_nombre = None
        elif mov.resguardante_destino_nombre:
            # Resguardante externo sin cuenta: usar texto libre, limpiar FK
            activo.resguardante_externo_nombre = mov.resguardante_destino_nombre
            activo.responsable_id = None

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

@router.get("/ubicaciones", summary="Listar ubicaciones de inventario")
def listar_ubicaciones(
    activo: Optional[bool] = True,
    tipo: Optional[str] = None,
    departamento_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(UbicacionInventario)
    if activo is not None:
        q = q.filter(UbicacionInventario.activo == activo)
    if tipo:
        q = q.filter(UbicacionInventario.tipo == tipo.upper())
    if departamento_id:
        q = q.filter(UbicacionInventario.departamento_id == departamento_id)
    return [_serializar_ubicacion(u, db) for u in q.order_by(UbicacionInventario.edificio, UbicacionInventario.nombre).all()]


@router.post("/ubicaciones", status_code=status.HTTP_201_CREATED, summary="Crear ubicacion de inventario")
def crear_ubicacion(
    data: UbicacionInventarioIn,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN)),
):
    tipo = data.tipo.upper()
    if tipo not in TIPOS_UBICACION:
        raise HTTPException(status_code=422, detail=f"Tipo de ubicacion invalido. Use: {TIPOS_UBICACION}")
    if data.departamento_id and not db.query(Departamento).filter(Departamento.id == data.departamento_id).first():
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    ubicacion = UbicacionInventario(
        nombre=data.nombre.strip(),
        tipo=tipo,
        edificio=data.edificio.strip() if data.edificio else None,
        piso=data.piso.strip() if data.piso else None,
        referencia=data.referencia.strip() if data.referencia else None,
        departamento_id=data.departamento_id,
        activo=data.activo,
        creado_en=_utcnow(),
    )
    db.add(ubicacion)
    db.commit()
    db.refresh(ubicacion)
    return _serializar_ubicacion(ubicacion, db)


@router.get("/activos", summary="Listar activos")
def listar_activos(
    laboratorio_id: Optional[int] = None,
    departamento_id: Optional[int] = None,
    ubicacion_id: Optional[int] = None,
    alcance: Optional[str]         = None,
    tipo_inventario: Optional[str] = None,
    estado_admin: Optional[str]    = None,
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
    if departamento_id:
        q = q.filter(Activo.departamento_id == departamento_id)
    if ubicacion_id:
        q = q.filter(Activo.ubicacion_id == ubicacion_id)
    if alcance:
        q = q.filter(Activo.alcance == alcance.upper())
    if tipo_inventario:
        q = q.filter(Activo.tipo_inventario == tipo_inventario.upper())
    if estado_admin:
        q = q.filter(Activo.estado_admin == estado_admin.upper())
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
    alcance = (data.alcance or "LABORATORIO").upper()
    if alcance not in ALCANCES_ACTIVO:
        raise HTTPException(status_code=422, detail=f"Alcance invalido. Use: {ALCANCES_ACTIVO}")
    if current_user.rol == RolUsuario.LAB_ADMIN and alcance != "LABORATORIO":
        raise HTTPException(status_code=403, detail="Solo Super Admin puede crear activos institucionales")
    tipo_inventario = (data.tipo_inventario or "ACTIVO").upper()
    if tipo_inventario not in TIPOS_INVENTARIO:
        raise HTTPException(status_code=422, detail=f"Tipo de inventario invalido. Use: {TIPOS_INVENTARIO}")
    estado_admin = (data.estado_admin or "VALIDADO").upper()
    if estado_admin not in ESTADOS_ADMIN_ACTIVO:
        raise HTTPException(status_code=422, detail=f"Estado administrativo invalido. Use: {ESTADOS_ADMIN_ACTIVO}")
    unidad_medida = (data.unidad_medida or "PIEZA").upper()
    if unidad_medida not in UNIDADES_MEDIDA:
        raise HTTPException(status_code=422, detail=f"Unidad de medida invalida. Use: {UNIDADES_MEDIDA}")

    if data.categoria.upper() not in CATEGORIAS:
        raise HTTPException(status_code=422, detail=f"Categoría inválida. Use: {CATEGORIAS}")
    if alcance == "LABORATORIO":
        if not data.laboratorio_id:
            raise HTTPException(status_code=422, detail="laboratorio_id es requerido para activos de laboratorio")
        assert_lab_write(data.laboratorio_id, current_user)
        if not db.query(Laboratorio).filter(Laboratorio.id == data.laboratorio_id, Laboratorio.activo == True).first():
            raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    elif data.laboratorio_id:
        assert_lab_write(data.laboratorio_id, current_user)
    if data.departamento_id and not db.query(Departamento).filter(Departamento.id == data.departamento_id).first():
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    if data.ubicacion_id and not db.query(UbicacionInventario).filter(UbicacionInventario.id == data.ubicacion_id, UbicacionInventario.activo == True).first():
        raise HTTPException(status_code=404, detail="Ubicacion no encontrada")
    if data.responsable_id and not db.query(Usuario).filter(Usuario.id == data.responsable_id, Usuario.activo == True).first():
        raise HTTPException(status_code=404, detail="Responsable no encontrado")

    # Auto-generar código si no se proporcionó
    area_codigo = data.area
    if not area_codigo and data.departamento_id:
        dep = db.query(Departamento).filter(Departamento.id == data.departamento_id).first()
        area_codigo = dep.clave if dep else None
    codigo = data.codigo_inventario or _generar_codigo(db, data.categoria, area_codigo)

    if db.query(Activo).filter(Activo.codigo_inventario == codigo).first():
        raise HTTPException(status_code=409, detail=f"Ya existe un activo con código '{codigo}'")

    payload = data.model_dump(exclude={"codigo_inventario"})
    payload["categoria"] = payload["categoria"].upper()
    payload["alcance"] = alcance
    payload["tipo_inventario"] = tipo_inventario
    payload["estado_admin"] = estado_admin
    payload["unidad_medida"] = unidad_medida
    # Patrimonial siempre: cantidad=1, PIEZA, sin stock mínimo (blindado también en schema)
    payload["cantidad"] = 1.0
    payload["unidad_medida"] = "PIEZA"
    payload["stock_minimo"] = None
    # Resguardante: si viene responsable_id, limpiar texto libre y viceversa
    if payload.get("responsable_id"):
        payload["resguardante_externo_nombre"] = None
    elif payload.get("resguardante_externo_nombre"):
        payload["responsable_id"] = None
    if payload.get("ubicacion_tipo"):
        payload["ubicacion_tipo"] = payload["ubicacion_tipo"].upper()
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
        if campos["categoria"] not in CATEGORIAS:
            raise HTTPException(status_code=422, detail=f"Categoria invalida. Use: {CATEGORIAS}")
    if "alcance" in campos:
        campos["alcance"] = campos["alcance"].upper()
        if campos["alcance"] not in ALCANCES_ACTIVO:
            raise HTTPException(status_code=422, detail=f"Alcance invalido. Use: {ALCANCES_ACTIVO}")
        if current_user.rol == RolUsuario.LAB_ADMIN and campos["alcance"] != "LABORATORIO":
            raise HTTPException(status_code=403, detail="Solo Super Admin puede convertir activos a institucionales")
    if "tipo_inventario" in campos:
        campos["tipo_inventario"] = campos["tipo_inventario"].upper()
        if campos["tipo_inventario"] not in TIPOS_INVENTARIO:
            raise HTTPException(status_code=422, detail=f"Tipo de inventario invalido. Use: {TIPOS_INVENTARIO}")
    if "estado_admin" in campos:
        campos["estado_admin"] = campos["estado_admin"].upper()
        if campos["estado_admin"] not in ESTADOS_ADMIN_ACTIVO:
            raise HTTPException(status_code=422, detail=f"Estado administrativo invalido. Use: {ESTADOS_ADMIN_ACTIVO}")
    if "unidad_medida" in campos:
        campos["unidad_medida"] = campos["unidad_medida"].upper()
        if campos["unidad_medida"] not in UNIDADES_MEDIDA:
            raise HTTPException(status_code=422, detail=f"Unidad de medida invalida. Use: {UNIDADES_MEDIDA}")
    destino_lab = campos.get("laboratorio_id", a.laboratorio_id)
    destino_alcance = campos.get("alcance", a.alcance or "LABORATORIO")
    if destino_alcance == "LABORATORIO":
        if not destino_lab:
            raise HTTPException(status_code=422, detail="laboratorio_id es requerido para activos de laboratorio")
        assert_lab_write(destino_lab, current_user)
        if not db.query(Laboratorio).filter(Laboratorio.id == destino_lab, Laboratorio.activo == True).first():
            raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    if "departamento_id" in campos and campos["departamento_id"] and not db.query(Departamento).filter(Departamento.id == campos["departamento_id"]).first():
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    if "ubicacion_id" in campos and campos["ubicacion_id"] and not db.query(UbicacionInventario).filter(UbicacionInventario.id == campos["ubicacion_id"], UbicacionInventario.activo == True).first():
        raise HTTPException(status_code=404, detail="Ubicacion no encontrada")
    if "responsable_id" in campos and campos["responsable_id"] and not db.query(Usuario).filter(Usuario.id == campos["responsable_id"], Usuario.activo == True).first():
        raise HTTPException(status_code=404, detail="Responsable no encontrado")
    if "ubicacion_tipo" in campos and campos["ubicacion_tipo"]:
        campos["ubicacion_tipo"] = campos["ubicacion_tipo"].upper()
    tipo_final = campos.get("tipo_inventario", a.tipo_inventario or "ACTIVO")
    if tipo_final == "ACTIVO":
        campos["cantidad"] = 1
        campos["stock_minimo"] = None
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

@router.get("/movimientos", summary="Listar movimientos de inventario")
def listar_movimientos(
    activo_id: Optional[int] = None,
    estado: Optional[str] = None,
    tipo: Optional[str] = None,
    departamento_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(MovimientoInventario).join(Activo, MovimientoInventario.activo_id == Activo.id)
    if current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(Activo.laboratorio_id == current_user.laboratorio_id)
    if activo_id:
        q = q.filter(MovimientoInventario.activo_id == activo_id)
    if estado:
        q = q.filter(MovimientoInventario.estado == estado.upper())
    if tipo:
        q = q.filter(MovimientoInventario.tipo == tipo.upper())
    if departamento_id:
        q = q.filter(
            (MovimientoInventario.departamento_origen_id == departamento_id) |
            (MovimientoInventario.departamento_destino_id == departamento_id)
        )
    movimientos = q.order_by(MovimientoInventario.fecha_solicitud.desc()).limit(250).all()
    return [_serializar_movimiento(m, db) for m in movimientos]


@router.post("/activos/{activo_id}/movimientos", status_code=status.HTTP_201_CREATED, summary="Solicitar movimiento de inventario")
def solicitar_movimiento(
    request: Request,
    activo_id: int,
    data: MovimientoInventarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    activo = db.query(Activo).filter(Activo.id == activo_id).first()
    assert_resource_access(activo, current_user)
    _validar_destinos_movimiento(data, db)
    tipo = data.tipo.upper()
    cantidad = data.cantidad or (1 if (activo.tipo_inventario or "ACTIVO") == "ACTIVO" else activo.cantidad or 1)

    if (activo.tipo_inventario or "ACTIVO") == "ACTIVO" and cantidad != 1:
        raise HTTPException(status_code=422, detail="Los activos individuales solo pueden moverse con cantidad 1")

    mov = MovimientoInventario(
        activo_id=activo.id,
        tipo=tipo,
        estado="SOLICITADO",
        departamento_origen_id=activo.departamento_id,
        departamento_destino_id=data.departamento_destino_id,
        ubicacion_origen_id=activo.ubicacion_id,
        ubicacion_destino_id=data.ubicacion_destino_id,
        resguardante_origen_id=activo.responsable_id,
        resguardante_destino_id=data.resguardante_destino_id,
        ubicacion_origen_nombre=activo.ubicacion_nombre,
        ubicacion_destino_nombre=data.ubicacion_destino_nombre.strip() if data.ubicacion_destino_nombre else None,
        resguardante_origen_nombre=activo.resguardante_externo_nombre,
        resguardante_destino_nombre=data.resguardante_destino_nombre.strip() if data.resguardante_destino_nombre else None,
        cantidad=cantidad,
        solicitado_por_id=current_user.id,
        fecha_solicitud=_utcnow(),
        observaciones=data.observaciones,
    )
    db.add(mov)
    db.commit()
    db.refresh(mov)
    registrar(db, accion=Accion.EDITAR_ACTIVO, recurso=Recurso.ACTIVO,
              usuario=current_user, recurso_id=activo.id,
              detalle={"movimiento_id": mov.id, "tipo": mov.tipo, "estado": mov.estado},
              request=request)
    return _serializar_movimiento(mov, db)


def _es_movimiento_institucional(mov: MovimientoInventario, activo: Activo) -> bool:
    """True si el movimiento cruza laboratorios, departamentos distintos o involucra activo institucional."""
    if activo.alcance == "INSTITUCIONAL":
        return True
    if mov.departamento_destino_id and mov.departamento_origen_id != mov.departamento_destino_id:
        return True
    return False


@router.post("/movimientos/{movimiento_id}/{accion}", summary="Actualizar estado de movimiento")
def actualizar_movimiento(
    request: Request,
    movimiento_id: int,
    accion: str,
    data: MovimientoInventarioEstado = MovimientoInventarioEstado(),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    mov = db.query(MovimientoInventario).filter(MovimientoInventario.id == movimiento_id).first()
    if not mov:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    activo = db.query(Activo).filter(Activo.id == mov.activo_id).first()
    assert_resource_access(activo, current_user)
    accion = accion.lower()
    ahora = _utcnow()
    es_institucional = _es_movimiento_institucional(mov, activo)

    if accion == "autorizar":
        if mov.estado != "SOLICITADO":
            raise HTTPException(status_code=409, detail="Solo se pueden autorizar movimientos solicitados")
        # Movimientos institucionales/inter-departamentales solo los autoriza SUPER_ADMIN
        if es_institucional and current_user.rol != RolUsuario.SUPER_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Los movimientos institucionales o entre departamentos requieren autorización de administración central"
            )
        mov.estado = "AUTORIZADO"
        mov.autorizado_por_id = current_user.id
        mov.fecha_autorizacion = ahora
    elif accion == "rechazar":
        if mov.estado not in ("SOLICITADO", "AUTORIZADO"):
            raise HTTPException(status_code=409, detail="El movimiento ya no puede rechazarse")
        if es_institucional and current_user.rol != RolUsuario.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Solo administración central puede rechazar movimientos institucionales")
        mov.estado = "RECHAZADO"
        mov.autorizado_por_id = current_user.id
        mov.fecha_autorizacion = ahora
    elif accion == "entregar":
        if mov.estado != "AUTORIZADO":
            raise HTTPException(status_code=409, detail="Solo se pueden entregar movimientos autorizados")
        # Entrega: el LAB_ADMIN del laboratorio de origen o SUPER_ADMIN
        if current_user.rol == RolUsuario.LAB_ADMIN:
            lab_origen = activo.laboratorio_id
            if lab_origen and current_user.laboratorio_id != lab_origen:
                raise HTTPException(status_code=403, detail="Solo el responsable del laboratorio de origen puede registrar la entrega")
        mov.estado = "ENTREGADO"
        mov.entregado_por_id = current_user.id
        mov.fecha_entrega = ahora
    elif accion == "recibir":
        if mov.estado not in ("AUTORIZADO", "ENTREGADO"):
            raise HTTPException(status_code=409, detail="Solo se pueden recibir movimientos autorizados o entregados")
        _aplicar_movimiento_recibido(activo, mov)
        mov.estado = "RECIBIDO"
        mov.recibido_por_id = current_user.id
        mov.fecha_recepcion = ahora
    elif accion == "cancelar":
        if mov.estado in ("RECIBIDO", "RECHAZADO"):
            raise HTTPException(status_code=409, detail="El movimiento ya no puede cancelarse")
        mov.estado = "CANCELADO"
    else:
        raise HTTPException(status_code=422, detail="Accion invalida. Use: autorizar, rechazar, entregar, recibir o cancelar")

    if data.observaciones:
        mov.observaciones = ((mov.observaciones or "") + "\n" + data.observaciones).strip()
    db.commit()
    db.refresh(mov)
    registrar(db, accion=Accion.EDITAR_ACTIVO, recurso=Recurso.ACTIVO,
              usuario=current_user, recurso_id=activo.id,
              detalle={"movimiento_id": mov.id, "accion": accion, "estado": mov.estado},
              request=request)
    return _serializar_movimiento(mov, db)


@router.get("/bajas", summary="Listar solicitudes de baja patrimonial")
def listar_bajas(
    estado: Optional[str] = None,
    activo_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(SolicitudBajaInventario).join(Activo, SolicitudBajaInventario.activo_id == Activo.id)
    if current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(Activo.laboratorio_id == current_user.laboratorio_id)
    if estado:
        q = q.filter(SolicitudBajaInventario.estado == estado.upper())
    if activo_id:
        q = q.filter(SolicitudBajaInventario.activo_id == activo_id)
    bajas = q.order_by(SolicitudBajaInventario.fecha_solicitud.desc()).limit(250).all()
    return [_serializar_solicitud_baja(b, db) for b in bajas]


@router.post("/activos/{activo_id}/baja", status_code=status.HTTP_201_CREATED, summary="Solicitar baja patrimonial")
def solicitar_baja(
    request: Request,
    activo_id: int,
    data: SolicitudBajaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    activo = db.query(Activo).filter(Activo.id == activo_id).first()
    assert_resource_access(activo, current_user)
    abierta = db.query(SolicitudBajaInventario).filter(
        SolicitudBajaInventario.activo_id == activo_id,
        SolicitudBajaInventario.estado.in_(["SOLICITADA", "EN_REVISION", "VALIDADA_FISICAMENTE", "AUTORIZADA"]),
    ).first()
    if abierta:
        raise HTTPException(status_code=409, detail="El activo ya tiene una solicitud de baja abierta")
    baja = SolicitudBajaInventario(
        activo_id=activo.id,
        estado="SOLICITADA",
        motivo=data.motivo,
        diagnostico=data.diagnostico,
        evidencia_url=data.evidencia_url,
        destino_final=data.destino_final,
        observaciones=data.observaciones,
        solicitado_por_id=current_user.id,
        fecha_solicitud=_utcnow(),
    )
    activo.estado_admin = "BAJA_SOLICITADA"
    db.add(baja)
    db.commit()
    db.refresh(baja)
    registrar(db, accion=Accion.EDITAR_ACTIVO, recurso=Recurso.ACTIVO,
              usuario=current_user, recurso_id=activo.id,
              detalle={"solicitud_baja_id": baja.id, "estado": baja.estado},
              request=request)
    return _serializar_solicitud_baja(baja, db)


@router.post("/bajas/{baja_id}/{accion}", summary="Actualizar tramite de baja patrimonial")
def actualizar_baja(
    request: Request,
    baja_id: int,
    accion: str,
    data: SolicitudBajaAccion = SolicitudBajaAccion(),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    baja = db.query(SolicitudBajaInventario).filter(SolicitudBajaInventario.id == baja_id).first()
    if not baja:
        raise HTTPException(status_code=404, detail="Solicitud de baja no encontrada")
    activo = db.query(Activo).filter(Activo.id == baja.activo_id).first()
    assert_resource_access(activo, current_user)
    accion = accion.lower()
    ahora = _utcnow()

    if accion == "revisar":
        if baja.estado != "SOLICITADA":
            raise HTTPException(status_code=409, detail="Solo se pueden revisar bajas solicitadas")
        baja.estado = "EN_REVISION"
        baja.revisado_por_id = current_user.id
        baja.fecha_revision = ahora
    elif accion == "validar":
        if baja.estado not in ("SOLICITADA", "EN_REVISION"):
            raise HTTPException(status_code=409, detail="La baja no esta lista para validacion fisica")
        baja.estado = "VALIDADA_FISICAMENTE"
        baja.validado_por_id = current_user.id
        baja.fecha_validacion = ahora
    elif accion == "autorizar":
        if baja.estado != "VALIDADA_FISICAMENTE":
            raise HTTPException(status_code=409, detail="La baja requiere validacion fisica previa")
        # Solo SUPER_ADMIN puede autorizar bajas patrimoniales
        if current_user.rol != RolUsuario.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Solo administracion central puede autorizar bajas patrimoniales")
        baja.estado = "AUTORIZADA"
        baja.autorizado_por_id = current_user.id   # campo correcto — no revisado_por_id
        baja.fecha_autorizacion = ahora
    elif accion == "rechazar":
        if baja.estado in ("EJECUTADA", "CANCELADA"):
            raise HTTPException(status_code=409, detail="La baja ya no puede rechazarse")
        baja.estado = "RECHAZADA"
        activo.estado_admin = "OBSERVADO"
    elif accion == "ejecutar":
        if baja.estado != "AUTORIZADA":
            raise HTTPException(status_code=409, detail="Solo se pueden ejecutar bajas autorizadas")
        baja.estado = "EJECUTADA"
        baja.ejecutado_por_id = current_user.id
        baja.fecha_ejecucion = ahora
        activo.estado_admin = "BAJA_EJECUTADA"
        activo.estado = "BAJA"
        activo.activo = False
    elif accion == "cancelar":
        if baja.estado == "EJECUTADA":
            raise HTTPException(status_code=409, detail="Una baja ejecutada no puede cancelarse")
        baja.estado = "CANCELADA"
        activo.estado_admin = "VALIDADO"
    else:
        raise HTTPException(status_code=422, detail="Accion invalida. Use: revisar, validar, autorizar, rechazar, ejecutar o cancelar")

    if data.destino_final:
        baja.destino_final = data.destino_final
    if data.observaciones:
        baja.observaciones = ((baja.observaciones or "") + "\n" + data.observaciones).strip()
    db.commit()
    db.refresh(baja)
    registrar(db, accion=Accion.EDITAR_ACTIVO, recurso=Recurso.ACTIVO,
              usuario=current_user, recurso_id=activo.id,
              detalle={"solicitud_baja_id": baja.id, "accion": accion, "estado": baja.estado},
              request=request)
    return _serializar_solicitud_baja(baja, db)


@router.get("/levantamientos", summary="Listar levantamientos fisicos")
def listar_levantamientos(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    q = db.query(LevantamientoInventario)
    if current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(LevantamientoInventario.laboratorio_id == current_user.laboratorio_id)
    if estado:
        q = q.filter(LevantamientoInventario.estado == estado.upper())
    return [_serializar_levantamiento(l, db) for l in q.order_by(LevantamientoInventario.fecha_inicio.desc()).all()]


@router.post("/levantamientos", status_code=status.HTTP_201_CREATED, summary="Crear campana de levantamiento fisico")
def crear_levantamiento(
    data: LevantamientoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    if data.departamento_id and not db.query(Departamento).filter(Departamento.id == data.departamento_id).first():
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    lab_id = data.laboratorio_id
    if lab_id:
        assert_lab_write(lab_id, current_user)
        if not db.query(Laboratorio).filter(Laboratorio.id == lab_id, Laboratorio.activo == True).first():
            raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    elif current_user.rol == RolUsuario.LAB_ADMIN:
        lab_id = current_user.laboratorio_id
    l = LevantamientoInventario(
        nombre=data.nombre,
        departamento_id=data.departamento_id,
        laboratorio_id=lab_id,
        observaciones=data.observaciones,
        creado_por_id=current_user.id,
        fecha_inicio=_utcnow(),
    )
    db.add(l)
    db.commit()
    db.refresh(l)
    return _serializar_levantamiento(l, db)


@router.post("/levantamientos/{levantamiento_id}/revisiones", status_code=status.HTTP_201_CREATED, summary="Registrar revision fisica de un bien")
def registrar_revision_levantamiento(
    levantamiento_id: int,
    data: RevisionLevantamientoIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    l = db.query(LevantamientoInventario).filter(LevantamientoInventario.id == levantamiento_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Levantamiento no encontrado")
    if l.estado != "ABIERTO":
        raise HTTPException(status_code=409, detail="El levantamiento no esta abierto")
    activo = db.query(Activo).filter(Activo.id == data.activo_id).first()
    assert_resource_access(activo, current_user)
    estado = data.estado.upper()
    if estado not in ESTADOS_REVISION_LEVANTAMIENTO:
        raise HTTPException(status_code=422, detail=f"Estado de revision invalido. Use: {ESTADOS_REVISION_LEVANTAMIENTO}")
    revision = db.query(RevisionLevantamientoInventario).filter(
        RevisionLevantamientoInventario.levantamiento_id == levantamiento_id,
        RevisionLevantamientoInventario.activo_id == data.activo_id,
    ).first()
    if not revision:
        revision = RevisionLevantamientoInventario(
            levantamiento_id=levantamiento_id,
            activo_id=data.activo_id,
            revisado_por_id=current_user.id,
        )
        db.add(revision)
    revision.estado = estado
    revision.ubicacion_reportada = data.ubicacion_reportada
    revision.resguardante_reportado = data.resguardante_reportado
    revision.observaciones = data.observaciones
    revision.evidencia_url = data.evidencia_url
    revision.fecha_revision = _utcnow()
    if estado == "NO_LOCALIZADO":
        activo.estado_admin = "OBSERVADO"
    elif estado == "PROPUESTO_BAJA":
        activo.estado_admin = "BAJA_SOLICITADA"
    db.commit()
    db.refresh(revision)
    return _serializar_revision(revision, db)


@router.post("/levantamientos/{levantamiento_id}/cerrar", summary="Cerrar levantamiento fisico")
def cerrar_levantamiento(
    levantamiento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    l = db.query(LevantamientoInventario).filter(LevantamientoInventario.id == levantamiento_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Levantamiento no encontrado")
    if current_user.rol == RolUsuario.LAB_ADMIN and l.laboratorio_id != current_user.laboratorio_id:
        raise HTTPException(status_code=403, detail="No puedes cerrar levantamientos de otro laboratorio")
    l.estado = "CERRADO"
    l.fecha_cierre = _utcnow()
    db.commit()
    db.refresh(l)
    return _serializar_levantamiento(l, db)


@router.get("/activos/{activo_id}/expediente", summary="Expediente digital del bien")
def expediente_activo(
    activo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    activo = db.query(Activo).filter(Activo.id == activo_id).first()
    assert_resource_access(activo, current_user)
    movimientos = db.query(MovimientoInventario).filter(MovimientoInventario.activo_id == activo_id).order_by(MovimientoInventario.fecha_solicitud.desc()).all()
    bajas = db.query(SolicitudBajaInventario).filter(SolicitudBajaInventario.activo_id == activo_id).order_by(SolicitudBajaInventario.fecha_solicitud.desc()).all()
    revisiones = db.query(RevisionLevantamientoInventario).filter(RevisionLevantamientoInventario.activo_id == activo_id).order_by(RevisionLevantamientoInventario.fecha_revision.desc()).all()
    prestamos = db.query(Prestamo).filter(Prestamo.activo_id == activo_id).order_by(Prestamo.fecha_salida.desc()).all()
    incidentes = db.query(Incidente).filter(Incidente.activo_id == activo_id).order_by(Incidente.fecha_reporte.desc()).all()
    return {
        "activo": _serializar_activo(activo, db),
        "movimientos": [_serializar_movimiento(m, db) for m in movimientos],
        "bajas": [_serializar_solicitud_baja(b, db) for b in bajas],
        "levantamientos": [_serializar_revision(r, db) for r in revisiones],
        "prestamos": [_serializar_prestamo(p, db) for p in prestamos],
        "incidentes": [_serializar_incidente(i, db) for i in incidentes],
    }


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

    # Validar: debe referenciar al menos un activo o una computadora
    if not data.activo_id and not data.computadora_id:
        raise HTTPException(
            status_code=422,
            detail="El incidente debe referenciar un activo de inventario (activo_id) o una computadora de laboratorio (computadora_id)"
        )

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
    return {
        "categorias": CATEGORIAS,
        "estados": ESTADOS_ACTIVO,
        "condiciones": CONDICIONES,
        "alcances": ALCANCES_ACTIVO,
        "tipos_inventario": TIPOS_INVENTARIO,
        "estados_admin": ESTADOS_ADMIN_ACTIVO,
        "tipos_ubicacion": TIPOS_UBICACION,
        "tipos_movimiento": TIPOS_MOVIMIENTO,
        "estados_movimiento": ESTADOS_MOVIMIENTO,
        "estados_baja": ESTADOS_BAJA,
        "estados_levantamiento": ESTADOS_LEVANTAMIENTO,
        "estados_revision_levantamiento": ESTADOS_REVISION_LEVANTAMIENTO,
    }


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
    departamento_id: Optional[int] = None,
    ubicacion_id: Optional[int] = None,
    alcance: Optional[str] = None,
    tipo_inventario: Optional[str] = None,
    estado_admin: Optional[str] = None,
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
    if departamento_id:
        q_a = q_a.filter(Activo.departamento_id == departamento_id)
    if ubicacion_id:
        q_a = q_a.filter(Activo.ubicacion_id == ubicacion_id)
    if alcance:
        q_a = q_a.filter(Activo.alcance == alcance.upper())
    if tipo_inventario:
        q_a = q_a.filter(Activo.tipo_inventario == tipo_inventario.upper())
    if estado_admin:
        q_a = q_a.filter(Activo.estado_admin == estado_admin.upper())

    activos = q_a.all()
    ids = [a.id for a in activos]
    prestamos = db.query(Prestamo).filter(Prestamo.activo_id.in_(ids)).all() if ids else []
    bajas = db.query(SolicitudBajaInventario).filter(SolicitudBajaInventario.activo_id.in_(ids)).all() if ids else []
    revisiones = db.query(RevisionLevantamientoInventario).filter(RevisionLevantamientoInventario.activo_id.in_(ids)).all() if ids else []

    por_categoria = {}
    por_departamento = {}
    for a in activos:
        por_categoria[a.categoria] = por_categoria.get(a.categoria, 0) + 1
        key = a.departamento_id or 0
        por_departamento[key] = por_departamento.get(key, 0) + 1

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
        "institucionales": sum(1 for a in activos if (a.alcance or "").upper() == "INSTITUCIONAL"),
        "de_laboratorio": sum(1 for a in activos if (a.alcance or "LABORATORIO").upper() == "LABORATORIO"),
        "activos_individuales": sum(1 for a in activos if (a.tipo_inventario or "ACTIVO").upper() == "ACTIVO"),
        "bajas_pendientes": sum(1 for b in bajas if b.estado in ("SOLICITADA", "EN_REVISION", "VALIDADA_FISICAMENTE", "AUTORIZADA")),
        "bajas_ejecutadas": sum(1 for b in bajas if b.estado == "EJECUTADA"),
        "no_localizados": sum(1 for r in revisiones if r.estado == "NO_LOCALIZADO"),
        "propuestos_baja": sum(1 for r in revisiones if r.estado == "PROPUESTO_BAJA"),
        "por_departamento": por_departamento,
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
            resguardante_externo_nombre = resguardo,
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
            "resguardante_externo_nombre": activo.resguardante_externo_nombre,
            "responsable_nombre": activo.responsable.nombre if activo.responsable else None,
            "laboratorio_id": activo.laboratorio_id,
        },
        "total_eventos": len(eventos),
        "eventos": eventos,
    }
