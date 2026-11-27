from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.catalogo import CatalogoAlumno
from models.cobranza import ConceptoCobro, PagoServicio
from models.departamento import Departamento
from models.usuario import RolUsuario, Usuario
from services.user_permissions import PERM_COBRANZA, es_departamento_finanzas, tiene_permiso_departamento

router = APIRouter(prefix="/cobranza", tags=["Cobranza"])
MAX_CENTAVOS = 100_000_000


def _acceso(db, usuario, departamento_id, gestionar=False):
    dep = db.get(Departamento, departamento_id)
    if not es_departamento_finanzas(dep) or not dep.activo:
        raise HTTPException(404, "Departamento de Finanzas no disponible")
    responsable = usuario.rol == RolUsuario.SUPER_ADMIN or (
        usuario.rol == RolUsuario.ADMINISTRATIVO and dep.responsable_id == usuario.id
    )
    operador = (
        usuario.departamento_id == dep.id
        and usuario.rol == RolUsuario.ADMINISTRATIVO
        and tiene_permiso_departamento(db, usuario, PERM_COBRANZA, dep.id)
    )
    if not responsable and (gestionar or not operador):
        raise HTTPException(403, "No tienes permiso para esta operación de Finanzas")
    return responsable


def _alumno(a):
    return {"id": a.id, "matricula": a.matricula, "periodo": a.periodo,
            "nombre": " ".join(filter(None, (a.nombres, a.apellido_paterno, a.apellido_materno)))}


def _recibo(p):
    fecha = p.creado_en if p.creado_en.tzinfo else p.creado_en.replace(tzinfo=timezone.utc)
    return {
        "folio": f"CJ-{p.id:08d}", "fecha": fecha, "alumno": p.alumno, "matricula": p.matricula,
        "periodo": p.periodo, "concepto": p.concepto, "cajero": p.cajero, "medio": p.medio,
        "importe_centavos": p.importe_centavos, "recibido_centavos": p.recibido_centavos,
        "cambio_centavos": p.recibido_centavos - p.importe_centavos, "referencia": p.referencia,
    }


class ConceptoIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=150)
    importe_centavos: int = Field(gt=0, le=MAX_CENTAVOS)
    activo: bool = True


class PagoIn(BaseModel):
    operacion: UUID
    alumno_id: int = Field(gt=0)
    concepto_id: int = Field(gt=0)
    importe_centavos: int = Field(gt=0, le=MAX_CENTAVOS)
    medio: Literal["EFECTIVO", "TRANSFERENCIA", "TARJETA"]
    recibido_centavos: int | None = Field(default=None, gt=0, le=MAX_CENTAVOS)
    referencia: str | None = Field(default=None, max_length=120)


@router.get("")
def areas(db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    result = []
    for dep in db.query(Departamento).filter(Departamento.activo.is_(True)).order_by(Departamento.id):
        if not es_departamento_finanzas(dep):
            continue
        try:
            gestionar = _acceso(db, usuario, dep.id)
        except HTTPException as error:
            if error.status_code != 403:
                raise
            continue
        result.append({"id": dep.id, "nombre": dep.nombre, "gestionar": gestionar})
    return result


@router.get("/{dep_id}/alumnos")
def buscar_alumnos(dep_id: int, q: str = Query(default="", max_length=120),
                   matricula: str = Query(default="", max_length=30),
                   db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    _acceso(db, usuario, dep_id)
    termino = q.strip()
    consulta = db.query(CatalogoAlumno)
    matricula_exacta = func.lower(CatalogoAlumno.matricula) == (termino or matricula.strip()).lower()
    if len(termino) >= 2:
        campos = (CatalogoAlumno.matricula, CatalogoAlumno.nombres, CatalogoAlumno.apellido_paterno,
                  CatalogoAlumno.apellido_materno)
        for palabra in termino.split():
            consulta = consulta.filter(or_(*(campo.icontains(palabra, autoescape=True) for campo in campos)))
    elif termino or matricula.strip():
        consulta = consulta.filter(matricula_exacta)
    else:
        return []
    alumnos = consulta.order_by(
        matricula_exacta.desc(), CatalogoAlumno.activo.desc().nulls_last(), CatalogoAlumno.apellido_paterno,
        CatalogoAlumno.apellido_materno, CatalogoAlumno.nombres, CatalogoAlumno.id.desc(),
    ).limit(25).all()
    return [_alumno(a) for a in alumnos]


@router.get("/{dep_id}/conceptos")
def conceptos(dep_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    gestionar = _acceso(db, usuario, dep_id)
    rows = db.query(ConceptoCobro).filter_by(departamento_id=dep_id)
    if not gestionar:
        rows = rows.filter_by(activo=True)
    return [{"id": c.id, "nombre": c.nombre, "importe_centavos": c.importe_centavos, "activo": c.activo}
            for c in rows.order_by(ConceptoCobro.nombre)]


def _guardar_concepto(db: Session, concepto: ConceptoCobro, data: ConceptoIn):
    nombre = data.nombre.strip()
    if len(nombre) < 2:
        raise HTTPException(422, "Escribe el nombre del concepto")
    concepto.nombre = nombre
    concepto.importe_centavos = data.importe_centavos
    concepto.activo = data.activo
    db.add(concepto)
    db.commit()
    return {"id": concepto.id}


@router.post("/{dep_id}/conceptos", status_code=201)
def crear_concepto(dep_id: int, data: ConceptoIn, db: Session = Depends(get_db),
                   usuario: Usuario = Depends(get_current_user)):
    _acceso(db, usuario, dep_id, gestionar=True)
    return _guardar_concepto(db, ConceptoCobro(departamento_id=dep_id), data)


@router.put("/{dep_id}/conceptos/{concepto_id}")
def actualizar_concepto(dep_id: int, concepto_id: int, data: ConceptoIn, db: Session = Depends(get_db),
                        usuario: Usuario = Depends(get_current_user)):
    _acceso(db, usuario, dep_id, gestionar=True)
    concepto = db.query(ConceptoCobro).filter_by(id=concepto_id, departamento_id=dep_id).with_for_update().first()
    if concepto is None:
        raise HTTPException(404, "Concepto no encontrado")
    return _guardar_concepto(db, concepto, data)


@router.get("/{dep_id}/pagos")
def historial(dep_id: int, antes: int | None = Query(default=None, gt=0),
              db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    gestionar = _acceso(db, usuario, dep_id)
    filas = db.query(PagoServicio).filter_by(departamento_id=dep_id)
    if not gestionar:
        filas = filas.filter_by(cajero_id=usuario.id)
    if antes:
        filas = filas.filter(PagoServicio.id < antes)
    pagos = filas.order_by(PagoServicio.id.desc()).limit(31).all()
    return {"recibos": [_recibo(p) for p in pagos[:30]], "siguiente": pagos[29].id if len(pagos) > 30 else None}


@router.post("/{dep_id}/pagos")
def cobrar(dep_id: int, data: PagoIn, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    _acceso(db, usuario, dep_id)
    efectivo = data.medio == "EFECTIVO"
    referencia = (data.referencia or "").strip() or None
    recibido = data.recibido_centavos if efectivo else data.importe_centavos
    if recibido is None or recibido < data.importe_centavos:
        raise HTTPException(422, "El efectivo recibido no cubre el importe")
    if not efectivo and not referencia:
        raise HTTPException(422, "Registra la referencia del pago")

    operacion = db.query(PagoServicio).filter_by(departamento_id=dep_id, operacion=str(data.operacion))

    def repetir(pago):
        if (pago.cajero_id, pago.alumno_id, pago.concepto_id, pago.importe_centavos, pago.recibido_centavos, pago.medio, pago.referencia) != (
            usuario.id, data.alumno_id, data.concepto_id, data.importe_centavos, recibido, data.medio, referencia
        ):
            raise HTTPException(409, "La referencia de operación ya está en uso")
        return _recibo(pago)

    anterior = operacion.first()
    if anterior:
        return repetir(anterior)
    concepto = db.query(ConceptoCobro).filter_by(id=data.concepto_id, departamento_id=dep_id, activo=True).with_for_update().first()
    if not concepto or concepto.importe_centavos != data.importe_centavos:
        raise HTTPException(409, "La tarifa cambió o ya no está activa. Actualiza el tabulador.")
    alumno = db.get(CatalogoAlumno, data.alumno_id)
    if not alumno:
        raise HTTPException(404, "Alumno no encontrado")
    pago = PagoServicio(departamento_id=dep_id, operacion=str(data.operacion), alumno_id=alumno.id,
                       concepto_id=concepto.id, cajero_id=usuario.id, matricula=alumno.matricula,
                       alumno=_alumno(alumno)["nombre"], periodo=alumno.periodo, concepto=concepto.nombre,
                       cajero=usuario.nombre, importe_centavos=concepto.importe_centavos,
                       recibido_centavos=recibido, medio=data.medio, referencia=referencia,
                       creado_en=datetime.now(timezone.utc))
    db.add(pago)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        anterior = operacion.first()
        if anterior is None:
            raise
        return repetir(anterior)
    return _recibo(pago)
