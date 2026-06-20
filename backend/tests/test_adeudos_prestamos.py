import datetime

from tests.conftest import auth_headers, get_token
from models.adeudo import Adeudo
from models.inventario import Activo, Prestamo


def _activo(db, lab):
    activo = Activo(
        laboratorio_id=lab.id,
        alcance="LABORATORIO",
        tipo_inventario="ACTIVO",
        estado_admin="VALIDADO",
        codigo_inventario="UTC-LTI-PC-999",
        nombre="PC de escritorio",
        categoria="COMPUTADORA",
        marca="Dell",
        estado="OPERATIVO",
        cantidad=1,
        unidad_medida="PIEZA",
        activo=True,
    )
    db.add(activo)
    db.commit()
    db.refresh(activo)
    return activo


def test_sincronizar_prestamos_incluye_prestamo_ya_marcado_vencido(client, db, admin_user, lab):
    token = get_token(client, "admin@test.com", "AdminPass123")
    activo = _activo(db, lab)
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

    prestamo = Prestamo(
        activo_id=activo.id,
        solicitante_nombre="Garcia Perez Cutperto",
        solicitante_id_escolar="UTC250064",
        autorizado_por=admin_user.id,
        fecha_salida=now - datetime.timedelta(days=5),
        fecha_retorno_esperada=now - datetime.timedelta(days=2),
        estado="VENCIDO",
        condicion_salida="BUENO",
    )
    db.add(prestamo)
    db.commit()
    db.refresh(prestamo)

    resp = client.post("/adeudos/sincronizar-prestamos", headers=auth_headers(token))

    assert resp.status_code == 200, resp.text
    assert resp.json()["prestamos_vencidos"] == 1
    assert resp.json()["adeudos_creados"] == 1

    adeudo = db.query(Adeudo).filter(Adeudo.prestamo_id == prestamo.id).one()
    assert adeudo.estado == "PENDIENTE"
    assert adeudo.origen_tipo == "PRESTAMO"
    assert adeudo.persona_identificador == "UTC250064"
