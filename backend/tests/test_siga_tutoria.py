"""
test_siga_tutoria.py -- Tests de integración para el módulo de tutoría.

Cubre:
- Dashboard de tutoría
- CRUD de grupos tutorados
- Asignar y listar alumnos en grupo
- Crear sesiones de tutoría
- Canalizaciones
- Cierres de período
- Alertas y alumnos en riesgo
- Permisos por rol
"""
import pytest
from tests.conftest import get_token, auth_headers
from dependencies import hashear_password
from models.usuario import Usuario, RolUsuario
from models.catalogo import CatalogoAlumno


# ─────────────────────────── helpers ────────────────────────────────────────

def _usuario(db, nombre, email, rol, password="Test1234!"):
    u = Usuario(
        nombre=nombre, email=email,
        password_hash=hashear_password(password),
        rol=rol, activo=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _admin(db, email="admin@test.mx"):
    return _usuario(db, "Admin", email, RolUsuario.SUPER_ADMIN)


def _tutoria_admin(db, email="ta@test.mx"):
    return _usuario(db, "TutAdmin", email, RolUsuario.TUTORIA_ADMIN)


def _crear_grupo(client, token, tutor_id):
    return client.post("/tutoria/grupos", json={
        "tutor_id": tutor_id,
        "carrera": "Ingeniería en TI",
        "cuatrimestre": 3,
        "grupo": "A",
        "periodo": "ENE-ABR-2026",
    }, headers=auth_headers(token))


# ════════════════════════════════════════════════════════════════════════════
# Dashboard
# ════════════════════════════════════════════════════════════════════════════

class TestDashboardTutoria:

    def test_dashboard_tutoria_admin(self, client, db):
        ta = _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        r = client.get("/tutoria/dashboard", headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_dashboard_super_admin(self, client, db):
        _admin(db)
        tok = get_token(client, "admin@test.mx", "Test1234!")
        r = client.get("/tutoria/dashboard", headers=auth_headers(tok))
        assert r.status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# Grupos tutorados
# ════════════════════════════════════════════════════════════════════════════

class TestGruposTutoria:

    def test_crear_grupo(self, client, db):
        ta = _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        tutor = _usuario(db, "Tutor", "tutor@test.mx", RolUsuario.DOCENTE)
        r = _crear_grupo(client, tok, tutor.id)
        assert r.status_code == 201
        data = r.json()
        assert data["carrera"] == "Ingeniería en TI"
        assert data["grupo"] == "A"

    def test_listar_grupos(self, client, db):
        ta = _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        tutor = _usuario(db, "Tutor", "tutor@test.mx", RolUsuario.DOCENTE)
        _crear_grupo(client, tok, tutor.id)
        r = client.get("/tutoria/grupos", headers=auth_headers(tok))
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        assert len(items) >= 1

    def test_editar_grupo(self, client, db):
        ta = _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        tutor = _usuario(db, "Tutor", "tutor@test.mx", RolUsuario.DOCENTE)
        r = _crear_grupo(client, tok, tutor.id)
        grupo_id = r.json()["id"]
        r2 = client.put(f"/tutoria/grupos/{grupo_id}", json={
            "grupo": "B", "cuatrimestre": 4,
        }, headers=auth_headers(tok))
        assert r2.status_code == 200
        assert r2.json()["grupo"] == "B"

    def test_grupo_sin_campos_requeridos_422(self, client, db):
        ta = _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        r = client.post("/tutoria/grupos", json={
            "carrera": "TI",  # falta tutor_id, cuatrimestre, grupo, periodo
        }, headers=auth_headers(tok))
        assert r.status_code == 422


# ════════════════════════════════════════════════════════════════════════════
# Alumnos en grupo
# ════════════════════════════════════════════════════════════════════════════

class TestAlumnosGrupo:

    def _setup_grupo(self, client, db):
        ta = _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        tutor = _usuario(db, "Tutor", "tutor@test.mx", RolUsuario.DOCENTE)
        r = _crear_grupo(client, tok, tutor.id)
        grupo_id = r.json()["id"]
        return tok, grupo_id

    def test_asignar_alumnos(self, client, db):
        tok, grupo_id = self._setup_grupo(client, db)
        alum1 = _usuario(db, "Alum1", "alum1@test.mx", RolUsuario.ALUMNO)
        alum2 = _usuario(db, "Alum2", "alum2@test.mx", RolUsuario.ALUMNO)
        r = client.post(f"/tutoria/grupos/{grupo_id}/alumnos", json={
            "alumno_ids": [alum1.id, alum2.id],
        }, headers=auth_headers(tok))
        assert r.status_code in (200, 201)

    def test_listar_alumnos_grupo(self, client, db):
        tok, grupo_id = self._setup_grupo(client, db)
        alum = _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        client.post(f"/tutoria/grupos/{grupo_id}/alumnos", json={
            "alumno_ids": [alum.id],
        }, headers=auth_headers(tok))
        r = client.get(f"/tutoria/grupos/{grupo_id}/alumnos",
                       headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ════════════════════════════════════════════════════════════════════════════
# Sesiones de tutoría
# ════════════════════════════════════════════════════════════════════════════

class TestSesionesTutoria:

    def _setup(self, client, db):
        ta = _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        tutor = _usuario(db, "Tutor", "tutor@test.mx", RolUsuario.DOCENTE)
        alum = _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        r = _crear_grupo(client, tok, tutor.id)
        grupo_id = r.json()["id"]
        client.post(f"/tutoria/grupos/{grupo_id}/alumnos", json={
            "alumno_ids": [alum.id],
        }, headers=auth_headers(tok))
        return tok, grupo_id, alum

    def test_crear_sesion(self, client, db):
        tok, grupo_id, alum = self._setup(client, db)
        r = client.post("/tutoria/sesiones", json={
            "grupo_tutorado_id": grupo_id,
            "fecha": "2026-06-15",
            "tipo_sesion": "GRUPAL",
            "observaciones_generales": "Sesión de seguimiento",
            "registros": [{
                "alumno_id": alum.id,
                "asistio": True,
                "tema": "Rendimiento académico",
            }],
        }, headers=auth_headers(tok))
        assert r.status_code == 201

    def test_listar_sesiones(self, client, db):
        tok, grupo_id, alum = self._setup(client, db)
        client.post("/tutoria/sesiones", json={
            "grupo_tutorado_id": grupo_id,
            "fecha": "2026-06-16",
            "tipo_sesion": "GRUPAL",
            "registros": [],
        }, headers=auth_headers(tok))
        r = client.get("/tutoria/sesiones", headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ════════════════════════════════════════════════════════════════════════════
# Alertas y riesgo
# ════════════════════════════════════════════════════════════════════════════

class TestAlertasTutoria:

    def test_listar_alertas(self, client, db):
        _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        r = client.get("/tutoria/alertas", headers=auth_headers(tok))
        assert r.status_code == 200

    def test_alumnos_en_riesgo(self, client, db):
        _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        r = client.get("/tutoria/alumnos-riesgo", headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ════════════════════════════════════════════════════════════════════════════
# Cierres de período
# ════════════════════════════════════════════════════════════════════════════

class TestCierresTutoria:

    def test_crear_cierre(self, client, db):
        _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        r = client.post("/tutoria/cierres", json={
            "periodo": "ENE-ABR-2026",
            "bimestre": 1,
            "alcance": "BIMESTRE",
            "observaciones": "Cierre del primer bimestre.",
        }, headers=auth_headers(tok))
        assert r.status_code in (200, 201)

    def test_listar_cierres(self, client, db):
        _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        r = client.get("/tutoria/cierres", headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_resumen_cierres(self, client, db):
        _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        r = client.get("/tutoria/cierres/resumen?periodo=ENE-ABR-2026",
                       headers=auth_headers(tok))
        assert r.status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# Canalizaciones
# ════════════════════════════════════════════════════════════════════════════

class TestCanalizaciones:

    def test_crear_canalizacion(self, client, db):
        _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        # El endpoint busca CatalogoAlumno, no Usuario con rol ALUMNO
        catalogo = CatalogoAlumno(
            matricula="20230001",
            apellido_paterno="Garcia",
            apellido_materno="Lopez",
            nombres="Juan Carlos",
            carrera="Ingenieria en TI",
            cuatrimestre=3,
            grupo="A",
            periodo="ENE-ABR-2026",
        )
        db.add(catalogo)
        db.commit()
        db.refresh(catalogo)
        r = client.post("/tutoria/canalizaciones", json={
            "alumno_id": catalogo.id,
            "tipo_pedagogico": True,
            "motivo": "El alumno presenta dificultades académicas severas.",
        }, headers=auth_headers(tok))
        assert r.status_code in (200, 201)

    def test_listar_canalizaciones(self, client, db):
        _tutoria_admin(db)
        tok = get_token(client, "ta@test.mx", "Test1234!")
        r = client.get("/tutoria/canalizaciones", headers=auth_headers(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ════════════════════════════════════════════════════════════════════════════
# Permisos
# ════════════════════════════════════════════════════════════════════════════

class TestPermisosTutoria:

    def test_sin_token_401(self, client, db):
        r = client.get("/tutoria/grupos")
        assert r.status_code == 401

    def test_alumno_no_puede_crear_grupo(self, client, db):
        _usuario(db, "Alum", "alum@test.mx", RolUsuario.ALUMNO)
        tok = get_token(client, "alum@test.mx", "Test1234!")
        r = client.post("/tutoria/grupos", json={
            "tutor_id": 1, "carrera": "TI", "cuatrimestre": 1,
            "grupo": "A", "periodo": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r.status_code == 403

    def test_docente_no_puede_crear_grupo(self, client, db):
        _usuario(db, "Doc", "doc@test.mx", RolUsuario.DOCENTE)
        tok = get_token(client, "doc@test.mx", "Test1234!")
        r = client.post("/tutoria/grupos", json={
            "tutor_id": 1, "carrera": "TI", "cuatrimestre": 1,
            "grupo": "A", "periodo": "ENE-ABR-2026",
        }, headers=auth_headers(tok))
        assert r.status_code == 403
