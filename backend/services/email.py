"""
Servicio de correo electronico para LabControl UTECAN.

Usa SMTP estandar (Gmail, Outlook, servidor propio).
Si las variables SMTP no estan configuradas, el envio se omite silenciosamente
y se registra un mensaje en consola — el sistema sigue funcionando sin email.

Variables de entorno requeridas:
    SMTP_HOST        ej. smtp.gmail.com
    SMTP_PORT        ej. 587
    SMTP_USER        ej. labcontrol@utecan.edu.mx
    SMTP_PASSWORD    contrasena o app-password
    SMTP_FROM        (opcional) nombre+direccion visible
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger("labcontrol.email")

# Leer config desde entorno
SMTP_HOST     = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM     = os.getenv("SMTP_FROM", SMTP_USER).strip()

_CONFIGURED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)

# Plantilla HTML base
_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#1e293b;border-radius:12px;overflow:hidden;max-width:560px;">
        <tr>
          <td style="background:{header_color};padding:20px 28px;">
            <span style="font-size:24px;">{icon}</span>
            <span style="color:#fff;font-weight:700;font-size:18px;margin-left:10px;">
              LabControl UTECAN
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:#e2e8f0;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#f8fafc;">{titulo}</h2>
            <p style="margin:0 0 20px;line-height:1.6;color:#cbd5e1;">{mensaje}</p>
            {boton}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #334155;">
            <p style="margin:0;font-size:12px;color:#64748b;">
              Mensaje automatico de LabControl UTECAN. No responder a este correo.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

_BOTON_HTML = """
<a href="{url}" style="display:inline-block;padding:10px 22px;background:{color};
   color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
  Ver en LabControl
</a>
"""

_COLORES = {
    "PRESTAMO_VENCIDO": ("#ef4444", "🔴"),
    "MANTENIMIENTO":    ("#f97316", "🔧"),
    "RESERVACION":      ("#3b82f6", "📅"),
    "OVERTIME":         ("#a855f7", "⏰"),
    "COMUNICADO":        ("#059669", "📣"),
    "COMUNICADO_URGENTE": ("#dc2626", "⚠️"),
}


def _build_html(tipo: str, titulo: str, mensaje: str, url: Optional[str] = None) -> str:
    color, icon = _COLORES.get(tipo, ("#6b7280", "🔔"))
    boton = ""
    if url:
        boton = _BOTON_HTML.format(url=url, color=color)
    return _HTML_TEMPLATE.format(
        header_color=color,
        icon=icon,
        titulo=titulo,
        mensaje=mensaje,
        boton=boton,
    )


def enviar_notificacion(
    destinatario: str,
    tipo: str,
    titulo: str,
    mensaje: str,
    url: Optional[str] = None,
) -> bool:
    """
    Envia un email de notificacion.
    Retorna True si se envio, False si hubo error o SMTP no esta configurado.
    """
    if not _CONFIGURED:
        logger.info(
            "SMTP no configurado — email omitido. Destino: %s | %s", destinatario, titulo
        )
        return False

    try:
        html_body = _build_html(tipo, titulo, mensaje, url)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "[LabControl] " + titulo
        msg["From"]    = SMTP_FROM
        msg["To"]      = destinatario

        msg.attach(MIMEText(mensaje, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [destinatario], msg.as_string())

        logger.info("Email enviado a %s: %s", destinatario, titulo)
        return True

    except Exception as exc:
        logger.warning("Error enviando email a %s: %s", destinatario, exc)
        return False
