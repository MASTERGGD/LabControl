"""
routers/adeudos.py — Registro unificado de responsabilidades

Endpoints:
  POST   /adeudos                          Crear adeudo manual
  GET    /adeudos                          Listar (filtros: identificador, tipo_persona, estado, cuatrimestre, lab_id, origen_tipo)
  GET    /adeudos/persona/{identificador}  Resumen completo: adeudos + préstamos activos
  GET    /adeudos/pc/{computadora_id}/historial  Últimos usuarios de una PC (para investigar)
  POST   /adeudos/sincronizar-prestamos    Auto-generar adeudos de préstamos vencidos
  GET    /adeudos/{id}                     Detalle
  PATCH  /adeudos/{id}                     Actualizar estado / notas
  DELETE /adeudos/{id}                     Eliminar (SUPER_ADMIN o LAB_ADMIN)
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import datetime
import json

from database import get_db
from models.adeudo import Adeudo
from models.inventario import Prestamo, Activo, Incidente
from models.usuario import Usuario, RolUsuario
from models.laboratorio import Laboratorio, Computadora
from models.sesion import SesionClase, AsignacionPC
from models.catalogo import CatalogoAlumno
from dependencies import get_current_user, require_roles
from services.auditoria import registrar, Accion, Recurso

router = APIRouter(prefix="/adeudos", tags=["Adeudos"])
_admin = require_roles(RolUsuario.SUPER_ADMIN)


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _prestamo_meta(p: Prestamo) -> dict:
    obs = p.observaciones_salida or ""
    try:
        if obs.startswith("__meta__"):
            return json.loads(obs[8:])
        return json.loads(obs) if obs else {}
    except Exception:
        return {}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AdeudoCreate(BaseModel):
    persona_nombre:        str
    persona_identificador: str
    persona_tipo:          str = "ALUMNO"   # ALUMNO | DOCENTE | OTRO
    descripcion:           str
    tipo:                  str = "DAÑO"
    origen_tipo:           str = "MANUAL"
    laboratorio_id:        Optional[int]   = None
    sesion_id:             Optional[int]   = None
    computadora_id:        Optional[int]   = None
    incidente_id:          Optional[int]   = None
    prestamo_id:           Optional[int]   = None
    cuatrimestre:          Optional[str]   = None
    monto_estimado:        Optional[float] = None


class AdeudoUpdate(BaseModel):
    estado:           Optional[str]   = None
    notas_resolucion: Optional[str]   = None
    monto_estimado:   Optional[float] = None
    descripcion:      Optional[str]   = None
    cuatrimestre:     Optional[str]   = None


# ─── Serializer ───────────────────────────────────────────────────────────────

def _s(a: Adeudo) -> dict:
    return {
        "id":                    a.id,
        "persona_nombre":        a.persona_nombre,
        "persona_identificador": a.persona_identificador,
        "persona_tipo":          a.persona_tipo,
        "origen_tipo":           a.origen_tipo,
        "tipo":                  a.tipo,
        "descripcion":           a.descripcion,
        "cuatrimestre":          a.cuatrimestre,
        "estado":                a.estado,
        "monto_estimado":        a.monto_estimado,
        "laboratorio_id":        a.laboratorio_id,
        "laboratorio_nombre":    a.laboratorio.nombre if a.laboratorio else None,
        "sesion_id":             a.sesion_id,
        "sesion_codigo":         a.sesion.codigo_sesion if a.sesion else None,
        "computadora_id":        a.computadora_id,
        "computadora_codigo":    a.computadora.codigo  if a.computadora else None,
        "incidente_id":          a.incidente_id,
        "prestamo_id":           a.prestamo_id,
        "fecha_reporte":         a.fecha_reporte.isoformat()    if a.fecha_reporte    else None,
        "reportado_por":         a.reportado_por.nombre         if a.reportado_por    else None,
        "fecha_resolucion":      a.fecha_resolucion.isoformat() if a.fecha_resolucion else None,
        "resuelto_por":          a.resuelto_por.nombre          if a.resuelto_por     else None,
        "notas_resolucion":      a.notas_resolucion,
    }


def _s_prestamo(p: Prestamo) -> dict:
    return {
        "id":                    p.id,
        "activo_nombre":         p.activo.nombre if p.activo else "—",
        "activo_codigo":         p.activo.codigo_inventario if p.activo else "—",
        "fecha_salida":          p.fecha_salida.isoformat()          if p.fecha_salida          else None,
        "fecha_retorno_esperada":p.fecha_retorno_esperada.isoformat() if p.fecha_retorno_esperada else None,
        "fecha_retorno_real":    p.fecha_retorno_real.isoformat()     if p.fecha_retorno_real     else None,
        "estado":                p.estado,
        "condicion_salida":      p.condicion_salida,
        "condicion_retorno":     p.condicion_retorno,
        "vencido":               (
            p.estado in ("ACTIVO", "VENCIDO") and
            p.fecha_retorno_esperada and
            p.fecha_retorno_esperada < _utcnow()
        ),
    }


# ─── Helper: crear adeudo desde préstamo vencido ──────────────────────────────

def _crear_adeudo_prestamo(p: Prestamo, db: Session, reportado_por_id: int = None) -> tuple:
    """Crea un adeudo ligado a un préstamo vencido si aún no existe."""
    existente = db.query(Adeudo).filter(
        Adeudo.prestamo_id == p.id,
        Adeudo.estado.in_(["PENDIENTE", "EN_REVISION"]),
    ).first()
    if existente:
        return existente, False

    dias_vencido = (_utcnow() - p.fecha_retorno_esperada).days
    tipo = "PRESTAMO_NO_DEVUELTO" if dias_vencido > 30 else "PRESTAMO_VENCIDO"
    persona_tipo = _prestamo_meta(p).get("receptor_tipo", "ALUMNO")

    a = Adeudo(
        persona_nombre        = p.solicitante_nombre,
        persona_identificador = p.solicitante_id_escolar,
        persona_tipo          = persona_tipo,
        origen_tipo           = "PRESTAMO",
        tipo                  = tipo,
        descripcion           = (
            f"Préstamo #{p.id} — {p.activo.nombre if p.activo else 'Equipo'} "
            f"(cód. {p.activo.codigo_inventario if p.activo else '—'}) "
            f"vencido hace {dias_vencido} día(s). "
            f"Fecha límite: {p.fecha_retorno_esperada.strftime('%d/%m/%Y')}."
        ),
        prestamo_id           = p.id,
        laboratorio_id        = p.activo.laboratorio_id if p.activo else None,
        estado                = "PENDIENTE",
        reportado_por_id      = reportado_por_id,
    )
    db.add(a)
    return a, True


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", status_code=201, summary="Crear adeudo")
def crear_adeudo(
    request: Request,
    body: AdeudoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_admin),
):
    if body.laboratorio_id and not db.query(Laboratorio).filter(Laboratorio.id == body.laboratorio_id).first():
        raise HTTPException(404, "Laboratorio no encontrado")
    if body.sesion_id and not db.query(SesionClase).filter(SesionClase.id == body.sesion_id).first():
        raise HTTPException(404, "Sesión no encontrada")
    if body.computadora_id and not db.query(Computadora).filter(Computadora.id == body.computadora_id).first():
        raise HTTPException(404, "Computadora no encontrada")

    a = Adeudo(
        persona_nombre        = body.persona_nombre,
        persona_identificador = body.persona_identificador,
        persona_tipo          = body.persona_tipo,
        origen_tipo           = body.origen_tipo,
        descripcion           = body.descripcion,
        tipo                  = body.tipo,
        laboratorio_id        = body.laboratorio_id,
        sesion_id             = body.sesion_id,
        computadora_id        = body.computadora_id,
        incidente_id          = body.incidente_id,
        prestamo_id           = body.prestamo_id,
        cuatrimestre          = body.cuatrimestre,
        monto_estimado        = body.monto_estimado,
        estado                = "PENDIENTE",
        reportado_por_id      = current_user.id,
        fecha_reporte         = _utcnow(),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    registrar(db, accion=Accion.CREAR_ADEUDO, recurso=Recurso.ADEUDO,
              usuario=current_user, recurso_id=a.id,
              detalle={"persona": body.persona_nombre, "identificador": body.persona_identificador,
                       "tipo": body.tipo, "laboratorio_id": body.laboratorio_id},
              request=request)
    return _s(a)


@router.get("", summary="Listar adeudos")
def listar_adeudos(
    identificador: Optional[str] = Query(None, description="Nombre o matrícula (búsqueda combinada)"),
    persona_tipo:  Optional[str] = Query(None),
    estado:        Optional[str] = Query(None),
    cuatrimestre:  Optional[str] = Query(None),
    lab_id:        Optional[int] = Query(None),
    origen_tipo:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(Adeudo)
    if current_user.rol == RolUsuario.LAB_ADMIN:
        q = q.filter(Adeudo.laboratorio_id == current_user.laboratorio_id)
    elif lab_id:
        q = q.filter(Adeudo.laboratorio_id == lab_id)

    if identificador:
        term = f"%{identificador}%"
        q = q.filter(
            Adeudo.persona_identificador.ilike(term) |
            Adeudo.persona_nombre.ilike(term)
        )
    if persona_tipo:
        q = q.filter(Adeudo.persona_tipo == persona_tipo)
    if estado:
        q = q.filter(Adeudo.estado == estado)
    if cuatrimestre:
        q = q.filter(Adeudo.cuatrimestre == cuatrimestre)
    if origen_tipo:
        q = q.filter(Adeudo.origen_tipo == origen_tipo)

    return [_s(a) for a in q.order_by(Adeudo.fecha_reporte.desc()).all()]


@router.get("/persona/{identificador}", summary="Resumen completo de una persona")
def resumen_persona(
    identificador: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Vista unificada: adeudos + préstamos activos/vencidos de una persona.
    Permite al departamento consultar con una sola búsqueda.
    """
    adeudos = db.query(Adeudo).filter(
        Adeudo.persona_identificador == identificador
    ).order_by(Adeudo.fecha_reporte.desc()).all()

    prestamos = db.query(Prestamo).filter(
        Prestamo.solicitante_id_escolar == identificador
    ).order_by(Prestamo.fecha_salida.desc()).all()

    now = _utcnow()

    nombre = None
    if adeudos:
        nombre = adeudos[0].persona_nombre
    elif prestamos:
        nombre = prestamos[0].solicitante_nombre

    # Enriquecer con datos del catálogo (alumno) o del usuario (personal)
    cat = db.query(CatalogoAlumno).filter(
        CatalogoAlumno.matricula == identificador
    ).first()
    if cat and not nombre:
        nombre = " ".join(
            part for part in [
                cat.apellido_paterno,
                cat.apellido_materno,
                cat.nombres,
            ] if part
        ).strip()

    usuario_personal = None
    if not cat:
        usuario_personal = db.query(Usuario).filter(
            (Usuario.numero_empleado == identificador) |
            (Usuario.id == int(identificador.replace("USR","")) if identificador.startswith("USR") else False)
        ).first()
        if usuario_personal and not nombre:
            nombre = usuario_personal.nombre

    persona_tipo = "ALUMNO" if cat else ("PERSONAL" if usuario_personal else (adeudos[0].persona_tipo if adeudos else "ALUMNO"))

    return {
        "identificador": identificador,
        "nombre":        nombre or (usuario_personal.nombre if usuario_personal else "—"),
        "persona_tipo":  persona_tipo,
        "catalogo": {
            "carrera":      cat.carrera      if cat else None,
            "cuatrimestre": cat.cuatrimestre if cat else None,
            "grupo":        cat.grupo        if cat else None,
            "periodo":      cat.periodo      if cat else None,
        } if cat else None,
        "personal": {
            "rol":              usuario_personal.rol.value if usuario_personal else None,
            "numero_empleado":  usuario_personal.numero_empleado if usuario_personal else None,
        } if usuario_personal else None,
        "resumen": {
            "adeudos_pendientes":  sum(1 for a in adeudos if a.estado == "PENDIENTE"),
            "adeudos_revision":    sum(1 for a in adeudos if a.estado == "EN_REVISION"),
            "adeudos_resueltos":   sum(1 for a in adeudos if a.estado == "RESUELTO"),
            "adeudos_exonerados":  sum(1 for a in adeudos if a.estado == "EXONERADO"),
            "prestamos_activos":   sum(1 for p in prestamos if p.estado == "ACTIVO"),
            "prestamos_vencidos":  sum(
                1 for p in prestamos
                if p.estado in ("ACTIVO", "VENCIDO") and p.fecha_retorno_esperada and p.fecha_retorno_esperada < now
            ),
            "tiene_adeudos_activos": any(a.estado in ("PENDIENTE", "EN_REVISION") for a in adeudos),
        },
        "adeudos":   [_s(a) for a in adeudos],
        "prestamos": [_s_prestamo(p) for p in prestamos],
    }


@router.get("/pc/{computadora_id}/historial", summary="Historial de usuarios de una PC")
def historial_pc(
    computadora_id: int,
    limite: int = Query(10, description="Últimas N sesiones"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_admin),
):
    """
    Devuelve las últimas asignaciones de una PC con nombre/matrícula del alumno,
    sesión y docente. Útil para investigar quién causó un daño.
    """
    pc = db.query(Computadora).filter(Computadora.id == computadora_id).first()
    if not pc:
        raise HTTPException(404, "Computadora no encontrada")

    asigs = (
        db.query(AsignacionPC)
        .filter(AsignacionPC.computadora_id == computadora_id)
        .order_by(AsignacionPC.hora_asignacion.desc())
        .limit(limite)
        .all()
    )

    sesion_ids = list({a.sesion_id for a in asigs})
    sesiones = {
        s.id: s for s in db.query(SesionClase).filter(SesionClase.id.in_(sesion_ids)).all()
    } if sesion_ids else {}
    docente_ids = {s.docente_id for s in sesiones.values()}
    docentes = {
        u.id: u for u in db.query(Usuario).filter(Usuario.id.in_(docente_ids)).all()
    } if docente_ids else {}

    return {
        "computadora_id":    pc.id,
        "computadora_codigo": pc.codigo,
        "asignaciones": [
            {
                "asignacion_id":    a.id,
                "alumno_nombre":    a.alumno_nombre,
                "alumno_matricula": a.alumno_matricula,
                "hora_entrada":     a.hora_asignacion.isoformat() if a.hora_asignacion else None,
                "hora_salida":      a.hora_liberacion.isoformat() if a.hora_liberacion else None,
                "sesion_id":        a.sesion_id,
                "sesion_codigo":    sesiones[a.sesion_id].codigo_sesion if a.sesion_id in sesiones else None,
                "sesion_materia":   sesiones[a.sesion_id].materia       if a.sesion_id in sesiones else None,
                "sesion_fecha":     sesiones[a.sesion_id].inicio.isoformat() if a.sesion_id in sesiones and sesiones[a.sesion_id].inicio else None,
                "docente_nombre":   docentes[sesiones[a.sesion_id].docente_id].nombre
                                    if a.sesion_id in sesiones and sesiones[a.sesion_id].docente_id in docentes
                                    else None,
            }
            for a in asigs
        ],
    }


@router.post("/sincronizar-prestamos", summary="Auto-generar adeudos de préstamos vencidos")
def sincronizar_prestamos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_admin),
):
    """
    Revisa todos los préstamos ACTIVOS vencidos y crea un adeudo PENDIENTE
    por cada uno que aún no tenga adeudo activo asociado.
    Retorna cuántos adeudos se crearon.
    """
    ahora = _utcnow()
    vencidos = db.query(Prestamo).filter(
        Prestamo.fecha_retorno_real.is_(None),
        Prestamo.estado.in_(["ACTIVO", "VENCIDO"]),
        Prestamo.fecha_retorno_esperada < ahora,
    ).all()

    creados = 0
    for p in vencidos:
        p.estado = "VENCIDO"
        _, es_nuevo = _crear_adeudo_prestamo(p, db, current_user.id)
        if es_nuevo:
            creados += 1

    db.commit()
    return {
        "prestamos_vencidos": len(vencidos),
        "adeudos_creados":    creados,
        "mensaje":            f"Se revisaron {len(vencidos)} préstamos vencidos. {creados} adeudo(s) nuevo(s) generado(s).",
    }


@router.get("/sesion/{sesion_id}/candidatos", summary="Alumnos que usaron una PC en una sesión")
def candidatos_sesion(
    sesion_id: int,
    computadora_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_admin),
):
    q = db.query(AsignacionPC).filter(AsignacionPC.sesion_id == sesion_id)
    if computadora_id:
        q = q.filter(AsignacionPC.computadora_id == computadora_id)
    asigs = q.all()

    pc_ids = list({a.computadora_id for a in asigs})
    pcs = {
        p.id: p for p in db.query(Computadora).filter(Computadora.id.in_(pc_ids)).all()
    } if pc_ids else {}

    return [
        {
            "asignacion_id":    a.id,
            "alumno_nombre":    a.alumno_nombre,
            "alumno_matricula": a.alumno_matricula,
            "computadora_id":   a.computadora_id,
            "pc_codigo":        pcs[a.computadora_id].codigo if a.computadora_id in pcs else None,
            "hora_entrada":     a.hora_asignacion.isoformat() if a.hora_asignacion else None,
            "hora_salida":      a.hora_liberacion.isoformat() if a.hora_liberacion else None,
        }
        for a in asigs
    ]


@router.get("/{adeudo_id}", summary="Detalle de adeudo")
def obtener_adeudo(
    adeudo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    a = db.query(Adeudo).filter(Adeudo.id == adeudo_id).first()
    if not a:
        raise HTTPException(404, "Adeudo no encontrado")
    if current_user.rol == RolUsuario.LAB_ADMIN and a.laboratorio_id != current_user.laboratorio_id:
        raise HTTPException(403, "No tienes acceso a este adeudo")
    return _s(a)


@router.patch("/{adeudo_id}", summary="Actualizar adeudo")
def actualizar_adeudo(
    request: Request,
    adeudo_id: int,
    body: AdeudoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_admin),
):
    a = db.query(Adeudo).filter(Adeudo.id == adeudo_id).first()
    if not a:
        raise HTTPException(404, "Adeudo no encontrado")
    if current_user.rol == RolUsuario.LAB_ADMIN and a.laboratorio_id != current_user.laboratorio_id:
        raise HTTPException(403, "No tienes acceso a este adeudo")

    ESTADOS = {"PENDIENTE", "EN_REVISION", "RESUELTO", "EXONERADO"}
    if body.estado and body.estado not in ESTADOS:
        raise HTTPException(422, f"Estado inválido. Opciones: {ESTADOS}")

    if body.estado:
        a.estado = body.estado
        if body.estado in ("RESUELTO", "EXONERADO"):
            a.fecha_resolucion = _utcnow()
            a.resuelto_por_id  = current_user.id
            if a.incidente_id:
                inc = db.query(Incidente).filter(Incidente.id == a.incidente_id).first()
                if inc and inc.estado not in ("REPARADO", "DADO_DE_BAJA"):
                    inc.estado = "REPARADO"

    if body.notas_resolucion is not None: a.notas_resolucion = body.notas_resolucion
    if body.monto_estimado   is not None: a.monto_estimado   = body.monto_estimado
    if body.descripcion      is not None: a.descripcion      = body.descripcion
    if body.cuatrimestre     is not None: a.cuatrimestre     = body.cuatrimestre

    db.commit()
    db.refresh(a)
    if body.estado and body.estado in ("RESUELTO", "EXONERADO"):
        registrar(db, accion=Accion.RESOLVER_ADEUDO, recurso=Recurso.ADEUDO,
                  usuario=current_user, recurso_id=a.id,
                  detalle={"estado": body.estado, "persona": a.persona_nombre,
                           "identificador": a.persona_identificador,
                           "notas": body.notas_resolucion},
                  request=request)
    return _s(a)


@router.delete("/{adeudo_id}", status_code=204, summary="Eliminar adeudo")
def eliminar_adeudo(
    adeudo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(_admin),
):
    a = db.query(Adeudo).filter(Adeudo.id == adeudo_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Adeudo no encontrado")
    if current_user.rol == RolUsuario.LAB_ADMIN and a.laboratorio_id != current_user.laboratorio_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este adeudo")
    db.delete(a)
    db.commit()
