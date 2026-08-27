import datetime
import io
import re
from collections import defaultdict
from pathlib import Path
from typing import Optional
from xml.sax.saxutils import escape

import openpyxl
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.catalogo import GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.docencia import AsistenciaDocente, CargaDocente, ClaseDocente, CorreccionAsistenciaDocente, SeguimientoAlumnoDocente
from models.usuario import Usuario
from services.calendario_academico import estado_fecha_academica
from services.timezone import format_fecha_corta_mx, now_mx, today_mx
from services.user_permissions import puede_gestionar_materias


router = APIRouter(prefix="/reportes-academicos", tags=["Reportes académicos"])
ESTADOS_CERRADOS = {"ATENDIDO", "CUMPLIDO", "CUMPLIDO_PARCIAL", "NO_CUMPLIDO", "CERRADO"}
MIN_SESIONES_PORCENTAJE = 3
MIN_SESIONES_PRIORIDAD = 5
LOGO_UTECAN = Path(__file__).resolve().parent.parent / "assets" / "tutoria" / "utecan_logo.jpg"


def _autorizar(db: Session, user: Usuario):
    if not puede_gestionar_materias(db, user):
        raise HTTPException(403, "Solo Dirección de División de Carrera puede consultar este reporte")


def _ids_grupos(valor: str) -> list[int]:
    try:
        ids = list(dict.fromkeys(int(item) for item in valor.split(",") if item.strip()))
    except ValueError:
        raise HTTPException(422, "La selección de grupos no es válida")
    if not ids or len(ids) > 50:
        raise HTTPException(422, "Selecciona entre 1 y 50 grupos")
    return ids


def _nombre_alumno(alumno) -> str:
    texto = f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip()
    return " ".join(parte.capitalize() for parte in texto.split())


def _nombre_persona(valor: str) -> str:
    limpio = re.sub(r"\s*\(demo\)\s*$", "", valor or "", flags=re.IGNORECASE).strip()
    articulos = {"de", "del", "la", "las", "los", "y"}
    resultado = []
    for indice, parte in enumerate(limpio.split()):
        minuscula = parte.lower()
        if indice and minuscula in articulos:
            resultado.append(minuscula)
        elif parte.isupper() and len(parte) <= 4 and parte not in {"DE", "DEL", "LA", "LAS", "LOS"}:
            resultado.append(parte)
        else:
            resultado.append(parte.capitalize())
    return " ".join(resultado)


def _texto_presentacion(valor: Optional[str]) -> Optional[str]:
    if not valor:
        return None
    texto = re.sub(r"\s+", " ", valor.strip())
    return texto[:1].upper() + texto[1:] if texto else None


def _cantidad(cantidad: int, singular: str, plural: Optional[str] = None) -> str:
    return f"{cantidad} {singular if cantidad == 1 else (plural or singular + 's')}"


def _porcentaje(valor: Optional[float]) -> str:
    if valor is None:
        return "—"
    numero = float(valor)
    return f"{int(numero)}%" if numero.is_integer() else f"{numero:.1f}%"


def _fecha_iso(valor: str) -> datetime.date:
    return datetime.date.fromisoformat(valor)


def _rango_fecha_es(desde: str, hasta: str) -> str:
    inicio, fin = _fecha_iso(desde), _fecha_iso(hasta)
    meses = ("", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")
    if inicio.year == fin.year:
        return f"{inicio.day} de {meses[inicio.month]} al {fin.day} de {meses[fin.month]} de {fin.year}"
    return f"{inicio.day} de {meses[inicio.month]} de {inicio.year} al {fin.day} de {meses[fin.month]} de {fin.year}"


def _nivel_presentacion(valor: str) -> str:
    return (valor or "").lower().capitalize()


def _carrera_corta(valor: str) -> str:
    alto = (valor or "").upper()
    conocidos = {
        "INTELIGENCIA ARTIFICIAL": "TSU IA",
        "DESARROLLO Y GESTIÓN DE SOFTWARE": "ING. DGS",
        "DESARROLLO Y GESTION DE SOFTWARE": "ING. DGS",
        "CONTADURÍA": "CONTADURÍA",
        "CONTADURIA": "CONTADURÍA",
        "AGRICULTURA SUSTENTABLE": "AGRICULTURA",
        "PARAMÉDICO": "TSU PARAMÉDICO",
        "PARAMEDICO": "TSU PARAMÉDICO",
    }
    for clave, corto in conocidos.items():
        if clave in alto:
            return corto
    palabras = [p for p in re.findall(r"[A-ZÁÉÍÓÚÑ]+", alto) if p not in {"DE", "DEL", "EN", "Y", "LA", "EL", "SUPERIOR", "UNIVERSITARIO"}]
    return " ".join(palabras[:4]) or valor


def _limites_periodo(clave: str) -> tuple[datetime.date, datetime.date]:
    match = re.search(r"(ENE-ABR|MAY-AGO|SEP-DIC)\s+(\d{4})", (clave or "").upper())
    if not match:
        hoy = datetime.date.today()
        return hoy.replace(month=1, day=1), hoy
    bloque, anio_txt = match.groups(); anio = int(anio_txt)
    if bloque == "ENE-ABR": return datetime.date(anio, 1, 1), datetime.date(anio, 4, 30)
    if bloque == "MAY-AGO": return datetime.date(anio, 5, 1), datetime.date(anio, 8, 31)
    return datetime.date(anio, 9, 1), datetime.date(anio, 12, 31)


def _fechas_programadas(
    db: Session,
    periodo_id: int,
    carga: CargaDocente,
    inicio: datetime.date,
    fin: datetime.date,
    lectividad: dict[datetime.date, bool],
) -> int:
    if fin < inicio:
        return 0
    total = 0; fecha = inicio
    while fecha <= fin:
        if fecha not in lectividad:
            lectividad[fecha] = estado_fecha_academica(db, periodo_id, fecha)["es_lectiva"]
        if fecha.weekday() == carga.dia_semana and lectividad[fecha]:
            total += 1
        fecha += datetime.timedelta(days=1)
    return total


def _mostrar_asistencia(asistio: int, registros: int, sesiones: int) -> dict:
    porcentaje = round(asistio * 100 / registros, 1) if registros else None
    publicable = sesiones >= MIN_SESIONES_PORCENTAJE and porcentaje is not None
    return {"porcentaje": porcentaje if publicable else None, "asistio": asistio, "registros": registros,
            "sesiones_base": sesiones, "publicable": publicable,
            "texto": f"{asistio} de {registros}" if registros else "Sin registros"}


def _slug(valor: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", valor).strip("_") or "reporte_academico"


def _datos_reporte(db: Session, periodo_id: int, grupo_ids: list[int], desde: Optional[datetime.date], hasta: Optional[datetime.date]):
    periodo = db.query(PeriodoEscolar).filter(PeriodoEscolar.id == periodo_id).first()
    if not periodo:
        raise HTTPException(404, "Periodo escolar no encontrado")
    grupos = db.query(GrupoAcademico).filter(
        GrupoAcademico.id.in_(grupo_ids), GrupoAcademico.periodo_id == periodo_id,
    ).order_by(GrupoAcademico.carrera, GrupoAcademico.cuatrimestre, GrupoAcademico.grupo).all()
    if len(grupos) != len(grupo_ids):
        raise HTTPException(422, "Uno o más grupos no pertenecen al periodo seleccionado")
    periodo_inicio, periodo_fin = _limites_periodo(periodo.clave)
    inicio_reporte = max(desde or periodo_inicio, periodo_inicio)
    fin_reporte = min(hasta or periodo_fin, periodo_fin, datetime.date.today())

    cargas = db.query(CargaDocente).filter(
        CargaDocente.periodo_id == periodo_id,
        CargaDocente.grupo_academico_id.in_(grupo_ids),
        CargaDocente.tipo_actividad == "CLASE",
        CargaDocente.activo == True,
    ).all()
    carga_ids = [c.id for c in cargas]
    clases_q = db.query(ClaseDocente).filter(
        ClaseDocente.carga_docente_id.in_(carga_ids), ClaseDocente.estado == "CERRADA",
    )
    if desde:
        clases_q = clases_q.filter(ClaseDocente.fecha >= desde)
    if hasta:
        clases_q = clases_q.filter(ClaseDocente.fecha <= hasta)
    clases = clases_q.order_by(ClaseDocente.fecha.desc()).all()
    clase_ids = [c.id for c in clases]
    correcciones = db.query(CorreccionAsistenciaDocente).filter(
        CorreccionAsistenciaDocente.clase_docente_id.in_(clase_ids),
    ).all() if clase_ids else []
    asistencias = db.query(AsistenciaDocente).filter(AsistenciaDocente.clase_docente_id.in_(clase_ids)).all() if clase_ids else []
    seguimientos = db.query(SeguimientoAlumnoDocente).filter(
        SeguimientoAlumnoDocente.carga_docente_id.in_(carga_ids),
        SeguimientoAlumnoDocente.tipo != "CALIFICACION",
    ).all() if carga_ids else []
    inscripciones = db.query(InscripcionAlumno).filter(
        InscripcionAlumno.grupo_academico_id.in_(grupo_ids), InscripcionAlumno.estado == "ACTIVO",
    ).all()

    carga_por_id = {c.id: c for c in cargas}
    alumno_grupo = {i.alumno_id: i.grupo_academico_id for i in inscripciones}
    alumnos = {i.alumno_id: i.alumno for i in inscripciones}
    asistencias_alumno = defaultdict(list)
    for item in asistencias:
        asistencias_alumno[item.alumno_id].append(item.estado)
    seguimientos_alumno = defaultdict(list)
    for item in seguimientos:
        seguimientos_alumno[item.alumno_id].append(item)

    materias_map = {}
    for carga in cargas:
        key = (carga.grupo_academico_id, carga.materia_id or carga.actividad_nombre, carga.docente_id)
        materias_map.setdefault(key, {"cargas": [], "clases": []})["cargas"].append(carga)
    for clase in clases:
        carga = carga_por_id[clase.carga_docente_id]
        key = (carga.grupo_academico_id, carga.materia_id or carga.actividad_nombre, carga.docente_id)
        materias_map.setdefault(key, {"cargas": [carga], "clases": []})["clases"].append(clase)

    materias = []
    lectividad: dict[datetime.date, bool] = {}
    for bloque in materias_map.values():
        carga = bloque["cargas"][0]
        sesiones = bloque["clases"]
        ids = {c.id for c in sesiones}
        estados = [a.estado for a in asistencias if a.clase_docente_id in ids]
        asistio = sum(1 for e in estados if e in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
        programadas = sum(
            _fechas_programadas(db, periodo_id, item, inicio_reporte, fin_reporte, lectividad)
            for item in bloque["cargas"]
        )
        cobertura = round(len(sesiones) * 100 / programadas, 1) if programadas else None
        ultima = max(sesiones, key=lambda c: c.fecha) if sesiones else None
        avances = [c.avance_planeacion for c in sesiones if c.avance_planeacion is not None]
        asistencia_info = _mostrar_asistencia(asistio, len(estados), len(sesiones))
        materias.append({
            "grupo_id": carga.grupo_academico_id,
            "materia": carga.actividad_nombre,
            "docente": _nombre_persona(carga.docente.nombre) if carga.docente else "Sin docente",
            "sesiones": len(sesiones), "sesiones_programadas": programadas, "cobertura": cobertura,
            "asistencia": asistencia_info["porcentaje"], "asistencia_detalle": asistencia_info,
            "avance_sesion": round(sum(avances) / len(avances), 1) if avances else None,
            "ultimo_tema": _texto_presentacion(ultima.tema_impartido) if ultima else None,
            "pendiente": _texto_presentacion(ultima.tema_pendiente) if ultima else None,
            "extemporaneas": sum(1 for c in sesiones if c.es_extemporanea),
            "corregidas": len({r.clase_docente_id for r in correcciones if r.clase_docente_id in ids}),
        })

    alumnos_atencion = []
    for alumno_id, alumno in alumnos.items():
        estados = asistencias_alumno[alumno_id]
        asistio = sum(1 for e in estados if e in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
        porcentaje = round(asistio * 100 / len(estados), 1) if estados else None
        abiertos = [s for s in seguimientos_alumno[alumno_id] if s.estado not in ESTADOS_CERRADOS]
        faltas = estados.count("FALTA")
        if faltas or abiertos:
            sesiones_base = len(estados)
            if sesiones_base < MIN_SESIONES_PORCENTAJE and not abiertos:
                nivel = "DATOS INSUFICIENTES"
            elif len(abiertos) >= 2 or (sesiones_base >= MIN_SESIONES_PRIORIDAD and porcentaje is not None and porcentaje < 80):
                nivel = "PRIORITARIO"
            elif abiertos or (sesiones_base >= MIN_SESIONES_PORCENTAJE and porcentaje is not None and porcentaje < 85):
                nivel = "ATENCIÓN"
            else:
                nivel = "OBSERVACIÓN"
            alumnos_atencion.append({
                "grupo_id": alumno_grupo.get(alumno_id), "alumno_id": alumno_id,
                "matricula": alumno.matricula, "nombre": _nombre_alumno(alumno),
                "asistencia": porcentaje if sesiones_base >= MIN_SESIONES_PORCENTAJE else None,
                "asistencias_registradas": asistio, "registros": sesiones_base,
                "faltas": faltas, "seguimientos_abiertos": len(abiertos), "nivel": nivel,
            })

    incidencias = [{
        "grupo_id": carga_por_id[c.carga_docente_id].grupo_academico_id,
        "fecha": c.fecha.isoformat(), "materia": carga_por_id[c.carga_docente_id].actividad_nombre,
        "docente": _nombre_persona(carga_por_id[c.carga_docente_id].docente.nombre) if carga_por_id[c.carga_docente_id].docente else "",
        "tipo": (c.incidencia_tipo or "OTRA").replace("_", " ").title(),
        "descripcion": _texto_presentacion(c.incidencias), "requiere_seguimiento": c.incidencia_requiere_seguimiento,
    } for c in clases if c.incidencias]

    observaciones = [{
        "grupo_id": carga_por_id[c.carga_docente_id].grupo_academico_id,
        "fecha": c.fecha.isoformat(), "materia": carga_por_id[c.carga_docente_id].actividad_nombre,
        "docente": _nombre_persona(carga_por_id[c.carga_docente_id].docente.nombre) if carga_por_id[c.carga_docente_id].docente else "",
        "tema": _texto_presentacion(c.tema_impartido), "actividades": _texto_presentacion(c.actividades_realizadas), "pendiente": _texto_presentacion(c.tema_pendiente),
    } for c in clases if c.tema_impartido or c.actividades_realizadas or c.tema_pendiente]

    grupos_json = []
    for grupo in grupos:
        inscritos = [i for i in inscripciones if i.grupo_academico_id == grupo.id]
        mats = [m for m in materias if m["grupo_id"] == grupo.id]
        estados = [a.estado for a in asistencias if alumno_grupo.get(a.alumno_id) == grupo.id]
        asistio = sum(1 for e in estados if e in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
        sesiones_registradas = sum(m["sesiones"] for m in mats)
        sesiones_programadas = sum(m["sesiones_programadas"] for m in mats)
        asistencia_info = _mostrar_asistencia(asistio, len(estados), sesiones_registradas)
        grupos_json.append({
            "id": grupo.id, "nombre": f"{grupo.cuatrimestre}° {grupo.grupo}", "carrera": grupo.carrera,
            "carrera_corta": _carrera_corta(grupo.carrera),
            "alumnos": len(inscritos), "materias": len(mats),
            "sesiones": sesiones_registradas, "sesiones_programadas": sesiones_programadas,
            "cobertura": round(sesiones_registradas * 100 / sesiones_programadas, 1) if sesiones_programadas else None,
            "asistencia": asistencia_info["porcentaje"], "asistencia_detalle": asistencia_info,
            "incidencias": sum(1 for i in incidencias if i["grupo_id"] == grupo.id),
            "alumnos_atencion": sum(1 for a in alumnos_atencion if a["grupo_id"] == grupo.id),
        })

    total_estados = [a.estado for a in asistencias]
    total_asistio = sum(1 for e in total_estados if e in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
    programadas_total = sum(m["sesiones_programadas"] for m in materias)
    asistencia_general = _mostrar_asistencia(total_asistio, len(total_estados), len(clases))
    sesiones_especiales = [{
        "grupo_id": carga_por_id[c.carga_docente_id].grupo_academico_id,
        "fecha": c.fecha.isoformat(), "materia": carga_por_id[c.carga_docente_id].actividad_nombre,
        "docente": _nombre_persona(carga_por_id[c.carga_docente_id].docente.nombre) if carga_por_id[c.carga_docente_id].docente else "",
        "extemporanea": c.es_extemporanea, "motivo_extemporaneo": c.motivo_extemporaneo,
        "correcciones": sum(1 for r in correcciones if r.clase_docente_id == c.id),
    } for c in clases if c.es_extemporanea or any(r.clase_docente_id == c.id for r in correcciones)]
    return {
        "periodo": {"id": periodo.id, "clave": periodo.clave},
        "filtros": {"desde": inicio_reporte.isoformat(), "hasta": fin_reporte.isoformat()},
        "resumen": {"grupos": len(grupos), "alumnos": len(alumnos), "materias": len(materias),
                    "sesiones": len(clases), "sesiones_programadas": programadas_total,
                    "cobertura": round(len(clases) * 100 / programadas_total, 1) if programadas_total else None,
                    "asistencia": asistencia_general["porcentaje"], "asistencia_detalle": asistencia_general,
                    "incidencias": len(incidencias), "alumnos_atencion": len(alumnos_atencion)},
        "grupos": grupos_json, "materias": materias,
        "alumnos_atencion": sorted(alumnos_atencion, key=lambda a: (a["nivel"] != "PRIORITARIO", a["nombre"])),
        "incidencias": incidencias, "observaciones_academicas": observaciones,
        "sesiones_especiales": sesiones_especiales,
        "criterios": {"min_sesiones_porcentaje": MIN_SESIONES_PORCENTAJE, "min_sesiones_prioridad": MIN_SESIONES_PRIORIDAD,
                      "meta_institucional": None,
                      "niveles": "Datos insuficientes: menos de 3 registros sin seguimiento; Atención: seguimiento abierto o asistencia menor a 85% con 3 sesiones; Prioritario: dos seguimientos abiertos o asistencia menor a 80% con 5 sesiones."},
        "privacidad": "Documento de uso interno. Contiene datos personales. Incluye únicamente información académica y de asistencia; los seguimientos de carácter personal se consultan en el módulo de Tutoría con los permisos correspondientes.",
    }


@router.get("/catalogos")
def catalogos(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _autorizar(db, current_user)
    periodos = db.query(PeriodoEscolar).order_by(PeriodoEscolar.id.desc()).all()
    grupos = db.query(GrupoAcademico).filter(GrupoAcademico.activo == True).order_by(
        GrupoAcademico.periodo_id.desc(), GrupoAcademico.carrera, GrupoAcademico.cuatrimestre, GrupoAcademico.grupo,
    ).all()
    return {"periodos": [{"id": p.id, "clave": p.clave, "es_actual": p.es_actual} for p in periodos],
            "grupos": [{"id": g.id, "periodo_id": g.periodo_id, "carrera": g.carrera,
                        "nombre": f"{g.cuatrimestre}° {g.grupo}", "turno": g.turno} for g in grupos]}


@router.get("")
def consultar(periodo_id: int, grupos: str, desde: Optional[datetime.date] = None, hasta: Optional[datetime.date] = None,
              db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _autorizar(db, current_user)
    if desde and hasta and hasta < desde:
        raise HTTPException(422, "La fecha final debe ser igual o posterior a la inicial")
    return _datos_reporte(db, periodo_id, _ids_grupos(grupos), desde, hasta)


def _excel(data: dict) -> io.BytesIO:
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    encabezado = PatternFill("solid", fgColor="0F766E")
    def hoja(nombre, columnas, filas):
        ws = wb.create_sheet(nombre); ws.append(columnas)
        for fila in filas: ws.append(fila)
        for c in ws[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = encabezado; c.alignment = Alignment(wrap_text=True)
        ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions
        for i, col in enumerate(columnas, 1): ws.column_dimensions[get_column_letter(i)].width = min(45, max(13, len(col) + 3))
        return ws
    r = data["resumen"]
    hoja("Resumen", ["Indicador", "Valor"], [["Periodo", data["periodo"]["clave"]], ["Alcance", f'{_cantidad(r["grupos"], "grupo")}, {_cantidad(r["alumnos"], "alumno")} y {_cantidad(r["materias"], "materia")}'], ["Sesiones registradas / programadas", f'{r["sesiones"]} / {r["sesiones_programadas"]}' if r["sesiones_programadas"] else "Programación no disponible"], ["Cobertura del registro (%)", r["cobertura"] if r["sesiones_programadas"] else "Programación no disponible"], ["Asistencias registradas", r["asistencia_detalle"]["texto"]], ["Porcentaje de asistencia", r["asistencia"] if r["asistencia_detalle"]["publicable"] else "Datos insuficientes"], ["Incidencias", r["incidencias"]], ["Alumnos con indicador de atención", r["alumnos_atencion"]], ["Criterios", data["criterios"]["niveles"]], ["Privacidad", data["privacidad"]]])
    grupos = {g["id"]: f'{g["nombre"]} · {g["carrera_corta"]}' for g in data["grupos"]}
    hoja("Grupos", ["Grupo", "Alumnos", "Materias", "Sesiones registradas", "Sesiones programadas", "Cobertura (%)", "Asistencia", "Incidencias", "Alumnos con indicador"], [[grupos[g["id"]], g["alumnos"], g["materias"], g["sesiones"], g["sesiones_programadas"], g["cobertura"], g["asistencia"] if g["asistencia_detalle"]["publicable"] else g["asistencia_detalle"]["texto"], g["incidencias"], g["alumnos_atencion"]] for g in data["grupos"]])
    hoja("Materias", ["Grupo", "Materia", "Docente", "Sesiones registradas", "Sesiones programadas", "Cobertura (%)", "Asistencia", "Cumplimiento declarado por el docente (%)", "Último tema", "Pendiente", "Extemporáneas", "Corregidas"], [[grupos[m["grupo_id"]], m["materia"], m["docente"], m["sesiones"], m["sesiones_programadas"], m["cobertura"], m["asistencia"] if m["asistencia_detalle"]["publicable"] else m["asistencia_detalle"]["texto"], m["avance_sesion"], m["ultimo_tema"], m["pendiente"], m["extemporaneas"], m["corregidas"]] for m in data["materias"]])
    hoja("Alumnos con indicador", ["Grupo", "Matrícula", "Alumno", "Asistencias / registros", "% asistencia", "Faltas", "Seguimientos abiertos", "Nivel"], [[grupos.get(a["grupo_id"], ""), a["matricula"], a["nombre"], f'{a["asistencias_registradas"]} / {a["registros"]}', a["asistencia"] if a["asistencia"] is not None else "Datos insuficientes", a["faltas"], a["seguimientos_abiertos"], _nivel_presentacion(a["nivel"])] for a in data["alumnos_atencion"]])
    hoja("Incidencias", ["Grupo", "Fecha", "Materia", "Docente", "Tipo", "Descripción", "Seguimiento"], [[grupos.get(i["grupo_id"], ""), format_fecha_corta_mx(_fecha_iso(i["fecha"])), i["materia"], i["docente"], i["tipo"], i["descripcion"], "Sí" if i["requiere_seguimiento"] else "No"] for i in data["incidencias"]])
    hoja("Observaciones académicas", ["Grupo", "Fecha", "Materia", "Docente", "Tema", "Actividades", "Pendiente"], [[grupos.get(o["grupo_id"], ""), format_fecha_corta_mx(_fecha_iso(o["fecha"])), o["materia"], o["docente"], o["tema"], o["actividades"], o["pendiente"]] for o in data["observaciones_academicas"]])
    hoja("Registros especiales", ["Grupo", "Fecha", "Materia", "Docente", "Extemporánea", "Motivo", "Movimientos de corrección"], [[grupos.get(s["grupo_id"], ""), format_fecha_corta_mx(_fecha_iso(s["fecha"])), s["materia"], s["docente"], "Sí" if s["extemporanea"] else "No", s["motivo_extemporaneo"], s["correcciones"]] for s in data["sesiones_especiales"]])
    salida = io.BytesIO(); wb.save(salida); salida.seek(0); return salida


@router.get("/exportar.xlsx")
def exportar_excel(periodo_id: int, grupos: str, desde: Optional[datetime.date] = None, hasta: Optional[datetime.date] = None,
                   db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _autorizar(db, current_user); data = _datos_reporte(db, periodo_id, _ids_grupos(grupos), desde, hasta)
    nombre = _slug(f'Reporte_academico_{data["periodo"]["clave"]}')
    return StreamingResponse(_excel(data), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{nombre}.xlsx"'})


def _canvas_numerado(folio: str, generado: str):
    class CanvasNumerado(Canvas):
        def __init__(self, *args, **kwargs):
            Canvas.__init__(self, *args, **kwargs); self._paginas = []
        def showPage(self):
            self._paginas.append(dict(self.__dict__)); self._startPage()
        def save(self):
            total = len(self._paginas)
            for estado in self._paginas:
                self.__dict__.update(estado); self.setStrokeColor(colors.HexColor("#0F766E")); self.setLineWidth(1.2)
                self.line(1.2*cm, 1.02*cm, landscape(letter)[0]-1.2*cm, 1.02*cm)
                self.setFillColor(colors.HexColor("#334155")); self.setFont("Helvetica", 6.3)
                self.drawString(1.2*cm, .70*cm, f"UTECAN · SIGA · Folio {folio}")
                self.drawCentredString(landscape(letter)[0]/2, .70*cm, generado)
                self.drawRightString(landscape(letter)[0]-1.2*cm, .70*cm, f"Página {self._pageNumber} de {total}")
                self.setFont("Helvetica", 5.8); self.drawString(1.2*cm, .43*cm, "Documento de uso interno. Contiene datos personales. Información académica y de asistencia; los seguimientos personales se consultan en Tutoría con los permisos correspondientes.")
                Canvas.showPage(self)
            Canvas.save(self)
    return CanvasNumerado


def _pdf(data: dict, usuario: Usuario) -> tuple[io.BytesIO, str]:
    ahora = now_mx()
    periodo_corto = re.sub(r"[^A-Z0-9]", "", data["periodo"]["clave"].upper())
    folio = f"RA-{periodo_corto}-{ahora.strftime('%Y%m%d-%H%M%S')}-{usuario.id:04d}"
    cargo = usuario.departamento.nombre if getattr(usuario, "departamento", None) else "Dirección de División de Carrera"
    responsable = _nombre_persona(usuario.nombre)
    generado = f"Generado {ahora.strftime('%d/%m/%Y %H:%M')} (hora de Campeche) por {responsable}"
    salida = io.BytesIO(); styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Institucion", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=colors.HexColor("#0F172A"), alignment=TA_LEFT, spaceAfter=2))
    styles.add(ParagraphStyle(name="Division", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=colors.HexColor("#0F766E"), spaceAfter=7))
    styles.add(ParagraphStyle(name="TituloReporte", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=colors.HexColor("#0F172A"), spaceAfter=7))
    styles.add(ParagraphStyle(name="Seccion", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=colors.HexColor("#0F172A"), spaceBefore=8, spaceAfter=4, borderColor=colors.HexColor("#0F766E"), borderWidth=0, borderPadding=0))
    styles.add(ParagraphStyle(name="Celda", parent=styles["BodyText"], fontName="Helvetica", fontSize=6.7, leading=8.2, textColor=colors.HexColor("#1E293B")))
    styles.add(ParagraphStyle(name="CeldaBold", parent=styles["Celda"], fontName="Helvetica-Bold"))
    styles.add(ParagraphStyle(name="Nota", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#475569")))
    doc = SimpleDocTemplate(salida, pagesize=landscape(letter), rightMargin=1.2*cm, leftMargin=1.2*cm, topMargin=1.05*cm, bottomMargin=1.35*cm, title="Reporte académico de grupos", author=responsable, subject="Seguimiento académico de Dirección de División de Carrera")
    P=lambda valor, estilo="Celda": Paragraph(escape(str(valor if valor not in (None, "") else "—")), styles[estilo])
    def tabla(filas, anchos=None, alinear_numeros=False):
        contenido=[[P(c,"CeldaBold" if ri==0 else "Celda") for c in fila] for ri,fila in enumerate(filas)]
        t=Table(contenido, repeatRows=1, colWidths=anchos, hAlign="LEFT")
        comandos=[("TEXTCOLOR",(0,0),(-1,0),colors.HexColor("#0F172A")),("LINEBELOW",(0,0),(-1,0),1.5,colors.HexColor("#0F766E")),("LINEBELOW",(0,1),(-1,-1),.25,colors.HexColor("#E2E8F0")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]
        for fila in range(2,len(filas),2): comandos.append(("BACKGROUND",(0,fila),(-1,fila),colors.HexColor("#F8FAFC")))
        if alinear_numeros: comandos.append(("ALIGN",(2,1),(-1,-1),"CENTER"))
        t.setStyle(TableStyle(comandos)); return t

    grupos_n={g["id"]:f'{g["nombre"]} · {g["carrera_corta"]}' for g in data["grupos"]}
    alcance=", ".join(grupos_n[g["id"]] for g in data["grupos"])
    r=data["resumen"]; asistencia_general = _porcentaje(r["asistencia"]) if r["asistencia_detalle"]["publicable"] else f'{r["asistencia_detalle"]["texto"]} asistencias registradas (muestra insuficiente para porcentaje)'
    membrete_texto = [Paragraph("UNIVERSIDAD TECNOLÓGICA DE CANDELARIA",styles["Institucion"]),Paragraph("Dirección de División de Carrera",styles["Division"]),Paragraph("Reporte académico de grupos",styles["TituloReporte"])]
    if LOGO_UTECAN.exists():
        logo = Image(str(LOGO_UTECAN), width=5.4*cm, height=1.71*cm)
        membrete = Table([[logo, membrete_texto]], colWidths=[5.8*cm, 20.2*cm], style=TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)]))
    else:
        membrete = Table([[membrete_texto]], colWidths=[26*cm])
    story=[membrete,Spacer(1,5),Table([[P("Folio","CeldaBold"),P(folio),P("Periodo","CeldaBold"),P(data["periodo"]["clave"]),P("Rango","CeldaBold"),P(_rango_fecha_es(data["filtros"]["desde"], data["filtros"]["hasta"]))],[P("Generó","CeldaBold"),P(responsable),P("Cargo","CeldaBold"),P(cargo),P("Alcance","CeldaBold"),P(alcance)]],colWidths=[1.6*cm,5.0*cm,1.6*cm,4.0*cm,1.6*cm,11.2*cm],hAlign="LEFT"),Spacer(1,7)]
    cobertura = (f'{r["sesiones"]} de {r["sesiones_programadas"]} sesiones programadas ({_porcentaje(r["cobertura"])})' if r["sesiones_programadas"] else "Programación no disponible; no se calcula cobertura")
    story += [Paragraph("Resumen ejecutivo",styles["Seccion"]), tabla([["Indicador","Resultado"],["Cobertura del registro",cobertura],["Asistencia observada",asistencia_general],["Alcance académico",f'{_cantidad(r["grupos"], "grupo")}, {_cantidad(r["alumnos"], "alumno")} y {_cantidad(r["materias"], "materia")}'],["Situaciones registradas",f'{_cantidad(r["incidencias"], "incidencia")} y {_cantidad(r["alumnos_atencion"], "alumno")} con indicador de seguimiento']], [5.2*cm,20.8*cm]),Paragraph("Referencia institucional: no se encuentra configurada; el reporte no califica el resultado contra una meta oficial.",styles["Nota"])]
    for g in data["grupos"]:
        filas=[["Materia","Docente","Sesiones reg./prog.","Cobertura","Asistencia","Cumplimiento declarado por el docente","Último tema","Pendiente"]]
        for m in data["materias"]:
            if m["grupo_id"] != g["id"]: continue
            asistencia = _porcentaje(m["asistencia"]) if m["asistencia_detalle"]["publicable"] else f'{m["asistencia_detalle"]["texto"]} (muestra insuficiente)'
            sesiones = f'{m["sesiones"]}/{m["sesiones_programadas"]}' if m["sesiones_programadas"] else f'{m["sesiones"]}/—'
            filas.append([m["materia"],m["docente"],sesiones,_porcentaje(m["cobertura"]),asistencia,_porcentaje(m["avance_sesion"]),m["ultimo_tema"],m["pendiente"]])
        bloque=[Paragraph(f'{escape(g["nombre"])} · {escape(g["carrera_corta"])}',styles["Seccion"]),tabla(filas,[3.5*cm,3.5*cm,2.0*cm,1.8*cm,3.3*cm,2.4*cm,4.8*cm,4.8*cm])]
        story.append(KeepTogether(bloque) if len(filas)<=3 else bloque[0]);
        if len(filas)>3: story.append(bloque[1])
    if data["alumnos_atencion"]:
        story.append(Paragraph("Alumnos con indicador académico",styles["Seccion"])); filas=[["Grupo","Matrícula","Alumno","Asistencias / registros","Faltas","Seguimientos","Clasificación"]]
        for a in data["alumnos_atencion"]: filas.append([grupos_n.get(a["grupo_id"],""),a["matricula"],a["nombre"],f'{a["asistencias_registradas"]}/{a["registros"]}',a["faltas"],a["seguimientos_abiertos"],_nivel_presentacion(a["nivel"])])
        criterios = ["1. Datos insuficientes: menos de 3 registros y sin seguimiento abierto.", "2. Atención: seguimiento abierto o asistencia menor a 85% con al menos 3 sesiones.", "3. Prioritario: dos seguimientos abiertos o asistencia menor a 80% con al menos 5 sesiones."]
        notas_criterios = Table([[Paragraph(texto,styles["Nota"])] for texto in criterios],colWidths=[22*cm],style=TableStyle([("TOPPADDING",(0,0),(-1,-1),1),("BOTTOMPADDING",(0,0),(-1,-1),1),("LEFTPADDING",(0,0),(-1,-1),0)]))
        story += [tabla(filas,[3.2*cm,2.3*cm,5.2*cm,3.0*cm,1.4*cm,2.2*cm,3.4*cm]),KeepTogether([notas_criterios])]
    if data["sesiones_especiales"]:
        story.append(Paragraph("Sesiones con registro extemporáneo o corregido",styles["Seccion"])); filas=[["Grupo","Fecha","Materia","Docente","Registro","Motivo / movimientos"]]
        for s in data["sesiones_especiales"]: filas.append([grupos_n.get(s["grupo_id"],""),format_fecha_corta_mx(_fecha_iso(s["fecha"])),s["materia"],s["docente"],"Extemporáneo" if s["extemporanea"] else "Corrección",s["motivo_extemporaneo"] or f'{_cantidad(s["correcciones"], "movimiento")} de auditoría'])
        story.append(tabla(filas,[3.2*cm,2.1*cm,4.0*cm,4.0*cm,2.3*cm,9.0*cm]))
    if data["observaciones_academicas"]:
        story.append(Paragraph("Registro académico de las sesiones",styles["Seccion"])); filas=[["Grupo / fecha","Materia / docente","Tema y actividades","Pendiente"]]
        for o in data["observaciones_academicas"]: filas.append([f'{grupos_n.get(o["grupo_id"],"")} · {format_fecha_corta_mx(_fecha_iso(o["fecha"]))}',f'{o["materia"]} · {o["docente"]}'," · ".join(x for x in [o["tema"],o["actividades"]] if x),o["pendiente"]])
        story.append(tabla(filas,[4.6*cm,5.2*cm,9.0*cm,7.2*cm]))
    if data["incidencias"]:
        story.append(Paragraph("Incidencias generales",styles["Seccion"])); filas=[["Grupo / fecha","Materia / docente","Tipo","Descripción","Seguimiento"]]
        for i in data["incidencias"]: filas.append([f'{grupos_n.get(i["grupo_id"],"")} · {format_fecha_corta_mx(_fecha_iso(i["fecha"]))}',f'{i["materia"]} · {i["docente"]}',_nivel_presentacion(i["tipo"]),i["descripcion"],"Canalizada" if i["requiere_seguimiento"] else "Solo registro"])
        story.append(tabla(filas,[4.6*cm,5.2*cm,2.8*cm,10.2*cm,2.5*cm]))
    story += [Spacer(1,14),Table([["________________________________", "________________________________"],["Elaboró", "Vo.Bo."],[responsable, "Dirección Académica"],[cargo, ""]],colWidths=[10*cm,10*cm],hAlign="CENTER",style=TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER"),("FONTSIZE",(0,0),(-1,-1),7),("TEXTCOLOR",(0,0),(-1,-1),colors.HexColor("#475569")),("TOPPADDING",(0,0),(-1,-1),3)]))]
    doc.build(story,canvasmaker=_canvas_numerado(folio, generado)); salida.seek(0); return salida, folio


@router.get("/exportar.pdf")
def exportar_pdf(periodo_id: int, grupos: str, desde: Optional[datetime.date] = None, hasta: Optional[datetime.date] = None,
                 db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _autorizar(db, current_user); data = _datos_reporte(db, periodo_id, _ids_grupos(grupos), desde, hasta)
    salida, folio = _pdf(data, current_user)
    nombre = _slug(f'Reporte_academico_{data["periodo"]["clave"]}_{today_mx().isoformat()}')
    return StreamingResponse(salida,media_type="application/pdf",headers={"Content-Disposition":f'attachment; filename="{nombre}.pdf"', "X-Reporte-Folio": folio})
