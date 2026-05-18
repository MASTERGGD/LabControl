"""
test_inventario.py — Tests de integración para activos y préstamos

Casos cubiertos:
  1. SUPER_ADMIN puede crear un activo
  2. DOCENTE no puede crear activos (403)
  3. Flujo completo: crear activo → crear préstamo → devolver préstamo
  4. No se puede prestar un activo que ya está prestado (409)
  5. Activo inexistente en préstamo devuelve 404
  6. Devolver préstamo con condición válida actualiza estado a DEVUELTO
"""
import pytest
import datetime
from tests.conftest import get_token, auth_headers
from models.inventario import Prestamo


class TestActivos:

    def _crear_activo(self, client, token, lab_id, nombre="Laptop Test"):
        return client.post(
            "/inventario/activos",
            json={
                "laboratorio_id": lab_id,
                "nombre": nombre,
                "categoria": "COMPUTADORA",
                "marca": "Dell",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )

    def test_admin_puede_crear_activo(self, client, admin_user, lab):
        """SUPER_ADMIN puede registrar un activo nuevo."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        resp = self._crear_activo(client, token, lab.id)
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["nombre"] == "Laptop Test"
        assert body["estado"] == "OPERATIVO"
        assert "codigo_inventario" in body

    def test_docente_no_puede_crear_activo(self, client, admin_user, docente_user, lab):
        """DOCENTE no tiene permiso para crear activos → 403."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = self._crear_activo(client, token, lab.id)
        assert resp.status_code == 403

    def test_listar_activos_docente(self, client, admin_user, docente_user, lab):
        """DOCENTE sí puede listar activos (inventario:read)."""
        token_admin = get_token(client, "admin@test.com", "AdminPass123")
        self._crear_activo(client, token_admin, lab.id)

        token_doc = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.get("/inventario/activos", headers=auth_headers(token_doc))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestPrestamos:

    def _crear_activo(self, client, token, lab_id):
        resp = client.post(
            "/inventario/activos",
            json={
                "laboratorio_id": lab_id,
                "nombre": "Cañón Proyector",
                "categoria": "COMPUTADORA",
                "estado": "OPERATIVO",
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    def _fecha_futura(self, dias=7):
        d = datetime.date.today() + datetime.timedelta(days=dias)
        return d.isoformat()

    def test_flujo_completo_prestamo_devolucion(self, client, admin_user, lab):
        """
        Flujo completo:
          1. Crear activo
          2. Prestar activo
          3. Verificar estado ACTIVO en préstamo
          4. Devolver activo
          5. Verificar estado DEVUELTO
        """
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo_id = self._crear_activo(client, token, lab.id)

        # Registrar préstamo
        resp_prestamo = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": activo_id,
                "receptor_nombre": "Juan Alumno",
                "receptor_matricula": "A12345",
                "receptor_tipo": "ALUMNO",
                "fecha_devolucion_esperada": self._fecha_futura(7),
            },
            headers=auth_headers(token),
        )
        assert resp_prestamo.status_code == 201, resp_prestamo.text
        prestamo = resp_prestamo.json()
        assert prestamo["estado"] == "ACTIVO"
        prestamo_id = prestamo["id"]

        # Devolver
        resp_dev = client.post(
            f"/inventario/prestamos/{prestamo_id}/devolver",
            json={"condicion_devolucion": "BUENO"},
            headers=auth_headers(token),
        )
        assert resp_dev.status_code == 200, resp_dev.text
        assert resp_dev.json()["estado"] == "DEVUELTO"

    def test_no_se_puede_prestar_activo_ya_prestado(self, client, admin_user, lab):
        """Prestar el mismo activo dos veces sin devolver → 409."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo_id = self._crear_activo(client, token, lab.id)

        payload = {
            "activo_id": activo_id,
            "receptor_nombre": "Alumno A",
            "fecha_devolucion_esperada": self._fecha_futura(5),
        }

        resp1 = client.post("/inventario/prestamos", json=payload, headers=auth_headers(token))
        assert resp1.status_code == 201

        resp2 = client.post("/inventario/prestamos", json=payload, headers=auth_headers(token))
        assert resp2.status_code == 409

    def test_prestar_activo_inexistente_devuelve_404(self, client, admin_user):
        """Activo con ID que no existe → 404."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        resp = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": 99999,
                "receptor_nombre": "Alumno X",
                "fecha_devolucion_esperada": self._fecha_futura(3),
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 404

    def test_fecha_devolucion_en_pasado_devuelve_422(self, client, admin_user, lab):
        """Fecha de devolución en el pasado → 422."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo_id = self._crear_activo(client, token, lab.id)

        ayer = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        resp = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": activo_id,
                "receptor_nombre": "Alumno X",
                "fecha_devolucion_esperada": ayer,
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 422

    def test_devolucion_danada_conserva_tipo_docente_en_adeudo(self, client, admin_user, lab):
        """El metadato __meta__ del prestamo se decodifica al crear adeudo por dano."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo_id = self._crear_activo(client, token, lab.id)

        resp_prestamo = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": activo_id,
                "receptor_nombre": "Docente Responsable",
                "receptor_matricula": "EMP-100",
                "receptor_tipo": "DOCENTE",
                "fecha_devolucion_esperada": self._fecha_futura(7),
            },
            headers=auth_headers(token),
        )
        assert resp_prestamo.status_code == 201, resp_prestamo.text
        prestamo_id = resp_prestamo.json()["id"]

        resp_dev = client.post(
            f"/inventario/prestamos/{prestamo_id}/devolver",
            json={"condicion_devolucion": "DAÑADO", "notas_devolucion": "Pantalla rota"},
            headers=auth_headers(token),
        )
        assert resp_dev.status_code == 200, resp_dev.text

        resp_adeudos = client.get(
            "/adeudos?identificador=EMP-100",
            headers=auth_headers(token),
        )
        assert resp_adeudos.status_code == 200, resp_adeudos.text
        adeudos = resp_adeudos.json()
        assert len(adeudos) == 1
        assert adeudos[0]["persona_tipo"] == "DOCENTE"
        assert adeudos[0]["prestamo_id"] == prestamo_id

    def test_sincronizar_prestamo_vencido_cuenta_y_conserva_tipo_docente(self, client, admin_user, lab, db):
        """Sincronizar vencidos marca el prestamo y crea un adeudo con tipo correcto."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        activo_id = self._crear_activo(client, token, lab.id)

        resp_prestamo = client.post(
            "/inventario/prestamos",
            json={
                "activo_id": activo_id,
                "receptor_nombre": "Docente Vencido",
                "receptor_matricula": "EMP-200",
                "receptor_tipo": "DOCENTE",
                "fecha_devolucion_esperada": self._fecha_futura(7),
            },
            headers=auth_headers(token),
        )
        assert resp_prestamo.status_code == 201, resp_prestamo.text
        prestamo_id = resp_prestamo.json()["id"]

        prestamo = db.query(Prestamo).filter(Prestamo.id == prestamo_id).first()
        prestamo.fecha_retorno_esperada = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(days=2)
        prestamo.estado = "ACTIVO"
        db.commit()

        resp_sync = client.post("/adeudos/sincronizar-prestamos", headers=auth_headers(token))
        assert resp_sync.status_code == 200, resp_sync.text
        assert resp_sync.json()["adeudos_creados"] == 1

        db.refresh(prestamo)
        assert prestamo.estado == "VENCIDO"

        resp_adeudos = client.get(
            "/adeudos?identificador=EMP-200",
            headers=auth_headers(token),
        )
        assert resp_adeudos.status_code == 200, resp_adeudos.text
        adeudos = resp_adeudos.json()
        assert len(adeudos) == 1
        assert adeudos[0]["persona_tipo"] == "DOCENTE"
        assert adeudos[0]["tipo"] == "PRESTAMO_VENCIDO"
