from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from database import get_db
from models.laboratorio import Laboratorio, Computadora
from models.usuario import Usuario, RolUsuario
from dependencies import get_current_user, require_roles
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
    numero: int = Field(..., ge=1)
    codigo: str = Field(..., min_length=1, max_length=20)
    fila: Optional[str] = None
    specs: Optional[str] = None
    estado: str = "OPERATIVO"

class ComputadoraUpdate(BaseModel):
    numero: Optional[int] = Field(None, ge=1)
    codigo: Optional[str] = Field(None, min_length=1, max_length=20)
    fila: Optional[str] = None
    specs: Optional[str] = None
    estado: Optional[str] = None
    activa: Optional[bool] = None

class ComputadoraResponse(BaseModel):
    id: int
    laboratorio_id: int
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


# ─── Laboratorios ──────────────────────────────────────────────────────────────

@router.get("", summary="Listar laboratorios")
def listar_laboratorios(
    solo_activos: bool = True,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """SUPER_ADMIN ve todos. LAB_ADMIN solo ve el suyo."""
    query = db.query(Laboratorio)
    if solo_activos:
        query = query.filter(Laboratorio.activo == True)
    if current_user.rol == RolUsuario.LAB_ADMIN:
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
    return pcs


@router.post("/{lab_id}/computadoras", status_code=status.HTTP_201_CREATED, summary="Agregar computadora")
def agregar_computadora(
    lab_id: int,
    data: ComputadoraCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    # Validar que el LAB_ADMIN solo pueda agregar PCs a su propio laboratorio
    lab = _get_lab_autorizado(lab_id, db, current_user)

    duplicado = db.query(Computadora).filter(
        Computadora.laboratorio_id == lab_id,
        Computadora.codigo == data.codigo
    ).first()
    if duplicado:
        raise HTTPException(status_code=409, detail=f"Ya existe una PC con código '{data.codigo}' en este lab")

    pc = Computadora(laboratorio_id=lab_id, **data.model_dump())
    db.add(pc)
    db.commit()
    db.refresh(pc)
    return pc


@router.put("/{lab_id}/computadoras/{pc_id}", summary="Editar computadora")
async def editar_computadora(
    lab_id: int,
    pc_id: int,
    data: ComputadoraUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(RolUsuario.SUPER_ADMIN, RolUsuario.LAB_ADMIN))
):
    # Validar que el LAB_ADMIN solo pueda editar PCs de su propio laboratorio
    _get_lab_autorizado(lab_id, db, current_user)
    pc = db.query(Computadora).filter(
        Computadora.id == pc_id,
        Computadora.laboratorio_id == lab_id
    ).first()
    if not pc:
        raise HTTPException(status_code=404, detail="Computadora no encontrada en este laboratorio")

    for campo, valor in data.model_dump(exclude_none=True).items():
        setattr(pc, campo, valor)

    db.commit()
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

    return pc


@router.post("/{lab_id}/computadoras/bulk", status_code=status.HTTP_201_CREATED, summary="Carga masiva de PCs")
def bulk_computadoras(
    lab_id: int,
    data: BulkComputadorasCreate,
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
    return nuevas