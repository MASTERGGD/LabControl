from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from database import get_db
from dependencies import get_current_user
from models.catalogo import CatalogoAlumno
from models.departamento import Departamento
from models.usuario import RolUsuario, Usuario
from routers import cobranza, departamentos


def test_caja_valida_permiso_importe_y_reintento(db):
    area = Departamento(nombre="Dirección de Administración y Finanzas", clave="DAF")
    db.add(area)
    db.flush()
    responsable = Usuario(nombre="Responsable", email="responsable@example.test", password_hash="test",
                          rol=RolUsuario.ADMINISTRATIVO, departamento_id=area.id)
    cajero = Usuario(nombre="Caja", email="caja@example.test", password_hash="test",
                     rol=RolUsuario.ADMINISTRATIVO, departamento_id=area.id)
    alumno = CatalogoAlumno(matricula="TEST001", nombres="Alumno", apellido_paterno="Prueba",
                            apellido_materno="Caja", carrera="Sistemas", cuatrimestre=1, grupo="A",
                            periodo="SEP-DIC 2026")
    db.add_all([responsable, cajero, alumno])
    db.flush()
    area.responsable_id = responsable.id
    db.commit()
    ruta = f"/cobranza/{area.id}"
    actor = cajero
    app = FastAPI()
    app.include_router(cobranza.router)
    app.include_router(departamentos.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: actor

    with TestClient(app) as client:
        assert client.get(ruta + "/alumnos", params={"matricula": "TEST001"}).status_code == 403
        asignacion = {"usuario_id": cajero.id, "permiso": "cobranza:operar", "activo": True}
        permisos = f"/departamentos/{area.id}/permisos"
        assert client.patch(permisos, json=asignacion).status_code == 403
        actor = responsable
        assert client.patch(permisos, json=asignacion).json()["puede_cobrar"]
        tarifa = {"nombre": "Constancia", "importe_centavos": 18000}
        alta = client.post(ruta + "/conceptos", json=tarifa)
        assert alta.status_code == 201
        concepto_id = alta.json()["id"]
        actor = cajero
        assert client.post(ruta + "/conceptos", json=tarifa).status_code == 403
        busqueda = client.get(ruta + "/alumnos", params={"matricula": "test001"})
        assert busqueda.json()[0]["id"] == alumno.id
        for termino in ("alum", "PRUEBA alumno", "caja", "TEST001"):
            coincidencias = client.get(ruta + "/alumnos", params={"q": termino})
            assert [fila["id"] for fila in coincidencias.json()] == [alumno.id]
        assert client.get(ruta + "/alumnos", params={"q": "%%"}).json() == []
        pago = {"operacion": str(uuid4()), "alumno_id": alumno.id, "concepto_id": concepto_id,
                "medio": "EFECTIVO", "importe_centavos": 18000, "recibido_centavos": 20000}
        assert client.post(ruta + "/pagos", json={**pago, "recibido_centavos": 10000}).status_code == 422
        recibo = client.post(ruta + "/pagos", json=pago).json()
        assert recibo["cambio_centavos"] == 2000
        ruta_pdf = ruta + f"/pagos/{recibo['id']}/recibo.pdf"
        pdf = client.get(ruta_pdf)
        assert pdf.status_code == 200
        assert pdf.headers["content-type"] == "application/pdf"
        assert recibo["folio"] in pdf.headers["content-disposition"]
        assert pdf.content.startswith(b"%PDF-")
        assert client.post(ruta + "/pagos", json=pago).json() == recibo

        actor = responsable
        assert client.put(ruta + f"/conceptos/{concepto_id}", json={
            **tarifa, "importe_centavos": 20000,
        }).status_code == 200
        actor = cajero
        assert client.post(ruta + "/pagos", json={**pago, "operacion": str(uuid4())}).status_code == 409
        assert client.get(ruta + "/pagos").json()["recibos"] == [recibo]
        actor = responsable
        assert not client.patch(permisos, json={**asignacion, "activo": False}).json()["puede_cobrar"]
        actor = cajero
        assert client.get(ruta + "/pagos").status_code == 403
        assert client.get(ruta_pdf).status_code == 403
