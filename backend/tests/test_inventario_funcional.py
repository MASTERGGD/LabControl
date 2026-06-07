import datetime

from tests.conftest import auth_headers, get_token
from dependencies import hashear_password
from models.departamento import Departamento
from models.inventario import MantenimientoPreventivo
from models.laboratorio import Laboratorio
from models.usuario import RolUsuario, Usuario


def _crear_departamento(db, nombre="Planeacion Pruebas", clave="PLANQA", responsable=None):
    dep = Departamento(nombre=nombre, clave=clave, activo=True)
    db.add(dep)
    db.commit()
    db.refresh(dep)
    if responsable:
        responsable.departamento_id = dep.id
        dep.responsable_id = responsable.id
        db.commit()
        db.refresh(dep)
    return dep


def _crear_usuario(db, nombre, email, rol, password="PassFunc123", laboratorio_id=None, departamento_id=None):
    user = Usuario(
        nombre=nombre,
        email=email,
        password_hash=hashear_password(password),
        rol=rol,
        laboratorio_id=laboratorio_id,
        departamento_id=departamento_id,
        activo=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _crear_activo_institucional(client, token, departamento_id, nombre="Activo funcional SIGA"):
    resp = client.post(
        "/inventario/activos",
        json={
            "alcance": "INSTITUCIONAL",
            "departamento_id": departamento_id,
            "nombre": nombre,
            "categoria": "MOBILIARIO",
            "area": "QA",
            "ubicacion_tipo": "OFICINA",
            "ubicacion_nombre": "Edificio QA / Oficina 1",
            "resguardante_externo_nombre": "Resguardante Funcional",
            "numero_oficial": f"QA-{datetime.datetime.now().timestamp()}",
            "estado": "OPERATIVO",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestRondaFuncionalInventario:
    def test_super_admin_flujo_institucional_resguardo_qr_movimiento_expediente(self, client, db, admin_user):
        token = get_token(client, "admin@test.com", "AdminPass123")
        dep = _crear_departamento(db)
        activo = _crear_activo_institucional(client, token, dep.id, "Silla funcional trazable")
        activo_id = activo["id"]

        resguardo = client.get(f"/inventario/activos/{activo_id}/resguardo", headers=auth_headers(token))
        assert resguardo.status_code == 200, resguardo.text
        assert resguardo.headers["content-type"].startswith("application/vnd.openxmlformats")
        assert len(resguardo.content) > 1000

        etiqueta = client.get(f"/inventario/activos/{activo_id}/etiqueta", headers=auth_headers(token))
        assert etiqueta.status_code == 200, etiqueta.text
        assert etiqueta.headers["content-type"].startswith("application/pdf")
        assert etiqueta.content[:4] == b"%PDF"

        etiquetas = client.get(f"/inventario/activos/etiquetas?departamento_id={dep.id}", headers=auth_headers(token))
        assert etiquetas.status_code == 200, etiquetas.text
        assert etiquetas.content[:4] == b"%PDF"

        mov = client.post(
            f"/inventario/activos/{activo_id}/movimientos",
            json={
                "tipo": "CAMBIO_RESGUARDANTE",
                "resguardante_destino_nombre": "Nuevo Resguardante Funcional",
                "observaciones": "Prueba funcional de cambio de resguardo",
            },
            headers=auth_headers(token),
        )
        assert mov.status_code == 201, mov.text
        assert mov.json()["estado"] == "RECIBIDO"

        detalle = client.get(f"/inventario/activos/{activo_id}", headers=auth_headers(token))
        assert detalle.status_code == 200, detalle.text
        assert detalle.json()["resguardante_externo_nombre"] == "Nuevo Resguardante Funcional"

        expediente = client.get(f"/inventario/activos/{activo_id}/expediente", headers=auth_headers(token))
        assert expediente.status_code == 200, expediente.text
        assert any(e["tipo"] == "MOVIMIENTO" for e in expediente.json().get("timeline", []))

    def test_preventivo_actualiza_alertas_y_estado_operativo(self, client, db, admin_user):
        token = get_token(client, "admin@test.com", "AdminPass123")
        dep = _crear_departamento(db, nombre="Mantenimiento QA", clave="MANTQA")
        activo = _crear_activo_institucional(client, token, dep.id, "Equipo con preventivo QA")
        activo_id = activo["id"]

        ayer = (datetime.datetime.now() - datetime.timedelta(days=1)).date().isoformat()
        mant = client.post(
            "/inventario/mantenimientos-preventivos",
            json={
                "activo_id": activo_id,
                "tipo": "INSPECCION",
                "periodicidad": "UNICO",
                "fecha_programada": ayer,
                "fecha_limite": ayer,
                "descripcion": "Prueba funcional vencida",
            },
            headers=auth_headers(token),
        )
        assert mant.status_code == 200, mant.text
        mant_id = mant.json()["id"]

        alertas = client.get(f"/inventario/mantenimiento-alertas?departamento_id={dep.id}", headers=auth_headers(token))
        assert alertas.status_code == 200, alertas.text
        assert alertas.json()["vencidos"] == 1

        iniciar = client.put(
            f"/inventario/mantenimientos-preventivos/{mant_id}",
            json={"estado": "EN_PROCESO"},
            headers=auth_headers(token),
        )
        assert iniciar.status_code == 200, iniciar.text
        detalle_en_proceso = client.get(f"/inventario/activos/{activo_id}", headers=auth_headers(token))
        assert detalle_en_proceso.json()["estado"] == "MANTENIMIENTO"

        completar = client.put(
            f"/inventario/mantenimientos-preventivos/{mant_id}",
            json={"estado": "COMPLETADO", "notas_result": "Correcto", "duracion_min": 20},
            headers=auth_headers(token),
        )
        assert completar.status_code == 200, completar.text
        detalle_final = client.get(f"/inventario/activos/{activo_id}", headers=auth_headers(token))
        assert detalle_final.json()["estado"] == "OPERATIVO"

    def test_levantamiento_detalle_revisa_y_cierra(self, client, db, admin_user):
        token = get_token(client, "admin@test.com", "AdminPass123")
        dep = _crear_departamento(db, nombre="Levantamiento QA", clave="LEVQA")
        activo = _crear_activo_institucional(client, token, dep.id, "Activo para levantamiento QA")
        activo_id = activo["id"]

        levantamiento = client.post(
            "/inventario/levantamientos",
            json={"nombre": "Levantamiento funcional", "departamento_id": dep.id},
            headers=auth_headers(token),
        )
        assert levantamiento.status_code == 201, levantamiento.text
        levantamiento_id = levantamiento.json()["id"]

        detalle_inicial = client.get(f"/inventario/levantamientos/{levantamiento_id}/detalle", headers=auth_headers(token))
        assert detalle_inicial.status_code == 200, detalle_inicial.text
        assert detalle_inicial.json()["resumen"]["total_esperado"] == 1
        assert detalle_inicial.json()["resumen"]["total_pendiente"] == 1

        revision = client.post(
            f"/inventario/levantamientos/{levantamiento_id}/revisiones",
            json={"activo_id": activo_id, "estado": "LOCALIZADO", "observaciones": "Ubicado fisicamente"},
            headers=auth_headers(token),
        )
        assert revision.status_code == 201, revision.text

        detalle_revisado = client.get(f"/inventario/levantamientos/{levantamiento_id}/detalle", headers=auth_headers(token))
        assert detalle_revisado.json()["resumen"]["total_pendiente"] == 0

        cierre = client.post(f"/inventario/levantamientos/{levantamiento_id}/cerrar", headers=auth_headers(token))
        assert cierre.status_code == 200, cierre.text
        assert cierre.json()["estado"] == "CERRADO"

    def test_administrativo_solo_gestiona_su_departamento(self, client, db):
        admin_dep = _crear_usuario(db, "Admin Depto QA", "admin.depto@test.com", RolUsuario.ADMINISTRATIVO)
        dep_propio = _crear_departamento(db, nombre="Depto Propio QA", clave="DEPQA", responsable=admin_dep)
        dep_ajeno = _crear_departamento(db, nombre="Depto Ajeno QA", clave="AJEQA")
        token = get_token(client, "admin.depto@test.com", "PassFunc123")

        propio = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "departamento_id": dep_propio.id,
                "nombre": "Activo depto propio",
                "categoria": "OFICINA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert propio.status_code == 201, propio.text
        assert propio.json()["departamento_id"] == dep_propio.id

        ajeno = client.post(
            "/inventario/activos",
            json={
                "alcance": "INSTITUCIONAL",
                "departamento_id": dep_ajeno.id,
                "nombre": "Activo depto ajeno",
                "categoria": "OFICINA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert ajeno.status_code == 403
