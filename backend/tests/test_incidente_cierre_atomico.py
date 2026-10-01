from tests.conftest import auth_headers, get_token


def test_reparacion_pendiente_y_cierre_con_nota_y_costo(client, admin_user, lab):
    headers = auth_headers(get_token(client, "admin@test.com", "AdminPass123"))
    creado = client.post(
        "/inventario/incidentes",
        json={"laboratorio_id": lab.id, "tipo": "OTRO", "descripcion": "Falla de red"},
        headers=headers,
    )
    assert creado.status_code == 201, creado.text
    url = f"/inventario/incidentes/{creado.json()['id']}"
    reparado = client.put(url, json={"estado": "REPARADO"}, headers=headers)
    assert reparado.status_code == 200, reparado.text
    assert reparado.json()["cerrado"] is False

    nota = "Se cambió el cable y se verificó la conexión."
    cerrado = client.put(
        url,
        json={"estado": "CERRADO", "notas_seguimiento": nota, "costo_reparacion": 150},
        headers=headers,
    )
    assert cerrado.status_code == 200, cerrado.text
    data = cerrado.json()
    assert data["estado"] == "CERRADO"
    assert data["cerrado"] is True
    assert data["costo_reparacion"] == 150
    assert any(s["texto"] == nota for s in data["seguimientos"])
    assert any(s["estado_nuevo"] == "CERRADO" for s in data["seguimientos"])
    assert client.put(url, json={"costo_reparacion": 999}, headers=headers).status_code == 409
