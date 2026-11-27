from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from services.timezone import as_mx

LOGO = Path(__file__).resolve().parents[1] / "assets" / "tutoria" / "utecan_logo.jpg"
VERDE = colors.HexColor("#075B47")
TEXTO = colors.HexColor("#172B27")
SECUNDARIO = colors.HexColor("#435A53")
BORDE = colors.HexColor("#CCDAD4")
CLARO = colors.HexColor("#EDF6F1")
MEDIOS = {"EFECTIVO": "Efectivo", "TRANSFERENCIA": "Transferencia", "TARJETA": "Tarjeta"}


def _pesos(centavos):
    enteros, fraccion = divmod(centavos, 100)
    return f"${enteros:,}.{fraccion:02d} MXN"


def generar_recibo_pdf(recibo):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=(396, 612), leftMargin=28, rightMargin=28,
        topMargin=28, bottomMargin=28, title=f"Recibo de pago {recibo['folio']}",
        author="Universidad Tecnológica de Candelaria",
    )
    normal = ParagraphStyle("Recibo", fontName="Helvetica", fontSize=9, leading=12, textColor=TEXTO)
    etiqueta = ParagraphStyle("Etiqueta", parent=normal, fontSize=8, textColor=SECUNDARIO)
    titulo = ParagraphStyle("Título", parent=normal, fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=VERDE)
    total = ParagraphStyle("Total", parent=titulo, alignment=2)
    negrita = ParagraphStyle("Negrita", parent=normal, fontName="Helvetica-Bold")

    def p(valor, estilo=normal):
        return Paragraph(escape(str(valor)), estilo)

    ancho = doc.width - 12
    logo = Image(str(LOGO), width=108, height=34, kind="proportional") if LOGO.is_file() else p("UTECAN", negrita)
    encabezado = Table(
        [[logo, [p("Universidad Tecnológica de Candelaria", negrita),
                  p("Dirección de Administración y Finanzas", etiqueta)]]],
        colWidths=[117, ancho - 117],
    )
    encabezado.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 1, VERDE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    fecha = as_mx(recibo["fecha"]).strftime("%d/%m/%Y · %H:%M")
    filas = [
        ("Alumno", recibo["alumno"]), ("Matrícula", recibo["matricula"]),
        ("Periodo", recibo["periodo"]), ("Servicio pagado", recibo["concepto"]),
        ("Medio de pago", MEDIOS.get(recibo["medio"], recibo["medio"])),
    ]
    if recibo["referencia"]:
        filas.append(("Referencia", recibo["referencia"]))
    if recibo["medio"] == "EFECTIVO":
        filas.extend([
            ("Efectivo recibido", _pesos(recibo["recibido_centavos"])),
            ("Cambio entregado", _pesos(recibo["cambio_centavos"])),
        ])
    datos = Table([[p(k, etiqueta), p(v)] for k, v in filas], colWidths=[103, ancho - 103])
    datos.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.35, BORDE),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    importe = Table(
        [[p("TOTAL PAGADO", negrita), p(_pesos(recibo["importe_centavos"]), total)]],
        colWidths=[112, ancho - 112],
    )
    importe.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CLARO),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    doc.build([
        encabezado, Spacer(1, 15), p("Recibo interno de pago", titulo), Spacer(1, 5),
        p(f"{recibo['folio']}  |  {fecha}", negrita), Spacer(1, 12),
        importe, Spacer(1, 9), datos, Spacer(1, 12),
        p(f"Registró {recibo['cajero']}", etiqueta),
    ])
    return buffer.getvalue()
