import datetime

from dependencies import hashear_password
from models.catalogo import GrupoAcademico, PeriodoEscolar
from models.cierre_academico import ConfirmacionCargaDocente
from models.docencia import CargaDocente, ClaseDocente
from models.horario import HorarioDisponible, Reservacion
from models.laboratorio import Laboratorio
from models.sesion import SesionClase
from models.usuario import RolUsuario, Usuario
from tests.conftest import auth_headers, get_token


def _escenario(db):
    admin = Usuario(
        nombre="División", email="division.cierre@test.mx",
        password_hash=hashear_password("Admin123!"), rol=RolUsuario.SUPER_ADMIN, activo=True,
    )
    docente = Usuario(
        nombre="Docente", email="docente.cierre@test.mx",
        password_hash=hashear_password("Docente123!"), rol=RolUsuario.DOCENTE, activo=True,
    )
    periodo = PeriodoEscolar(clave="MAY-AGO 2026", activo=True, es_actual=True)
    db.add_all([admin, docente, periodo]); db.flush()
    grupo = GrupoAcademico(periodo_id=periodo.id, carrera="TIEID", cuatrimestre=3, grupo="A", activo=True)
    db.add(grupo); db.flush()
    carga = CargaDocente(
        docente_id=docente.id, periodo_id=periodo.id, grupo_academico_id=grupo.id,
        tipo_actividad="CLASE", actividad_nombre="Bases de datos", dia_semana=1,
        hora_inicio="08:00", hora_fin="09:00", estado="ACTIVO", activo=True,
    )
    db.add(carga); db.commit()
    return admin, docente, periodo, carga


def test_confirmacion_bloquea_pendientes_y_evitar_duplicados(client, db):
    admin, docente, periodo, carga = _escenario(db)
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    hoy = datetime.date.today()
    configurado = client.put("/cierre-academico", headers=admin_h, json={
        "periodo_id": periodo.id, "estado": "CONFIRMACION",
        "confirmacion_inicio": (hoy - datetime.timedelta(days=1)).isoformat(),
        "confirmacion_fin": (hoy + datetime.timedelta(days=2)).isoformat(),
    })
    assert configurado.status_code == 200, configurado.text

    db.add(ClaseDocente(carga_docente_id=carga.id, fecha=hoy, estado="ABIERTA")); db.commit()
    pendiente = client.post(f"/cierre-academico/cargas/{carga.id}/confirmar", headers=docente_h, json={})
    assert pendiente.status_code == 409
    clase = db.query(ClaseDocente).one(); clase.estado = "CERRADA"; db.commit()

    primera = client.post(f"/cierre-academico/cargas/{carga.id}/confirmar", headers=docente_h, json={"observaciones": "Carga completa"})
    segunda = client.post(f"/cierre-academico/cargas/{carga.id}/confirmar", headers=docente_h, json={"observaciones": "Verificada"})
    assert primera.status_code == 200, primera.text
    assert segunda.status_code == 200, segunda.text
    assert db.query(ConfirmacionCargaDocente).count() == 1
    assert db.query(ConfirmacionCargaDocente).one().observaciones == "Verificada"


def test_cierre_reapertura_y_reconfirmacion(client, db):
    admin, docente, periodo, carga = _escenario(db)
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    hoy = datetime.date.today()
    ventana = {
        "periodo_id": periodo.id, "estado": "CONFIRMACION",
        "confirmacion_inicio": (hoy - datetime.timedelta(days=1)).isoformat(),
        "confirmacion_fin": (hoy + datetime.timedelta(days=2)).isoformat(),
    }
    assert client.put("/cierre-academico", headers=admin_h, json=ventana).status_code == 200
    db.add(ClaseDocente(carga_docente_id=carga.id, fecha=hoy, estado="CERRADA")); db.commit()
    assert client.post(f"/cierre-academico/cargas/{carga.id}/confirmar", headers=docente_h, json={}).status_code == 200
    cerrado = client.put("/cierre-academico", headers=admin_h, json={"periodo_id": periodo.id, "estado": "CERRADO"})
    assert cerrado.status_code == 200, cerrado.text

    reabierto = client.post(f"/cierre-academico/cargas/{carga.id}/reabrir", headers=admin_h, json={"motivo": "Corregir asistencia final", "horas": 24})
    assert reabierto.status_code == 200, reabierto.text
    reconfirmado = client.post(f"/cierre-academico/cargas/{carga.id}/confirmar", headers=docente_h, json={"observaciones": "Corrección terminada"})
    assert reconfirmado.status_code == 200, reconfirmado.text
    assert db.query(ConfirmacionCargaDocente).count() == 1
    assert db.query(ConfirmacionCargaDocente).one().estado == "CONFIRMADA_DOCENTE"


def test_confirmacion_bloquea_carga_sin_clases_registradas(client, db):
    admin, docente, periodo, carga = _escenario(db)
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    hoy = datetime.date.today()
    assert client.put("/cierre-academico", headers=admin_h, json={
        "periodo_id": periodo.id, "estado": "CONFIRMACION",
        "confirmacion_inicio": (hoy - datetime.timedelta(days=1)).isoformat(),
        "confirmacion_fin": (hoy + datetime.timedelta(days=2)).isoformat(),
    }).status_code == 200

    cierre = client.get(f"/cierre-academico?periodo_id={periodo.id}", headers=docente_h)
    assert cierre.status_code == 200
    resumen = cierre.json()["cargas"][0]["resumen"]
    assert resumen["puede_confirmar"] is False
    assert resumen["motivo_bloqueo"] == "SIN_CLASES_REGISTRADAS"
    respuesta = client.post(f"/cierre-academico/cargas/{carga.id}/confirmar", headers=docente_h, json={})
    assert respuesta.status_code == 409
    assert "Registra al menos una clase" in respuesta.json()["detail"]


def test_docente_no_puede_configurar_cierre(client, db):
    _, docente, periodo, _ = _escenario(db)
    headers = auth_headers(get_token(client, docente.email, "Docente123!"))
    respuesta = client.put("/cierre-academico", headers=headers, json={"periodo_id": periodo.id, "estado": "PRECIERRE"})
    assert respuesta.status_code == 403


def test_cierre_bloquea_sesion_laboratorio_y_archiva_reserva(client, db):
    admin, docente, periodo, carga = _escenario(db)
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    hoy = datetime.date.today()
    assert client.put("/cierre-academico", headers=admin_h, json={
        "periodo_id": periodo.id, "estado": "CONFIRMACION",
        "confirmacion_inicio": (hoy - datetime.timedelta(days=1)).isoformat(),
        "confirmacion_fin": (hoy + datetime.timedelta(days=2)).isoformat(),
    }).status_code == 200
    db.add(ClaseDocente(carga_docente_id=carga.id, fecha=hoy, estado="CERRADA")); db.flush()
    laboratorio = Laboratorio(nombre="Laboratorio de cierre", activo=True)
    db.add(laboratorio); db.flush()
    horario = HorarioDisponible(
        laboratorio_id=laboratorio.id, dia_semana=1, hora_inicio="08:00", hora_fin="09:00",
        cuatrimestre="MAY-AGO-2026", activo=True,
    )
    db.add(horario); db.flush()
    reserva = Reservacion(
        horario_id=horario.id, laboratorio_id=laboratorio.id, docente_id=docente.id,
        materia="Bases de datos", carrera="TIEID", cuatrimestre="MAY-AGO-2026",
        cuatrimestre_materia="3", grupo="A", estado="PROGRAMADA", creado_por=admin.id,
    )
    db.add(reserva); db.flush()
    sesion = SesionClase(
        reservacion_id=reserva.id, laboratorio_id=laboratorio.id, docente_id=docente.id,
        codigo_sesion="CIERRE-LAB-1", estado="ABIERTA",
    )
    db.add(sesion); db.commit()
    assert client.post(f"/cierre-academico/cargas/{carga.id}/confirmar", headers=docente_h, json={}).status_code == 200

    bloqueado = client.put("/cierre-academico", headers=admin_h, json={"periodo_id": periodo.id, "estado": "CERRADO"})
    assert bloqueado.status_code == 409
    assert "sesiones de laboratorio" in bloqueado.json()["detail"]

    sesion.estado = "CERRADA"; db.commit()
    cerrado = client.put("/cierre-academico", headers=admin_h, json={"periodo_id": periodo.id, "estado": "CERRADO"})
    assert cerrado.status_code == 200, cerrado.text
    db.refresh(reserva)
    assert reserva.estado == "ARCHIVADA"
    assert cerrado.json()["laboratorios"]["reservaciones_archivadas"] == 1
