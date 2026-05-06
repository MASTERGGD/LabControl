"""
test_sesiones.py — Tests de integración para apertura de sesiones de clase

Casos cubiertos:
  1. DOCENTE puede abrir una sesión en un laboratorio existente
  2. ALUMNO (rol inexistente en permisos) no puede abrir sesión
  3. No se puede abrir segunda sesión en el mismo lab
  4. DOCENTE no puede abrir dos sesiones simultáneas
  5. Laboratorio inexistente devuelve 404
  6. Sin autenticación devuelve 401
"""
import pytest
from tests.conftest import get_token, auth_headers
from models.usuario import RolUsuario
from dependencies import hashear_password


class TestSesiones:

    def _abrir_sesion(self, client, token, lab_id, materia="Programación", grupo="A"):
        return client.post(
            "/sesiones",
            json={
                "laboratorio_id": lab_id,
                "materia": materia,
                "grupo": grupo,
                "fin_estimado_min": 100,
            },
            headers=auth_headers(token),
        )

    def test_docente_puede_abrir_sesion(self, client, admin_user, docente_user, lab):
        """DOCENTE autenticado puede abrir una sesión en un lab activo."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = self._abrir_sesion(client, token, lab.id)

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["estado"] == "ABIERTA"
        assert body["laboratorio_id"] == lab.id
        assert "codigo_sesion" in body

    def test_admin_puede_abrir_sesion(self, client, admin_user, lab):
        """SUPER_ADMIN también puede abrir sesión."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        resp = self._abrir_sesion(client, token, lab.id)
        assert resp.status_code == 201

    def test_no_se_puede_abrir_segunda_sesion_mismo_lab(
        self, client, admin_user, docente_user, db, lab
    ):
        """Dos sesiones simultáneas en el mismo lab → 409."""
        from models.usuario import Usuario
        # Crear segundo docente
        docente2 = Usuario(
            nombre="Docente 2",
            email="docente2@test.com",
            password_hash=hashear_password("Pass2"),
            rol=RolUsuario.DOCENTE,
            activo=True,
        )
        db.add(docente2)
        db.commit()

        token1 = get_token(client, "docente@test.com", "DocentePass123")
        token2 = get_token(client, "docente2@test.com", "Pass2")

        # Primer docente abre sesión → OK
        resp1 = self._abrir_sesion(client, token1, lab.id)
        assert resp1.status_code == 201

        # Segundo docente intenta abrir en el mismo lab → 409
        resp2 = self._abrir_sesion(client, token2, lab.id, materia="Redes", grupo="B")
        assert resp2.status_code == 409

    def test_docente_no_puede_abrir_dos_sesiones(self, client, admin_user, docente_user, db):
        """Un mismo DOCENTE no puede tener dos sesiones abiertas a la vez."""
        from models.laboratorio import Laboratorio

        # Crear dos laboratorios
        lab1 = Laboratorio(nombre="Lab A", ubicacion="E1", capacidad=10, activo=True)
        lab2 = Laboratorio(nombre="Lab B", ubicacion="E2", capacidad=10, activo=True)
        db.add_all([lab1, lab2])
        db.commit()
        db.refresh(lab1)
        db.refresh(lab2)

        token = get_token(client, "docente@test.com", "DocentePass123")

        resp1 = self._abrir_sesion(client, token, lab1.id)
        assert resp1.status_code == 201

        resp2 = self._abrir_sesion(client, token, lab2.id, materia="Redes", grupo="B")
        assert resp2.status_code == 409

    def test_lab_inexistente_devuelve_404(self, client, admin_user, docente_user):
        """Laboratorio con ID que no existe devuelve 404."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = self._abrir_sesion(client, token, lab_id=99999)
        assert resp.status_code == 404

    def test_sin_autenticacion_devuelve_401(self, client, lab):
        """Sin token no se puede abrir sesión."""
        resp = client.post(
            "/sesiones",
            json={"laboratorio_id": lab.id, "materia": "Mat", "grupo": "A"},
        )
        assert resp.status_code == 401
