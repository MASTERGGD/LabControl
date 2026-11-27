import datetime

from dependencies import hashear_password
from models.catalogo import GrupoAcademico, PeriodoEscolar
from models.cierre_academico import ConfirmacionCargaDocente, CierreAcademicoPeriodo
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


def _poner_en_precierre(db, admin, periodo):
    db.add(CierreAcademicoPeriodo(
        periodo_id=periodo.id, estado="PRECIERRE", configurado_por_id=admin.id,
    ))
    db.commit()


def test_periodo_cerrado_no_permite_nuevas_cargas_ni_activarlas(client, db, monkeypatch):
    import routers.docencia as docencia
    from zoneinfo import ZoneInfo
    monkeypatch.setattr(docencia, "_ahora_mx", lambda: datetime.datetime(2026, 8, 31, 9, tzinfo=ZoneInfo("America/Mexico_City")))
    admin, docente, periodo, carga = _escenario(db)
    carga.estado = "BORRADOR"
    db.add(CierreAcademicoPeriodo(periodo_id=periodo.id, estado="CERRADO", configurado_por_id=admin.id))
    futuro = PeriodoEscolar(clave="SEP-DIC 2099", activo=True, es_actual=False)
    db.add(futuro); db.commit()
    headers = auth_headers(get_token(client, docente.email, "Docente123!"))
    creada = client.post("/docencia/horario", headers=headers, json={
        "periodo_id": periodo.id, "tipo_actividad": "CLASE", "actividad_nombre": "Prueba cierre",
        "grupo_academico_id": carga.grupo_academico_id,
        "dia_semana": 0, "hora_inicio": "08:00", "hora_fin": "09:00",
    })
    assert creada.status_code == 409, creada.text
    assert "cerrado" in creada.json()["detail"]
    activar = client.post(f"/docencia/horario/{carga.id}/activar", headers=headers)
    assert activar.status_code == 409, activar.text
    db.refresh(carga)
    assert carga.estado == "BORRADOR"
    assert db.query(CargaDocente).count() == 1
    catalogos = client.get("/docencia/catalogos", headers=headers)
    assert catalogos.status_code == 200, catalogos.text
    assert not next(p for p in catalogos.json()["periodos"] if p["id"] == periodo.id)["es_actual"]
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    estados = client.get("/calendario-academico/periodos", headers=admin_h).json()
    assert next(p for p in estados if p["id"] == periodo.id)["estado_periodo"] == "CERRADO"
    assert not any(p["es_actual"] for p in estados)
    assert next(p for p in estados if p["id"] == futuro.id)["estado_periodo"] == "PREPARACION"


def test_confirmacion_bloquea_pendientes_y_evitar_duplicados(client, db):
    admin, docente, periodo, carga = _escenario(db)
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    hoy = datetime.date.today()
    _poner_en_precierre(db, admin, periodo)
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
    _poner_en_precierre(db, admin, periodo)
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
    _poner_en_precierre(db, admin, periodo)
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


def test_precierre_requiere_fin_oficial_y_no_permite_saltar_etapas(client, db):
    from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico
    admin, _, periodo, _ = _escenario(db)
    headers = auth_headers(get_token(client, admin.email, "Admin123!"))
    hoy = datetime.date.today()

    salto = client.put("/cierre-academico", headers=headers, json={
        "periodo_id": periodo.id, "estado": "CONFIRMACION",
        "confirmacion_inicio": hoy.isoformat(), "confirmacion_fin": hoy.isoformat(),
    })
    assert salto.status_code == 409
    sin_fecha = client.put("/cierre-academico", headers=headers, json={
        "periodo_id": periodo.id, "estado": "PRECIERRE",
    })
    assert sin_fecha.status_code == 409
    assert "fin de actividades académicas" in sin_fecha.json()["detail"]

    calendario = CalendarioAcademico(
        periodo_id=periodo.id, creado_por_id=admin.id, estado="PUBLICADO",
    )
    db.add(calendario); db.flush()
    db.add(EventoCalendarioAcademico(
        calendario_id=calendario.id, creado_por_id=admin.id,
        titulo="Fin de actividades", tipo="FIN_ACTIVIDADES_ACADEMICAS",
        fecha_inicio=hoy - datetime.timedelta(days=1),
        fecha_fin=hoy - datetime.timedelta(days=1),
    ))
    db.commit()
    permitido = client.put("/cierre-academico", headers=headers, json={
        "periodo_id": periodo.id, "estado": "PRECIERRE",
    })
    assert permitido.status_code == 200, permitido.text
    assert permitido.json()["estado"] == "PRECIERRE"


def test_cierre_bloquea_sesion_laboratorio_y_archiva_reserva(client, db):
    admin, docente, periodo, carga = _escenario(db)
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    hoy = datetime.date.today()
    _poner_en_precierre(db, admin, periodo)
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


def test_cierre_unificado_archiva_calendario_y_es_irreversible(client, db):
    from models.calendario_academico import CalendarioAcademico, HistorialCalendarioAcademico, EventoCalendarioAcademico
    from services.calendario_academico import estado_fecha_academica
    admin, docente, periodo, carga = _escenario(db)
    carga.activo = False
    calendario = CalendarioAcademico(periodo_id=periodo.id, creado_por_id=admin.id,
                                    estado="PUBLICADO", publicado_en=datetime.datetime.utcnow())
    db.add(calendario); db.flush()
    db.add(EventoCalendarioAcademico(calendario_id=calendario.id, creado_por_id=admin.id,
        titulo="Suspensión", tipo="SUSPENSION_GENERAL", fecha_inicio=datetime.date(2026, 8, 20),
        fecha_fin=datetime.date(2026, 8, 20), requiere_asistencia=False, permite_iniciar_clase=False))
    db.add(CierreAcademicoPeriodo(
        periodo_id=periodo.id, estado="CONFIRMACION", configurado_por_id=admin.id,
        confirmacion_inicio=datetime.date(2026, 8, 1), confirmacion_fin=datetime.date(2026, 8, 31),
    ))
    db.commit()
    headers = auth_headers(get_token(client, admin.email, "Admin123!"))
    independiente = client.put(f"/calendario-academico/{calendario.id}/estado", headers=headers,
                               json={"estado": "CERRADO", "motivo": "Prueba"})
    assert independiente.status_code == 409
    respuesta = client.put("/cierre-academico", headers=headers,
                           json={"periodo_id": periodo.id, "estado": "CERRADO"})
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["cerrado_en"]
    db.refresh(calendario)
    assert calendario.estado == "CERRADO"
    assert calendario.version == 2
    assert db.query(HistorialCalendarioAcademico).one().accion == "CIERRE_CUATRIMESTRE"
    repetir = client.put("/cierre-academico", headers=headers,
                         json={"periodo_id": periodo.id, "estado": "CERRADO"})
    assert repetir.json()["cerrado_en"] == respuesta.json()["cerrado_en"]
    assert db.query(HistorialCalendarioAcademico).count() == 1
    for estado in ("ACTIVO", "PRECIERRE", "CONFIRMACION"):
        assert client.put("/cierre-academico", headers=headers, json={
            "periodo_id": periodo.id, "estado": estado,
            "confirmacion_inicio": "2026-08-01", "confirmacion_fin": "2026-08-31",
        }).status_code == 409
    for estado in ("BORRADOR", "PUBLICADO"):
        assert client.put(f"/calendario-academico/{calendario.id}/estado", headers=headers,
                          json={"estado": estado}).status_code == 409
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    consulta = client.get("/calendario-academico", params={"periodo_id": periodo.id}, headers=docente_h)
    assert consulta.json()["estado"] == "CERRADO"
    assert not consulta.json()["puede_editar"]
    assert not estado_fecha_academica(db, periodo.id, datetime.date(2026, 8, 20))["requiere_asistencia"]


def test_cierre_fallido_conserva_calendario_publicado(client, db):
    from models.calendario_academico import CalendarioAcademico, HistorialCalendarioAcademico
    admin, docente, periodo, carga = _escenario(db)
    calendario = CalendarioAcademico(periodo_id=periodo.id, creado_por_id=admin.id, estado="PUBLICADO")
    db.add(calendario); db.commit()
    headers = auth_headers(get_token(client, admin.email, "Admin123!"))
    respuesta = client.put("/cierre-academico", headers=headers,
                           json={"periodo_id": periodo.id, "estado": "CERRADO"})
    assert respuesta.status_code == 409
    db.expire_all()
    assert calendario.estado == "PUBLICADO"
    assert calendario.version == 1
    assert db.query(HistorialCalendarioAcademico).count() == 0


def test_migracion_archiva_solo_calendarios_de_cuatris_cerrados(db, monkeypatch):
    import importlib.util
    from pathlib import Path
    from models.calendario_academico import CalendarioAcademico, HistorialCalendarioAcademico
    admin, docente, periodo, carga = _escenario(db)
    siguiente = PeriodoEscolar(clave="SEP-DIC 2026", activo=True, es_actual=False)
    db.add(siguiente); db.flush()
    viejo = CalendarioAcademico(periodo_id=periodo.id, creado_por_id=admin.id, estado="PUBLICADO")
    nuevo = CalendarioAcademico(periodo_id=siguiente.id, creado_por_id=admin.id, estado="BORRADOR")
    db.add_all([viejo, nuevo, CierreAcademicoPeriodo(
        periodo_id=periodo.id, estado="CERRADO", configurado_por_id=admin.id,
        cerrado_por_id=admin.id, cerrado_en=datetime.datetime(2026, 8, 31, 10),
    )]); db.commit()
    archivo = Path(__file__).parents[1] / "alembic/versions/h7i8j9k0l1m2_sync_closed_calendars.py"
    spec = importlib.util.spec_from_file_location("sync_closed_calendars", archivo)
    migracion = importlib.util.module_from_spec(spec); spec.loader.exec_module(migracion)
    monkeypatch.setattr(migracion.op, "get_bind", lambda: db.connection())
    migracion.upgrade(); migracion.upgrade(); db.expire_all()
    assert viejo.estado == "CERRADO" and viejo.version == 2
    assert viejo.cerrado_en == datetime.datetime(2026, 8, 31, 10)
    assert nuevo.estado == "BORRADOR" and nuevo.version == 1
    assert db.query(HistorialCalendarioAcademico).count() == 1


def test_cierre_administrativo_conserva_faltantes_y_reporte(client, db, monkeypatch):
    from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico
    from routers import cierre_academico

    admin, docente, periodo, carga = _escenario(db)
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    hoy = datetime.date(2026, 8, 14)
    monkeypatch.setattr(cierre_academico, "_hoy", lambda: hoy)
    calendario = CalendarioAcademico(
        periodo_id=periodo.id, estado="PUBLICADO", creado_por_id=admin.id,
        publicado_en=datetime.datetime(2026, 8, 1),
    )
    db.add(calendario)
    db.flush()
    for tipo, dia, requiere in [
        ("INICIO_CUATRIMESTRE", 1, True),
        ("SUSPENSION_ACTIVIDADES", 4, False),
        ("FIN_ACTIVIDADES_ACADEMICAS", 13, True),
    ]:
        fecha = datetime.date(2026, 8, dia)
        db.add(EventoCalendarioAcademico(
            calendario_id=calendario.id, tipo=tipo, titulo=tipo,
            fecha_inicio=fecha, fecha_fin=fecha,
            requiere_asistencia=requiere, permite_iniciar_clase=requiere,
            creado_por_id=admin.id,
        ))
    db.add(ClaseDocente(
        carga_docente_id=carga.id, fecha=datetime.date(2026, 8, 11), estado="NO_IMPARTIDA",
        motivo_no_impartida="Reunión de academia", estado_reposicion="NO_REQUERIDA",
    ))
    db.add(EventoCalendarioAcademico(
        calendario_id=calendario.id, tipo="INICIO_CUATRIMESTRE", titulo="Inicio oficial",
        fecha_inicio=datetime.date(2026, 7, 28), fecha_fin=datetime.date(2026, 7, 28),
        creado_por_id=admin.id,
    ))
    db.commit()
    informe = client.get("/cierre-academico", headers=admin_h, params={"periodo_id": periodo.id})
    assert informe.status_code == 200, informe.text
    assert informe.json()["cargas"][0]["programa_educativo"] == carga.grupo_academico.carrera
    assert informe.json()["cargas"][0]["resumen"]["fechas_sin_registro"] == ["2026-07-28"]
    parametros = {"periodo_id": periodo.id, "solo_propias": True}
    docente_activo = client.get("/cierre-academico", headers=docente_h, params=parametros)
    assert docente_activo.status_code == 200, docente_activo.text
    reporte_docente = docente_activo.json()
    assert reporte_docente["estado"] == "ACTIVO"
    assert reporte_docente["confirmacion_vigente"] is False
    assert reporte_docente["cargas"] == informe.json()["cargas"]
    assert client.get("/cierre-academico", headers=admin_h, params=parametros).json()["cargas"] == []
    assert client.put("/cierre-academico", headers=admin_h, json={"periodo_id": periodo.id, "estado": "PRECIERRE"}).status_code == 200
    ventana = {"periodo_id": periodo.id, "estado": "CONFIRMACION", "confirmacion_inicio": "2026-08-14", "confirmacion_fin": "2026-08-14"}
    assert client.put("/cierre-academico", headers=admin_h, json=ventana).status_code == 200
    ventana["confirmacion_fin"] = "2026-08-15"
    ampliada = client.put("/cierre-academico", headers=admin_h, json=ventana)
    assert ampliada.status_code == 200, ampliada.text
    assert len(ampliada.json()["historial_plazos"]) == 2

    resolver = f"/cierre-academico/cargas/{carga.id}/cierre-administrativo"
    datos = {"motivo": "Docente no disponible", "folio": "DIV-01"}
    assert client.post(resolver, headers=admin_h, json=datos).status_code == 409
    hoy = datetime.date(2026, 8, 16)
    assert client.post(resolver, headers=docente_h, json=datos).status_code == 403
    resuelto = client.post(resolver, headers=admin_h, json=datos)
    assert resuelto.status_code == 200, resuelto.text
    assert resuelto.json()["confirmadas"] == 0
    assert resuelto.json()["resueltas"] == 1

    cerrado = client.put("/cierre-academico", headers=admin_h, json={"periodo_id": periodo.id, "estado": "CERRADO"})
    assert cerrado.status_code == 200, cerrado.text
    fila = cerrado.json()["reporte_final"]["cargas"][0]
    assert fila["estado"] == "CERRADA_ADMINISTRATIVA"
    assert fila["cierre_administrativo"]["folio"] == "DIV-01"
    assert fila["resumen"]["fechas_sin_registro"] == ["2026-07-28"]
    assert fila["resumen"]["detalle_no_impartidas"] == [{
        "fecha": "2026-08-11", "motivo": "Reunión de academia",
        "estado_reposicion": "NO_REQUERIDA", "fecha_reposicion": None,
    }]
    assert db.query(ClaseDocente).count() == 1

def test_revision_sesion_vencida_autoriza_una_fecha_y_conserva_auditoria(client, db, monkeypatch):
    from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico
    from routers import cierre_academico, docencia

    admin, docente, periodo, carga = _escenario(db)
    hoy = datetime.date(2026, 8, 20)
    monkeypatch.setattr(cierre_academico, "_hoy", lambda: hoy)
    monkeypatch.setattr(docencia, "_ahora_mx", lambda: datetime.datetime(2026, 8, 20, 12, tzinfo=cierre_academico.MX))
    calendario = CalendarioAcademico(periodo_id=periodo.id, estado="PUBLICADO", creado_por_id=admin.id)
    db.add(calendario)
    db.flush()
    for tipo, fecha in [
        ("INICIO_CUATRIMESTRE", datetime.date(2026, 8, 1)),
        ("FIN_ACTIVIDADES_ACADEMICAS", datetime.date(2026, 8, 31)),
    ]:
        db.add(EventoCalendarioAcademico(
            calendario_id=calendario.id, tipo=tipo, titulo=tipo, fecha_inicio=fecha, fecha_fin=fecha,
            creado_por_id=admin.id, requiere_asistencia=True,
        ))
    db.commit()
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    captura = f"/docencia/horario/{carga.id}/captura-extemporanea"
    solicitud = f"/cierre-academico/cargas/{carga.id}/revision-sesion"
    fecha = "2026-08-04"
    datos = {"fecha": fecha, "motivo": "Presento constancia de la clase"}
    assert client.post(captura, headers=docente_h, json=datos).status_code == 409
    solicitada = client.post(solicitud, headers=docente_h, json=datos)
    assert solicitada.status_code == 200, solicitada.text
    revision_id = solicitada.json()["id"]
    assert client.post(solicitud, headers=docente_h, json=datos).status_code == 409
    decision = f"{solicitud}/{revision_id}/decision"
    pedir = {"decision": "ESPERA_DOCENTE", "motivo": "Indica dónde quedó la lista"}
    assert client.post(decision, headers=docente_h, json=pedir).status_code == 403
    assert client.post(decision, headers=admin_h, json={"decision": "ESPERA_DOCENTE"}).status_code == 422
    assert client.post(decision, headers=admin_h, json={"decision": "SIN_EVIDENCIA"}).status_code == 422
    assert client.post(decision, headers=admin_h, json=pedir).json()["estado"] == "ESPERA_DOCENTE"
    assert client.post(solicitud, headers=docente_h, json=datos).json()["estado"] == "EN_REVISION"
    autorizar = {"decision": "AUTORIZADA", "horas": 48}
    aprobada = client.post(decision, headers=admin_h, json=autorizar)
    assert aprobada.status_code == 200, aprobada.text
    assert aprobada.json()["historial"][-1]["motivo"] == "Captura autorizada para esta sesión"
    from models.cierre_academico import RevisionSesionVencida

    revision_db = db.get(RevisionSesionVencida, revision_id)
    revision_db.autorizada_hasta = datetime.datetime(2000, 1, 1)
    db.commit()
    renovada = client.post(solicitud, headers=docente_h, json={
        "fecha": fecha, "tramite": "AUTORIZAR_CAPTURA", "observaciones": "Solicito una nueva ventana de captura",
    })
    assert renovada.status_code == 200, renovada.text
    assert renovada.json()["motivo_previo"] == datos["motivo"]
    evento = renovada.json()["historial"][-1]
    assert evento["solicitud"]["motivo"] == datos["motivo"]
    assert evento["solicitud"]["peticion"] == "Autorización de captura"
    assert client.post(decision, headers=admin_h, json=autorizar).status_code == 200
    opciones = client.get("/docencia/capturas-extemporaneas/disponibles", headers=docente_h).json()
    assert any(item["fecha"] == fecha and item.get("autorizada") for item in opciones)
    assert client.post(captura, headers=docente_h, json={**datos, "fecha": "2026-08-11"}).status_code == 409
    registrada = client.post(captura, headers=docente_h, json=datos)
    assert registrada.status_code == 200, registrada.text
    assert client.post(captura, headers=docente_h, json=datos).status_code == 409
    reporte = client.get("/cierre-academico", headers=docente_h, params={"periodo_id": periodo.id, "solo_propias": True}).json()
    revision = reporte["cargas"][0]["revisiones_sesion"][0]
    assert revision["estado"] == "CAPTURA_INICIADA"
    assert [evento["estado"] for evento in revision["historial"]] == [
        "EN_REVISION", "ESPERA_DOCENTE", "EN_REVISION", "AUTORIZADA", "EN_REVISION", "AUTORIZADA", "CAPTURA_INICIADA",
    ]

    otra = client.post(solicitud, headers=docente_h, json={
        "fecha": "2026-08-11", "categoria": "CAMBIO_HORARIO", "tramite": "REVISAR_SESION",
    })
    assert otra.status_code == 200, otra.text
    assert otra.json()["historial"][0]["solicitud"]["motivo"] == "Cambio de horario"
    otra_decision = f"{solicitud}/{otra.json()['id']}/decision"
    excluida = client.post(otra_decision, headers=admin_h, json={
        "decision": "NO_CORRESPONDIA", "motivo": "El horario fue sustituido esa fecha",
    })
    assert excluida.status_code == 200, excluida.text
    reporte = client.get("/cierre-academico", headers=docente_h, params={"periodo_id": periodo.id}).json()
    assert "2026-08-11" not in reporte["cargas"][0]["resumen"]["fechas_sin_registro"]
    assert reporte["cargas"][0]["revisiones_sesion"][1]["estado"] == "NO_CORRESPONDIA"
    assert db.query(ClaseDocente).count() == 1

def test_faltantes_de_hoy_aparecen_despues_del_horario(db):
    from routers import cierre_academico

    _, _, _, carga = _escenario(db)
    fecha = datetime.date(2026, 8, 4)
    fechas = {fecha.weekday(): [fecha.isoformat()]}
    antes = datetime.datetime.combine(fecha, datetime.time(8, 30), tzinfo=cierre_academico.MX)
    despues = datetime.datetime.combine(fecha, datetime.time(9, 1), tzinfo=cierre_academico.MX)
    assert cierre_academico._resumen_carga(db, carga, fechas, ahora=antes)["fechas_sin_registro"] == []
    assert cierre_academico._resumen_carga(db, carga, fechas, ahora=despues)["fechas_sin_registro"] == [fecha.isoformat()]


def test_ventana_extraordinaria_previsualiza_y_aplica_solo_fechas_del_alcance(client, db, monkeypatch):
    from models.calendario_academico import CalendarioAcademico, EventoCalendarioAcademico
    from models.cierre_academico import RevisionSesionVencida
    from routers import cierre_academico, docencia
    from services import revision_sesion

    admin, docente, periodo, carga = _escenario(db)
    monkeypatch.setattr(cierre_academico, "_hoy", lambda: datetime.date(2026, 8, 25))
    monkeypatch.setattr(docencia, "_ahora_mx", lambda: datetime.datetime(2026, 8, 25, 12, tzinfo=cierre_academico.MX))
    reloj = [datetime.datetime(2026, 8, 25, 18)]
    monkeypatch.setattr(cierre_academico, "ahora_utc", lambda: reloj[0])
    monkeypatch.setattr(revision_sesion, "ahora_utc", lambda: reloj[0])
    calendario = CalendarioAcademico(periodo_id=periodo.id, estado="PUBLICADO", creado_por_id=admin.id)
    db.add(calendario)
    db.flush()
    for tipo, fecha in [
        ("INICIO_CUATRIMESTRE", datetime.date(2026, 8, 1)),
        ("FIN_ACTIVIDADES_ACADEMICAS", datetime.date(2026, 8, 31)),
    ]:
        db.add(EventoCalendarioAcademico(
            calendario_id=calendario.id, tipo=tipo, titulo=tipo, fecha_inicio=fecha, fecha_fin=fecha,
            creado_por_id=admin.id, requiere_asistencia=True,
        ))
    db.commit()
    admin_h = auth_headers(get_token(client, admin.email, "Admin123!"))
    docente_h = auth_headers(get_token(client, docente.email, "Docente123!"))
    url = "/cierre-academico/ventanas-extraordinarias"
    datos = {
        "periodo_id": periodo.id, "fecha_desde": "2026-08-04", "fecha_hasta": "2026-08-04",
        "abre": "2026-08-25T13:00", "cierra": "2026-08-25T15:00",
        "alcance": "DOCENTE", "valores": [str(docente.id)], "motivo": "Regularizacion por incidencia de captura",
    }
    assert client.post(url, headers=docente_h, json=datos).status_code == 403
    vista = client.post(url, headers=admin_h, json=datos)
    assert vista.status_code == 200, vista.text
    assert vista.json()["sesiones"] == 1
    assert db.query(RevisionSesionVencida).count() == 0
    datos["vista_previa"] = vista.json()["vista_previa"]
    assert client.post(url, headers=admin_h, json={**datos, "motivo": "Se modifico el motivo"}).status_code == 409
    aplicada = client.post(url, headers=admin_h, json=datos)
    assert aplicada.status_code == 200, aplicada.text
    caso = db.query(RevisionSesionVencida).one()
    assert caso.historial[-1]["ventana_id"] == aplicada.json()["ventana_id"]
    ruta = "/docencia/capturas-extemporaneas/disponibles"

    def autorizadas():
        return [fila["fecha"] for fila in client.get(ruta, headers=docente_h).json() if fila.get("autorizada")]

    assert autorizadas() == []
    reloj[0] = datetime.datetime(2026, 8, 25, 20)
    assert autorizadas() == ["2026-08-04"]
    reloj[0] = datetime.datetime(2026, 8, 25, 22)
    assert autorizadas() == []
    captura = f"/docencia/horario/{carga.id}/captura-extemporanea"
    assert client.post(captura, headers=docente_h, json={
        "fecha": "2026-08-04", "motivo": "Clase impartida",
    }).status_code == 409
