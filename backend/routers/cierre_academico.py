import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session, selectinload

from database import get_db
from dependencies import get_current_user
from models.cierre_academico import CierreAcademicoPeriodo, ConfirmacionCargaDocente
from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico, HistorialCalendarioAcademico
from models.catalogo import PeriodoEscolar
from models.docencia import CargaDocente, ClaseDocente
from models.horario import Reservacion
from models.laboratorio import Laboratorio
from models.practica_laboratorio import PracticaLaboratorio
from models.sesion import SesionClase
from models.tutoria import ReporteTutor
from models.usuario import Usuario
from services.calendario_academico import estado_fecha_academica
from services.user_permissions import puede_gestionar_materias

router = APIRouter(prefix="/cierre-academico", tags=["Cierre académico"])
MX = ZoneInfo("America/Mexico_City")
RESUELTAS = {"CONFIRMADA_DOCENTE", "CERRADA_ADMINISTRATIVA"}


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


class CierreAdministrativoIn(BaseModel):
    motivo: str = Field(..., min_length=5, max_length=1000)
    folio: Optional[str] = Field(None, max_length=100)


def _hoy():
    return datetime.datetime.now(MX).date()


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _normalizar_periodo(valor):
    return "".join(ch for ch in (valor or "").upper() if ch.isalnum())


def _reservaciones_periodo(db, clave):
    buscada = _normalizar_periodo(clave)
    return [r for r in db.query(Reservacion).all() if _normalizar_periodo(r.cuatrimestre) == buscada]


def _fecha_fin_actividades(db, periodo_id):
    base = db.query(EventoCalendarioAcademico).join(CalendarioAcademico).filter(
        CalendarioAcademico.periodo_id == periodo_id,
        EventoCalendarioAcademico.activo == True,
    )
    fin_actividades = base.filter(
        EventoCalendarioAcademico.tipo == "FIN_ACTIVIDADES_ACADEMICAS",
    ).order_by(EventoCalendarioAcademico.fecha_fin.desc()).first()
    return fin_actividades or base.filter(
        EventoCalendarioAcademico.tipo == "FIN_CUATRIMESTRE",
    ).order_by(EventoCalendarioAcademico.fecha_fin.desc()).first()


def _validar_inicio_cierre(db, periodo_id):
    evento = _fecha_fin_actividades(db, periodo_id)
    if not evento:
        raise HTTPException(409, "Configura en el calendario oficial la fecha de fin de actividades académicas antes de comenzar el cierre")
    hoy = _hoy()
    if hoy <= evento.fecha_fin:
        raise HTTPException(409, f"El cierre estará disponible después del {evento.fecha_fin.strftime('%d/%m/%Y')}, al terminar las actividades académicas")


def _fechas_lectivas(db, periodo_id):
    inicio = db.query(EventoCalendarioAcademico).join(CalendarioAcademico).filter(
        CalendarioAcademico.periodo_id == periodo_id,
        EventoCalendarioAcademico.activo.is_(True),
        EventoCalendarioAcademico.tipo == "INICIO_CUATRIMESTRE",
    ).order_by(EventoCalendarioAcademico.fecha_inicio).first()
    fin = _fecha_fin_actividades(db, periodo_id)
    if not inicio or not fin:
        return None
    fecha = inicio.fecha_inicio
    limite = min(fin.fecha_fin, _hoy())
    fechas = {dia: [] for dia in range(7)}
    while fecha <= limite:
        estado = estado_fecha_academica(db, periodo_id, fecha)
        if not estado["calendario_publicado"]:
            return None
        if estado["requiere_asistencia"]:
            fechas[fecha.weekday()].append(fecha.isoformat())
        fecha += datetime.timedelta(days=1)
    return fechas


def _resumen_carga(db, carga, fechas_lectivas=None):
    clases = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id == carga.id,
    ).options(selectinload(ClaseDocente.asistencias)).order_by(ClaseDocente.fecha.desc()).all()
    reportes = db.query(ReporteTutor).filter(ReporteTutor.carga_docente_id == carga.id).all()
    abiertas = sum(1 for c in clases if c.estado in {"ABIERTA", "CORRECCION"})
    incidencias = sum(1 for c in clases if c.incidencia_requiere_seguimiento)
    reportes_pendientes = sum(1 for r in reportes if r.estado not in {"ATENDIDO", "CERRADO", "CERRADO_ADMINISTRATIVO", "CANCELADO"})
    esperadas = fechas_lectivas.get(carga.dia_semana, []) if fechas_lectivas is not None else None
    por_fecha = {clase.fecha.isoformat(): clase for clase in clases if not clase.es_reposicion}
    con_asistencia = {fecha for fecha, clase in por_fecha.items() if clase.asistencias}
    no_impartidas = {fecha: clase for fecha, clase in por_fecha.items() if clase.estado == "NO_IMPARTIDA" or clase.motivo_no_impartida}
    reposiciones = {}
    for clase in clases:
        if clase.es_reposicion and clase.clase_origen_id and clase.estado != "CANCELADA" and clase.estado_reposicion != "CANCELADA":
            reposiciones.setdefault(clase.clase_origen_id, clase)
    detalle_no_impartidas = []
    for fecha, clase in sorted(no_impartidas.items()):
        reposicion = reposiciones.get(clase.id)
        estado = clase.estado_reposicion
        if reposicion:
            estado = {"CERRADA": "REALIZADA", "NO_IMPARTIDA": "NO_IMPARTIDA"}.get(
                reposicion.estado, reposicion.estado_reposicion or estado,
            )
        detalle_no_impartidas.append({
            "fecha": fecha, "motivo": clase.motivo_no_impartida,
            "estado_reposicion": estado, "fecha_reposicion": reposicion.fecha.isoformat() if reposicion else None,
        })
    return {
        "clases_esperadas": len(esperadas) if esperadas is not None else None,
        "asistencias_registradas": sum(fecha in con_asistencia and fecha not in no_impartidas for fecha in esperadas or []),
        "fechas_sin_registro": [fecha for fecha in esperadas or [] if fecha not in con_asistencia and fecha not in no_impartidas],
        "fechas_no_impartidas": sorted(no_impartidas),
        "detalle_no_impartidas": detalle_no_impartidas,
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


def _ser_confirmacion(db, carga, confirmacion=None, fechas_lectivas=None):
    resumen = _resumen_carga(db, carga, fechas_lectivas)
    return {
        "id": confirmacion.id if confirmacion else None, "carga_id": carga.id,
        "materia": carga.actividad_nombre,
        "dia_semana": carga.dia_semana,
        "hora_inicio": carga.hora_inicio,
        "hora_fin": carga.hora_fin,
        "grupo": f"{carga.grupo_academico.cuatrimestre}° {carga.grupo_academico.grupo}" if carga.grupo_academico else None,
        "docente_id": carga.docente_id, "docente": carga.docente.nombre if carga.docente else None,
        "estado": confirmacion.estado if confirmacion else "PENDIENTE_REVISION",
        "cierre_administrativo": confirmacion.cierre_administrativo if confirmacion else None,
        "observaciones": confirmacion.observaciones if confirmacion else None,
        "confirmado_en": confirmacion.confirmado_en.isoformat() if confirmacion and confirmacion.confirmado_en else None,
        "reabierta_hasta": confirmacion.reabierta_hasta.isoformat() if confirmacion and confirmacion.reabierta_hasta else None,
        "motivo_reapertura": confirmacion.motivo_reapertura if confirmacion else None,
        "resumen": resumen,
    }


def _cargas_periodo(db, periodo_id):
    return db.query(CargaDocente).filter(
        CargaDocente.periodo_id == periodo_id, CargaDocente.activo.is_(True), CargaDocente.tipo_actividad == "CLASE",
    )


def _sesiones_abiertas(db, periodo_id, reservaciones):
    reservas = [r.id for r in reservaciones]
    clases = db.query(ClaseDocente.id).join(CargaDocente).filter(CargaDocente.periodo_id == periodo_id)
    sesiones = db.query(SesionClase, Laboratorio.nombre).join(
        Laboratorio, Laboratorio.id == SesionClase.laboratorio_id,
    ).filter(
        (SesionClase.reservacion_id.in_(reservas) | SesionClase.clase_docente_id.in_(clases)),
        SesionClase.estado != "CERRADA",
    ).all()
    practicas = db.query(PracticaLaboratorio, Laboratorio.nombre).join(
        PracticaLaboratorio.reservacion,
    ).join(Reservacion.laboratorio).filter(
        PracticaLaboratorio.reservacion_id.in_(reservas), PracticaLaboratorio.estado.in_(("EN_CURSO", "PREPARADA")),
    ).all()
    return [{
        "id": item.id, "reservacion_id": item.reservacion_id, "laboratorio": laboratorio,
        "tipo": tipo, "estado": item.estado,
    } for tipo, filas in (("Sesión", sesiones), ("Práctica", practicas)) for item, laboratorio in filas]


def _ser_cierre(db, cierre, usuario):
    administra = puede_gestionar_materias(db, usuario)
    cargas = _cargas_periodo(db, cierre.periodo_id)
    if not administra:
        cargas = cargas.filter(CargaDocente.docente_id == usuario.id)
    confirmaciones = {c.carga_docente_id: c for c in db.query(ConfirmacionCargaDocente).filter_by(cierre_id=cierre.id)}
    fechas = _fechas_lectivas(db, cierre.periodo_id)
    filas = [_ser_confirmacion(db, c, confirmaciones.get(c.id), fechas) for c in cargas.order_by(CargaDocente.id)]
    reservaciones = _reservaciones_periodo(db, cierre.periodo.clave) if administra else []
    sesiones = _sesiones_abiertas(db, cierre.periodo_id, reservaciones) if administra else []
    return {
        "id": cierre.id, "periodo_id": cierre.periodo_id, "periodo": cierre.periodo.clave,
        "estado": cierre.estado,
        "cerrado_en": cierre.cerrado_en.isoformat() if cierre.cerrado_en else None,
        "confirmacion_inicio": cierre.confirmacion_inicio.isoformat() if cierre.confirmacion_inicio else None,
        "confirmacion_fin": cierre.confirmacion_fin.isoformat() if cierre.confirmacion_fin else None,
        "observaciones": cierre.observaciones, "puede_administrar": administra,
        "confirmacion_vigente": cierre.estado == "CONFIRMACION" and bool(
            cierre.confirmacion_inicio and cierre.confirmacion_fin
            and cierre.confirmacion_inicio <= _hoy() <= cierre.confirmacion_fin
        ),
        "permite_cierre_administrativo": administra and cierre.estado == "CONFIRMACION"
        and cierre.confirmacion_fin is not None and _hoy() > cierre.confirmacion_fin,
        "historial_plazos": (cierre.historial_plazos or []) if administra else [],
        "reporte_final": cierre.reporte_final if administra else None,
        "resueltas": sum(f["estado"] in RESUELTAS for f in filas),
        "administrativas": sum(f["estado"] == "CERRADA_ADMINISTRATIVA" for f in filas),
        "total_cargas": len(filas), "confirmadas": sum(1 for f in filas if f["estado"] == "CONFIRMADA_DOCENTE"),
        "con_pendientes": sum(1 for f in filas if not f["resumen"]["puede_confirmar"]),
        "laboratorios": {
            "reservaciones": len(reservaciones),
            "reservaciones_archivadas": sum(1 for r in reservaciones if r.estado == "ARCHIVADA"),
            "sesiones_abiertas": len(sesiones),
            "puede_cerrar": not sesiones,
            "detalle_abiertas": sesiones,
        },
        "cargas": filas,
    }


@router.get("")
def obtener(periodo_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    cierre = db.query(CierreAcademicoPeriodo).filter(CierreAcademicoPeriodo.periodo_id == periodo_id).first()
    if cierre:
        return _ser_cierre(db, cierre, current_user)
    if puede_gestionar_materias(db, current_user):
        periodo = db.get(PeriodoEscolar, periodo_id)
        if periodo:
            return _ser_cierre(db, CierreAcademicoPeriodo(periodo=periodo, periodo_id=periodo_id, estado="ACTIVO"), current_user)
    return None


@router.put("")
def configurar(data: ConfiguracionIn, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    if not puede_gestionar_materias(db, current_user):
        raise HTTPException(403, "Solo División de Carrera puede configurar el cierre")
    periodo = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == data.periodo_id).with_for_update().first()
    if not periodo: raise HTTPException(404, "Periodo no encontrado")
    cierre = db.query(CierreAcademicoPeriodo).filter(CierreAcademicoPeriodo.periodo_id == periodo.id).first()
    if cierre and cierre.estado == "CERRADO":
        if data.estado != "CERRADO":
            raise HTTPException(409, "El cuatrimestre ya está cerrado. Solo se permiten reaperturas individuales de cargas para corrección.")
        return _ser_cierre(db, cierre, current_user)
    estado_actual = cierre.estado if cierre else "ACTIVO"
    transiciones = {
        "ACTIVO": {"ACTIVO", "PRECIERRE"},
        "PRECIERRE": {"PRECIERRE", "CONFIRMACION"},
        "CONFIRMACION": {"CONFIRMACION", "CERRADO"},
    }
    if data.estado not in transiciones.get(estado_actual, {estado_actual}):
        nombres = {"ACTIVO": "periodo en curso", "PRECIERRE": "pre-cierre", "CONFIRMACION": "confirmación docente", "CERRADO": "cierre definitivo"}
        raise HTTPException(409, f"No se puede pasar de {nombres.get(estado_actual, estado_actual)} a {nombres.get(data.estado, data.estado)}; completa primero la etapa actual")
    if data.estado == "PRECIERRE" and estado_actual == "ACTIVO":
        _validar_inicio_cierre(db, periodo.id)
    if not cierre:
        cierre = CierreAcademicoPeriodo(periodo_id=periodo.id, configurado_por_id=current_user.id)
        db.add(cierre)
    if data.estado == "CONFIRMACION":
        if estado_actual == "CONFIRMACION" and (
            data.confirmacion_inicio != cierre.confirmacion_inicio or data.confirmacion_fin < cierre.confirmacion_fin
        ):
            raise HTTPException(409, "Conserva la fecha inicial y amplía la fecha límite")
        if (cierre.confirmacion_inicio, cierre.confirmacion_fin) != (data.confirmacion_inicio, data.confirmacion_fin):
            cierre.historial_plazos = [*(cierre.historial_plazos or []), {
                "inicio": data.confirmacion_inicio.isoformat(), "fin": data.confirmacion_fin.isoformat(),
                "usuario_id": current_user.id, "fecha": _ahora().isoformat(),
            }]
    cierre.estado = data.estado
    if data.confirmacion_inicio is not None:
        cierre.confirmacion_inicio = data.confirmacion_inicio
    if data.confirmacion_fin is not None:
        cierre.confirmacion_fin = data.confirmacion_fin
    cierre.observaciones = data.observaciones
    if data.estado == "CERRADO":
        resueltas = db.query(ConfirmacionCargaDocente.carga_docente_id).filter(
            ConfirmacionCargaDocente.cierre_id == cierre.id, ConfirmacionCargaDocente.estado.in_(RESUELTAS),
        )
        pendientes = _cargas_periodo(db, periodo.id).filter(CargaDocente.id.notin_(resueltas)).count()
        if pendientes:
            raise HTTPException(409, f"Faltan {pendientes} cargas por resolver")
        reservaciones = _reservaciones_periodo(db, periodo.clave)
        sesiones_abiertas = _sesiones_abiertas(db, periodo.id, reservaciones)
        if sesiones_abiertas:
            raise HTTPException(409, f"Faltan {len(sesiones_abiertas)} sesiones de laboratorio por cerrar")
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
        reporte = _ser_cierre(db, cierre, current_user)
        reporte.pop("reporte_final")
        cierre.reporte_final = reporte
    db.commit(); db.refresh(cierre)
    return _ser_cierre(db, cierre, current_user)


@router.post("/cargas/{carga_id}/confirmar")
def confirmar(carga_id: int, data: ConfirmacionIn, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    carga = db.query(CargaDocente).filter(CargaDocente.id == carga_id, CargaDocente.docente_id == current_user.id).first()
    if not carga: raise HTTPException(404, "Carga docente no encontrada")
    db.query(PeriodoEscolar.id).filter_by(id=carga.periodo_id).with_for_update().one()
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
    if conf and conf.estado == "CERRADA_ADMINISTRATIVA":
        raise HTTPException(409, "División ya resolvió esta carga administrativamente")
    hoy = _hoy()
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


@router.post("/cargas/{carga_id}/cierre-administrativo")
def cerrar_carga(carga_id: int, data: CierreAdministrativoIn, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    if not puede_gestionar_materias(db, current_user):
        raise HTTPException(403, "Solo División puede resolver cargas administrativamente")
    carga = db.query(CargaDocente).filter_by(id=carga_id, activo=True, tipo_actividad="CLASE").first()
    if not carga:
        raise HTTPException(404, "Carga activa de clase no encontrada")
    db.query(PeriodoEscolar.id).filter_by(id=carga.periodo_id).with_for_update().one()
    cierre = db.query(CierreAcademicoPeriodo).filter_by(periodo_id=carga.periodo_id).first()
    if not cierre or cierre.estado != "CONFIRMACION" or not cierre.confirmacion_fin or _hoy() <= cierre.confirmacion_fin:
        raise HTTPException(409, "El cierre administrativo se habilita al vencer la confirmación docente")
    motivo = data.motivo.strip()
    if len(motivo) < 5:
        raise HTTPException(422, "Indica el motivo del cierre administrativo")
    conf = db.query(ConfirmacionCargaDocente).filter_by(cierre_id=cierre.id, carga_docente_id=carga.id).first()
    if conf and conf.estado in RESUELTAS:
        raise HTTPException(409, "La carga ya fue resuelta")
    if not conf:
        conf = ConfirmacionCargaDocente(cierre_id=cierre.id, carga_docente_id=carga.id, docente_id=carga.docente_id)
        db.add(conf)
    conf.estado = "CERRADA_ADMINISTRATIVA"
    conf.cierre_administrativo = {
        "motivo": motivo, "folio": (data.folio or "").strip() or None,
        "usuario_id": current_user.id, "responsable": current_user.nombre, "fecha": _ahora().isoformat(),
    }
    conf.resumen_json = _resumen_carga(db, carga, _fechas_lectivas(db, carga.periodo_id))
    db.commit()
    return _ser_cierre(db, cierre, current_user)


@router.post("/cargas/{carga_id}/reabrir")
def reabrir(carga_id: int, data: ReaperturaIn, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    if not puede_gestionar_materias(db, current_user): raise HTTPException(403, "Solo División puede reabrir una carga")
    conf = db.query(ConfirmacionCargaDocente).filter(ConfirmacionCargaDocente.carga_docente_id == carga_id).order_by(ConfirmacionCargaDocente.id.desc()).first()
    if not conf: raise HTTPException(404, "Confirmación no encontrada")
    db.query(PeriodoEscolar.id).filter_by(id=conf.carga.periodo_id).with_for_update().one()
    db.refresh(conf)
    if conf.estado == "CERRADA_ADMINISTRATIVA":
        raise HTTPException(409, "La carga tiene un cierre administrativo")
    conf.estado = "REABIERTA"; conf.motivo_reapertura = data.motivo
    conf.reabierta_hasta = _ahora() + datetime.timedelta(hours=data.horas); conf.reabierta_por_id = current_user.id
    db.commit(); return _ser_confirmacion(db, conf.carga, conf)
