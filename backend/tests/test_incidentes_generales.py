from models.laboratorio import Computadora
from models.auditoria import AuditLog
from tests.conftest import auth_headers, get_token


def test_docente_puede_reportar_incidente_general_del_laboratorio(
    client, docente_user, lab
):
    token = get_token(client, "docente@test.com", "DocentePass123")

    response = client.post(
        "/inventario/incidentes",
        json={
            "laboratorio_id": lab.id,
            "origen": "SESION",
            "tipo": "OTRO",
            "prioridad": "BAJA",
            "descripcion": "[Limpieza del aula] El bote de basura esta lleno",
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["laboratorio_id"] == lab.id
    assert data["activo_id"] is None
    assert data["computadora_id"] is None


def test_incidente_sin_laboratorio_ni_equipo_se_rechaza(client, docente_user):
    token = get_token(client, "docente@test.com", "DocentePass123")

    response = client.post(
        "/inventario/incidentes",
        json={"tipo": "OTRO", "descripcion": "Reporte sin ubicacion"},
        headers=auth_headers(token),
    )

    assert response.status_code == 422
    assert "laboratorio" in response.text.lower()


def test_responsable_asocia_despues_una_pc_al_reporte(
    client, db, admin_user, lab
):
    pc = Computadora(
        laboratorio_id=lab.id,
        numero=1,
        codigo="PC-01",
        estado="OPERATIVO",
        activa=True,
    )
    db.add(pc)
    db.commit()
    db.refresh(pc)

    token = get_token(client, "admin@test.com", "AdminPass123")
    creado = client.post(
        "/inventario/incidentes",
        json={
            "laboratorio_id": lab.id,
            "tipo": "MANTENIMIENTO",
            "descripcion": "El docente reporto una falla sin identificar el equipo",
        },
        headers=auth_headers(token),
    )
    assert creado.status_code == 201, creado.text

    actualizado = client.put(
        f"/inventario/incidentes/{creado.json()['id']}",
        json={
            "computadora_id": pc.id,
            "motivo_vinculacion": "Identificada durante la revision fisica",
        },
        headers=auth_headers(token),
    )

    assert actualizado.status_code == 200, actualizado.text
    assert actualizado.json()["computadora_id"] == pc.id
    db.refresh(pc)
    assert pc.estado == "MANTENIMIENTO"
    assert db.query(AuditLog).filter(
        AuditLog.recurso == "INCIDENTE",
        AuditLog.recurso_id == creado.json()["id"],
        AuditLog.accion == "VINCULAR_EQUIPO_INCIDENTE",
    ).first() is not None


def test_vincular_equipo_a_observacion_general_requiere_motivo(
    client, db, admin_user, lab
):
    pc = Computadora(
        laboratorio_id=lab.id,
        numero=1,
        codigo="PC-01",
        estado="OPERATIVO",
        activa=True,
    )
    db.add(pc)
    db.commit()

    token = get_token(client, "admin@test.com", "AdminPass123")
    creado = client.post(
        "/inventario/incidentes",
        json={
            "laboratorio_id": lab.id,
            "tipo": "OTRO",
            "descripcion": "[Iluminacion / AC] Las lamparas parpadean",
        },
        headers=auth_headers(token),
    )
    assert creado.status_code == 201, creado.text

    sin_motivo = client.put(
        f"/inventario/incidentes/{creado.json()['id']}",
        json={"computadora_id": pc.id},
        headers=auth_headers(token),
    )

    assert sin_motivo.status_code == 422
    assert "identific" in sin_motivo.text


def test_equipo_vinculado_no_puede_reasignarse_desde_actualizacion_normal(
    client, db, admin_user, lab
):
    pc_uno = Computadora(
        laboratorio_id=lab.id,
        numero=1,
        codigo="PC-01",
        estado="OPERATIVO",
        activa=True,
    )
    pc_dos = Computadora(
        laboratorio_id=lab.id,
        numero=2,
        codigo="PC-02",
        estado="OPERATIVO",
        activa=True,
    )
    db.add_all([pc_uno, pc_dos])
    db.commit()

    token = get_token(client, "admin@test.com", "AdminPass123")
    creado = client.post(
        "/inventario/incidentes",
        json={
            "laboratorio_id": lab.id,
            "computadora_id": pc_uno.id,
            "origen": "SESION",
            "tipo": "MANTENIMIENTO",
            "descripcion": "Falla detectada en la sesion",
        },
        headers=auth_headers(token),
    )
    assert creado.status_code == 201, creado.text

    reasignado = client.put(
        f"/inventario/incidentes/{creado.json()['id']}",
        json={"computadora_id": pc_dos.id},
        headers=auth_headers(token),
    )

    assert reasignado.status_code == 409
    assert "trazabilidad" in reasignado.text


def test_incidente_cerrado_es_solo_lectura_pero_acepta_seguimientos(
    client, admin_user, lab
):
    token = get_token(client, "admin@test.com", "AdminPass123")
    creado = client.post(
        "/inventario/incidentes",
        json={
            "laboratorio_id": lab.id,
            "tipo": "OTRO",
            "descripcion": "Falla de iluminacion general",
        },
        headers=auth_headers(token),
    )
    assert creado.status_code == 201, creado.text
    incidente_id = creado.json()["id"]

    cerrado = client.put(
        f"/inventario/incidentes/{incidente_id}",
        json={"estado": "REPARADO", "costo_reparacion": 350},
        headers=auth_headers(token),
    )
    assert cerrado.status_code == 200, cerrado.text
    assert cerrado.json()["cerrado"] is True

    edicion = client.put(
        f"/inventario/incidentes/{incidente_id}",
        json={"prioridad": "ALTA", "costo_reparacion": 999},
        headers=auth_headers(token),
    )
    assert edicion.status_code == 409
    assert "solo lectura" in edicion.text

    seguimiento = client.post(
        f"/inventario/incidentes/{incidente_id}/seguimientos",
        json={"texto": "Se confirmo con mantenimiento que la reparacion sigue estable."},
        headers=auth_headers(token),
    )
    assert seguimiento.status_code == 200, seguimiento.text
    data = seguimiento.json()
    assert data["costo_reparacion"] == 350
    assert data["prioridad"] == creado.json()["prioridad"]
    assert data["seguimientos"][-1]["tipo"] == "NOTA"
    assert data["seguimientos"][-1]["usuario_nombre"] == admin_user.nombre


def test_reabrir_incidente_exige_motivo_y_registra_historial(
    client, db, admin_user, lab
):
    pc = Computadora(
        laboratorio_id=lab.id,
        numero=1,
        codigo="PC-01",
        estado="OPERATIVO",
        activa=True,
    )
    db.add(pc)
    db.commit()
    db.refresh(pc)

    token = get_token(client, "admin@test.com", "AdminPass123")
    creado = client.post(
        "/inventario/incidentes",
        json={
            "laboratorio_id": lab.id,
            "computadora_id": pc.id,
            "tipo": "MANTENIMIENTO",
            "descripcion": "Equipo sin imagen",
        },
        headers=auth_headers(token),
    )
    incidente_id = creado.json()["id"]
    cerrado = client.put(
        f"/inventario/incidentes/{incidente_id}",
        json={"estado": "REPARADO"},
        headers=auth_headers(token),
    )
    assert cerrado.status_code == 200, cerrado.text

    motivo_corto = client.post(
        f"/inventario/incidentes/{incidente_id}/reabrir",
        json={"motivo": "mal"},
        headers=auth_headers(token),
    )
    assert motivo_corto.status_code == 422

    reabierto = client.post(
        f"/inventario/incidentes/{incidente_id}/reabrir",
        json={"motivo": "La falla reaparecio durante la siguiente clase"},
        headers=auth_headers(token),
    )
    assert reabierto.status_code == 200, reabierto.text
    data = reabierto.json()
    assert data["estado"] == "EN_REVISION"
    assert data["fecha_resolucion"] is None
    assert data["seguimientos"][-1]["tipo"] == "REAPERTURA"
    db.refresh(pc)
    assert pc.estado == "MANTENIMIENTO"
    assert db.query(AuditLog).filter(
        AuditLog.recurso == "INCIDENTE",
        AuditLog.recurso_id == incidente_id,
        AuditLog.accion == "REABRIR_INCIDENTE",
    ).first() is not None


def test_observacion_general_no_puede_darse_de_baja(
    client, admin_user, lab
):
    token = get_token(client, "admin@test.com", "AdminPass123")
    creado = client.post(
        "/inventario/incidentes",
        json={
            "laboratorio_id": lab.id,
            "tipo": "OTRO",
            "descripcion": "El bote de basura esta lleno",
        },
        headers=auth_headers(token),
    )
    respuesta = client.put(
        f"/inventario/incidentes/{creado.json()['id']}",
        json={"estado": "DADO_DE_BAJA"},
        headers=auth_headers(token),
    )
    assert respuesta.status_code == 422
    assert "equipo relacionado" in respuesta.text
