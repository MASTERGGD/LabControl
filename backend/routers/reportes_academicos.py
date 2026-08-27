import datetime
import io
import re
from collections import defaultdict
from typing import Optional
from xml.sax.saxutils import escape

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models.catalogo import GrupoAcademico, InscripcionAlumno, PeriodoEscolar
from models.docencia import AsistenciaDocente, CargaDocente, ClaseDocente, SeguimientoAlumnoDocente
from models.usuario import Usuario
from services.user_permissions import puede_gestionar_materias


router = APIRouter(prefix="/reportes-academicos", tags=["Reportes académicos"])
ESTADOS_CERRADOS = {"ATENDIDO", "CUMPLIDO", "CUMPLIDO_PARCIAL", "NO_CUMPLIDO", "CERRADO"}


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
    return f"{alumno.apellido_paterno} {alumno.apellido_materno} {alumno.nombres}".strip()


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
    asistencias = db.query(AsistenciaDocente).filter(AsistenciaDocente.clase_docente_id.in_(clase_ids)).all() if clase_ids else []
    seguimientos = db.query(SeguimientoAlumnoDocente).filter(
        SeguimientoAlumnoDocente.carga_docente_id.in_(carga_ids),
        SeguimientoAlumnoDocente.tipo != "CALIFICACION",
    ).all() if carga_ids else []
    inscripciones = db.query(InscripcionAlumno).filter(
        InscripcionAlumno.grupo_academico_id.in_(grupo_ids), InscripcionAlumno.estado == "ACTIVO",
    ).all()

    carga_por_id = {c.id: c for c in cargas}
    clase_por_id = {c.id: c for c in clases}
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
    for bloque in materias_map.values():
        carga = bloque["cargas"][0]
        sesiones = bloque["clases"]
        ids = {c.id for c in sesiones}
        estados = [a.estado for a in asistencias if a.clase_docente_id in ids]
        asistio = sum(1 for e in estados if e in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
        ultima = max(sesiones, key=lambda c: c.fecha) if sesiones else None
        avances = [c.avance_planeacion for c in sesiones if c.avance_planeacion is not None]
        materias.append({
            "grupo_id": carga.grupo_academico_id,
            "materia": carga.actividad_nombre,
            "docente": carga.docente.nombre if carga.docente else "Sin docente",
            "sesiones": len(sesiones),
            "asistencia": round(asistio * 100 / len(estados), 1) if estados else None,
            "avance": round(sum(avances) / len(avances), 1) if avances else None,
            "ultimo_tema": ultima.tema_impartido if ultima else None,
            "pendiente": ultima.tema_pendiente if ultima else None,
        })

    alumnos_atencion = []
    for alumno_id, alumno in alumnos.items():
        estados = asistencias_alumno[alumno_id]
        asistio = sum(1 for e in estados if e in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
        porcentaje = round(asistio * 100 / len(estados), 1) if estados else None
        abiertos = [s for s in seguimientos_alumno[alumno_id] if s.estado not in ESTADOS_CERRADOS]
        faltas = estados.count("FALTA")
        if faltas or abiertos:
            alumnos_atencion.append({
                "grupo_id": alumno_grupo.get(alumno_id), "alumno_id": alumno_id,
                "matricula": alumno.matricula, "nombre": _nombre_alumno(alumno),
                "asistencia": porcentaje, "faltas": faltas, "seguimientos_abiertos": len(abiertos),
                "nivel": "PRIORITARIO" if (porcentaje is not None and porcentaje < 80) or len(abiertos) >= 2 else "ATENCIÓN",
            })

    incidencias = [{
        "grupo_id": carga_por_id[c.carga_docente_id].grupo_academico_id,
        "fecha": c.fecha.isoformat(), "materia": carga_por_id[c.carga_docente_id].actividad_nombre,
        "docente": carga_por_id[c.carga_docente_id].docente.nombre if carga_por_id[c.carga_docente_id].docente else "",
        "tipo": (c.incidencia_tipo or "OTRA").replace("_", " ").title(),
        "descripcion": c.incidencias, "requiere_seguimiento": c.incidencia_requiere_seguimiento,
    } for c in clases if c.incidencias]

    observaciones = [{
        "grupo_id": carga_por_id[c.carga_docente_id].grupo_academico_id,
        "fecha": c.fecha.isoformat(), "materia": carga_por_id[c.carga_docente_id].actividad_nombre,
        "docente": carga_por_id[c.carga_docente_id].docente.nombre if carga_por_id[c.carga_docente_id].docente else "",
        "tema": c.tema_impartido, "actividades": c.actividades_realizadas, "pendiente": c.tema_pendiente,
    } for c in clases if c.tema_impartido or c.actividades_realizadas or c.tema_pendiente]

    grupos_json = []
    for grupo in grupos:
        inscritos = [i for i in inscripciones if i.grupo_academico_id == grupo.id]
        mats = [m for m in materias if m["grupo_id"] == grupo.id]
        estados = [a.estado for a in asistencias if alumno_grupo.get(a.alumno_id) == grupo.id]
        asistio = sum(1 for e in estados if e in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
        grupos_json.append({
            "id": grupo.id, "nombre": f"{grupo.cuatrimestre}° {grupo.grupo}", "carrera": grupo.carrera,
            "alumnos": len(inscritos), "materias": len(mats),
            "sesiones": sum(m["sesiones"] for m in mats),
            "asistencia": round(asistio * 100 / len(estados), 1) if estados else None,
            "incidencias": sum(1 for i in incidencias if i["grupo_id"] == grupo.id),
            "alumnos_atencion": sum(1 for a in alumnos_atencion if a["grupo_id"] == grupo.id),
        })

    total_estados = [a.estado for a in asistencias]
    total_asistio = sum(1 for e in total_estados if e in {"PRESENTE", "RETARDO", "JUSTIFICADA"})
    return {
        "periodo": {"id": periodo.id, "clave": periodo.clave},
        "filtros": {"desde": desde.isoformat() if desde else None, "hasta": hasta.isoformat() if hasta else None},
        "resumen": {"grupos": len(grupos), "alumnos": len(alumnos), "materias": len(materias),
                    "sesiones": len(clases), "asistencia": round(total_asistio * 100 / len(total_estados), 1) if total_estados else None,
                    "incidencias": len(incidencias), "alumnos_atencion": len(alumnos_atencion)},
        "grupos": grupos_json, "materias": materias,
        "alumnos_atencion": sorted(alumnos_atencion, key=lambda a: (a["nivel"] != "PRIORITARIO", a["nombre"])),
        "incidencias": incidencias, "observaciones_academicas": observaciones,
        "privacidad": "No incluye notas privadas, diagnósticos médicos ni detalles confidenciales del expediente.",
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
    hoja("Resumen", ["Indicador", "Valor"], [["Periodo", data["periodo"]["clave"]], ["Grupos", r["grupos"]], ["Alumnos", r["alumnos"]], ["Materias", r["materias"]], ["Sesiones", r["sesiones"]], ["Asistencia promedio", r["asistencia"]], ["Incidencias", r["incidencias"]], ["Alumnos en atención", r["alumnos_atencion"]], ["Privacidad", data["privacidad"]]])
    grupos = {g["id"]: f'{g["nombre"]} · {g["carrera"]}' for g in data["grupos"]}
    hoja("Grupos", ["Grupo", "Alumnos", "Materias", "Sesiones", "% asistencia", "Incidencias", "Alumnos en atención"], [[grupos[g["id"]], g["alumnos"], g["materias"], g["sesiones"], g["asistencia"], g["incidencias"], g["alumnos_atencion"]] for g in data["grupos"]])
    hoja("Materias", ["Grupo", "Materia", "Docente", "Sesiones", "% asistencia", "% avance", "Último tema", "Pendiente"], [[grupos[m["grupo_id"]], m["materia"], m["docente"], m["sesiones"], m["asistencia"], m["avance"], m["ultimo_tema"], m["pendiente"]] for m in data["materias"]])
    hoja("Alumnos en atención", ["Grupo", "Matrícula", "Alumno", "% asistencia", "Faltas", "Seguimientos abiertos", "Nivel"], [[grupos.get(a["grupo_id"], ""), a["matricula"], a["nombre"], a["asistencia"], a["faltas"], a["seguimientos_abiertos"], a["nivel"]] for a in data["alumnos_atencion"]])
    hoja("Incidencias", ["Grupo", "Fecha", "Materia", "Docente", "Tipo", "Descripción", "Seguimiento"], [[grupos.get(i["grupo_id"], ""), i["fecha"], i["materia"], i["docente"], i["tipo"], i["descripcion"], "Sí" if i["requiere_seguimiento"] else "No"] for i in data["incidencias"]])
    hoja("Observaciones académicas", ["Grupo", "Fecha", "Materia", "Docente", "Tema", "Actividades", "Pendiente"], [[grupos.get(o["grupo_id"], ""), o["fecha"], o["materia"], o["docente"], o["tema"], o["actividades"], o["pendiente"]] for o in data["observaciones_academicas"]])
    salida = io.BytesIO(); wb.save(salida); salida.seek(0); return salida


@router.get("/exportar.xlsx")
def exportar_excel(periodo_id: int, grupos: str, desde: Optional[datetime.date] = None, hasta: Optional[datetime.date] = None,
                   db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _autorizar(db, current_user); data = _datos_reporte(db, periodo_id, _ids_grupos(grupos), desde, hasta)
    nombre = _slug(f'Reporte_academico_{data["periodo"]["clave"]}')
    return StreamingResponse(_excel(data), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{nombre}.xlsx"'})


@router.get("/exportar.pdf")
def exportar_pdf(periodo_id: int, grupos: str, desde: Optional[datetime.date] = None, hasta: Optional[datetime.date] = None,
                 db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    _autorizar(db, current_user); data = _datos_reporte(db, periodo_id, _ids_grupos(grupos), desde, hasta)
    salida = io.BytesIO(); styles = getSampleStyleSheet(); doc = SimpleDocTemplate(salida, pagesize=landscape(letter), rightMargin=1.2*cm, leftMargin=1.2*cm, topMargin=1.2*cm, bottomMargin=1.2*cm)
    story = [Paragraph("SIGA · Reporte académico de grupos", styles["Title"]), Paragraph(f'Periodo: {data["periodo"]["clave"]} · Generado: {datetime.date.today().strftime("%d/%m/%Y")}', styles["Normal"]), Spacer(1, 10)]
    r=data["resumen"]; resumen=[["Grupos","Alumnos","Materias","Sesiones","Asistencia","Incidencias","En atención"],[r["grupos"],r["alumnos"],r["materias"],r["sesiones"],f'{r["asistencia"]}%' if r["asistencia"] is not None else "—",r["incidencias"],r["alumnos_atencion"]]]
    tabla=Table(resumen, repeatRows=1); tabla.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#0F766E")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("GRID",(0,0),(-1,-1),.3,colors.HexColor("#CBD5E1")),("ALIGN",(0,0),(-1,-1),"CENTER"),("PADDING",(0,0),(-1,-1),6)])); story += [tabla, Spacer(1,12)]
    grupos_n={g["id"]:f'{g["nombre"]} · {g["carrera"]}' for g in data["grupos"]}
    for g in data["grupos"]:
        story += [Paragraph(grupos_n[g["id"]], styles["Heading2"])]
        filas=[["Materia","Docente","Sesiones","Asistencia","Avance","Último tema","Pendiente"]]
        for m in data["materias"]:
            if m["grupo_id"]==g["id"]: filas.append([m["materia"],m["docente"],m["sesiones"],f'{m["asistencia"]}%' if m["asistencia"] is not None else "—",f'{m["avance"]}%' if m["avance"] is not None else "—",m["ultimo_tema"] or "—",m["pendiente"] or "—"])
        t=Table(filas, repeatRows=1, colWidths=[4*cm,4*cm,1.5*cm,1.8*cm,1.5*cm,5*cm,5*cm]); t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#0F766E")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("GRID",(0,0),(-1,-1),.25,colors.HexColor("#CBD5E1")),("VALIGN",(0,0),(-1,-1),"TOP"),("FONTSIZE",(0,0),(-1,-1),7),("PADDING",(0,0),(-1,-1),4)])); story += [t, Spacer(1,10)]
    story += [PageBreak(), Paragraph("Alumnos que requieren atención", styles["Heading2"])]
    filas=[["Grupo","Matrícula","Alumno","Asistencia","Faltas","Seguimientos","Nivel"]]+[[grupos_n.get(a["grupo_id"],""),a["matricula"],a["nombre"],f'{a["asistencia"]}%' if a["asistencia"] is not None else "—",a["faltas"],a["seguimientos_abiertos"],a["nivel"]] for a in data["alumnos_atencion"]]
    t=Table(filas,repeatRows=1); t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#0F766E")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("GRID",(0,0),(-1,-1),.25,colors.HexColor("#CBD5E1")),("FONTSIZE",(0,0),(-1,-1),8),("PADDING",(0,0),(-1,-1),4)])); story += [t,Spacer(1,10),Paragraph(data["privacidad"],styles["Italic"])]
    story += [PageBreak(), Paragraph("Observaciones académicas e incidencias", styles["Heading2"])]
    for o in data["observaciones_academicas"]:
        detalle = " · ".join(parte for parte in [f'Tema: {o["tema"]}' if o["tema"] else None, f'Actividades: {o["actividades"]}' if o["actividades"] else None, f'Pendiente: {o["pendiente"]}' if o["pendiente"] else None] if parte)
        story += [Paragraph(f'<b>{escape(o["fecha"])} · {escape(grupos_n.get(o["grupo_id"], ""))} · {escape(o["materia"])}</b> — {escape(o["docente"])}', styles["BodyText"]), Paragraph(escape(detalle), styles["BodyText"]), Spacer(1, 5)]
    if data["incidencias"]:
        story += [Spacer(1, 8), Paragraph("Incidencias generales", styles["Heading3"])]
        for i in data["incidencias"]:
            story += [Paragraph(f'<b>{escape(i["fecha"])} · {escape(grupos_n.get(i["grupo_id"], ""))} · {escape(i["tipo"])}</b> — {escape(i["materia"])} / {escape(i["docente"])}', styles["BodyText"]), Paragraph(escape(i["descripcion"]), styles["BodyText"]), Spacer(1, 5)]
    doc.build(story); salida.seek(0); nombre=_slug(f'Reporte_academico_{data["periodo"]["clave"]}')
    return StreamingResponse(salida,media_type="application/pdf",headers={"Content-Disposition":f'attachment; filename="{nombre}.pdf"'})
