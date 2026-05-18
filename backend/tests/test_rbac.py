"""
test_rbac.py — Tests de Control de Acceso Basado en Roles (RBAC)

Verifica que los endpoints protegidos rechacen roles no autorizados.

Casos cubiertos:
  1. DOCENTE intenta GET /usuarios → 403
  2. DOCENTE intenta GET /auditoria/logs → 403
  3. SUPER_ADMIN accede a GET /usuarios → 200
  4. Sin autenticación a endpoint protegido → 401
  5. DOCENTE accede a su propio perfil /auth/me → 200 (permitido)
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.adeudo import Adeudo
from models.horario import HorarioDisponible, Reservacion
from models.laboratorio import Laboratorio
from models.usuario import RolUsuario, Usuario


class TestRBAC:

    def test_docente_no_puede_listar_usuarios(self, client, admin_user, docente_user):
        """DOCENTE intentando GET /usuarios debe recibir 403."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.get("/usuarios", headers=auth_headers(token))
        assert resp.status_code == 403, (
            f"Se esperaba 403, se obtuvo {resp.status_code}: {resp.text}"
        )

    def test_docente_no_puede_ver_auditoria(self, client, admin_user, docente_user):
        """DOCENTE intentando GET /auditoria/logs debe recibir 403."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.get("/auditoria/", headers=auth_headers(token))
        assert resp.status_code == 403

    def test_admin_puede_listar_usuarios(self, client, admin_user):
        """SUPER_ADMIN puede acceder a GET /usuarios."""
        token = get_token(client, "admin@test.com", "AdminPass123")
        resp = client.get("/usuarios", headers=auth_headers(token))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_sin_auth_endpoint_protegido(self, client, admin_user):
        """Sin token, endpoint protegido devuelve 401."""
        resp = client.get("/usuarios")
        assert resp.status_code == 401

    def test_docente_puede_ver_su_propio_perfil(self, client, admin_user, docente_user):
        """DOCENTE sí puede consultar /auth/me (su propio perfil)."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.get("/auth/me", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["rol"] == "DOCENTE"

    def test_docente_no_puede_crear_usuario(self, client, admin_user, docente_user):
        """DOCENTE intentando POST /usuarios debe recibir 403."""
        token = get_token(client, "docente@test.com", "DocentePass123")
        resp = client.post(
            "/usuarios",
            json={
                "nombre": "Nuevo User",
                "email": "nuevo@test.com",
                "password": "Pass123",
                "rol": "DOCENTE",
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 403

    def test_lab_admin_no_puede_tocar_adeudo_de_otro_laboratorio(self, client, db):
        """LAB_ADMIN no puede consultar, actualizar ni eliminar adeudos de otro laboratorio."""
        lab_propio = Laboratorio(nombre="Lab Propio", ubicacion="A", capacidad=20, activo=True)
        lab_ajeno = Laboratorio(nombre="Lab Ajeno", ubicacion="B", capacidad=20, activo=True)
        db.add_all([lab_propio, lab_ajeno])
        db.commit()
        db.refresh(lab_propio)
        db.refresh(lab_ajeno)

        lab_admin = Usuario(
            nombre="Admin Lab",
            email="labadmin@test.com",
            password_hash=hashear_password("LabAdminPass123"),
            rol=RolUsuario.LAB_ADMIN,
            laboratorio_id=lab_propio.id,
            activo=True,
        )
        adeudo_ajeno = Adeudo(
            persona_nombre="Alumno Ajeno",
            persona_identificador="A001",
            persona_tipo="ALUMNO",
            origen_tipo="MANUAL",
            tipo="DAÑO",
            descripcion="Adeudo de otro laboratorio",
            laboratorio_id=lab_ajeno.id,
        )
        db.add_all([lab_admin, adeudo_ajeno])
        db.commit()
        db.refresh(adeudo_ajeno)

        token = get_token(client, "labadmin@test.com", "LabAdminPass123")
        headers = auth_headers(token)

        resp_get = client.get(f"/adeudos/{adeudo_ajeno.id}", headers=headers)
        resp_patch = client.patch(
            f"/adeudos/{adeudo_ajeno.id}",
            json={"estado": "RESUELTO", "notas_resolucion": "No autorizado"},
            headers=headers,
        )
        resp_delete = client.delete(f"/adeudos/{adeudo_ajeno.id}", headers=headers)

        assert resp_get.status_code == 403
        assert resp_patch.status_code == 403
        assert resp_delete.status_code == 403

    def test_lab_admin_no_puede_marcar_estado_reservacion_ajena(self, client, db):
        """LAB_ADMIN no puede marcar cumplimiento de reservaciones de otro laboratorio."""
        lab_propio = Laboratorio(nombre="Lab Propio", ubicacion="A", capacidad=20, activo=True)
        lab_ajeno = Laboratorio(nombre="Lab Ajeno", ubicacion="B", capacidad=20, activo=True)
        db.add_all([lab_propio, lab_ajeno])
        db.commit()
        db.refresh(lab_propio)
        db.refresh(lab_ajeno)

        lab_admin = Usuario(
            nombre="Admin Lab",
            email="labadmin2@test.com",
            password_hash=hashear_password("LabAdminPass123"),
            rol=RolUsuario.LAB_ADMIN,
            laboratorio_id=lab_propio.id,
            activo=True,
        )
        docente = Usuario(
            nombre="Docente Ajeno",
            email="docente.ajeno@test.com",
            password_hash=hashear_password("DocentePass123"),
            rol=RolUsuario.DOCENTE,
            activo=True,
        )
        db.add_all([lab_admin, docente])
        db.commit()
        db.refresh(docente)

        horario = HorarioDisponible(
            laboratorio_id=lab_ajeno.id,
            dia_semana=0,
            hora_inicio="08:00",
            hora_fin="09:00",
            cuatrimestre="ENE-ABR 2026",
            activo=True,
        )
        db.add(horario)
        db.commit()
        db.refresh(horario)

        reservacion = Reservacion(
            horario_id=horario.id,
            laboratorio_id=lab_ajeno.id,
            docente_id=docente.id,
            materia="Redes",
            grupo="A",
            cuatrimestre="ENE-ABR 2026",
            estado="PROGRAMADA",
            creado_por=lab_admin.id,
        )
        db.add(reservacion)
        db.commit()
        db.refresh(reservacion)

        token = get_token(client, "labadmin2@test.com", "LabAdminPass123")
        resp = client.post(
            f"/horarios/reservaciones/{reservacion.id}/marcar-estado",
            json={"estado": "IMPARTIDA", "motivo": "Intento no autorizado"},
            headers=auth_headers(token),
        )

        assert resp.status_code == 403

    def test_lab_admin_puede_marcar_estado_reservacion_de_su_laboratorio(self, client, db):
        """LAB_ADMIN sí puede marcar cumplimiento de reservaciones de su propio laboratorio."""
        lab_propio = Laboratorio(nombre="Lab Propio", ubicacion="A", capacidad=20, activo=True)
        db.add(lab_propio)
        db.commit()
        db.refresh(lab_propio)

        lab_admin = Usuario(
            nombre="Admin Lab Propio",
            email="labadmin3@test.com",
            password_hash=hashear_password("LabAdminPass123"),
            rol=RolUsuario.LAB_ADMIN,
            laboratorio_id=lab_propio.id,
            activo=True,
        )
        docente = Usuario(
            nombre="Docente Propio",
            email="docente.propio@test.com",
            password_hash=hashear_password("DocentePass123"),
            rol=RolUsuario.DOCENTE,
            activo=True,
        )
        db.add_all([lab_admin, docente])
        db.commit()
        db.refresh(lab_admin)
        db.refresh(docente)

        horario = HorarioDisponible(
            laboratorio_id=lab_propio.id,
            dia_semana=1,
            hora_inicio="09:00",
            hora_fin="10:00",
            cuatrimestre="ENE-ABR 2026",
            activo=True,
        )
        db.add(horario)
        db.commit()
        db.refresh(horario)

        reservacion = Reservacion(
            horario_id=horario.id,
            laboratorio_id=lab_propio.id,
            docente_id=docente.id,
            materia="Programación",
            grupo="B",
            cuatrimestre="ENE-ABR 2026",
            estado="PROGRAMADA",
            creado_por=lab_admin.id,
        )
        db.add(reservacion)
        db.commit()
        db.refresh(reservacion)

        token = get_token(client, "labadmin3@test.com", "LabAdminPass123")
        resp = client.post(
            f"/horarios/reservaciones/{reservacion.id}/marcar-estado",
            json={"estado": "IMPARTIDA", "motivo": "Clase cerrada"},
            headers=auth_headers(token),
        )
        db.refresh(reservacion)

        assert resp.status_code == 200
        assert resp.json()["estado"] == "IMPARTIDA"
        assert reservacion.estado == "IMPARTIDA"
