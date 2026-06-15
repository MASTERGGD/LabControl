from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
import re
import datetime
from database import get_db
from sqlalchemy.exc import IntegrityError
from models.laboratorio import Laboratorio, Computadora, HistorialAsignacionActivoPC
from models.inventario import Activo
from models.usuario import Usuario, RolUsuario
from dependencies import get_current_user, require_roles
from services.auditoria import registrar, Accion, Recurso
from ws.mapa import manager

router = APIRouter(prefix="/laboratorios", tags=["Laboratorios"])


# ─── Schemas ───────────────────────────────────────────────────────────────────

class LaboratorioCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    categoria: Optional[str] = Field(None, max_length=80)
    ubicacion: Optional[str] = None
    capacidad: int = Field(default=25, ge=1, le=200)

class LaboratorioUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=100)
    categoria: Optional[str] = Field(None, max_length=80)
    ubicacion: Optional[str] = None
    capacidad: Optional[int] = Field(None, ge=1, le=200)
    activo: Optional[bool] = None

class LaboratorioResponse(BaseModel):
    id: int
    nombre: str
    categoria: Optional[str]
    ubicacion: Optional[str]
    capacidad: int
    activo: bool
    total_computadoras: int = 0
    computadoras_activas: int = 0

    model_config = ConfigDict(from_attributes=True)

class ComputadoraCreate(BaseModel):
    activo_id: Optional[int] = None
    motivo_asignacion: Optional[str] = Field(None, max_length=250)
    numero: int = Field(..., ge=1)
    codigo: str = Field(..., min_length=1, max_length=20)
    fila: Optional[str] = None
    specs: Optional[str] = None
    estado: str = "OPERATIVO"

class ComputadoraUpdate(BaseModel):
    activo_id: Optional[int] = None
    motivo_asignacion: Optional[str] = Field(None, max_length=250)
    numero: Optional[int] = Field(None, ge=1)
    codigo: Optional[str] = Field(None, min_length=1, max_length=20)
    fila: Optional[str] = None
    specs: Optional[str] = None
    estado: Optional[str] = None
    activa: Optional[bool] = None

class ComputadoraResponse(BaseModel):
    id: int
    laboratorio_id: int
    activo_id: Optional[int]
    numero: int
    codigo: str
    fila: Optional[str]
    specs: Optional[str]
    estado: str
    activa: bool

    model_config = ConfigDict(from_attributes=True)

class BulkComputadorasCreate(BaseModel):
    cantidad: int = Field(..., ge=1, le=100, description="Cantidad de PCs a generar")
    prefijo_codigo: str = Field(..., min_length=1, max_length=10, description="Ej: PC, LAB1-")
    filas: Optional[int] = Field(None, ge=1, description="Número de filas para organización")
    specs: Optional[str] = None


# ─── Helper ────────────────────────────────────────────────────────────────────

def _enriquecer_lab(lab: Laboratorio) -> dict:
    pcs = lab.computadoras
    return {
        "id": lab.id,
        "nombre": lab.nombre,
        "categoria": lab.categoria,
        "ubicacion": lab.ubicacion,
        "capacidad": lab.capacidad,
        "activo": lab.activo,
        "total_computadoras": len(pcs),
        "computadoras_activas": sum(1 for pc in pcs if pc.activa),
    }

def _get_lab_autorizado(lab_id: int, db: Session, user: Usuario) -> Laboratorio:
    """Obtiene el laboratorio y verifica que el usuario tenga acceso."""
    lab = db.query(Laboratorio).filter(Laboratorio.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    if user.rol in (RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB) and user.laboratorio_id != lab_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este laboratorio")
    return lab


def _normalizar_codigo_pc(codigo: str) -> str:
    return re.sub(r"-+", "-", codigo.strip().upper())


def _serializar_pc(pc: Computadora) -> dict:
    activo = pc.activo
    return {
        "id": pc.id,
        "laboratorio_id": pc.laboratorio_id,
        "activo_id": pc.activo_id,
        "numero": pc.numero,
        "codigo": pc.codigo,
        "fila": pc.fila,
        "specs": pc.specs,
        "estado": pc.estado,
        "activa": pc.activa,
        "activo": {
            "id": activo.id,
            "codigo_inventario": activo.codigo_inventario,
            "numero_oficial": activo.numero_oficial,
            "nombre": activo.nombre,
            "marca": activo.marca,
            "modelo": activo.modelo,
            "numero_serie": activo.numero_serie,
            "estado": activo.estado,
            "estado_admin": activo.estado_admin,
            "especificaciones": activo.especificaciones,
        } if activo else None,
    }


def _validar_activo_para_pc(
    db: Session,
    lab_id: int,
    activo_id: Optional[int],
    pc_id: Optional[int] = None,
) -> Optional[Activo]:
    if activo_id is None:
        return None
    activo = db.query(Activo).filter(Activo.id == activo_id, Activo.activo == True).first()
    if not activo:
        raise HTTPException(status_code=404, detail="Activo de inventario no encontrado")
    if (activo.categoria or "").upper() != "COMPUTADORA":
        raise HTTPException(status_code=422, detail="Solo se puede vincular un activo de categoría Computadora")
    if activo.laboratorio_id != lab_id:
        raise HTTPException(status_code=422, detail="El activo debe pertenecer al mismo laboratorio")
    if (activo.estado_admin or "VALIDADO").upper() != "VALIDADO":
        raise HTTPException(status_code=409, detail="El activo debe estar validado antes de vincularlo")
    vinculada = db.query(Computadora).filter(Computadora.activo_id == activo_id)
    if pc_id is not None:
        vinculada = vinculada.filter(Computadora.id != pc_id)
    if vinculada.first():
        raise HTTPException(status_code=409, detail="Este activo ya está vinculado con otra PC")
    return activo


def _actualizar_vinculo_activo(
    db: Session,
    pc: Computadora,
    nuevo_activo_id: Optional[int],
    usuario: Usuario,
    motivo: Optional[str],
) -> None:
    if pc.activo_id == nuevo_activo_id:
        return

    ahora = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    if pc.activo_id:
        vigente = db.query(HistorialAsignacionActivoPC).filter(
            HistorialAsignacionActivoPC.computadora_id == pc.id,
            HistorialAsignacionActivoPC.activo_id == pc.activo_id,
            HistorialAsignacionActivoPC.fecha_fin.is_(None),
        ).order_by(HistorialAsignacionActivoPC.fecha_inicio.desc()).first()
        if vigente:
            vigente.fecha_fin = ahora

    pc.activo_id = nuevo_activo_id
    if nuevo_activo_id:
        db.add(HistorialAsignacionActivoPC(
            computadora_id=pc.id,
            activo_id=nuevo_activo_id,
            asignado_por_id=usuario.id,
            fecha_inicio=ahora,
            motivo=motivo or "Asignación de equipo físico al puesto operativo",
        ))


def _buscar_duplicado_pc(
    db: Session,
    lab_id: int,
    numero: int,
    codigo: str,
    excluir_id: Optional[int] = None,
) -> tuple[Optional[Computadora], Optional[str]]:
    query = db.query(Computadora).filter(Computadora.laboratorio_id == lab_id)
    if excluir_id is not None:
        query = query.filter(Computadora.id != excluir_id)

    codigo_normalizado = _normalizar_codigo_pc(codigo)
    for existente in query.all():
        if existente.numero == numero:
            return existente, "numero"
        if _normalizar_codigo_pc(existente.codigo) == codigo_normalizado:
            return existente, "codigo"
    return None, None


# ─── Laboratorios ──────────────────────────────────────────────────────────────

@router.get("", summary="Listar laboratorios")
def listar_laboratorios(
    solo_activos: bool = True,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """SUPER_ADMIN ve todos; administradores y responsables solo el asignado."""
    query = db.query(Laboratorio)
    if solo_activos:
        query = query.filter(Laboratorio.activo == True)
    if current_user.rol in (RolUsuario.LAB_ADMIN, RolUsuario.RESPONSABLE_LAB):
        query = query.filter(Laboratorio.id == current_user.laboratorio_id)
    labs = query.order_by(Laboratorio.nombre).all()
    return [_enriquecer_lab(lab) for lab in labs]


@router.post("", status_code=status.HTTP_201_CREATED, summary="Crear laboratorio")
def crear_laboratorio(
    data: LaboratorioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN))
):
    existente = db.query(Laboratorio).filter(Laboratorio.nombre == data.nombre).first()
    if existente:
        raise HTTPException(status_code=409, detail="Ya existe un laboratorio con ese nombre")

    lab = Laboratorio(**data.model_dump())
    db.add(lab)
    db.commit()
    db.refresh(lab)
    return _enriquecer_lab(lab)


@router.get("/{lab_id}", summary="Detalle de laboratorio")
def obtener_laboratorio(
    lab_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    lab = _get_lab_autorizado(lab_id, db, current_user)
    return _enriquecer_lab(lab)


@router.put("/{lab_id}", summary="Editar laboratorio")
def editar_laboratorio(
    lab_id: int,
    data: LaboratorioUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN))
):
    lab = db.query(Laboratorio).filter(Laboratorio.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")

    for campo, valor in data.model_dump(exclude_none=True).items():
        setattr(lab, campo, valor)

    db.commit()
    db.refresh(lab)
    return _enriquecer_lab(lab)


@router.delete("/{lab_id}", summary="Desactivar laboratorio")
def desactivar_laboratorio(
    lab_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN))
):
    lab = db.query(Laboratorio).filter(Laboratorio.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    lab.activo = False
    db.commit()
    return {"mensaje": f"Laboratorio '{lab.nombre}' desactivado"}


# ─── Computadoras ──────────────────────────────────────────────────────────────

@router.get("/{lab_id}/computadoras", summary="Listar computadoras del lab")
def listar_computadoras(
    lab_id: int,
    solo_activas: bool = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    _get_lab_autorizado(lab_id, db, current_user)
    query = db.query(Computadora).filter(Computadora.laboratorio_id == lab_id)
    if solo_activas:
        query = query.filter(Computadora.activa == True)
    pcs = query.order_by(Computadora.numero).all()
    return [_serializar_pc(pc) for pc in pcs]


@router.post("/{lab_id}/computadoras", status_code=status.HTTP_201_CREATED, summary="Agregar computadora")
def agregar_computadora(
    lab_id: int,
    data: ComputadoraCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(
        RolUsuario.SUPER_ADMIN,
        RolUsuario.LAB_ADMIN,
        RolUsuario.RESPONSABLE_LAB,
    ))
):
    # Administradores y responsables solo pueden operar su laboratorio asignado.
    lab = _get_lab_autorizado(lab_id, db, current_user)

    codigo = _normalizar_codigo_pc(data.codigo)
    duplicado, campo_duplicado = _buscar_duplicado_pc(
        db, lab_id, data.numero, codigo
    )
    if duplicado:
        valor = data.numero if campo_duplicado == "numero" else codigo
        etiqueta = "número" if campo_duplicado == "numero" else "código"
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una PC con {etiqueta} '{valor}' en este laboratorio",
        )

    _validar_activo_para_pc(db, lab_id, data.activo_id)
    payload = data.model_dump(exclude={"activo_id", "motivo_asignacion"})
    pc = Computadora(
        laboratorio_id=lab_id,
        **{**payload, "codigo": codigo},
    )
    db.add(pc)
    try:
        db.flush()
        _actualizar_vinculo_activo(
            db,
            pc,
            data.activo_id,
            current_user,
            data.motivo_asignacion,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe una PC con ese número o código en este laboratorio",
        )
    db.refresh(pc)
    registrar(
        db,
        accion=Accion.AGREGAR_PC,
        recurso=Recurso.COMPUTADORA,
        usuario=current_user,
        recurso_id=pc.id,
        detalle={
            "laboratorio_id": lab.id,
            "codigo": pc.codigo,
            "numero": pc.numero,
        },
        request=request,
    )
    db.refresh(pc)
    return _serializar_pc(pc)


@router.put("/{lab_id}/computadoras/{pc_id}", summary="Editar computadora")
async def editar_computadora(
    lab_id: int,
    pc_id: int,
    data: ComputadoraUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(
        RolUsuario.SUPER_ADMIN,
        RolUsuario.LAB_ADMIN,
        RolUsuario.RESPONSABLE_LAB,
    ))
):
    # Administradores y responsables solo pueden operar su laboratorio asignado.
    _get_lab_autorizado(lab_id, db, current_user)
    pc = db.query(Computadora).filter(
        Computadora.id == pc_id,
        Computadora.laboratorio_id == lab_id
    ).first()
    if not pc:
        raise HTTPException(status_code=404, detail="Computadora no encontrada en este laboratorio")

    cambios = data.model_dump(exclude_none=True, exclude={"activo_id", "motivo_asignacion"})
    numero_final = cambios.get("numero", pc.numero)
    codigo_final = _normalizar_codigo_pc(cambios.get("codigo", pc.codigo))
    duplicado, campo_duplicado = _buscar_duplicado_pc(
        db,
        lab_id,
        numero_final,
        codigo_final,
        excluir_id=pc.id,
    )
    if duplicado:
        valor = numero_final if campo_duplicado == "numero" else codigo_final
        etiqueta = "número" if campo_duplicado == "numero" else "código"
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una PC con {etiqueta} '{valor}' en este laboratorio",
        )
    if "codigo" in cambios:
        cambios["codigo"] = codigo_final

    cambiar_activo = "activo_id" in data.model_fields_set
    nuevo_activo_id = data.activo_id if cambiar_activo else pc.activo_id
    if cambiar_activo:
        _validar_activo_para_pc(db, lab_id, nuevo_activo_id, pc.id)

    for campo, valor in cambios.items():
        setattr(pc, campo, valor)
    if cambiar_activo:
        _actualizar_vinculo_activo(
            db,
            pc,
            nuevo_activo_id,
            current_user,
            data.motivo_asignacion,
        )
    if "estado" in cambios and pc.activo:
        pc.activo.estado = cambios["estado"]

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe una PC con ese número o código en este laboratorio",
        )
    db.refresh(pc)
    registrar(
        db,
        accion=Accion.EDITAR_PC,
        recurso=Recurso.COMPUTADORA,
        usuario=current_user,
        recurso_id=pc.id,
        detalle={
            "laboratorio_id": lab_id,
            "codigo": pc.codigo,
            "cambios": cambios,
        },
        request=request,
    )
    db.refresh(pc)

    # Calcular el estado WebSocket correcto:
    # durante una sesión activa, las PCs libres deben verse como EN_CLASE (verde), no OPERATIVO (gris)
    from models.sesion import SesionClase
    BLOQUEADOS = {"MANTENIMIENTO", "DAÑADO", "BAJA"}
    sesion_activa = db.query(SesionClase).filter(
        SesionClase.laboratorio_id == lab_id,
        SesionClase.estado == "ABIERTA",
    ).first()

    if pc.estado in BLOQUEADOS:
        estado_ws = pc.estado
        bloqueada = True
    elif sesion_activa:
        estado_ws = "EN_CLASE"   # libre dentro de sesión → verde
        bloqueada = False
    else:
        estado_ws = pc.estado
        bloqueada = False

    # Broadcast WebSocket para que la sesión activa del docente se actualice en tiempo real
    await manager.broadcast(lab_id, {
        "tipo": "pc_actualizada",
        "pc": {
            "pc_id":    pc.id,
            "codigo":   pc.codigo,
            "fila":     pc.fila,
            "estado":   estado_ws,
            "alumno":   None,
            "sesion_id": sesion_activa.id if sesion_activa else None,
            "bloqueada": bloqueada,
        }
    })

    return _serializar_pc(pc)


@router.get("/{lab_id}/computadoras/{pc_id}/historial-activos", summary="Historial patrimonial de la PC")
def historial_activos_computadora(
    lab_id: int,
    pc_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _get_lab_autorizado(lab_id, db, current_user)
    pc = db.query(Computadora).filter(
        Computadora.id == pc_id,
        Computadora.laboratorio_id == lab_id,
    ).first()
    if not pc:
        raise HTTPException(status_code=404, detail="Computadora no encontrada en este laboratorio")

    historial = db.query(HistorialAsignacionActivoPC).filter(
        HistorialAsignacionActivoPC.computadora_id == pc.id,
    ).order_by(HistorialAsignacionActivoPC.fecha_inicio.desc()).all()
    return [{
        "id": item.id,
        "activo_id": item.activo_id,
        "codigo_inventario": item.activo.codigo_inventario if item.activo else None,
        "numero_oficial": item.activo.numero_oficial if item.activo else None,
        "nombre": item.activo.nombre if item.activo else None,
        "marca": item.activo.marca if item.activo else None,
        "modelo": item.activo.modelo if item.activo else None,
        "numero_serie": item.activo.numero_serie if item.activo else None,
        "fecha_inicio": item.fecha_inicio.isoformat() if item.fecha_inicio else None,
        "fecha_fin": item.fecha_fin.isoformat() if item.fecha_fin else None,
        "motivo": item.motivo,
        "asignado_por": item.asignado_por.nombre if item.asignado_por else None,
    } for item in historial]


@router.post("/{lab_id}/computadoras/bulk", status_code=status.HTTP_201_CREATED, summary="Carga masiva de PCs")
def bulk_computadoras(
    lab_id: int,
    data: BulkComputadorasCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    """
    Genera N computadoras numeradas automáticamente.
    Ejemplo: prefijo_codigo='PC', cantidad=25 → PC-01, PC-02, ..., PC-25
    Si se especifican filas, asigna fila A, B, C... automáticamente.
    """
    # Validar que el LAB_ADMIN solo pueda hacer bulk en su propio laboratorio
    lab = _get_lab_autorizado(lab_id, db, current_user)

    ultima = db.query(Computadora).filter(
        Computadora.laboratorio_id == lab_id
    ).order_by(Computadora.numero.desc()).first()
    inicio = (ultima.numero + 1) if ultima else 1

    filas = data.filas if data.filas and data.filas > 0 else 1
    pcs_por_fila = -(-data.cantidad // filas)  # ceil division
    nuevas = []
    for i in range(data.cantidad):
        numero   = inicio + i
        fila_idx = i // pcs_por_fila
        fila     = chr(ord('A') + fila_idx) if filas > 1 else 'A'
        codigo   = f"{data.prefijo_codigo.rstrip('-').rstrip()}-{numero:02d}"
        pc = Computadora(
            laboratorio_id = lab_id,
            numero  = numero,
            codigo  = codigo,
            fila    = fila,
            specs   = data.specs,
            estado  = "OPERATIVO",
            activa  = True,
        )
        db.add(pc)
        nuevas.append(pc)
    db.commit()
    for pc in nuevas:
        db.refresh(pc)
    registrar(
        db,
        accion=Accion.CARGA_MASIVA_PC,
        recurso=Recurso.LABORATORIO,
        usuario=current_user,
        recurso_id=lab.id,
        detalle={
            "cantidad": len(nuevas),
            "prefijo_codigo": data.prefijo_codigo,
        },
        request=request,
    )
    for pc in nuevas:
        db.refresh(pc)
    return [_serializar_pc(pc) for pc in nuevas]
