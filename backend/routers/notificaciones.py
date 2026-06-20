"""
Router de Notificaciones — LabControl UTECAN

Endpoints:
  GET  /notificaciones              → lista (no leídas primero)
  GET  /notificaciones/no-leidas    → conteo de no leídas
  PUT  /notificaciones/{id}/leer    → marca una como leída
  PUT  /notificaciones/leer-todas   → marca todas como leídas
  POST /notificaciones/verificar    → revisa eventos y genera notificaciones pendientes
  DELETE /notificaciones/{id}       → elimina una notificación

Helper público:
  crear_notificacion(db, usuario_id, tipo, titulo, mensaje, url, email)
"""

import datetime
import logging
from typing import Optional


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.usuario import Usuario, RolUsuario
from models.notificacion import Notificacion
from models.inventario import Prestamo, Incidente, Activo
from models.sesion import SesionClase
from models.horario import Reservacion
from models.laboratorio import Laboratorio
from models.comunicado import Comunicado, ComunicadoRespuesta, ComunicadoRespuestaMensaje
from services.email import enviar_notificacion

logger = logging.getLogger("labcontrol.notificaciones")

router = APIRouter(prefix="/notificaciones", tags=["Notificaciones"])


# ─── Helper: crear notificación + email opcional ──────────────────────────────

def crear_notificacion(
    db: Session,
    usuario_id: int,
    tipo: str,
    titulo: str,
    mensaje: str,
    url: Optional[str] = None,
    enviar_email: bool = True,
) -> Notificacion:
    """Crea una notificación en BD y envía email si el usuario tiene correo."""
    n = Notificacion(
        usuario_id=usuario_id,
        tipo=tipo,
        titulo=titulo,
        mensaje=mensaje,
        url=url,
    )
    db.add(n)
    db.flush()  # para obtener el id sin hacer commit

    if enviar_email:
        try:
            usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
            if usuario and usuario.email:
                enviar_notificacion(
                    destinatario=usuario.email,
                    tipo=tipo,
                    titulo=titulo,
                    mensaje=mensaje,
                    url=url,
                )
        except Exception as exc:
            logger.warning("No se pudo enviar email para notif %s: %s", n.id, exc)

    return n


# ─── Endpoints ───────────────────────────────────────────────────────────────

def _serializar(n: Notificacion) -> dict:
    return {
        "id":      n.id,
        "tipo":    n.tipo,
        "titulo":  n.titulo,
        "mensaje": n.mensaje,
        "leida":   n.leida,
        "fecha":   n.fecha.isoformat(),
        "url":     n.url,
    }


@router.get("", summary="Listar mis notificaciones")
def listar_notificaciones(
    solo_no_leidas: bool = False,
    limite: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(Notificacion).filter(Notificacion.usuario_id == current_user.id)
    if solo_no_leidas:
        q = q.filter(Notificacion.leida == False)
    notifs = q.order_by(Notificacion.leida.asc(), Notificacion.fecha.desc()).limit(limite).all()
    return [_serializar(n) for n in notifs]


@router.get("/no-leidas", summary="Conteo de notificaciones no leídas")
def contar_no_leidas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    count = db.query(Notificacion).filter(
        Notificacion.usuario_id == current_user.id,
        Notificacion.leida == False,
    ).count()
    return {"count": count}


@router.put("/leer-todas", summary="Marcar todas como leídas")
def leer_todas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    db.query(Notificacion).filter(
        Notificacion.usuario_id == current_user.id,
        Notificacion.leida == False,
    ).update({"leida": True})
    db.commit()
    return {"mensaje": "Todas marcadas como leídas"}


@router.put("/{notif_id}/leer", summary="Marcar una notificación como leída")
def leer_notificacion(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    n = db.query(Notificacion).filter(
        Notificacion.id == notif_id,
        Notificacion.usuario_id == current_user.id,
    ).first()
    if n:
        n.leida = True
        db.commit()
    return {"ok": True}


@router.delete("/{notif_id}", summary="Eliminar una notificación")
def eliminar_notificacion(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    n = db.query(Notificacion).filter(
        Notificacion.id == notif_id,
        Notificacion.usuario_id == current_user.id,
    ).first()
    if n:
        db.delete(n)
        db.commit()
    return {"ok": True}


# ─── POST /verificar: job que detecta eventos y crea notificaciones ──────────

@router.post("/verificar", summary="Revisar eventos y generar notificaciones automáticas")
def verificar_eventos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Revisa:
    1. Préstamos vencidos (no devueltos y pasada fecha esperada)
    2. Préstamos próximos a vencer (dentro de 24h)
    3. Incidentes/mantenimiento sin resolver > 7 días
    4. Sesiones en overtime activas

    Solo notifica si no existe ya una notificación reciente (últimas 8h)
    para el mismo evento para evitar spam.
    """
    ahora = _utcnow()
    generadas = 0

    # Determinar scope: SUPER_ADMIN ve todo, LAB_ADMIN ve su lab
    lab_filter = None
    if current_user.rol == RolUsuario.LAB_ADMIN and current_user.laboratorio_id:
        lab_filter = current_user.laboratorio_id

    def _ya_notificado(usuario_id: int, tipo: str, referencia: str, horas: int = 8) -> bool:
        """Evita duplicar notificaciones dentro de la ventana de horas indicada."""
        desde = ahora - datetime.timedelta(hours=horas)
        return db.query(Notificacion).filter(
            Notificacion.usuario_id == usuario_id,
            Notificacion.tipo == tipo,
            Notificacion.mensaje.contains(referencia),
            Notificacion.fecha >= desde,
        ).count() > 0

    # ── 1. Préstamos vencidos ─────────────────────────────────────────────────
    q_prestamos = db.query(Prestamo).filter(
        Prestamo.estado == "ACTIVO",
        Prestamo.fecha_retorno_esperada < ahora,
    )
    for p in q_prestamos.all():
        activo = db.query(Activo).filter(Activo.id == p.activo_id).first()
        # Marcar como vencido
        p.estado = "VENCIDO"

        # Notificar al admin del lab
        lab = db.query(Laboratorio).filter(Laboratorio.id == activo.laboratorio_id).first() if activo else None
        admin = db.query(Usuario).filter(
            Usuario.laboratorio_id == (activo.laboratorio_id if activo else None)
        ).first() if lab else None

        if not admin:
            # Notificar a todos los SUPER_ADMIN
            admins = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).all()
        else:
            admins = [admin]

        nombre_activo = activo.nombre if activo else f"ID {p.activo_id}"
        dias_vencido  = (ahora - p.fecha_retorno_esperada).days

        for adm in admins:
            ref = f"Préstamo #{p.id}"
            if not _ya_notificado(adm.id, "PRESTAMO_VENCIDO", ref, horas=12):
                crear_notificacion(
                    db, adm.id,
                    tipo="PRESTAMO_VENCIDO",
                    titulo=f"Préstamo vencido: {nombre_activo}",
                    mensaje=(
                        f"{ref} — {nombre_activo} prestado a '{p.solicitante_nombre}' "
                        f"venció hace {dias_vencido} día(s). "
                        f"Fecha esperada de retorno: {p.fecha_retorno_esperada.strftime('%d/%m/%Y')}."
                    ),
                    url="/admin/inventario",
                )
                generadas += 1

    # ── 2. Préstamos por vencer en < 24 h ─────────────────────────────────────
    manana = ahora + datetime.timedelta(hours=24)
    q_por_vencer = db.query(Prestamo).filter(
        Prestamo.estado == "ACTIVO",
        Prestamo.fecha_retorno_esperada >= ahora,
        Prestamo.fecha_retorno_esperada <= manana,
    )
    for p in q_por_vencer.all():
        activo = db.query(Activo).filter(Activo.id == p.activo_id).first()
        nombre_activo = activo.nombre if activo else f"ID {p.activo_id}"

        lab_id = activo.laboratorio_id if activo else None
        admins = db.query(Usuario).filter(Usuario.laboratorio_id == lab_id).all() if lab_id else []
        if not admins:
            admins = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).all()

        horas_restantes = int((p.fecha_retorno_esperada - ahora).total_seconds() / 3600)
        for adm in admins:
            ref = f"Por vencer #{p.id}"
            if not _ya_notificado(adm.id, "PRESTAMO_VENCIDO", ref, horas=20):
                crear_notificacion(
                    db, adm.id,
                    tipo="PRESTAMO_VENCIDO",
                    titulo=f"Préstamo por vencer: {nombre_activo}",
                    mensaje=(
                        f"Préstamo #{p.id} de '{p.solicitante_nombre}' vence en "
                        f"~{horas_restantes} hora(s). Equipo: {nombre_activo}."
                    ),
                    url="/admin/inventario",
                )
                generadas += 1

    # ── 3. Incidentes/mantenimiento sin resolver > 7 días ────────────────────
    hace_7_dias = ahora - datetime.timedelta(days=7)
    q_incidentes = db.query(Incidente).filter(
        Incidente.estado.in_(["ABIERTO", "EN_PROCESO"]),
        Incidente.fecha_reporte <= hace_7_dias,
    )
    for inc in q_incidentes.all():
        activo = db.query(Activo).filter(Activo.id == inc.activo_id).first() if inc.activo_id else None
        nombre = activo.nombre if activo else f"Incidente #{inc.id}"

        lab_id = activo.laboratorio_id if activo else None
        if lab_filter and lab_id != lab_filter:
            continue

        admins = db.query(Usuario).filter(Usuario.laboratorio_id == lab_id).all() if lab_id else []
        if not admins:
            admins = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).all()

        dias_abierto = (ahora - inc.fecha_reporte).days
        for adm in admins:
            ref = f"Incidente #{inc.id}"
            if not _ya_notificado(adm.id, "MANTENIMIENTO", ref, horas=24):
                crear_notificacion(
                    db, adm.id,
                    tipo="MANTENIMIENTO",
                    titulo=f"Mantenimiento pendiente: {nombre}",
                    mensaje=(
                        f"{ref} lleva {dias_abierto} días sin resolver. "
                        f"Descripción: {inc.descripcion or 'Sin descripción'}."
                    ),
                    url="/admin/inventario",
                )
                generadas += 1

    # ── 4. Sesiones en overtime ───────────────────────────────────────────────
    q_overtime = db.query(SesionClase).filter(
        SesionClase.estado == "ABIERTA",
        SesionClase.fin_estimado < ahora,
    )
    for s in q_overtime.all():
        if lab_filter and s.laboratorio_id != lab_filter:
            continue

        lab = db.query(Laboratorio).filter(Laboratorio.id == s.laboratorio_id).first()
        lab_nombre = lab.nombre if lab else f"Lab {s.laboratorio_id}"
        minutos_extra = int((ahora - s.fin_estimado).total_seconds() / 60)

        admins = db.query(Usuario).filter(Usuario.laboratorio_id == s.laboratorio_id).all()
        if not admins:
            admins = db.query(Usuario).filter(Usuario.rol == RolUsuario.SUPER_ADMIN).all()

        for adm in admins:
            ref = f"Sesión #{s.id}"
            if not _ya_notificado(adm.id, "OVERTIME", ref, horas=1):
                crear_notificacion(
                    db, adm.id,
                    tipo="OVERTIME",
                    titulo=f"Sesión con tiempo extra — {lab_nombre}",
                    mensaje=(
                        f"{ref} lleva {minutos_extra} min de tiempo extra en {lab_nombre}. "
                        f"Docente: {s.docente.nombre if s.docente else 'N/D'}."
                    ),
                    url="/admin/sesiones",
                )
                generadas += 1

    # 5. Seguimientos de comunicados dirigidos al usuario actual.
    #    Sirve como respaldo si el comentario se guardo, pero la notificacion
    #    no se genero en el momento por una version anterior o un fallo puntual.
    hace_30_dias = ahora - datetime.timedelta(days=30)
    seguimientos = (
        db.query(ComunicadoRespuestaMensaje, Comunicado, Usuario)
        .join(ComunicadoRespuesta, ComunicadoRespuestaMensaje.respuesta_id == ComunicadoRespuesta.id)
        .join(Comunicado, ComunicadoRespuesta.comunicado_id == Comunicado.id)
        .join(Usuario, Usuario.id == ComunicadoRespuestaMensaje.usuario_id)
        .filter(ComunicadoRespuesta.usuario_id == current_user.id)
        .filter(ComunicadoRespuestaMensaje.usuario_id != current_user.id)
        .filter(ComunicadoRespuestaMensaje.creado_en >= hace_30_dias)
        .order_by(ComunicadoRespuestaMensaje.creado_en.desc())
        .limit(20)
        .all()
    )

    for _mensaje, comunicado, autor in seguimientos:
        titulo_com = (comunicado.titulo or "Comunicado")[:60]
        titulo_notificacion = f"Seguimiento: {titulo_com}"
        texto = f"{autor.nombre} agrego un comentario en '{titulo_com}'"
        url = f"/comunicados?id={comunicado.id}"
        existe = db.query(Notificacion).filter(
            Notificacion.usuario_id == current_user.id,
            Notificacion.tipo == "COMUNICADO_SEGUIMIENTO",
            Notificacion.titulo == titulo_notificacion,
            Notificacion.url == url,
        ).first()
        if existe:
            continue

        crear_notificacion(
            db=db,
            usuario_id=current_user.id,
            tipo="COMUNICADO_SEGUIMIENTO",
            titulo=titulo_notificacion,
            mensaje=texto,
            url=url,
        )
        generadas += 1

    seguimientos_autor = (
        db.query(ComunicadoRespuestaMensaje, Comunicado, Usuario)
        .join(ComunicadoRespuesta, ComunicadoRespuestaMensaje.respuesta_id == ComunicadoRespuesta.id)
        .join(Comunicado, ComunicadoRespuesta.comunicado_id == Comunicado.id)
        .join(Usuario, Usuario.id == ComunicadoRespuestaMensaje.usuario_id)
        .filter(Comunicado.autor_id == current_user.id)
        .filter(ComunicadoRespuestaMensaje.usuario_id != current_user.id)
        .filter(ComunicadoRespuestaMensaje.creado_en >= hace_30_dias)
        .order_by(ComunicadoRespuestaMensaje.creado_en.desc())
        .limit(20)
        .all()
    )

    for _mensaje, comunicado, autor in seguimientos_autor:
        titulo_com = (comunicado.titulo or "Comunicado")[:60]
        titulo_notificacion = f"Seguimiento: {titulo_com}"
        texto = f"{autor.nombre} agrego un comentario en tu comunicado '{titulo_com}'"
        url = f"/admin/comunicados?id={comunicado.id}"
        existe = db.query(Notificacion).filter(
            Notificacion.usuario_id == current_user.id,
            Notificacion.tipo == "COMUNICADO_SEGUIMIENTO",
            Notificacion.titulo == titulo_notificacion,
            Notificacion.url == url,
        ).first()
        if existe:
            continue

        crear_notificacion(
            db=db,
            usuario_id=current_user.id,
            tipo="COMUNICADO_SEGUIMIENTO",
            titulo=titulo_notificacion,
            mensaje=texto,
            url=url,
        )
        generadas += 1

    if generadas:
        db.commit()

    return {"ok": True, "generadas": generadas}
