import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.cierre_academico import CierreAcademicoPeriodo, ConfirmacionCargaDocente
from models.calendario_academico import CalendarioAcademico, HistorialCalendarioAcademico
from models.catalogo import PeriodoEscolar
from models.docencia import CargaDocente, ClaseDocente
from models.horario import Reservacion
from models.sesion import SesionClase
from models.tutoria import ReporteTutor
from models.usuario import Usuario
from services.user_permissions import puede_gestionar_materias

router = APIRouter(prefix="/cierre-academico", tags=["Cierre académico"])


class ConfiguracionIn(BaseModel):
    periodo_id: int
    estado: str
    confirmacion_inicio: Optional[datetime.date] = None
    confirmacion_fin: Optional[datetime.date] = None
    observaciones: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def validar(self):
        self.estado = self.estado.upper()
        if self.estado not in {"ACTIVO", "PRECIERRE", "CONFIRMACION", "CERRADO"}:
            raise ValueError("Estado no válido")
        if self.estado == "CONFIRMACION" and (not self.confirmacion_inicio or not self.confirmacion_fin):
            raise ValueError("Define la ventana de confirmación docente")
        if self.confirmacion_inicio and self.confirmacion_fin and self.confirmacion_fin < self.confirmacion_inicio:
            raise ValueError("La fecha final debe ser posterior a la inicial")
        return self


class ConfirmacionIn(BaseModel):
    observaciones: Optional[str] = Field(None, max_length=2000)


class ReaperturaIn(BaseModel):
    motivo: str = Field(..., min_length=5, max_length=1000)
    horas: int = Field(24, ge=1, le=168)


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _normalizar_periodo(valor):
    return "".join(ch for ch in (valor or "").upper() if ch.isalnum())


def _reservaciones_periodo(db, clave):
    buscada = _normalizar_periodo(clave)
    return [r for r in db.query(Reservacion).all() if _normalizar_periodo(r.cuatrimestre) == buscada]


def _resumen_carga(db, carga):
    clases = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id == carga.id,
    ).order_by(ClaseDocente.fecha.desc()).all()
    reportes = db.query(ReporteTutor).filter(ReporteTutor.carga_docente_id == carga.id).all()
    abiertas = sum(1 for c in clases if c.estado in {"ABIERTA", "CORRECCION"})
    incidencias = sum(1 for c in clases if c.incidencia_requiere_seguimiento)
    reportes_pendientes = sum(1 for r in reportes if r.estado not in {"ATENDIDO", "CERRADO", "CANCELADO"})
    return {
        "clases_registradas": len(clases),
        "clases_cerradas": sum(1 for c in clases if c.estado == "CERRADA"),
        "clases_abiertas": abiertas,
        "incidencias_seguimiento": incidencias,
        "reportes_tutoria_pendientes": reportes_pendientes,
        "puede_confirmar": len(clases) > 0 and abiertas == 0,
        "motivo_bloqueo": (
            "SIN_CLASES_REGISTRADAS" if not clases
            else "CLASES_ABIERTAS" if abiertas
            else None
        ),
        "sesiones": [{
            "id": clase.id,
            "fecha": clase.fecha.isoformat(),
            "estado": clase.estado,
            "tema_impartido": clase.tema_impartido,
            "incidencia_requiere_seguimiento": clase.incidencia_requiere_seguimiento,
            "incidencia_tipo": clase.incidencia_tipo,
            "es_extemporanea": clase.es_extemporanea,
        } for clase in clases],
    }


def _ser_confirmacion(db, carga, confirmacion=None):
    resumen = _resumen_carga(db, carga)
    return {
        "id": confirmacion.id if confirmacion else None, "carga_id": carga.id,
        "materia": carga.actividad_nombre,
        "grupo": f"{carga.grupo_academico.cuatrimestre}° {carga.grupo_academico.grupo}" if carga.grupo_academico else None,
        "docente_id": carga.docente_id, "docente": carga.docente.nombre if carga.docente else None,
        "estado": confirmacion.estado if confirmacion else "PENDIENTE_REVISION",
        "observaciones": confirmacion.observaciones if confirmacion else None,
        "confirmado_en": confirmacion.confirmado_en.isoformat() if confirmacion and confirmacion.confirmado_en else None,
        "reabierta_hasta": confirmacion.reabierta_hasta.isoformat() if confirmacion and confirmacion.reabierta_hasta else None,
        "motivo_reapertura": confirmacion.motivo_reapertura if confirmacion else None,
        "resumen": resumen,
    }


def _ser_cierre(db, cierre, usuario):
    cargas = db.query(CargaDocente).filter(CargaDocente.periodo_id == cierre.periodo_id, CargaDocente.activo == True, CargaDocente.tipo_actividad == "CLASE").all()
    confirmaciones = {c.carga_docente_id: c for c in db.query(ConfirmacionCargaDocente).filter(ConfirmacionCargaDocente.cierre_id == cierre.id).all()}
    if not puede_gestionar_materias(db, usuario):
        cargas = [c for c in cargas if c.docente_id == usuario.id]
    filas = [_ser_confirmacion(db, c, confirmaciones.get(c.id)) for c in cargas]
    reservaciones = _reservaciones_periodo(db, cierre.periodo.clave)
    reservacion_ids = [r.id for r in reservaciones]
    sesiones_abiertas = db.query(SesionClase).filter(
        SesionClase.reservacion_id.in_(reservacion_ids),
        SesionClase.estado != "CERRADA",
    ).count() if reservacion_ids else 0
    return {
        "id": cierre.id, "periodo_id": cierre.periodo_id, "periodo": cierre.periodo.clave,
        "estado": cierre.estado,
        "cerrado_en": cierre.cerrado_en.isoformat() if cierre.cerrado_en else None,
        "confirmacion_inicio": cierre.confirmacion_inicio.isoformat() if cierre.confirmacion_inicio else None,
        "confirmacion_fin": cierre.confirmacion_fin.isoformat() if cierre.confirmacion_fin else None,
        "observaciones": cierre.observaciones, "puede_administrar": puede_gestionar_materias(db, usuario),
        "total_cargas": len(filas), "confirmadas": sum(1 for f in filas if f["estado"] == "CONFIRMADA_DOCENTE"),
        "con_pendientes": sum(1 for f in filas if not f["resumen"]["puede_confirmar"]),
        "laboratorios": {
            "reservaciones": len(reservaciones),
            "reservaciones_archivadas": sum(1 for r in reservaciones if r.estado == "ARCHIVADA"),
            "sesiones_abiertas": sesiones_abiertas,
            "puede_cerrar": sesiones_abiertas == 0,
        },
        "cargas": filas,
    }


@router.get("")
def obtener(periodo_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    cierre = db.query(CierreAcademicoPeriodo).filter(CierreAcademicoPeriodo.periodo_id == periodo_id).first()
    return _ser_cierre(db, cierre, current_user) if cierre else None


@router.put("")
def configurar(data: ConfiguracionIn, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    if not puede_gestionar_materias(db, current_user):
        raise HTTPException(403, "Solo División de Carrera puede configurar el cierre")
    periodo = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == data.periodo_id).first()
    if not periodo: raise HTTPException(404, "Periodo no encontrado")
    cierre = db.query(CierreAcademicoPeriodo).filter(CierreAcademicoPeriodo.periodo_id == periodo.id).first()
    if cierre and cierre.estado == "CERRADO":
        if data.estado != "CERRADO":
            raise HTTPException(409, "El cuatrimestre ya está cerrado. Solo se permiten reaperturas individuales de cargas para corrección.")
        return _ser_cierre(db, cierre, current_user)
    if not cierre:
        cierre = CierreAcademicoPeriodo(periodo_id=periodo.id, configurado_por_id=current_user.id)
        db.add(cierre)
    cierre.estado = data.estado
    if data.confirmacion_inicio is not None:
        cierre.confirmacion_inicio = data.confirmacion_inicio
    if data.confirmacion_fin is not None:
        cierre.confirmacion_fin = data.confirmacion_fin
    cierre.observaciones = data.observaciones
    if data.estado == "CERRADO":
        pendientes = db.query(CargaDocente).filter(CargaDocente.periodo_id == periodo.id, CargaDocente.activo == True, CargaDocente.tipo_actividad == "CLASE").count()
        confirmadas = db.query(ConfirmacionCargaDocente).join(CierreAcademicoPeriodo).filter(CierreAcademicoPeriodo.periodo_id == periodo.id, ConfirmacionCargaDocente.estado == "CONFIRMADA_DOCENTE").count()
        if confirmadas < pendientes: raise HTTPException(409, f"Faltan {pendientes - confirmadas} cargas por confirmar")
        reservaciones = _reservaciones_periodo(db, periodo.clave)
        reservacion_ids = [r.id for r in reservaciones]
        sesiones_abiertas = db.query(SesionClase).filter(
            SesionClase.reservacion_id.in_(reservacion_ids),
            SesionClase.estado != "CERRADA",
        ).count() if reservacion_ids else 0
        if sesiones_abiertas:
            raise HTTPException(409, f"Faltan {sesiones_abiertas} sesiones de laboratorio por cerrar")
        for reservacion in reservaciones:
            if reservacion.estado == "PROGRAMADA":
                reservacion.estado = "ARCHIVADA"
        cierre.cerrado_por_id = current_user.id; cierre.cerrado_en = _ahora()
        calendario = db.query(CalendarioAcademico).filter_by(periodo_id=periodo.id).first()
        if calendario and calendario.estado != "CERRADO":
            anterior = calendario.estado
            calendario.estado = "CERRADO"
            calendario.cerrado_en = cierre.cerrado_en
            calendario.version += 1
            db.add(HistorialCalendarioAcademico(
                calendario_id=calendario.id, accion="CIERRE_CUATRIMESTRE",
                motivo="Calendario archivado al cerrar el cuatrimestre",
                datos_anteriores={"estado": anterior}, datos_nuevos={"estado": "CERRADO"},
                usuario_id=current_user.id,
            ))
    db.commit(); db.refresh(cierre)
    return _ser_cierre(db, cierre, current_user)


@router.post("/cargas/{carga_id}/confirmar")
def confirmar(carga_id: int, data: ConfirmacionIn, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    carga = db.query(CargaDocente).filter(CargaDocente.id == carga_id, CargaDocente.docente_id == current_user.id).first()
    if not carga: raise HTTPException(404, "Carga docente no encontrada")
    cierre = db.query(CierreAcademicoPeriodo).filter(CierreAcademicoPeriodo.periodo_id == carga.periodo_id).first()
    if not cierre or cierre.estado not in {"CONFIRMACION", "CERRADO"}:
        raise HTTPException(409, "El periodo no está en confirmación docente")
    conf = db.query(ConfirmacionCargaDocente).filter(
        ConfirmacionCargaDocente.cierre_id == cierre.id,
        ConfirmacionCargaDocente.carga_docente_id == carga.id,
    ).first()
    if cierre.estado == "CERRADO" and not (
        conf and conf.estado == "REABIERTA" and conf.reabierta_hasta and conf.reabierta_hasta >= _ahora()
    ):
        raise HTTPException(409, "El cuatrimestre está cerrado y esta carga no tiene una reapertura vigente")
    hoy = datetime.date.today()
    if cierre.estado == "CONFIRMACION" and (
        hoy < cierre.confirmacion_inicio or hoy > cierre.confirmacion_fin
    ):
        raise HTTPException(409, "La ventana de confirmación no está vigente")
    resumen = _resumen_carga(db, carga)
    if not resumen["puede_confirmar"]:
        detalle = "Registra al menos una clase antes de confirmar" if not resumen["clases_registradas"] else "Cierra las clases abiertas antes de confirmar"
        raise HTTPException(409, detalle)
    if not conf:
        conf = ConfirmacionCargaDocente(cierre_id=cierre.id, carga_docente_id=carga.id, docente_id=current_user.id)
        db.add(conf)
    conf.estado = "CONFIRMADA_DOCENTE"; conf.observaciones = data.observaciones
    conf.resumen_json = resumen; conf.confirmado_en = _ahora(); conf.reabierta_hasta = None
    db.commit(); return _ser_confirmacion(db, carga, conf)


@router.post("/cargas/{carga_id}/reabrir")
def reabrir(carga_id: int, data: ReaperturaIn, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    if not puede_gestionar_materias(db, current_user): raise HTTPException(403, "Solo División puede reabrir una carga")
    conf = db.query(ConfirmacionCargaDocente).filter(ConfirmacionCargaDocente.carga_docente_id == carga_id).order_by(ConfirmacionCargaDocente.id.desc()).first()
    if not conf: raise HTTPException(404, "Confirmación no encontrada")
    conf.estado = "REABIERTA"; conf.motivo_reapertura = data.motivo
    conf.reabierta_hasta = _ahora() + datetime.timedelta(hours=data.horas); conf.reabierta_por_id = current_user.id
    db.commit(); return _ser_confirmacion(db, conf.carga, conf)
